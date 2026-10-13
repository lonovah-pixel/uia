import type { GeoPoint } from './types.ts';

const EARTH_RADIUS_KM = 6371;

/** Во сколько раз путь по дорогам длиннее прямой — среднее для городов. */
export const ROAD_FACTOR = 1.35;

/**
 * Средняя скорость без пробок, км/ч — для оценки маршрута без роутера.
 * Короткие поездки идут по улицам со светофорами, длинные — по магистралям.
 */
export function freeFlowSpeedKmh(distanceKm: number): number {
  return Math.min(50, 25 + distanceKm * 0.7);
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidPoint(p: unknown): p is GeoPoint {
  if (!p || typeof p !== 'object') return false;
  const { lat, lon } = p as Record<string, unknown>;
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

export function roundCoord(value: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Маршрут «по прямой» без учёта пробок — запасной вариант, когда роутер недоступен. */
export function estimateFreeFlowRoute(from: GeoPoint, to: GeoPoint): { distanceKm: number; durationMin: number } {
  const distanceKm = haversineKm(from, to) * ROAD_FACTOR;
  // +2 минуты на светофоры, развороты и выезд со двора
  const durationMin = (distanceKm / freeFlowSpeedKmh(distanceKm)) * 60 + 2;
  return { distanceKm, durationMin };
}
