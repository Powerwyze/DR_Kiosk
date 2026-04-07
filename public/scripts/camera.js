const cameraFeed = document.getElementById("camera-feed");
const viewfinderGif = document.getElementById("viewfinder-gif");
const countdownEl = document.getElementById("camera-countdown");
const captureButton = document.getElementById("capture-button");
const captureStatus = document.getElementById("capture-status");
const canvas = document.getElementById("camera-canvas");

const emailModal = document.getElementById("email-modal");
const emailInput = document.getElementById("email-input");
const emailError = document.getElementById("email-error");
const emailEnterButton = document.getElementById("email-enter");
const emailCancelButton = document.getElementById("email-cancel");

const resultModal = document.getElementById("result-modal");
const resultMessage = document.getElementById("result-message");
const resultCloseButton = document.getElementById("result-close");

const captureDurationSeconds = 5;
const saveCaptureEndpoint = "/save-capture";
const defaultCaptureButtonLabel = "Take Picture";
const uploadingCaptureButtonLabel = "Uploading...";
const uploadTargetBytes = 220 * 1024;
const uploadHardMaxBytes = 320 * 1024;
const uploadMaxEdgePx = 900;
const uploadMinScale = 0.3;

let activeStream = null;
let countdownTimer = null;
let readyForCapture = true;
let customerEmail = "";

startCamera();

captureButton.addEventListener("click", onCaptureClick);
emailEnterButton.addEventListener("click", onEmailConfirm);
emailCancelButton.addEventListener("click", closeEmailModal);
resultCloseButton.addEventListener("click", closeResultModal);
emailInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    onEmailConfirm();
  }
});

function sanitizeEmail(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[\[\]\s]+/g, "");
}

