import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from './helpers';

let connectDatabase: (uri?: string) => Promise<unknown>;
let nextId: (name: string) => Promise<number>;
let Conversation: typeof import('../src/models/Conversation').Conversation;
let conversationIdentity: typeof import('../src/models/Conversation').conversationIdentity;
let normalizeParticipantIds: typeof import('../src/models/Conversation').normalizeParticipantIds;
let toConversationRow: typeof import('../src/models/Conversation').toConversationRow;
let isConversationParticipant: typeof import('../src/models/Conversation').isConversationParticipant;

before(async () => {
  const mongoUri = await startTestDatabase();
  ({ connectDatabase } = await import('../src/db/connection'));
  ({ nextId } = await import('../src/models/Counter'));
  ({
    Conversation,
    conversationIdentity,
    normalizeParticipantIds,
    toConversationRow,
    isConversationParticipant,
  } = await import('../src/models/Conversation'));
  await connectDatabase(mongoUri);
  await Conversation.syncIndexes();
});

beforeEach(async () => {
  await clearDatabase();
});

after(async () => {
  await stopTestDatabase();
});

describe('US-16.3 Conversation model', () => {
  test('normalizeParticipantIds sorts ids and rejects identical users', () => {
    assert.deepEqual(normalizeParticipantIds(20, 5), {
      participant_low_id: 5,
      participant_high_id: 20,
    });
    assert.deepEqual(normalizeParticipantIds(5, 20), {
      participant_low_id: 5,
      participant_high_id: 20,
    });
    assert.throws(
      () => normalizeParticipantIds(7, 7),
      /two different users/i
    );
    assert.throws(() => normalizeParticipantIds(0, 3), /positive integer/i);
    assert.throws(() => normalizeParticipantIds(1.5, 3), /positive integer/i);
  });

  test('conversationIdentity requires a positive listing id', () => {
    assert.deepEqual(conversationIdentity(9, 4, 2), {
      listing_id: 9,
      participant_low_id: 2,
      participant_high_id: 4,
    });
    assert.throws(() => conversationIdentity(-1, 1, 2), /listing_id/i);
  });

  test('persists a conversation anchored to a listing and two participants', async () => {
    const id = await nextId('conversations');
    const created = await Conversation.create({
      _id: id,
      ...conversationIdentity(11, 30, 12),
    });

    assert.equal(created._id, id);
    assert.equal(created.listing_id, 11);
    assert.equal(created.participant_low_id, 12);
    assert.equal(created.participant_high_id, 30);
    assert.ok(created.created_at instanceof Date);
    assert.ok(created.updated_at instanceof Date);

    const row = toConversationRow(created);
    assert.equal(row.id, id);
    assert.deepEqual(row.participant_ids, [12, 30]);
    assert.equal(typeof row.created_at, 'string');
    assert.equal(typeof row.updated_at, 'string');
    assert.equal(isConversationParticipant(created, 12), true);
    assert.equal(isConversationParticipant(created, 30), true);
    assert.equal(isConversationParticipant(created, 99), false);
  });

  test('normalizes reversed participant order before save', async () => {
    const id = await nextId('conversations');
    const created = await Conversation.create({
      _id: id,
      listing_id: 4,
      participant_low_id: 50,
      participant_high_id: 8,
    });

    assert.equal(created.participant_low_id, 8);
    assert.equal(created.participant_high_id, 50);
  });

  test('unique index blocks a duplicate for the same listing and pair', async () => {
    const firstId = await nextId('conversations');
    await Conversation.create({
      _id: firstId,
      ...conversationIdentity(3, 10, 20),
    });

    const secondId = await nextId('conversations');
    await assert.rejects(
      () =>
        Conversation.create({
          _id: secondId,
          ...conversationIdentity(3, 20, 10),
        }),
      (error: unknown) => {
        const code =
          typeof error === 'object' && error && 'code' in error
            ? (error as { code?: number }).code
            : undefined;
        return code === 11000;
      }
    );
  });

  test('rejects missing participants, same-user pairs, and malformed ids', async () => {
    const sameUserId = await nextId('conversations');
    await assert.rejects(
      () =>
        Conversation.create({
          _id: sameUserId,
          listing_id: 1,
          participant_low_id: 5,
          participant_high_id: 5,
        }),
      /two different users/i
    );

    const missingParticipantId = await nextId('conversations');
    await assert.rejects(
      () =>
        Conversation.create({
          _id: missingParticipantId,
          listing_id: 1,
          participant_low_id: 5,
        } as never),
      /participant|required|Conversation requires/i
    );

    const badListingId = await nextId('conversations');
    await assert.rejects(
      () =>
        Conversation.create({
          _id: badListingId,
          listing_id: 0,
          participant_low_id: 1,
          participant_high_id: 2,
        }),
      /listing_id|positive integer|Path `listing_id`/i
    );

    const badParticipantId = await nextId('conversations');
    await assert.rejects(
      () =>
        Conversation.create({
          _id: badParticipantId,
          listing_id: 1,
          participant_low_id: -4,
          participant_high_id: 2,
        }),
      /participant|positive integer|Path `participant_low_id`/i
    );
  });

  test('conversations for different listings or different pairs remain allowed', async () => {
    await Conversation.create({
      _id: await nextId('conversations'),
      ...conversationIdentity(1, 10, 20),
    });
    await Conversation.create({
      _id: await nextId('conversations'),
      ...conversationIdentity(2, 10, 20),
    });
    await Conversation.create({
      _id: await nextId('conversations'),
      ...conversationIdentity(1, 10, 30),
    });

    assert.equal(await Conversation.countDocuments(), 3);
  });
});
