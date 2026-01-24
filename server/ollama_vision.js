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
  // Use a prompt that Moondream likes to talk about
  const prompt = "Is there a handwritten note or white card in the image?";
  const response = await ollamaRequest('moondream', prompt, imageBuffer);
  const text = response.toLowerCase();
  console.log(`[Detection Check] Moondream: "${text}"`);

  // Keywords that indicate a card is found
  return text.includes('yes') || text.match(/card|paper|note|writing|holding|piece|message|white/);
}

async function readNotecard(imageBuffer) {
  // Use a more forceful prompt for Llama 3.2
  const prompt = "Please read the two handwritten words on this white card carefully. Transcribe them exactly as they are written. Output only the text.";
  const response = await ollamaRequest('llama3.2-vision:11b', prompt, imageBuffer);

  // Less aggressive cleaning to avoid losing valid text
  const cleanedText = response.replace(/\*\*.*?\*\*|Transcription:|Output:|^"|"$/gi, '').trim();

  return {
    text: cleanedText,
    confidence: null,
    durationMs: 0
  };
}

module.exports = { detectNotecard, readNotecard };
