import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  canStartConversation,
  conversationDetailRoute,
  conversationListRoute,
  startConversationErrorMessage,
  startConversationLabel,
  startConversationRequestBody,
  startConversationSuccessMessage,
  type ConversationTarget,
} from './startConversation';

const ownerTarget: ConversationTarget = {
  listingId: 11,
  counterpartId: 5,
  counterpartName: 'Owner Student',
  counterpartRole: 'owner',
};

const renterTarget: ConversationTarget = {
  listingId: 11,
  counterpartId: 9,
  counterpartName: 'Renter Student',
  counterpartRole: 'renter',
};

describe('US-16.7 start-conversation frontend helpers', () => {
  test('listing-page / my-requests body uses listing id and owner recipient', () => {
    assert.deepEqual(startConversationRequestBody(ownerTarget), {
      listing_id: 11,
      recipient_id: 5,
    });
    assert.equal(startConversationLabel('owner'), 'Message Owner');
  });

  test('incoming-requests body uses listing id and renter recipient', () => {
    assert.deepEqual(startConversationRequestBody(renterTarget), {
      listing_id: 11,
      recipient_id: 9,
    });
    assert.equal(startConversationLabel('renter'), 'Message Renter');
  });

  test('hidden rules still hide self and missing counterparts', () => {
    assert.equal(canStartConversation(5, ownerTarget), false);
    assert.equal(canStartConversation(9, ownerTarget), true);
    assert.equal(canStartConversation(undefined, ownerTarget), false);
    assert.equal(canStartConversation(9, null), false);
  });

  test('success messages distinguish 201 created and 200 existing without claiming a message was sent', () => {
    const created = startConversationSuccessMessage(ownerTarget, true);
    const existing = startConversationSuccessMessage(ownerTarget, false);

    assert.match(created, /Conversation started with Owner Student/i);
    assert.match(existing, /already open/i);
    assert.doesNotMatch(created, /message sent/i);
    assert.doesNotMatch(existing, /message sent/i);
  });

  test('routes point at the Conversations dashboard and shell', () => {
    assert.equal(conversationListRoute(), '/conversations');
    assert.equal(conversationDetailRoute(42), '/conversations/42');
  });

  test('error helper surfaces API and network failure text', () => {
    assert.equal(
      startConversationErrorMessage(
        new Error('Non-owners may only start a conversation with the listing owner')
      ),
      'Non-owners may only start a conversation with the listing owner'
    );
    assert.equal(startConversationErrorMessage('boom'), 'Unable to start conversation');
  });
});
