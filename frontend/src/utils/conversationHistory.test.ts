import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  EMPTY_THREAD_MESSAGE,
  HISTORY_EMPTY_GUIDANCE,
  HISTORY_SECTION_LABEL,
  OWN_MESSAGE_SENDER_LABEL,
  conversationDetailRoute,
  conversationListItemClassName,
  conversationListPreview,
  conversationListRoute,
  historyEmptyStateBody,
  historyEmptyStateTitle,
  historyHeaderEyebrow,
  historyHeaderSubtitle,
  historyHeaderTitle,
  historyLoadErrorMessage,
  historyMessageMetaLine,
  historyMessageSenderName,
  historyScrollRegionClassName,
  historySenderLabelClassName,
  isActiveConversation,
  messageBubbleClassName,
  prepareHistoryMessages,
  toActiveConversationIdentity,
  type ConversationListItemLike,
  type ConversationMessage,
} from './conversationHistory';

const sampleConversation: ConversationListItemLike = {
  id: 15,
  listing: { id: 3, title: 'Campus Camera' },
  counterpart: { id: 4, first_name: 'Owner', last_name: 'Student' },
  latest_message_preview: 'See you at the library',
  created_at: '2026-08-08T12:00:00.000Z',
  updated_at: '2026-08-08T13:00:00.000Z',
};

const ownMessage: ConversationMessage = {
  id: 1,
  conversation_id: 15,
  sender_id: 9,
  body: 'Hello',
  created_at: '2026-08-08T12:00:00.000Z',
};

const counterpartMessage: ConversationMessage = {
  id: 2,
  conversation_id: 15,
  sender_id: 4,
  body: 'Hi there',
  created_at: '2026-08-08T12:05:00.000Z',
};

describe('US-18.1 conversation-list and history layout helpers', () => {
  test('list design exposes counterpart, listing, preview, routes, and active state', () => {
    const identity = toActiveConversationIdentity(sampleConversation);
    assert.equal(identity.counterpartName, 'Owner Student');
    assert.equal(identity.listingTitle, 'Campus Camera');
    assert.equal(conversationListPreview(sampleConversation), 'See you at the library');
    assert.equal(
      conversationListPreview({ ...sampleConversation, latest_message_preview: null }),
      EMPTY_THREAD_MESSAGE
    );
    assert.equal(conversationListRoute(), '/conversations');
    assert.equal(conversationDetailRoute(15), '/conversations/15');
    assert.equal(isActiveConversation(15, 15), true);
    assert.equal(isActiveConversation(15, 99), false);
    assert.equal(isActiveConversation(15, undefined), false);

    const activeClass = conversationListItemClassName(true);
    const idleClass = conversationListItemClassName(false);
    assert.match(activeClass, /ring-campus-500/);
    assert.match(activeClass, /border-campus-300/);
    assert.doesNotMatch(idleClass, /ring-campus-500\/30/);
  });

  test('history header clearly identifies the active conversation', () => {
    const identity = toActiveConversationIdentity(sampleConversation);
    assert.equal(historyHeaderEyebrow(), HISTORY_SECTION_LABEL);
    assert.equal(historyHeaderTitle(identity), 'Owner Student');
    assert.equal(historyHeaderSubtitle(identity), 'Listing: Campus Camera');
  });

  test('every history message has sender name and timestamp meta', () => {
    assert.equal(
      historyMessageSenderName(ownMessage, 9, 'Owner Student'),
      OWN_MESSAGE_SENDER_LABEL
    );
    assert.equal(
      historyMessageSenderName(counterpartMessage, 9, 'Owner Student'),
      'Owner Student'
    );
    assert.equal(historyMessageSenderName(counterpartMessage, 9, ''), 'CampusRent user');

    const ownMeta = historyMessageMetaLine(ownMessage, 9, 'Owner Student');
    assert.match(ownMeta, /^You · /);
    const otherMeta = historyMessageMetaLine(counterpartMessage, 9, 'Owner Student');
    assert.match(otherMeta, /^Owner Student · /);
  });

  test('history remains chronological oldest-to-newest and reuses sent/received styles', () => {
    const ordered = prepareHistoryMessages([counterpartMessage, ownMessage]);
    assert.deepEqual(
      ordered.map((message) => message.id),
      [1, 2]
    );
    assert.match(messageBubbleClassName('own'), /bg-campus-600/);
    assert.match(messageBubbleClassName('counterpart'), /bg-slate-100/);
    assert.match(historySenderLabelClassName('own'), /text-campus-700/);
    assert.match(historySenderLabelClassName('counterpart'), /text-slate-600/);
  });

  test('scroll region, empty, and error states are defined for US-18.2', () => {
    const scroll = historyScrollRegionClassName();
    assert.match(scroll, /overflow-y-auto/);
    assert.match(scroll, /max-h-\[28rem\]/);
    assert.equal(historyEmptyStateTitle(), EMPTY_THREAD_MESSAGE);
    assert.equal(historyEmptyStateBody(), HISTORY_EMPTY_GUIDANCE);
    assert.equal(
      historyLoadErrorMessage(new Error('Only conversation participants may view messages')),
      'Only conversation participants may view messages'
    );
    assert.equal(historyLoadErrorMessage('x'), 'Unable to load conversation history');
  });
});
