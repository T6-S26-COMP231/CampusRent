import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from './helpers';

let connectDatabase: (uri?: string) => Promise<unknown>;
let nextId: (name: string) => Promise<number>;
let Message: typeof import('../src/models/Message').Message;
let MESSAGE_MAX_LENGTH: typeof import('../src/models/Message').MESSAGE_MAX_LENGTH;
let normalizeMessageBody: typeof import('../src/models/Message').normalizeMessageBody;
let assertMessageIdentifiers: typeof import('../src/models/Message').assertMessageIdentifiers;
let toMessageRow: typeof import('../src/models/Message').toMessageRow;
let sortMessagesChronologically: typeof import('../src/models/Message').sortMessagesChronologically;

before(async () => {
  const mongoUri = await startTestDatabase();
  ({ connectDatabase } = await import('../src/db/connection'));
  ({ nextId } = await import('../src/models/Counter'));
  ({
    Message,
    MESSAGE_MAX_LENGTH,
    normalizeMessageBody,
    assertMessageIdentifiers,
    toMessageRow,
    sortMessagesChronologically,
  } = await import('../src/models/Message'));
  await connectDatabase(mongoUri);
  await Message.syncIndexes();
});

beforeEach(async () => {
  await clearDatabase();
});

after(async () => {
  await stopTestDatabase();
});

describe('US-17.3 Message model persistence', () => {
  test('normalizeMessageBody trims and rejects blank or over-limit text', () => {
    assert.equal(normalizeMessageBody('  hello  '), 'hello');
    assert.throws(() => normalizeMessageBody(''), /blank/i);
    assert.throws(() => normalizeMessageBody('   \n\t  '), /blank/i);
    assert.throws(() => normalizeMessageBody(null), /required/i);
    assert.throws(
      () => normalizeMessageBody('x'.repeat(MESSAGE_MAX_LENGTH + 1)),
      /exceed/i
    );
    assert.equal(
      normalizeMessageBody('x'.repeat(MESSAGE_MAX_LENGTH)).length,
      MESSAGE_MAX_LENGTH
    );
  });

  test('assertMessageIdentifiers requires positive integer ids', () => {
    assert.deepEqual(assertMessageIdentifiers(7, 3), {
      conversation_id: 7,
      sender_id: 3,
    });
    assert.throws(() => assertMessageIdentifiers(0, 3), /conversation_id/i);
    assert.throws(() => assertMessageIdentifiers(7, -1), /sender_id/i);
    assert.throws(() => assertMessageIdentifiers(1.5, 3), /conversation_id/i);
  });

  test('persists a valid message with conversation, sender, body, and timestamp', async () => {
    const id = await nextId('messages');
    const created = await Message.create({
      _id: id,
      conversation_id: 10,
      sender_id: 4,
      body: '  Ready to arrange pickup  ',
    });

    assert.equal(created._id, id);
    assert.equal(created.conversation_id, 10);
    assert.equal(created.sender_id, 4);
    assert.equal(created.body, 'Ready to arrange pickup');
    assert.ok(created.created_at instanceof Date);

    const row = toMessageRow(created);
    assert.equal(row.id, id);
    assert.equal(row.conversation_id, 10);
    assert.equal(row.sender_id, 4);
    assert.equal(row.body, 'Ready to arrange pickup');
    assert.equal(typeof row.created_at, 'string');
  });

  test('multiple messages can exist in the same conversation', async () => {
    const first = await Message.create({
      _id: await nextId('messages'),
      conversation_id: 22,
      sender_id: 1,
      body: 'First',
    });
    const second = await Message.create({
      _id: await nextId('messages'),
      conversation_id: 22,
      sender_id: 2,
      body: 'Second',
    });
    const otherConversation = await Message.create({
      _id: await nextId('messages'),
      conversation_id: 23,
      sender_id: 1,
      body: 'Elsewhere',
    });

    assert.equal(await Message.countDocuments({ conversation_id: 22 }), 2);
    assert.equal(first.conversation_id, second.conversation_id);
    assert.notEqual(first._id, second._id);
    assert.equal(otherConversation.conversation_id, 23);
  });

  test('timestamps and ids allow deterministic chronological ordering', async () => {
    const earlier = new Date('2026-08-07T12:00:00.000Z');
    const later = new Date('2026-08-07T12:05:00.000Z');

    const secondCreated = await Message.create({
      _id: await nextId('messages'),
      conversation_id: 5,
      sender_id: 9,
      body: 'Later message',
      created_at: later,
    });
    const firstCreated = await Message.create({
      _id: await nextId('messages'),
      conversation_id: 5,
      sender_id: 3,
      body: 'Earlier message',
      created_at: earlier,
    });

    const sameInstantA = await Message.create({
      _id: await nextId('messages'),
      conversation_id: 5,
      sender_id: 3,
      body: 'Tie A',
      created_at: later,
    });
    const sameInstantB = await Message.create({
      _id: await nextId('messages'),
      conversation_id: 5,
      sender_id: 9,
      body: 'Tie B',
      created_at: later,
    });

    const ordered = sortMessagesChronologically([
      sameInstantB,
      secondCreated,
      sameInstantA,
      firstCreated,
    ]);

    assert.deepEqual(
      ordered.map((message) => message.body),
      ['Earlier message', 'Later message', 'Tie A', 'Tie B']
    );
    assert.ok(ordered[2]._id < ordered[3]._id);

    const fromDb = await Message.find({ conversation_id: 5 })
      .sort({ created_at: 1, _id: 1 })
      .lean();
    assert.deepEqual(
      fromDb.map((message) => message.body),
      ['Earlier message', 'Later message', 'Tie A', 'Tie B']
    );
  });

  test('rejects blank, whitespace-only, and over-limit bodies', async () => {
    const blankId = await nextId('messages');
    await assert.rejects(
      () =>
        Message.create({
          _id: blankId,
          conversation_id: 1,
          sender_id: 1,
          body: '',
        }),
      /blank|required|Path `body`/i
    );

    const whitespaceId = await nextId('messages');
    await assert.rejects(
      () =>
        Message.create({
          _id: whitespaceId,
          conversation_id: 1,
          sender_id: 1,
          body: '   \n  ',
        }),
      /blank/i
    );

    const overLimitId = await nextId('messages');
    await assert.rejects(
      () =>
        Message.create({
          _id: overLimitId,
          conversation_id: 1,
          sender_id: 1,
          body: 'x'.repeat(MESSAGE_MAX_LENGTH + 1),
        }),
      /exceed|longer than|maxlength|maximum/i
    );
  });

  test('rejects invalid conversation id and sender id', async () => {
    const badConversationId = await nextId('messages');
    await assert.rejects(
      () =>
        Message.create({
          _id: badConversationId,
          conversation_id: 0,
          sender_id: 1,
          body: 'Hello',
        }),
      /conversation_id|positive integer|Path `conversation_id`/i
    );

    const badSenderId = await nextId('messages');
    await assert.rejects(
      () =>
        Message.create({
          _id: badSenderId,
          conversation_id: 1,
          sender_id: -5,
          body: 'Hello',
        }),
      /sender_id|positive integer|Path `sender_id`/i
    );

    const nonIntegerConversationId = await nextId('messages');
    await assert.rejects(
      () =>
        Message.create({
          _id: nonIntegerConversationId,
          conversation_id: 1.7,
          sender_id: 1,
          body: 'Hello',
        }),
      /conversation_id|positive integer/i
    );
  });
});
