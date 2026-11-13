import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

const DEFAULT_API_URL = 'http://127.0.0.1:8000';

export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
    developmentIndicator: 'overlay',
  },
  vite: () => ({
    plugins: [preact()],
  }),
  // Функция, чтобы прочитать WXT_API_URL после того, как WXT загрузит .env-файлы.
  manifest: () => {
    const apiOrigin = new URL(process.env.WXT_API_URL || DEFAULT_API_URL).origin;
    return {
      name: 'HH Tracker',
      description: 'Трекинг откликов на hh.ru и отзывы о вакансиях и работодателях',
      permissions: ['storage', 'webRequest', 'scripting', 'alarms'],
      host_permissions: ['https://hh.ru/*', 'https://*.hh.ru/*', `${apiOrigin}/*`],
      action: { default_title: 'HH Tracker' },
    };
  },
  // Расширение проверяется в основном профиле Chrome (там есть сессия hh.ru),
  // поэтому отдельный браузер в `npm run dev` не запускаем.
  webExt: { disabled: true },
});
