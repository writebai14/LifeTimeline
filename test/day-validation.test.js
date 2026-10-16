import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidDate, validateDay } from '../server/day-validation.js';

function validDay(date = '2026-02-28') {
  return {
    date,
    done: false,
    blocks: [{
      id: 'block-1',
      start: '23:30',
      end: '00:15',
      summary: '跨午夜记录',
      linkedMediaIds: ['media-1'],
      source: 'manual',
    }],
    media: [{
      id: 'media-1',
      capturedAt: '2026-02-28T23:35:00.000+08:00',
      filePath: 'photo.jpg',
      type: 'photo',
      linkedBlockId: 'block-1',
    }],
  };
}

test('accepts real calendar dates and rejects impossible dates', () => {
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('../2026-01-01'), false);
});

test('accepts a complete valid day payload', () => {
  assert.deepEqual(validateDay(validDay(), '2026-02-28'), { valid: true, errors: [] });
});

test('rejects URL/body date mismatch, unknown fields, bad time, and broken references', () => {
  const day = validDay();
  day.unexpected = true;
  day.blocks[0].start = '24:00';
  day.blocks[0].linkedMediaIds = ['missing-media'];
  const result = validateDay(day, '2026-03-01');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path === 'day.date' && error.message.includes('request URL')));
  assert.ok(result.errors.some((error) => error.path === 'day.unexpected'));
  assert.ok(result.errors.some((error) => error.path === 'day.blocks[0].start'));
  assert.ok(result.errors.some((error) => error.path === 'day.blocks[0].linkedMediaIds[0]'));
});

test('requires blocks and media arrays and unique IDs', () => {
  const day = validDay();
  day.blocks.push({ ...day.blocks[0] });
  day.media = null;
  const result = validateDay(day, day.date);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path === 'day.blocks' && error.message.includes('unique')));
  assert.ok(result.errors.some((error) => error.path === 'day.media' && error.message === 'Expected array'));
});
