import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { Notice } from '@/lib/auth';
import { HH_ORIGINS, parseHhUrl } from '@/lib/hh/url';
import { callBackground, type Session } from '@/lib/messages';
import { ErrorBox, Loading } from './components/common';
import { useAsync } from './hooks';
import { AccountView } from './views/AccountView';
import { EmployerCard } from './views/EmployerCard';
import { HomeView } from './views/HomeView';
import { NoAccess } from './views/NoAccess';
import { VacancyCard } from './views/VacancyCard';

const NOTICE_TEXT: Record<Notice, string> = {
  device_lost:
    'Сессия этого браузера была утеряна, история на нём начата заново. Зарегистрируйтесь, чтобы такого не случилось.',
  session_expired:
    'Сессия аккаунта истекла (выход на другом устройстве или смена пароля). Войдите снова: отклики, сделанные за это время, перенесутся в аккаунт.',
};

async function loadEnvironment() {
  // URL активной вкладки виден только для hh.ru (host permission), для остальных — undefined.
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const hasAccess = await browser.permissions.contains({ origins: HH_ORIGINS });
  return { tabId: tab?.id ?? null, url: tab?.url ?? null, hasAccess };
}

export function App() {
  const [view, setView] = useState<'main' | 'account'>('main');
  const env = useAsync(loadEnvironment, []);
  const session = useAsync(() => callBackground('getSession', undefined), []);

  const setSession = (patch: Partial<Session>) => {
    if (session.data) session.setData({ ...session.data, ...patch });
  };

  const dismissNotice = () => {
    setSession({ notice: null });
    void callBackground('dismissNotice', undefined);
  };

  const user = session.data?.user;

  let content: ComponentChildren;
  if (env.loading || session.loading) {
    content = <Loading />;
  } else if (session.error || !session.data || !user) {
    content = (
      <ErrorBox
        error={`${session.error ?? 'Нет данных'}. Проверьте, что сервер HH Tracker запущен.`}
        onRetry={session.reload}
      />
    );
  } else if (view === 'account') {
    content = <AccountView user={user} onUserChange={(u) => setSession({ user: u })} onBack={() => setView('main')} />;
  } else if (!env.data?.hasAccess) {
    content = <NoAccess onGranted={env.reload} />;
  } else {
    const page = parseHhUrl(env.data.url);
    const openAccount = () => setView('account');
    if (page.kind === 'vacancy') {
      content = (
        <VacancyCard
          key={`${page.hhId}:${user.id}`}
          hhId={page.hhId}
          tabId={env.data.tabId}
          isRegistered={user.is_registered}
          onRegister={openAccount}
        />
      );
    } else if (page.kind === 'employer') {
      content = <EmployerCard key={`${page.hhId}:${user.id}`} hhId={page.hhId} tabId={env.data.tabId} />;
    } else {
      content = <HomeView key={user.id} />;
    }
  }

  return (
    <div class="popup">
      <header class="header">
        <span class="brand">HH Tracker</span>
        {user && (
          <button type="button" class="link" onClick={() => setView(view === 'account' ? 'main' : 'account')}>
            {user.is_registered ? user.display_name || user.email : 'Аккаунт'}
          </button>
        )}
      </header>
      {session.data?.notice && (
        <div class="notice" role="status">
          <p>{NOTICE_TEXT[session.data.notice]}</p>
          <button type="button" class="icon-btn" aria-label="Скрыть" onClick={dismissNotice}>
            ×
          </button>
        </div>
      )}
      <main class="content">{content}</main>
    </div>
  );
}
