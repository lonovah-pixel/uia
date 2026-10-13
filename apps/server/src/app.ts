import { existsSync } from 'node:fs';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { PROVIDERS, RIDE_CLASSES, haversineKm, type ProviderSummary, type QuoteRequest } from '@uia/core';
import Fastify, { type FastifyInstance } from 'fastify';
import { createLiveAdapters } from './adapters/index.ts';
import type { Config } from './config.ts';
import { createGeocoder } from './geocoding.ts';
import { createHttpClient, type FetchFn } from './http.ts';
import { createQuoteService } from './quotes.ts';
import { createRouter } from './routing.ts';

/** Дальше этого расстояния такси не заказывают — скорее всего, точка выбрана по ошибке. */
const MAX_TRIP_KM = 500;

const placeSchema = {
  type: 'object',
  required: ['lat', 'lon'],
  additionalProperties: false,
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
    name: { type: 'string', maxLength: 300 },
  },
} as const;

const quoteBodySchema = {
  type: 'object',
  required: ['from', 'to'],
  additionalProperties: false,
  properties: {
    from: placeSchema,
    to: placeSchema,
    when: { type: 'string', format: 'date-time' },
    tzOffsetMin: { type: 'integer', minimum: -720, maximum: 840 },
    providers: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 50 } },
    classes: { type: 'array', maxItems: 10, items: { enum: RIDE_CLASSES.map((c) => c.id) } },
    valueOfTimePerMin: { type: 'number', minimum: 0, maximum: 10_000 },
  },
} as const;

const pointQuerySchema = {
  type: 'object',
  required: ['lat', 'lon'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
  },
} as const;

const searchQuerySchema = {
  type: 'object',
  required: ['q'],
  properties: {
    q: { type: 'string', minLength: 2, maxLength: 200 },
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
  },
} as const;

export interface AppOptions {
  config: Config;
  fetch?: FetchFn;
  logger?: boolean;
}

export async function buildApp({ config, fetch: fetchFn = fetch, logger = false }: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger, trustProxy: true });

  const http = createHttpClient(fetchFn, config.httpTimeoutMs, config.userAgent);
  const adapters = createLiveAdapters(http, config);
  const geocoder = createGeocoder(http, config.photonUrl);
  const quotes = createQuoteService({ router: createRouter(http, config.osrmUrl), adapters });

  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/providers', async (): Promise<ProviderSummary[]> =>
    PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      logo: p.logo,
      color: p.color,
      textColor: p.textColor,
      website: p.website,
      live: adapters.get(p.id)?.enabled ?? false,
      classes: [...new Set(p.tariffs.map((t) => t.rideClass))],
    })),
  );

  app.post<{ Body: QuoteRequest }>('/api/quotes', { schema: { body: quoteBodySchema } }, async (req, reply) => {
    const { from, to } = req.body;
    if (haversineKm(from, to) > MAX_TRIP_KM) {
      return reply.code(400).send({ error: `Маршрут длиннее ${MAX_TRIP_KM} км — для такси слишком далеко` });
    }
    return quotes.getQuotes(req.body);
  });

  app.get<{ Querystring: { q: string; lat?: number; lon?: number } }>(
    '/api/geocode',
    { schema: { querystring: searchQuerySchema } },
    async (req, reply) => {
      if (!config.photonUrl) return reply.code(503).send({ error: 'Поиск адресов не настроен' });
      const { q, lat, lon } = req.query;
      try {
        return await geocoder.search(q, lat !== undefined && lon !== undefined ? { lat, lon } : undefined);
      } catch (err) {
        req.log.warn({ err }, 'geocode failed');
        return reply.code(502).send({ error: 'Поиск адресов временно недоступен — выберите точку на карте' });
      }
    },
  );

  app.get<{ Querystring: { lat: number; lon: number } }>(
    '/api/reverse',
    { schema: { querystring: pointQuerySchema } },
    async (req, reply) => {
      if (!config.photonUrl) return reply.code(503).send({ error: 'Поиск адресов не настроен' });
      try {
        return { result: await geocoder.reverse(req.query) };
      } catch (err) {
        req.log.warn({ err }, 'reverse geocode failed');
        return reply.code(502).send({ error: 'Не удалось определить адрес' });
      }
    },
  );

  if (existsSync(config.staticDir)) {
    await app.register(fastifyStatic, { root: config.staticDir });
    // Одностраничное приложение: все неизвестные GET-адреса вне /api отдают index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Не найдено' });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Не найдено' }));
  }

  return app;
}
