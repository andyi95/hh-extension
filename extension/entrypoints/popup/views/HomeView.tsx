import { APPLICATION_STATUSES } from '@/lib/api/types';
import { vacancyUrl } from '@/lib/hh/url';
import { callBackground } from '@/lib/messages';
import { ErrorBox, ExternalLink, Loading, Section, StatusBadge } from '../components/common';
import { formatDate } from '../format';
import { useAsync } from '../hooks';

const NEGOTIATIONS_URL = 'https://hh.ru/applicant/negotiations';

export function HomeView() {
  const home = useAsync(() => callBackground('getHome', undefined), []);

  if (home.loading && !home.data) return <Loading />;
  if (home.error || !home.data) return <ErrorBox error={home.error ?? 'Нет данных'} onRetry={home.reload} />;

  const { stats, recent } = home.data;

  return (
    <div class="stack-lg">
      <p class="muted small">
        Откройте вакансию или страницу работодателя на hh.ru — здесь появится её карточка.
      </p>

      <Section title={`Мои отклики (${stats.total})`}>
        {stats.total > 0 && (
          <div class="chips">
            {APPLICATION_STATUSES.filter((s) => stats.by_status[s]).map((status) => (
              <span key={status} class="chip">
                <StatusBadge status={status} /> {stats.by_status[status]}
              </span>
            ))}
          </div>
        )}
        {recent.length === 0 ? (
          <p class="muted">
            Пока пусто. Откликнитесь на вакансию или откройте «Отклики» на hh.ru — расширение подтянет их.
          </p>
        ) : (
          <ul class="list">
            {recent.map((application) => (
              <li key={application.id} class="app-item">
                <ExternalLink href={vacancyUrl(application.vacancy.hh_id)}>{application.vacancy.title}</ExternalLink>
                {application.vacancy.company && <span class="muted small">{application.vacancy.company.name}</span>}
                <div class="row">
                  <StatusBadge status={application.current_status} />
                  <span class="muted small">{formatDate(application.applied_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <ExternalLink href={NEGOTIATIONS_URL} class="btn">
          Открыть «Отклики» на hh.ru
        </ExternalLink>
        <p class="muted small">При открытии «Откликов» статусы обновляются автоматически.</p>
      </Section>
    </div>
  );
}
