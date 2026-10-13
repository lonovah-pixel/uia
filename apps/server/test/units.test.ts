import { describe, expect, it } from 'vitest';
import { uberRideClass } from '../src/adapters/uber.ts';
import { TtlCache } from '../src/cache.ts';
import { createHttpClient } from '../src/http.ts';
import { fakeFetch } from './helpers.ts';

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
