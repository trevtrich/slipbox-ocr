const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const preview = document.getElementById("preview");
const statusEl = document.getElementById("status");
const capturesList = document.getElementById("capturesList");

const startBtn = document.getElementById("startBtn");
const captureBtn = document.getElementById("captureBtn");
const stopBtn = document.getElementById("stopBtn");
const ocrBtn = document.getElementById("ocrBtn");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const saveBtn = document.getElementById("saveBtn");
const autoScanToggle = document.getElementById("autoScanToggle");

const titleEl = document.getElementById("title");
const textEl = document.getElementById("text");
const mdPreviewEl = document.getElementById("mdPreview");
const qualityEl = document.getElementById("quality");

let stream;
let lastCaptureBlob;
let isScanning = false;
let lastDetectTime = 0;
const DETECT_INTERVAL = 1500; // Check every 1.5s

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
  if (mdPreviewEl) mdPreviewEl.textContent = md;
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
      width: { ideal: 1280 }, // Lowering slightly for faster processing
      height: { ideal: 720 }
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
  isScanning = false;
}

async function captureFrame(qualityOverride = null) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("Camera not ready");

  // Center crop helper
  const targetAspect = 5 / 3;
  let cropW = Math.round(w * 0.9);
  let cropH = Math.round(cropW / targetAspect);
  if (cropH > h * 0.8) {
    cropH = Math.round(h * 0.8);
    cropW = Math.round(cropH * targetAspect);
  }
  const sx = (w - cropW) / 2;
  const sy = (h - cropH) / 2;

  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

  const quality = qualityOverride || (Number(qualityEl.value) / 100);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("Failed to capture image");
  return blob;
}

async function scanLoop() {
  if (!isScanning || !stream) return;

  const now = Date.now();
  if (now - lastDetectTime > DETECT_INTERVAL) {
    lastDetectTime = now;
    setStatus("Ollama: Searching for notecards...");

    try {
      // Capture a very low-quality image for detection
      const blob = await captureFrame(0.3);
      const form = new FormData();
      form.append("image", blob, "detect.jpg");

      const res = await fetch("/api/detect", {
        method: "POST",
        body: form
      });
      const { detected } = await res.json();

      if (detected) {
        setStatus("Ollama: Card detected! Reading...");
        await performAutoOcr();
      }
    } catch (e) {
      console.error("Detection error:", e);
    }
  }

  if (isScanning) {
    requestAnimationFrame(scanLoop);
  }
}

async function performAutoOcr() {
  isScanning = false; // Pause while reading
  try {
    const blob = await captureFrame(0.85);
    lastCaptureBlob = blob;
    preview.src = URL.createObjectURL(blob);
    preview.classList.remove("hidden");

    const form = new FormData();
    form.append("image", blob, "capture.jpg");
    const res = await fetch("/api/ocr?engine=ollama", { method: "POST", body: form });
    const json = await res.json();

    if (!res.ok) throw new Error(json.error);

    textEl.value = json.text || "";
    const firstLine = (json.text || "").split("\n").map(l => l.trim()).find(Boolean);
    if (firstLine) titleEl.value = firstLine.slice(0, 80);

    setStatus(`Ollama: Done (${json.durationMs}ms)`);
    enableExportButtons();
    addToHistory(blob, json.text);

    // Resume after 3 seconds to avoid double capture
    setTimeout(() => {
      if (autoScanToggle.checked) {
        isScanning = true;
        scanLoop();
      }
    }, 4000);

  } catch (e) {
    setStatus("OCR Error: " + e.message);
    isScanning = true;
    scanLoop();
  }
}

function addToHistory(blob, text) {
  const itemEl = document.createElement('div');
  itemEl.className = 'capture-item done';
  const timestamp = new Date().toLocaleTimeString();
  const url = URL.createObjectURL(blob);

  itemEl.innerHTML = `
        <img src="${url}">
        <div class="info">
            <h4>${timestamp}</h4>
            <p>${text.slice(0, 80)}...</p>
        </div>
        <div class="status-badge" style="background:var(--success)">Local</div>
    `;
  if (capturesList) capturesList.prepend(itemEl);
}

async function runOcr() {
  if (!lastCaptureBlob) throw new Error("Capture an image first");
  setStatus("Ollama: Reading...");

  const form = new FormData();
  form.append("image", lastCaptureBlob, "manual.jpg");
  const res = await fetch("/api/ocr?engine=ollama", { method: "POST", body: form });
  const json = await res.json();

  textEl.value = json.text || "";
  enableExportButtons();
  setStatus(`Ollama: Done (${json.durationMs}ms)`);
}

// Event Listeners
startBtn.addEventListener("click", async () => {
  try {
    await startCamera();
    startBtn.disabled = true;
    captureBtn.disabled = false;
    stopBtn.disabled = false;
    setStatus("Camera ready");
  } catch (e) { setStatus(e.message); }
});

stopBtn.addEventListener("click", () => {
  stopCamera();
  startBtn.disabled = false;
  captureBtn.disabled = true;
  stopBtn.disabled = true;
  autoScanToggle.checked = false;
  setStatus("Stopped");
});

captureBtn.addEventListener("click", async () => {
  const blob = await captureFrame();
  lastCaptureBlob = blob;
  preview.src = URL.createObjectURL(blob);
  preview.classList.remove("hidden");
  ocrBtn.disabled = false;
  setStatus("Captured. Ready for Ollama.");
});

ocrBtn.addEventListener("click", runOcr);

autoScanToggle.addEventListener('change', () => {
  if (autoScanToggle.checked) {
    if (!stream) {
      autoScanToggle.checked = false;
      return setStatus("Start camera first");
    }
    isScanning = true;
    scanLoop();
  } else {
    isScanning = false;
  }
});

copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(textEl.value);
  setStatus("Copied");
});

downloadBtn.addEventListener("click", () => {
  const md = buildMarkdown();
  const blob = new Blob([md], { type: "text/markdown" });
  const a = document.createElement("a");
  a.download = (titleEl.value || "notecard") + ".md";
  a.href = URL.createObjectURL(blob);
  a.click();
});

saveBtn.addEventListener("click", async () => {
  const md = buildMarkdown();
  const res = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown: md })
  });
  const json = await res.json();
  setStatus(`Saved to ${json.filename}`);
});

textEl.addEventListener("input", enableExportButtons);
titleEl.addEventListener("input", buildMarkdown);
