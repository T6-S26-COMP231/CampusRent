/**
 * US-18.5 — history interface ↔ GET /api/conversations/:id/messages integration helpers.
 * Pure logic only; no new React test framework.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  EMPTY_THREAD_MESSAGE,
  OWN_MESSAGE_SENDER_LABEL,
  appendHistoryAfterSend,
  applyHistoryLoadFailure,
  applyLoadedHistory,
  buildConversationHistoryCall,
  conversationHistoryPath,
  historyEmptyStateTitle,
  historyLoadErrorMessage,
  historyMessageSenderName,
  mapServerHistoryMessages,
  prepareHistoryMessages,
  type ConversationMessage,
} from './conversationHistory';

const historyA: ConversationMessage = {
  id: 10,
  conversation_id: 55,
  sender_id: 9,
  body: 'First persisted',
  created_at: '2026-08-08T14:00:00.000Z',
};

const historyB: ConversationMessage = {
  id: 11,
  conversation_id: 55,
  sender_id: 4,
  body: 'Second persisted',
  created_at: '2026-08-08T14:05:00.000Z',
};

describe('US-18.5 conversation history integration helpers', () => {
  test('GET history call uses the conversation id path (no second endpoint)', () => {
    const call = buildConversationHistoryCall(55);
    assert.equal(call.conversationId, 55);
    assert.equal(call.path, '/conversations/55/messages');
    assert.equal(conversationHistoryPath(55), '/conversations/55/messages');
  });

  test('server history is mapped without losing ids, body, or timestamps', () => {
    const mapped = mapServerHistoryMessages([historyB, historyA]);
    assert.equal(mapped.length, 2);
    assert.deepEqual(mapped[0], historyA);
    assert.deepEqual(mapped[1], historyB);
    assert.equal(mapped[0].id, 10);
    assert.equal(mapped[0].body, 'First persisted');
    assert.equal(mapped[0].created_at, '2026-08-08T14:00:00.000Z');
    assert.equal(mapped[1].sender_id, 4);
  });

  test('own sender resolves to You and counterpart uses conversation name', () => {
    assert.equal(
      historyMessageSenderName(historyA, 9, 'Owner Student'),
      OWN_MESSAGE_SENDER_LABEL
    );
    assert.equal(
      historyMessageSenderName(historyB, 9, 'Owner Student'),
      'Owner Student'
    );
  });

  test('historical messages survive load mapping / reload initialization', () => {
    const loaded = applyLoadedHistory([historyB, historyA]);
    assert.equal(loaded.error, '');
    assert.deepEqual(
      loaded.messages.map((message) => message.body),
      ['First persisted', 'Second persisted']
    );

    // Simulated navigate-away / refresh remount: re-apply the same server payload.
    const reloaded = applyLoadedHistory(loaded.messages);
    assert.deepEqual(reloaded.messages, loaded.messages);
  });

  test('successful new message appends without deleting previous history', () => {
    const loaded = applyLoadedHistory([historyA, historyB]).messages;
    const sent: ConversationMessage = {
      id: 12,
      conversation_id: 55,
      sender_id: 9,
      body: 'Just sent',
      created_at: '2026-08-08T14:10:00.000Z',
    };

    const next = appendHistoryAfterSend(loaded, sent);
    assert.deepEqual(
      next.map((message) => message.body),
      ['First persisted', 'Second persisted', 'Just sent']
    );
    assert.equal(next.length, 3);
  });

  test('duplicate returned message is not inserted twice', () => {
    const loaded = applyLoadedHistory([historyA, historyB]).messages;
    const once = appendHistoryAfterSend(loaded, historyB);
    const twice = appendHistoryAfterSend(once, historyB);
    assert.equal(once.length, 2);
    assert.equal(twice.length, 2);
    assert.deepEqual(
      twice.map((message) => message.id),
      [10, 11]
    );
  });

  test('empty history state remains truthful', () => {
    const loaded = applyLoadedHistory([]);
    assert.deepEqual(loaded.messages, []);
    assert.equal(historyEmptyStateTitle(), EMPTY_THREAD_MESSAGE);
  });

  test('history API error mapping clears messages and surfaces 403/access text', () => {
    const denied = applyHistoryLoadFailure(
      new Error('Only conversation participants may view messages in this conversation')
    );
    assert.deepEqual(denied.messages, []);
    assert.match(denied.error, /participant/i);

    const missing = applyHistoryLoadFailure(new Error('Conversation not found'));
    assert.deepEqual(missing.messages, []);
    assert.equal(missing.error, 'Conversation not found');

    assert.equal(
      historyLoadErrorMessage('not-an-error'),
      'Unable to load conversation history'
    );
  });

  test('chronological sequence remains stable after load and append', () => {
    const loaded = applyLoadedHistory([historyB, historyA]).messages;
    const sent: ConversationMessage = {
      id: 9,
      conversation_id: 55,
      sender_id: 4,
      body: 'Earlier id but later clock',
      created_at: '2026-08-08T14:20:00.000Z',
    };
    const next = appendHistoryAfterSend(loaded, sent);
    assert.deepEqual(
      prepareHistoryMessages(next).map((message) => message.body),
      ['First persisted', 'Second persisted', 'Earlier id but later clock']
    );
  });
});
