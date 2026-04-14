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
const resultCloseButton = document.getElementById("result-close");
const activitiesModal = document.getElementById("activities-modal");
const activitiesCloseButton = document.getElementById("activities-close");
const langEnButton = document.getElementById("lang-en");
const langEsButton = document.getElementById("lang-es");
const langZhButton = document.getElementById("lang-zh");
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
    cultureTitle: "Mu\u00f1eca Sin Rostro (Faceless Doll)",
    cultureText:
      "Created in 1981 in Moca by pottery artisan Liliana Mera Lime, the Mu\u00f1eca Sin Rostro was hand-shaped without molds, and that lack of tools gave it its blank face. Its colorful style quickly made it a beloved Dominican symbol, later evolving with figures carrying fruit, water, and wood as a canvas for identity and storytelling.",
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
      "Your picture has been taken, and it will show up in your email soon.",
    uploadDoneTitle: "Photo Sent",
    uploadDoneMessage:
      "The picture will show up in your email in 3 to 5 mins (check your spam if you don't see it).",
    uploadErrorTitle: "Unable To Send Photo",
    done: "Done",
    activitiesTitle: "Fun Activities In Dominican Republic",
    back: "Back",
    uploadComplete: "Upload complete",
    uploadFailed: "Upload failed",
  },
  es: {
    pageTitle: "T\u00f3mate Tu Foto Caricatura",
    cultureTitle: "Mu\u00f1eca Sin Rostro",
    cultureText:
      "Creada en 1981 en Moca por la artesana Liliana Mera Lime, la Mu\u00f1eca Sin Rostro fue moldeada a mano sin moldes, y esa falta de herramientas le dio su rostro en blanco. Su estilo colorido la convirti\u00f3 en un s\u00edmbolo querido de la cultura dominicana, evolucionando luego con figuras que cargan frutas, agua y madera como forma de identidad y narraci\u00f3n.",
    takePicture: "Tomar Foto",
    tapToStart: "Toca Tomar Foto para comenzar",
    startingCamera: "Iniciando c\u00e1mara...",
    cameraDenied: "Acceso a la c\u00e1mara denegado. Habilita los permisos de c\u00e1mara.",
    cameraNotReady: "La c\u00e1mara no est\u00e1 lista. Int\u00e9ntalo de nuevo.",
    standOnBlueX: "P\u00e1rate en la X azul",
    emailTitle: "Ingresa Tu Correo",
    emailLabel: "Correo",
    emailPlaceholder: "tu@ejemplo.com",
    emailInvalid: "Ingresa un correo v\u00e1lido.",
    emailStart: "Comenzar",
    cancel: "Cancelar",
    uploadWaitingTitle: "Actualizando Foto",
    uploadWaitingMessage:
      "Tu foto ya fue tomada y aparecer\u00e1 en tu correo pronto.",
    uploadDoneTitle: "Foto Enviada",
    uploadDoneMessage:
      "La foto aparecer\u00e1 en tu correo en 3 a 5 minutos (revisa tu spam si no la ves).",
    uploadErrorTitle: "No Se Pudo Enviar La Foto",
    done: "Listo",
    activitiesTitle: "Actividades Divertidas En Rep\u00fablica Dominicana",
    back: "Volver",
    uploadComplete: "Carga completa",
    uploadFailed: "La carga fall\u00f3",
  },
  zh: {
    pageTitle: "\u83b7\u53d6\u60a8\u7684\u6f2b\u753b\u7167\u7247",
    cultureTitle: "\u65e0\u8138\u73a9\u5076",
    cultureText:
      "\u65e0\u8138\u73a9\u5076\u4e8e1981\u5e74\u5728\u591a\u7c73\u5c3c\u52a0\u5171\u548c\u56fd\u5317\u90e8\u7684\u83ab\u5361\u8bde\u751f\uff0c\u7531\u9676\u827a\u5de5\u5320Liliana Mera Lime\u624b\u5de5\u5851\u9020\u3002\u7531\u4e8e\u5f53\u65f6\u7f3a\u5c11\u6a21\u5177\u4e0e\u5de5\u5177\uff0c\u5979\u521b\u4f5c\u51fa\u4e86\u8fd9\u4e2a\u6807\u5fd7\u6027\u7684\u7a7a\u767d\u9762\u5b54\uff0c\u540e\u6765\u5b83\u4e5f\u6210\u4e3a\u591a\u7c73\u5c3c\u52a0\u6587\u5316\u4e2d\u6700\u53d7\u559c\u7231\u7684\u8c61\u5f81\u4e4b\u4e00\u3002",
    takePicture: "\u62cd\u7167",
    tapToStart: "\u70b9\u51fb\u201c\u62cd\u7167\u201d\u5f00\u59cb",
    startingCamera: "\u6b63\u5728\u542f\u52a8\u6444\u50cf\u5934...",
    cameraDenied: "\u6444\u50cf\u5934\u8bbf\u95ee\u88ab\u62d2\u7edd\u3002\u8bf7\u5141\u8bb8\u6444\u50cf\u5934\u6743\u9650\u3002",
    cameraNotReady: "\u6444\u50cf\u5934\u5c1a\u672a\u51c6\u5907\u597d\uff0c\u8bf7\u518d\u8bd5\u4e00\u6b21\u3002",
    standOnBlueX: "\u8bf7\u7ad9\u5728\u84dd\u8272X\u4e0a",
    emailTitle: "\u8f93\u5165\u60a8\u7684\u90ae\u7bb1",
    emailLabel: "\u90ae\u7bb1",
    emailPlaceholder: "you@example.com",
    emailInvalid: "\u8bf7\u8f93\u5165\u6709\u6548\u7684\u90ae\u7bb1\u5730\u5740\u3002",
    emailStart: "\u5f00\u59cb",
    cancel: "\u53d6\u6d88",
    uploadWaitingTitle: "\u6b63\u5728\u66f4\u65b0\u7167\u7247",
    uploadWaitingMessage:
      "\u60a8\u7684\u7167\u7247\u5df2\u62cd\u6444\uff0c\u5f88\u5feb\u5c31\u4f1a\u51fa\u73b0\u5728\u60a8\u7684\u90ae\u7bb1\u4e2d\u3002",
    uploadDoneTitle: "\u7167\u7247\u5df2\u53d1\u9001",
    uploadDoneMessage:
      "\u7167\u7247\u5c06\u57283\u52305\u5206\u949f\u5185\u53d1\u9001\u5230\u60a8\u7684\u90ae\u7bb1\uff08\u5982\u672a\u770b\u5230\uff0c\u8bf7\u68c0\u67e5\u5783\u573e\u90ae\u4ef6\uff09\u3002",
    uploadErrorTitle: "\u65e0\u6cd5\u53d1\u9001\u7167\u7247",
    done: "\u5b8c\u6210",
    activitiesTitle: "\u591a\u7c73\u5c3c\u52a0\u5171\u548c\u56fd\u6709\u8da3\u6d3b\u52a8",
    back: "\u8fd4\u56de",
    uploadComplete: "\u4e0a\u4f20\u5b8c\u6210",
    uploadFailed: "\u4e0a\u4f20\u5931\u8d25",
  },
};

