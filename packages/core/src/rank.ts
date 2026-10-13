import type { Badge, Quote, RankOptions, RankResult, RankedQuote, SortMode } from './types.ts';

/** По умолчанию минута ожидания подачи «стоит» 5 ₽. */
export const DEFAULT_VALUE_OF_TIME = 5;

type Comparator = (a: RankedQuote, b: RankedQuote) => number;

// Цена от агрегатора надёжнее оценки — при равенстве она выше
const liveFirst: Comparator = (a, b) => Number(b.priceKind === 'live') - Number(a.priceKind === 'live');
const byScore: Comparator = (a, b) => a.score - b.score;
const byPrice: Comparator = (a, b) => a.price - b.price;
const byEta: Comparator = (a, b) => a.etaMin - b.etaMin;

const chain =
  (...cmps: Comparator[]): Comparator =>
  (a, b) => {
    for (const cmp of cmps) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  };

const COMPARATORS: Record<SortMode, Comparator> = {
  best: chain(byScore, liveFirst, byPrice),
  price: chain(byPrice, liveFirst, byEta),
  eta: chain(byEta, byPrice),
};

function first(quotes: RankedQuote[], cmp: Comparator): RankedQuote | undefined {
  let winner: RankedQuote | undefined;
  for (const q of quotes) if (!winner || cmp(q, winner) < 0) winner = q;
  return winner;
}

/**
 * Ранжирует предложения и помечает лучшие.
 *
 * «Самый выгодный» — минимум суммы цены и стоимости ожидания подачи
 * (etaMin × valueOfTimePerMin): дешёвая машина через 20 минут может быть хуже
 * чуть более дорогой через 3. При valueOfTimePerMin = 0 — просто самый дешёвый.
 */
export function rankQuotes(quotes: Quote[], options: RankOptions = {}): RankResult {
  const valueOfTime = Math.max(0, options.valueOfTimePerMin ?? DEFAULT_VALUE_OF_TIME);
  const sort = options.sort ?? 'best';

  const ranked: RankedQuote[] = quotes.map((q) => ({
    ...q,
    score: Math.round(q.price + q.etaMin * valueOfTime),
    badges: [],
  }));

  // Цены в разных валютах не сравниваем — бейджи только среди валюты первого предложения
  const currency = ranked[0]?.currency ?? null;
  const comparable = ranked.filter((q) => q.currency === currency);

  const best = first(comparable, COMPARATORS.best);
  const cheapest = first(comparable, COMPARATORS.price);
  const fastest = first(comparable, COMPARATORS.eta);

  const mark = (q: RankedQuote | undefined, badge: Badge) => q?.badges.push(badge);
  mark(best, 'best');
  mark(cheapest, 'cheapest');
  mark(fastest, 'fastest');

  const prices = comparable.map((q) => q.price);
  const maxSavings = prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : 0;

  return {
    quotes: [...ranked].sort(COMPARATORS[sort]),
    summary: {
      bestId: best?.id ?? null,
      cheapestId: cheapest?.id ?? null,
      fastestId: fastest?.id ?? null,
      maxSavings,
      currency,
    },
  };
}
