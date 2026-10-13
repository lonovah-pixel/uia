import { haversineKm } from './geo.ts';
import type { CityProfile, GeoPoint } from './types.ts';

// Тарифы в каталоге агрегаторов заданы для Москвы; в других городах цены ниже.
export const CITIES: CityProfile[] = [
  {
    id: 'moscow',
    name: 'Москва',
    center: { lat: 55.7558, lon: 37.6173 },
    radiusKm: 60,
    priceMultiplier: 1,
    trafficLevel: 1,
    currency: 'RUB',
    tzOffsetMin: 180,
  },
  {
    id: 'spb',
    name: 'Санкт-Петербург',
    center: { lat: 59.9343, lon: 30.3351 },
    radiusKm: 45,
    priceMultiplier: 0.88,
    trafficLevel: 0.9,
    currency: 'RUB',
    tzOffsetMin: 180,
  },
  {
    id: 'kazan',
    name: 'Казань',
    center: { lat: 55.7963, lon: 49.1088 },
    radiusKm: 30,
    priceMultiplier: 0.72,
    trafficLevel: 0.7,
    currency: 'RUB',
    tzOffsetMin: 180,
  },
  {
    id: 'ekaterinburg',
    name: 'Екатеринбург',
    center: { lat: 56.8389, lon: 60.6057 },
    radiusKm: 35,
    priceMultiplier: 0.74,
    trafficLevel: 0.75,
    currency: 'RUB',
    tzOffsetMin: 300,
  },
  {
    id: 'novosibirsk',
    name: 'Новосибирск',
    center: { lat: 55.0302, lon: 82.9204 },
    radiusKm: 35,
    priceMultiplier: 0.7,
    trafficLevel: 0.75,
    currency: 'RUB',
    tzOffsetMin: 420,
  },
  {
    id: 'sochi',
    name: 'Сочи',
    center: { lat: 43.5855, lon: 39.7231 },
    radiusKm: 40,
    priceMultiplier: 0.95,
    trafficLevel: 0.8,
    currency: 'RUB',
    tzOffsetMin: 180,
  },
];

export const DEFAULT_CITY: CityProfile = {
  id: 'other',
  name: 'Другой город',
  center: { lat: 0, lon: 0 },
  radiusKm: 0,
  priceMultiplier: 0.7,
  trafficLevel: 0.6,
  currency: 'RUB',
};

/** Ближайший известный город, в радиус которого попадает точка, иначе профиль по умолчанию. */
export function detectCity(point: GeoPoint): CityProfile {
  let best: CityProfile | undefined;
  let bestDistance = Infinity;
  for (const city of CITIES) {
    const d = haversineKm(point, city.center);
    if (d <= city.radiusKm && d < bestDistance) {
      best = city;
      bestDistance = d;
    }
  }
  return best ?? DEFAULT_CITY;
}
