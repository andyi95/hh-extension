export const API_URL = (import.meta.env.WXT_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

const DETAIL_RU: Record<string, string> = {
  'Invalid email or password': 'Неверный email или пароль',
  'Email already registered, log in instead': 'Этот email уже зарегистрирован — войдите',
  'Already registered': 'Аккаунт уже зарегистрирован',
  'Registration required': 'Нужна регистрация',
  'Registration required to publish reviews': 'Публиковать отзывы могут только зарегистрированные пользователи',
  'Current password is incorrect': 'Текущий пароль неверный',
  'Application for this vacancy exists': 'Отклик на эту вакансию уже есть',
  'Review for this vacancy exists': 'Отзыв на эту вакансию уже есть',
  'Account is disabled': 'Аккаунт заблокирован',
};

/** Ответ бэкенда с кодом ошибки. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(
      typeof detail === 'string'
        ? (DETAIL_RU[detail] ?? detail)
        : status === 422
          ? 'Проверьте введённые данные'
          : `Ошибка сервера (${status})`,
    );
    this.name = 'ApiError';
  }
}

/** Бэкенд недоступен: событие стоит отложить и повторить позже. */
export class NetworkError extends Error {
  constructor(message = 'Нет связи с сервером HH Tracker') {
    super(message);
    this.name = 'NetworkError';
  }
}

export type Query = Record<string, string | number | null | undefined>;

export interface HttpOptions {
  body?: unknown;
  token?: string | null;
  query?: Query;
}

export async function http<T>(method: string, path: string, opts: HttpOptions = {}): Promise<T> {
  const url = new URL(API_URL + path);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new NetworkError();
  }

  if (response.status === 204) return null as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data && typeof data === 'object' && 'detail' in data ? data.detail : data;
    throw new ApiError(response.status, detail);
  }
  return data as T;
}
