import { estimateEta, getProvider, type Quote, type RideClass } from '@uia/core';
import type { HttpClient } from '../http.ts';
import type { LiveAdapter } from './types.ts';

/* Uber Riders API: https://developer.uber.com/docs/riders/references/api/v1.2/estimates-price-get */
export const UBER_API_URL = 'https://api.uber.com/v1.2';

interface UberPrice {
  product_id: string;
  display_name: string;
  currency_code: string | null;
  low_estimate: number | null;
  high_estimate: number | null;
  surge_multiplier?: number;
  /** Секунды. */
  duration?: number;
}

interface UberTime {
  product_id: string;
  /** Время подачи, секунды. */
  estimate: number;
}

export function uberRideClass(displayName: string): RideClass | null {
  const name = displayName.toLowerCase();
  if (/pool|share|wav|assist|moto|auto|flash|taxi/.test(name)) return null;
  if (/black|lux|select|premier/.test(name)) return 'business';
  if (/xl|van|xxl/.test(name)) return 'minivan';
  if (/comfort/.test(name)) return 'comfort';
  return 'economy';
}

export function createUberAdapter(http: HttpClient, accessToken: string): LiveAdapter {
  const provider = getProvider('uber')!;
  const headers = { Authorization: `Bearer ${accessToken}`, 'Accept-Language': 'ru_RU' };

  return {
    providerId: provider.id,
    enabled: Boolean(accessToken),

    async getQuotes({ from, to, route, demand }) {
      const start = `start_latitude=${from.lat}&start_longitude=${from.lon}`;
      const [prices, times] = await Promise.all([
        http.getJson<{ prices?: UberPrice[] }>(
          `${UBER_API_URL}/estimates/price?${start}&end_latitude=${to.lat}&end_longitude=${to.lon}`,
          headers,
        ),
        // Без времени подачи цены всё равно полезны
        http
          .getJson<{ times?: UberTime[] }>(`${UBER_API_URL}/estimates/time?${start}`, headers)
          .catch(() => ({ times: [] as UberTime[] })),
      ]);
      const etaByProduct = new Map((times.times ?? []).map((t) => [t.product_id, t.estimate]));

      const quotes: Quote[] = [];
      for (const p of prices.prices ?? []) {
        const rideClass = uberRideClass(p.display_name);
        if (!rideClass || p.low_estimate === null || p.high_estimate === null || !p.currency_code) continue;
        const tariff = provider.tariffs.find((t) => t.rideClass === rideClass) ?? provider.tariffs[0]!;
        const eta = etaByProduct.get(p.product_id);
        quotes.push({
          id: `${provider.id}:${p.product_id}`,
          providerId: provider.id,
          providerName: provider.name,
          rideClass,
          tariffName: p.display_name,
          currency: p.currency_code,
          priceMin: p.low_estimate,
          priceMax: p.high_estimate,
          price: Math.round((p.low_estimate + p.high_estimate) / 2),
          priceKind: 'live',
          surge: p.surge_multiplier ?? 1,
          etaMin: eta !== undefined ? Math.max(1, Math.round(eta / 60)) : estimateEta(tariff, demand),
          tripMin: p.duration ? Math.round(p.duration / 60) : Math.round(route.durationMin),
          deepLink: provider.deepLink({ from, to, tariff }),
        });
      }
      return quotes;
    },
  };
}
