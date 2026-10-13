import type { Quote } from './types.ts';

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

const CURRENCY_SYMBOLS: Record<string, string> = { RUB: '₽', USD: '$', EUR: '€', KZT: '₸' };

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

export function formatMoney(amount: number, currency: string): string {
  return `${numberFormat.format(amount)}\u00a0${currencySymbol(currency)}`;
}

/** «350 ₽» для цены агрегатора, «≈ 340–410 ₽» для оценки. */
export function formatPrice(q: Pick<Quote, 'priceMin' | 'priceMax' | 'price' | 'priceKind' | 'currency'>): string {
  const symbol = currencySymbol(q.currency);
  if (q.priceKind === 'live' && q.priceMin === q.priceMax) return formatMoney(q.price, q.currency);
  const range =
    q.priceMin === q.priceMax
      ? numberFormat.format(q.priceMin)
      : `${numberFormat.format(q.priceMin)}–${numberFormat.format(q.priceMax)}`;
  return `${q.priceKind === 'estimate' ? '≈\u00a0' : ''}${range}\u00a0${symbol}`;
}

export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}\u00a0мин`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}\u00a0ч` : `${h}\u00a0ч ${m}\u00a0мин`;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}\u00a0м`;
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)}\u00a0км`;
}
