import { browser } from 'wxt/browser';
import { HH_ORIGINS } from '@/lib/hh/url';
import { ErrorText } from '../components/common';
import { useAction } from '../hooks';

/** Доступ к hh.ru ограничен в меню расширений Chrome. */
export function NoAccess({ onGranted }: { onGranted: () => void }) {
  const action = useAction();

  const request = async () => {
    const granted = await action.run(() => browser.permissions.request({ origins: HH_ORIGINS }));
    if (granted) onGranted();
  };

  return (
    <div class="stack">
      <p>
        У расширения нет доступа к hh.ru. Без него оно не видит вакансии и не замечает ваши отклики.
      </p>
      <button type="button" class="btn btn-primary" disabled={action.busy} onClick={request}>
        Разрешить доступ к hh.ru
      </button>
      <ErrorText error={action.error} />
    </div>
  );
}
