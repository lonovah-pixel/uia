import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

for (const file of ['.env', '../../.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // файла нет — используем переменные окружения как есть
  }
}

const config = loadConfig();
const app = await buildApp({ config, logger: true });

const live = [config.yandex.clid && 'Яндекс Go', config.uber.accessToken && 'Uber'].filter(Boolean);
app.log.info(live.length ? `Реальные цены: ${live.join(', ')}` : 'Ключи API агрегаторов не заданы — показываем оценки по тарифам');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().then(() => process.exit(0));
  });
}

await app.listen({ port: config.port, host: config.host });
