/**
 * US-18.6 — frontend helper coverage mapped to TAC conversation-history UX.
 *
 * TAC Test 1 — Open conversation → loaded history retained for display
 * TAC Test 2 — View chronological order → oldest → newest preparation
 * TAC Test 3 — Access previous messages → history survives reload + scroll helpers
 * TAC Test 4 — Unauthorized access → 403 clears messages / surfaces denial
 *
 * Also covers sender labels, timestamps, active conversation, empty state,
 * append-after-send, and duplicate-id protection used by US-18.5 integration.
 *
 * Limitation: no React DOM framework is installed; ConversationDetailPage /
 * ConversationHistoryThread rendering is not exercised here.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  EMPTY_THREAD_MESSAGE,
  HISTORY_SECTION_LABEL,
  OWN_MESSAGE_SENDER_LABEL,
  appendHistoryAfterSend,
  applyHistoryLoadFailure,
  applyLoadedHistory,
  buildConversationHistoryCall,
  conversationDetailRoute,
  conversationHistoryPath,
  conversationListItemClassName,
  historyEmptyStateTitle,
  historyHeaderEyebrow,
  historyHeaderSubtitle,
  historyHeaderTitle,
  historyMessageMetaLine,
  historyMessageSenderName,
  historyScrollRegionClassName,
  isActiveConversation,
  mapServerHistoryMessages,
  prepareHistoryMessages,
  toActiveConversationIdentity,
  type ConversationListItemLike,
  type ConversationMessage,
} from './conversationHistory';

const sampleConversation: ConversationListItemLike = {
  id: 44,
  listing: { id: 8, title: 'Campus Tripod' },
  counterpart: { id: 4, first_name: 'Owner', last_name: 'Student' },
  latest_message_preview: null,
  created_at: '2026-08-08T12:00:00.000Z',
  updated_at: '2026-08-08T13:00:00.000Z',
};

const own: ConversationMessage = {
  id: 1,
  conversation_id: 44,
  sender_id: 9,
  body: 'Hello from me',
  created_at: '2026-08-08T12:00:00.000Z',
};

const counterpart: ConversationMessage = {
  id: 2,
  conversation_id: 44,
  sender_id: 4,
  body: 'Hello back',
  created_at: '2026-08-08T12:05:00.000Z',
};

describe('US-18 TAC frontend acceptance helpers', () => {
  test('TAC Test 1 — Open conversation maps server history for display', () => {
    const call = buildConversationHistoryCall(44);
    assert.equal(call.path, conversationHistoryPath(44));
    assert.equal(call.path, '/conversations/44/messages');

    const loaded = applyLoadedHistory([counterpart, own]);
    assert.equal(loaded.error, '');
    assert.deepEqual(
      loaded.messages.map((message) => message.body),
      ['Hello from me', 'Hello back']
    );
    assert.equal(loaded.messages[0].id, 1);
    assert.equal(loaded.messages[0].created_at, own.created_at);

    const identity = toActiveConversationIdentity(sampleConversation);
    assert.equal(historyHeaderEyebrow(), HISTORY_SECTION_LABEL);
    assert.equal(historyHeaderTitle(identity), 'Owner Student');
    assert.equal(historyHeaderSubtitle(identity), 'Listing: Campus Tripod');
    assert.equal(conversationDetailRoute(44), '/conversations/44');
    assert.equal(isActiveConversation(44, 44), true);
    assert.match(conversationListItemClassName(true), /ring-campus-500/);
  });

  test('TAC Test 2 — View chronological order prepares correct sequence', () => {
    const ordered = prepareHistoryMessages([counterpart, own]);
    assert.deepEqual(
      ordered.map((message) => message.body),
      ['Hello from me', 'Hello back']
    );
    assert.deepEqual(
      mapServerHistoryMessages([counterpart, own]).map((message) => message.id),
      [1, 2]
    );

    const sameTimeEarlierId: ConversationMessage = {
      id: 3,
      conversation_id: 44,
      sender_id: 9,
      body: 'Tie A',
      created_at: '2026-08-08T12:10:00.000Z',
    };
    const sameTimeLaterId: ConversationMessage = {
      id: 4,
      conversation_id: 44,
      sender_id: 4,
      body: 'Tie B',
      created_at: '2026-08-08T12:10:00.000Z',
    };
    assert.deepEqual(
      prepareHistoryMessages([sameTimeLaterId, sameTimeEarlierId]).map((m) => m.body),
      ['Tie A', 'Tie B']
    );
  });

  test('TAC Test 3 — Access previous messages retains history and scroll/meta helpers', () => {
    const loaded = applyLoadedHistory([own, counterpart]).messages;
    const reloaded = applyLoadedHistory(loaded).messages;
    assert.deepEqual(reloaded, loaded);

    assert.equal(historyMessageSenderName(own, 9, 'Owner Student'), OWN_MESSAGE_SENDER_LABEL);
    assert.equal(historyMessageSenderName(counterpart, 9, 'Owner Student'), 'Owner Student');
    assert.match(historyMessageMetaLine(own, 9, 'Owner Student'), /^You · /);
    assert.match(historyMessageMetaLine(counterpart, 9, 'Owner Student'), /^Owner Student · /);

    const scroll = historyScrollRegionClassName();
    assert.match(scroll, /overflow-y-auto/);
    assert.match(scroll, /max-h-\[28rem\]/);
    assert.match(scroll, /min-h-\[14rem\]/);

    const sent: ConversationMessage = {
      id: 5,
      conversation_id: 44,
      sender_id: 9,
      body: 'Follow-up after history load',
      created_at: '2026-08-08T12:20:00.000Z',
    };
    const afterSend = appendHistoryAfterSend(reloaded, sent);
    assert.deepEqual(
      afterSend.map((message) => message.body),
      ['Hello from me', 'Hello back', 'Follow-up after history load']
    );
    assert.equal(afterSend.length, 3);

    const deduped = appendHistoryAfterSend(afterSend, sent);
    assert.equal(deduped.length, 3);
  });

  test('TAC Test 4 — Unauthorized history access clears messages and surfaces denial', () => {
    const denied = applyHistoryLoadFailure(
      new Error('Only conversation participants may view messages in this conversation')
    );
    assert.deepEqual(denied.messages, []);
    assert.match(denied.error, /participant/i);

    const empty = applyLoadedHistory([]);
    assert.deepEqual(empty.messages, []);
    assert.equal(historyEmptyStateTitle(), EMPTY_THREAD_MESSAGE);
    assert.equal(isActiveConversation(44, undefined), false);
  });
});
