/**
 * US-18.1 — conversation-list and history layout design.
 *
 * Builds on US-16 (list/shell) and US-17 (send + minimal participant-only GET
 * /api/conversations/:id/messages). Do not invent a second messages endpoint;
 * US-18.2–18.5 reuse that active-thread retrieval for history display.
 *
 * Conversation list (ConversationsPage — US-18.2):
 *   - Counterpart name (primary)
 *   - Listing title as context
 *   - Latest preview via existing conversationPreviewText / latest_message_preview
 *     (truthful “No messages yet” when empty — never invent text)
 *   - Updated time on the trailing edge
 *   - Active/selected row when the open conversation id matches
 *   - Navigate with conversationDetailRoute(id)
 *
 * History layout (ConversationDetailPage — US-18.2):
 *   1. Back link to conversation list
 *   2. Active-conversation header — counterpart + listing + “Conversation history”
 *   3. Scrollable history region (oldest → newest)
 *   4. Each message: sender display name, body, timestamp; sent/received styles
 *   5. MessageComposer remains beneath the history region (US-17)
 *
 * Sender name (TAC): every historical message shows a name.
 *   - Own messages → “You”
 *   - Counterpart → conversationCounterpartName
 *   - Unknown sender_id → “CampusRent user”
 * Timestamps reuse formatMessageTime from US-17.
 *
 * States:
 *   - Loading: pulse placeholder for list and history shell
 *   - Empty history: EMPTY_THREAD_MESSAGE + short guidance
 *   - Error: red banner (existing CampusRent pattern)
 *   - Unauthorized: rely on existing 403 from GET detail/messages (US-18.4)
 */

import {
  conversationCounterpartName,
  conversationDetailRoute,
  conversationListRoute,
  conversationListingTitle,
  conversationPreviewText,
  conversationsEmptyMessage,
  formatConversationTime,
  NO_MESSAGES_PREVIEW,
  type ConversationListItemLike,
} from './conversations';
import {
  EMPTY_THREAD_MESSAGE,
  formatMessageTime,
  messageBubbleClassName,
  messageBubbleSide,
  messageRowClassName,
  sortMessagesChronologically,
  type ConversationMessage,
  type MessageBubbleSide,
} from './sendMessage';

export {
  conversationCounterpartName,
  conversationDetailRoute,
  conversationListRoute,
  conversationListingTitle,
  conversationPreviewText,
  conversationsEmptyMessage,
  formatConversationTime,
  NO_MESSAGES_PREVIEW,
  EMPTY_THREAD_MESSAGE,
  formatMessageTime,
  messageBubbleClassName,
  messageBubbleSide,
  messageRowClassName,
  sortMessagesChronologically,
};

export type { ConversationListItemLike, ConversationMessage, MessageBubbleSide };

export const HISTORY_SECTION_LABEL = 'Conversation history';
export const HISTORY_EMPTY_GUIDANCE =
  'Messages you exchange will appear here in chronological order.';
export const HISTORY_LOAD_ERROR_FALLBACK = 'Unable to load conversation history';
export const OWN_MESSAGE_SENDER_LABEL = 'You';
export const UNKNOWN_SENDER_LABEL = 'CampusRent user';

/** List row + history header share this active-conversation identity shape. */
export interface ActiveConversationIdentity {
  id: number;
  counterpartName: string;
  listingTitle: string;
}

export function isActiveConversation(
  conversationId: number,
  openConversationId: number | undefined
): boolean {
  return (
    openConversationId != null &&
    Number.isInteger(openConversationId) &&
    openConversationId > 0 &&
    conversationId === openConversationId
  );
}

/** Tailwind classes for a conversations-list row; active row is visually marked. */
export function conversationListItemClassName(isActive: boolean): string {
  const base =
    'card block transition hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus:ring-2 focus:ring-campus-500 focus:ring-offset-2';
  if (isActive) {
    return `${base} border-campus-300 ring-2 ring-campus-500/30 bg-campus-50/40`;
  }
  return base;
}

export function conversationListPreview(
  conversation: ConversationListItemLike
): string {
  return conversationPreviewText(conversation);
}

export function toActiveConversationIdentity(
  conversation: ConversationListItemLike
): ActiveConversationIdentity {
  return {
    id: conversation.id,
    counterpartName: conversationCounterpartName(conversation),
    listingTitle: conversationListingTitle(conversation),
  };
}

/** Header eyebrow + title copy for the open conversation. */
export function historyHeaderEyebrow(): string {
  return HISTORY_SECTION_LABEL;
}

export function historyHeaderTitle(identity: ActiveConversationIdentity): string {
  return identity.counterpartName;
}

export function historyHeaderSubtitle(identity: ActiveConversationIdentity): string {
  return `Listing: ${identity.listingTitle}`;
}

/**
 * Resolve the display name for a history message.
 * Does not invent people — only You / known counterpart / fallback label.
 */
export function historyMessageSenderName(
  message: Pick<ConversationMessage, 'sender_id'>,
  viewerId: number | undefined,
  counterpartName: string
): string {
  if (viewerId && message.sender_id === viewerId) {
    return OWN_MESSAGE_SENDER_LABEL;
  }
  const name = counterpartName.trim();
  if (name) return name;
  return UNKNOWN_SENDER_LABEL;
}

/** Meta line under each bubble: "Name · timestamp". */
export function historyMessageMetaLine(
  message: Pick<ConversationMessage, 'sender_id' | 'created_at'>,
  viewerId: number | undefined,
  counterpartName: string
): string {
  const sender = historyMessageSenderName(message, viewerId, counterpartName);
  return `${sender} · ${formatMessageTime(message.created_at)}`;
}

/** Scrollable history pane — keeps composer outside this region. */
export function historyScrollRegionClassName(): string {
  return 'mt-6 flex max-h-[28rem] min-h-[14rem] flex-col gap-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4';
}

export function historySenderLabelClassName(side: MessageBubbleSide): string {
  if (side === 'own') {
    return 'mb-1 px-1 text-[11px] font-semibold text-campus-700';
  }
  return 'mb-1 px-1 text-[11px] font-semibold text-slate-600';
}

export function historyTimestampClassName(): string {
  return 'mt-1 px-1 text-[11px] font-medium text-slate-400';
}

export function historyEmptyStateTitle(): string {
  return EMPTY_THREAD_MESSAGE;
}

export function historyEmptyStateBody(): string {
  return HISTORY_EMPTY_GUIDANCE;
}

export function historyLoadErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : HISTORY_LOAD_ERROR_FALLBACK;
}

/**
 * Ordered history for the open conversation.
 * Reuses US-17 chronological sort (created_at, then id).
 */
export function prepareHistoryMessages(
  messages: ConversationMessage[]
): ConversationMessage[] {
  return sortMessagesChronologically(messages);
}
