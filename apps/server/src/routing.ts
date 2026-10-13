import { estimateFreeFlowRoute, roundCoord, type GeoPoint } from '@uia/core';
import { TtlCache } from './cache.ts';
import type { HttpClient } from './http.ts';

/** Маршрут без учёта пробок; пробки добавляет сервис цен по местному времени. */
export interface FreeFlowRoute {
  distanceKm: number;
  durationMin: number;
  source: 'osrm' | 'estimate';
  geometry?: [number, number][];
  /** Почему пришлось оценивать маршрут по прямой. */
  warning?: string;
}

interface OsrmResponse {
  code: string;
  routes?: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }[];
}

export type Router = (from: GeoPoint, to: GeoPoint) => Promise<FreeFlowRoute>;

export function createRouter(http: HttpClient, osrmUrl: string): Router {
  const cache = new TtlCache<FreeFlowRoute>(10 * 60_000);

  async function osrmRoute(from: GeoPoint, to: GeoPoint): Promise<FreeFlowRoute> {
    const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
    const data = await http.getJson<OsrmResponse>(
      `${osrmUrl.replace(/\/$/, '')}/route/v1/driving/${coords}?overview=simplified&geometries=geojson`,
    );
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !route) throw new Error(`маршрут не найден (${data.code})`);
    return {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      source: 'osrm',
      geometry: route.geometry?.coordinates.map(([lon, lat]) => [lat, lon]),
    };
  }

  return async (from, to) => {
    const key = [from.lat, from.lon, to.lat, to.lon].map((n) => roundCoord(n)).join(',');
    const cached = cache.get(key);
    if (cached) return cached;

    let warning = 'Роутер не настроен — расстояние оценено по прямой';
    if (osrmUrl) {
      try {
        const route = await osrmRoute(from, to);
        cache.set(key, route);
        return route;
      } catch (err) {
        warning = `Не удалось построить маршрут (${err instanceof Error ? err.message : err}) — расстояние оценено по прямой`;
      }
    }
    // Запасной вариант не кэшируем: роутер может вернуться через минуту
    return { ...estimateFreeFlowRoute(from, to), source: 'estimate', warning };
  };
}
