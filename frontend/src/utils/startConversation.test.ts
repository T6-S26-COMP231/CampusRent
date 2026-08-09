import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  INITIAL_MESSAGE_REQUIRED_ERROR,
  canStartConversation,
  conversationDashboardPreview,
  conversationDetailRoute,
  conversationListRoute,
  startConversationErrorMessage,
  startConversationLabel,
  startConversationRequestBody,
  startConversationSuccessMessage,
  validateInitialConversationMessage,
  type ConversationTarget,
} from './startConversation';
import { NO_MESSAGES_PREVIEW } from './conversations';

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

describe('US-16 start-conversation frontend helpers', () => {
  test('start-conversation UI requires initial message', () => {
    assert.equal(validateInitialConversationMessage(''), INITIAL_MESSAGE_REQUIRED_ERROR);
    assert.equal(validateInitialConversationMessage('   '), INITIAL_MESSAGE_REQUIRED_ERROR);
    assert.equal(validateInitialConversationMessage(null), INITIAL_MESSAGE_REQUIRED_ERROR);
    assert.equal(validateInitialConversationMessage('Hello there'), null);
  });

  test('blank initial message does not produce a create API body', () => {
    assert.equal(validateInitialConversationMessage('\n\t'), INITIAL_MESSAGE_REQUIRED_ERROR);
    // Callers must not invoke api.startConversation when validate returns an error.
  });

  test('valid initial message builds create body with listing, recipient, and body', () => {
    assert.deepEqual(startConversationRequestBody(ownerTarget, '  Is this available?  '), {
      listing_id: 11,
      recipient_id: 5,
      body: 'Is this available?',
    });
    assert.equal(startConversationLabel('owner'), 'Message Owner');
  });

  test('incoming-requests body uses listing id and renter recipient', () => {
    assert.deepEqual(startConversationRequestBody(renterTarget, 'Thanks for requesting.'), {
      listing_id: 11,
      recipient_id: 9,
      body: 'Thanks for requesting.',
    });
    assert.equal(startConversationLabel('renter'), 'Message Renter');
  });

  test('hidden rules still hide self and missing counterparts', () => {
    assert.equal(canStartConversation(5, ownerTarget), false);
    assert.equal(canStartConversation(9, ownerTarget), true);
    assert.equal(canStartConversation(undefined, ownerTarget), false);
    assert.equal(canStartConversation(9, null), false);
  });

  test('success messages confirm the initial message was sent', () => {
    const created = startConversationSuccessMessage(ownerTarget, true);
    const existing = startConversationSuccessMessage(ownerTarget, false);

    assert.match(created, /Conversation started with Owner Student/i);
    assert.match(created, /message was sent/i);
    assert.match(existing, /already open/i);
    assert.match(existing, /message was sent/i);
  });

  test('dashboard preview shows latest message and falls back for legacy empty', () => {
    assert.equal(
      conversationDashboardPreview('Can we meet tomorrow?', NO_MESSAGES_PREVIEW),
      'Can we meet tomorrow?'
    );
    assert.equal(
      conversationDashboardPreview(null, NO_MESSAGES_PREVIEW),
      NO_MESSAGES_PREVIEW
    );
    assert.equal(conversationDashboardPreview('  ', NO_MESSAGES_PREVIEW), NO_MESSAGES_PREVIEW);
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
