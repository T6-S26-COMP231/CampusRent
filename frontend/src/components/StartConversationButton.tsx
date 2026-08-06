import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { api } from '../api/client';
import {
  canStartConversation,
  ConversationTarget,
  STARTING_CONVERSATION_LABEL,
  startConversationErrorMessage,
  startConversationLabel,
  startConversationRequestBody,
  startConversationSuccessMessage,
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
 * US-16.6 — start-conversation control wired to POST /api/conversations.
 * Does not navigate automatically; parents link to the Conversations dashboard.
 */
export default function StartConversationButton({
  viewerId,
  target,
  disabled = false,
  className = '',
  onSuccess,
  onError,
}: Props) {
  const [starting, setStarting] = useState(false);

  if (!canStartConversation(viewerId, target) || !target) return null;

  const isDisabled = disabled || starting;
  const label = starting
    ? STARTING_CONVERSATION_LABEL
    : startConversationLabel(target.counterpartRole);

  const handleClick = async () => {
    if (isDisabled) return;

    setStarting(true);
    try {
      const result = await api.startConversation(startConversationRequestBody(target));
      onSuccess?.({
        message: startConversationSuccessMessage(target, result.created),
        conversationId: result.conversation.id,
        created: result.created,
      });
    } catch (error) {
      onError?.(startConversationErrorMessage(error));
    } finally {
      setStarting(false);
    }
  };

  return (
    <button
      type="button"
      className={`btn-secondary ${className}`.trim()}
      disabled={isDisabled}
      onClick={handleClick}
      aria-label={label}
      aria-busy={starting}
    >
      <MessageCircle className="h-4 w-4" />
      {label}
    </button>
  );
}
