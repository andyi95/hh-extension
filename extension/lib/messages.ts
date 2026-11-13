// Типизированный контракт сообщений: popup ⇄ service worker ⇄ content script.
// Только перечисленные операции — без «произвольного запроса к API» из content script.
import { browser } from 'wxt/browser';
import type {
  ApplicationDetailOut,
  ApplicationOut,
  ApplicationStats,
  ApplicationStatus,
  CompanyDetailOut,
  Page,
  PublicReviewOut,
  ReviewOut,
  SyncItem,
  SyncResult,
  UserOut,
  VacancyDetailOut,
  VacancyUpsertIn,
} from './api/types';
import type { Notice } from './auth';
import type { EmployerPageData, VacancyPageData } from './hh/parse';

export interface Session {
  user: UserOut;
  notice: Notice | null;
}

export interface VacancyCard {
  vacancy: VacancyDetailOut | null;
  /** Данные со страницы (null, если вкладка недоступна). */
  page: VacancyPageData | null;
  application: ApplicationDetailOut | null;
  myReview: ReviewOut | null;
  publicReviews: Page<PublicReviewOut>;
}

export interface EmployerCard {
  hhId: string;
  name: string;
  company: CompanyDetailOut | null;
  applications: Page<ApplicationOut>;
  publicReviews: Page<PublicReviewOut>;
}

export interface HomeData {
  stats: ApplicationStats;
  recent: ApplicationOut[];
}

export interface ReviewInput {
  reviewId: number | null;
  vacancyHhId: string;
  rating: number;
  text: string | null;
  isPublic: boolean;
}

/** Операции, которые popup вызывает в service worker. */
export interface PopupRpc {
  getSession: { req: void; res: Session };
  dismissNotice: { req: void; res: null };
  register: { req: { email: string; password: string; displayName: string | null }; res: UserOut };
  login: { req: { email: string; password: string }; res: UserOut };
  logout: { req: void; res: UserOut };

  getVacancyCard: { req: { hhId: string; tabId: number | null }; res: VacancyCard };
  getEmployerCard: { req: { hhId: string; tabId: number | null; reviewsOffset: number }; res: EmployerCard };
  getHome: { req: void; res: HomeData };

  markApplied: { req: { vacancy: VacancyUpsertIn }; res: ApplicationDetailOut };
  deleteApplication: { req: { applicationId: number }; res: null };
  addStatus: {
    req: { applicationId: number; status: ApplicationStatus; comment: string | null };
    res: ApplicationDetailOut;
  };
  deleteStatus: { req: { applicationId: number; statusId: number }; res: ApplicationDetailOut };
  updateCoverLetter: { req: { applicationId: number; coverLetter: string | null }; res: ApplicationDetailOut };
  saveReview: { req: ReviewInput; res: ReviewOut };
  deleteReview: { req: { reviewId: number }; res: null };
}

/** Операции, которые content script вызывает в service worker. */
export interface ContentToBackgroundRpc {
  reportApplied: { req: { vacancy: VacancyUpsertIn; coverLetter: string | null }; res: null };
  syncNegotiations: { req: { items: SyncItem[] }; res: SyncResult | null };
}

export type BackgroundRpc = PopupRpc & ContentToBackgroundRpc;

export type PageData =
  | { kind: 'vacancy'; hhId: string; data: VacancyPageData | null }
  | { kind: 'employer'; hhId: string; data: EmployerPageData | null }
  | { kind: 'other' };

/** Операции, которые service worker вызывает в content script вкладки. */
export interface ContentRpc {
  getPageData: { req: void; res: PageData };
  getVacancyData: { req: { hhId: string }; res: VacancyUpsertIn | null };
}

export interface RpcMessage<K extends string = string, P = unknown> {
  type: K;
  payload: P;
}

export type RpcResponse<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

export class RpcError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

export function isRpcMessage(value: unknown): value is RpcMessage {
  return typeof value === 'object' && value !== null && typeof (value as RpcMessage).type === 'string';
}

export async function callBackground<K extends keyof BackgroundRpc>(
  type: K,
  payload: BackgroundRpc[K]['req'],
): Promise<BackgroundRpc[K]['res']> {
  const response = (await browser.runtime.sendMessage({ type, payload })) as
    | RpcResponse<BackgroundRpc[K]['res']>
    | undefined;
  if (!response) throw new RpcError('Фоновый скрипт расширения не ответил');
  if (!response.ok) throw new RpcError(response.error, response.status);
  return response.data;
}

/** Отклоняется, если в вкладке нет content script (например, вкладка открыта до установки). */
export async function callContent<K extends keyof ContentRpc>(
  tabId: number,
  type: K,
  payload: ContentRpc[K]['req'],
): Promise<ContentRpc[K]['res']> {
  return (await browser.tabs.sendMessage(tabId, { type, payload })) as ContentRpc[K]['res'];
}
