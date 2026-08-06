/**
 * US-16.1 / US-16.6 — start-conversation flow helpers.
 *
 * Three entry points share one control and one target shape:
 *   /listings/:id   renter -> listing owner   (owner card, under contact details)
 *   /my-requests    renter -> listing owner   (per request card)
 *   /requests       listing owner -> renter   (per request card)
 *
 * After start, users stay on the current page with a link to the Conversations
 * dashboard. Message sending belongs to US-17.
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

/** Body shape for POST /api/conversations — recipient is never the viewer. */
export function startConversationRequestBody(target: ConversationTarget): {
  listing_id: number;
  recipient_id: number;
} {
  return {
    listing_id: target.listingId,
    recipient_id: target.counterpartId,
  };
}

export function startConversationSuccessMessage(
  target: ConversationTarget,
  created: boolean
): string {
  if (created) {
    return `Conversation started with ${target.counterpartName}.`;
  }
  return `Conversation with ${target.counterpartName} is already open.`;
}

export function startConversationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to start conversation';
}

export { conversationDetailRoute, conversationListRoute };

/** @deprecated Prefer conversationDetailRoute — kept for older US-16.1 notes. */
export function conversationRoute(conversationId: number): string {
  return conversationDetailRoute(conversationId);
}
