import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApp } from '../server/app.js';

async function withServer(t) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lifetimeline-api-test-'));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const server = createApp({ dataRoot, backupLimit: 3 }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

function day(summary = 'test') {
  return {
    date: '2026-08-18',
    blocks: [{ id: 'b1', start: '09:00', end: '10:00', summary, linkedMediaIds: [] }],
    media: [],
  };
}

test('API rejects invalid dates and malformed day structures with JSON 400 errors', async (t) => {
  const base = await withServer(t);
  const badDate = await fetch(`${base}/api/days/2026-02-30`);
  assert.equal(badDate.status, 400);

  const badBody = await fetch(`${base}/api/days/2026-08-18`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...day(), unknown: true }),
  });
  assert.equal(badBody.status, 400);
  const error = await badBody.json();
  assert.ok(error.details.some((detail) => detail.path === 'day.unknown'));

  const malformed = await fetch(`${base}/api/days/2026-08-18`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: '{"date":',
  });
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).error, /JSON/);
});

test('API saves, lists, reads, and restores day history', async (t) => {
  const base = await withServer(t);
  for (const summary of ['first', 'second']) {
    const response = await fetch(`${base}/api/days/2026-08-18`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(day(summary)),
    });
    assert.equal(response.status, 200);
  }

  const historyResponse = await fetch(`${base}/api/days/2026-08-18/history`);
  const history = await historyResponse.json();
  assert.equal(history.length, 2);
  const firstVersion = history[1].version;

  const versionResponse = await fetch(`${base}/api/days/2026-08-18/history/${firstVersion}`);
  assert.equal((await versionResponse.json()).blocks[0].summary, 'first');

  const restoreResponse = await fetch(`${base}/api/days/2026-08-18/history/${firstVersion}/restore`, { method: 'POST' });
  assert.equal(restoreResponse.status, 200);
  const current = await fetch(`${base}/api/days/2026-08-18`);
  assert.equal((await current.json()).blocks[0].summary, 'first');
});
