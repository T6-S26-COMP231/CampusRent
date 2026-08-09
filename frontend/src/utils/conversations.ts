/**
 * US-16 — conversation list / shell helpers.
 *
 * List rows show participant names and latest_message_preview from the API.
 * When a real preview exists it is displayed; null (legacy empty) falls back to
 * NO_MESSAGES_PREVIEW without inventing message text.
 */

export const NO_MESSAGES_PREVIEW = 'No messages yet';

export interface ConversationListItemLike {
  id: number;
  listing?: { id: number; title: string } | null;
  counterpart?: {
    id: number;
    first_name: string;
    last_name: string;
  } | null;
  latest_message_preview?: string | null;
  created_at: string;
  updated_at: string;
}

export function conversationCounterpartName(
  conversation: ConversationListItemLike
): string {
  const counterpart = conversation.counterpart;
  if (!counterpart) return 'CampusRent user';
  const name = `${counterpart.first_name} ${counterpart.last_name}`.trim();
  return name || 'CampusRent user';
}

export function conversationListingTitle(
  conversation: ConversationListItemLike
): string {
  return conversation.listing?.title?.trim() || 'Listing unavailable';
}

/** Truthful preview until US-17 adds real messages. */
export function conversationPreviewText(
  conversation: ConversationListItemLike
): string {
  const preview = conversation.latest_message_preview?.trim();
  return preview || NO_MESSAGES_PREVIEW;
}

export function conversationListRoute(): string {
  return '/conversations';
}

export function conversationDetailRoute(conversationId: number): string {
  return `/conversations/${conversationId}`;
}

export function formatConversationTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export function conversationsEmptyMessage(): string {
  return 'You have no active conversations yet. Start one from a listing or rental request.';
}
