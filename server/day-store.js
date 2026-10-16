import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { assertValidDate, assertValidDay, isValidDate, ValidationError } from './day-validation.js';

const HISTORY_FILE_PATTERN = /^\d{8}T\d{9}Z-[a-f0-9]{12}\.json$/;

function fsyncDirectory(directory) {
  let fd;
  try {
    fd = fs.openSync(directory, 'r');
    fs.fsyncSync(fd);
  } catch (error) {
    // Some filesystems do not allow fsync on directories. File fsync + rename still
    // provides atomic visibility, so only rethrow errors unrelated to that limitation.
    if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EBADF'].includes(error.code)) throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function atomicWriteFile(file, contents) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, contents, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, file);
    fsyncDirectory(directory);
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    try {
      fs.unlinkSync(temporary);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') console.warn('[days] 临时文件清理失败:', cleanupError.message);
    }
    throw error;
  }
}

function parseBackupLimit(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 30;
}

let lastVersionTimestamp = 0;

function versionName() {
  // Keep filenames lexicographically chronological even when several saves occur
  // within one millisecond or the system clock moves backwards.
  const timestampMs = Math.max(Date.now(), lastVersionTimestamp + 1);
  lastVersionTimestamp = timestampMs;
  const timestamp = new Date(timestampMs).toISOString().replace(/[-:.]/g, '');
  return `${timestamp}-${crypto.randomBytes(6).toString('hex')}.json`;
}

export function createDayStore({ dataRoot, backupLimit = 30 } = {}) {
  if (!dataRoot) throw new Error('createDayStore requires dataRoot');
  const daysDir = path.join(dataRoot, 'days');
  const historyRoot = path.join(dataRoot, 'history', 'days');
  const retainedVersions = parseBackupLimit(backupLimit);
  fs.mkdirSync(daysDir, { recursive: true });
  fs.mkdirSync(historyRoot, { recursive: true });

  const dayFile = (date) => path.join(daysDir, `${date}.json`);
  const historyDir = (date) => path.join(historyRoot, date);

  function readAndValidate(file, expectedDate) {
    let value;
    try {
      value = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(`无法解析 JSON 文件 ${path.basename(file)}: ${error.message}`);
    }
    try {
      return assertValidDay(value, expectedDate);
    } catch (error) {
      if (error instanceof ValidationError) {
        const wrapped = new Error(`JSON 文件 ${path.basename(file)} 未通过结构校验`);
        wrapped.details = error.details;
        throw wrapped;
      }
      throw error;
    }
  }

  function readDay(date) {
    assertValidDate(date);
    const file = dayFile(date);
    if (!fs.existsSync(file)) return null;
    return readAndValidate(file, date);
  }

  function pruneHistory(date) {
    const directory = historyDir(date);
    const files = fs.readdirSync(directory)
      .filter((file) => HISTORY_FILE_PATTERN.test(file))
      .sort()
      .reverse();
    for (const file of files.slice(retainedVersions)) fs.unlinkSync(path.join(directory, file));
  }

  function saveDay(date, day) {
    assertValidDate(date);
    assertValidDay(day, date);
    const serialized = `${JSON.stringify(day, null, 2)}\n`;
    const file = dayFile(date);
    const existingContents = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (existingContents === serialized) {
      return { changed: false, version: null };
    }

    const writeVersion = (contents) => {
      const version = versionName();
      atomicWriteFile(path.join(historyDir(date), version), contents);
      return version;
    };

    if (existingContents !== null) {
      // A pre-history installation may already have live files. Preserve that last
      // known-good state before the first replacement, unless it is already the
      // newest snapshot.
      const existingDay = readAndValidate(file, date);
      const canonicalExisting = `${JSON.stringify(existingDay, null, 2)}\n`;
      const newest = listHistory(date)[0];
      const newestContents = newest
        ? fs.readFileSync(path.join(historyDir(date), newest.version), 'utf8')
        : null;
      if (newestContents !== canonicalExisting) writeVersion(canonicalExisting);
    }

    // Persist the recoverable snapshot first. If replacing the live file fails, the
    // accepted payload still exists in history and the previous live file is intact.
    const newestAfterLegacySnapshot = listHistory(date)[0];
    const newestContents = newestAfterLegacySnapshot
      ? fs.readFileSync(path.join(historyDir(date), newestAfterLegacySnapshot.version), 'utf8')
      : null;
    const version = newestContents === serialized
      ? newestAfterLegacySnapshot.version
      : writeVersion(serialized);
    atomicWriteFile(file, serialized);
    try {
      pruneHistory(date);
    } catch (error) {
      console.warn('[days] 历史版本清理失败:', error.message);
    }
    return { changed: true, version };
  }

  function listDates() {
    return fs.readdirSync(daysDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.slice(0, -5))
      .filter(isValidDate)
      .sort();
  }

  function listHistory(date) {
    assertValidDate(date);
    const directory = historyDir(date);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory)
      .filter((file) => HISTORY_FILE_PATTERN.test(file))
      .sort()
      .reverse()
      .map((version) => {
        const stat = fs.statSync(path.join(directory, version));
        return { version, savedAt: stat.mtime.toISOString(), size: stat.size };
      });
  }

  function readVersion(date, version) {
    assertValidDate(date);
    if (!HISTORY_FILE_PATTERN.test(version)) {
      throw new ValidationError('历史版本标识不合法', [{ path: 'version', message: 'Invalid version name' }]);
    }
    const file = path.join(historyDir(date), version);
    if (!fs.existsSync(file)) return null;
    return readAndValidate(file, date);
  }

  function restoreVersion(date, version) {
    const day = readVersion(date, version);
    if (!day) return null;
    return { day, ...saveDay(date, day) };
  }

  return {
    daysDir,
    historyRoot,
    readDay,
    saveDay,
    listDates,
    listHistory,
    readVersion,
    restoreVersion,
  };
}
