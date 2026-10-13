import { fileURLToPath } from 'node:url';

export interface Config {
  port: number;
  host: string;
  /** Базовый URL OSRM для построения маршрута; пусто — оценка по прямой. */
  osrmUrl: string;
  /** Базовый URL Photon (геокодер на данных OpenStreetMap); пусто — поиск адресов выключен. */
  photonUrl: string;
  yandex: { clid: string; apiKey: string };
  uber: { accessToken: string };
  httpTimeoutMs: number;
  /** Собранный фронтенд; если папки нет — сервер отдаёт только API. */
  staticDir: string;
  /** Подпись запросов к открытым сервисам (требование их правил использования). */
  userAgent: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    osrmUrl: env.OSRM_URL ?? 'https://router.project-osrm.org',
    photonUrl: env.PHOTON_URL ?? 'https://photon.komoot.io',
    yandex: { clid: env.YANDEX_TAXI_CLID ?? '', apiKey: env.YANDEX_TAXI_APIKEY ?? '' },
    uber: { accessToken: env.UBER_ACCESS_TOKEN ?? '' },
    httpTimeoutMs: Number(env.HTTP_TIMEOUT_MS ?? 4000),
    staticDir: env.STATIC_DIR ?? fileURLToPath(new URL('../../web/dist', import.meta.url)),
    userAgent: env.USER_AGENT ?? 'uia-taxi-compare/0.1 (+https://github.com/lonovah-pixel/uia)',
  };
}
