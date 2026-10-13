import { existsSync } from 'node:fs';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import {
  RIDE_CLASSES,
  createGeocoder,
  createHttpClient,
  createLiveAdapters,
  createQuoteService,
  createRouter,
  summarizeProviders,
  validateTrip,
  type FetchFn,
  type ProviderSummary,
  type QuoteRequest,
} from '@uia/core';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.ts';

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

  app.get('/api/providers', async (): Promise<ProviderSummary[]> => summarizeProviders(adapters));

  app.post<{ Body: QuoteRequest }>('/api/quotes', { schema: { body: quoteBodySchema } }, async (req, reply) => {
    const error = validateTrip(req.body.from, req.body.to);
    if (error) return reply.code(400).send({ error });
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
