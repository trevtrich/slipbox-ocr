const fs = require('fs');

async function testOCR(model, prompt, imagePath) {
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');

  console.log(`--- Testing ${model} OCR ---`);
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        images: [imageBase64],
        stream: false
      })
    });
    const data = await response.json();
    console.log(`Prompt: "${prompt}"\nResponse: "${data.response.trim()}"\n`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

const img = '/Users/trevorr/.gemini/antigravity/brain/958b455c-78fb-4daa-aeba-4e05d5d0b52f/uploaded_media_1769289967415.png';
const p6 = "Look at the first handwritten word. It starts with 'S'. The middle has 't', 'r', 'i'. The end is 'ct'. Transcribe the full two words on the card.";
const p7 = "Transcribe the text on the card. Be careful with the first word, it is a technical term ending in 'ct'.";

testOCR('llama3.2-vision:11b', p6, img);
testOCR('llama3.2-vision:11b', p7, img);
testOCR('minicpm-v', p6, img);
testOCR('minicpm-v', p7, img);
