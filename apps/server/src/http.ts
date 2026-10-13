export type FetchFn = typeof fetch;

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface HttpClient {
  getJson<T>(url: string, headers?: Record<string, string>): Promise<T>;
}

export function createHttpClient(fetchFn: FetchFn, timeoutMs: number, userAgent: string): HttpClient {
  return {
    async getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
      let res: Response;
      try {
        res = await fetchFn(url, {
          headers: { Accept: 'application/json', 'User-Agent': userAgent, ...headers },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const reason = err instanceof Error && err.name === 'TimeoutError' ? 'таймаут' : 'сеть недоступна';
        throw new HttpError(`${new URL(url).host}: ${reason}`);
      }
      if (!res.ok) throw new HttpError(`${new URL(url).host}: HTTP ${res.status}`, res.status);
      return (await res.json()) as T;
    },
  };
}
