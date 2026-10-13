import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderSummary, QuoteResponse } from '@uia/core';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppOptions } from '../src/app.ts';
import { GORKY_PARK, RED_SQUARE, fakeFetch, testConfig } from './helpers.ts';

const offline = fakeFetch({});

const osrmOk = () => ({
  code: 'Ok',
  routes: [
    {
      distance: 4200,
      duration: 600,
      geometry: {
        coordinates: [
          [37.6208, 55.7539],
          [37.6031, 55.7298],
        ],
      },
    },
  ],
});

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

async function start(options: Partial<AppOptions> = {}) {
  app = await buildApp({ config: testConfig(), fetch: offline, ...options });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function postQuotes(body: object) {
  const res = await app!.inject({ method: 'POST', url: '/api/quotes', payload: body });
  return { status: res.statusCode, body: res.json() as QuoteResponse & { error?: string } };
}

describe('GET /api/health, /api/providers', () => {
  it('отвечает на проверку здоровья', async () => {
    await start();
    const res = await app!.inject('/api/health');
    expect(res.json()).toEqual({ ok: true });
  });

  it('перечисляет агрегаторы и отмечает подключённые API', async () => {
    await start({ config: testConfig({ yandex: { clid: 'c', apiKey: 'k' } }) });
    const providers = (await app!.inject('/api/providers')).json() as ProviderSummary[];
    expect(providers.map((p) => p.id)).toEqual(['yandex', 'uber', 'citymobil', 'maxim', 'indrive', 'wheely']);
    expect(providers.find((p) => p.id === 'yandex')!.live).toBe(true);
    expect(providers.find((p) => p.id === 'uber')!.live).toBe(false);
    expect(providers.find((p) => p.id === 'wheely')!.classes).toEqual(['business']);
  });
});

describe('POST /api/quotes', () => {
  it('без сети оценивает маршрут по прямой и цены по тарифам', async () => {
    await start();
    const { status, body } = await postQuotes({ from: RED_SQUARE, to: GORKY_PARK });

    expect(status).toBe(200);
    expect(body.city).toEqual({ id: 'moscow', name: 'Москва' });
    expect(body.route.source).toBe('estimate');
    expect(body.warnings[0]).toMatch(/оценено по прямой/);
    expect(body.quotes.length).toBeGreaterThan(10);
    expect(body.quotes.every((q) => q.priceKind === 'estimate')).toBe(true);
    expect(body.providers.every((p) => p.source === 'estimate')).toBe(true);
    expect(body.summary.bestId).toBe(body.quotes[0]!.id);
    expect(body.quotes[0]!.badges).toContain('best');
  });

  it('строит маршрут через OSRM и учитывает пробки', async () => {
    await start({ fetch: fakeFetch({ 'osrm.test/route/v1/driving/37.6208,55.7539;37.6031,55.7298': osrmOk }) });
    // вторник, 18:00 по Москве — вечерний час пик
    const { body } = await postQuotes({ from: RED_SQUARE, to: GORKY_PARK, when: '2026-10-13T15:00:00Z' });

    expect(body.route.source).toBe('osrm');
    expect(body.route.distanceKm).toBe(4.2);
    expect(body.route.durationMin).toBeGreaterThan(10);
    expect(body.route.geometry).toEqual([
      [55.7539, 37.6208],
      [55.7298, 37.6031],
    ]);
    expect(body.warnings).toEqual([]);
  });

  it('в час пик дороже, чем ночью', async () => {
    await start();
    const price = async (when: string) => {
      const { body } = await postQuotes({ from: RED_SQUARE, to: GORKY_PARK, when, classes: ['economy'] });
      return body.quotes.find((q) => q.id === 'yandex:econom')!;
    };
    const peak = await price('2026-10-13T15:00:00Z'); // 18:00 MSK
    const night = await price('2026-10-13T00:00:00Z'); // 03:00 MSK
    expect(peak.surge).toBeGreaterThan(1);
    expect(night.surge).toBe(1);
    expect(peak.price).toBeGreaterThan(night.price);
    expect(peak.etaMin).toBeGreaterThan(night.etaMin);
  });

  it('фильтрует по классам и агрегаторам', async () => {
    await start();
    const business = await postQuotes({ from: RED_SQUARE, to: GORKY_PARK, classes: ['business'] });
    expect(business.body.quotes.every((q) => q.rideClass === 'business')).toBe(true);
    expect(business.body.quotes.length).toBeGreaterThan(0);

    const maxim = await postQuotes({ from: RED_SQUARE, to: GORKY_PARK, providers: ['maxim'] });
    expect(new Set(maxim.body.quotes.map((q) => q.providerId))).toEqual(new Set(['maxim']));
    expect(maxim.body.providers.map((p) => p.providerId)).toEqual(['maxim']);
  });

  it('берёт реальные цены из API Яндекс Go', async () => {
    const fetch = fakeFetch({
      'taxi-routeinfo.taxi.yandex.net/taxi_info': (url) => {
        expect(url.searchParams.get('clid')).toBe('my-clid');
        expect(url.searchParams.get('rll')).toBe('37.6208,55.7539~37.6031,55.7298');
        return {
          currency: 'RUB',
          distance: 4300,
          time: 900,
          options: [
            { class_name: 'econom', class_text: 'Эконом', price: 312, waiting_time: 185 },
            { class_name: 'business', class_text: 'Комфорт', price: 455, waiting_time: 300 },
            { class_name: 'unknown', price: 1 },
          ],
        };
      },
    });
    await start({ fetch, config: testConfig({ yandex: { clid: 'my-clid', apiKey: 'key' } }) });
    const { body } = await postQuotes({ from: RED_SQUARE, to: GORKY_PARK });

    const yandex = body.quotes.filter((q) => q.providerId === 'yandex');
    expect(yandex).toHaveLength(2);
    const econom = yandex.find((q) => q.rideClass === 'economy')!;
    expect(econom).toMatchObject({ priceKind: 'live', price: 312, priceMin: 312, priceMax: 312, etaMin: 3, tripMin: 15 });
    expect(econom.deepLink.url).toContain('level=econom');
    expect(yandex.find((q) => q.rideClass === 'comfort')!.tariffName).toBe('Комфорт');
    expect(body.providers.find((p) => p.providerId === 'yandex')).toEqual({ providerId: 'yandex', source: 'live' });
    expect(body.quotes.filter((q) => q.providerId !== 'yandex').every((q) => q.priceKind === 'estimate')).toBe(true);
  });

  it('если API агрегатора упало — показывает оценку и предупреждение', async () => {
    const fetch = fakeFetch({ 'taxi-routeinfo': () => new Response('oops', { status: 500 }) });
    await start({ fetch, config: testConfig({ yandex: { clid: 'c', apiKey: 'k' } }) });
    const { status, body } = await postQuotes({ from: RED_SQUARE, to: GORKY_PARK });

    expect(status).toBe(200);
    expect(body.quotes.filter((q) => q.providerId === 'yandex').every((q) => q.priceKind === 'estimate')).toBe(true);
    expect(body.providers.find((p) => p.providerId === 'yandex')).toMatchObject({ source: 'estimate', error: expect.stringContaining('HTTP 500') });
    expect(body.warnings.some((w) => w.startsWith('Яндекс Go: не удалось получить цену'))).toBe(true);
  });

  it('берёт реальные цены из API Uber', async () => {
    const fetch = fakeFetch({
      'api.uber.com/v1.2/estimates/price': (_url, init) => {
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token');
        return {
          prices: [
            { product_id: 'p1', display_name: 'UberX', currency_code: 'RUB', low_estimate: 300, high_estimate: 360, surge_multiplier: 1.2, duration: 840 },
            { product_id: 'p2', display_name: 'Black', currency_code: 'RUB', low_estimate: 900, high_estimate: 1000, duration: 840 },
            { product_id: 'p3', display_name: 'Taxi', currency_code: null, low_estimate: null, high_estimate: null },
          ],
        };
      },
      'api.uber.com/v1.2/estimates/time': () => ({ times: [{ product_id: 'p1', estimate: 240 }] }),
    });
    await start({ fetch, config: testConfig({ uber: { accessToken: 'token' } }) });
    const { body } = await postQuotes({ from: RED_SQUARE, to: GORKY_PARK, providers: ['uber'] });

    expect(body.quotes).toHaveLength(2);
    expect(body.quotes.find((q) => q.id === 'uber:p1')).toMatchObject({
      rideClass: 'economy',
      priceKind: 'live',
      priceMin: 300,
      priceMax: 360,
      price: 330,
      surge: 1.2,
      etaMin: 4,
      tripMin: 14,
    });
    expect(body.quotes.find((q) => q.id === 'uber:p2')!.rideClass).toBe('business');
  });

  it('учитывает цену времени при выборе лучшего', async () => {
    await start();
    const cheap = await postQuotes({ from: RED_SQUARE, to: GORKY_PARK, classes: ['economy'], valueOfTimePerMin: 0 });
    expect(cheap.body.summary.bestId).toBe(cheap.body.summary.cheapestId);
    const hurry = await postQuotes({ from: RED_SQUARE, to: GORKY_PARK, classes: ['economy'], valueOfTimePerMin: 1000 });
    expect(hurry.body.summary.bestId).toBe(hurry.body.summary.fastestId);
  });

  it('проверяет входные данные', async () => {
    await start();
    expect((await postQuotes({ from: RED_SQUARE })).status).toBe(400);
    expect((await postQuotes({ from: { lat: 100, lon: 0 }, to: GORKY_PARK })).status).toBe(400);
    expect((await postQuotes({ from: RED_SQUARE, to: GORKY_PARK, classes: ['rocket'] })).status).toBe(400);
    const far = await postQuotes({ from: RED_SQUARE, to: { lat: 59.93, lon: 30.33 } });
    expect(far.status).toBe(400);
    expect(far.body.error).toMatch(/слишком далеко/);
  });
});

describe('поиск адресов', () => {
  const photon = {
    features: [
      {
        geometry: { coordinates: [37.6208, 55.7539] },
        properties: { name: 'Красная площадь', city: 'Москва', country: 'Россия' },
      },
      {
        geometry: { coordinates: [37.6, 55.75] },
        properties: { street: 'Тверская улица', housenumber: '7', city: 'Москва', country: 'Россия' },
      },
      { geometry: { coordinates: [0, 0] }, properties: {} },
    ],
  };

  it('подсказывает адреса рядом с пользователем', async () => {
    const fetch = fakeFetch({ 'photon.test/api/': () => photon });
    await start({ fetch });
    const res = await app!.inject('/api/geocode?q=красная&lat=55.75&lon=37.62');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { name: 'Красная площадь', address: 'Москва', lat: 55.7539, lon: 37.6208 },
      { name: 'Тверская улица, 7', address: 'Москва', lat: 55.75, lon: 37.6 },
    ]);
    const url = new URL(fetch.calls[0]!);
    expect(url.searchParams.get('q')).toBe('красная');
    expect(url.searchParams.get('lat')).toBe('55.75');
  });

  it('определяет адрес по точке на карте', async () => {
    await start({ fetch: fakeFetch({ 'photon.test/reverse': () => photon }) });
    const res = await app!.inject('/api/reverse?lat=55.7539&lon=37.6208');
    expect(res.json()).toEqual({ result: { name: 'Красная площадь', address: 'Москва', lat: 55.7539, lon: 37.6208 } });
  });

  it('сообщает, если геокодер недоступен', async () => {
    await start();
    const res = await app!.inject('/api/geocode?q=красная');
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatch(/недоступен/);
  });

  it('отклоняет слишком короткий запрос', async () => {
    await start();
    expect((await app!.inject('/api/geocode?q=a')).statusCode).toBe(400);
  });
});

describe('раздача фронтенда', () => {
  it('отдаёт index.html для маршрутов приложения и JSON 404 для неизвестного API', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uia-web-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Такси</title>');
    await start({ config: testConfig({ staticDir: dir }) });

    const page = await app!.inject('/');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Такси');
    expect((await app!.inject('/settings')).body).toContain('Такси');

    const api = await app!.inject('/api/nope');
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: 'Не найдено' });
  });

  it('отдаёт файлы, появившиеся после запуска (пересборка фронтенда)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uia-web-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html>');
    await start({ config: testConfig({ staticDir: dir }) });
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');

    const res = await app!.inject('/assets/index-abc123.js');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.body).toBe('console.log(1)');
  });
});
