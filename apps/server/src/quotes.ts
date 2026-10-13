import {
  PROVIDERS,
  demandLevel,
  detectCity,
  estimateProviderQuotes,
  localTime,
  rankQuotes,
  roundCoord,
  trafficFactor,
  type ProviderInfo,
  type ProviderStatus,
  type Quote,
  type QuoteRequest,
  type QuoteResponse,
  type RouteInfo,
} from '@uia/core';
import type { LiveAdapter, LiveContext } from './adapters/index.ts';
import { TtlCache } from './cache.ts';
import type { Router } from './routing.ts';

/** Москва — UTC+3: часовой пояс по умолчанию, если город неизвестен и клиент его не прислал. */
const DEFAULT_TZ_OFFSET_MIN = 180;

interface ProviderResult {
  quotes: Quote[];
  status: ProviderStatus;
}

type CachedQuotes = Omit<QuoteResponse, 'quotes' | 'summary'> & { quotes: Quote[] };

export interface QuoteService {
  getQuotes(req: QuoteRequest): Promise<QuoteResponse>;
}

export function createQuoteService(deps: {
  router: Router;
  adapters: Map<string, LiveAdapter>;
  providers?: ProviderInfo[];
  now?: () => Date;
}): QuoteService {
  const { router, adapters, providers = PROVIDERS, now = () => new Date() } = deps;
  // Цены меняются быстро, но повторный запрос того же маршрута в течение минуты отдаём из кэша
  const cache = new TtlCache<CachedQuotes>(60_000);

  async function quoteProvider(provider: ProviderInfo, ctx: LiveContext): Promise<ProviderResult> {
    const adapter = adapters.get(provider.id);
    if (adapter?.enabled) {
      try {
        const quotes = await adapter.getQuotes(ctx);
        if (quotes.length > 0) return { quotes, status: { providerId: provider.id, source: 'live' } };
        throw new Error('агрегатор не вернул ни одного тарифа');
      } catch (err) {
        return {
          quotes: estimateProviderQuotes(provider, ctx),
          status: {
            providerId: provider.id,
            source: 'estimate',
            error: err instanceof Error ? err.message : String(err),
          },
        };
      }
    }
    return { quotes: estimateProviderQuotes(provider, ctx), status: { providerId: provider.id, source: 'estimate' } };
  }

  async function collect(req: QuoteRequest, when: Date): Promise<CachedQuotes> {
    const city = detectCity(req.from);
    const time = localTime(when, city.tzOffsetMin ?? req.tzOffsetMin ?? DEFAULT_TZ_OFFSET_MIN);
    const freeFlow = await router(req.from, req.to);
    const route: RouteInfo = {
      distanceKm: freeFlow.distanceKm,
      durationMin: freeFlow.durationMin * trafficFactor(time, city.trafficLevel),
      source: freeFlow.source,
      ...(freeFlow.geometry ? { geometry: freeFlow.geometry } : {}),
    };
    const ctx: LiveContext = { from: req.from, to: req.to, route, city, demand: demandLevel(time) };
    const results = await Promise.all(providers.map((p) => quoteProvider(p, ctx)));

    const warnings = freeFlow.warning ? [freeFlow.warning] : [];
    for (const { status } of results) {
      if (status.error) {
        const name = providers.find((p) => p.id === status.providerId)?.name ?? status.providerId;
        warnings.push(`${name}: не удалось получить цену (${status.error}), показана оценка`);
      }
    }
    return {
      route,
      city: { id: city.id, name: city.name },
      quotes: results.flatMap((r) => r.quotes),
      providers: results.map((r) => r.status),
      warnings,
      generatedAt: now().toISOString(),
    };
  }

  return {
    async getQuotes(req) {
      const when = req.when ? new Date(req.when) : now();
      const key = [
        ...[req.from.lat, req.from.lon, req.to.lat, req.to.lon].map((n) => roundCoord(n)),
        Math.floor(when.getTime() / 60_000),
        req.tzOffsetMin ?? '',
      ].join('|');
      const data = await cache.getOrSet(key, () => collect(req, when));

      const wanted = (providerId: string) => !req.providers || req.providers.includes(providerId);
      const quotes = data.quotes.filter(
        (q) => wanted(q.providerId) && (!req.classes || req.classes.includes(q.rideClass)),
      );
      return {
        ...data,
        providers: data.providers.filter((s) => wanted(s.providerId)),
        ...rankQuotes(quotes, { valueOfTimePerMin: req.valueOfTimePerMin }),
      };
    },
  };
}
