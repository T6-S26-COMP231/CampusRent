import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MESSAGE_MAX_LENGTH,
  SEND_MESSAGE_LABEL,
  SENDING_MESSAGE_LABEL,
  appendSentMessage,
  canSendMessage,
  composerHelperText,
  formatMessageTime,
  isBlankMessage,
  isConversationParticipant,
  isOverMaxLength,
  isOwnMessage,
  messageBubbleClassName,
  messageBubbleSide,
  messageRowClassName,
  normalizeMessageBody,
  sendMessageErrorMessage,
  sendMessageLabel,
  sendMessageRequestBody,
  sortMessagesChronologically,
  type ConversationMessage,
} from './sendMessage';

const participants = [3, 9];

const ownMessage: ConversationMessage = {
  id: 1,
  conversation_id: 10,
  sender_id: 9,
  body: 'Hello from renter',
  created_at: '2026-08-07T12:00:00.000Z',
};

const counterpartMessage: ConversationMessage = {
  id: 2,
  conversation_id: 10,
  sender_id: 3,
  body: 'Hello from owner',
  created_at: '2026-08-07T12:01:00.000Z',
};

describe('US-17.1 message composer design helpers', () => {
  test('trims body and rejects empty or whitespace-only drafts', () => {
    assert.equal(normalizeMessageBody('  hi there  '), 'hi there');
    assert.equal(isBlankMessage(''), true);
    assert.equal(isBlankMessage('   \n\t  '), true);
    assert.equal(isBlankMessage('ok'), false);
  });

  test('send gate blocks blank, over-length, non-participant, and in-flight sends', () => {
    assert.equal(
      canSendMessage({
        draft: 'Hello',
        sending: false,
        viewerId: 9,
        participantIds: participants,
      }),
      true
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
    assert.equal(
      canSendMessage({
        draft: 'Hello',
        sending: true,
        viewerId: 9,
        participantIds: participants,
      }),
      false
    );
    assert.equal(
      canSendMessage({
        draft: 'Hello',
        sending: false,
        viewerId: 99,
        participantIds: participants,
      }),
      false
    );
    assert.equal(
      canSendMessage({
        draft: 'x'.repeat(MESSAGE_MAX_LENGTH + 1),
        sending: false,
        viewerId: 9,
        participantIds: participants,
      }),
      false
    );
  });

  test('participant helper and request body shape are explicit', () => {
    assert.equal(isConversationParticipant(9, participants), true);
    assert.equal(isConversationParticipant(1, participants), false);
    assert.equal(isConversationParticipant(undefined, participants), false);
    assert.deepEqual(sendMessageRequestBody('  Ready to rent  '), {
      body: 'Ready to rent',
    });
  });

  test('max-length design constant is enforced by helpers', () => {
    assert.equal(isOverMaxLength('x'.repeat(MESSAGE_MAX_LENGTH)), false);
    assert.equal(isOverMaxLength('x'.repeat(MESSAGE_MAX_LENGTH + 1)), true);
    assert.match(
      composerHelperText('x'.repeat(MESSAGE_MAX_LENGTH + 5)) || '',
      /too long/i
    );
  });

  test('sending label and error copy match existing CampusRent patterns', () => {
    assert.equal(sendMessageLabel(false), SEND_MESSAGE_LABEL);
    assert.equal(sendMessageLabel(true), SENDING_MESSAGE_LABEL);
    assert.equal(
      sendMessageErrorMessage(new Error('Only conversation participants may send messages')),
      'Only conversation participants may send messages'
    );
    assert.equal(sendMessageErrorMessage('nope'), 'Unable to send message');
  });

  test('own versus counterpart bubbles are visually distinct', () => {
    assert.equal(isOwnMessage(ownMessage, 9), true);
    assert.equal(isOwnMessage(counterpartMessage, 9), false);
    assert.equal(messageBubbleSide(ownMessage, 9), 'own');
    assert.equal(messageBubbleSide(counterpartMessage, 9), 'counterpart');

    const ownBubble = messageBubbleClassName('own');
    const otherBubble = messageBubbleClassName('counterpart');
    assert.match(ownBubble, /bg-campus-600/);
    assert.match(ownBubble, /ml-auto/);
    assert.match(otherBubble, /bg-slate-100/);
    assert.match(otherBubble, /mr-auto/);
    assert.notEqual(ownBubble, otherBubble);

    assert.match(messageRowClassName('own'), /items-end/);
    assert.match(messageRowClassName('counterpart'), /items-start/);
  });

  test('messages sort chronologically and successful sends append immediately', () => {
    const unordered = [counterpartMessage, ownMessage];
    const ordered = sortMessagesChronologically(unordered);
    assert.deepEqual(
      ordered.map((m) => m.id),
      [1, 2]
    );

    const next: ConversationMessage = {
      id: 3,
      conversation_id: 10,
      sender_id: 9,
      body: 'Following up',
      created_at: '2026-08-07T12:02:00.000Z',
    };
    const afterSend = appendSentMessage(ordered, next);
    assert.deepEqual(
      afterSend.map((m) => m.id),
      [1, 2, 3]
    );
    assert.equal(afterSend[2].body, 'Following up');
  });

  test('timestamp helper reuses conversation time formatting', () => {
    const formatted = formatMessageTime('2026-08-07T12:00:00.000Z');
    assert.notEqual(formatted, '—');
    assert.ok(formatted.length > 0);
  });
});
