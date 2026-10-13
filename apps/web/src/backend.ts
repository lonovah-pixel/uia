import { createContext, useContext } from 'react';
import {
  createGeocoder,
  createHttpClient,
  createLiveAdapters,
  createQuoteService,
  createRouter,
  summarizeProviders,
  validateTrip,
  type ApiKeys,
  type GeoPoint,
  type GeocodeResult,
  type Place,
  type ProviderSummary,
  type QuoteResponse,
} from '@uia/core';
import { nativeBridge, nativeFetch } from './native.ts';

/** Откуда приложение берёт данные: с сервера (веб-версия) или считает само (APK). */
export interface Backend {
  /** Можно ли подключить ключи API прямо в приложении. */
  readonly local: boolean;
  providers(): Promise<ProviderSummary[]>;
  quotes(from: Place, to: Place, signal?: AbortSignal): Promise<QuoteResponse>;
  geocode(query: string, near: GeoPoint | undefined, signal?: AbortSignal): Promise<GeocodeResult[]>;
  reverse(point: GeoPoint): Promise<GeocodeResult | null>;
}

export const STANDALONE = import.meta.env.VITE_STANDALONE === 'true';

const tzOffsetMin = () => -new Date().getTimezoneOffset();

// ——— Веб-версия: всё считает сервер ———

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `Ошибка сервера (${res.status})`);
  return body as T;
}

export const serverBackend: Backend = {
  local: false,

  providers: () => request('/api/providers'),

  quotes: (from, to, signal) =>
    request('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, tzOffsetMin: tzOffsetMin() }),
      signal,
    }),

  geocode(query, near, signal) {
    const params = new URLSearchParams({ q: query });
    if (near) {
      params.set('lat', near.lat.toFixed(4));
      params.set('lon', near.lon.toFixed(4));
    }
    return request(`/api/geocode?${params}`, { signal });
  },

  async reverse(point) {
    const params = new URLSearchParams({ lat: point.lat.toFixed(6), lon: point.lon.toFixed(6) });
    return (await request<{ result: GeocodeResult | null }>(`/api/reverse?${params}`)).result;
  },
};

// ——— Мобильное приложение: те же сервисы из @uia/core работают прямо на устройстве ———

const OSRM_URL = import.meta.env.VITE_OSRM_URL ?? 'https://router.project-osrm.org';
const PHOTON_URL = import.meta.env.VITE_PHOTON_URL ?? 'https://photon.komoot.io';
const NATIVE_USER_AGENT = 'uia-taxi-android/0.1 (+https://github.com/lonovah-pixel/uia)';

/** Отменяемое ожидание: результат устаревшего запроса просто игнорируется. */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Запрос отменён', 'AbortError'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject);
  });
}

export function createLocalBackend(keys: ApiKeys): Backend {
  const http = nativeBridge
    ? createHttpClient(nativeFetch, 8000, NATIVE_USER_AGENT)
    : createHttpClient((url, init) => fetch(url, init), 8000);
  const adapters = createLiveAdapters(http, keys);
  const geocoder = createGeocoder(http, PHOTON_URL);
  const quoteService = createQuoteService({ router: createRouter(http, OSRM_URL), adapters });

  return {
    local: true,

    providers: async () => summarizeProviders(adapters),

    quotes(from, to, signal) {
      const error = validateTrip(from, to);
      if (error) return Promise.reject(new Error(error));
      return abortable(quoteService.getQuotes({ from, to, tzOffsetMin: tzOffsetMin() }), signal);
    },

    geocode(query, near, signal) {
      const search = geocoder.search(query, near).catch(() => {
        throw new Error('Поиск адресов временно недоступен — выберите точку на карте');
      });
      return abortable(search, signal);
    },

    reverse: (point) => geocoder.reverse(point),
  };
}

export const BackendContext = createContext<Backend>(serverBackend);

export const useBackend = () => useContext(BackendContext);
