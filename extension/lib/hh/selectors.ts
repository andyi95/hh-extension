// Все data-qa hh.ru в одном месте. Источник — docs/hh-research.md.

const qa = (value: string) => `[data-qa="${value}"]`;
/** Для атрибутов из нескольких значений, например "negotiations-tag negotiations-item-viewed". */
const qaHas = (value: string) => `[data-qa~="${value}"]`;

export const SEL = {
  initialState: 'template#HH-Lux-InitialState',

  vacancy: {
    title: qa('vacancy-title'),
    companyName: qa('vacancy-company-name'),
    description: qa('vacancy-description'),
    responseButton: qa('vacancy-response-link-top'),
  },

  responsePopup: {
    letterInput: qa('vacancy-response-popup-form-letter-input'),
    submit: qa('vacancy-response-submit-popup'),
  },

  /** Появляются после успешного отклика. */
  applied: [
    qa('already-responded-text'),
    qa('vacancy-response-link-view-topic'),
    qaHas('vacancy-response-success-standard-notification'),
  ],

  serp: {
    item: qa('vacancy-serp__vacancy'),
    title: qa('serp-item__title'),
    employer: qa('vacancy-serp__vacancy-employer'),
    employerText: qa('vacancy-serp__vacancy-employer-text'),
    responseButton: qa('vacancy-serp__vacancy_response'),
  },

  employer: {
    name: qa('company-header-title-name'),
  },

  negotiations: {
    list: qa('negotiations-list'),
    item: qa('negotiations-item'),
    vacancy: qa('negotiations-item-vacancy'),
    company: qa('negotiations-item-company'),
    date: qa('negotiations-item-date'),
    tag: qaHas('negotiations-tag'),
  },
} as const;
