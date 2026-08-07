import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MESSAGE_MAX_LENGTH,
  SEND_MESSAGE_LABEL,
  SENDING_MESSAGE_LABEL,
  appendSentMessage,
  applyFailedSend,
  applySuccessfulSend,
  buildSendMessageCall,
  canSendMessage,
  composerHelperText,
  conversationMessagesPath,
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

describe('US-17.6 composer send integration helpers', () => {
  test('POST uses the conversation id path, trimmed body, and never sender_id', () => {
    const call = buildSendMessageCall(42, '  Hello campus  ');
    assert.equal(call.path, '/conversations/42/messages');
    assert.equal(conversationMessagesPath(42), '/conversations/42/messages');
    assert.deepEqual(call.body, { body: 'Hello campus' });
    assert.equal('sender_id' in call.body, false);
    assert.deepEqual(Object.keys(call.body), ['body']);
  });

  test('blank and over-limit drafts do not produce a sendable API call gate', () => {
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
        draft: 'x'.repeat(MESSAGE_MAX_LENGTH + 1),
        sending: false,
        viewerId: 9,
        participantIds: participants,
      }),
      false
    );
  });

  test('duplicate submit is prevented while sending', () => {
    assert.equal(
      canSendMessage({
        draft: 'Hello',
        sending: true,
        viewerId: 9,
        participantIds: participants,
      }),
      false
    );
    assert.equal(sendMessageLabel(true), SENDING_MESSAGE_LABEL);
  });

  test('successful response clears draft and appends immediately in chronological order', () => {
    const first = ownMessage;
    const second: ConversationMessage = {
      id: 4,
      conversation_id: 10,
      sender_id: 9,
      body: 'Just sent',
      created_at: '2026-08-07T12:03:00.000Z',
    };
    const result = applySuccessfulSend([counterpartMessage, first], second);
    assert.equal(result.draft, '');
    assert.equal(result.error, '');
    assert.equal(result.success, 'Message sent.');
    assert.deepEqual(
      result.messages.map((message) => message.id),
      [1, 2, 4]
    );
  });

  test('multiple successful sends retain chronological sequence', () => {
    let thread: ConversationMessage[] = [];
    const sends: ConversationMessage[] = [
      {
        id: 10,
        conversation_id: 10,
        sender_id: 9,
        body: 'One',
        created_at: '2026-08-07T13:00:00.000Z',
      },
      {
        id: 11,
        conversation_id: 10,
        sender_id: 3,
        body: 'Two',
        created_at: '2026-08-07T13:01:00.000Z',
      },
      {
        id: 12,
        conversation_id: 10,
        sender_id: 9,
        body: 'Three',
        created_at: '2026-08-07T13:02:00.000Z',
      },
    ];

    for (const sent of sends) {
      thread = applySuccessfulSend(thread, sent).messages;
    }

    assert.deepEqual(
      thread.map((message) => message.body),
      ['One', 'Two', 'Three']
    );
  });

  test('failed send keeps draft and surfaces backend/network error', () => {
    const draft = 'Keep typing this';
    const result = applyFailedSend(draft, new Error('Message body cannot be blank'));
    assert.equal(result.draft, draft);
    assert.equal(result.error, 'Message body cannot be blank');
    assert.equal(result.success, '');
  });

  test('sent and received styling remains distinct after integration helpers', () => {
    assert.match(messageBubbleClassName('own'), /bg-campus-600/);
    assert.match(messageBubbleClassName('counterpart'), /bg-slate-100/);
  });
});
