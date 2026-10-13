import { estimateEta, getProvider, type Quote, type RideClass, type Tariff } from '@uia/core';
import type { HttpClient } from '../http.ts';
import type { LiveAdapter } from './types.ts';

/*
 * Партнёрское API Яндекс Go «Информация о поездке»:
 * https://yandex.ru/dev/taxi/doc/ru/ — ключи clid и apikey выдаются после подключения к партнёрской программе.
 */
export const YANDEX_TAXI_INFO_URL = 'https://taxi-routeinfo.taxi.yandex.net/taxi_info';

const CLASS_MAP: Record<string, RideClass> = {
  econom: 'economy',
  business: 'comfort',
  comfortplus: 'comfortPlus',
  vip: 'business',
  minivan: 'minivan',
};

interface YandexOption {
  class_name: string;
  class_text?: string;
  price: number;
  min_price?: number;
  /** Время подачи, секунды. */
  waiting_time?: number;
}

interface YandexResponse {
  currency?: string;
  /** Метры. */
  distance?: number;
  /** Время в пути с учётом пробок, секунды. */
  time?: number;
  options?: YandexOption[];
}

export function createYandexAdapter(http: HttpClient, clid: string, apiKey: string): LiveAdapter {
  const provider = getProvider('yandex')!;

  return {
    providerId: provider.id,
    enabled: Boolean(clid && apiKey),

    async getQuotes({ from, to, route, city, demand }) {
      const params = new URLSearchParams({
        clid,
        apikey: apiKey,
        rll: `${from.lon},${from.lat}~${to.lon},${to.lat}`,
        class: Object.keys(CLASS_MAP).join(','),
        lang: 'ru',
      });
      const data = await http.getJson<YandexResponse>(`${YANDEX_TAXI_INFO_URL}?${params}`);
      const tripMin = data.time ? Math.round(data.time / 60) : Math.round(route.durationMin);

      return (data.options ?? []).flatMap((option): Quote[] => {
        const rideClass = CLASS_MAP[option.class_name];
        if (!rideClass || !Number.isFinite(option.price)) return [];
        const tariff: Tariff = provider.tariffs.find((t) => t.code === option.class_name) ?? {
          ...provider.tariffs[0]!,
          rideClass,
          code: option.class_name,
        };
        return [
          {
            id: `${provider.id}:${option.class_name}`,
            providerId: provider.id,
            providerName: provider.name,
            rideClass,
            tariffName: option.class_text ?? tariff.name,
            currency: data.currency ?? city.currency,
            priceMin: option.price,
            priceMax: option.price,
            price: option.price,
            priceKind: 'live',
            // API не сообщает коэффициент спроса — цена уже его учитывает
            surge: 1,
            etaMin:
              option.waiting_time !== undefined
                ? Math.max(1, Math.round(option.waiting_time / 60))
                : estimateEta(tariff, demand),
            tripMin,
            deepLink: provider.deepLink({ from, to, tariff }),
          },
        ];
      });
    },
  };
}
