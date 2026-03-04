import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.join(__dirname, '..', 'data');
const DAYS_DIR = path.join(DATA_ROOT, 'days');
const MEDIA_DIR = path.join(DATA_ROOT, 'media');

[DATA_ROOT, DAYS_DIR, MEDIA_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    cb(null, `${Date.now()}${ext}`);
  },
});
const upload = multer({ storage });

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/days/:date', (req, res) => {
  const file = path.join(DAYS_DIR, `${req.params.date}.json`);
  if (!fs.existsSync(file)) return res.json(null);
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.put('/api/days/:date', (req, res) => {
  const file = path.join(DAYS_DIR, `${req.params.date}.json`);
  try {
    const body = req.body || {};
    const blocks = (body.blocks || []).length;
    const media = (body.media || []).length;
    fs.writeFileSync(file, JSON.stringify(req.body, null, 2), 'utf8');
    console.log('[days] 已保存:', req.params.date, '时间块:', blocks, '附件:', media);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[days] 保存失败:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/days', (_req, res) => {
  if (!fs.existsSync(DAYS_DIR)) return res.json([]);
  const files = fs.readdirSync(DAYS_DIR).filter((f) => f.endsWith('.json'));
  const dates = files.map((f) => f.replace('.json', '')).sort();
  return res.json(dates);
});

app.post('/api/media', upload.single('file'), (req, res) => {
  if (!req.file) {
    console.error('[media] 未收到文件');
    return res.status(400).json({ error: 'No file' });
  }
  const capturedAt = req.body.capturedAt || new Date().toISOString();
  const type = (req.body.type === 'screenshot' ? 'screenshot' : 'photo');
  const id = path.basename(req.file.filename, path.extname(req.file.filename));
  const media = {
    id,
    capturedAt,
    filePath: req.file.filename,
    type,
    optionalLocation: req.body.optionalLocation || undefined,
    linkedBlockId: undefined,
  };
  const metaPath = path.join(MEDIA_DIR, `${id}.json`);
  fs.writeFileSync(metaPath, JSON.stringify(media, null, 2), 'utf8');
  console.log('[media] 已保存:', req.file.filename, '拍摄时间:', capturedAt);
  return res.json(media);
});

app.get('/media/:filename', (req, res) => {
  const file = path.join(MEDIA_DIR, req.params.filename);
  if (!fs.existsSync(file) || !path.resolve(file).startsWith(path.resolve(MEDIA_DIR))) return res.status(404).end();
  return res.sendFile(file);
});

// 删除附件：用 POST + body 传 filePath，避免 URL 编码导致路径错误
app.post('/api/media/delete', express.json(), (req, res) => {
  const filePath = req.body?.filePath;
  if (!filePath || typeof filePath !== 'string') return res.status(400).json({ error: 'Missing filePath' });
  const filename = path.basename(filePath);
  if (!filename) return res.status(400).json({ error: 'Invalid filePath' });
  const file = path.join(MEDIA_DIR, filename);
  const resolved = path.resolve(file);
  const resolvedDir = path.resolve(MEDIA_DIR);
  if (!resolved.startsWith(resolvedDir) || resolved === resolvedDir) return res.status(400).json({ error: 'Invalid path' });
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    const metaPath = path.join(MEDIA_DIR, path.basename(filename, path.extname(filename)) + '.json');
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`LifeTimeline API: http://localhost:${PORT}`));
