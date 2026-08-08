/**
 * US-17.1 — message composer and send-state design.
 *
 * Lives on ConversationDetailPage (US-16 shell), not on ConversationsPage.
 * Layout (for US-17.2 implementation):
 *   1. Header — counterpart name + listing (existing shell)
 *   2. Chat window — chronological message list (scrollable)
 *   3. Composer — textarea + Send button pinned under the list
 *
 * Composer control:
 *   - Multiline textarea using existing `input-field` class
 *   - Send button using `btn-primary`, beside the textarea on sm+ /
 *     full-width under the textarea on narrow viewports
 *   - Form submit (button type="submit") — no app-wide Ctrl/Cmd+Enter
 *     convention exists, so Enter inserts a newline in the textarea
 *
 * Blank / whitespace:
 *   - Body is trimmed before send; empty or whitespace-only is rejected
 *   - Send stays disabled while blank; never invent placeholder text
 *
 * Sending state:
 *   - Disable textarea + Send while `sending` (double-submit guard)
 *   - Label switches to "Sending..."
 *   - On success: clear draft, append returned message to the list
 *     immediately (after successful submit — not optimistic-before-response)
 *   - On server/network error: keep draft, show error near composer
 *
 * Display:
 *   - Own messages right-aligned (campus accent bubble)
 *   - Counterpart messages left-aligned (slate bubble)
 *   - Oldest → newest chronological order; timestamps under each bubble
 *
 * Persistence / API / Mongo Message model belong to later US-17 tasks.
 * This module only captures frontend design shapes and pure helpers.
 */

import { formatConversationTime } from './conversations';

/** Soft client design limit — server enforcement is US-17.5. */
export const MESSAGE_MAX_LENGTH = 2000;

export const SEND_MESSAGE_LABEL = 'Send';
export const SENDING_MESSAGE_LABEL = 'Sending...';
export const MESSAGE_COMPOSER_PLACEHOLDER = 'Write a message…';
export const EMPTY_THREAD_MESSAGE = 'No messages yet';

/** Frontend message shape expected from a future send/list API (not a DB model). */
export interface ConversationMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  body: string;
  created_at: string;
}

export type MessageBubbleSide = 'own' | 'counterpart';

export interface ComposerSendGate {
  draft: string;
  sending: boolean;
  viewerId: number | undefined;
  participantIds: number[] | undefined;
}

/** Trim for validation and for the eventual request body. */
export function normalizeMessageBody(raw: string): string {
  return raw.trim();
}

export function isBlankMessage(raw: string): boolean {
  return normalizeMessageBody(raw).length === 0;
}

export function isOverMaxLength(raw: string): boolean {
  return normalizeMessageBody(raw).length > MESSAGE_MAX_LENGTH;
}

export function isConversationParticipant(
  viewerId: number | undefined,
  participantIds: number[] | undefined
): boolean {
  if (!viewerId || !participantIds || participantIds.length === 0) return false;
  return participantIds.includes(viewerId);
}

/**
 * Client gate before any future network call.
 * Non-participants cannot send (composer should be hidden/disabled in UI).
 */
export function canSendMessage(gate: ComposerSendGate): boolean {
  if (gate.sending) return false;
  if (!isConversationParticipant(gate.viewerId, gate.participantIds)) return false;
  if (isBlankMessage(gate.draft)) return false;
  if (isOverMaxLength(gate.draft)) return false;
  return true;
}

export function sendMessageLabel(sending: boolean): string {
  return sending ? SENDING_MESSAGE_LABEL : SEND_MESSAGE_LABEL;
}

/** Body shape for POST /api/conversations/:id/messages — never includes sender_id. */
export function sendMessageRequestBody(draft: string): { body: string } {
  return { body: normalizeMessageBody(draft) };
}

/** Path used by the US-17.6 frontend API client. */
export function conversationMessagesPath(conversationId: number): string {
  return `/conversations/${conversationId}/messages`;
}

/**
 * Pure request descriptor for tests and the composer integration.
 * Guarantees trimmed body and no client-supplied sender_id.
 */
export function buildSendMessageCall(
  conversationId: number,
  draft: string
): { path: string; body: { body: string } } {
  return {
    path: conversationMessagesPath(conversationId),
    body: sendMessageRequestBody(draft),
  };
}

/** After a successful API response: append server message and clear draft/error. */
export function applySuccessfulSend(
  messages: ConversationMessage[],
  sent: ConversationMessage
): { messages: ConversationMessage[]; draft: string; error: string; success: string } {
  return {
    messages: appendSentMessage(messages, sent),
    draft: '',
    error: '',
    success: 'Message sent.',
  };
}

/** On failure: keep the typed draft and surface the error. */
export function applyFailedSend(
  draft: string,
  error: unknown
): { draft: string; error: string; success: string } {
  return {
    draft,
    error: sendMessageErrorMessage(error),
    success: '',
  };
}

export function sendMessageErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to send message';
}

export function isOwnMessage(
  message: Pick<ConversationMessage, 'sender_id'>,
  viewerId: number | undefined
): boolean {
  return Boolean(viewerId) && message.sender_id === viewerId;
}

export function messageBubbleSide(
  message: Pick<ConversationMessage, 'sender_id'>,
  viewerId: number | undefined
): MessageBubbleSide {
  return isOwnMessage(message, viewerId) ? 'own' : 'counterpart';
}

/** Tailwind utility bundles for US-17.2 bubble rendering. */
export function messageBubbleClassName(side: MessageBubbleSide): string {
  if (side === 'own') {
    return 'ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-campus-600 px-4 py-2.5 text-sm text-white';
  }
  return 'mr-auto max-w-[80%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-2.5 text-sm text-slate-800';
}

export function messageRowClassName(side: MessageBubbleSide): string {
  return side === 'own' ? 'flex flex-col items-end' : 'flex flex-col items-start';
}

export function formatMessageTime(iso: string): string {
  return formatConversationTime(iso);
}

/** Stable oldest → newest order for chat windows. */
export function sortMessagesChronologically(
  messages: ConversationMessage[]
): ConversationMessage[] {
  return [...messages].sort((a, b) => {
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return a.id - b.id;
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    if (aTime === bTime) return a.id - b.id;
    return aTime - bTime;
  });
}

/**
 * After a successful send response, append the server message and keep order.
 * Does not invent messages — caller must pass the API-returned row.
 * Skips insert when the same message id is already in the thread (US-18.5).
 */
export function appendSentMessage(
  messages: ConversationMessage[],
  sent: ConversationMessage
): ConversationMessage[] {
  if (messages.some((message) => message.id === sent.id)) {
    return sortMessagesChronologically(messages);
  }
  return sortMessagesChronologically([...messages, sent]);
}

export function composerHelperText(draft: string): string | null {
  if (isBlankMessage(draft)) return null;
  const length = normalizeMessageBody(draft).length;
  if (length > MESSAGE_MAX_LENGTH) {
    return `Message is too long (${length}/${MESSAGE_MAX_LENGTH}).`;
  }
  if (length >= MESSAGE_MAX_LENGTH - 100) {
    return `${length}/${MESSAGE_MAX_LENGTH}`;
  }
  return null;
}
