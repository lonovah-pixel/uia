import { PROVIDERS } from '../../providers.ts';
import type { ProviderSummary } from '../../types.ts';
import type { HttpClient } from '../http.ts';
import type { LiveAdapter } from './types.ts';
import { createUberAdapter } from './uber.ts';
import { createYandexAdapter } from './yandex.ts';

export type { LiveAdapter, LiveContext } from './types.ts';
export { YANDEX_TAXI_INFO_URL } from './yandex.ts';
export { UBER_API_URL, uberRideClass } from './uber.ts';

/** Ключи доступа к API агрегаторов. Пустые значения — адаптер выключен. */
export interface ApiKeys {
  yandex: { clid: string; apiKey: string };
  uber: { accessToken: string };
}

export const EMPTY_API_KEYS: ApiKeys = { yandex: { clid: '', apiKey: '' }, uber: { accessToken: '' } };

/** Адаптеры к реальным API. Для остальных агрегаторов цена оценивается по модели тарифа. */
export function createLiveAdapters(http: HttpClient, keys: ApiKeys): Map<string, LiveAdapter> {
  const adapters = [
    createYandexAdapter(http, keys.yandex.clid, keys.yandex.apiKey),
    createUberAdapter(http, keys.uber.accessToken),
  ];
  return new Map(adapters.map((a) => [a.providerId, a]));
}

/** Список агрегаторов для интерфейса: классы и подключено ли реальное API. */
export function summarizeProviders(adapters: Map<string, LiveAdapter>): ProviderSummary[] {
  return PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    logo: p.logo,
    color: p.color,
    textColor: p.textColor,
    website: p.website,
    live: adapters.get(p.id)?.enabled ?? false,
    classes: [...new Set(p.tariffs.map((t) => t.rideClass))],
  }));
}
