const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const preview = document.getElementById("preview");
const statusEl = document.getElementById("status");
const capturesList = document.getElementById("capturesList");
const imageQueueList = document.getElementById("imageQueueList");

const startBtn = document.getElementById("startBtn");
const captureBtn = document.getElementById("captureBtn");
const stopBtn = document.getElementById("stopBtn");
const processAllBtn = document.getElementById("processAllBtn");
const autoScanToggle = document.getElementById("autoScanToggle");
const uploadAllBtn = document.getElementById("uploadAllBtn");

const cardTypeEl = document.getElementById("cardType");
const cardTopicEl = document.getElementById("cardTopic");
const qualityEl = document.getElementById("quality");

let stream;
let isScanning = false;
let lastDetectTime = 0;
const DETECT_INTERVAL = 1500;

let pendingImages = []; // Array of { filename, url }
let pendingCards = [];
let isProcessingQueue = false;

function setStatus(text) {
  statusEl.textContent = text;
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function loadQueueOnInit() {
  try {
    const res = await fetch('/api/queue');
    const json = await res.json();
    if (json.queue) {
      pendingImages = json.queue;
      if (pendingImages.length > 0) {
        setStatus(`Loaded ${pendingImages.length} items from queue.`);
      }
      renderPendingImages();
    }
  } catch (e) {
    console.error("Failed to load initial queue", e);
  }

  try {
    const processedRes = await fetch('/api/processed');
    const processedJson = await processedRes.json();
    if (processedJson.cards) {
      pendingCards = processedJson.cards;
      renderPendingCards();
    }
  } catch (e) {
    console.error("Failed to load processed cards", e);
  }
}

function renderPendingImages() {
  imageQueueList.innerHTML = '';
  pendingImages.forEach((img, index) => {
    const imgWrapper = document.createElement('div');
    imgWrapper.style.position = 'relative';
    imgWrapper.style.width = '80px';
    imgWrapper.style.height = '60px';

    imgWrapper.innerHTML = `
      <img src="${img.url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px; border: 1px solid var(--border);" />
      <button onclick="window.removeImage(${index}, '${img.filename}')" style="position: absolute; top: -5px; right: -5px; background: var(--error); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 12px; cursor: pointer; padding: 0;">&times;</button>
    `;
    imageQueueList.appendChild(imgWrapper);
  });
  processAllBtn.textContent = `Process Queue (${pendingImages.length})`;
  processAllBtn.disabled = pendingImages.length === 0;
}

window.removeImage = async function (index, filename) {
  try {
    await fetch(`/api/queue/${filename}`, { method: 'DELETE' });
    pendingImages.splice(index, 1);
    renderPendingImages();
  } catch (e) {
    setStatus("Failed to delete queued image");
  }
};

function prependCardToDOM(card) {
  if (!card._clientId) {
    card._clientId = card.id || Math.random().toString(36).substring(2, 15);
  }

  const itemEl = document.createElement('div');
  itemEl.id = `card-elem-${card._clientId}`;
  itemEl.className = 'capture-item batch-item';
  itemEl.style.display = 'block';
  itemEl.style.background = 'var(--surface)';
  itemEl.style.padding = '1rem';
  itemEl.style.border = '1px solid var(--border)';
  itemEl.style.borderRadius = 'var(--radius)';
  itemEl.style.marginBottom = '1rem';

  const imgUrl = card.url || (card.blob ? URL.createObjectURL(card.blob) : '');
  const imgHtml = imgUrl
    ? `<img src="${imgUrl}" style="width: 120px; height: auto; object-fit: cover; border-radius: 4px;" />`
    : `<div style="width: 120px; display:flex; align-items:center; justify-content:center; background:var(--bg); border-radius:4px; font-size:12px; color:var(--text-muted); text-align:center;">No Image<br/>(Cached)</div>`;

  itemEl.innerHTML = `
    <div style="display: flex; gap: 1rem; margin-bottom: 0.5rem; flex-wrap: wrap;">
      ${imgHtml}
      <div style="flex: 1; min-width: 200px;">
        <input type="text" value="${escapeHtml(card.title)}" oninput="window.updateCardLocal('${card._clientId}', 'title', this.value)" onchange="window.updateCardBackend('${card._clientId}')" style="width: 100%; font-weight: bold; margin-bottom: 0.5rem;" />
      </div>
    </div>
    <textarea rows="6" oninput="window.updateCardLocal('${card._clientId}', 'text', this.value)" onchange="window.updateCardBackend('${card._clientId}')" style="width: 100%; resize: vertical; margin-bottom: 0.5rem;">${escapeHtml(card.text)}</textarea>
    <div style="text-align: right;">
       <button onclick="window.removeCard('${card._clientId}', '${card.id || ''}')" style="background: var(--error); color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer;">Discard Draft</button>
    </div>
  `;

  // Prevent scroll jumping when a new element drops in at the very top.
  const oldScrollY = window.scrollY;
  const oldScrollHeight = document.documentElement.scrollHeight;

  capturesList.prepend(itemEl);

  // If the user has scrolled past the top bounds (they are looking at older cards or actively typing),
  // we push their scroll wheel down by the exact pixel height of the newly inserted element.
  if (oldScrollY > 100) {
    const heightDifference = document.documentElement.scrollHeight - oldScrollHeight;
    window.scrollBy(0, heightDifference);
  }

  uploadAllBtn.textContent = `Save All to Obsidian (${pendingCards.length})`;
  uploadAllBtn.disabled = pendingCards.length === 0;
}

function renderPendingCards() {
  capturesList.innerHTML = '';
  pendingCards.forEach((card) => {
    prependCardToDOM(card);
  });
}

window.updateCardLocal = function (clientId, field, value) {
  const card = pendingCards.find(c => c._clientId === clientId);
  if (card) card[field] = value;
};

window.updateCardBackend = async function (clientId) {
  const card = pendingCards.find(c => c._clientId === clientId);
  if (card && card.id) {
    try {
      await fetch(`/api/processed/${card.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: card.title, text: card.text })
      });
    } catch (e) {
      console.error("Failed to sync update to server", e);
    }
  }
};

window.removeCard = async function (clientId, id) {
  if (id) {
    try {
      await fetch(`/api/processed/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error("Failed to delete processed file", e);
    }
  }
  pendingCards = pendingCards.filter(c => c._clientId !== clientId);
  const el = document.getElementById(`card-elem-${clientId}`);
  if (el) el.remove();

  uploadAllBtn.textContent = `Save All to Obsidian (${pendingCards.length})`;
  uploadAllBtn.disabled = pendingCards.length === 0;
};

function generateMarkdown(cardTitle, cardText, type, topic) {
  const tzOffset = new Date().getTimezoneOffset() * 60000;
  const localIso = new Date(Date.now() - tzOffset).toISOString().slice(0, 19);

  let relatedCardsYaml = "Related Cards: []";
  if (topic && topic.trim().length > 0) {
    relatedCardsYaml = `Related Cards:\n  - "[[${topic.trim()}]]"`;
  }

  return `---
base: "[[Cards.base]]"
Status: Not started
Last edited time: ${localIso}
Type: ${type}
${relatedCardsYaml}
---

${cardText}`;
}

uploadAllBtn.addEventListener('click', async () => {
  const type = cardTypeEl.value;
  const topic = cardTopicEl.value;
  setStatus(`Uploading ${pendingCards.length} cards...`);
  uploadAllBtn.disabled = true;

  let successCount = 0;

  try {
    for (const card of pendingCards) {
      const md = generateMarkdown(card.title, card.text, type, topic);
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: md, title: card.title })
      });
      if (res.ok) {
        successCount++;
        // Delete processed cache file so it doesn't reappear
        if (card.id) {
          await fetch(`/api/processed/${card.id}`, { method: 'DELETE' });
        }
      }
    }
    pendingCards = [];
    renderPendingCards();
    setStatus(`Successfully uploaded ${successCount} cards!`);
  } catch (e) {
    setStatus("Error uploading: " + e.message);
    uploadAllBtn.disabled = pendingCards.length === 0;
  }
});

