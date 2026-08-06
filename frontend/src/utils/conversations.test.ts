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
  type ConversationListItemLike,
} from './conversations';

const sample: ConversationListItemLike = {
  id: 7,
  listing: { id: 3, title: 'Campus Camera' },
  counterpart: { id: 2, first_name: 'Owner', last_name: 'Student' },
  latest_message_preview: null,
  created_at: '2026-08-06T12:00:00.000Z',
  updated_at: '2026-08-06T13:00:00.000Z',
};

describe('US-16.6 conversation list helpers', () => {
  test('maps counterpart name and listing title', () => {
    assert.equal(conversationCounterpartName(sample), 'Owner Student');
    assert.equal(conversationListingTitle(sample), 'Campus Camera');
  });

  test('uses truthful No messages yet preview when no message exists', () => {
    assert.equal(conversationPreviewText(sample), NO_MESSAGES_PREVIEW);
    assert.equal(conversationPreviewText(sample), 'No messages yet');
    assert.equal(
      conversationPreviewText({ ...sample, latest_message_preview: '  ' }),
      NO_MESSAGES_PREVIEW
    );
  });

  test('empty state copy is clear', () => {
    assert.match(conversationsEmptyMessage(), /no active conversations/i);
  });

  test('routes open the dashboard and selected conversation shell', () => {
    assert.equal(conversationListRoute(), '/conversations');
    assert.equal(conversationDetailRoute(7), '/conversations/7');
  });

  test('falls back when listing or counterpart is missing', () => {
    assert.equal(
      conversationCounterpartName({ ...sample, counterpart: null }),
      'CampusRent user'
    );
    assert.equal(
      conversationListingTitle({ ...sample, listing: null }),
      'Listing unavailable'
    );
  });
});
