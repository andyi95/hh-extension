import type { ComponentChildren } from 'preact';
import { STATUS_LABELS, type ApplicationStatus, type Page, type PublicReviewOut, type RatingSummary } from '@/lib/api/types';
import { vacancyUrl } from '@/lib/hh/url';
import { formatDate, plural } from '../format';

export function Section(props: { title: string; aside?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="section">
      <div class="section-head">
        <h2>{props.title}</h2>
        {props.aside}
      </div>
      {props.children}
    </section>
  );
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <span class={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function Stars(props: { value: number; onChange?: (value: number) => void; disabled?: boolean }) {
  return (
    <span class="stars" role={props.onChange ? 'radiogroup' : undefined} aria-label={`Оценка ${props.value} из 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        props.onChange ? (
          <button
            type="button"
            key={n}
            class={n <= props.value ? 'star on' : 'star'}
            aria-label={`${n} из 5`}
            aria-checked={n === props.value}
            role="radio"
            disabled={props.disabled}
            onClick={() => props.onChange?.(n)}
          >
            ★
          </button>
        ) : (
          <span key={n} class={n <= Math.round(props.value) ? 'star on' : 'star'} aria-hidden="true">
            ★
          </span>
        ),
      )}
    </span>
  );
}

export function RatingLine({ rating }: { rating: RatingSummary | null | undefined }) {
  if (!rating || rating.count === 0 || rating.average === null) {
    return <p class="muted">Отзывов пользователей пока нет</p>;
  }
  return (
    <p class="rating-line">
      <Stars value={rating.average} />
      <strong>{rating.average.toFixed(1)}</strong>
      <span class="muted">
        · {rating.count} {plural(rating.count, 'отзыв', 'отзыва', 'отзывов')}
      </span>
    </p>
  );
}

export function ErrorText({ error }: { error: string | null | undefined }) {
  return error ? <p class="error">{error}</p> : null;
}

export function Loading() {
  return <p class="muted center">Загрузка…</p>;
}

export function ErrorBox(props: { error: string; onRetry?: () => void }) {
  return (
    <div class="error-box">
      <p>{props.error}</p>
      {props.onRetry && (
        <button type="button" class="btn" onClick={props.onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

export function ExternalLink(props: { href: string; children: ComponentChildren; class?: string }) {
  return (
    <a href={props.href} target="_blank" rel="noreferrer" class={props.class}>
      {props.children}
    </a>
  );
}

/** Публичные отзывы — без автора. */
export function PublicReviews(props: {
  page: Page<PublicReviewOut>;
  showVacancy?: boolean;
  onMore?: () => void;
  loadingMore?: boolean;
}) {
  if (props.page.items.length === 0) return <p class="muted">Пока никто не оставил публичный отзыв</p>;
  return (
    <>
      <ul class="list">
        {props.page.items.map((review) => (
          <li key={review.id} class="review">
            <div class="review-head">
              <Stars value={review.rating} />
              <span class="muted">{formatDate(review.created_at)}</span>
            </div>
            {props.showVacancy && (
              <ExternalLink href={vacancyUrl(review.vacancy.hh_id)} class="small">
                {review.vacancy.title}
              </ExternalLink>
            )}
            {review.text && <p class="review-text">{review.text}</p>}
          </li>
        ))}
      </ul>
      {props.onMore && props.page.items.length < props.page.total && (
        <button type="button" class="btn btn-ghost" disabled={props.loadingMore} onClick={props.onMore}>
          Показать ещё
        </button>
      )}
    </>
  );
}
