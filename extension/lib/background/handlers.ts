import { browser, type Browser } from 'wxt/browser';
import { Api, orNull } from '../api/client';
import { ApiError, NetworkError } from '../api/http';
import type { Page, PublicReviewOut, VacancyDetailOut, VacancyUpsertIn } from '../api/types';
import { authItem, deviceLabel, noticeItem, registerDevice, registeredItem, saveTokens } from '../auth';
import type { EmployerPageData, VacancyPageData } from '../hh/parse';
import { isHhHost } from '../hh/url';
import {
  callContent,
  isRpcMessage,
  type ContentToBackgroundRpc,
  type PageData,
  type PopupRpc,
  type RpcResponse,
} from '../messages';
import { flushPending, recordApplication, recordSync } from './tracking';

const EMPTY_PAGE: Page<PublicReviewOut> = { items: [], total: 0 };

/** Данные страницы из content script; если его нет во вкладке (открыта до установки) — внедряем. */
async function getPageData(tabId: number): Promise<PageData | null> {
  try {
    return await callContent(tabId, 'getPageData', undefined);
  } catch {
    try {
      await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/hh.js'] });
      return await callContent(tabId, 'getPageData', undefined);
    } catch {
      return null;
    }
  }
}

async function vacancyPageData(tabId: number | null, hhId: string): Promise<VacancyPageData | null> {
  if (tabId === null) return null;
  const page = await getPageData(tabId);
  return page?.kind === 'vacancy' && page.hhId === hhId ? page.data : null;
}

async function employerPageData(tabId: number | null, hhId: string): Promise<EmployerPageData | null> {
  if (tabId === null) return null;
  const page = await getPageData(tabId);
  return page?.kind === 'employer' && page.hhId === hhId ? page.data : null;
}

/** Нужно ли обновить вакансию в каталоге данными со страницы. */
function needsUpsert(stored: VacancyDetailOut | null, fromPage: VacancyUpsertIn): boolean {
  if (!stored) return true;
  if (stored.title !== fromPage.title) return true;
  if (!stored.description && fromPage.description) return true;
  const pageCompany = fromPage.company?.hh_id;
  return Boolean(pageCompany && stored.company?.hh_id !== pageCompany);
}

type Handlers<R extends Record<string, { req: unknown; res: unknown }>, Ctx> = {
  [K in keyof R]: (payload: R[K]['req'], ctx: Ctx) => Promise<R[K]['res']>;
};