startCamera();

captureButton.addEventListener("click", onCaptureClick);
emailEnterButton.addEventListener("click", onEmailConfirm);
emailCancelButton.addEventListener("click", closeEmailModal);
activitiesCloseButton.addEventListener("click", closeActivitiesModal);
resultCloseButton.addEventListener("click", closeResultModal);
langEnButton.addEventListener("click", () => setLanguage("en"));
langEsButton.addEventListener("click", () => setLanguage("es"));
langZhButton.addEventListener("click", () => setLanguage("zh"));
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
  resultMessage.classList.toggle("result-message--updating", !canClose);
  resultCloseButton.hidden = !canClose;
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
  currentLanguage = language === "es" || language === "zh" ? language : "en";
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
  resultCloseButton.textContent = copy.done;
  activitiesTitle.textContent = copy.activitiesTitle;
  activitiesCloseButton.textContent = copy.back;
  langEnButton.classList.toggle("is-active", currentLanguage === "en");
  langEsButton.classList.toggle("is-active", currentLanguage === "es");
  langZhButton.classList.toggle("is-active", currentLanguage === "zh");

  if (!resultModal.hidden) {
    if (resultCloseButton.disabled) {
      showUploadPopup(copy.uploadWaitingTitle, copy.uploadWaitingMessage, false);
    }
  } else if (
    captureStatus.textContent === translations.en.tapToStart ||
    captureStatus.textContent === translations.es.tapToStart ||
    captureStatus.textContent === translations.zh.tapToStart
  ) {
    captureStatus.textContent = copy.tapToStart;
  } else if (
    captureStatus.textContent === translations.en.startingCamera ||
    captureStatus.textContent === translations.es.startingCamera ||
    captureStatus.textContent === translations.zh.startingCamera
  ) {
    captureStatus.textContent = copy.startingCamera;
  } else if (
    captureStatus.textContent === translations.en.standOnBlueX ||
    captureStatus.textContent === translations.es.standOnBlueX ||
    captureStatus.textContent === translations.zh.standOnBlueX
  ) {
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
