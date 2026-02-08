#!/usr/bin/env node

/**
 * Test script for rectangle detection
 * Usage: node scripts/test_rectangle_detection.js <image_path>
 */

const fs = require('fs');
const path = require('path');
const { detectNotecardRectangle } = require('../server/rectangle_detector');

async function testDetection(imagePath) {
  console.log(`\n=== Testing Rectangle Detection ===`);
  console.log(`Image: ${imagePath}`);

  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const startTime = Date.now();
    const result = await detectNotecardRectangle(imageBuffer);
    const durationMs = Date.now() - startTime;

    console.log(`\n✓ Detection completed in ${durationMs}ms`);
    console.log(`Result: ${result ? '✅ NOTECARD DETECTED' : '❌ NO NOTECARD'}`);
    console.log(`\n=== Test Complete ===\n`);

  } catch (error) {
    console.error(`\n❌ Error:`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/test_rectangle_detection.js <image_path>');
  process.exit(1);
}

testDetection(args[0]);
