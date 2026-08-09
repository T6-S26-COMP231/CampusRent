/**
 * US-16 — frontend helper coverage mapped to TAC UX requirements.
 *
 * Contact Owner / Message Owner entry bodies require an initial message,
 * dashboard routes, participant display names, selectable conversation URLs,
 * and latest-message preview display.
 *
 * Limitation: no React DOM framework is installed; component rendering of
 * ConversationsPage / StartConversationButton is not exercised here — source
 * and helper contracts cover the acceptance mapping.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  INITIAL_MESSAGE_REQUIRED_ERROR,
  canStartConversation,
  conversationDashboardPreview,
  startConversationLabel,
  startConversationRequestBody,
  startConversationSuccessMessage,
  validateInitialConversationMessage,
  type ConversationTarget,
} from './startConversation';

const here = dirname(fileURLToPath(import.meta.url));
const buttonSource = readFileSync(
  join(here, '../components/StartConversationButton.tsx'),
  'utf8'
);
const conversationsPageSource = readFileSync(
  join(here, '../pages/ConversationsPage.tsx'),
  'utf8'
);
const clientSource = readFileSync(join(here, '../api/client.ts'), 'utf8');

describe('US-16 TAC frontend acceptance helpers', () => {
  test('start-conversation UI requires initial message and blanks do not call create API', () => {
    assert.equal(validateInitialConversationMessage(''), INITIAL_MESSAGE_REQUIRED_ERROR);
    assert.equal(validateInitialConversationMessage('   '), INITIAL_MESSAGE_REQUIRED_ERROR);
    assert.match(buttonSource, /validateInitialConversationMessage/);
    assert.match(buttonSource, /Send & start conversation/);
    assert.match(buttonSource, /api\.startConversation/);
    // Blank path returns before API call.
    assert.match(buttonSource, /if \(validation\)/);
  });

  test('valid initial message starts conversation with body field', () => {
    const ownerTarget: ConversationTarget = {
      listingId: 21,
      counterpartId: 4,
      counterpartName: 'Owner Student',
      counterpartRole: 'owner',
    };

    assert.equal(startConversationLabel('owner'), 'Message Owner');
    assert.deepEqual(startConversationRequestBody(ownerTarget, 'Is the camera free Friday?'), {
      listing_id: 21,
      recipient_id: 4,
      body: 'Is the camera free Friday?',
    });
    assert.equal(canStartConversation(4, ownerTarget), false);
    assert.equal(canStartConversation(9, ownerTarget), true);
    assert.match(clientSource, /body: string/);
    assert.match(startConversationSuccessMessage(ownerTarget, true), /message was sent/i);
  });

  test('Incoming Requests entry point targets eligible renter with initial message', () => {
    const renterTarget: ConversationTarget = {
      listingId: 21,
      counterpartId: 9,
      counterpartName: 'Renter Student',
      counterpartRole: 'renter',
    };

    assert.equal(startConversationLabel('renter'), 'Message Renter');
    assert.deepEqual(startConversationRequestBody(renterTarget, 'Pickup at Building A?'), {
      listing_id: 21,
      recipient_id: 9,
      body: 'Pickup at Building A?',
    });
  });

  test('conversation dashboard displays latest message preview from API', () => {
    assert.equal(conversationListRoute(), '/conversations');
    assert.equal(conversationDetailRoute(15), '/conversations/15');
    assert.match(conversationsPageSource, /conversationListPreview/);
    assert.match(conversationsPageSource, /conversationDetailRoute/);

    const withPreview = {
      id: 15,
      listing: { id: 21, title: 'Campus Camera' },
      counterpart: { id: 4, first_name: 'Owner', last_name: 'Student' },
      latest_message_preview: 'Is the camera free Friday?',
      created_at: '2026-08-06T12:00:00.000Z',
      updated_at: '2026-08-06T12:00:00.000Z',
    };

    assert.equal(conversationCounterpartName(withPreview), 'Owner Student');
    assert.equal(conversationListingTitle(withPreview), 'Campus Camera');
    assert.equal(conversationPreviewText(withPreview), 'Is the camera free Friday?');
    assert.equal(
      conversationDashboardPreview(withPreview.latest_message_preview, NO_MESSAGES_PREVIEW),
      'Is the camera free Friday?'
    );
  });

  test('preview updates according to returned newest message; legacy empty stays safe', () => {
    assert.equal(
      conversationPreviewText({
        id: 1,
        latest_message_preview: 'Newest reply',
        created_at: '',
        updated_at: '',
      }),
      'Newest reply'
    );
    assert.equal(
      conversationPreviewText({
        id: 1,
        latest_message_preview: null,
        created_at: '',
        updated_at: '',
      }),
      NO_MESSAGES_PREVIEW
    );
    assert.match(conversationsEmptyMessage(), /no active conversations/i);
  });

  test('existing conversation navigation still works', () => {
    assert.equal(conversationDetailRoute(42), '/conversations/42');
    assert.match(conversationsPageSource, /to=\{conversationDetailRoute\(conversation\.id\)\}/);
  });
});
