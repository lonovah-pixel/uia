import { formatMinutes, formatMoney, formatPrice, type Badge, type ProviderSummary, type RankedQuote } from '@uia/core';

const BADGE_LABELS: Record<Badge, string> = {
  best: 'Самый выгодный',
  cheapest: 'Дешевле всех',
  fastest: 'Быстрее всех',
};

export function ProviderLogo({ provider, name, size = 40 }: { provider?: ProviderSummary; name: string; size?: number }) {
  return (
    <span
      className="logo"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: provider?.color ?? '#888',
        color: provider?.textColor ?? '#fff',
      }}
      aria-hidden
    >
      {provider?.logo ?? name.slice(0, 1)}
    </span>
  );
}

function OrderButton({ quote, wide }: { quote: RankedQuote; wide?: boolean }) {
  return (
    <a
      className={`btn btn--order ${wide ? 'btn--wide' : ''}`}
      href={quote.deepLink.url}
      target="_blank"
      rel="noopener noreferrer"
      title={quote.deepLink.prefilled ? 'Маршрут уже будет указан' : 'Маршрут нужно будет ввести в приложении'}
    >
      {wide ? `Заказать в ${quote.providerName}` : 'Заказать'}
    </a>
  );
}

function PriceKind({ quote }: { quote: RankedQuote }) {
  return quote.priceKind === 'live' ? (
    <span className="kind kind--live" title="Цена получена от сервиса">
      цена сервиса
    </span>
  ) : (
    <span className="kind" title="Оценка по тарифам сервиса — итоговая цена в приложении">
      оценка
    </span>
  );
}

export function QuoteCard({ quote, provider }: { quote: RankedQuote; provider?: ProviderSummary }) {
  return (
    <li className={`quote ${quote.badges.includes('best') ? 'quote--best' : ''}`}>
      <ProviderLogo provider={provider} name={quote.providerName} />
      <div className="quote__main">
        <div className="quote__title">
          <span className="quote__provider">{quote.providerName}</span>
          <span className="quote__tariff">{quote.tariffName}</span>
        </div>
        <div className="quote__meta">
          подача {formatMinutes(quote.etaMin)} · в пути {formatMinutes(quote.tripMin)}
        </div>
        {(quote.badges.length > 0 || quote.surge > 1) && (
          <div className="quote__badges">
            {quote.badges.map((b) => (
              <span key={b} className={`badge badge--${b}`}>
                {BADGE_LABELS[b]}
              </span>
            ))}
            {quote.surge > 1 && (
              <span className="badge badge--surge" title="Повышенный спрос">
                ⚡ ×{quote.surge.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
        )}
        {!quote.deepLink.prefilled && <div className="quote__hint">Маршрут нужно будет указать в приложении</div>}
      </div>
      <div className="quote__side">
        <div className="quote__price">{formatPrice(quote)}</div>
        <PriceKind quote={quote} />
        <OrderButton quote={quote} />
      </div>
    </li>
  );
}

interface BestProps {
  quote: RankedQuote;
  provider?: ProviderSummary;
  /** На сколько дешевле самого дорогого варианта того же класса. */
  savings: number;
  classLabel: string;
}

export function BestCard({ quote, provider, savings, classLabel }: BestProps) {
  return (
    <section className="best" aria-label="Самый выгодный вариант">
      <div className="best__eyebrow">Самый выгодный вариант</div>
      <div className="best__row">
        <ProviderLogo provider={provider} name={quote.providerName} size={52} />
        <div className="best__info">
          <div className="best__title">
            {quote.providerName} · {quote.tariffName}
          </div>
          <div className="best__meta">
            подача {formatMinutes(quote.etaMin)} · в пути {formatMinutes(quote.tripMin)}
          </div>
        </div>
      </div>
      <div className="best__price">
        {formatPrice(quote)}
        <PriceKind quote={quote} />
      </div>
      {savings > 0 && (
        <div className="best__savings">
          Экономия до {formatMoney(savings, quote.currency)} по сравнению с другими сервисами в классе «{classLabel}»
        </div>
      )}
      {quote.note && <div className="best__note">{quote.note}</div>}
      <OrderButton quote={quote} wide />
    </section>
  );
}
