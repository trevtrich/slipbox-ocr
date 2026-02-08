require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');

const { recognizeWithGemini } = require('./gemini_vision');
const { detectNotecardRectangle } = require('./rectangle_detector');
const { ensureOutputDir, saveMarkdown } = require('./storage');

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
  res.json({ ok: true, engine: 'gemini' });
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

    const result = await recognizeWithGemini(req.file.buffer, req.file.mimetype);
    return res.json({
      ...result,
      engine: 'gemini'
    });
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
