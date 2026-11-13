import { useCallback, useEffect, useState } from 'preact/hooks';

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface AsyncState<T> {
  loading: boolean;
  data: T | undefined;
  error: string | null;
  reload: () => void;
  setData: (data: T) => void;
}

/** Загружает данные при монтировании и при смене deps. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    load().then(
      (value) => {
        if (!alive) return;
        setData(value);
        setLoading(false);
      },
      (reason: unknown) => {
        if (!alive) return;
        setError(errorText(reason));
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
    // load намеренно не в зависимостях: перезагрузка управляется deps и reload().
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { loading, data, error, reload, setData };
}

/** Действие по кнопке: флаг «выполняется» и текст ошибки. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>(action: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (reason) {
      setError(errorText(reason));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, run };
}
