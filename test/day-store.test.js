import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { atomicWriteFile, createDayStore } from '../server/day-store.js';

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifetimeline-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function day(summary) {
  return {
    date: '2026-08-18',
    blocks: [{ id: 'b1', start: '09:00', end: '10:00', summary, linkedMediaIds: [] }],
    media: [],
  };
}

test('atomicWriteFile replaces the destination and leaves no temp files', (t) => {
  const root = temporaryRoot(t);
  const file = path.join(root, 'days', '2026-08-18.json');
  atomicWriteFile(file, 'first');
  atomicWriteFile(file, 'second');
  assert.equal(fs.readFileSync(file, 'utf8'), 'second');
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['2026-08-18.json']);
});

test('save creates history, skips unchanged payloads, and can restore a version', (t) => {
  const store = createDayStore({ dataRoot: temporaryRoot(t), backupLimit: 5 });
  const first = store.saveDay('2026-08-18', day('first'));
  assert.equal(first.changed, true);
  assert.ok(first.version);
  assert.deepEqual(store.readDay('2026-08-18'), day('first'));
  assert.equal(store.listHistory('2026-08-18').length, 1);

  const unchanged = store.saveDay('2026-08-18', day('first'));
  assert.deepEqual(unchanged, { changed: false, version: null });
  assert.equal(store.listHistory('2026-08-18').length, 1);

  store.saveDay('2026-08-18', day('second'));
  const restored = store.restoreVersion('2026-08-18', first.version);
  assert.equal(restored.day.blocks[0].summary, 'first');
  assert.equal(store.readDay('2026-08-18').blocks[0].summary, 'first');
});

test('history retention keeps only the newest configured versions', (t) => {
  const store = createDayStore({ dataRoot: temporaryRoot(t), backupLimit: 2 });
  store.saveDay('2026-08-18', day('one'));
  store.saveDay('2026-08-18', day('two'));
  store.saveDay('2026-08-18', day('three'));
  const history = store.listHistory('2026-08-18');
  assert.equal(history.length, 2);
  assert.equal(store.readVersion('2026-08-18', history[0].version).blocks[0].summary, 'three');
  assert.equal(store.readVersion('2026-08-18', history[1].version).blocks[0].summary, 'two');
});

test('the first edit of a legacy live file preserves both old and new states', (t) => {
  const root = temporaryRoot(t);
  const daysDir = path.join(root, 'days');
  fs.mkdirSync(daysDir, { recursive: true });
  fs.writeFileSync(path.join(daysDir, '2026-08-18.json'), JSON.stringify(day('legacy')));
  const store = createDayStore({ dataRoot: root, backupLimit: 5 });

  store.saveDay('2026-08-18', day('edited'));
  const history = store.listHistory('2026-08-18');
  assert.equal(history.length, 2);
  assert.equal(store.readVersion('2026-08-18', history[0].version).blocks[0].summary, 'edited');
  assert.equal(store.readVersion('2026-08-18', history[1].version).blocks[0].summary, 'legacy');
});

test('save rejects invalid data before touching the live file or history', (t) => {
  const root = temporaryRoot(t);
  const store = createDayStore({ dataRoot: root });
  assert.throws(() => store.saveDay('2026-08-18', { date: '2026-08-18', blocks: [], media: 'bad' }));
  assert.equal(fs.existsSync(path.join(root, 'days', '2026-08-18.json')), false);
  assert.deepEqual(store.listHistory('2026-08-18'), []);
});