const popupHandlers: Handlers<PopupRpc, void> = {
  async getSession() {
    const user = await Api.me();
    await registeredItem.setValue(user.is_registered);
    // popup открыт — хороший момент дослать очередь
    flushPending().catch((error) => console.warn('[HH Tracker] Очередь не отправлена', error));
    return { user, notice: await noticeItem.getValue() };
  },

  async dismissNotice() {
    await noticeItem.removeValue();
    return null;
  },

  async register({ email, password, displayName }) {
    const user = await Api.register({ email, password, display_name: displayName || null });
    await registeredItem.setValue(true);
    return user;
  },

  async login({ email, password }) {
    const tokens = await Api.login({ email, password, device_label: deviceLabel() });
    await saveTokens(tokens);
    await registeredItem.setValue(true);
    await noticeItem.removeValue();
    return Api.me();
  },

  async logout() {
    await Api.logout();
    await authItem.removeValue();
    await registerDevice(); // дальше трекинг идёт от нового анонимного устройства
    return Api.me();
  },

  async getVacancyCard({ hhId, tabId }) {
    const page = await vacancyPageData(tabId, hhId);
    let vacancy = await orNull(Api.getVacancy(hhId));
    if (page && needsUpsert(vacancy, page.vacancy)) {
      await Api.putVacancy(page.vacancy);
      vacancy = await orNull(Api.getVacancy(hhId));
    }

    const [applications, reviews, publicReviews] = await Promise.all([
      Api.listApplications({ vacancy_hh_id: hhId, limit: 1 }),
      Api.listReviews({ vacancy_hh_id: hhId, limit: 1 }),
      vacancy ? Api.vacancyReviews(hhId, 5, 0) : Promise.resolve(EMPTY_PAGE),
    ]);
    const first = applications.items[0];
    return {
      vacancy,
      page,
      application: first ? await Api.getApplication(first.id) : null,
      myReview: reviews.items[0] ?? null,
      publicReviews,
    };
  },

  async getEmployerCard({ hhId, tabId, reviewsOffset }) {
    const [page, company, applications] = await Promise.all([
      employerPageData(tabId, hhId),
      orNull(Api.getCompany(hhId)),
      Api.listApplications({ company_hh_id: hhId, limit: 20 }),
    ]);
    return {
      hhId,
      name: company?.name ?? page?.name ?? `Работодатель ${hhId}`,
      company,
      applications,
      publicReviews: company ? await Api.companyReviews(hhId, 5, reviewsOffset) : EMPTY_PAGE,
    };
  },

  async getHome() {
    const [stats, recent] = await Promise.all([Api.stats(), Api.listApplications({ limit: 5 })]);
    return { stats, recent: recent.items };
  },

  async markApplied({ vacancy }) {
    return Api.createApplication({ vacancy });
  },

  async deleteApplication({ applicationId }) {
    await Api.deleteApplication(applicationId);
    return null;
  },

  async addStatus({ applicationId, status, comment }) {
    await Api.addStatus(applicationId, { status, comment });
    return Api.getApplication(applicationId);
  },

  async deleteStatus({ applicationId, statusId }) {
    await Api.deleteStatus(applicationId, statusId);
    return Api.getApplication(applicationId);
  },

  async updateCoverLetter({ applicationId, coverLetter }) {
    return Api.updateApplication(applicationId, { cover_letter: coverLetter });
  },

  async saveReview({ reviewId, vacancyHhId, rating, text, isPublic }) {
    return reviewId === null
      ? Api.createReview({ vacancy_hh_id: vacancyHhId, rating, text, is_public: isPublic })
      : Api.updateReview(reviewId, { rating, text, is_public: isPublic });
  },

  async deleteReview({ reviewId }) {
    await Api.deleteReview(reviewId);
    return null;
  },
};

const contentHandlers: Handlers<ContentToBackgroundRpc, { tabId: number }> = {
  async reportApplied({ vacancy, coverLetter }) {
    await recordApplication(vacancy, coverLetter);
    return null;
  },

  async syncNegotiations({ items }) {
    return recordSync(items.slice(0, 100));
  },
};

function serializeError(error: unknown): { error: string; status?: number } {
  if (error instanceof ApiError) return { error: error.message, status: error.status };
  if (error instanceof NetworkError) return { error: error.message, status: 0 };
  return { error: error instanceof Error ? error.message : String(error) };
}

const EXTENSION_ORIGIN = `chrome-extension://${browser.runtime.id}`;

/**
 * Роутер сообщений. Операции popup принимаются только со страниц расширения,
 * операции content script — только из вкладок hh.ru.
 */
export function handleMessage(
  message: unknown,
  sender: Browser.runtime.MessageSender,
  sendResponse: (response: RpcResponse<unknown>) => void,
): boolean {
  if (sender.id !== browser.runtime.id || !isRpcMessage(message)) return false;

  let run: (() => Promise<unknown>) | null = null;
  const fromExtensionPage = !sender.tab && (sender.url ?? '').startsWith(EXTENSION_ORIGIN);
  const tabId = sender.tab?.id;
  let fromHhTab = false;
  try {
    fromHhTab = tabId !== undefined && isHhHost(new URL(sender.url ?? '').hostname);
  } catch {
    fromHhTab = false;
  }

  if (fromExtensionPage && message.type in popupHandlers) {
    const handler = popupHandlers[message.type as keyof PopupRpc] as (p: unknown, c: void) => Promise<unknown>;
    run = () => handler(message.payload, undefined);
  } else if (fromHhTab && tabId !== undefined && message.type in contentHandlers) {
    const handler = contentHandlers[message.type as keyof ContentToBackgroundRpc] as (
      p: unknown,
      c: { tabId: number },
    ) => Promise<unknown>;
    run = () => handler(message.payload, { tabId });
  }

  if (!run) {
    sendResponse({ ok: false, error: `Операция ${message.type} недоступна` });
    return false;
  }

  run().then(
    (data) => sendResponse({ ok: true, data }),
    (error: unknown) => {
      console.warn('[HH Tracker]', message.type, error);
      sendResponse({ ok: false, ...serializeError(error) });
    },
  );
  return true; // ответ асинхронный
}
