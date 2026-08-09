/**
 * US-20.3 / US-20.7 — Report model persistence.
 * API submit / target existence are covered in submit-report + us-20-acceptance.
 * Moderation behaviour belongs to US-23.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from './helpers';

let connectDatabase: (uri?: string) => Promise<unknown>;
let nextId: (name: string) => Promise<number>;
let Report: typeof import('../src/models/Report').Report;
let normalizeReportReason: typeof import('../src/models/Report').normalizeReportReason;
let normalizeReportDetails: typeof import('../src/models/Report').normalizeReportDetails;
let normalizeReportTargetType: typeof import('../src/models/Report').normalizeReportTargetType;
let assertReportIdentifiers: typeof import('../src/models/Report').assertReportIdentifiers;
let toReportRow: typeof import('../src/models/Report').toReportRow;

before(async () => {
  const mongoUri = await startTestDatabase();
  ({ connectDatabase } = await import('../src/db/connection'));
  ({ nextId } = await import('../src/models/Counter'));
  ({
    Report,
    normalizeReportReason,
    normalizeReportDetails,
    normalizeReportTargetType,
    assertReportIdentifiers,
    toReportRow,
  } = await import('../src/models/Report'));
  await connectDatabase(mongoUri);
  await Report.syncIndexes();
});

beforeEach(async () => {
  await clearDatabase();
});

after(async () => {
  await stopTestDatabase();
});

describe('US-20.3 Report model persistence', () => {
  test('valid listing report persists with trimmed fields and created_at', async () => {
    const id = await nextId('reports');
    const created = await Report.create({
      _id: id,
      reporter_id: 9,
      target_type: 'listing',
      target_id: 12,
      reason: '  Misleading photos  ',
      details: '  Images do not match the item.  ',
    });

    assert.equal(created._id, id);
    assert.equal(created.reporter_id, 9);
    assert.equal(created.target_type, 'listing');
    assert.equal(created.target_id, 12);
    assert.equal(created.reason, 'Misleading photos');
    assert.equal(created.details, 'Images do not match the item.');
    assert.ok(created.created_at instanceof Date);

    const row = toReportRow(created);
    assert.equal(row.id, id);
    assert.equal(row.reporter_id, 9);
    assert.equal(row.target_type, 'listing');
    assert.equal(row.target_id, 12);
    assert.equal(typeof row.created_at, 'string');
  });

  test('valid user report persists', async () => {
    const id = await nextId('reports');
    const created = await Report.create({
      _id: id,
      reporter_id: 3,
      target_type: 'user',
      target_id: 4,
      reason: 'Harassment',
      details: 'Threatening messages about a rental.',
    });

    assert.equal(created.target_type, 'user');
    assert.equal(created.target_id, 4);
    assert.equal(created.reporter_id, 3);
    assert.equal(created.reason, 'Harassment');
    assert.equal(created.details, 'Threatening messages about a rental.');
    assert.ok(created.created_at instanceof Date);
  });

  test('reporter_id, target_type, target_id, reason, and details persist', async () => {
    const created = await Report.create({
      _id: await nextId('reports'),
      reporter_id: 21,
      target_type: 'listing',
      target_id: 8,
      reason: 'Spam',
      details: 'Repeated junk listing.',
    });

    const stored = await Report.findById(created._id).lean();
    assert.ok(stored);
    assert.equal(stored!.reporter_id, 21);
    assert.equal(stored!.target_type, 'listing');
    assert.equal(stored!.target_id, 8);
    assert.equal(stored!.reason, 'Spam');
    assert.equal(stored!.details, 'Repeated junk listing.');
    assert.ok(stored!.created_at instanceof Date);
  });

  test('multiple reports can exist', async () => {
    const first = await Report.create({
      _id: await nextId('reports'),
      reporter_id: 1,
      target_type: 'listing',
      target_id: 10,
      reason: 'One',
      details: 'First report',
    });
    const second = await Report.create({
      _id: await nextId('reports'),
      reporter_id: 2,
      target_type: 'user',
      target_id: 5,
      reason: 'Two',
      details: 'Second report',
    });
    const third = await Report.create({
      _id: await nextId('reports'),
      reporter_id: 1,
      target_type: 'listing',
      target_id: 10,
      reason: 'Three',
      details: 'Third report about same listing',
    });

    assert.notEqual(first._id, second._id);
    assert.notEqual(second._id, third._id);
    assert.equal(await Report.countDocuments(), 3);
    assert.equal(await Report.countDocuments({ target_type: 'listing', target_id: 10 }), 2);
  });

  test('normalize helpers trim and reject blank reason/details', () => {
    assert.equal(normalizeReportReason('  hello  '), 'hello');
    assert.throws(() => normalizeReportReason(''), /blank/i);
    assert.throws(() => normalizeReportReason('   \n\t  '), /blank/i);
    assert.throws(() => normalizeReportReason(null), /required/i);

    assert.equal(normalizeReportDetails('  details  '), 'details');
    assert.throws(() => normalizeReportDetails(''), /blank/i);
    assert.throws(() => normalizeReportDetails('   '), /blank/i);
    assert.throws(() => normalizeReportDetails(null), /required/i);
  });

  test('target_type must be user or listing; identifiers must be positive', () => {
    assert.equal(normalizeReportTargetType('user'), 'user');
    assert.equal(normalizeReportTargetType('listing'), 'listing');
    assert.throws(() => normalizeReportTargetType('admin'), /user or listing/i);
    assert.throws(() => normalizeReportTargetType(''), /required/i);

    assert.deepEqual(assertReportIdentifiers(9, 'listing', 12), {
      reporter_id: 9,
      target_type: 'listing',
      target_id: 12,
    });
    assert.throws(() => assertReportIdentifiers(0, 'listing', 12), /reporter_id/i);
    assert.throws(() => assertReportIdentifiers(9, 'listing', -1), /target_id/i);
    assert.throws(() => assertReportIdentifiers(1.5, 'user', 4), /reporter_id/i);
  });

  test('missing reporter is rejected', async () => {
    const id = await nextId('reports');
    await assert.rejects(
      () =>
        Report.create({
          _id: id,
          target_type: 'listing',
          target_id: 12,
          reason: 'Spam',
          details: 'Junk listing',
        }),
      /reporter_id|required|positive integer/i
    );
  });

  test('invalid reporter id is rejected', async () => {
    const id = await nextId('reports');
    await assert.rejects(
      () =>
        Report.create({
          _id: id,
          reporter_id: 0,
          target_type: 'user',
          target_id: 4,
          reason: 'Spam',
          details: 'Junk behaviour',
        }),
      /reporter_id|positive integer/i
    );
  });

  test('invalid target_type is rejected', async () => {
    const id = await nextId('reports');
    await assert.rejects(
      () =>
        Report.create({
          _id: id,
          reporter_id: 9,
          target_type: 'community' as 'user',
          target_id: 4,
          reason: 'Spam',
          details: 'Not a valid target type',
        }),
      /target_type|user or listing|enum/i
    );
  });

  test('missing or invalid target id is rejected', async () => {
    const missingId = await nextId('reports');
    await assert.rejects(
      () =>
        Report.create({
          _id: missingId,
          reporter_id: 9,
          target_type: 'listing',
          reason: 'Spam',
          details: 'Missing target',
        }),
      /target_id|required|positive integer/i
    );

    const invalidId = await nextId('reports');
    await assert.rejects(
      () =>
        Report.create({
          _id: invalidId,
          reporter_id: 9,
          target_type: 'listing',
          target_id: -3,
          reason: 'Spam',
          details: 'Bad target id',
        }),
      /target_id|positive integer/i
    );
  });

  test('blank or whitespace reason is rejected', async () => {
    const id = await nextId('reports');
    await assert.rejects(
      () =>
        Report.create({
          _id: id,
          reporter_id: 9,
          target_type: 'listing',
          target_id: 12,
          reason: '   ',
          details: 'Has details',
        }),
      /reason|blank/i
    );
  });

  test('blank or whitespace details are rejected', async () => {
    const id = await nextId('reports');
    await assert.rejects(
      () =>
        Report.create({
          _id: id,
          reporter_id: 9,
          target_type: 'user',
          target_id: 4,
          reason: 'Harassment',
          details: '\n\t  ',
        }),
      /details|blank/i
    );
  });
});
