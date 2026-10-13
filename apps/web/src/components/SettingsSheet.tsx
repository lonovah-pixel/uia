import { useEffect, useRef } from 'react';
import type { ProviderSummary } from '@uia/core';
import { DEFAULT_SETTINGS, type Settings } from '../storage.ts';
import { ProviderLogo } from './QuoteCard.tsx';

interface Props {
  open: boolean;
  settings: Settings;
  providers: ProviderSummary[];
  onChange(patch: Partial<Settings>): void;
  onClose(): void;
}

export function SettingsSheet({ open, settings, providers, onChange, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const toggle = (id: string) => {
    const disabled = settings.disabledProviders.includes(id)
      ? settings.disabledProviders.filter((p) => p !== id)
      : [...settings.disabledProviders, id];
    onChange({ disabledProviders: disabled });
  };

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="settings-title"
    >
      <div className="sheet__content">
        <header className="sheet__header">
          <h2 id="settings-title">Настройки</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <section>
          <h3>Сервисы такси</h3>
          <p className="muted">Отключите сервисы, которыми не пользуетесь, — они не будут участвовать в сравнении.</p>
          <ul className="toggles">
            {providers.map((p) => (
              <li key={p.id}>
                <label className="toggle">
                  <ProviderLogo provider={p} name={p.name} size={32} />
                  <span className="toggle__text">
                    <span>{p.name}</span>
                    <span className="muted small">{p.live ? 'реальные цены по API' : 'оценка по тарифам'}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={!settings.disabledProviders.includes(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Сколько стоит ваше время</h3>
          <p className="muted">
            При выборе самого выгодного варианта каждая минута ожидания машины прибавляется к цене. Так дешёвое такси
            через 20 минут не обгонит чуть более дорогое через 3 минуты. Поставьте 0, чтобы выбирать только по цене.
          </p>
          <label className="range">
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={settings.valueOfTimePerMin}
              onChange={(e) => onChange({ valueOfTimePerMin: Number(e.target.value) })}
            />
            <output>{settings.valueOfTimePerMin} ₽ за минуту</output>
          </label>
        </section>

        <footer className="sheet__footer">
          <button type="button" className="btn btn--ghost" onClick={() => onChange(DEFAULT_SETTINGS)}>
            Сбросить
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Готово
          </button>
        </footer>
      </div>
    </dialog>
  );
}
