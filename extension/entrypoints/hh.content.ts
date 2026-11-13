import { browser, type Browser } from 'wxt/browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { defineContentScript } from 'wxt/utils/define-content-script';
import {
  findVacancyOnPage,
  hasAppliedMarker,
  parseEmployerPage,
  parseNegotiationsPage,
  parseVacancyPage,
} from '@/lib/hh/parse';
import { SEL } from '@/lib/hh/selectors';
import { idFromHref, parseHhUrl } from '@/lib/hh/url';
import { callBackground, isRpcMessage, type ContentRpc, type PageData } from '@/lib/messages';

export default defineContentScript({
  matches: ['https://hh.ru/*', 'https://*.hh.ru/*'],
  // Чат (iframe chatik.hh.ru) — отдельная доработка, см. README.
  excludeMatches: ['https://chatik.hh.ru/*'],
  runAt: 'document_idle',

  main(ctx) {
    // Снимок состояния hh относится к URL, с которым страница загрузилась.
    const initialUrl = normalizeUrl(location.href);
    const stateFresh = () => normalizeUrl(location.href) === initialUrl;

    listenForRequests(ctx);
    watchApplications(ctx);
    watchNegotiations(ctx, stateFresh);
  },
});

/** URL без меток аналитики hh (hhtmFrom и т.п.), которые hh дописывает без перезагрузки. */
function normalizeUrl(href: string): string {
  const url = new URL(href);
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('hhtm')) url.searchParams.delete(key);
  }
  url.hash = '';
  return url.toString();
}

function currentVacancyId(): string | null {
  const page = parseHhUrl(location.href);
  return page.kind === 'vacancy' ? page.hhId : null;
}

// --- Ответы на запросы service worker (данные страницы для popup и для отклика) ---

function getPageData(): PageData {
  const page = parseHhUrl(location.href);
  if (page.kind === 'vacancy') return { kind: 'vacancy', hhId: page.hhId, data: parseVacancyPage(page.hhId) };
  if (page.kind === 'employer') return { kind: 'employer', hhId: page.hhId, data: parseEmployerPage(page.hhId) };
  return { kind: 'other' };
}

function listenForRequests(ctx: ContentScriptContext): void {
  const listener = (
    message: unknown,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean => {
    if (sender.id !== browser.runtime.id || !isRpcMessage(message)) return false;
    try {
      if (message.type === 'getPageData') {
        sendResponse(getPageData() satisfies ContentRpc['getPageData']['res']);
      } else if (message.type === 'getVacancyData') {
        const { hhId } = message.payload as ContentRpc['getVacancyData']['req'];
        sendResponse(findVacancyOnPage(hhId) satisfies ContentRpc['getVacancyData']['res']);
      } else {
        return false;
      }
    } catch (error) {
      console.warn('[HH Tracker] Не удалось разобрать страницу', error);
      sendResponse(null);
    }
    return false;
  };
  browser.runtime.onMessage.addListener(listener);
  ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(listener));
}

// --- DOM-сигнал отклика (страховка к webRequest в service worker) ---

const PENDING_TTL_MS = 10 * 60 * 1000;

/** ID вакансии из кнопки «Откликнуться»: href /applicant/vacancy_response?vacancyId=… или карточка выдачи. */
function vacancyIdFromButton(button: Element): string | null {
  const href = button.getAttribute('href');
  if (href) {
    try {
      const fromQuery = new URL(href, location.origin).searchParams.get('vacancyId');
      if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;
    } catch {
      // относительный href без параметров — ниже ищем по карточке
    }
  }
  const card = button.closest(SEL.serp.item);
  return idFromHref(card?.querySelector(SEL.serp.title)?.getAttribute('href'), 'vacancy');
}

function watchApplications(ctx: ContentScriptContext): void {
  // Отклик засчитывается, только если пользователь сам начал его на этой странице:
  // иначе маркер «Резюме доставлено» у давнего отклика приняли бы за новый.
  let pending: { vacancyId: string; letter: string | null; startedAt: number } | null = null;
  const reported = new Set<string>();

  // Отклик, сделанный до загрузки страницы, — не новый.
  const initialVacancy = currentVacancyId();
  if (initialVacancy && hasAppliedMarker()) reported.add(initialVacancy);

  ctx.addEventListener(
    document,
    'click',
    (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const responseButton = target.closest(`${SEL.vacancy.responseButton}, ${SEL.serp.responseButton}`);
      if (responseButton) {
        const vacancyId = vacancyIdFromButton(responseButton) ?? currentVacancyId();
        if (vacancyId) pending = { vacancyId, letter: null, startedAt: Date.now() };
      }

      if (target.closest(SEL.responsePopup.submit)) {
        const letterInput = document.querySelector<HTMLTextAreaElement>(SEL.responsePopup.letterInput);
        const vacancyId = pending?.vacancyId ?? currentVacancyId();
        if (vacancyId) {
          pending = { vacancyId, letter: letterInput?.value.trim() || null, startedAt: Date.now() };
        }
      }
    },
    { capture: true },
  );

  const onAppliedMarker = () => {
    if (!pending || Date.now() - pending.startedAt > PENDING_TTL_MS) return;
    const { vacancyId, letter } = pending;
    pending = null;
    if (reported.has(vacancyId)) return;
    reported.add(vacancyId);

    const vacancy = findVacancyOnPage(vacancyId);
    if (!vacancy) return; // service worker всё равно поймает запрос через webRequest
    callBackground('reportApplied', { vacancy, coverLetter: letter }).catch((error) =>
      console.warn('[HH Tracker] Не удалось сохранить отклик', error),
    );
  };

  const observer = new MutationObserver((mutations) => {
    if (!pending) return; // дешёвый выход: большинство мутаций hh нас не интересует
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (SEL.applied.some((selector) => node.matches(selector) || node.querySelector(selector))) {
          onAppliedMarker();
          return;
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  ctx.onInvalidated(() => observer.disconnect());
}

// --- Синхронизация «Откликов» ---

function watchNegotiations(ctx: ContentScriptContext, stateFresh: () => boolean): void {
  let lastSignature = '';
  let timer: number | undefined;

  const sync = () => {
    if (parseHhUrl(location.href).kind !== 'negotiations') return;
    const items = parseNegotiationsPage(stateFresh());
    if (items.length === 0) return;
    // Не шлём одно и то же повторно (мутации DOM приходят пачками).
    const signature = items.map((item) => `${item.vacancy.hh_id}:${item.status}`).join(',');
    if (signature === lastSignature) return;
    lastSignature = signature;
    callBackground('syncNegotiations', { items }).catch((error) =>
      console.warn('[HH Tracker] Не удалось синхронизировать отклики', error),
    );
  };

  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = ctx.setTimeout(sync, 1000);
  };

  schedule();
  // Пагинация и фильтры «Откликов» — клиентские: URL меняется без перезагрузки.
  ctx.addEventListener(window, 'wxt:locationchange', schedule);

  const observer = new MutationObserver(() => {
    if (parseHhUrl(location.href).kind === 'negotiations') schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  ctx.onInvalidated(() => observer.disconnect());
}
