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

const processingModal = document.getElementById("processing-modal");
const processingMessage = document.getElementById("processing-message");
const processingCloseButton = document.getElementById("processing-close");
const activitiesOpenButton = document.getElementById("activities-open");
const activitiesModal = document.getElementById("activities-modal");
const activitiesCloseButton = document.getElementById("activities-close");

const resultModal = document.getElementById("result-modal");
const resultMessage = document.getElementById("result-message");
const resultCloseButton = document.getElementById("result-close");

const captureDurationSeconds = 5;
const saveCaptureEndpoint = "/save-capture";
const defaultCaptureButtonLabel = "Take Picture";
const cameraConstraints = {
  video: {
    facingMode: "user",
    width: { ideal: 1280 },
    height: { ideal: 960 },
  },
  audio: false,
};

let activeStream = null;
let countdownTimer = null;
let readyForCapture = true;
let customerEmail = "";
let cameraRefreshPromise = null;
let uploadInFlight = false;

startCamera();

captureButton.addEventListener("click", onCaptureClick);
emailEnterButton.addEventListener("click", onEmailConfirm);
emailCancelButton.addEventListener("click", closeEmailModal);
activitiesOpenButton.addEventListener("click", openActivitiesModal);
activitiesCloseButton.addEventListener("click", closeActivitiesModal);
processingCloseButton.addEventListener("click", onProcessingClose);
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

function stopCameraStream() {
  if (!activeStream) {
    return;
  }
  activeStream.getTracks().forEach((track) => track.stop());
  activeStream = null;
  cameraFeed.srcObject = null;
}

function hasLiveStream(stream) {
  if (!stream || typeof stream.getVideoTracks !== "function") {
    return false;
  }
  return stream.getVideoTracks().some((track) => track.readyState === "live");
}

async function createCameraStream() {
  const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints);
  await trySetMinimumZoom(stream);
  return stream;
}

async function attachCameraStream(newStream) {
  const previousStream = activeStream;
  activeStream = newStream;
  cameraFeed.srcObject = newStream;
  await cameraFeed.play();

  if (previousStream && previousStream !== newStream) {
    previousStream.getTracks().forEach((track) => track.stop());
  }
}

async function startCamera() {
  try {
    const stream = await createCameraStream();
    await attachCameraStream(stream);
    captureStatus.textContent = "Tap Take Picture to start";
    captureButton.disabled = false;
    resetCaptureButtonLabel();
  } catch (error) {
    console.error(error);
    captureStatus.textContent = "Camera access denied. Enable camera permissions.";
    captureButton.disabled = true;
  }
}

async function refreshCameraStream() {
  if (cameraRefreshPromise) {
    return cameraRefreshPromise;
  }

  cameraRefreshPromise = (async () => {
    try {
      const newStream = await createCameraStream();
      await attachCameraStream(newStream);
      captureStatus.textContent = "Tap Take Picture to start";
      captureButton.disabled = false;
      resetCaptureButtonLabel();
    } catch (error) {
      console.error(error);
      if (!hasLiveStream(activeStream)) {
        captureStatus.textContent = "Camera access denied. Enable camera permissions.";
        captureButton.disabled = true;
      } else {
        cameraFeed.srcObject = activeStream;
        await cameraFeed.play().catch(() => {});
      }
    }
  })();

  try {
    await cameraRefreshPromise;
  } finally {
    cameraRefreshPromise = null;
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
  emailInput.value = "";
  emailModal.hidden = false;
  emailInput.focus({ preventScroll: true });
}

function closeEmailModal() {
  emailModal.hidden = true;
  resetCaptureSession();
}

function openProcessingModal() {
  processingMessage.textContent =
    "We are updating your photo and will email you shortly. While you wait, checkout some fun activities to do in Dominican Republic.";
  processingCloseButton.disabled = true;
  processingModal.hidden = false;
}

function closeProcessingModal() {
  processingModal.hidden = true;
  closeActivitiesModal();
}

function onProcessingClose() {
  if (uploadInFlight) {
    return;
  }
  resetCaptureSession();
}

function openActivitiesModal() {
  activitiesModal.hidden = false;
}

function closeActivitiesModal() {
  activitiesModal.hidden = true;
}

function resetCaptureSession() {
  customerEmail = "";
  emailInput.value = "";
  emailError.textContent = "";
  closeProcessingModal();
  closeActivitiesModal();
  showGifPreview();
  captureStatus.textContent = "Tap Take Picture to start";
  resetCaptureButtonLabel();
  readyForCapture = true;
  captureButton.disabled = false;
  refreshCameraStream().catch((error) => console.error(error));
}

function onEmailConfirm() {
  const sanitized = sanitizeEmail(emailInput.value);
  if (!isValidEmail(sanitized)) {
    emailError.textContent = "Enter a valid email address.";
    return;
  }

  customerEmail = sanitized;
  emailInput.value = "";
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
    resetCaptureSession();
    return;
  }

  const context = canvas.getContext("2d");
  canvas.width = cameraFeed.videoWidth;
  canvas.height = cameraFeed.videoHeight;
  context.drawImage(cameraFeed, 0, 0, canvas.width, canvas.height);

  const imageData = canvas.toDataURL("image/jpeg", 0.92);
  sendPhoto(imageData, customerEmail);
}

async function sendPhoto(imageData, email) {
  openProcessingModal();
  captureStatus.textContent = "";
  resetCaptureButtonLabel();
  const requestId = generateRequestId();
  const sanitizedEmail = sanitizeEmail(email);
  uploadInFlight = true;

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

    processingMessage.textContent =
      "Your photo update is complete. The picture will show up in your email in 3 to 5 mins (check your spam if you don't see it).";
    processingCloseButton.disabled = false;
    captureStatus.textContent = "Upload complete";
  } catch (error) {
    console.error(error);
    processingMessage.textContent = `Error: ${error.message}`;
    processingCloseButton.disabled = false;
    captureStatus.textContent = "Upload failed";
  } finally {
    uploadInFlight = false;
    captureButton.disabled = true;
    readyForCapture = false;
  }
}

function closeResultModal() {
  resultModal.hidden = true;
  resetCaptureSession();
}

window.addEventListener("beforeunload", () => {
  stopCameraStream();
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
});
