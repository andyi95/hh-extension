import { useState } from 'preact/hooks';
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  type ApplicationDetailOut,
  type ApplicationStatus,
} from '@/lib/api/types';
import { callBackground } from '@/lib/messages';
import { formatDate, formatDateTime } from '../format';
import { useAction } from '../hooks';
import { ErrorText, StatusBadge } from './common';

interface Props {
  application: ApplicationDetailOut;
  onChange: (application: ApplicationDetailOut) => void;
  onDeleted: () => void;
}

/** Мой отклик: текущий статус, смена статуса, история, сопроводительное. */
export function ApplicationBlock({ application, onChange, onDeleted }: Props) {
  const action = useAction();
  const [status, setStatus] = useState<ApplicationStatus>(application.current_status);
  const [comment, setComment] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const addStatus = async () => {
    const updated = await action.run(() =>
      callBackground('addStatus', {
        applicationId: application.id,
        status,
        comment: comment.trim() || null,
      }),
    );
    if (updated) {
      setComment('');
      onChange(updated);
    }
  };

  const deleteStatus = async (statusId: number) => {
    const updated = await action.run(() =>
      callBackground('deleteStatus', { applicationId: application.id, statusId }),
    );
    if (updated) onChange(updated);
  };

  const deleteApplication = async () => {
    const done = await action.run(() => callBackground('deleteApplication', { applicationId: application.id }));
    if (done !== undefined) onDeleted();
  };

  return (
    <div class="stack">
      <p class="row">
        <StatusBadge status={application.current_status} />
        <span class="muted">отклик {formatDate(application.applied_at)}</span>
      </p>

      <div class="row">
        <select
          value={status}
          disabled={action.busy}
          onChange={(e) => setStatus(e.currentTarget.value as ApplicationStatus)}
          aria-label="Новый статус"
        >
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button type="button" class="btn btn-primary" disabled={action.busy} onClick={addStatus}>
          Добавить
        </button>
      </div>
      <input
        type="text"
        placeholder="Комментарий (необязательно)"
        maxLength={5000}
        value={comment}
        disabled={action.busy}
        onInput={(e) => setComment(e.currentTarget.value)}
      />
      <ErrorText error={action.error} />

      <details class="history">
        <summary>История ({application.statuses.length})</summary>
        <ul class="list">
          {[...application.statuses].reverse().map((record) => (
            <li key={record.id} class="history-item">
              <div>
                <StatusBadge status={record.status} />{' '}
                <span class="muted">{formatDateTime(record.changed_at)}</span>
                {record.comment && <p class="small">{record.comment}</p>}
              </div>
              <button
                type="button"
                class="icon-btn"
                title="Удалить запись"
                aria-label="Удалить запись"
                disabled={action.busy}
                onClick={() => deleteStatus(record.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </details>

      <CoverLetter application={application} onChange={onChange} />

      <div class="row end">
        {confirmDelete ? (
          <>
            <span class="small">Удалить отклик из трекера?</span>
            <button type="button" class="btn btn-danger" disabled={action.busy} onClick={deleteApplication}>
              Удалить
            </button>
            <button type="button" class="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              Отмена
            </button>
          </>
        ) : (
          <button type="button" class="link small" onClick={() => setConfirmDelete(true)}>
            Удалить отклик
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Сопроводительное. Обычно его ловит расширение при отклике; если письмо ушло
 * через чат с работодателем, его можно вставить сюда вручную.
 */
function CoverLetter({ application, onChange }: Omit<Props, 'onDeleted'>) {
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(application.cover_letter ?? '');

  const save = async () => {
    const updated = await action.run(() =>
      callBackground('updateCoverLetter', {
        applicationId: application.id,
        coverLetter: text.trim() || null,
      }),
    );
    if (updated) {
      setEditing(false);
      onChange(updated);
    }
  };

  return (
    <details class="history" open={editing}>
      <summary>Сопроводительное {application.cover_letter ? '' : '(нет)'}</summary>
      {editing ? (
        <div class="stack">
          <textarea
            rows={7}
            maxLength={20000}
            value={text}
            disabled={action.busy}
            onInput={(e) => setText(e.currentTarget.value)}
          />
          <ErrorText error={action.error} />
          <div class="row end">
            <button type="button" class="btn btn-ghost" onClick={() => setEditing(false)}>
              Отмена
            </button>
            <button type="button" class="btn btn-primary" disabled={action.busy} onClick={save}>
              Сохранить
            </button>
          </div>
        </div>
      ) : (
        <div class="stack">
          {application.cover_letter ? (
            <p class="letter">{application.cover_letter}</p>
          ) : (
            <p class="muted small">
              Если письмо ушло через чат с работодателем, вставьте его сюда.
            </p>
          )}
          <button
            type="button"
            class="link small"
            onClick={() => {
              setText(application.cover_letter ?? '');
              setEditing(true);
            }}
          >
            {application.cover_letter ? 'Изменить' : 'Добавить'}
          </button>
        </div>
      )}
    </details>
  );
}
