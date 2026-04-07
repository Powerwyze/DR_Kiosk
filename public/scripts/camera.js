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
const cameraReadyTimeoutMs = 5000;

let activeStream = null;
let countdownTimer = null;
let readyForCapture = true;
let customerEmail = "";
let cameraIsReady = false;

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

function hasUsableVideoFrame() {
  return Boolean(cameraFeed.videoWidth && cameraFeed.videoHeight && cameraFeed.readyState >= 2);
}

function waitForCameraReady(timeoutMs = cameraReadyTimeoutMs) {
  if (hasUsableVideoFrame()) {
    cameraIsReady = true;
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let timeoutId = null;

    const cleanup = () => {
      cameraFeed.removeEventListener("loadedmetadata", onReady);
      cameraFeed.removeEventListener("canplay", onReady);
      cameraFeed.removeEventListener("playing", onReady);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

    const onReady = () => {
      if (!hasUsableVideoFrame()) {
        return;
      }
      cleanup();
      cameraIsReady = true;
      resolve();
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Camera feed did not become ready in time."));
    }, timeoutMs);

    cameraFeed.addEventListener("loadedmetadata", onReady);
    cameraFeed.addEventListener("canplay", onReady);
    cameraFeed.addEventListener("playing", onReady);
  });
}

async function startCamera() {
  try {
    cameraIsReady = false;
    captureButton.disabled = true;
    captureStatus.textContent = "Starting camera...";
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
    await waitForCameraReady();
    captureStatus.textContent = "Tap Take Picture to start";
    captureButton.disabled = false;
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

async function capturePhoto() {
  if (!cameraIsReady || !hasUsableVideoFrame()) {
    captureStatus.textContent = "Finalizing camera...";
    try {
      await waitForCameraReady(3000);
    } catch (error) {
      console.error(error);
      captureStatus.textContent = "Camera is not ready. Try again.";
      showGifPreview();
      resetCaptureButtonLabel();
      captureButton.disabled = false;
      readyForCapture = true;
      return;
    }
  }

  const context = canvas.getContext("2d");
  canvas.width = cameraFeed.videoWidth;
  canvas.height = cameraFeed.videoHeight;
  context.drawImage(cameraFeed, 0, 0, canvas.width, canvas.height);

  const imageData = canvas.toDataURL("image/jpeg", 0.92);
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

    resultMessage.textContent =
      "The picture will show up in your email in 3 to 5 mins (check your spam if you don't see it).";
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
  if (activeStream) {
    cameraFeed.play().catch(() => {});
  }
}

window.addEventListener("beforeunload", () => {
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
});
