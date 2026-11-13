// Очередь событий, которые не удалось отправить в бэкенд (сервер недоступен).
import { storage } from 'wxt/utils/storage';
import { ApiError, NetworkError } from './api/http';
import type { SyncItem, VacancyUpsertIn } from './api/types';

export type QueuedEvent =
  | { kind: 'applied'; vacancy: VacancyUpsertIn; coverLetter: string | null }
  | { kind: 'sync'; items: SyncItem[] };

interface Entry {
  id: string;
  event: QueuedEvent;
  attempts: number;
  createdAt: number;
}

const MAX_ENTRIES = 200;
const MAX_ATTEMPTS = 20;

const queueItem = storage.defineItem<Entry[]>('local:queue', { fallback: [] });

export async function enqueue(event: QueuedEvent): Promise<void> {
  const queue = await queueItem.getValue();
  queue.push({ id: crypto.randomUUID(), event, attempts: 0, createdAt: Date.now() });
  await queueItem.setValue(queue.slice(-MAX_ENTRIES));
}

let flushing: Promise<void> | null = null;

/**
 * Отправляет накопленные события по порядку. `send` должен бросать NetworkError,
 * а не класть событие обратно в очередь.
 */
export function flushQueue(send: (event: QueuedEvent) => Promise<void>): Promise<void> {
  flushing ??= (async () => {
    const queue = await queueItem.getValue();
    if (queue.length === 0) return;

    const kept: Entry[] = [];
    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      try {
        await send(entry.event);
      } catch (error) {
        if (error instanceof NetworkError) {
          kept.push(...queue.slice(i)); // сервер всё ещё недоступен — пробуем позже
          break;
        }
        const retriable = !(error instanceof ApiError) || error.status >= 500 || error.status === 429;
        if (retriable && entry.attempts + 1 < MAX_ATTEMPTS) {
          kept.push({ ...entry, attempts: entry.attempts + 1 });
        } else {
          console.warn('[HH Tracker] Событие из очереди отброшено', entry, error);
        }
      }
    }

    // Пока шла отправка, могли добавиться новые события — не теряем их.
    const processed = new Set(queue.map((entry) => entry.id));
    const added = (await queueItem.getValue()).filter((entry) => !processed.has(entry.id));
    await queueItem.setValue([...kept, ...added]);
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
