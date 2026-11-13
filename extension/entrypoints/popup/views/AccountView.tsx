import { useState } from 'preact/hooks';
import type { UserOut } from '@/lib/api/types';
import { callBackground } from '@/lib/messages';
import { ErrorText, Section } from '../components/common';
import { formatDate } from '../format';
import { useAction } from '../hooks';

interface Props {
  user: UserOut;
  onUserChange: (user: UserOut) => void;
  onBack: () => void;
}

export function AccountView({ user, onUserChange, onBack }: Props) {
  return (
    <div class="stack-lg">
      <button type="button" class="link small" onClick={onBack}>
        ← Назад
      </button>
      {user.is_registered ? (
        <RegisteredAccount user={user} onUserChange={onUserChange} />
      ) : (
        <AnonymousAccount onUserChange={onUserChange} />
      )}
    </div>
  );
}

function RegisteredAccount({ user, onUserChange }: Omit<Props, 'onBack'>) {
  const action = useAction();
  const [confirm, setConfirm] = useState(false);

  const logout = async () => {
    const anonymous = await action.run(() => callBackground('logout', undefined));
    if (anonymous) onUserChange(anonymous);
  };

  return (
    <Section title="Аккаунт">
      <p>
        <strong>{user.display_name || user.email}</strong>
        {user.display_name && <span class="muted"> · {user.email}</span>}
      </p>
      <p class="muted small">С нами с {formatDate(user.created_at)}. История синхронизируется между устройствами.</p>
      <ErrorText error={action.error} />
      {confirm ? (
        <div class="stack">
          <p class="small">
            После выхода этот браузер начнёт новую анонимную историю. Данные аккаунта останутся на сервере.
          </p>
          <div class="row end">
            <button type="button" class="btn btn-ghost" onClick={() => setConfirm(false)}>
              Отмена
            </button>
            <button type="button" class="btn btn-danger" disabled={action.busy} onClick={logout}>
              Выйти
            </button>
          </div>
        </div>
      ) : (
        <button type="button" class="btn" onClick={() => setConfirm(true)}>
          Выйти
        </button>
      )}
    </Section>
  );
}

function AnonymousAccount({ onUserChange }: { onUserChange: (user: UserOut) => void }) {
  const action = useAction();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const submit = async (event: Event) => {
    event.preventDefault();
    const user = await action.run(() =>
      mode === 'register'
        ? callBackground('register', { email, password, displayName: displayName.trim() || null })
        : callBackground('login', { email, password }),
    );
    if (user) {
      setPassword('');
      onUserChange(user);
    }
  };

  return (
    <Section title="Аккаунт">
      <p class="small">
        Сейчас история хранится на сервере и привязана к этому браузеру. Аккаунт нужен, чтобы видеть её на других
        устройствах, не потерять при переустановке расширения и публиковать отзывы.
      </p>

      <div class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          class={mode === 'register' ? 'tab active' : 'tab'}
          onClick={() => setMode('register')}
        >
          Регистрация
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          class={mode === 'login' ? 'tab active' : 'tab'}
          onClick={() => setMode('login')}
        >
          Вход
        </button>
      </div>

      <form class="stack" onSubmit={submit}>
        <input
          type="email"
          required
          autocomplete="email"
          placeholder="Email"
          value={email}
          onInput={(e) => setEmail(e.currentTarget.value)}
        />
        <input
          type="password"
          required
          minLength={mode === 'register' ? 8 : undefined}
          maxLength={128}
          autocomplete={mode === 'register' ? 'new-password' : 'current-password'}
          placeholder={mode === 'register' ? 'Пароль, минимум 8 символов' : 'Пароль'}
          value={password}
          onInput={(e) => setPassword(e.currentTarget.value)}
        />
        {mode === 'register' && (
          <input
            type="text"
            maxLength={100}
            placeholder="Имя (необязательно, публично не показывается)"
            value={displayName}
            onInput={(e) => setDisplayName(e.currentTarget.value)}
          />
        )}
        <p class="muted small">
          {mode === 'register'
            ? 'История этого браузера сохранится в аккаунте.'
            : 'Отклики и отзывы с этого браузера перенесутся в аккаунт.'}
        </p>
        <ErrorText error={action.error} />
        <button type="submit" class="btn btn-primary" disabled={action.busy}>
          {mode === 'register' ? 'Зарегистрироваться' : 'Войти'}
        </button>
      </form>
    </Section>
  );
}
