import { roundCoord, type GeoPoint, type GeocodeResult } from '@uia/core';
import { TtlCache } from './cache.ts';
import type { HttpClient } from './http.ts';

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
  };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

export interface Geocoder {
  search(query: string, near?: GeoPoint): Promise<GeocodeResult[]>;
  reverse(point: GeoPoint): Promise<GeocodeResult | null>;
}

export function toGeocodeResult(f: PhotonFeature): GeocodeResult | null {
  const [lon, lat] = f.geometry.coordinates;
  const p = f.properties;
  const street = [p.street, p.housenumber].filter(Boolean).join(', ');
  const name = p.name ?? (street || p.city || p.state);
  if (!name) return null;
  // Страну не показываем: такси внутри одного города
  const parts = [street !== name ? street : '', p.city ?? p.state ?? ''];
  return { name, address: parts.filter((s) => s && s !== name).join(', '), lat, lon };
}

function dedupe(results: GeocodeResult[]): GeocodeResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.name}|${r.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Геокодер Photon (OpenStreetMap): подсказки адресов и название точки по координатам. */
export function createGeocoder(http: HttpClient, photonUrl: string): Geocoder {
  const base = photonUrl.replace(/\/$/, '');
  const searchCache = new TtlCache<GeocodeResult[]>(60 * 60_000);
  const reverseCache = new TtlCache<GeocodeResult | null>(60 * 60_000);

  const features = (data: PhotonResponse) =>
    (data.features ?? []).map(toGeocodeResult).filter((r): r is GeocodeResult => r !== null);

  return {
    search(query, near) {
      const q = query.trim();
      const params = new URLSearchParams({ q, limit: '8' });
      if (near) {
        params.set('lat', String(roundCoord(near.lat, 2)));
        params.set('lon', String(roundCoord(near.lon, 2)));
      }
      return searchCache.getOrSet(params.toString(), async () =>
        dedupe(features(await http.getJson<PhotonResponse>(`${base}/api/?${params}`))).slice(0, 6),
      );
    },

    reverse(point) {
      const params = new URLSearchParams({ lat: String(roundCoord(point.lat)), lon: String(roundCoord(point.lon)) });
      return reverseCache.getOrSet(params.toString(), async () => {
        return features(await http.getJson<PhotonResponse>(`${base}/reverse?${params}`))[0] ?? null;
      });
    },
  };
}
