import type { ApplicationStatus } from '../api/types';

/** lastState отклика из InitialState → наш статус. Проверены RESPONSE, INTERVIEW, DISCARD. */
export function mapHhState(lastState: string, viewedByOpponent: boolean): ApplicationStatus | null {
  switch (lastState) {
    case 'RESPONSE':
      return viewedByOpponent ? 'viewed' : 'sent';
    case 'INTERVIEW':
      return 'interview';
    case 'DISCARD':
      return 'rejected';
    default:
      console.warn('[HH Tracker] Неизвестный статус отклика hh:', lastState);
      return null;
  }
}

/** Тег статуса в списке «Откликов» (data-qa negotiations-item-*) → наш статус. */
const TAG_STATUS: Record<string, ApplicationStatus> = {
  'negotiations-item-interview': 'interview',
  'negotiations-item-discard': 'rejected',
  'negotiations-item-viewed': 'viewed',
  'negotiations-item-not-viewed': 'sent',
};

// Если у отклика несколько тегов, берём самый «продвинутый».
const TAG_PRIORITY: ApplicationStatus[] = ['rejected', 'interview', 'viewed', 'sent'];

export function mapHhTags(dataQaValues: string[]): ApplicationStatus | null {
  const found = new Set<ApplicationStatus>();
  for (const value of dataQaValues) {
    for (const token of value.split(/\s+/)) {
      const status = TAG_STATUS[token];
      if (status) found.add(status);
    }
  }
  return TAG_PRIORITY.find((s) => found.has(s)) ?? null;
}
