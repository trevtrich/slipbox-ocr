const { GoogleGenerativeAI } = require('@google/generative-ai');

async function recognizeWithGemini(imageBuffer, mimeType = 'image/png') {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  const prompt = 'Transcribe the handwritten text on this 3x5 notecard exactly. Only output the transcribed text.';
  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType,
    },
  };

  const startedAt = Date.now();
  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;
  const text = response.text();
  const durationMs = Date.now() - startedAt;

  return {
    text: text.trim(),
    confidence: null, // Gemini doesn't return a simple confidence score usually
    durationMs
  };
}

module.exports = { recognizeWithGemini };
