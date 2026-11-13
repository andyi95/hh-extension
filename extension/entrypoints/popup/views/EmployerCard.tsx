import { useState } from 'preact/hooks';
import type { PublicReviewOut } from '@/lib/api/types';
import { employerUrl, vacancyUrl } from '@/lib/hh/url';
import { callBackground } from '@/lib/messages';
import { ErrorBox, ErrorText, ExternalLink, Loading, PublicReviews, RatingLine, Section, StatusBadge } from '../components/common';
import { formatDate } from '../format';
import { useAction, useAsync } from '../hooks';

export function EmployerCard({ hhId, tabId }: { hhId: string; tabId: number | null }) {
  const card = useAsync(
    () => callBackground('getEmployerCard', { hhId, tabId, reviewsOffset: 0 }),
    [hhId, tabId],
  );
  const more = useAction();
  const [extraReviews, setExtraReviews] = useState<PublicReviewOut[]>([]);

  if (card.loading && !card.data) return <Loading />;
  if (card.error || !card.data) return <ErrorBox error={card.error ?? 'Нет данных'} onRetry={card.reload} />;

  const data = card.data;
  const reviews = { ...data.publicReviews, items: [...data.publicReviews.items, ...extraReviews] };

  const loadMore = async () => {
    const next = await more.run(() =>
      callBackground('getEmployerCard', { hhId, tabId, reviewsOffset: reviews.items.length }),
    );
    if (next) setExtraReviews([...extraReviews, ...next.publicReviews.items]);
  };

  return (
    <div class="stack-lg">
      <header class="card-head">
        <ExternalLink href={employerUrl(hhId)} class="title">
          {data.name}
        </ExternalLink>
        <RatingLine rating={data.company?.rating} />
      </header>

      <Section title={`Мои отклики (${data.applications.total})`}>
        {data.applications.items.length === 0 ? (
          <p class="muted">Вы ещё не откликались в эту компанию</p>
        ) : (
          <ul class="list">
            {data.applications.items.map((application) => (
              <li key={application.id} class="app-item">
                <ExternalLink href={vacancyUrl(application.vacancy.hh_id)}>{application.vacancy.title}</ExternalLink>
                <div class="row">
                  <StatusBadge status={application.current_status} />
                  <span class="muted small">{formatDate(application.applied_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Отзывы о вакансиях компании (${reviews.total})`}>
        <PublicReviews page={reviews} showVacancy onMore={loadMore} loadingMore={more.busy} />
        <ErrorText error={more.error} />
      </Section>
    </div>
  );
}
