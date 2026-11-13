import { SEL } from './selectors';

// Структура состояния hh не документирована, поэтому читаем его как произвольный JSON.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HhState = Record<string, any>;

let cache: { element: Element; state: HhState | null } | null = null;

/**
 * JSON-снимок состояния страницы на момент её загрузки.
 *
 * Не обновляется после действий на странице и после клиентской навигации,
 * поэтому вызывающий код обязан проверить, что снимок относится к текущему URL.
 */
export function readInitialState(doc: Document = document): HhState | null {
  const element = doc.querySelector(SEL.initialState);
  if (!element) return null;
  if (cache?.element === element) return cache.state;

  let state: HhState | null = null;
  try {
    state = JSON.parse(element.innerHTML) as HhState;
  } catch {
    state = null;
  }
  cache = { element, state };
  return state;
}
