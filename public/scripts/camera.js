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
const langEnButton = document.getElementById("lang-en");
const langEsButton = document.getElementById("lang-es");
const pageTitle = document.getElementById("page-title");
const cultureTitle = document.getElementById("culture-title");
const cultureText = document.getElementById("culture-text");
const emailModalTitle = document.getElementById("email-modal-title");
const emailLabel = document.getElementById("email-label");
const activitiesTitle = document.getElementById("activities-title");

const captureDurationSeconds = 5;
const saveCaptureEndpoint = "/save-capture";
const defaultCaptureButtonLabel = "Take Picture";
const uploadingCaptureButtonLabel = "Uploading...";
const cameraStartupTimeoutMs = 4000;

let activeStream = null;
let countdownTimer = null;
let countdownDelayTimer = null;
let readyForCapture = true;
let customerEmail = "";
let currentLanguage = "en";

const translations = {
  en: {
    pageTitle: "Get Your Caricature Photo",
    cultureTitle: "MuÃ±eca Sin Rostro (Faceless Doll)",
    cultureText:
      "Created in 1981 in Moca by pottery artisan Liliana Mera Lime, the MuÃ±eca Sin Rostro was hand-shaped without molds, and that lack of tools gave it its blank face. Its colorful style quickly made it a beloved Dominican symbol, later evolving with figures carrying fruit, water, and wood as a canvas for identity and storytelling.",
    takePicture: "Take Picture",
    tapToStart: "Tap Take Picture to start",
    startingCamera: "Starting camera...",
    cameraDenied: "Camera access denied. Enable camera permissions.",
    cameraNotReady: "Camera is not ready. Try again.",
    standOnBlueX: "Stand on the blue X",
    emailTitle: "Enter Your Email",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    emailInvalid: "Enter a valid email address.",
    emailStart: "Start",
    cancel: "Cancel",
    uploadWaitingTitle: "Updating Photo",
    uploadWaitingMessage:
      "We are turning you into this beautiful faceless doll. It takes a few minutes, but when it is done generating, we will send it to your email. Thank you so much.",
    uploadDoneTitle: "Photo Sent",
    uploadDoneMessage:
      "The picture will show up in your email in 3 to 5 mins (check your spam if you don't see it).",
    uploadErrorTitle: "Unable To Send Photo",
    activitiesButton: "View Activities",
    done: "Done",
    activitiesTitle: "Fun Activities In Dominican Republic",
    back: "Back",
    uploadComplete: "Upload complete",
    uploadFailed: "Upload failed",
  },
  es: {
    pageTitle: "TÃ³mate Tu Foto Caricatura",
    cultureTitle: "MuÃ±eca Sin Rostro",
    cultureText:
      "Creada en 1981 en Moca por la artesana Liliana Mera Lime, la MuÃ±eca Sin Rostro fue moldeada a mano sin moldes, y esa falta de herramientas le dio su rostro en blanco. Su estilo colorido la convirtiÃ³ en un sÃ­mbolo querido de la cultura dominicana, evolucionando luego con figuras que cargan frutas, agua y madera como forma de identidad y narraciÃ³n.",
    takePicture: "Tomar Foto",
    tapToStart: "Toca Tomar Foto para comenzar",
    startingCamera: "Iniciando cÃ¡mara...",
    cameraDenied: "Acceso a la cÃ¡mara denegado. Habilita los permisos de cÃ¡mara.",
    cameraNotReady: "La cÃ¡mara no estÃ¡ lista. IntÃ©ntalo de nuevo.",
    standOnBlueX: "PÃ¡rate en la X azul",
    emailTitle: "Ingresa Tu Correo",
    emailLabel: "Correo",
    emailPlaceholder: "tu@ejemplo.com",
    emailInvalid: "Ingresa un correo vÃ¡lido.",
    emailStart: "Comenzar",
    cancel: "Cancelar",
    uploadWaitingTitle: "Actualizando Foto",
    uploadWaitingMessage:
      "Te estamos convirtiendo en esta hermosa muÃ±eca sin rostro. Toma unos minutos, pero cuando termine de generarse, la enviaremos a tu correo. Muchas gracias.",
    uploadDoneTitle: "Foto Enviada",
    uploadDoneMessage:
      "La foto aparecerÃ¡ en tu correo en 3 a 5 minutos (revisa tu spam si no la ves).",
    uploadErrorTitle: "No Se Pudo Enviar La Foto",
    activitiesButton: "Ver Actividades",
    done: "Listo",
    activitiesTitle: "Actividades Divertidas En RepÃºblica Dominicana",
    back: "Volver",
    uploadComplete: "Carga completa",
    uploadFailed: "La carga fallÃ³",
  },
};

startCamera();

captureButton.addEventListener("click", onCaptureClick);
emailEnterButton.addEventListener("click", onEmailConfirm);
emailCancelButton.addEventListener("click", closeEmailModal);
resultActivitiesButton.addEventListener("click", openActivitiesModal);
activitiesCloseButton.addEventListener("click", closeActivitiesModal);
resultCloseButton.addEventListener("click", closeResultModal);
langEnButton.addEventListener("click", () => setLanguage("en"));
langEsButton.addEventListener("click", () => setLanguage("es"));
emailInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    onEmailConfirm();
  }
});

