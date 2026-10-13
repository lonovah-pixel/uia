export interface LocalTime {
  /** Час с дробной частью, 0 ≤ hour < 24. */
  hour: number;
  /** День недели: 0 — воскресенье … 6 — суббота. */
  weekday: number;
}

export function localTime(date: Date, tzOffsetMin: number): LocalTime {
  const shifted = new Date(date.getTime() + tzOffsetMin * 60_000);
  return {
    hour: shifted.getUTCHours() + shifted.getUTCMinutes() / 60,
    weekday: shifted.getUTCDay(),
  };
}

// Типичный спрос на такси по часам (1 — обычный уровень).
// prettier-ignore
const WEEKDAY_DEMAND = [
  1.10, 1.05, 1.00, 1.00, 1.00, 1.00, 1.05, 1.25, 1.45, 1.35, 1.15, 1.00,
  1.00, 1.00, 1.00, 1.05, 1.15, 1.35, 1.50, 1.40, 1.20, 1.10, 1.10, 1.15,
];
// prettier-ignore
const WEEKEND_DEMAND = [
  1.35, 1.40, 1.35, 1.20, 1.05, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.05,
  1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.10, 1.15, 1.15, 1.20, 1.25, 1.30,
];

// Насколько пробки удлиняют поездку по сравнению со свободной дорогой (для Москвы).
// prettier-ignore
const WEEKDAY_TRAFFIC = [
  1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.10, 1.40, 1.70, 1.60, 1.35, 1.25,
  1.25, 1.25, 1.25, 1.30, 1.45, 1.65, 1.75, 1.60, 1.35, 1.20, 1.10, 1.05,
];
// prettier-ignore
const WEEKEND_TRAFFIC = [
  1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.05, 1.10, 1.15, 1.20,
  1.25, 1.25, 1.25, 1.25, 1.25, 1.25, 1.25, 1.20, 1.15, 1.10, 1.05, 1.00,
];

function interpolate(profile: number[], hour: number): number {
  const i = Math.floor(hour) % 24;
  const next = (i + 1) % 24;
  const t = hour - Math.floor(hour);
  return profile[i]! * (1 - t) + profile[next]! * t;
}

const isWeekend = (weekday: number) => weekday === 0 || weekday === 6;

/** Уровень спроса: 1 — обычный, 1.5 — час пик. */
export function demandLevel(t: LocalTime): number {
  if (isWeekend(t.weekday)) return interpolate(WEEKEND_DEMAND, t.hour);
  const weekday = interpolate(WEEKDAY_DEMAND, t.hour);
  // Вечер пятницы — как ночь выходного дня
  if (t.weekday === 5 && t.hour >= 20) return Math.max(weekday, interpolate(WEEKEND_DEMAND, t.hour));
  return weekday;
}

/** Множитель ко времени в пути без пробок. trafficLevel — загруженность города относительно Москвы. */
export function trafficFactor(t: LocalTime, trafficLevel: number): number {
  const base = interpolate(isWeekend(t.weekday) ? WEEKEND_TRAFFIC : WEEKDAY_TRAFFIC, t.hour);
  return 1 + (base - 1) * trafficLevel;
}

/** Коэффициент повышенного спроса для тарифа, округлённый до 0.05. */
export function surgeFor(demand: number, sensitivity: number): number {
  const raw = 1 + Math.max(0, demand - 1) * sensitivity;
  return Math.round(raw * 20) / 20;
}
