const sharp = require('sharp');

async function autoCropNotecard(imageBuffer) {
  // Simplistic crop assuming notecard is centered or clearly bounded.
  // In a real scenario, this would use contour detection.
  // For now, we return the original with high-res metadata.
  return { buffer: imageBuffer, crop: null };
}

async function enhanceForOcr(imageBuffer, options = {}) {
  const pipeline = sharp(imageBuffer, { failOn: 'none' })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2, m1: 1, m2: 2 });

  if (options.threshold != null) {
    pipeline.threshold(options.threshold);
  }

  const meta = await pipeline.metadata();
  const w = meta.width ?? 0;
  // Upscale if too small for the VLM/OCR to see clearly
  if (w && w < 1400) pipeline.resize({ width: 1600, withoutEnlargement: false });

  return pipeline.png().toBuffer();
}

module.exports = { autoCropNotecard, enhanceForOcr };
