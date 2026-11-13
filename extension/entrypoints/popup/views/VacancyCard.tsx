import type { ApplicationDetailOut, ReviewOut, VacancyUpsertIn } from '@/lib/api/types';
import { employerUrl, vacancyUrl } from '@/lib/hh/url';
import { callBackground, type VacancyCard as Card } from '@/lib/messages';
import { ApplicationBlock } from '../components/ApplicationBlock';
import { ErrorBox, ErrorText, ExternalLink, Loading, PublicReviews, RatingLine, Section } from '../components/common';
import { ReviewForm } from '../components/ReviewForm';
import { useAction, useAsync } from '../hooks';

interface Props {
  hhId: string;
  tabId: number | null;
  isRegistered: boolean;
  onRegister: () => void;
}

/** Данные для «Отметить отклик»: со страницы или из каталога. */
function vacancyForApply(card: Card): VacancyUpsertIn | null {
  if (card.page) return card.page.vacancy;
  const v = card.vacancy;
  if (!v) return null;
  return {
    hh_id: v.hh_id,
    title: v.title,
    url: v.url,
    company: v.company ? { hh_id: v.company.hh_id, name: v.company.name } : null,
  };
}

export function VacancyCard({ hhId, tabId, isRegistered, onRegister }: Props) {
  const card = useAsync(() => callBackground('getVacancyCard', { hhId, tabId }), [hhId, tabId]);
  const action = useAction();

  if (card.loading && !card.data) return <Loading />;
  if (card.error || !card.data) return <ErrorBox error={card.error ?? 'Нет данных'} onRetry={card.reload} />;

  const data = card.data;
  const title = data.vacancy?.title ?? data.page?.vacancy.title ?? `Вакансия ${hhId}`;
  const company = data.vacancy?.company ?? data.page?.vacancy.company ?? null;
  const applyData = vacancyForApply(data);

  const setApplication = (application: ApplicationDetailOut | null) => card.setData({ ...data, application });
  const setReview = (myReview: ReviewOut | null) => card.setData({ ...data, myReview });

  const markApplied = async () => {
    if (!applyData) return;
    const application = await action.run(() => callBackground('markApplied', { vacancy: applyData }));
    if (application) setApplication(application);
  };

  return (
    <div class="stack-lg">
      <header class="card-head">
        <ExternalLink href={vacancyUrl(hhId)} class="title">
          {title}
        </ExternalLink>
        {company &&
          (company.hh_id ? (
            <ExternalLink href={employerUrl(company.hh_id)} class="subtitle">
              {company.name}
            </ExternalLink>
          ) : (
            <span class="subtitle">{company.name}</span>
          ))}
        {data.page?.archived && <p class="muted small">Вакансия в архиве</p>}
        <RatingLine rating={data.vacancy?.rating} />
      </header>

      <Section title="Мой отклик">
        {data.application ? (
          <ApplicationBlock
            application={data.application}
            onChange={setApplication}
            onDeleted={() => setApplication(null)}
          />
        ) : (
          <div class="stack">
            <p class="muted">
              {data.page?.alreadyApplied
                ? 'hh.ru показывает, что вы уже откликались, но в трекере отклика нет.'
                : 'Отклик появится здесь сам, когда вы откликнетесь на hh.ru.'}
            </p>
            <button
              type="button"
              class="btn"
              disabled={!applyData || action.busy}
              title={applyData ? undefined : 'Обновите страницу вакансии'}
              onClick={markApplied}
            >
              Отметить отклик вручную
            </button>
            <ErrorText error={action.error} />
          </div>
        )}
      </Section>

      <Section title="Мой отзыв">
        {data.vacancy ? (
          <ReviewForm
            key={data.myReview?.id ?? 'new'}
            vacancyHhId={hhId}
            review={data.myReview}
            isRegistered={isRegistered}
            onChange={setReview}
            onRegister={onRegister}
          />
        ) : (
          <p class="muted small">Обновите страницу вакансии, чтобы оставить отзыв.</p>
        )}
      </Section>

      <Section title={`Отзывы других (${data.publicReviews.total})`}>
        <PublicReviews page={data.publicReviews} />
      </Section>
    </div>
  );
}
