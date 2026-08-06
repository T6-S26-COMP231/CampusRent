/**
 * US-16.1 — start-conversation flow design.
 *
 * Three entry points share one control and one target shape:
 *   /listings/:id   renter -> listing owner   (owner card, under contact details)
 *   /my-requests    renter -> listing owner   (per request card)
 *   /requests       listing owner -> renter   (per request card)
 *
 * A conversation is always anchored to a listing plus the counterpart user, so
 * US-16.4 can post { listing_id, recipient_id } and US-16.5 can treat that pair
 * as the duplicate-prevention key.
 *
 * The control is hidden, not disabled, when there is no valid counterpart, so a
 * user is never offered a conversation with themselves. Request status does not
 * gate it: follow-up questions stay legitimate after a request is declined,
 * cancelled, or completed.
 *
 * Success stays on the current page with inline feedback until US-17 adds the
 * thread view; conversationRoute below reserves the target for that story.
 */

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

export function startConversationSuccessMessage(target: ConversationTarget): string {
  return `Conversation started with ${target.counterpartName}.`;
}

export function startConversationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to start conversation';
}

/** Reserved for US-17; the messages route does not exist yet. */
export function conversationRoute(conversationId: number): string {
  return `/messages/${conversationId}`;
}
