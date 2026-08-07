/**
 * US-17.7 — frontend helper coverage mapped to TAC send-message UX.
 *
 * TAC Test 1 — Send message → request/response helpers support storage UX
 * TAC Test 2 — Multiple messages → chronological append/order
 * TAC Test 3 — Blank message → send gate prevents submission
 * TAC Test 4 — Non-participant → composer send gate blocks send
 *
 * Limitation: no React DOM framework is installed; MessageComposer /
 * ConversationDetailPage rendering is not exercised here.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  EMPTY_THREAD_MESSAGE,
  MESSAGE_MAX_LENGTH,
  applyFailedSend,
  applySuccessfulSend,
  buildSendMessageCall,
  canSendMessage,
  conversationMessagesPath,
  formatMessageTime,
  isBlankMessage,
  isConversationParticipant,
  isOverMaxLength,
  messageBubbleClassName,
  messageBubbleSide,
  sendMessageLabel,
  sortMessagesChronologically,
  type ConversationMessage,
} from './sendMessage';

const participants = [4, 9];

const own: ConversationMessage = {
  id: 1,
  conversation_id: 20,
  sender_id: 9,
  body: 'Hello',
  created_at: '2026-08-07T18:00:00.000Z',
};

const received: ConversationMessage = {
  id: 2,
  conversation_id: 20,
  sender_id: 4,
  body: 'Hi there',
  created_at: '2026-08-07T18:01:00.000Z',
};

describe('US-17 TAC frontend acceptance helpers', () => {
  test('TAC Test 1 — valid send request uses conversation path, trimmed body, no sender_id', () => {
    const call = buildSendMessageCall(20, '  Stored successfully  ');
    assert.equal(call.path, conversationMessagesPath(20));
    assert.equal(call.path, '/conversations/20/messages');
    assert.deepEqual(call.body, { body: 'Stored successfully' });
    assert.equal('sender_id' in call.body, false);
    assert.equal(
      canSendMessage({
        draft: 'Stored successfully',
        sending: false,
        viewerId: 9,
        participantIds: participants,
      }),
      true
    );
  });

  test('TAC Test 2 — multiple messages append and sort in sequence', () => {
    let thread: ConversationMessage[] = [];
    const first = applySuccessfulSend(thread, own);
    thread = first.messages;
    assert.equal(first.draft, '');

    const second = applySuccessfulSend(thread, received);
    thread = second.messages;

    const third: ConversationMessage = {
      id: 3,
      conversation_id: 20,
      sender_id: 9,
      body: 'Follow-up',
      created_at: '2026-08-07T18:02:00.000Z',
    };
    thread = applySuccessfulSend(thread, third).messages;

    assert.deepEqual(
      sortMessagesChronologically(thread).map((message) => message.body),
      ['Hello', 'Hi there', 'Follow-up']
    );
  });

  test('TAC Test 3 — blank and whitespace drafts cannot send', () => {
    assert.equal(isBlankMessage(''), true);
    assert.equal(isBlankMessage('   \n'), true);
    assert.equal(
      canSendMessage({
        draft: '',
        sending: false,
        viewerId: 9,
        participantIds: participants,
      }),
      false
    );
    assert.equal(
      canSendMessage({
        draft: '   ',
        sending: false,
        viewerId: 9,
        participantIds: participants,
      }),
      false
    );
  });

  test('TAC Test 4 — non-participant cannot send', () => {
    assert.equal(isConversationParticipant(99, participants), false);
    assert.equal(
      canSendMessage({
        draft: 'Nope',
        sending: false,
        viewerId: 99,
        participantIds: participants,
      }),
      false
    );
  });

  test('invalid length, sending gate, failure/success draft behaviour, and styling', () => {
    assert.equal(isOverMaxLength('x'.repeat(MESSAGE_MAX_LENGTH + 1)), true);
    assert.equal(
      canSendMessage({
        draft: 'x'.repeat(MESSAGE_MAX_LENGTH + 1),
        sending: false,
        viewerId: 9,
        participantIds: participants,
      }),
      false
    );
    assert.equal(
      canSendMessage({
        draft: 'y'.repeat(MESSAGE_MAX_LENGTH),
        sending: false,
        viewerId: 9,
        participantIds: participants,
      }),
      true
    );
    assert.equal(
      canSendMessage({
        draft: 'Hello',
        sending: true,
        viewerId: 9,
        participantIds: participants,
      }),
      false
    );
    assert.equal(sendMessageLabel(true), 'Sending...');

    const failed = applyFailedSend('Keep this draft', new Error('Database unavailable'));
    assert.equal(failed.draft, 'Keep this draft');
    assert.equal(failed.error, 'Database unavailable');

    assert.equal(messageBubbleSide(own, 9), 'own');
    assert.equal(messageBubbleSide(received, 9), 'counterpart');
    assert.match(messageBubbleClassName('own'), /bg-campus-600/);
    assert.match(messageBubbleClassName('counterpart'), /bg-slate-100/);

    const stamped = formatMessageTime(own.created_at);
    assert.notEqual(stamped, '—');
    assert.ok(stamped.length > 0);

    assert.equal(EMPTY_THREAD_MESSAGE, 'No messages yet');
  });
});
