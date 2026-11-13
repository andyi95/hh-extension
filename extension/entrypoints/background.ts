import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { ensureAuth } from '@/lib/auth';
import { handleMessage } from '@/lib/background/handlers';
import { flushPending, handleResponseSent, setupResponseTracking } from '@/lib/background/tracking';

const FLUSH_ALARM = 'flush-queue';

async function ensureFlushAlarm(): Promise<void> {
  // Будильники могут сбрасываться при перезапуске браузера — проверяем при каждом старте.
  if (!(await browser.alarms.get(FLUSH_ALARM))) {
    await browser.alarms.create(FLUSH_ALARM, { periodInMinutes: 5 });
  }
}

function logError(error: unknown): void {
  console.warn('[HH Tracker]', error);
}

// Service worker засыпает через ~30 с простоя: все слушатели регистрируются
// синхронно на верхнем уровне, состояние — только в storage.
export default defineBackground(() => {
  setupResponseTracking((event) => {
    handleResponseSent(event).catch(logError);
  });

  browser.runtime.onMessage.addListener(handleMessage);

  browser.runtime.onInstalled.addListener(() => {
    ensureAuth().catch(logError);
    ensureFlushAlarm().catch(logError);
  });

  browser.runtime.onStartup.addListener(() => {
    ensureFlushAlarm().catch(logError);
    flushPending().catch(logError);
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === FLUSH_ALARM) flushPending().catch(logError);
  });
});
