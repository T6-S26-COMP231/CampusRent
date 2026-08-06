import { MessageCircle } from 'lucide-react';
import {
  canStartConversation,
  ConversationTarget,
  STARTING_CONVERSATION_LABEL,
  startConversationLabel,
} from '../utils/startConversation';

/**
 * US-16.2 — start-conversation control.
 * Network start is intentionally deferred to US-16.6; keep the control visible
 * but non-interactive until that integration lands. Do not fake success.
 */
const CONVERSATION_START_API_READY = false;

interface Props {
  viewerId: number | undefined;
  target: ConversationTarget | null;
  /** Parent action busy (approve/cancel/etc.) — keeps the control disabled while those run. */
  disabled?: boolean;
  /** Reserved for US-16.6 loading feedback. */
  starting?: boolean;
  className?: string;
}

export default function StartConversationButton({
  viewerId,
  target,
  disabled = false,
  starting = false,
  className = '',
}: Props) {
  if (!canStartConversation(viewerId, target) || !target) return null;

  const awaitingApi = !CONVERSATION_START_API_READY;
  const isDisabled = awaitingApi || disabled || starting;
  const label = starting
    ? STARTING_CONVERSATION_LABEL
    : startConversationLabel(target.counterpartRole);

  return (
    <button
      type="button"
      className={`btn-secondary ${className}`.trim()}
      disabled={isDisabled}
      title={
        awaitingApi
          ? 'Conversation start will be enabled when the API is connected (US-16.6).'
          : undefined
      }
      aria-label={label}
    >
      <MessageCircle className="h-4 w-4" />
      {label}
    </button>
  );
}
