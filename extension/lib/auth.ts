// Токены живут только в service worker: popup и content scripts в API напрямую не ходят.
import { storage } from 'wxt/utils/storage';
import { ApiError, http } from './api/http';
import type { TokenOut } from './api/types';

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  /** Unix ms, когда истекает access-токен. */
  accessExpiresAt: number;
}

/**
 * Что показать пользователю после потери сессии:
 * - device_lost — refresh-токен анонимного устройства больше не действует, история начата заново;
 * - session_expired — сессия аккаунта закончилась (выход на другом устройстве, смена пароля).
 */
export type Notice = 'device_lost' | 'session_expired';

export const authItem = storage.defineItem<StoredAuth | null>('local:auth', { fallback: null });
export const noticeItem = storage.defineItem<Notice | null>('local:notice', { fallback: null });
/** Последнее известное состояние: зарегистрирован ли пользователь (для выбора Notice). */
export const registeredItem = storage.defineItem<boolean>('local:isRegistered', { fallback: false });

let deviceInFlight: Promise<StoredAuth> | null = null;
let refreshInFlight: Promise<StoredAuth> | null = null;

export async function saveTokens(tokens: TokenOut): Promise<StoredAuth> {
  const stored: StoredAuth = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessExpiresAt: Date.now() + tokens.expires_in * 1000,
  };
  await authItem.setValue(stored);
  return stored;
}

interface UADataLike {
  brands?: { brand: string }[];
  platform?: string;
}

/** «Chrome / Windows», «YaBrowser / macOS» — подпись сессии устройства в бэкенде. */
export function deviceLabel(): string {
  const uaData = (navigator as Navigator & { userAgentData?: UADataLike }).userAgentData;
  const brand =
    uaData?.brands?.map((b) => b.brand).find((b) => !/not.?a.?brand|chromium/i.test(b)) ?? 'Chrome';
  return `${brand} / ${uaData?.platform || 'unknown'}`.slice(0, 200);
}

/** Новый анонимный пользователь для этого браузера (одновременно — не больше одного запроса). */
export function registerDevice(): Promise<StoredAuth> {
  deviceInFlight ??= (async () => {
    const tokens = await http<TokenOut>('POST', '/auth/device', {
      body: { device_label: deviceLabel() },
    });
    await registeredItem.setValue(false);
    return saveTokens(tokens);
  })().finally(() => {
    deviceInFlight = null;
  });
  return deviceInFlight;
}

export async function ensureAuth(): Promise<StoredAuth> {
  return (await authItem.getValue()) ?? registerDevice();
}

/**
 * Обновляет пару токенов. Все параллельные вызовы ждут один запрос: refresh-токен
 * одноразовый, два одновременных refresh выбили бы друг друга.
 *
 * Если refresh-токен мёртв, создаётся новый токен устройства, чтобы трекинг продолжал
 * работать, а пользователь получает Notice.
 */
export function refreshTokens(): Promise<StoredAuth> {
  refreshInFlight ??= (async () => {
    const current = await authItem.getValue();
    if (!current) return registerDevice();
    try {
      const tokens = await http<TokenOut>('POST', '/auth/refresh', {
        body: { refresh_token: current.refreshToken },
      });
      return saveTokens(tokens);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        const wasRegistered = await registeredItem.getValue();
        await authItem.removeValue();
        await noticeItem.setValue(wasRegistered ? 'session_expired' : 'device_lost');
        return registerDevice();
      }
      throw error;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function getAccessToken(): Promise<string> {
  let auth = await ensureAuth();
  if (auth.accessExpiresAt - Date.now() < 30_000) auth = await refreshTokens();
  return auth.accessToken;
}
