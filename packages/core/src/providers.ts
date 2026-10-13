import type { DeepLink, DeepLinkArgs, Place, ProviderInfo, RideClass, Tariff } from './types.ts';

/*
 * Каталог агрегаторов.
 *
 * Тарифы — ориентировочные московские цены (₽) для оценки, когда у агрегатора нет
 * открытого API или ключ не настроен. Для других городов применяется множитель
 * из профиля города (cities.ts). Обновляйте значения под актуальные тарифы своего города.
 */

interface TariffOptions {
  surgeSensitivity: number;
  etaBaseMin: number;
  spread?: number;
  includedKm?: number;
  includedMin?: number;
}

function tariff(
  rideClass: RideClass,
  name: string,
  code: string,
  [baseFare, perKm, perMin, minFare]: [number, number, number, number],
  { spread = 0.1, ...rest }: TariffOptions,
): Tariff {
  return { rideClass, name, code, baseFare, perKm, perMin, minFare, spread, ...rest };
}

const coord = (n: number) => n.toFixed(6);

/** Ссылка на сайт без маршрута — для агрегаторов без документированных диплинков. */
const websiteLink =
  (url: string) =>
  (): DeepLink => ({ url, prefilled: false });

const placeName = (p: Place, fallback: string) => encodeURIComponent(p.name ?? fallback);

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'yandex',
    name: 'Яндекс Go',
    logo: 'Я',
    color: '#FCE000',
    textColor: '#000000',
    website: 'https://go.yandex/',
    tariffs: [
      tariff('economy', 'Эконом', 'econom', [129, 12, 8, 229], { surgeSensitivity: 1, etaBaseMin: 4, includedKm: 1, includedMin: 2 }),
      tariff('comfort', 'Комфорт', 'business', [199, 17, 11, 349], { surgeSensitivity: 0.9, etaBaseMin: 6, includedKm: 1, includedMin: 2 }),
      tariff('comfortPlus', 'Комфорт+', 'comfortplus', [299, 22, 14, 499], { surgeSensitivity: 0.8, etaBaseMin: 8, includedKm: 1, includedMin: 2 }),
      tariff('business', 'Бизнес', 'vip', [599, 38, 22, 999], { surgeSensitivity: 0.6, etaBaseMin: 10 }),
      tariff('minivan', 'Минивэн', 'minivan', [399, 28, 16, 699], { surgeSensitivity: 0.7, etaBaseMin: 12 }),
    ],
    // https://yandex.ru/dev/taxi/doc/ru/ — универсальная ссылка: откроет приложение или магазин приложений
    deepLink: ({ from, to, tariff: t }: DeepLinkArgs) => ({
      url:
        'https://3.redirect.appmetrica.yandex.com/route' +
        `?start-lat=${coord(from.lat)}&start-lon=${coord(from.lon)}` +
        `&end-lat=${coord(to.lat)}&end-lon=${coord(to.lon)}` +
        `&level=${t.code ?? 'econom'}&ref=uia&appmetrica_tracking_id=1178268795219780156`,
      prefilled: true,
    }),
  },
  {
    id: 'uber',
    name: 'Uber',
    logo: 'U',
    color: '#000000',
    textColor: '#FFFFFF',
    website: 'https://www.uber.com/',
    tariffs: [
      tariff('economy', 'UberX', 'uberx', [139, 12, 8.5, 239], { surgeSensitivity: 1, etaBaseMin: 5, includedKm: 1, includedMin: 2 }),
      tariff('comfort', 'Comfort', 'comfort', [209, 17, 11.5, 369], { surgeSensitivity: 0.9, etaBaseMin: 7, includedKm: 1, includedMin: 2 }),
      tariff('business', 'Black', 'black', [649, 40, 23, 1049], { surgeSensitivity: 0.6, etaBaseMin: 11 }),
      tariff('minivan', 'UberXL', 'xl', [419, 28, 17, 729], { surgeSensitivity: 0.7, etaBaseMin: 12 }),
    ],
    // https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction
    deepLink: ({ from, to }: DeepLinkArgs) => ({
      url:
        'https://m.uber.com/ul/?action=setPickup' +
        `&pickup[latitude]=${coord(from.lat)}&pickup[longitude]=${coord(from.lon)}` +
        `&pickup[nickname]=${placeName(from, 'Откуда')}` +
        `&dropoff[latitude]=${coord(to.lat)}&dropoff[longitude]=${coord(to.lon)}` +
        `&dropoff[nickname]=${placeName(to, 'Куда')}`,
      prefilled: true,
    }),
  },
  {
    id: 'citymobil',
    name: 'Ситимобил',
    logo: 'С',
    color: '#FF6A13',
    textColor: '#FFFFFF',
    website: 'https://city-mobil.ru/',
    tariffs: [
      tariff('economy', 'Эконом', 'economy', [109, 11, 7.5, 199], { surgeSensitivity: 0.8, etaBaseMin: 6, includedKm: 1, includedMin: 2 }),
      tariff('comfort', 'Комфорт', 'comfort', [179, 15, 10, 319], { surgeSensitivity: 0.75, etaBaseMin: 8, includedKm: 1, includedMin: 2 }),
      tariff('business', 'Бизнес', 'business', [549, 34, 20, 899], { surgeSensitivity: 0.5, etaBaseMin: 12 }),
      tariff('minivan', 'Минивэн', 'minivan', [379, 26, 15, 649], { surgeSensitivity: 0.6, etaBaseMin: 14 }),
    ],
    deepLink: websiteLink('https://city-mobil.ru/'),
  },
  {
    id: 'maxim',
    name: 'Такси Максим',
    logo: 'М',
    color: '#E30613',
    textColor: '#FFFFFF',
    website: 'https://taximaxim.ru/',
    tariffs: [
      tariff('economy', 'Эконом', 'economy', [99, 13, 4, 189], { surgeSensitivity: 0.4, etaBaseMin: 7, spread: 0.08 }),
      tariff('comfort', 'Комфорт', 'comfort', [149, 16, 6, 269], { surgeSensitivity: 0.4, etaBaseMin: 9, spread: 0.08 }),
      tariff('minivan', 'Минивэн', 'minivan', [299, 22, 9, 549], { surgeSensitivity: 0.35, etaBaseMin: 14, spread: 0.08 }),
    ],
    deepLink: websiteLink('https://taximaxim.ru/'),
  },
  {
    id: 'indrive',
    name: 'inDrive',
    logo: 'iD',
    color: '#C1F11D',
    textColor: '#141414',
    website: 'https://indrive.com/',
    note: 'Цену предлагаете вы — водитель может согласиться или назвать свою',
    tariffs: [
      tariff('economy', 'Город', 'economy', [90, 11, 6, 170], { surgeSensitivity: 0.3, etaBaseMin: 6, spread: 0.15 }),
      tariff('comfort', 'Комфорт', 'comfort', [140, 15, 8, 260], { surgeSensitivity: 0.3, etaBaseMin: 8, spread: 0.15 }),
    ],
    deepLink: websiteLink('https://indrive.com/'),
  },
  {
    id: 'wheely',
    name: 'Wheely',
    logo: 'W',
    color: '#1B1B1B',
    textColor: '#FFFFFF',
    website: 'https://wheely.com/',
    tariffs: [
      tariff('business', 'Business', 'business', [990, 45, 30, 1990], { surgeSensitivity: 0.3, etaBaseMin: 12, spread: 0.07 }),
    ],
    deepLink: websiteLink('https://wheely.com/'),
  },
];

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export const RIDE_CLASSES: { id: RideClass; label: string }[] = [
  { id: 'economy', label: 'Эконом' },
  { id: 'comfort', label: 'Комфорт' },
  { id: 'comfortPlus', label: 'Комфорт+' },
  { id: 'business', label: 'Бизнес' },
  { id: 'minivan', label: 'Минивэн' },
];

export function rideClassLabel(rideClass: RideClass): string {
  return RIDE_CLASSES.find((c) => c.id === rideClass)?.label ?? rideClass;
}

export function isRideClass(value: unknown): value is RideClass {
  return RIDE_CLASSES.some((c) => c.id === value);
}
