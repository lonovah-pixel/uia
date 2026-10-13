import { useCallback, useState } from 'react';
import { DEFAULT_VALUE_OF_TIME, EMPTY_API_KEYS, type ApiKeys, type Place, type RideClass, type SortMode } from '@uia/core';

export interface Settings {
  /** Отключённые пользователем агрегаторы (новые агрегаторы включены по умолчанию). */
  disabledProviders: string[];
  valueOfTimePerMin: number;
  sort: SortMode;
  rideClass: RideClass | 'all';
  /** Ключи API агрегаторов — только в мобильном приложении, хранятся на устройстве. */
  apiKeys: ApiKeys;
}

export const DEFAULT_SETTINGS: Settings = {
  disabledProviders: [],
  valueOfTimePerMin: DEFAULT_VALUE_OF_TIME,
  sort: 'best',
  rideClass: 'all',
  apiKeys: EMPTY_API_KEYS,
};

// localStorage может быть недоступен (приватный режим, запрет cookies) — тогда просто не запоминаем
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ничего страшного
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...load<Partial<Settings>>('uia.settings', {}),
  }));

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      save('uia.settings', next);
      return next;
    });
  }, []);

  return [settings, update] as const;
}

const RECENT_LIMIT = 5;

export function useRecentPlaces() {
  const [recent, setRecent] = useState<Place[]>(() => load<Place[]>('uia.recent', []));

  const remember = useCallback((place: Place) => {
    if (!place.name) return;
    setRecent((prev) => {
      const next = [place, ...prev.filter((p) => p.name !== place.name)].slice(0, RECENT_LIMIT);
      save('uia.recent', next);
      return next;
    });
  }, []);

  return [recent, remember] as const;
}
