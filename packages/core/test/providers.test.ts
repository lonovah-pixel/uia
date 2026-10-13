import { describe, expect, it } from 'vitest';
import { PROVIDERS, formatDistance, formatMinutes, formatPrice, getProvider, isRideClass } from '../src/index.ts';

const from = { lat: 55.7539, lon: 37.6208, name: 'Красная площадь' };
const to = { lat: 55.7298, lon: 37.6031, name: 'Парк Горького' };

describe('каталог агрегаторов', () => {
  it('у агрегаторов уникальные id, у тарифов — уникальные коды', () => {
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(PROVIDERS.length);
    for (const p of PROVIDERS) {
      expect(new Set(p.tariffs.map((t) => t.code)).size).toBe(p.tariffs.length);
      for (const t of p.tariffs) {
        expect(isRideClass(t.rideClass)).toBe(true);
        expect(t.minFare).toBeGreaterThan(0);
      }
    }
  });

  it('все диплинки — корректные https-ссылки', () => {
    for (const p of PROVIDERS) {
      for (const tariff of p.tariffs) {
        const link = p.deepLink({ from, to, tariff });
        expect(new URL(link.url).protocol).toBe('https:');
      }
    }
  });

  it('Яндекс Go получает маршрут и тариф', () => {
    const yandex = getProvider('yandex')!;
    const url = new URL(yandex.deepLink({ from, to, tariff: yandex.tariffs[1]! }).url);
    expect(url.searchParams.get('start-lat')).toBe('55.753900');
    expect(url.searchParams.get('end-lon')).toBe('37.603100');
    expect(url.searchParams.get('level')).toBe('business');
  });

  it('Uber получает точки и названия', () => {
    const uber = getProvider('uber')!;
    const url = new URL(uber.deepLink({ from, to, tariff: uber.tariffs[0]! }).url);
    expect(url.searchParams.get('pickup[latitude]')).toBe('55.753900');
    expect(url.searchParams.get('dropoff[nickname]')).toBe('Парк Горького');
  });
});

describe('форматирование', () => {
  it('показывает цену агрегатора и диапазон оценки', () => {
    const base = { currency: 'RUB', price: 350 };
    expect(formatPrice({ ...base, priceMin: 350, priceMax: 350, priceKind: 'live' })).toBe('350\u00a0₽');
    expect(formatPrice({ ...base, priceMin: 320, priceMax: 390, priceKind: 'estimate' })).toBe('≈\u00a0320–390\u00a0₽');
    expect(formatPrice({ ...base, priceMin: 1200, priceMax: 1400, priceKind: 'live' })).toBe(
      '1\u00a0200–1\u00a0400\u00a0₽',
    );
  });

  it('форматирует минуты и расстояние', () => {
    expect(formatMinutes(4.4)).toBe('4\u00a0мин');
    expect(formatMinutes(60)).toBe('1\u00a0ч');
    expect(formatMinutes(95)).toBe('1\u00a0ч 35\u00a0мин');
    expect(formatDistance(0.45)).toBe('450\u00a0м');
    expect(formatDistance(3.24)).toBe('3,2\u00a0км');
    expect(formatDistance(23.6)).toBe('24\u00a0км');
  });
});
