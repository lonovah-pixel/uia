import { describe, expect, it } from 'vitest';
import { rankQuotes, type Quote } from '../src/index.ts';

function quote(id: string, price: number, etaMin: number, extra: Partial<Quote> = {}): Quote {
  return {
    id,
    providerId: id,
    providerName: id,
    rideClass: 'economy',
    tariffName: 'Эконом',
    currency: 'RUB',
    priceMin: price,
    priceMax: price,
    price,
    priceKind: 'estimate',
    surge: 1,
    etaMin,
    tripMin: 20,
    deepLink: { url: 'https://example.com', prefilled: false },
    ...extra,
  };
}

describe('rankQuotes', () => {
  const quotes = [quote('a', 400, 3), quote('b', 350, 15), quote('c', 380, 5)];

  it('помечает самый дешёвый, самый быстрый и самый выгодный', () => {
    const { summary, quotes: ranked } = rankQuotes(quotes, { valueOfTimePerMin: 5 });
    // score: a = 415, b = 425, c = 405
    expect(summary.bestId).toBe('c');
    expect(summary.cheapestId).toBe('b');
    expect(summary.fastestId).toBe('a');
    expect(summary.maxSavings).toBe(50);
    expect(ranked.map((q) => q.id)).toEqual(['c', 'a', 'b']);
    expect(ranked[0]!.badges).toEqual(['best']);
  });

  it('без учёта времени самый выгодный — самый дешёвый', () => {
    const { summary, quotes: ranked } = rankQuotes(quotes, { valueOfTimePerMin: 0 });
    expect(summary.bestId).toBe('b');
    expect(ranked[0]!.badges).toEqual(['best', 'cheapest']);
  });

  it('если время дорого — выигрывает быстрая подача', () => {
    expect(rankQuotes(quotes, { valueOfTimePerMin: 30 }).summary.bestId).toBe('a');
  });

  it('сортирует по цене и по времени подачи', () => {
    expect(rankQuotes(quotes, { sort: 'price' }).quotes.map((q) => q.id)).toEqual(['b', 'c', 'a']);
    expect(rankQuotes(quotes, { sort: 'eta' }).quotes.map((q) => q.id)).toEqual(['a', 'c', 'b']);
  });

  it('при равной цене предпочитает цену агрегатора оценке', () => {
    const { summary } = rankQuotes([quote('est', 300, 5), quote('live', 300, 5, { priceKind: 'live' })]);
    expect(summary.cheapestId).toBe('live');
    expect(summary.bestId).toBe('live');
  });

  it('не сравнивает цены в разных валютах', () => {
    const { summary } = rankQuotes([quote('rub', 500, 5), quote('usd', 10, 5, { currency: 'USD' })]);
    expect(summary.cheapestId).toBe('rub');
    expect(summary.currency).toBe('RUB');
    expect(summary.maxSavings).toBe(0);
  });

  it('работает с пустым списком', () => {
    expect(rankQuotes([])).toEqual({
      quotes: [],
      summary: { bestId: null, cheapestId: null, fastestId: null, maxSavings: 0, currency: null },
    });
  });

  it('не изменяет исходные предложения', () => {
    const input = [quote('a', 100, 1)];
    rankQuotes(input);
    expect(input[0]).not.toHaveProperty('badges');
  });
});
