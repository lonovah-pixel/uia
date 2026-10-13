import { describe, expect, it } from 'vitest';
import { TtlCache, createHttpClient, uberRideClass, type FetchFn } from '../src/index.ts';

/** Поддельный fetch: подстрока URL → ответ; неизвестные адреса — сетевая ошибка. */
function fakeFetch(routes: Record<string, () => Response>): FetchFn {
  return async (input) => {
    const url = String(input);
    for (const [pattern, handler] of Object.entries(routes)) if (url.includes(pattern)) return handler();
    throw new TypeError('fetch failed');
  };
}

describe('TtlCache', () => {
  it('забывает записи по истечении времени жизни', () => {
    let now = 0;
    const cache = new TtlCache<string>(1000, 10, () => now);
    cache.set('a', '1');
    now = 999;
    expect(cache.get('a')).toBe('1');
    now = 1000;
    expect(cache.get('a')).toBeUndefined();
  });

  it('вытесняет самую старую запись при переполнении', () => {
    const cache = new TtlCache<number>(60_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });

  it('не кэширует ошибки', async () => {
    const cache = new TtlCache<number>(60_000);
    await expect(cache.getOrSet('k', () => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    expect(await cache.getOrSet('k', async () => 42)).toBe(42);
  });
});

describe('HTTP-клиент', () => {
  it('сообщает хост и код ошибки', async () => {
    const http = createHttpClient(fakeFetch({ 'x.test': () => new Response('', { status: 503 }) }), 1000, 'ua');
    await expect(http.getJson('https://x.test/a')).rejects.toThrow('x.test: HTTP 503');
  });

  it('сообщает о недоступной сети', async () => {
    const http = createHttpClient(fakeFetch({}), 1000, 'ua');
    await expect(http.getJson('https://y.test/a')).rejects.toThrow('y.test: сеть недоступна');
  });

  it('прерывает зависший запрос по таймауту', async () => {
    const hanging: FetchFn = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const http = createHttpClient(hanging, 20);
    await expect(http.getJson('https://slow.test/a')).rejects.toThrow('slow.test: таймаут');
  });

  it('добавляет User-Agent, только если он задан', async () => {
    const seen: Record<string, string>[] = [];
    const capture: FetchFn = async (_url, init) => {
      seen.push(init?.headers ?? {});
      return Response.json({});
    };
    await createHttpClient(capture, 1000).getJson('https://a.test/');
    await createHttpClient(capture, 1000, 'my-app').getJson('https://a.test/');
    expect(seen[0]).not.toHaveProperty('User-Agent');
    expect(seen[1]!['User-Agent']).toBe('my-app');
  });
});

describe('классы Uber', () => {
  it.each([
    ['UberX', 'economy'],
    ['Comfort', 'comfort'],
    ['UberXL', 'minivan'],
    ['Black', 'business'],
    ['Black SUV', 'business'],
    ['UberPool', null],
    ['Taxi', null],
  ])('%s → %s', (name, expected) => {
    expect(uberRideClass(name)).toBe(expected);
  });
});
