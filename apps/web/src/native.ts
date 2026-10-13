import type { FetchFn } from '@uia/core';

/*
 * Мост к Android-оболочке (apps/android). Оболочка выполняет HTTP-запросы нативно:
 * без ограничений CORS и с собственным User-Agent — это нужно для API агрегаторов.
 * В обычном браузере моста нет, и запросы идут через fetch.
 */

interface NativeBridge {
  request(id: string, url: string, headersJson: string): void;
}

declare global {
  interface Window {
    UiaNative?: NativeBridge;
    /** Ответ нативной стороны: status 0 — сетевая ошибка, body — её текст. */
    __uiaNativeResponse?: (id: string, status: number, body: string) => void;
    /** Кнопка «Назад» Android: true — событие обработано приложением. */
    __uiaBack?: () => boolean;
  }
}

export const nativeBridge: NativeBridge | undefined = typeof window !== 'undefined' ? window.UiaNative : undefined;

const pending = new Map<string, { resolve(res: Response): void; reject(err: Error): void }>();
let nextId = 0;

if (nativeBridge) {
  window.__uiaNativeResponse = (id, status, body) => {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    if (status === 0) {
      request.reject(new TypeError(body || 'Сеть недоступна'));
      return;
    }
    // У ответов 204/205/304 не может быть тела
    const noBody = status === 204 || status === 205 || status === 304;
    request.resolve(new Response(noBody ? null : body, { status, headers: { 'Content-Type': 'application/json' } }));
  };
}

export const nativeFetch: FetchFn = (url, init) =>
  new Promise((resolve, reject) => {
    if (!nativeBridge) {
      reject(new TypeError('Нативный мост недоступен'));
      return;
    }
    const id = String(++nextId);
    pending.set(id, { resolve, reject });
    init?.signal?.addEventListener('abort', () => {
      if (pending.delete(id)) reject(new DOMException('Запрос отменён', 'AbortError'));
    });
    nativeBridge.request(id, url, JSON.stringify(init?.headers ?? {}));
  });
