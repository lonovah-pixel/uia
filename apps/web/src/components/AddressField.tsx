import { useEffect, useId, useRef, useState } from 'react';
import type { GeoPoint, GeocodeResult, Place } from '@uia/core';
import { geocode } from '../api.ts';

interface Option {
  key: string;
  title: string;
  subtitle?: string;
  icon: string;
  place?: Place;
  action?: () => void;
}

interface Props {
  label: string;
  letter: string;
  kind: 'from' | 'to';
  value: Place | null;
  near?: GeoPoint;
  recent: Place[];
  placeholder: string;
  onChange(place: Place | null): void;
  onLocate?(): void;
  locating?: boolean;
}

const toPlace = (r: GeocodeResult): Place => ({
  lat: r.lat,
  lon: r.lon,
  name: r.address ? `${r.name}, ${r.address}` : r.name,
});

export function AddressField({ label, letter, kind, value, near, recent, placeholder, onChange, onLocate, locating }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  // Точку могли выбрать на карте или поменять местами с другой
  useEffect(() => setText(value?.name ?? ''), [value]);

  const query = text.trim();
  const isTyping = open && query.length >= 2 && query !== value?.name;

  useEffect(() => {
    if (!isTyping) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      geocode(query, near, controller.signal)
        .then((r) => {
          setResults(r);
          setError(null);
        })
        .catch((err: Error) => {
          if (err.name !== 'AbortError') setError(err.message);
        })
        .finally(() => setSearching(false));
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isTyping, near]);

  const options: Option[] = isTyping
    ? results.map((r, i) => ({ key: `r${i}`, title: r.name, subtitle: r.address, icon: '📍', place: toPlace(r) }))
    : [
        ...(onLocate ? [{ key: 'locate', title: 'Моё местоположение', icon: '◎', action: onLocate }] : []),
        ...recent.map((p, i) => ({ key: `h${i}`, title: p.name ?? '', icon: '🕘', place: p })),
      ];

  useEffect(() => setActive(0), [options.length, isTyping]);

  function choose(option: Option | undefined) {
    if (!option) return;
    if (option.place) onChange(option.place);
    option.action?.();
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (options.length ? (i + delta + options.length) % options.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setText(value?.name ?? '');
    }
  }

  const showList = open && (options.length > 0 || searching || error || isTyping);

  return (
    <div className={`field field--${kind}`}>
      <span className="field__dot" aria-hidden>
        {letter}
      </span>
      <div className="field__body">
        <label htmlFor={id} className="field__label">
          {label}
        </label>
        <input
          ref={inputRef}
          id={id}
          className="field__input"
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={Boolean(showList)}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={showList && options[active] ? `${id}-${options[active].key}` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onBlur={() => {
            setOpen(false);
            setText(value?.name ?? '');
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {onLocate && (
        <button
          type="button"
          className={`icon-btn ${locating ? 'icon-btn--busy' : ''}`}
          onClick={onLocate}
          aria-label="Определить моё местоположение"
          title="Моё местоположение"
        >
          ◎
        </button>
      )}
      {value && (
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            onChange(null);
            inputRef.current?.focus();
          }}
          aria-label={`Очистить поле «${label}»`}
        >
          ×
        </button>
      )}

      {showList && (
        <ul id={`${id}-list`} role="listbox" className="suggestions">
          {options.map((o, i) => (
            <li
              key={o.key}
              id={`${id}-${o.key}`}
              role="option"
              aria-selected={i === active}
              className={`suggestion ${i === active ? 'suggestion--active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o)}
            >
              <span className="suggestion__icon" aria-hidden>
                {o.icon}
              </span>
              <span className="suggestion__text">
                <span className="suggestion__title">{o.title}</span>
                {o.subtitle && <span className="suggestion__subtitle">{o.subtitle}</span>}
              </span>
            </li>
          ))}
          {searching && <li className="suggestion suggestion--muted">Ищем адрес…</li>}
          {!searching && error && <li className="suggestion suggestion--muted">{error}</li>}
          {!searching && !error && isTyping && results.length === 0 && (
            <li className="suggestion suggestion--muted">Ничего не нашли — попробуйте иначе или отметьте точку на карте</li>
          )}
        </ul>
      )}
    </div>
  );
}
