import { describe, expect, it } from 'vitest';
import {
  CITIES,
  DEFAULT_CITY,
  PROVIDERS,
  baseFare,
  demandLevel,
  detectCity,
  estimateEta,
  estimateFreeFlowRoute,
  freeFlowSpeedKmh,
  estimateProviderQuotes,
  estimateQuote,
  getProvider,
  haversineKm,
  isValidPoint,
  localTime,
  surgeFor,
  trafficFactor,
  type EstimateContext,
  type RouteInfo,
  type Tariff,
} from '../src/index.ts';

const moscow = CITIES.find((c) => c.id === 'moscow')!;
const route: RouteInfo = { distanceKm: 10, durationMin: 25, source: 'osrm' };
const from = { lat: 55.7539, lon: 37.6208, name: 'Красная площадь' };
const to = { lat: 55.7298, lon: 37.6031, name: 'Парк Горького' };

const tariff: Tariff = {
  rideClass: 'economy',
  name: 'Эконом',
  code: 'econom',
  baseFare: 100,
  perKm: 10,
  perMin: 5,
  minFare: 200,
  surgeSensitivity: 1,
  etaBaseMin: 4,
  spread: 0.1,
};

describe('geo', () => {
  it('считает расстояние Москва — Петербург ≈ 634 км', () => {
    expect(haversineKm(moscow.center, CITIES.find((c) => c.id === 'spb')!.center)).toBeCloseTo(634, -1);
  });

  it('проверяет координаты', () => {
    expect(isValidPoint({ lat: 55, lon: 37 })).toBe(true);
    expect(isValidPoint({ lat: 91, lon: 37 })).toBe(false);
    expect(isValidPoint({ lat: '55', lon: 37 })).toBe(false);
    expect(isValidPoint(null)).toBe(false);
  });

  it('оценивает маршрут без роутера длиннее прямой', () => {
    const r = estimateFreeFlowRoute(from, to);
    expect(r.distanceKm).toBeGreaterThan(haversineKm(from, to));
    expect(r.durationMin).toBeGreaterThan(2);
  });

  it('на длинных поездках средняя скорость выше, чем в центре', () => {
    expect(freeFlowSpeedKmh(40)).toBeGreaterThan(freeFlowSpeedKmh(3));
    expect(freeFlowSpeedKmh(200)).toBe(50);
  });
});

describe('время и спрос', () => {
  it('переводит UTC в местное время', () => {
    // 2026-10-13 — вторник; 05:30 UTC = 08:30 MSK
    const t = localTime(new Date('2026-10-13T05:30:00Z'), 180);
    expect(t).toEqual({ hour: 8.5, weekday: 2 });
  });

  it('утром в будни спрос выше, чем днём', () => {
    expect(demandLevel({ hour: 8.5, weekday: 2 })).toBeGreaterThan(demandLevel({ hour: 13, weekday: 2 }));
  });

  it('вечер пятницы дороже вечера вторника', () => {
    expect(demandLevel({ hour: 23, weekday: 5 })).toBeGreaterThan(demandLevel({ hour: 23, weekday: 2 }));
  });

  it('пробки сильнее в загруженном городе', () => {
    const peak = { hour: 18, weekday: 3 };
    expect(trafficFactor(peak, 1)).toBeGreaterThan(trafficFactor(peak, 0.5));
    expect(trafficFactor({ hour: 3, weekday: 3 }, 1)).toBe(1);
  });

  it('коэффициент спроса учитывает чувствительность тарифа', () => {
    expect(surgeFor(1.5, 1)).toBe(1.5);
    expect(surgeFor(1.5, 0.5)).toBe(1.25);
    expect(surgeFor(1.5, 0)).toBe(1);
    expect(surgeFor(0.9, 1)).toBe(1);
  });
});

describe('города', () => {
  it('определяет город по точке', () => {
    expect(detectCity(from).id).toBe('moscow');
    expect(detectCity({ lat: 59.94, lon: 30.31 }).id).toBe('spb');
    expect(detectCity({ lat: 0, lon: 0 })).toBe(DEFAULT_CITY);
  });
});

describe('оценка цены', () => {
  it('считает подачу, километры и минуты', () => {
    expect(baseFare(tariff, route)).toBe(100 + 10 * 10 + 25 * 5);
  });

  it('учитывает включённые километры и минуты', () => {
    expect(baseFare({ ...tariff, includedKm: 2, includedMin: 5 }, route)).toBe(100 + 8 * 10 + 20 * 5);
  });

  it('не опускается ниже минимальной стоимости', () => {
    expect(baseFare(tariff, { distanceKm: 0.5, durationMin: 2, source: 'estimate' })).toBe(200);
  });

  it('время подачи растёт в час пик', () => {
    expect(estimateEta(tariff, 1)).toBe(4);
    expect(estimateEta(tariff, 1.5)).toBeGreaterThan(4);
  });

  it('строит предложение с диапазоном, коэффициентом спроса и диплинком', () => {
    const provider = getProvider('yandex')!;
    const ctx: EstimateContext = { from, to, route, city: moscow, demand: 1.4 };
    const q = estimateQuote(provider, tariff, ctx);

    expect(q.id).toBe('yandex:econom');
    expect(q.priceKind).toBe('estimate');
    expect(q.surge).toBe(1.4);
    expect(q.price).toBe(Math.round(325 * 1.4));
    expect(q.priceMin).toBeLessThanOrEqual(q.price);
    expect(q.priceMax).toBeGreaterThanOrEqual(q.price);
    expect(q.priceMin % 10).toBe(0);
    expect(q.priceMax % 10).toBe(0);
    expect(q.tripMin).toBe(25);
    expect(q.deepLink.prefilled).toBe(true);
  });

  it('в регионах дешевле, чем в Москве', () => {
    const provider = getProvider('yandex')!;
    const msk = estimateQuote(provider, tariff, { from, to, route, city: moscow, demand: 1 });
    const other = estimateQuote(provider, tariff, { from, to, route, city: DEFAULT_CITY, demand: 1 });
    expect(other.price).toBeLessThan(msk.price);
  });

  it('даёт предложение по каждому тарифу агрегатора', () => {
    for (const provider of PROVIDERS) {
      const quotes = estimateProviderQuotes(provider, { from, to, route, city: moscow, demand: 1.2 });
      expect(quotes).toHaveLength(provider.tariffs.length);
      for (const q of quotes) {
        expect(q.price).toBeGreaterThan(0);
        expect(q.etaMin).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('эконом дешевле бизнеса у каждого агрегатора', () => {
    for (const provider of PROVIDERS) {
      const quotes = estimateProviderQuotes(provider, { from, to, route, city: moscow, demand: 1 });
      const economy = quotes.find((q) => q.rideClass === 'economy');
      const business = quotes.find((q) => q.rideClass === 'business');
      if (economy && business) expect(economy.price).toBeLessThan(business.price);
    }
  });
});
