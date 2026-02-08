#!/usr/bin/env node

/**
 * Test all sample cases to validate detection accuracy
 */

const fs = require('fs');
const path = require('path');
const { detectNotecardRectangle } = require('../server/rectangle_detector');

const TEST_CASES = [
  { file: 'positive-1.png', expected: true, description: 'Notecard held up, centered' },
  { file: 'negative-1-face.png', expected: false, description: 'Person face, no card' },
  { file: 'negative-2.png', expected: false, description: 'Person looking down, no card' },
  { file: 'positive-2.png', expected: true, description: 'Notecard held up, centered' }
];

async function runAllTests() {
  console.log('\n=== Running Rectangle Detection Test Suite ===\n');

  const testDir = path.join(__dirname, '..', 'test_images');

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const testCase of TEST_CASES) {
    const imagePath = path.join(testDir, testCase.file);

    console.log(`\nTest: ${testCase.file}`);
    console.log(`Expected: ${testCase.expected ? '✅ DETECT' : '❌ NO DETECT'}`);
    console.log(`Description: ${testCase.description}`);

    try {
      if (!fs.existsSync(imagePath)) {
        console.log(`⚠️  SKIP - File not found: ${imagePath}`);
        continue;
      }

      const imageBuffer = fs.readFileSync(imagePath);
      const startTime = Date.now();
      const detected = await detectNotecardRectangle(imageBuffer);
      const durationMs = Date.now() - startTime;

      console.log(`Result: ${detected ? '✅ DETECTED' : '❌ NOT DETECTED'} (${durationMs}ms)`);

      const success = detected === testCase.expected;
      if (success) {
        console.log(`✓ PASS`);
        passed++;
      } else {
        console.log(`✗ FAIL - Expected ${testCase.expected} but got ${detected}`);
        failed++;
        failures.push({
          file: testCase.file,
          expected: testCase.expected,
          actual: detected
        });
      }

    } catch (error) {
      console.error(`❌ ERROR:`, error.message);
      failed++;
      failures.push({
        file: testCase.file,
        expected: testCase.expected,
        error: error.message
      });
    }
  }

  console.log('\n\n=== Test Summary ===');
  console.log(`Total: ${passed + failed}`);
  console.log(`Passed: ${passed} ✓`);
  console.log(`Failed: ${failed} ✗`);
  console.log(`Accuracy: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failures.length > 0) {
    console.log('\n=== Failures ===');
    failures.forEach(f => {
      console.log(`- ${f.file}: expected ${f.expected}, got ${f.actual || 'ERROR'}`);
      if (f.error) console.log(`  Error: ${f.error}`);
    });
  }

  console.log('\n');

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests();
