import type { GeoPoint, GeocodeResult, Place, ProviderSummary, QuoteResponse } from '@uia/core';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `Ошибка сервера (${res.status})`);
  return body as T;
}

export function fetchProviders(): Promise<ProviderSummary[]> {
  return request('/api/providers');
}

export function fetchQuotes(from: Place, to: Place, signal?: AbortSignal): Promise<QuoteResponse> {
  return request('/api/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, tzOffsetMin: -new Date().getTimezoneOffset() }),
    signal,
  });
}

export function geocode(query: string, near: GeoPoint | undefined, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({ q: query });
  if (near) {
    params.set('lat', near.lat.toFixed(4));
    params.set('lon', near.lon.toFixed(4));
  }
  return request(`/api/geocode?${params}`, { signal });
}

export async function reverseGeocode(point: GeoPoint): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({ lat: point.lat.toFixed(6), lon: point.lon.toFixed(6) });
  return (await request<{ result: GeocodeResult | null }>(`/api/reverse?${params}`)).result;
}
