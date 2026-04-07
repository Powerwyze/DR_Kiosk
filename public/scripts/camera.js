const cameraFeed = document.getElementById("camera-feed");
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
const debugPanel = document.getElementById("debug-panel");
const debugLogEl = document.getElementById("debug-log");
const debugClearButton = document.getElementById("debug-clear");

const captureDurationSeconds = 5;
const saveCaptureEndpoint = "/save-capture";
const debugEnabled = new URLSearchParams(window.location.search).get("debug") === "1";

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
if (debugClearButton) {
  debugClearButton.addEventListener("click", () => {
    if (debugLogEl) {
      debugLogEl.textContent = "";
    }
  });
}
if (debugEnabled && debugPanel) {
  debugPanel.hidden = false;
}
debugEvent("init", {
  debugEnabled,
  userAgent: navigator.userAgent,
});

function sanitizeEmail(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[\[\]\s]+/g, "");
}

function nowIso() {
  return new Date().toISOString();
}

function generateRequestId() {
  return `drk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function debugEvent(label, details) {
  if (!debugEnabled || !debugLogEl) {
    return;
  }

  const safeDetails = details && typeof details === "object" ? details : { value: details };
  const line = `[${nowIso()}] ${label}: ${JSON.stringify(safeDetails)}`;
  debugLogEl.textContent = `${debugLogEl.textContent}${line}\n`;
  debugLogEl.scrollTop = debugLogEl.scrollHeight;
  console.info(`[DR_DEBUG] ${label}`, safeDetails);
}

function isValidEmail(email) {
  return /^[^@]+@[^@]+\.[a-z]{2,}$/i.test(email);
}

async function startCamera() {
  try {
    debugEvent("camera.request.start", { idealWidth: 1280, idealHeight: 960, facingMode: "user" });
    activeStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 960 }
      },
      audio: false,
    });
    await trySetMinimumZoom(activeStream);
    cameraFeed.srcObject = activeStream;
    await cameraFeed.play();
    debugEvent("camera.request.success", {
      width: cameraFeed.videoWidth,
      height: cameraFeed.videoHeight,
      trackCount: activeStream.getTracks().length,
    });
    captureStatus.textContent = "Tap Take Picture to start";
  } catch (error) {
    console.error(error);
    debugEvent("camera.request.error", { message: error?.message || String(error) });
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
      debugEvent("camera.zoom.applied", { zoom: capabilities.zoom.min });
    }
  } catch (error) {
    debugEvent("camera.zoom.skip", { message: error?.message || String(error) });
  }
}

function onCaptureClick() {
  if (!readyForCapture) {
    return;
  }
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
  captureButton.disabled = false;
  readyForCapture = true;
}

function onEmailConfirm() {
  const sanitized = sanitizeEmail(emailInput.value);
  debugEvent("email.confirm", { input: emailInput.value, sanitized });
  if (!isValidEmail(sanitized)) {
    emailError.textContent = "Enter a valid email address.";
    debugEvent("email.invalid", { sanitized });
    return;
  }

  customerEmail = sanitized;
  emailInput.value = sanitized;
  emailModal.hidden = true;
  startCountdown(captureDurationSeconds);
}

function startCountdown(seconds) {
  let remaining = seconds;
  debugEvent("countdown.start", { seconds });
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
    debugEvent("capture.not_ready", {
      videoWidth: cameraFeed.videoWidth,
      videoHeight: cameraFeed.videoHeight,
    });
    captureStatus.textContent = "Camera is not ready. Try again.";
    captureButton.disabled = false;
    readyForCapture = true;
    return;
  }

  const context = canvas.getContext("2d");
  canvas.width = cameraFeed.videoWidth;
  canvas.height = cameraFeed.videoHeight;
  context.drawImage(cameraFeed, 0, 0, canvas.width, canvas.height);

  const imageData = canvas.toDataURL("image/jpeg", 0.92);
  debugEvent("capture.snapshot", {
    width: canvas.width,
    height: canvas.height,
    dataLength: imageData.length,
  });
  sendPhoto(imageData, customerEmail);
}

async function sendPhoto(imageData, email) {
  captureStatus.textContent = "Uploading...";
  const requestId = generateRequestId();
  const sanitizedEmail = sanitizeEmail(email);
  const startTs = performance.now();
  debugEvent("upload.request.start", {
    requestId,
    endpoint: saveCaptureEndpoint,
    email: sanitizedEmail,
    imageDataLength: imageData.length,
  });

  try {
    const response = await fetch(saveCaptureEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": requestId,
        "x-debug": debugEnabled ? "1" : "0",
      },
      body: JSON.stringify({ imageData, email: sanitizedEmail }),
    });

    const payload = await response.json().catch(() => ({}));
    const durationMs = Math.round(performance.now() - startTs);
    debugEvent("upload.request.response", {
      requestId,
      status: response.status,
      ok: response.ok,
      durationMs,
      responseRequestId: response.headers.get("x-request-id") || null,
      upstreamSummary: payload?.debug?.upstreamSummary || null,
    });

    if (!response.ok || payload?.status !== "success") {
      throw new Error(payload?.error || `Upload failed (${response.status})`);
    }

    resultMessage.textContent = `Your photo was sent to ${sanitizeEmail(payload.email || email)}.`;
    resultModal.hidden = false;
    captureStatus.textContent = "Upload complete";
    debugEvent("upload.request.success", {
      requestId,
      email: sanitizeEmail(payload.email || email),
      fileName: payload.fileName || null,
    });
  } catch (error) {
    console.error(error);
    debugEvent("upload.request.error", {
      requestId,
      message: error?.message || String(error),
    });
    resultMessage.textContent = `Error: ${error.message}`;
    resultModal.hidden = false;
    captureStatus.textContent = "Upload failed";
  } finally {
    captureButton.disabled = false;
    readyForCapture = true;
  }
}

function closeResultModal() {
  resultModal.hidden = true;
}

window.addEventListener("beforeunload", () => {
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
});
