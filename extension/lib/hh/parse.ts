import type { CompanyIn, SyncItem, VacancyUpsertIn } from '../api/types';
import { SEL } from './selectors';
import { readInitialState } from './state';
import { mapHhState, mapHhTags } from './statusMap';
import { idFromHref, parseHhUrl, vacancyUrl } from './url';

export interface VacancyPageData {
  vacancy: VacancyUpsertIn;
  /** hh считает, что пользователь уже откликался (снимок страницы или DOM после отклика). */
  alreadyApplied: boolean;
  archived: boolean;
}

export interface EmployerPageData {
  hhId: string;
  name: string;
}

function text(el: Element | null | undefined): string | null {
  const value = el?.textContent?.replace(/\s+/g, ' ').trim();
  return value ? value : null;
}

function companyFrom(nameEl: Element | null, linkEl: Element | null | undefined): CompanyIn | null {
  const name = text(nameEl);
  if (!name) return null;
  return { hh_id: idFromHref(linkEl?.getAttribute('href'), 'employer'), name };
}

/** Был ли на странице успешный отклик (DOM меняется без перезагрузки, снимок — нет). */
export function hasAppliedMarker(doc: Document = document): boolean {
  return SEL.applied.some((selector) => doc.querySelector(selector) !== null);
}

export function parseVacancyPage(hhId: string, doc: Document = document): VacancyPageData | null {
  const appliedInDom = hasAppliedMarker(doc);
  const state = readInitialState(doc);
  const v = state?.vacancyView?.vacancyFull?.vacancy;

  if (v && String(v.vacancyId) === hhId && v.name) {
    const companyName: string | undefined = v.company?.visibleName || v.company?.name;
    return {
      vacancy: {
        hh_id: hhId,
        title: v.name,
        description: typeof v.description === 'string' ? v.description : null,
        url: vacancyUrl(hhId),
        company: companyName
          ? { hh_id: v.company?.id ? String(v.company.id) : null, name: companyName }
          : null,
      },
      alreadyApplied:
        Boolean(state?.applicantVacancyResponseStatuses?.[hhId]?.alreadyApplied) || appliedInDom,
      archived: Boolean(v.status?.archived),
    };
  }

  // Запасной путь — DOM.
  const title = text(doc.querySelector(SEL.vacancy.title));
  if (!title) return null;
  const companyEl = doc.querySelector(SEL.vacancy.companyName);
  return {
    vacancy: {
      hh_id: hhId,
      title,
      description: doc.querySelector(SEL.vacancy.description)?.innerHTML ?? null,
      url: vacancyUrl(hhId),
      company: companyFrom(companyEl, companyEl?.closest('a') ?? companyEl?.querySelector('a')),
    },
    alreadyApplied: appliedInDom,
    archived: false,
  };
}

/** Карточка вакансии в поисковой выдаче (отклик прямо из выдачи). */
export function parseSerpVacancy(hhId: string, doc: Document = document): VacancyUpsertIn | null {
  for (const item of doc.querySelectorAll(SEL.serp.item)) {
    const titleEl = item.querySelector(SEL.serp.title);
    if (idFromHref(titleEl?.getAttribute('href'), 'vacancy') !== hhId) continue;
    const title = text(titleEl);
    if (!title) return null;
    const employerEl = item.querySelector(SEL.serp.employer);
    return {
      hh_id: hhId,
      title,
      description: null, // в выдаче только сниппет — не затираем полное описание
      url: vacancyUrl(hhId),
      company: companyFrom(item.querySelector(SEL.serp.employerText) ?? employerEl, employerEl),
    };
  }
  return null;
}

/** Ищет данные вакансии на любой странице hh, где она может быть. */
export function findVacancyOnPage(hhId: string, doc: Document = document): VacancyUpsertIn | null {
  const page = parseHhUrl(doc.location?.href);
  if (page.kind === 'vacancy' && page.hhId === hhId) {
    const data = parseVacancyPage(hhId, doc);
    if (data) return data.vacancy;
  }
  return (
    parseSerpVacancy(hhId, doc) ??
    parseNegotiationsPage(false, doc).find((item) => item.vacancy.hh_id === hhId)?.vacancy ??
    null
  );
}

export function parseEmployerPage(hhId: string, doc: Document = document): EmployerPageData | null {
  const info = readInitialState(doc)?.employerInfo;
  if (info && String(info.id) === hhId && info.name) return { hhId, name: info.name };
  const name = text(doc.querySelector(SEL.employer.name)) ?? text(doc.querySelector('h1'));
  return name ? { hhId, name } : null;
}

/**
 * Отклики с текущей страницы «Откликов».
 *
 * @param stateFresh снимок относится к этой странице списка (не было клиентской
 *   пагинации или смены фильтра). Тогда статус и даты точные из снимка, иначе — из DOM.
 */
export function parseNegotiationsPage(stateFresh: boolean, doc: Document = document): SyncItem[] {
  const topicList: unknown = stateFresh
    ? readInitialState(doc)?.applicantNegotiations?.topicList
    : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topics = new Map<string, any>(
    Array.isArray(topicList) ? topicList.map((t) => [String(t.vacancyId), t]) : [],
  );

  const items: SyncItem[] = [];
  for (const el of doc.querySelectorAll(SEL.negotiations.item)) {
    const vacancyLink = el.querySelector('a[href*="/vacancy/"]');
    const hhId = idFromHref(vacancyLink?.getAttribute('href'), 'vacancy');
    if (!hhId) continue;
    const title = text(el.querySelector(SEL.negotiations.vacancy)) ?? text(vacancyLink);
    if (!title) continue;

    const companyEl = el.querySelector(SEL.negotiations.company);
    const company = companyFrom(
      companyEl,
      companyEl?.closest('a') ?? el.querySelector('a[href*="/employer/"]'),
    );

    const topic = topics.get(hhId);
    const status = topic
      ? mapHhState(String(topic.lastState), Boolean(topic.viewedByOpponent))
      : mapHhTags(
          [...el.querySelectorAll(SEL.negotiations.tag)].map((t) => t.getAttribute('data-qa') ?? ''),
        );
    if (!status) continue;

    items.push({
      vacancy: { hh_id: hhId, title, url: vacancyUrl(hhId), company },
      status,
      applied_at: topic?.creationTime ?? parseRuDate(text(el.querySelector(SEL.negotiations.date))),
      changed_at: topic?.lastModified ?? null,
    });
  }
  return items;
}

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** «сегодня», «вчера», «12 ноября», «12 ноября 2025», «12.11.2025» → ISO (полдень по местному времени). */
export function parseRuDate(value: string | null, now: Date = new Date()): string | null {
  if (!value) return null;
  const t = value.toLowerCase();
  const atNoon = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();

  if (t.includes('сегодня')) return atNoon(now.getFullYear(), now.getMonth(), now.getDate());
  if (t.includes('вчера')) return atNoon(now.getFullYear(), now.getMonth(), now.getDate() - 1);

  let m = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return atNoon(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  m = t.match(/(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?/);
  if (m) {
    const month = MONTHS.indexOf(m[2]);
    if (month === -1) return null;
    let year = m[3] ? Number(m[3]) : now.getFullYear();
    // «20 декабря» в январе — это прошлый год.
    if (!m[3] && new Date(year, month, Number(m[1])) > now) year -= 1;
    return atNoon(year, month, Number(m[1]));
  }
  return null;
}
