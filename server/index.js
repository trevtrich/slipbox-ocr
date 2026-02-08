require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');

const { recognizeWithGemini } = require('./gemini_vision');
const { detectNotecard, readNotecard } = require('./ollama_vision');
const { detectNotecardRectangle } = require('./rectangle_detector');
const { ensureOutputDir, saveMarkdown } = require('./storage');
const { autoCropNotecard, enhanceForOcr } = require('./preprocess');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = express();

// LiveReload logic for a better DX
if (process.env.NODE_ENV !== 'production') {
  const livereload = require("livereload");
  const connectLiveReload = require("connect-livereload");

  const liveReloadServer = livereload.createServer({
    exts: ['js', 'css', 'html'],
    extraWatchDirs: [path.join(__dirname, '..', 'public')]
  });
  liveReloadServer.watch(path.join(__dirname, '..', 'public'));

  app.use(connectLiveReload());

  // Refresh browser 100ms after server restart
  liveReloadServer.server.once("connection", () => {
    setTimeout(() => {
      liveReloadServer.refresh("/");
    }, 100);
  });
}

app.use(express.json({ limit: '2mb' }));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/output', express.static(path.join(__dirname, '..', 'output')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.get('/api/health', (_req, res) => {
  const engines = ['gemini', 'ollama'];
  res.json({ ok: true, engines, defaultEngine: 'gemini' });
});

app.post('/api/detect', upload.single('image'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'Missing image' });

    const startTime = Date.now();
    const detected = await detectNotecardRectangle(req.file.buffer);
    const durationMs = Date.now() - startTime;

    console.log(`[CV Detection] Result: ${detected}, took ${durationMs}ms`);

    res.json({ detected, durationMs });
  } catch (err) {
    console.error('[CV Detection] Error:', err);
    res.status(500).json({ error: err?.message ?? 'Detection failed' });
  }
});

app.post('/api/ocr', upload.single('image'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'Missing image' });

    const engine = String(req.query.engine || 'gemini').toLowerCase();
    const preprocess = req.query.preprocess !== '0';
    const autocrop = req.query.autocrop === '1';

    let working = req.file.buffer;
    let crop = null;

    if (autocrop) {
      const cropped = await autoCropNotecard(working);
      working = cropped.buffer;
      crop = cropped.crop;
    }

    if (preprocess && engine !== 'ollama') {
      working = await enhanceForOcr(working);
    }

    if (engine === 'gemini') {
      const result = await recognizeWithGemini(working, req.file.mimetype);
      return res.json({
        ...result,
        engine: 'gemini',
        crop,
        applied: { preprocess, autocrop }
      });
    }

    if (engine === 'ollama') {
      const start = Date.now();
      const result = await readNotecard(working);
      const durationMs = Date.now() - start;
      return res.json({
        ...result,
        engine: 'ollama',
        durationMs,
        crop,
        applied: { preprocess, autocrop }
      });
    }

    throw new Error('Unsupported engine: ' + engine);
  } catch (err) {
    console.error('OCR Error:', err);
    res.status(500).json({ error: err?.message ?? 'OCR failed' });
  }
});

app.post('/api/save', async (req, res) => {
  try {
    const markdown = req.body?.markdown;
    if (typeof markdown !== 'string' || markdown.trim().length === 0) {
      return res.status(400).json({ error: 'Missing markdown' });
    }
    await ensureOutputDir();
    const { filename } = await saveMarkdown(markdown);
    res.json({ ok: true, filename });
  } catch (err) {
    console.error('Save Error:', err);
    res.status(500).json({ error: err?.message ?? 'Save failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Slipbox OCR running on http://localhost:${PORT}`);
});
