import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RIDE_CLASSES,
  formatDistance,
  formatMinutes,
  rankQuotes,
  rideClassLabel,
  type GeoPoint,
  type GeocodeResult,
  type Place,
  type ProviderSummary,
  type QuoteResponse,
  type SortMode,
} from '@uia/core';
import { BackendContext, STANDALONE, createLocalBackend, serverBackend } from './backend.ts';
import { AddressField } from './components/AddressField.tsx';
import { MapView } from './components/MapView.tsx';
import { BestCard, ProviderLogo, QuoteCard } from './components/QuoteCard.tsx';
import { SettingsSheet } from './components/SettingsSheet.tsx';
import { useRecentPlaces, useSettings } from './storage.ts';

const REFRESH_MS = 60_000;

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'best', label: 'Выгоднее' },
  { id: 'price', label: 'Дешевле' },
  { id: 'eta', label: 'Быстрее' },
];

const placeLabel = (r: GeocodeResult) => (r.address ? `${r.name}, ${r.address}` : r.name);
const samePoint = (a: GeoPoint | null, b: GeoPoint) => a !== null && a.lat === b.lat && a.lon === b.lon;
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export function App() {
  const [settings, updateSettings] = useSettings();
  // В APK сервера нет: цены, маршрут и адреса считаются на устройстве с ключами из настроек
  const backend = useMemo(
    () => (STANDALONE ? createLocalBackend(settings.apiKeys) : serverBackend),
    [settings.apiKeys],
  );
  const [recent, remember] = useRecentPlaces();
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [data, setData] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    backend
      .providers()
      .then(setProviders)
      .catch(() => setProviders([]));
  }, [backend]);

  // Кнопка «Назад» в Android-приложении сначала закрывает настройки
  useEffect(() => {
    window.__uiaBack = () => {
      if (!settingsOpen) return false;
      setSettingsOpen(false);
      return true;
    };
    return () => {
      delete window.__uiaBack;
    };
  }, [settingsOpen]);

  /** Ставит точку, а название подтягивает по координатам. */
  const setPoint = useCallback(
    async (kind: 'from' | 'to', point: GeoPoint, knownName?: string) => {
      const set = kind === 'from' ? setFrom : setTo;
      set(knownName ? { ...point, name: knownName } : point);
      const result = await backend.reverse(point).catch(() => null);
      const name = result ? placeLabel(result) : (knownName ?? 'Точка на карте');
      set((prev) => (samePoint(prev, point) ? { ...point, name } : prev));
    },
    [backend],
  );

  const locate = useCallback(
    (silent = false) => {
      if (!('geolocation' in navigator)) {
        if (!silent) setNotice('Браузер не умеет определять местоположение — укажите адрес вручную');
        return;
      }
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          setNotice(null);
          void setPoint('from', { lat: pos.coords.latitude, lon: pos.coords.longitude }, 'Моё местоположение');
        },
        (err) => {
          setLocating(false);
          if (silent) return;
          setNotice(
            err.code === err.PERMISSION_DENIED
              ? 'Доступ к геопозиции запрещён — укажите адрес вручную или отметьте точку на карте'
              : 'Не удалось определить местоположение',
          );
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    },
    [setPoint],
  );

  // Как в обычных приложениях такси: при запуске подставляем текущее местоположение (один раз)
  const autoLocated = useRef(false);
  useEffect(() => {
    if (autoLocated.current) return;
    autoLocated.current = true;
    if (!navigator.permissions) return locate(true);
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => status.state !== 'denied' && locate(true))
      .catch(() => locate(true));
  }, [locate]);

  // Цены запрашиваем при смене координат; смена одного лишь названия точки запрос не повторяет
  const routeKey = from && to ? `${from.lat},${from.lon};${to.lat},${to.lon}` : null;
  const places = useRef({ from, to });
  places.current = { from, to };
  const lastRouteKey = useRef<string | null>(null);

  useEffect(() => {
    if (lastRouteKey.current !== routeKey) setData(null);
    lastRouteKey.current = routeKey;
    if (!routeKey) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    backend
      .quotes(places.current.from!, places.current.to!, controller.signal)
      .then(setData)
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [routeKey, refreshTick, backend]);

  // Цены меняются каждую минуту — обновляем, пока приложение на экране
  useEffect(() => {
    if (!routeKey) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setRefreshTick((t) => t + 1);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [routeKey]);

  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);

  const availableClasses = useMemo(() => {
    const present = new Set(data?.quotes.map((q) => q.rideClass));
    return RIDE_CLASSES.filter((c) => present.has(c.id));
  }, [data]);

  const visible = useMemo(
    () =>
      (data?.quotes ?? []).filter(
        (q) =>
          !settings.disabledProviders.includes(q.providerId) &&
          (settings.rideClass === 'all' || q.rideClass === settings.rideClass),
      ),
    [data, settings.disabledProviders, settings.rideClass],
  );

  const ranked = useMemo(
    () => rankQuotes(visible, { sort: settings.sort, valueOfTimePerMin: settings.valueOfTimePerMin }),
    [visible, settings.sort, settings.valueOfTimePerMin],
  );

  const best = ranked.quotes.find((q) => q.id === ranked.summary.bestId);
  const savings = useMemo(() => {
    if (!best) return 0;
    const sameClass = visible.filter((q) => q.rideClass === best.rideClass && q.currency === best.currency);
    return Math.max(...sameClass.map((q) => q.price)) - best.price;
  }, [best, visible]);

  const choose = (kind: 'from' | 'to') => (place: Place | null) => {
    (kind === 'from' ? setFrom : setTo)(place);
    if (place) remember(place);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const fieldPlaceholder = (place: Place | null, fallback: string) =>
    place && !place.name ? 'Определяем адрес…' : fallback;

  return (
    <BackendContext.Provider value={backend}>
      <div className="app">
        <div className="map-wrap">
          <MapView
            from={from}
            to={to}
            geometry={data?.route.geometry}
            onPick={(point) => void setPoint(from ? 'to' : 'from', point)}
            onMove={(kind, point) => void setPoint(kind, point)}
          />
        </div>

        <main className="panel">
          <header className="panel__header">
            <div>
              <h1 className="title">Такси всё в одном</h1>
              <p className="subtitle">Сравниваем цены всех сервисов и находим самый выгодный тариф</p>
            </div>
            <button type="button" className="icon-btn icon-btn--lg" onClick={() => setSettingsOpen(true)} aria-label="Настройки">
              ⚙
            </button>
          </header>

          <div className="route-form">
            <AddressField
              kind="from"
              letter="А"
              label="Откуда"
              placeholder={fieldPlaceholder(from, 'Адрес подачи')}
              value={from}
              near={from ?? undefined}
              recent={recent}
              onChange={choose('from')}
              onLocate={() => locate()}
              locating={locating}
            />
            <button type="button" className="swap" onClick={swap} aria-label="Поменять местами откуда и куда" disabled={!from && !to}>
              ⇅
            </button>
            <AddressField
              kind="to"
              letter="Б"
              label="Куда"
              placeholder={fieldPlaceholder(to, 'Куда едем?')}
              value={to}
              near={from ?? undefined}
              recent={recent}
              onChange={choose('to')}
            />
          </div>

          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}

          {!routeKey && (
            <section className="empty">
              <p>
                Укажите, куда едем, — сравним цены во всех сервисах сразу и покажем самый выгодный вариант. Точки можно
                отметить прямо на карте.
              </p>
              <ul className="empty__logos" aria-label="Сервисы, которые мы сравниваем">
                {providers.map((p) => (
                  <li key={p.id} title={p.name}>
                    <ProviderLogo provider={p} name={p.name} size={36} />
                    <span>{p.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {routeKey && error && (
            <div className="error" role="alert">
              <p>{error}</p>
              <button type="button" className="btn btn--ghost" onClick={() => setRefreshTick((t) => t + 1)}>
                Повторить
              </button>
            </div>
          )}

          {routeKey && !data && loading && (
            <ul className="skeleton" aria-label="Загружаем цены">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} />
              ))}
            </ul>
          )}

          {data && (
            <>
              <div className="route-info">
                <span>
                  {formatDistance(data.route.distanceKm)} · {formatMinutes(data.route.durationMin)} в пути · {data.city.name}
                </span>
                <button
                  type="button"
                  className={`refresh ${loading ? 'refresh--busy' : ''}`}
                  onClick={() => setRefreshTick((t) => t + 1)}
                  aria-label="Обновить цены"
                  title={`Обновлено в ${timeLabel(data.generatedAt)}`}
                >
                  ↻ {timeLabel(data.generatedAt)}
                </button>
              </div>

              {best && (
                <BestCard
                  quote={best}
                  provider={providerById.get(best.providerId)}
                  savings={savings}
                  classLabel={rideClassLabel(best.rideClass)}
                />
              )}

              <div className="controls">
                <div className="segmented" role="radiogroup" aria-label="Сортировка">
                  {SORTS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={settings.sort === s.id}
                      className={settings.sort === s.id ? 'active' : ''}
                      onClick={() => updateSettings({ sort: s.id })}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="chips" role="radiogroup" aria-label="Класс автомобиля">
                  {[{ id: 'all' as const, label: 'Все классы' }, ...availableClasses].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={settings.rideClass === c.id}
                      className={`chip ${settings.rideClass === c.id ? 'chip--active' : ''}`}
                      onClick={() => updateSettings({ rideClass: c.id })}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {ranked.quotes.length > 0 ? (
                <ul className="quotes">
                  {ranked.quotes.map((q) => (
                    <QuoteCard key={q.id} quote={q} provider={providerById.get(q.providerId)} />
                  ))}
                </ul>
              ) : (
                <p className="muted center">Нет предложений с такими фильтрами — выберите другой класс или включите сервисы в настройках.</p>
              )}

              {data.warnings.length > 0 && (
                <ul className="warnings">
                  {data.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}

              <p className="disclaimer">
                «≈» — оценка по тарифам сервиса с учётом времени суток и пробок; итоговую цену покажет приложение
                сервиса при заказе. «Цена сервиса» получена напрямую из API агрегатора.
              </p>
            </>
          )}
        </main>

        <SettingsSheet
          open={settingsOpen}
          settings={settings}
          providers={providers}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      </div>
    </BackendContext.Provider>
  );
}
