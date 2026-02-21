const { GoogleGenerativeAI } = require('@google/generative-ai');

async function recognizeWithGemini(imageBuffer, mimeType = 'image/png') {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `Transcribe the handwritten text on this 3x5 notecard. 
Also, generate a short, punchy, one-sentence idea summary to use as a filename.
Return ONLY a valid JSON object with two keys: "title" and "text".
Do NOT format it as code blocks with \`\`\`json. Return raw JSON.
The text should consist of continuous paragraphs.
Use a double newline only when there is a clear, intentional paragraph break or a list in the handwriting.
Do not use single newlines for line wraps.`;

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType,
    },
  };

  const startedAt = Date.now();
  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;

  // Parse response as JSON
  const rawText = response.text().trim();
  let jsonResult = { title: "Untitled Idea", text: rawText };
  try {
    const jsonStr = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    jsonResult = JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse Gemini JSON:", e);
    // fallback: try to extract something that looks like JSON or just use raw text
  }

  const durationMs = Date.now() - startedAt;

  return {
    title: jsonResult.title,
    text: jsonResult.text,
    confidence: null,
    durationMs
  };
}

module.exports = { recognizeWithGemini };
