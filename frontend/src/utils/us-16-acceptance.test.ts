/**
 * US-16.7 — frontend helper coverage mapped to TAC UX requirements.
 *
 * Contact Owner / Message Owner entry bodies, dashboard routes, participant
 * display names, selectable conversation URLs, and truthful empty preview.
 *
 * Limitation: no React DOM framework is installed; component rendering of
 * ConversationsPage / StartConversationButton is not exercised here.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  conversationCounterpartName,
  conversationDetailRoute,
  conversationListRoute,
  conversationListingTitle,
  conversationPreviewText,
  conversationsEmptyMessage,
  NO_MESSAGES_PREVIEW,
} from './conversations';
import {
  canStartConversation,
  startConversationLabel,
  startConversationRequestBody,
  startConversationSuccessMessage,
  type ConversationTarget,
} from './startConversation';

describe('US-16 TAC frontend acceptance helpers', () => {
  test('Contact Owner entry point targets listing owner (listing page / My Requests)', () => {
    const ownerTarget: ConversationTarget = {
      listingId: 21,
      counterpartId: 4,
      counterpartName: 'Owner Student',
      counterpartRole: 'owner',
    };

    assert.equal(startConversationLabel('owner'), 'Message Owner');
    assert.deepEqual(startConversationRequestBody(ownerTarget), {
      listing_id: 21,
      recipient_id: 4,
    });
    assert.equal(canStartConversation(4, ownerTarget), false);
    assert.equal(canStartConversation(9, ownerTarget), true);
  });

  test('Incoming Requests entry point targets eligible renter', () => {
    const renterTarget: ConversationTarget = {
      listingId: 21,
      counterpartId: 9,
      counterpartName: 'Renter Student',
      counterpartRole: 'renter',
    };

    assert.equal(startConversationLabel('renter'), 'Message Renter');
    assert.deepEqual(startConversationRequestBody(renterTarget), {
      listing_id: 21,
      recipient_id: 9,
    });
  });

  test('dashboard is selectable and shows participant names with No messages yet preview', () => {
    assert.equal(conversationListRoute(), '/conversations');
    assert.equal(conversationDetailRoute(15), '/conversations/15');

    const summary = {
      id: 15,
      listing: { id: 21, title: 'Campus Camera' },
      counterpart: { id: 4, first_name: 'Owner', last_name: 'Student' },
      latest_message_preview: null,
      created_at: '2026-08-06T12:00:00.000Z',
      updated_at: '2026-08-06T12:00:00.000Z',
    };

    assert.equal(conversationCounterpartName(summary), 'Owner Student');
    assert.equal(conversationListingTitle(summary), 'Campus Camera');
    assert.equal(conversationPreviewText(summary), NO_MESSAGES_PREVIEW);
    assert.match(conversationsEmptyMessage(), /no active conversations/i);
  });

  test('201 and 200 success text never claim a message was sent', () => {
    const target: ConversationTarget = {
      listingId: 1,
      counterpartId: 2,
      counterpartName: 'Owner Student',
      counterpartRole: 'owner',
    };

    assert.match(startConversationSuccessMessage(target, true), /Conversation started/i);
    assert.match(startConversationSuccessMessage(target, false), /already open/i);
    assert.doesNotMatch(startConversationSuccessMessage(target, true), /message sent/i);
  });
});
