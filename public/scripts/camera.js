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
const resultTitle = document.getElementById("result-title");
const resultMessage = document.getElementById("result-message");
const resultActivitiesButton = document.getElementById("result-activities");
const resultCloseButton = document.getElementById("result-close");
const activitiesModal = document.getElementById("activities-modal");
const activitiesCloseButton = document.getElementById("activities-close");

const captureDurationSeconds = 5;
const saveCaptureEndpoint = "/save-capture";
const defaultCaptureButtonLabel = "Take Picture";
const uploadingCaptureButtonLabel = "Uploading...";

let activeStream = null;
let countdownTimer = null;
let readyForCapture = true;
let customerEmail = "";

startCamera();

captureButton.addEventListener("click", onCaptureClick);
emailEnterButton.addEventListener("click", onEmailConfirm);
emailCancelButton.addEventListener("click", closeEmailModal);
resultActivitiesButton.addEventListener("click", openActivitiesModal);
activitiesCloseButton.addEventListener("click", closeActivitiesModal);
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

function showUploadPopup(title, message, canClose) {
  resultTitle.textContent = title;
  resultMessage.textContent = message;
  resultCloseButton.disabled = !canClose;
  resultModal.hidden = false;
}

function openActivitiesModal() {
  activitiesModal.hidden = false;
}

function closeActivitiesModal() {
  activitiesModal.hidden = true;
}

function getVideoDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  return navigator.mediaDevices
    .enumerateDevices()
    .then((devices) => devices.filter((device) => device.kind === "videoinput"))
    .catch(() => []);
}

function isLikelyUsbCamera(label) {
  const text = String(label || "").toLowerCase();
  return /\busb\b|\bexternal\b|\bhd\s?camera\b|\bwebcam\b|\blogitech\b|\bobs\b/.test(text);
}

function isLikelyIntegratedCamera(label) {
  const text = String(label || "").toLowerCase();
  return /\bintegrated\b|\bface(?:-)?time\b|\binternal\b|\bbuilt[-\s]?in\b|\blaptop\b/.test(text);
}

async function pickUsbVideoDeviceId() {
  const devices = await getVideoDevices();
  if (!devices.length) {
    return "";
  }

  const scored = devices.map((device) => {
    const label = device.label || "";
    const isUsb = isLikelyUsbCamera(label);
    const score = isUsb ? 200 : 0;
    if (!isLikelyIntegratedCamera(label)) {
      return { device, score: score + 10 };
    }
    return { device, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const bestLabelKnown = scored.find((entry) => entry.device.label && entry.score > 0);
  if (bestLabelKnown) {
    return bestLabelKnown.device.deviceId;
  }

  if (devices.length > 1) {
    return scored[1]?.device.deviceId || "";
  }

  return scored[0]?.device.deviceId || "";
}

async function startCamera() {
  try {
    captureButton.disabled = true;
    captureStatus.textContent = "Starting camera...";
    const preferredDeviceId = await pickUsbVideoDeviceId();
    const constraints = preferredDeviceId
      ? {
          video: { deviceId: { exact: preferredDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        }
      : {
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        };

    try {
      activeStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      activeStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    }

    await trySetMinimumZoom(activeStream);
    cameraFeed.srcObject = activeStream;
    await cameraFeed.play();
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

function capturePhoto() {
  if (!cameraFeed.videoWidth || !cameraFeed.videoHeight) {
    captureStatus.textContent = "Camera is not ready. Try again.";
    showGifPreview();
    resetCaptureButtonLabel();
    captureButton.disabled = false;
    readyForCapture = true;
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
  captureStatus.textContent = "";
  resetCaptureButtonLabel();
  showUploadPopup(
    "Updating Photo",
    "We are updating your photo and will email you shortly. While you wait, checkout some fun activities to do in Dominican Republic.",
    false,
  );
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

    showUploadPopup(
      "Photo Sent",
      "The picture will show up in your email in 3 to 5 mins (check your spam if you don't see it).",
      true,
    );
    captureStatus.textContent = "Upload complete";
  } catch (error) {
    console.error(error);
    showUploadPopup("Unable To Send Photo", `Error: ${error.message}`, true);
    captureStatus.textContent = "Upload failed";
  } finally {
    resetCaptureButtonLabel();
    captureButton.disabled = true;
    readyForCapture = false;
  }
}

function closeResultModal() {
  closeActivitiesModal();
  resultModal.hidden = true;
  showGifPreview();
  captureStatus.textContent = "Tap Take Picture to start";
  resetCaptureButtonLabel();
  captureButton.disabled = false;
  readyForCapture = true;
}

window.addEventListener("beforeunload", () => {
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
});