applyTranslations();

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
  setCaptureButtonLabel(translations[currentLanguage].takePicture || defaultCaptureButtonLabel);
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

function setLanguage(language) {
  currentLanguage = language === "es" ? "es" : "en";
  applyTranslations();
}

function applyTranslations() {
  const copy = translations[currentLanguage];
  pageTitle.textContent = copy.pageTitle;
  cultureTitle.textContent = copy.cultureTitle;
  cultureText.textContent = copy.cultureText;
  emailModalTitle.textContent = copy.emailTitle;
  emailLabel.textContent = copy.emailLabel;
  emailInput.placeholder = copy.emailPlaceholder;
  emailEnterButton.textContent = copy.emailStart;
  emailCancelButton.textContent = copy.cancel;
  resultActivitiesButton.textContent = copy.activitiesButton;
  resultCloseButton.textContent = copy.done;
  activitiesTitle.textContent = copy.activitiesTitle;
  activitiesCloseButton.textContent = copy.back;
  langEnButton.classList.toggle("is-active", currentLanguage === "en");
  langEsButton.classList.toggle("is-active", currentLanguage === "es");

  if (!resultModal.hidden) {
    if (resultCloseButton.disabled) {
      showUploadPopup(copy.uploadWaitingTitle, copy.uploadWaitingMessage, false);
    }
  } else if (captureStatus.textContent === translations.en.tapToStart || captureStatus.textContent === translations.es.tapToStart) {
    captureStatus.textContent = copy.tapToStart;
  } else if (captureStatus.textContent === translations.en.startingCamera || captureStatus.textContent === translations.es.startingCamera) {
    captureStatus.textContent = copy.startingCamera;
  } else if (captureStatus.textContent === translations.en.standOnBlueX || captureStatus.textContent === translations.es.standOnBlueX) {
    captureStatus.textContent = copy.standOnBlueX;
  }

  resetCaptureButtonLabel();
}

function waitForCameraFrame(timeoutMs = cameraStartupTimeoutMs) {
  if (cameraFeed.videoWidth && cameraFeed.videoHeight) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const intervalId = setInterval(() => {
      if (cameraFeed.videoWidth && cameraFeed.videoHeight) {
        clearInterval(intervalId);
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(intervalId);
        reject(new Error("Timed out waiting for camera frame."));
      }
    }, 100);
  });
}

async function startCamera() {
  try {
    captureButton.disabled = true;
    captureStatus.textContent = translations[currentLanguage].startingCamera;
    activeStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    cameraFeed.srcObject = activeStream;
    cameraFeed.play().catch((error) => {
      console.error(error);
    });
    await waitForCameraFrame();
    captureStatus.textContent = translations[currentLanguage].tapToStart;
    captureButton.disabled = false;
    resetCaptureButtonLabel();
  } catch (error) {
    console.error(error);
    captureStatus.textContent = translations[currentLanguage].cameraDenied;
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
  emailInput.value = "";
  emailModal.hidden = false;
  emailInput.focus({ preventScroll: true });
}

function closeEmailModal() {
  emailModal.hidden = true;
  showGifPreview();
  captureStatus.textContent = translations[currentLanguage].tapToStart;
  resetCaptureButtonLabel();
  captureButton.disabled = false;
  readyForCapture = true;
}

function onEmailConfirm() {
  const sanitized = sanitizeEmail(emailInput.value);
  if (!isValidEmail(sanitized)) {
    emailError.textContent = translations[currentLanguage].emailInvalid;
    return;
  }

  customerEmail = sanitized;
  emailInput.value = sanitized;
  emailModal.hidden = true;
  captureStatus.textContent = translations[currentLanguage].standOnBlueX;
  countdownDelayTimer = setTimeout(() => {
    countdownDelayTimer = null;
    startCountdown(captureDurationSeconds);
  }, 3000);
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
    captureStatus.textContent = translations[currentLanguage].cameraNotReady;
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
    translations[currentLanguage].uploadWaitingTitle,
    translations[currentLanguage].uploadWaitingMessage,
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
      translations[currentLanguage].uploadDoneTitle,
      translations[currentLanguage].uploadDoneMessage,
      true,
    );
    captureStatus.textContent = translations[currentLanguage].uploadComplete;
  } catch (error) {
    console.error(error);
    showUploadPopup(translations[currentLanguage].uploadErrorTitle, `Error: ${error.message}`, true);
    captureStatus.textContent = translations[currentLanguage].uploadFailed;
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
  captureStatus.textContent = translations[currentLanguage].tapToStart;
  resetCaptureButtonLabel();
  captureButton.disabled = false;
  readyForCapture = true;
}

window.addEventListener("beforeunload", () => {
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
  }
  if (countdownDelayTimer) {
    clearTimeout(countdownDelayTimer);
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
});
