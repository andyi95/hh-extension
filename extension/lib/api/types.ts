// Типы, повторяющие Pydantic-схемы бэкенда (backend/app/schemas).

export const APPLICATION_STATUSES = [
  'sent',
  'viewed',
  'test_task',
  'interview',
  'offer',
  'rejected',
  'closed',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  sent: 'Отправлен',
  viewed: 'Просмотрен',
  test_task: 'Тестовое задание',
  interview: 'Собеседование',
  offer: 'Оффер',
  rejected: 'Отказ',
  closed: 'Вакансия закрыта',
};

export interface TokenOut {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserOut {
  id: number;
  email: string | null;
  display_name: string | null;
  is_registered: boolean;
  created_at: string;
}

export interface CompanyIn {
  hh_id?: string | null;
  name: string;
}

export interface VacancyIn {
  title: string;
  description?: string | null;
  url: string;
  company?: CompanyIn | null;
}

export interface VacancyUpsertIn extends VacancyIn {
  hh_id: string;
}

export interface CompanyOut {
  id: number;
  hh_id: string | null;
  name: string;
}

export interface VacancyOut {
  id: number;
  hh_id: string;
  title: string;
  description: string | null;
  url: string;
  company: CompanyOut | null;
}

export interface RatingSummary {
  average: number | null;
  count: number;
}

export interface VacancyDetailOut extends VacancyOut {
  rating: RatingSummary;
}

export interface CompanyDetailOut extends CompanyOut {
  rating: RatingSummary;
}

export interface VacancyBriefOut {
  hh_id: string;
  title: string;
}

export interface PublicReviewOut {
  id: number;
  vacancy: VacancyBriefOut;
  rating: number;
  text: string | null;
  created_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface StatusOut {
  id: number;
  status: ApplicationStatus;
  changed_at: string;
  comment: string | null;
}

export interface ApplicationOut {
  id: number;
  vacancy: VacancyOut;
  applied_at: string;
  cover_letter: string | null;
  current_status: ApplicationStatus;
  created_at: string;
  updated_at: string;
}

export interface ApplicationDetailOut extends ApplicationOut {
  statuses: StatusOut[];
}

export interface ApplicationStats {
  total: number;
  by_status: Partial<Record<ApplicationStatus, number>>;
}

export interface ReviewOut {
  id: number;
  vacancy: VacancyBriefOut;
  rating: number;
  text: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncItem {
  vacancy: VacancyUpsertIn;
  status: ApplicationStatus;
  applied_at?: string | null;
  changed_at?: string | null;
}

export interface SyncResult {
  created: number;
  updated: number;
  unchanged: number;
}
