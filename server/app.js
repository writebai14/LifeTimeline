import express from 'express';
import fs from 'fs';
import path from 'path';
import { atomicWriteFile, createDayStore } from './day-store.js';
import { assertValidDate, ValidationError } from './day-validation.js';

function sendRequestError(res, error) {
  if (error instanceof ValidationError) {
    return res.status(400).json({ error: error.message, details: error.details });
  }
  console.error('[days] 请求失败:', error.message);
  return res.status(500).json({ error: error.message, details: error.details });
}

export function createApp({ dataRoot, staticRoot, backupLimit = 30 } = {}) {
  if (!dataRoot) throw new Error('createApp requires dataRoot');
  const dayStore = createDayStore({ dataRoot, backupLimit });
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/days', (_req, res) => res.json(dayStore.listDates()));

  app.get('/api/days/:date/history', (req, res) => {
    try {
      assertValidDate(req.params.date);
      return res.json(dayStore.listHistory(req.params.date));
    } catch (error) {
      return sendRequestError(res, error);
    }
  });

  app.get('/api/days/:date/history/:version', (req, res) => {
    try {
      assertValidDate(req.params.date);
      const day = dayStore.readVersion(req.params.date, req.params.version);
      if (!day) return res.status(404).json({ error: '历史版本不存在' });
      return res.json(day);
    } catch (error) {
      return sendRequestError(res, error);
    }
  });

  app.post('/api/days/:date/history/:version/restore', (req, res) => {
    try {
      assertValidDate(req.params.date);
      const result = dayStore.restoreVersion(req.params.date, req.params.version);
      if (!result) return res.status(404).json({ error: '历史版本不存在' });
      console.log('[days] 已恢复历史版本:', req.params.date, req.params.version);
      return res.json({ ok: true, version: result.version, day: result.day });
    } catch (error) {
      return sendRequestError(res, error);
    }
  });

  app.get('/api/days/:date', (req, res) => {
    try {
      assertValidDate(req.params.date);
      return res.json(dayStore.readDay(req.params.date));
    } catch (error) {
      return sendRequestError(res, error);
    }
  });

  // 整日读写：blocks[].source 可为 manual | from_media | from_quick_note。
  app.put('/api/days/:date', (req, res) => {
    try {
      assertValidDate(req.params.date);
      const result = dayStore.saveDay(req.params.date, req.body);
      const blocks = req.body.blocks.length;
      const media = req.body.media.length;
      console.log('[days] 已保存:', req.params.date, '时间块:', blocks, '附件:', media, '版本:', result.version ?? '未变化');
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[days] 保存失败:', error.message);
      return sendRequestError(res, error);
    }
  });

  app.get('/media/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    if (filename !== req.params.filename) return res.status(404).end();
    const file = path.join(dataRoot, 'media', filename);
    if (!fs.existsSync(file)) return res.status(404).end();
    return res.sendFile(file);
  });

  if (staticRoot && fs.existsSync(staticRoot)) {
    app.use(express.static(staticRoot));
    app.get('*', (_req, res) => res.sendFile(path.join(staticRoot, 'index.html')));
  }

  // Keep malformed JSON and oversized bodies in the API's JSON error contract.
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: '请求体不是有效的 JSON' });
    }
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: '请求体超过 5 MB 限制' });
    }
    console.error('[server] 未处理错误:', error.message);
    return res.status(500).json({ error: '服务器内部错误' });
  });

  return app;
}
