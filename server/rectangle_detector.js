const sharp = require('sharp');

/**
 * Detects if a notecard (white rectangular object) occupies the center of the frame
 * 
 * Strategy: Look for a large, light-colored rectangular region in the center that
 * contrasts with the background. Similar to mobile check deposit systems.
 */

async function detectNotecardRectangle(imageBuffer) {
  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const { width, height } = metadata;

    // Get grayscale pixel data
    const { data, info } = await image
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Analyze the image for a white rectangular object
    const detection = analyzeForWhiteRectangle(data, info.width, info.height);

    console.log(`[Rectangle Detection] Detected: ${detection.detected}, Confidence: ${(detection.confidence * 100).toFixed(1)}%`);
    console.log(`[Rectangle Detection] Center Brightness: ${detection.details.centerBrightness.toFixed(1)} (need >120)`);
    console.log(`[Rectangle Detection] Border Brightness: ${detection.details.avgBorderBrightness.toFixed(1)}`);
    console.log(`[Rectangle Detection] Contrast Ratio: ${detection.details.contrastRatio.toFixed(2)} (need >1.00)`);
    console.log(`[Rectangle Detection] Center Uniformity: ${detection.details.centerUniformity.toFixed(2)} (need >0.75)`);
    console.log(`[Rectangle Detection] Checks: bright=${detection.details.isBright}, contrast=${detection.details.hasContrast}, uniform=${detection.details.isUniform}`);

    return detection.detected;

  } catch (error) {
    console.error('Rectangle detection error:', error);
    return false;
  }
}

/**
 * Analyzes image for a bright white rectangle (notecard) in the center
 */
function analyzeForWhiteRectangle(data, width, height) {
  // Define center region (where card should be)
  const centerX = width / 2;
  const centerY = height / 2;
  const centerW = width * 0.5;  // Center 50% of width
  const centerH = height * 0.5; // Center 50% of height

  // Analyze center region
  const centerStats = analyzeRegion(data, width, height,
    centerX - centerW / 2, centerY - centerH / 2,
    centerW, centerH);

  // Analyze border regions (top, bottom, left, right)
  const borders = [
    analyzeRegion(data, width, height, 0, 0, width, height * 0.15), // top
    analyzeRegion(data, width, height, 0, height * 0.85, width, height * 0.15), // bottom
    analyzeRegion(data, width, height, 0, 0, width * 0.15, height), // left
    analyzeRegion(data, width, height, width * 0.85, 0, width * 0.15, height) // right
  ];

  const avgBorderBrightness = borders.reduce((sum, b) => sum + b.meanBrightness, 0) / borders.length;

  // A notecard should be:
  // 1. BRIGHT (white paper) - center brightness > 180 (out of 255)
  // 2. UNIFORM (solid color, not complex) - low variance
  // 3. CONTRASTING with background - brighter than borders

  const centerBrightness = centerStats.meanBrightness;
  const centerUniformity = centerStats.uniformity;

  const contrastRatio = centerBrightness / (avgBorderBrightness + 1); // avoid div by zero

  // Detection criteria (adjusted for real-world lighting)
  const isBright = centerBrightness > 120; // Lowered from 180 - accounts for dim lighting
  const isUniform = centerUniformity > 0.75; // Lowered from 0.80 - allows more handwriting
  const hasContrast = contrastRatio > 1.00; // Center is at least as bright as borders (sometimes barely)

  const detected = isBright && isUniform && hasContrast;

  // Calculate confidence
  const confidence = detected ? calculateConfidence(centerBrightness, centerUniformity, contrastRatio) : 0;

  return {
    detected,
    confidence,
    details: {
      centerBrightness,
      avgBorderBrightness,
      centerUniformity,
      contrastRatio,
      isBright,
      isUniform,
      hasContrast
    }
  };
}

/**
 * Analyzes a specific region of the image for brightness and uniformity
 */
function analyzeRegion(data, imgWidth, imgHeight, x, y, w, h) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(imgWidth, Math.floor(x + w));
  const endY = Math.min(imgHeight, Math.floor(y + h));

  let sumBrightness = 0;
  let sumSquaredBrightness = 0;
  let totalPixels = 0;

  for (let row = startY; row < endY; row++) {
    for (let col = startX; col < endX; col++) {
      const idx = row * imgWidth + col;
      const pixelValue = data[idx];

      totalPixels++;
      sumBrightness += pixelValue;
      sumSquaredBrightness += pixelValue * pixelValue;
    }
  }

  const meanBrightness = totalPixels > 0 ? sumBrightness / totalPixels : 0;
  const variance = totalPixels > 0
    ? (sumSquaredBrightness / totalPixels) - (meanBrightness * meanBrightness)
    : 0;
  const stdDev = Math.sqrt(Math.max(0, variance));

  // Uniformity: high when standard deviation is low relative to mean
  // For a white card with some writing: stdDev might be 20-30, mean might be 200+
  const uniformity = meanBrightness > 0 ? 1 - Math.min(1, stdDev / meanBrightness) : 0;

  return {
    meanBrightness,
    stdDev,
    uniformity: Math.max(0, Math.min(1, uniformity))
  };
}

/**
 * Calculates confidence score (0-1)
 */
function calculateConfidence(brightness, uniformity, contrast) {
  // Normalize brightness (180-255 range to 0-1)
  const brightnessScore = Math.min(1, (brightness - 180) / 75);

  // Uniformity is already 0-1
  const uniformityScore = uniformity;

  // Normalize contrast (1.15-1.5 range to 0-1)
  const contrastScore = Math.min(1, (contrast - 1.15) / 0.35);

  // Weighted average
  return brightnessScore * 0.4 + uniformityScore * 0.4 + contrastScore * 0.2;
}

module.exports = { detectNotecardRectangle };
