const fs = require('fs');

async function ollamaRequest(model, prompt, imageBuffer) {
  const imageBase64 = imageBuffer.toString('base64');

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

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama error: ${err}`);
    }

    const data = await response.json();
    return data.response.trim();
  } catch (error) {
    console.error('Ollama communication error:', error);
    throw error;
  }
}

async function detectNotecard(imageBuffer) {
  // We use a very fast small model for detection
  const prompt = "Is there a 3x5 handwritten notecard clearly visible in this image? Answer only with 'Yes' or 'No'.";
  const response = await ollamaRequest('moondream', prompt, imageBuffer);
  return response.toLowerCase().includes('yes');
}

async function readNotecard(imageBuffer) {
  // We can use moondream or a slightly better one depending on performance
  const prompt = "Transcribe the handwritten text on this notecard exactly. Only output the transcribed text.";
  const response = await ollamaRequest('moondream', prompt, imageBuffer);

  // Simple duration tracking for consistency with previous API
  return {
    text: response,
    confidence: null,
    durationMs: 0 // Placeholder, we can track this at the server level
  };
}

module.exports = { detectNotecard, readNotecard };
