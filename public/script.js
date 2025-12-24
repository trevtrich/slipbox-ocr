import { pipeline, RawImage } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

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
const engineEl = document.getElementById("engine");

let stream;
let lastCaptureBlob;
let detector;
let isScanning = false;
let lastAutoCaptureTime = 0;
const AUTO_CAPTURE_COOLDOWN = 3000; // 3 seconds

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

async function initDetector() {
  if (detector) return;
  try {
    setStatus("Loading model: downloading tiny detector (~25MB)...");
    detector = await pipeline('object-detection', 'Xenova/yolos-tiny');
    setStatus("Detector ready. Position a card in the guide.");
    console.log("Detector model loaded successfully.");
  } catch (e) {
    setStatus("Model Error: " + e.message);
    console.error("Detector load error:", e);
    autoScanToggle.checked = false;
    isScanning = false;
    video.parentElement.classList.remove('scanning');
  }
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
  isScanning = false;
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
  const url = URL.createObjectURL(blob);
  preview.src = url;
  preview.classList.remove("hidden");
  return { blob, url };
}

async function processAutoCapture(blob, url) {
  const itemEl = document.createElement('div');
  itemEl.className = 'capture-item';
  const timestamp = new Date().toLocaleTimeString();

  itemEl.innerHTML = `
        <img src="${url}">
        <div class="info">
            <h4>Capture ${timestamp}</h4>
            <p>Processing...</p>
        </div>
        <div class="status-badge">OCR</div>
    `;
  capturesList.prepend(itemEl);

  try {
    const form = new FormData();
    form.append("image", blob, "capture.jpg");
    const query = new URLSearchParams({ engine: 'gemini', preprocess: "1" });
    const res = await fetch(`/api/ocr?${query.toString()}`, {
      method: "POST",
      body: form
    });
    const json = await res.json();

    if (json.text) {
      itemEl.classList.add('done');
      itemEl.querySelector('p').textContent = json.text.slice(0, 100) + (json.text.length > 100 ? '...' : '');
      itemEl.querySelector('.status-badge').textContent = 'Done';

      // Also update the main editor if it's currently empty
      if (!textEl.value.trim()) {
        textEl.value = json.text;
        if (!titleEl.value.trim()) {
          const firstLine = json.text.split("\n").map(l => l.trim()).find(Boolean);
          if (firstLine) titleEl.value = firstLine.slice(0, 80);
        }
        enableExportButtons();
      }
    }
  } catch (e) {
    itemEl.querySelector('p').textContent = "OCR failed";
    itemEl.querySelector('.status-badge').style.background = 'var(--danger)';
  }
}

async function scanLoop() {
  if (!isScanning || !stream) return;

  try {
    const now = Date.now();
    if (now - lastAutoCaptureTime > AUTO_CAPTURE_COOLDOWN) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 224; // YOLOS prefers smaller inputs
      tempCanvas.height = 224;
      const ctx = tempCanvas.getContext('2d');
      ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

      const cardLabels = ['book', 'laptop', 'tablet', 'paper', 'envelope', 'cell phone', 'remote', 'mouse'];
      const detections = await detector(img, { threshold: 0.1 });

      if (detections.length > 0) {
        const top = detections.sort((a, b) => b.score - a.score)[0];
        console.log("Visible objects:", detections.map(d => `${d.label} (${Math.round(d.score * 100)}%)`));

        // Show what it's seeing to guide the user
        if (!isScanning) return; // Guard

        const found = detections.some(d => {
          const isCardLabel = cardLabels.includes(d.label);
          const isConfident = d.score > 0.45;
          const { xmin, ymin, xmax, ymax } = d.box;
          const w = (xmax - xmin) / tempCanvas.width;
          const h = (ymax - ymin) / tempCanvas.height;
          const area = w * h;

          return (isCardLabel || isConfident) && area > 0.02;
        });

        if (found) {
          const best = detections.find(d => cardLabels.includes(d.label)) || top;
          setStatus(`Detected ${best.label}! Capturing...`);
          const { blob, url } = await captureFrame();
          lastAutoCaptureTime = now;
          await processAutoCapture(blob, url);
          setStatus("Auto-scan: Waiting for next card...");
        } else {
          setStatus(`Scanning... (seeing ${top.label} ${Math.round(top.score * 100)}%)`);
        }
      } else {
        setStatus("Auto-scan: Hold card to guide");
      }
    }
  } catch (e) {
    console.error("Scan error:", e);
  }

  if (isScanning) {
    setTimeout(scanLoop, 800);
  }
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
  autoScanToggle.checked = false;
  video.parentElement.classList.remove('scanning');
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

autoScanToggle.addEventListener('change', async () => {
  if (autoScanToggle.checked) {
    if (!stream) {
      autoScanToggle.checked = false;
      setStatus("Start camera first");
      return;
    }
    await initDetector();
    isScanning = true;
    video.parentElement.classList.add('scanning');
    setStatus("Auto-scan active");
    scanLoop();
  } else {
    isScanning = false;
    video.parentElement.classList.remove('scanning');
    setStatus("Auto-scan disabled");
  }
});

copyBtn.addEventListener("click", copyText);
downloadBtn.addEventListener("click", downloadMarkdown);
saveBtn.addEventListener("click", saveMarkdown);

textEl.addEventListener("input", enableExportButtons);
titleEl.addEventListener("input", buildMarkdown);

buildMarkdown();
enableExportButtons();
