import { loadConfig, type Config } from '../src/config.ts';
import type { FetchFn } from '../src/http.ts';

type Handler = (url: URL, init?: RequestInit) => unknown;

/**
 * Поддельный fetch: ищет первый маршрут, чья подстрока входит в URL.
 * Обработчик возвращает тело ответа (JSON) или готовый Response. Неизвестные URL — сетевая ошибка.
 */
export function fakeFetch(routes: Record<string, Handler>) {
  const calls: string[] = [];
  const fn: FetchFn = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    for (const [pattern, handler] of Object.entries(routes)) {
      if (url.toString().includes(pattern)) {
        const body = handler(url, init);
        return body instanceof Response ? body : Response.json(body);
      }
    }
    throw new TypeError('fetch failed');
  };
  return Object.assign(fn, { calls });
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...loadConfig({}),
    osrmUrl: 'https://osrm.test',
    photonUrl: 'https://photon.test',
    staticDir: '/nonexistent',
    ...overrides,
  };
}

export const RED_SQUARE = { lat: 55.7539, lon: 37.6208, name: 'Красная площадь' };
export const GORKY_PARK = { lat: 55.7298, lon: 37.6031, name: 'Парк Горького' };
