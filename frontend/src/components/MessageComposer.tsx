import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import {
  MESSAGE_COMPOSER_PLACEHOLDER,
  MESSAGE_MAX_LENGTH,
  canSendMessage,
  composerHelperText,
  sendMessageErrorMessage,
  sendMessageLabel,
  sendMessageRequestBody,
  type ConversationMessage,
} from '../utils/sendMessage';

interface Props {
  conversationId: number;
  viewerId: number | undefined;
  participantIds: number[] | undefined;
  disabled?: boolean;
  /** Called with the server-returned message after a successful send. */
  onSent?: (message: ConversationMessage) => void;
}

/**
 * US-17.2 / US-17.6 — message composer wired to POST /api/conversations/:id/messages.
 */
export default function MessageComposer({
  conversationId,
  viewerId,
  participantIds,
  disabled = false,
  onSent,
}: Props) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const sendEnabled =
    !disabled &&
    canSendMessage({
      draft,
      sending,
      viewerId,
      participantIds,
    });

  const helperText = composerHelperText(draft);
  const label = sendMessageLabel(sending);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (
      disabled ||
      sending ||
      !canSendMessage({
        draft,
        sending,
        viewerId,
        participantIds,
      })
    ) {
      return;
    }

    // Trimmed body only — never send sender_id from the client.
    const body = sendMessageRequestBody(draft);
    setSending(true);
    try {
      const sent = await api.sendMessage(conversationId, body);
      setDraft('');
      setError('');
      setSuccess('Message sent.');
      onSent?.(sent);
    } catch (err) {
      setError(sendMessageErrorMessage(err));
      // Keep the typed draft on error; do not invent a message row.
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 border-t border-slate-100 pt-4">
      <label htmlFor="conversation-message" className="mb-1 block text-sm font-medium text-slate-700">
        Message
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <textarea
          id="conversation-message"
          className="input-field min-h-[5.5rem] flex-1 resize-y"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError('');
            if (success) setSuccess('');
          }}
          placeholder={MESSAGE_COMPOSER_PLACEHOLDER}
          maxLength={MESSAGE_MAX_LENGTH + 200}
          disabled={disabled || sending}
          aria-busy={sending}
        />
        <button
          type="submit"
          className="btn-primary w-full shrink-0 sm:w-auto"
          disabled={!sendEnabled}
          aria-label={label}
        >
          {label}
        </button>
      </div>

      {helperText && (
        <p
          className={`mt-2 text-xs ${
            helperText.includes('too long') ? 'text-red-600' : 'text-slate-500'
          }`}
        >
          {helperText}
        </p>
      )}

      {success && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </form>
  );
}
