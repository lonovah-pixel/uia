export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Place extends GeoPoint {
  /** Человекочитаемое название точки (адрес, POI). */
  name?: string;
}

export type RideClass = 'economy' | 'comfort' | 'comfortPlus' | 'business' | 'minivan';

export interface RouteInfo {
  distanceKm: number;
  /** Время в пути с учётом пробок, минуты. */
  durationMin: number;
  /** osrm — реальный маршрут по дорогам, estimate — оценка по прямой. */
  source: 'osrm' | 'estimate';
  /** Линия маршрута для карты: [lat, lon][]. */
  geometry?: [number, number][];
}

export interface CityProfile {
  id: string;
  name: string;
  center: GeoPoint;
  radiusKm: number;
  /** Множитель к базовым (московским) тарифам. */
  priceMultiplier: number;
  /** Насколько пробки в городе удлиняют поездку относительно Москвы (0..1). */
  trafficLevel: number;
  currency: string;
  /** Смещение местного времени от UTC, минуты. undefined — берём часовой пояс клиента. */
  tzOffsetMin?: number;
}

/** Тарифная модель: подача + км + минуты, минимальная стоимость, чувствительность к спросу. */
export interface Tariff {
  rideClass: RideClass;
  name: string;
  baseFare: number;
  perKm: number;
  perMin: number;
  minFare: number;
  includedKm?: number;
  includedMin?: number;
  /** 0 — цена не растёт в час пик, 1 — растёт полностью вслед за спросом. */
  surgeSensitivity: number;
  /** Типичное время подачи в обычное время, минуты. */
  etaBaseMin: number;
  /** Неопределённость оценки: ±доля от цены. */
  spread: number;
  /** Код тарифа во внутреннем API / диплинке агрегатора. */
  code?: string;
}

export interface DeepLinkArgs {
  from: Place;
  to: Place;
  tariff: Tariff;
}

export interface DeepLink {
  url: string;
  /** true — маршрут подставится в приложении агрегатора автоматически. */
  prefilled: boolean;
}

export interface ProviderInfo {
  id: string;
  name: string;
  /** Одна-две буквы для логотипа-заглушки. */
  logo: string;
  color: string;
  textColor: string;
  website: string;
  /** Пояснение, показываемое под карточкой (например, про торг в inDrive). */
  note?: string;
  tariffs: Tariff[];
  deepLink(args: DeepLinkArgs): DeepLink;
}

/** live — цена получена от агрегатора, estimate — оценка по модели тарифа. */
export type PriceKind = 'live' | 'estimate';

export interface Quote {
  /** Уникален в пределах ответа: `${providerId}:${tariffCode}`. */
  id: string;
  providerId: string;
  providerName: string;
  rideClass: RideClass;
  tariffName: string;
  currency: string;
  priceMin: number;
  priceMax: number;
  /** Цена для сравнения: точная цена или середина диапазона оценки. */
  price: number;
  priceKind: PriceKind;
  /** Коэффициент повышенного спроса, 1 — без повышения. */
  surge: number;
  /** Время подачи, минуты. */
  etaMin: number;
  /** Время в пути, минуты. */
  tripMin: number;
  deepLink: DeepLink;
  note?: string;
}

export type Badge = 'best' | 'cheapest' | 'fastest';

export interface RankedQuote extends Quote {
  /** Чем меньше — тем выгоднее: цена + стоимость потерянного времени. */
  score: number;
  badges: Badge[];
}

export type SortMode = 'best' | 'price' | 'eta';

export interface RankOptions {
  sort?: SortMode;
  /** Сколько стоит для пользователя минута ожидания подачи, в валюте поездки. */
  valueOfTimePerMin?: number;
}

export interface RankSummary {
  bestId: string | null;
  cheapestId: string | null;
  fastestId: string | null;
  /** Разница между самым дорогим и самым дешёвым вариантом. */
  maxSavings: number;
  currency: string | null;
}

export interface RankResult {
  quotes: RankedQuote[];
  summary: RankSummary;
}

export interface QuoteRequest {
  from: Place;
  to: Place;
  /** Время поездки (ISO). По умолчанию — сейчас. */
  when?: string;
  /** Смещение часового пояса клиента, как в Date#getTimezoneOffset() с обратным знаком. */
  tzOffsetMin?: number;
  providers?: string[];
  classes?: RideClass[];
  valueOfTimePerMin?: number;
}

export interface ProviderStatus {
  providerId: string;
  source: 'live' | 'estimate';
  error?: string;
}

export interface QuoteResponse extends RankResult {
  route: RouteInfo;
  city: { id: string; name: string };
  providers: ProviderStatus[];
  /** Что пошло не так: роутер недоступен, API агрегатора не ответило и т. п. */
  warnings: string[];
  generatedAt: string;
}

export interface ProviderSummary {
  id: string;
  name: string;
  logo: string;
  color: string;
  textColor: string;
  website: string;
  live: boolean;
  classes: RideClass[];
}

export interface GeocodeResult extends Place {
  name: string;
  address: string;
}
