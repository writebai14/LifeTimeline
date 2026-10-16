const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const DAY_KEYS = new Set(['date', 'dayOfWeek', 'taskSection', 'summary', 'done', 'blocks', 'media']);
const BLOCK_KEYS = new Set([
  'id', 'start', 'end', 'summary', 'category', 'location', 'note', 'moodOrWeather',
  'linkedMediaIds', 'source',
]);
const MEDIA_KEYS = new Set([
  'id', 'capturedAt', 'filePath', 'type', 'optionalLocation', 'linkedBlockId',
]);
const TASK_KEYS = new Set(['todayTasks', 'tomorrowGoals', 'weekTasks']);
const SUMMARY_KEYS = new Set(['completed', 'notCompleted', 'exceeded']);
const BLOCK_SOURCES = new Set(['manual', 'from_media', 'from_quick_note']);
const MEDIA_TYPES = new Set(['photo', 'screenshot']);

export class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export function isValidDate(date) {
  if (typeof date !== 'string') return false;
  const match = DATE_PATTERN.exec(date);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  // Avoid Date.UTC's special handling of years 0-99.
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function assertValidDate(date) {
  if (!isValidDate(date)) {
    throw new ValidationError('日期必须是有效的 YYYY-MM-DD 格式', [
      { path: 'date', message: 'Invalid calendar date' },
    ]);
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function addUnknownKeyErrors(value, allowedKeys, path, errors) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) errors.push({ path: `${path}.${key}`, message: 'Unknown property' });
  }
}

function requireString(value, path, errors, { nonEmpty = false, maxLength = 100_000 } = {}) {
  if (typeof value !== 'string') {
    errors.push({ path, message: 'Expected string' });
    return;
  }
  if (nonEmpty && value.trim().length === 0) errors.push({ path, message: 'Must not be empty' });
  if (value.length > maxLength) errors.push({ path, message: `Must be at most ${maxLength} characters` });
}

function optionalString(value, key, path, errors, options) {
  if (Object.hasOwn(value, key)) requireString(value[key], `${path}.${key}`, errors, options);
}

function validateTextObject(value, allowedKeys, path, errors) {
  if (!isPlainObject(value)) {
    errors.push({ path, message: 'Expected object' });
    return;
  }
  addUnknownKeyErrors(value, allowedKeys, path, errors);
  for (const key of allowedKeys) optionalString(value, key, path, errors);
}

function validateBlock(block, index, errors) {
  const path = `day.blocks[${index}]`;
  if (!isPlainObject(block)) {
    errors.push({ path, message: 'Expected object' });
    return;
  }
  addUnknownKeyErrors(block, BLOCK_KEYS, path, errors);
  requireString(block.id, `${path}.id`, errors, { nonEmpty: true, maxLength: 200 });
  requireString(block.start, `${path}.start`, errors, { nonEmpty: true, maxLength: 5 });
  requireString(block.end, `${path}.end`, errors, { nonEmpty: true, maxLength: 5 });
  requireString(block.summary, `${path}.summary`, errors, { nonEmpty: true });
  if (typeof block.start === 'string' && !TIME_PATTERN.test(block.start)) {
    errors.push({ path: `${path}.start`, message: 'Expected 24-hour time in HH:mm format' });
  }
  if (typeof block.end === 'string' && !TIME_PATTERN.test(block.end)) {
    errors.push({ path: `${path}.end`, message: 'Expected 24-hour time in HH:mm format' });
  }
  for (const key of ['category', 'location', 'note', 'moodOrWeather']) {
    optionalString(block, key, path, errors);
  }
  if (!Array.isArray(block.linkedMediaIds)) {
    errors.push({ path: `${path}.linkedMediaIds`, message: 'Expected array' });
  } else {
    block.linkedMediaIds.forEach((id, mediaIndex) => {
      requireString(id, `${path}.linkedMediaIds[${mediaIndex}]`, errors, { nonEmpty: true, maxLength: 200 });
    });
    if (new Set(block.linkedMediaIds).size !== block.linkedMediaIds.length) {
      errors.push({ path: `${path}.linkedMediaIds`, message: 'Must not contain duplicate IDs' });
    }
  }
  if (Object.hasOwn(block, 'source') && !BLOCK_SOURCES.has(block.source)) {
    errors.push({ path: `${path}.source`, message: 'Expected manual, from_media, or from_quick_note' });
  }
}

