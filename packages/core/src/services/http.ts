export type FetchFn = (input: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

export class HttpError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export interface HttpClient {
  getJson<T>(url: string, headers?: Record<string, string>): Promise<T>;
}

/**
 * JSON-клиент с таймаутом и понятными ошибками.
 * userAgent передавайте только на сервере и в нативном приложении: в браузере
 * собственный User-Agent вызывает CORS-предзапрос, который открытые API не поддерживают.
 */
export function createHttpClient(fetchFn: FetchFn, timeoutMs: number, userAgent?: string): HttpClient {
  return {
    async getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
      const host = new URL(url).host;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let res: Response;
        try {
          res = await fetchFn(url, {
            headers: { Accept: 'application/json', ...(userAgent ? { 'User-Agent': userAgent } : {}), ...headers },
            signal: controller.signal,
          });
        } catch {
          throw new HttpError(`${host}: ${controller.signal.aborted ? 'таймаут' : 'сеть недоступна'}`);
        }
        if (!res.ok) throw new HttpError(`${host}: HTTP ${res.status}`, res.status);
        try {
          return (await res.json()) as T;
        } catch {
          throw new HttpError(`${host}: ${controller.signal.aborted ? 'таймаут' : 'некорректный ответ'}`);
        }
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
