import type { Config } from '../config.ts';
import type { HttpClient } from '../http.ts';
import type { LiveAdapter } from './types.ts';
import { createUberAdapter } from './uber.ts';
import { createYandexAdapter } from './yandex.ts';

export type { LiveAdapter, LiveContext } from './types.ts';

/** Адаптеры к реальным API. Для остальных агрегаторов цена оценивается по модели тарифа. */
export function createLiveAdapters(http: HttpClient, config: Config): Map<string, LiveAdapter> {
  const adapters = [
    createYandexAdapter(http, config.yandex.clid, config.yandex.apiKey),
    createUberAdapter(http, config.uber.accessToken),
  ];
  return new Map(adapters.map((a) => [a.providerId, a]));
}