function validateMedia(media, index, errors) {
  const path = `day.media[${index}]`;
  if (!isPlainObject(media)) {
    errors.push({ path, message: 'Expected object' });
    return;
  }
  addUnknownKeyErrors(media, MEDIA_KEYS, path, errors);
  requireString(media.id, `${path}.id`, errors, { nonEmpty: true, maxLength: 200 });
  requireString(media.capturedAt, `${path}.capturedAt`, errors, { nonEmpty: true, maxLength: 50 });
  requireString(media.filePath, `${path}.filePath`, errors, { nonEmpty: true, maxLength: 500 });
  if (typeof media.capturedAt === 'string'
      && (!ISO_TIMESTAMP_PATTERN.test(media.capturedAt) || Number.isNaN(Date.parse(media.capturedAt)))) {
    errors.push({ path: `${path}.capturedAt`, message: 'Expected an ISO 8601 timestamp with timezone' });
  }
  if (typeof media.filePath === 'string' && media.filePath !== media.filePath.split(/[\\/]/).pop()) {
    errors.push({ path: `${path}.filePath`, message: 'Expected a filename without directory components' });
  }
  if (!MEDIA_TYPES.has(media.type)) {
    errors.push({ path: `${path}.type`, message: 'Expected photo or screenshot' });
  }
  optionalString(media, 'optionalLocation', path, errors);
  optionalString(media, 'linkedBlockId', path, errors, { nonEmpty: true, maxLength: 200 });
}

export function validateDay(day, expectedDate) {
  const errors = [];
  if (!isPlainObject(day)) {
    return { valid: false, errors: [{ path: 'day', message: 'Expected object' }] };
  }

  addUnknownKeyErrors(day, DAY_KEYS, 'day', errors);
  requireString(day.date, 'day.date', errors, { nonEmpty: true, maxLength: 10 });
  if (typeof day.date === 'string' && !isValidDate(day.date)) {
    errors.push({ path: 'day.date', message: 'Expected a valid YYYY-MM-DD calendar date' });
  }
  if (expectedDate !== undefined && day.date !== expectedDate) {
    errors.push({ path: 'day.date', message: 'Must match the date in the request URL' });
  }
  optionalString(day, 'dayOfWeek', 'day', errors, { nonEmpty: true, maxLength: 20 });
  if (Object.hasOwn(day, 'done') && typeof day.done !== 'boolean') {
    errors.push({ path: 'day.done', message: 'Expected boolean' });
  }
  if (Object.hasOwn(day, 'taskSection')) validateTextObject(day.taskSection, TASK_KEYS, 'day.taskSection', errors);
  if (Object.hasOwn(day, 'summary')) validateTextObject(day.summary, SUMMARY_KEYS, 'day.summary', errors);

  if (!Array.isArray(day.blocks)) {
    errors.push({ path: 'day.blocks', message: 'Expected array' });
  } else {
    day.blocks.forEach((block, index) => validateBlock(block, index, errors));
  }
  if (!Array.isArray(day.media)) {
    errors.push({ path: 'day.media', message: 'Expected array' });
  } else {
    day.media.forEach((media, index) => validateMedia(media, index, errors));
  }

  const blockIds = Array.isArray(day.blocks)
    ? day.blocks.filter(isPlainObject).map((block) => block.id).filter((id) => typeof id === 'string')
    : [];
  const mediaIds = Array.isArray(day.media)
    ? day.media.filter(isPlainObject).map((media) => media.id).filter((id) => typeof id === 'string')
    : [];
  if (Array.isArray(day.blocks) && new Set(blockIds).size !== blockIds.length) {
    errors.push({ path: 'day.blocks', message: 'Block IDs must be unique' });
  }
  if (Array.isArray(day.media) && new Set(mediaIds).size !== mediaIds.length) {
    errors.push({ path: 'day.media', message: 'Media IDs must be unique' });
  }

  if (Array.isArray(day.blocks) && Array.isArray(day.media)) {
    const blockIdSet = new Set(blockIds);
    const mediaIdSet = new Set(mediaIds);
    day.blocks.forEach((block, index) => {
      if (!isPlainObject(block) || !Array.isArray(block.linkedMediaIds)) return;
      block.linkedMediaIds.forEach((id, linkedIndex) => {
        if (typeof id === 'string' && !mediaIdSet.has(id)) {
          errors.push({ path: `day.blocks[${index}].linkedMediaIds[${linkedIndex}]`, message: 'Referenced media does not exist in day.media' });
        }
      });
    });
    day.media.forEach((media, index) => {
      if (isPlainObject(media) && typeof media.linkedBlockId === 'string' && !blockIdSet.has(media.linkedBlockId)) {
        errors.push({ path: `day.media[${index}].linkedBlockId`, message: 'Referenced block does not exist in day.blocks' });
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidDay(day, expectedDate) {
  const result = validateDay(day, expectedDate);
  if (!result.valid) throw new ValidationError('单日 JSON 数据结构不合法', result.errors);
  return day;
}
