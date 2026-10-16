import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = process.env.LIFETIMELINE_DATA_ROOT || path.join(__dirname, '..', 'data');
const staticRoot = process.env.LIFETIMELINE_STATIC_ROOT;
const backupLimit = process.env.LIFETIMELINE_DAY_HISTORY_LIMIT || 30;
const port = Number(process.env.PORT || 3001);

const app = createApp({ dataRoot, staticRoot, backupLimit });
app.listen(port, () => console.log(`LifeTimeline API: http://localhost:${port}`));