async function startCamera() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "environment",
      width: { ideal: 1280 },
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

async function enqueueImageBlob(blob) {
  const form = new FormData();
  form.append("image", blob, "capture.jpg");
  const res = await fetch("/api/queue", {
    method: "POST",
    body: form
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to enqueue");
  pendingImages.push({
    filename: json.filename,
    url: json.url
  });
  renderPendingImages();
}

async function scanLoop() {
  if (!isScanning || !stream) return;

  const now = Date.now();
  if (now - lastDetectTime > DETECT_INTERVAL) {
    lastDetectTime = now;
    setStatus("CV: Searching for notecards...");

    try {
      const blob = await captureFrame(0.3);
      const form = new FormData();
      form.append("image", blob, "detect.jpg");

      const res = await fetch("/api/detect", {
        method: "POST",
        body: form
      });
      const { detected } = await res.json();

      if (detected) {
        setStatus("CV: Card detected! Capturing...");
        await performAutoCapture();
      }
    } catch (e) {
      console.error("Detection error:", e);
    }
  }

  if (isScanning) {
    requestAnimationFrame(scanLoop);
  }
}

async function performAutoCapture() {
  isScanning = false;
  try {
    const blob = await captureFrame(0.85);
    preview.src = URL.createObjectURL(blob);
    preview.classList.remove("hidden");

    await enqueueImageBlob(blob);
    setStatus(`Captured! (${pendingImages.length} in queue)`);

    // Small delay before capturing again so you can swap cards
    setTimeout(() => {
      if (autoScanToggle.checked) {
        isScanning = true;
        scanLoop();
      }
    }, 1500);

  } catch (e) {
    setStatus("Capture Error: " + e.message);
    isScanning = true;
    scanLoop();
  }
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
  if (!isProcessingQueue) {
    setStatus("Stopped");
  }
});

captureBtn.addEventListener("click", async () => {
  try {
    const blob = await captureFrame();
    preview.src = URL.createObjectURL(blob);
    preview.classList.remove("hidden");

    await enqueueImageBlob(blob);
    setStatus(`Manual capture! (${pendingImages.length} in queue)`);
  } catch (e) {
    setStatus("Capture Error: " + e.message);
  }
});

processAllBtn.addEventListener("click", async () => {
  if (pendingImages.length === 0) return;

  processAllBtn.disabled = true;
  autoScanToggle.checked = false;
  isScanning = false;
  isProcessingQueue = true;

  setStatus(`Processing ${pendingImages.length} images...`);

  // Move array contents to local context
  const imagesToProcess = [...pendingImages];
  pendingImages = [];
  renderPendingImages();

  for (let i = 0; i < imagesToProcess.length; i++) {
    setStatus(`Processing image ${i + 1} of ${imagesToProcess.length}...`);
    try {
      const res = await fetch(`/api/queue/${imagesToProcess[i].filename}/process`, { method: "POST" });
      const json = await res.json();

      if (!res.ok) {
        if (res.status === 429 || (json.error && json.error.includes('429'))) {
          throw new Error("Rate Limit Exceeded (429)");
        }
        throw new Error(json.error);
      }

      const newCard = {
        id: json.id,
        url: json.url || imagesToProcess[i].url,
        title: json.title || "Untitled Idea",
        text: json.text || ""
      };
      pendingCards.push(newCard);
      prependCardToDOM(newCard);

      // Enforce a 4.5 second delay between requests to stay under the 15 RPM free tier limit
      if (i < imagesToProcess.length - 1) {
        setStatus(`Cooling down to prevent rate limits (${imagesToProcess.length - i - 1} remaining)...`);
        await new Promise(r => setTimeout(r, 4500));
      }

    } catch (e) {
      console.error("OCR failed for an image:", e);
      // Put failed image back into the queue
      pendingImages.push(imagesToProcess[i]);
      renderPendingImages();

      if (e.message.includes("429")) {
        setStatus(`Hit Google Rate Limit! Pausing for 15 seconds...`);
        await new Promise(r => setTimeout(r, 15000));
      } else {
        setStatus(`Failed to process image ${i + 1}. Returned to queue.`);
      }
    }
  }

  isProcessingQueue = false;
  if (pendingImages.length === 0) {
    if (!stream) {
      setStatus(`Finished processing all images!`);
    } else {
      setStatus(`Finished processing all images! Select capture to keep going.`);
    }
  } else {
    setStatus(`Finished processing, but some images failed and were returned to queue.`);
  }
});

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

// Init
loadQueueOnInit();

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