function generateRequestId() {
  return `drk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isValidEmail(email) {
  return /^[^@]+@[^@]+\.[a-z]{2,}$/i.test(email);
}

function setCaptureButtonLabel(label) {
  captureButton.textContent = label;
}

function resetCaptureButtonLabel() {
  setCaptureButtonLabel(defaultCaptureButtonLabel);
}

function buildPopupMessage(payload) {
  const styleMessage = String(payload?.styleMessage || "")
    .replace(/\s+/g, " ")
    .trim();
  const deliveryMessage = "Your image will be sent to your email soon in a few minutes.";

  if (styleMessage) {
    return `${styleMessage} ${deliveryMessage}`;
  }

  return `Your look is stylish and full of personality. For fun in the Dominican Republic, visit the Colonial Zone for music, food, and history. ${deliveryMessage}`;
}

function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== "string") {
    return 0;
  }
  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  return Math.floor((base64.length * 3) / 4);
}

function captureOptimizedImageData(videoEl) {
  const context = canvas.getContext("2d");
  if (!context) {
    return "";
  }

  const sourceWidth = videoEl.videoWidth;
  const sourceHeight = videoEl.videoHeight;
  const maxEdge = Math.max(sourceWidth, sourceHeight);

  let scale = Math.min(1, uploadMaxEdgePx / maxEdge);
  scale = Math.max(scale, uploadMinScale);
  let quality = 0.86;

  let bestDataUrl = "";
  let bestBytes = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    canvas.width = width;
    canvas.height = height;
    context.drawImage(videoEl, 0, 0, width, height);

    const candidateData = canvas.toDataURL("image/jpeg", quality);
    const candidateBytes = estimateDataUrlBytes(candidateData);

    if (candidateBytes < bestBytes) {
      bestDataUrl = candidateData;
      bestBytes = candidateBytes;
    }

    if (candidateBytes <= uploadTargetBytes) {
      return candidateData;
    }

    if (candidateBytes > uploadHardMaxBytes && quality > 0.48) {
      quality = Math.max(0.48, quality - 0.12);
      continue;
    }

    if (scale > uploadMinScale) {
      scale = Math.max(uploadMinScale, scale * 0.85);
      quality = Math.min(0.82, quality + 0.04);
      continue;
    }

    if (quality > 0.42) {
      quality = Math.max(0.42, quality - 0.08);
    }
  }

  return bestDataUrl;
}

function showGifPreview() {
  if (viewfinderGif) {
    viewfinderGif.classList.remove("is-hidden");
  }
}

function hideGifPreview() {
  if (viewfinderGif) {
    viewfinderGif.classList.add("is-hidden");
  }
}

async function startCamera() {
  try {
    activeStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
      audio: false,
    });
    await trySetMinimumZoom(activeStream);
    cameraFeed.srcObject = activeStream;
    await cameraFeed.play();
    captureStatus.textContent = "Tap Take Picture to start";
    resetCaptureButtonLabel();
  } catch (error) {
    console.error(error);
    captureStatus.textContent = "Camera access denied. Enable camera permissions.";
    captureButton.disabled = true;
  }
}

async function trySetMinimumZoom(stream) {
  try {
    const [track] = stream.getVideoTracks();
    if (!track || typeof track.getCapabilities !== "function") {
      return;
    }

    const capabilities = track.getCapabilities();
    if (capabilities && typeof capabilities.zoom === "object" && typeof capabilities.zoom.min === "number") {
      await track.applyConstraints({ advanced: [{ zoom: capabilities.zoom.min }] });
    }
  } catch (error) {
    console.error(error);
  }
}

function onCaptureClick() {
  if (!readyForCapture) {
    return;
  }
  hideGifPreview();
  readyForCapture = false;
  captureButton.disabled = true;
  openEmailModal();
}

function openEmailModal() {
  emailError.textContent = "";
  emailInput.value = customerEmail;
  emailModal.hidden = false;
  emailInput.focus({ preventScroll: true });
}

function closeEmailModal() {
  emailModal.hidden = true;
  showGifPreview();
  captureStatus.textContent = "Tap Take Picture to start";
  resetCaptureButtonLabel();
  captureButton.disabled = false;
  readyForCapture = true;
}

function onEmailConfirm() {
  const sanitized = sanitizeEmail(emailInput.value);
  if (!isValidEmail(sanitized)) {
    emailError.textContent = "Enter a valid email address.";
    return;
  }

  customerEmail = sanitized;
  emailInput.value = sanitized;
  emailModal.hidden = true;
  startCountdown(captureDurationSeconds);
}

function startCountdown(seconds) {
  let remaining = seconds;
  countdownEl.style.display = "flex";
  countdownEl.textContent = String(remaining);

  countdownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      countdownEl.textContent = String(remaining);
      return;
    }

    clearInterval(countdownTimer);
    countdownEl.style.display = "none";
    capturePhoto();
  }, 1000);
}

function capturePhoto() {
  if (!cameraFeed.videoWidth || !cameraFeed.videoHeight) {
    captureStatus.textContent = "Camera is not ready. Try again.";
    showGifPreview();
    resetCaptureButtonLabel();
    captureButton.disabled = false;
    readyForCapture = true;
    return;
  }

  const imageData = captureOptimizedImageData(cameraFeed);
  if (!imageData) {
    captureStatus.textContent = "Could not prepare photo. Please try again.";
    showGifPreview();
    resetCaptureButtonLabel();
    captureButton.disabled = false;
    readyForCapture = true;
    return;
  }

  sendPhoto(imageData, customerEmail);
}

async function sendPhoto(imageData, email) {
  captureStatus.textContent = "Uploading...";
  setCaptureButtonLabel(uploadingCaptureButtonLabel);
  const requestId = generateRequestId();
  const sanitizedEmail = sanitizeEmail(email);

  try {
    const response = await fetch(saveCaptureEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify({ imageData, email: sanitizedEmail }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload?.status !== "success") {
      throw new Error(payload?.error || `Upload failed (${response.status})`);
    }

    resultMessage.textContent = buildPopupMessage(payload);
    resultModal.hidden = false;
    captureStatus.textContent = "Upload complete";
  } catch (error) {
    console.error(error);
    resultMessage.textContent = `Error: ${error.message}`;
    resultModal.hidden = false;
    captureStatus.textContent = "Upload failed";
  } finally {
    resetCaptureButtonLabel();
    captureButton.disabled = false;
    readyForCapture = true;
  }
}

function closeResultModal() {
  resultModal.hidden = true;
  showGifPreview();
  captureStatus.textContent = "Tap Take Picture to start";
  resetCaptureButtonLabel();
}

window.addEventListener("beforeunload", () => {
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
});
