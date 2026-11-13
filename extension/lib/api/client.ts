// Клиент бэкенда. Используется только в service worker.
import { getAccessToken, refreshTokens } from '../auth';
import { ApiError, http, type HttpOptions } from './http';
import type {
  ApplicationDetailOut,
  ApplicationOut,
  ApplicationStats,
  ApplicationStatus,
  CompanyDetailOut,
  Page,
  PublicReviewOut,
  ReviewOut,
  StatusOut,
  SyncItem,
  SyncResult,
  TokenOut,
  UserOut,
  VacancyDetailOut,
  VacancyOut,
  VacancyUpsertIn,
} from './types';

/** Запрос с токеном; на 401 — один refresh и повтор. */
async function authed<T>(method: string, path: string, opts: Omit<HttpOptions, 'token'> = {}): Promise<T> {
  const token = await getAccessToken();
  try {
    return await http<T>(method, path, { ...opts, token });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const fresh = await refreshTokens();
      return http<T>(method, path, { ...opts, token: fresh.accessToken });
    }
    throw error;
  }
}

/** 404 → null, остальные ошибки пробрасываются. */
export async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export const Api = {
  // Пользователь
  me: () => authed<UserOut>('GET', '/users/me'),
  register: (body: { email: string; password: string; display_name?: string | null }) =>
    authed<UserOut>('POST', '/auth/register', { body }),
  logout: () => authed<null>('POST', '/auth/logout'),

  /**
   * Вход с токеном текущего устройства: бэкенд перенесёт данные анонимного устройства в аккаунт.
   * Без автоматического повтора на 401: «неверный пароль» тоже 401.
   */
  async login(body: { email: string; password: string; device_label: string }): Promise<TokenOut> {
    const call = (token: string) => http<TokenOut>('POST', '/auth/login', { body, token });
    try {
      return await call(await getAccessToken());
    } catch (error) {
      // Сессия устройства отозвана — обновляем токен и пробуем ещё раз.
      if (error instanceof ApiError && error.status === 401 && error.detail !== 'Invalid email or password') {
        return call((await refreshTokens()).accessToken);
      }
      throw error;
    }
  },

  // Каталог (чтение без авторизации)
  getVacancy: (hhId: string) => http<VacancyDetailOut>('GET', `/vacancies/${hhId}`),
  putVacancy: ({ hh_id, ...body }: VacancyUpsertIn) =>
    authed<VacancyOut>('PUT', `/vacancies/${hh_id}`, { body }),
  vacancyReviews: (hhId: string, limit = 5, offset = 0) =>
    http<Page<PublicReviewOut>>('GET', `/vacancies/${hhId}/reviews`, { query: { limit, offset } }),
  getCompany: (hhId: string) => http<CompanyDetailOut>('GET', `/companies/${hhId}`),
  companyReviews: (hhId: string, limit = 5, offset = 0) =>
    http<Page<PublicReviewOut>>('GET', `/companies/${hhId}/reviews`, { query: { limit, offset } }),

  // Отклики
  listApplications: (query: {
    status?: ApplicationStatus;
    vacancy_hh_id?: string;
    company_hh_id?: string;
    limit?: number;
    offset?: number;
  }) => authed<Page<ApplicationOut>>('GET', '/applications', { query }),
  stats: () => authed<ApplicationStats>('GET', '/applications/stats'),
  getApplication: (id: number) => authed<ApplicationDetailOut>('GET', `/applications/${id}`),
  createApplication: (body: { vacancy: VacancyUpsertIn; applied_at?: string; cover_letter?: string | null }) =>
    authed<ApplicationDetailOut>('POST', '/applications', { body }),
  updateApplication: (id: number, body: { cover_letter?: string | null; applied_at?: string }) =>
    authed<ApplicationDetailOut>('PATCH', `/applications/${id}`, { body }),
  deleteApplication: (id: number) => authed<null>('DELETE', `/applications/${id}`),
  addStatus: (id: number, body: { status: ApplicationStatus; comment?: string | null }) =>
    authed<StatusOut>('POST', `/applications/${id}/statuses`, { body }),
  deleteStatus: (id: number, statusId: number) =>
    authed<null>('DELETE', `/applications/${id}/statuses/${statusId}`),
  sync: (items: SyncItem[]) => authed<SyncResult>('POST', '/applications/sync', { body: { items } }),

  // Свои отзывы
  listReviews: (query: { vacancy_hh_id?: string; limit?: number; offset?: number }) =>
    authed<Page<ReviewOut>>('GET', '/reviews', { query }),
  createReview: (body: { vacancy_hh_id: string; rating: number; text: string | null; is_public: boolean }) =>
    authed<ReviewOut>('POST', '/reviews', { body }),
  updateReview: (id: number, body: { rating?: number; text?: string | null; is_public?: boolean }) =>
    authed<ReviewOut>('PATCH', `/reviews/${id}`, { body }),
  deleteReview: (id: number) => authed<null>('DELETE', `/reviews/${id}`),
};
