require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');

const { recognizeWithGemini } = require('./gemini_vision');
const { detectNotecardRectangle } = require('./rectangle_detector');
const {
  ensureDirs,
  saveMarkdown,
  saveToQueue,
  listQueue,
  deleteFromQueue,
  getQueueImageBuffer,
  listProcessed,
  saveProcessedCard,
  updateProcessedCard,
  deleteProcessedCard,
  moveQueueToProcessed
} = require('./storage');

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

app.use(express.json({ limit: '50mb' }));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/output', express.static(path.join(__dirname, '..', 'output')));
app.use('/uploads/queue', express.static(path.join(__dirname, '..', 'uploads', 'queue')));
app.use('/uploads/processed', express.static(path.join(__dirname, '..', 'uploads', 'processed')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, engine: 'gemini' });
});

// --- QUEUE ENDPOINTS ---

app.get('/api/queue', async (req, res) => {
  try {
    const files = await listQueue();
    // Return relative paths that the frontend can load as images
    const queue = files.map(f => ({
      filename: f,
      url: `/uploads/queue/${f}`
    }));
    res.json({ queue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/queue', upload.single('image'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'Missing image' });
    const filename = await saveToQueue(req.file.buffer);
    res.json({ filename, url: `/uploads/queue/${filename}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/queue/:filename', async (req, res) => {
  try {
    await deleteFromQueue(req.params.filename);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Used by backend loop
app.post('/api/queue/:filename/process', async (req, res) => {
  try {
    const buffer = await getQueueImageBuffer(req.params.filename);
    const result = await recognizeWithGemini(buffer, 'image/jpeg');

    // Once successfully processed by gemini, move from queue to processed folder
    await moveQueueToProcessed(req.params.filename);

    const cardData = {
      title: result.title || "Untitled Idea",
      text: result.text || "",
      originalQueueName: req.params.filename,
      url: `/uploads/processed/${req.params.filename}`
    };
    const id = await saveProcessedCard(cardData);

    return res.json({ id, ...cardData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PROCESSED ENDPOINTS ---

app.get('/api/processed', async (req, res) => {
  try {
    const cards = await listProcessed();
    res.json({ cards });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/processed/:id', async (req, res) => {
  try {
    const { title, text } = req.body;
    await updateProcessedCard(req.params.id, { title, text });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/processed/:id', async (req, res) => {
  try {
    await deleteProcessedCard(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- LEGACY/CV ENDPOINTS ---

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
    const title = req.body?.title;
    if (typeof markdown !== 'string' || markdown.trim().length === 0) {
      return res.status(400).json({ error: 'Missing markdown' });
    }
    await ensureDirs();
    const { filename } = await saveMarkdown({ markdown, title });
    res.json({ ok: true, filename });
  } catch (err) {
    console.error('Save Error:', err);
    res.status(500).json({ error: err?.message ?? 'Save failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Slipbox OCR running on http://localhost:${PORT}`);
});
