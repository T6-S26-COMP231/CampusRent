/**
 * US-16 — start-conversation flow helpers.
 *
 * Three entry points share one control and one target shape:
 *   /listings/:id   renter -> listing owner   (owner card, under contact details)
 *   /my-requests    renter -> listing owner   (per request card)
 *   /requests       listing owner -> renter   (per request card)
 *
 * TAC: empty conversations are not allowed. Start requires a nonblank initial
 * message that is persisted with the Conversation. Further messages are US-17.
 */

import {
  conversationDetailRoute,
  conversationListRoute,
} from './conversations';

export type ConversationCounterpartRole = 'owner' | 'renter';

export interface ConversationTarget {
  listingId: number;
  counterpartId: number;
  counterpartName: string;
  counterpartRole: ConversationCounterpartRole;
}

export const STARTING_CONVERSATION_LABEL = 'Starting conversation...';
export const INITIAL_MESSAGE_REQUIRED_ERROR =
  'Enter a nonblank message to start the conversation.';

export function canStartConversation(
  viewerId: number | undefined,
  target: ConversationTarget | null
): boolean {
  if (!viewerId || !target) return false;
  return target.counterpartId > 0 && target.counterpartId !== viewerId;
}

export function startConversationLabel(role: ConversationCounterpartRole): string {
  return role === 'owner' ? 'Message Owner' : 'Message Renter';
}

/** Validate the required first message before calling the API. */
export function validateInitialConversationMessage(
  message: string | null | undefined
): string | null {
  if (typeof message !== 'string' || message.trim().length === 0) {
    return INITIAL_MESSAGE_REQUIRED_ERROR;
  }
  return null;
}

/** Body shape for POST /api/conversations — recipient is never the viewer. */
export function startConversationRequestBody(
  target: ConversationTarget,
  initialMessage: string
): {
  listing_id: number;
  recipient_id: number;
  body: string;
} {
  return {
    listing_id: target.listingId,
    recipient_id: target.counterpartId,
    body: initialMessage.trim(),
  };
}

export function startConversationSuccessMessage(
  target: ConversationTarget,
  created: boolean
): string {
  if (created) {
    return `Conversation started with ${target.counterpartName}. Your message was sent.`;
  }
  return `Conversation with ${target.counterpartName} is already open. Your message was sent.`;
}

export function startConversationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to start conversation';
}

/**
 * Dashboard preview text: prefer the API latest_message_preview; fall back to
 * the truthful empty label only when no message exists (legacy empties).
 */
export function conversationDashboardPreview(
  latestMessagePreview: string | null | undefined,
  emptyLabel: string
): string {
  const preview = latestMessagePreview?.trim();
  return preview || emptyLabel;
}

export { conversationDetailRoute, conversationListRoute };

/** @deprecated Prefer conversationDetailRoute — kept for older US-16.1 notes. */
export function conversationRoute(conversationId: number): string {
  return conversationDetailRoute(conversationId);
}
