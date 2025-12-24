const fs = require('fs/promises');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function saveMarkdown(markdown) {
  const firstLine = (markdown.split('\n')[0] || 'notecard')
    .replace(/^#\s*/, '')
    .trim();
  const safeTitle = firstLine.replace(/[^\w\- ]+/g, '').slice(0, 40) || 'notecard';
  const filename = `card_${Date.now()}_${safeTitle.replace(/\s+/g, '_')}.md`;

  const fullPath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(fullPath, markdown, 'utf8');

  return { filename, fullPath };
}

module.exports = { ensureOutputDir, saveMarkdown };
