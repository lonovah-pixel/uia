import type { CityProfile, Place, Quote, RouteInfo } from '../../types.ts';

export interface LiveContext {
  from: Place;
  to: Place;
  route: RouteInfo;
  city: CityProfile;
  demand: number;
}

/** Получение реальных цен из API агрегатора. */
export interface LiveAdapter {
  providerId: string;
  /** Настроены ли ключи доступа. */
  enabled: boolean;
  getQuotes(ctx: LiveContext): Promise<Quote[]>;
}
