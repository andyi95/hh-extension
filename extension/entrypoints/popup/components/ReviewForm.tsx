import { useState } from 'preact/hooks';
import type { ReviewOut } from '@/lib/api/types';
import { callBackground } from '@/lib/messages';
import { useAction } from '../hooks';
import { ErrorText, Stars } from './common';

interface Props {
  vacancyHhId: string;
  review: ReviewOut | null;
  isRegistered: boolean;
  onChange: (review: ReviewOut | null) => void;
  onRegister: () => void;
}

export function ReviewForm({ vacancyHhId, review, isRegistered, onChange, onRegister }: Props) {
  const action = useAction();
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [text, setText] = useState(review?.text ?? '');
  const [isPublic, setIsPublic] = useState(review?.is_public ?? false);

  const dirty =
    rating !== (review?.rating ?? 0) ||
    text !== (review?.text ?? '') ||
    isPublic !== (review?.is_public ?? false);

  const save = async () => {
    const saved = await action.run(() =>
      callBackground('saveReview', {
        reviewId: review?.id ?? null,
        vacancyHhId,
        rating,
        text: text.trim() || null,
        isPublic: isRegistered && isPublic,
      }),
    );
    if (saved) onChange(saved);
  };

  const remove = async () => {
    if (!review) return;
    const done = await action.run(() => callBackground('deleteReview', { reviewId: review.id }));
    if (done !== undefined) {
      setRating(0);
      setText('');
      setIsPublic(false);
      onChange(null);
    }
  };

  return (
    <div class="stack">
      <Stars value={rating} onChange={setRating} disabled={action.busy} />
      <textarea
        rows={3}
        maxLength={10000}
        placeholder="Как прошёл отбор, сколько ждали ответа, что спрашивали…"
        value={text}
        disabled={action.busy}
        onInput={(e) => setText(e.currentTarget.value)}
      />
      <label class={isRegistered ? 'check' : 'check disabled'}>
        <input
          type="checkbox"
          checked={isRegistered && isPublic}
          disabled={!isRegistered || action.busy}
          onChange={(e) => setIsPublic(e.currentTarget.checked)}
        />
        Публичный — другие увидят его без вашего имени
      </label>
      {!isRegistered && (
        <p class="muted small">
          Публиковать отзывы могут зарегистрированные пользователи.{' '}
          <button type="button" class="link" onClick={onRegister}>
            Зарегистрироваться
          </button>
        </p>
      )}
      <ErrorText error={action.error} />
      <div class="row end">
        {review && (
          <button type="button" class="btn btn-ghost" disabled={action.busy} onClick={remove}>
            Удалить
          </button>
        )}
        <button
          type="button"
          class="btn btn-primary"
          disabled={action.busy || rating === 0 || (review !== null && !dirty)}
          onClick={save}
        >
          {review ? 'Сохранить' : 'Оставить отзыв'}
        </button>
      </div>
    </div>
  );
}
