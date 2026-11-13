// Фиксация откликов и синхронизация «Откликов» в бэкенде.
import { browser } from 'wxt/browser';
import { Api, orNull } from '../api/client';
import { ApiError, NetworkError } from '../api/http';
import type { SyncItem, SyncResult, VacancyUpsertIn } from '../api/types';
import { vacancyUrl } from '../hh/url';
import { callContent } from '../messages';
import { enqueue, flushQueue, type QueuedEvent } from '../queue';

/**
 * Создаёт отклик или, если он уже есть, дописывает сопроводительное.
 * Идемпотентно: одновременные сигналы (webRequest и DOM) дают один отклик.
 * Бросает NetworkError, если бэкенд недоступен.
 */
async function submitApplication(vacancy: VacancyUpsertIn, coverLetter: string | null): Promise<void> {
  try {
    await Api.createApplication({ vacancy, cover_letter: coverLetter });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 409)) throw error;
    // Отклик уже есть: письмо могло прийти позже (добавлено после отклика).
    if (!coverLetter) return;
    const existing = (await Api.listApplications({ vacancy_hh_id: vacancy.hh_id, limit: 1 })).items[0];
    if (existing && existing.cover_letter !== coverLetter) {
      await Api.updateApplication(existing.id, { cover_letter: coverLetter });
    }
  }
}

async function submitSync(items: SyncItem[]): Promise<SyncResult> {
  return Api.sync(items);
}

export async function recordApplication(vacancy: VacancyUpsertIn, coverLetter: string | null): Promise<void> {
  try {
    await submitApplication(vacancy, coverLetter);
  } catch (error) {
    if (error instanceof NetworkError) {
      await enqueue({ kind: 'applied', vacancy, coverLetter });
      return;
    }
    throw error;
  }
}

export async function recordSync(items: SyncItem[]): Promise<SyncResult | null> {
  if (items.length === 0) return null;
  try {
    return await submitSync(items);
  } catch (error) {
    if (error instanceof NetworkError) {
      await enqueue({ kind: 'sync', items });
      return null;
    }
    throw error;
  }
}

export function flushPending(): Promise<void> {
  return flushQueue(async (event: QueuedEvent) => {
    if (event.kind === 'applied') await submitApplication(event.vacancy, event.coverLetter);
    else await submitSync(event.items);
  });
}

/**
 * Отклик пойман по сетевому запросу. Данные вакансии просим у content script вкладки:
 * отклик мог быть со страницы вакансии, из выдачи или из списка.
 */
export async function handleResponseSent(event: {
  vacancyId: string;
  letter: string | null;
  tabId: number;
}): Promise<void> {
  let vacancy: VacancyUpsertIn | null = null;
  if (event.tabId >= 0) {
    vacancy = await callContent(event.tabId, 'getVacancyData', { hhId: event.vacancyId }).catch(() => null);
  }
  if (!vacancy) {
    // Не затираем название уже известной вакансии заглушкой.
    const known = await orNull(Api.getVacancy(event.vacancyId)).catch(() => null);
    vacancy = known
      ? { hh_id: known.hh_id, title: known.title, url: known.url, company: known.company }
      : { hh_id: event.vacancyId, title: `Вакансия ${event.vacancyId}`, url: vacancyUrl(event.vacancyId) };
  }
  await recordApplication(vacancy, event.letter);
}

// --- Наблюдение за запросами отклика (webRequest: только чтение, без блокировки) ---

const RESPONSE_URLS = ['https://hh.ru/applicant/vacancy_response*', 'https://*.hh.ru/applicant/vacancy_response*'];
// Генерация письма ИИ — не отклик.
const IGNORED_PATH = /\/applicant\/vacancy_response_ai/;

interface PendingResponse {
  vacancyId: string;
  letter: string | null;
  tabId: number;
}

const pending = new Map<string, PendingResponse>();

type RequestBody = { formData?: Record<string, unknown[]>; raw?: { bytes?: ArrayBuffer }[] } | null | undefined;

function readForm(body: RequestBody): (key: string) => string | null {
  const formData = body?.formData;
  if (formData) {
    return (key) => {
      const value = formData[key]?.[0];
      return typeof value === 'string' ? value : null;
    };
  }
  const bytes = body?.raw?.[0]?.bytes;
  if (!bytes) return () => null;
  const text = new TextDecoder().decode(bytes);
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    return (key) => (json[key] == null ? null : String(json[key]));
  } catch {
    const params = new URLSearchParams(text);
    return (key) => params.get(key);
  }
}

/**
 * Отклик на hh — POST /applicant/vacancy_response/popup (multipart: vacancy_id, letter, …),
 * см. docs/hh-research.md. resume_hash и _xsrf не читаем.
 */
export function setupResponseTracking(onSent: (event: PendingResponse) => void): void {
  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.method !== 'POST' || IGNORED_PATH.test(details.url)) return undefined;
      const get = readForm(details.requestBody as RequestBody);
      const vacancyId = get('vacancy_id') ?? get('vacancyId');
      if (!vacancyId || !/^\d{1,20}$/.test(vacancyId)) return undefined;
      pending.set(details.requestId, {
        vacancyId,
        letter: get('letter')?.trim() || null,
        tabId: details.tabId,
      });
      return undefined;
    },
    { urls: RESPONSE_URLS },
    ['requestBody'],
  );

  browser.webRequest.onCompleted.addListener(
    (details) => {
      const request = pending.get(details.requestId);
      pending.delete(details.requestId);
      if (request && details.statusCode >= 200 && details.statusCode < 300) onSent(request);
    },
    { urls: RESPONSE_URLS },
  );

  browser.webRequest.onErrorOccurred.addListener(
    (details) => {
      pending.delete(details.requestId);
    },
    { urls: RESPONSE_URLS },
  );
}
