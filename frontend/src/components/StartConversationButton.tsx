import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { api } from '../api/client';
import {
  canStartConversation,
  ConversationTarget,
  STARTING_CONVERSATION_LABEL,
  startConversationErrorMessage,
  startConversationLabel,
  startConversationRequestBody,
  startConversationSuccessMessage,
  validateInitialConversationMessage,
} from '../utils/startConversation';

export interface StartConversationSuccess {
  message: string;
  conversationId: number;
  created: boolean;
}

interface Props {
  viewerId: number | undefined;
  target: ConversationTarget | null;
  /** Parent action busy (approve/cancel/etc.) — keeps the control disabled while those run. */
  disabled?: boolean;
  className?: string;
  onSuccess?: (result: StartConversationSuccess) => void;
  onError?: (message: string) => void;
}

/**
 * US-16 — start-conversation control.
 * Requires a nonblank initial message; posts Conversation + first Message together.
 */
export default function StartConversationButton({
  viewerId,
  target,
  disabled = false,
  className = '',
  onSuccess,
  onError,
}: Props) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [initialMessage, setInitialMessage] = useState('');
  const [validationError, setValidationError] = useState('');
  const [starting, setStarting] = useState(false);

  if (!canStartConversation(viewerId, target) || !target) return null;

  const isDisabled = disabled || starting;
  const openLabel = startConversationLabel(target.counterpartRole);

  const closeComposer = () => {
    if (starting) return;
    setComposerOpen(false);
    setInitialMessage('');
    setValidationError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isDisabled) return;

    const validation = validateInitialConversationMessage(initialMessage);
    if (validation) {
      setValidationError(validation);
      onError?.(validation);
      return;
    }

    setValidationError('');
    setStarting(true);
    try {
      const result = await api.startConversation(
        startConversationRequestBody(target, initialMessage)
      );
      onSuccess?.({
        message: startConversationSuccessMessage(target, result.created),
        conversationId: result.conversation.id,
        created: result.created,
      });
      setComposerOpen(false);
      setInitialMessage('');
    } catch (error) {
      onError?.(startConversationErrorMessage(error));
    } finally {
      setStarting(false);
    }
  };

  if (!composerOpen) {
    return (
      <button
        type="button"
        className={`btn-secondary ${className}`.trim()}
        disabled={isDisabled}
        onClick={() => setComposerOpen(true)}
        aria-label={openLabel}
      >
        <MessageCircle className="h-4 w-4" />
        {openLabel}
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-2xl border border-campus-100 bg-campus-50/50 p-4 ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Start conversation with {target.counterpartName}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Send an initial message to open this conversation. Empty conversations are not allowed.
          </p>
        </div>
        <button
          type="button"
          onClick={closeComposer}
          disabled={starting}
          className="rounded-full p-1.5 text-slate-500 hover:bg-white hover:text-slate-800"
          aria-label="Cancel starting conversation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <label className="mt-3 block text-sm font-semibold text-slate-700" htmlFor="initial-conversation-message">
        Initial message *
      </label>
      <textarea
        id="initial-conversation-message"
        className="input-field mt-1.5 min-h-[96px]"
        value={initialMessage}
        onChange={(event) => {
          setInitialMessage(event.target.value);
          if (validationError) setValidationError('');
        }}
        placeholder="Write your first message…"
        disabled={starting}
        required
      />
      {validationError && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {validationError}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={isDisabled} aria-busy={starting}>
          <MessageCircle className="h-4 w-4" />
          {starting ? STARTING_CONVERSATION_LABEL : 'Send & start conversation'}
        </button>
        <button type="button" className="btn-secondary" onClick={closeComposer} disabled={starting}>
          Cancel
        </button>
      </div>
    </form>
  );
}
