const video = document.getElementById("camera-feed");
const countdown = document.getElementById("camera-countdown");
const button = document.getElementById("capture-button");
const statusText = document.getElementById("capture-status");
const canvas = document.getElementById("camera-canvas");
const emailModal = document.getElementById("email-modal");
const emailInput = document.getElementById("email-input");
const emailError = document.getElementById("email-error");
const emailEnterButton = document.getElementById("email-enter");
const emailCancelButton = document.getElementById("email-cancel");
const caricatureModal = document.getElementById("caricature-modal");
const caricatureMessage = document.getElementById("caricature-message");
const caricatureTitle = document.getElementById("caricature-title");
const caricatureImage = document.getElementById("caricature-image");
const caricatureLoader = document.getElementById("caricature-loader");
const caricatureCloseButton = document.getElementById("caricature-close");

const captureDuration = 5;
const saveCaptureEndpoint = "/save-capture";
const defaultCaricatureImageSrc = "assets/reference.jpg";

let activeStream = null;
let countdownId = null;
let canCapture = true;
let customerEmail = "";

startCamera();

button.addEventListener("click", startCaptureFlow);
emailEnterButton.addEventListener("click", onEmailSubmit);
emailCancelButton.addEventListener("click", closeEmailPrompt);
caricatureCloseButton.addEventListener("click", closeCaricatureModal);
emailInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    onEmailSubmit();
  }
});

async function startCamera() {
  try {
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

    video.srcObject = activeStream;
    await video.play();
    statusText.textContent = "Press Take a picture to start";
  } catch (error) {
    console.error(error);
    statusText.textContent =
      "Camera access was denied. Allow camera access in your browser settings.";
    button.disabled = true;
  }
}

function showEmailPrompt() {
  emailError.textContent = "";
  emailInput.value = customerEmail || "";
  emailInput.focus({ preventScroll: true });
  emailModal.hidden = false;
}

function closeEmailPrompt() {
  emailModal.hidden = true;
  canCapture = true;
  button.disabled = false;
  emailError.textContent = "";
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

function isValidEmail(value) {
  const email = value.trim();
  if (!email) {
    return false;
  }
  return /.+@.+\.[a-zA-Z]{2,}/.test(email);
}

function onEmailSubmit() {
  const value = emailInput.value.trim();
  if (!isValidEmail(value)) {
    emailError.textContent = "Enter a valid email address.";
    return;
  }

  customerEmail = value;
  emailModal.hidden = true;
  statusText.textContent = "Get ready...";
  startCountdown(captureDuration);
}

function startCaptureFlow() {
  if (!canCapture) {
    return;
  }

  canCapture = false;
  button.disabled = true;
  showEmailPrompt();
}

function showCaricatureModal(message) {
  caricatureMessage.textContent = message || "WE ARE EMAILING YOU NOW";
  caricatureTitle.textContent = "Processing your image";
  caricatureImage.src = defaultCaricatureImageSrc;
  caricatureImage.hidden = true;
  caricatureLoader.hidden = false;
  caricatureModal.hidden = false;
}

function closeCaricatureModal() {
  caricatureModal.hidden = true;
  caricatureLoader.hidden = true;
}

function setStatusBusy() {
  button.disabled = true;
  canCapture = false;
}

function setStatusReady() {
  button.disabled = false;
  canCapture = true;
}

function startCountdown(secondsLeft) {
  let remaining = secondsLeft;
  countdown.style.display = "flex";

  // First 5 seconds show "STEP BACK"
  if (remaining > 5) {
    countdown.textContent = "STEP BACK";
  } else {
    countdown.textContent = String(remaining);
  }

  countdownId = setInterval(() => {
    remaining -= 1;
    if (remaining > 5) {
      countdown.textContent = "STEP BACK";
      return;
    } else if (remaining > 0) {
      countdown.textContent = String(remaining);
      return;
    }

    clearInterval(countdownId);
    countdown.style.display = "none";
    capturePhoto();
  }, 1000);
}

function capturePhoto() {
  if (!video.videoWidth || !video.videoHeight) {
    statusText.textContent = "Waiting for camera, try again.";
    setStatusReady();
    return;
  }

  const context = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  sendPhotoToServer(dataUrl, customerEmail);
}

async function sendPhotoToServer(dataUrl, email) {
  statusText.textContent = "Sending photo...";
  setStatusBusy();
  showCaricatureModal("Sending your photo...");
  try {
    const response = await fetch(saveCaptureEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageData: dataUrl, email }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.status !== "success") {
      throw new Error(payload?.error || "Failed to send photo");
    }

    // Show success message
    caricatureLoader.hidden = true;
    caricatureTitle.textContent = "Photo sent successfully!";
    caricatureMessage.textContent = "Your photo has been sent to " + email;
    caricatureImage.src = defaultCaricatureImageSrc;
    caricatureImage.hidden = false;
  } catch (error) {
    console.error(error);
    caricatureLoader.hidden = true;
    caricatureTitle.textContent = "Unable to send photo";
    caricatureMessage.textContent = `Error: ${error.message}`;
    caricatureImage.hidden = true;
  } finally {
    setTimeout(() => {
      statusText.textContent = "";
    }, 1200);
    setStatusReady();
  }
}

window.addEventListener("beforeunload", () => {
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
  }
  if (countdownId) {
    clearInterval(countdownId);
  }
});
