const fs = require('fs/promises');
const path = require('path');

const OUTPUT_DIR = process.env.OBSIDIAN_DIR || path.join(__dirname, '..', 'output');
const QUEUE_DIR = path.join(__dirname, '..', 'uploads', 'queue');
const PROCESSED_DIR = path.join(__dirname, '..', 'uploads', 'processed');

async function ensureDirs() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(QUEUE_DIR, { recursive: true });
  await fs.mkdir(PROCESSED_DIR, { recursive: true });
}

async function listQueue() {
  await ensureDirs();
  const files = await fs.readdir(QUEUE_DIR);
  return files.filter(f => f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg')).sort();
}

async function saveToQueue(buffer) {
  await ensureDirs();
  const filename = `queue_${Date.now()}.jpg`;
  const fullPath = path.join(QUEUE_DIR, filename);
  await fs.writeFile(fullPath, buffer);
  return filename;
}

async function deleteFromQueue(filename) {
  const fullPath = path.join(QUEUE_DIR, filename);
  try {
    await fs.unlink(fullPath);
  } catch (e) { }
}

async function getQueueImageBuffer(filename) {
  const fullPath = path.join(QUEUE_DIR, filename);
  return await fs.readFile(fullPath);
}

// PROCESSED STORAGE FUNCTIONS
async function listProcessed() {
  await ensureDirs();
  const files = await fs.readdir(PROCESSED_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json')).sort();

  const cards = [];
  for (const file of jsonFiles) {
    try {
      const content = await fs.readFile(path.join(PROCESSED_DIR, file), 'utf8');
      cards.push({ id: file, ...JSON.parse(content) });
    } catch (e) {
      console.error(`Failed to read processed file ${file}`, e);
    }
  }
  return cards;
}

async function saveProcessedCard(cardData) {
  await ensureDirs();
  const id = `card_${Date.now()}.json`;
  const fullPath = path.join(PROCESSED_DIR, id);
  await fs.writeFile(fullPath, JSON.stringify(cardData, null, 2), 'utf8');
  return id;
}

async function updateProcessedCard(id, updates) {
  const fullPath = path.join(PROCESSED_DIR, id);
  try {
    const content = await fs.readFile(fullPath, 'utf8');
    const data = JSON.parse(content);
    const newData = { ...data, ...updates };
    await fs.writeFile(fullPath, JSON.stringify(newData, null, 2), 'utf8');
  } catch (e) { }
}

async function deleteProcessedCard(id) {
  const fullPath = path.join(PROCESSED_DIR, id);
  try {
    const content = await fs.readFile(fullPath, 'utf8');
    const data = JSON.parse(content);
    if (data.originalQueueName) {
      await fs.unlink(path.join(PROCESSED_DIR, data.originalQueueName)).catch(() => { });
    }
    await fs.unlink(fullPath);
  } catch (e) { }
}

async function moveQueueToProcessed(filename) {
  const oldPath = path.join(QUEUE_DIR, filename);
  const newPath = path.join(PROCESSED_DIR, filename);
  try {
    await fs.rename(oldPath, newPath);
  } catch (e) { }
}

async function saveMarkdown({ markdown, title }) {
  let safeTitle = 'notecard';
  if (title) {
    safeTitle = title.replace(/[^\w\- ]+/g, '').slice(0, 100).trim();
  } else {
    const firstLine = (markdown.split('\n')[0] || 'notecard')
      .replace(/^#\s*/, '')
      .trim();
    safeTitle = firstLine.replace(/[^\w\- ]+/g, '').slice(0, 40) || 'notecard';
  }

  let filename = `${safeTitle}.md`;
  let fullPath = path.join(OUTPUT_DIR, filename);

  try {
    await fs.access(fullPath);
    filename = `${safeTitle} ${Date.now()}.md`;
    fullPath = path.join(OUTPUT_DIR, filename);
  } catch (e) { }

  await fs.writeFile(fullPath, markdown, 'utf8');
  return { filename, fullPath };
}

module.exports = {
  ensureDirs,
  saveMarkdown,
  listQueue,
  saveToQueue,
  deleteFromQueue,
  getQueueImageBuffer,
  listProcessed,
  saveProcessedCard,
  updateProcessedCard,
  deleteProcessedCard,
  moveQueueToProcessed
};
