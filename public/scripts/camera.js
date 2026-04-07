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

const captureDurationSeconds = 5;
const saveCaptureEndpoint = "/save-capture";

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

function isValidEmail(email) {
  return /^[^@]+@[^@]+\.[a-z]{2,}$/i.test(email);
}

async function startCamera() {
  try {
    activeStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1080 },
        height: { ideal: 1920 }
      },
      audio: false,
    });
    cameraFeed.srcObject = activeStream;
    await cameraFeed.play();
    captureStatus.textContent = "Tap Take Picture to start";
  } catch (error) {
    console.error(error);
    captureStatus.textContent = "Camera access denied. Enable camera permissions.";
    captureButton.disabled = true;
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
  captureStatus.textContent = "Uploading...";

  try {
    const response = await fetch(saveCaptureEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData, email: sanitizeEmail(email) }),
    });

    const payload = await response.json();
    if (!response.ok || payload?.status !== "success") {
      throw new Error(payload?.error || `Upload failed (${response.status})`);
    }

    resultMessage.textContent = `Your photo was sent to ${sanitizeEmail(payload.email || email)}.`;
    resultModal.hidden = false;
    captureStatus.textContent = "Upload complete";
  } catch (error) {
    console.error(error);
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
