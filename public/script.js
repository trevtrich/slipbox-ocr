const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const preview = document.getElementById("preview");
const statusEl = document.getElementById("status");

const startBtn = document.getElementById("startBtn");
const captureBtn = document.getElementById("captureBtn");
const stopBtn = document.getElementById("stopBtn");
const ocrBtn = document.getElementById("ocrBtn");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const saveBtn = document.getElementById("saveBtn");

const titleEl = document.getElementById("title");
const textEl = document.getElementById("text");
const mdPreviewEl = document.getElementById("mdPreview");
const qualityEl = document.getElementById("quality");
const engineEl = document.getElementById("engine");

let stream;
let lastCaptureBlob;

function setStatus(text) {
  statusEl.textContent = text;
}

function nowTitle() {
  const d = new Date();
  return d.toLocaleString();
}

function buildMarkdown() {
  const title = (titleEl.value || nowTitle()).trim();
  const text = (textEl.value || "").trim();
  const capturedAt = new Date().toISOString();
  const md = `# ${title}\n\n${text}\n\n---\nCaptured: ${capturedAt}\n`;
  mdPreviewEl.textContent = md;
  return md;
}

function enableExportButtons() {
  const hasText = (textEl.value || "").trim().length > 0;
  copyBtn.disabled = !hasText;
  downloadBtn.disabled = !hasText;
  saveBtn.disabled = !hasText;
  buildMarkdown();
}

async function startCamera() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: false
  });
  video.srcObject = stream;
  await video.play();
}

function stopCamera() {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
  stream = undefined;
  video.srcObject = null;
}

async function captureFrame() {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("Camera not ready");

  // Crop to a centered 5:3 region
  const targetAspect = 5 / 3;
  let cropW = Math.round(w * 0.92);
  let cropH = Math.round(cropW / targetAspect);
  const maxH = Math.round(h * 0.76);
  if (cropH > maxH) {
    cropH = maxH;
    cropW = Math.round(cropH * targetAspect);
  }
  const sx = Math.round((w - cropW) / 2);
  const sy = Math.round((h - cropH) / 2);

  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

  const quality = Number(qualityEl.value) / 100;
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("Failed to capture image");

  lastCaptureBlob = blob;
  preview.src = URL.createObjectURL(blob);
  preview.classList.remove("hidden");
}

async function runOcr() {
  if (!lastCaptureBlob) throw new Error("Capture an image first");
  setStatus("Uploading to Gemini...");

  const form = new FormData();
  form.append("image", lastCaptureBlob, "capture.jpg");

  const query = new URLSearchParams({ engine: 'gemini', preprocess: "1" });
  const res = await fetch(`/api/ocr?${query.toString()}`, {
    method: "POST",
    body: form
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "OCR failed");

  textEl.value = json.text || "";
  if (!titleEl.value.trim()) {
    const firstLine = (json.text || "").split("\n").map((l) => l.trim()).find(Boolean);
    if (firstLine) titleEl.value = firstLine.slice(0, 80);
  }

  setStatus(`OCR done (${json.durationMs}ms)`);
  enableExportButtons();
}

async function copyText() {
  await navigator.clipboard.writeText(textEl.value || "");
  setStatus("Copied to clipboard");
}

function downloadMarkdown() {
  const md = buildMarkdown();
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  const safe = (titleEl.value || "notecard").trim().replace(/[^\w\- ]+/g, "").slice(0, 60);
  a.download = `${safe || "notecard"}.md`;
  a.href = URL.createObjectURL(blob);
  a.click();
  setStatus("Downloaded Markdown");
}

async function saveMarkdown() {
  const md = buildMarkdown();
  const res = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown: md })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Save failed");
  setStatus(`Saved to output/${json.filename}`);
}

startBtn.addEventListener("click", async () => {
  try {
    setStatus("Starting camera...");
    await startCamera();
    startBtn.disabled = true;
    captureBtn.disabled = false;
    stopBtn.disabled = false;
    setStatus("Camera ready");
  } catch (e) {
    setStatus(e.message);
  }
});

stopBtn.addEventListener("click", () => {
  stopCamera();
  startBtn.disabled = false;
  captureBtn.disabled = true;
  stopBtn.disabled = true;
  ocrBtn.disabled = true;
  setStatus("Camera stopped");
});

captureBtn.addEventListener("click", async () => {
  try {
    await captureFrame();
    ocrBtn.disabled = false;
    setStatus("Captured. Ready for Gemini.");
  } catch (e) {
    setStatus(e.message);
  }
});

ocrBtn.addEventListener("click", async () => {
  try {
    ocrBtn.disabled = true;
    await runOcr();
  } catch (e) {
    setStatus(e.message);
  } finally {
    ocrBtn.disabled = false;
  }
});

copyBtn.addEventListener("click", copyText);
downloadBtn.addEventListener("click", downloadMarkdown);
saveBtn.addEventListener("click", saveMarkdown);

textEl.addEventListener("input", enableExportButtons);
titleEl.addEventListener("input", buildMarkdown);

buildMarkdown();
enableExportButtons();
