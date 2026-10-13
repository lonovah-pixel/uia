import { surgeFor } from './time.ts';
import type { CityProfile, Place, ProviderInfo, Quote, RouteInfo, Tariff } from './types.ts';

export interface EstimateContext {
  from: Place;
  to: Place;
  route: RouteInfo;
  city: CityProfile;
  /** Уровень спроса из demandLevel(). */
  demand: number;
}

/** Шаг округления оценки: «≈ 340–410 ₽» читается лучше, чем «≈ 337–412 ₽». */
const PRICE_STEP: Record<string, number> = { RUB: 10 };

/** Стоимость по тарифу без учёта города и повышенного спроса. */
export function baseFare(t: Tariff, route: RouteInfo): number {
  const km = Math.max(0, route.distanceKm - (t.includedKm ?? 0));
  const min = Math.max(0, route.durationMin - (t.includedMin ?? 0));
  return Math.max(t.minFare, t.baseFare + km * t.perKm + min * t.perMin);
}

/** Время подачи растёт вместе со спросом: свободных машин меньше. */
export function estimateEta(t: Tariff, demand: number): number {
  return Math.max(1, Math.round(t.etaBaseMin * (1 + Math.max(0, demand - 1) * 1.5)));
}

export function estimateQuote(provider: ProviderInfo, t: Tariff, ctx: EstimateContext): Quote {
  const surge = surgeFor(ctx.demand, t.surgeSensitivity);
  const center = baseFare(t, ctx.route) * ctx.city.priceMultiplier * surge;
  const step = PRICE_STEP[ctx.city.currency] ?? 1;
  const priceMin = Math.max(step, Math.floor((center * (1 - t.spread)) / step) * step);
  const priceMax = Math.ceil((center * (1 + t.spread)) / step) * step;

  return {
    id: `${provider.id}:${t.code ?? t.rideClass}`,
    providerId: provider.id,
    providerName: provider.name,
    rideClass: t.rideClass,
    tariffName: t.name,
    currency: ctx.city.currency,
    priceMin,
    priceMax,
    price: Math.round(center),
    priceKind: 'estimate',
    surge,
    etaMin: estimateEta(t, ctx.demand),
    tripMin: Math.round(ctx.route.durationMin),
    deepLink: provider.deepLink({ from: ctx.from, to: ctx.to, tariff: t }),
    ...(provider.note ? { note: provider.note } : {}),
  };
}

export function estimateProviderQuotes(provider: ProviderInfo, ctx: EstimateContext): Quote[] {
  return provider.tariffs.map((t) => estimateQuote(provider, t, ctx));
}
