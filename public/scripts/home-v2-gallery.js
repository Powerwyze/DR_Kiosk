import * as THREE from "../vendor/three/build/three.module.js";
import { GLTFLoader } from "../vendor/three/examples/jsm/loaders/GLTFLoader.js";

const gallery = document.getElementById("gallery");
const emptyState = document.getElementById("gallery-empty");

async function loadGallery() {
  try {
    const response = await fetch(`data/cans.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Data request failed: ${response.status}`);
    }
    const cans = await response.json();
    if (!Array.isArray(cans) || cans.length === 0) {
      emptyState.hidden = false;
      return;
    }

    const buttons = [];
    for (let index = 0; index < cans.length; index += 1) {
      const can = cans[index];
      const canButton = createCanButton(can, index);
      gallery.appendChild(canButton);
      buttons.push(canButton);
      renderCanThumbnail(canButton.querySelector("canvas"), can.model, can.heroColor || "#f7f1e3", can.name);
    }
    runGalleryAnimations(buttons);
  } catch (error) {
    emptyState.hidden = false;
    emptyState.textContent = `Could not load can catalog. ${error.message}`;
    console.error(error);
  }
}

function createCanButton(can, index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "can-button";
  button.dataset.id = can.id;
  button.dataset.index = String(index);
  button.addEventListener("click", () => navigateToCan(can.id, index, can.page));

  const preview = document.createElement("canvas");
  preview.className = "can-button__preview";
  preview.setAttribute("aria-label", `Open ${can.name} details`);
  preview.width = 640;
  preview.height = 360;

  const textWrap = document.createElement("div");
  textWrap.className = "can-button__content";

  const eyebrow = document.createElement("span");
  eyebrow.className = "can-button__eyebrow";
  eyebrow.textContent = can.series || "Royal Wine";

  const title = document.createElement("span");
  title.className = "can-button__title";
  title.textContent = can.name;

  const tagline = document.createElement("span");
  tagline.className = "can-button__tagline";
  tagline.textContent = can.tagline || "Limited release";

  textWrap.appendChild(eyebrow);
  textWrap.appendChild(title);
  textWrap.appendChild(tagline);

  button.appendChild(preview);
  button.appendChild(textWrap);

  return button;
}

function renderCanThumbnail(canvas, modelPath, accentColor, canName) {
  if (!modelPath) {
    drawPreviewFallback(canvas, canName);
    return;
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: false,
  });
  const context = renderer.getContext();
  if (!context) {
    drawPreviewFallback(canvas, canName);
    return;
  }
  const width = Math.max(300, Math.floor(canvas.clientWidth || 300));
  const height = Math.max(180, Math.floor(canvas.clientHeight || 180));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, true);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(0.5, 1.8, 2.3);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(new THREE.Color(accentColor || "#ffba52"), 0.6);
  fillLight.position.set(-1.8, 1.1, -1.4);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.28);
  rimLight.position.set(-0.7, -0.3, -1.8);
  scene.add(rimLight);

  const loader = new GLTFLoader();
  loader.setCrossOrigin("anonymous");
  loader.load(
    modelPath,
    (gltf) => {
      const model = gltf.scene;
      model.traverse((node) => {
        if (!node.isMesh) return;
        if (node.material) {
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          for (const material of materials) {
            if (material.map) {
              material.map.colorSpace = THREE.SRGBColorSpace;
              material.map.needsUpdate = true;
            }
            if (typeof material.roughness === "number") {
              material.roughness = Math.min(1, material.roughness + 0.35);
            }
            if (typeof material.metalness === "number") {
              material.metalness = Math.min(0.07, material.metalness);
            }
          }
        }
      });

      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 1.35 / Math.max(1, maxDim);
      model.scale.setScalar(scale > 0 ? scale : 1);
      model.position.copy(center).multiplyScalar(-scale);
      model.rotation.set(0.08, 0.4, 0);

      scene.add(model);

      const distance = Math.max(1.5, maxDim * 1.35);
      camera.position.set(0, 0.08, distance);
      camera.lookAt(0, -0.02, 0);

      scene.background = new THREE.Color(0xf7f2e7);
      renderer.setClearColor(0xf7f2e7, 1);
      renderer.render(scene, camera);
      context.flush();
    },
    () => {},
    () => {
      drawPreviewFallback(canvas, canName);
    }
  );
}

function drawPreviewFallback(canvas, canName = "") {
  const context2d = canvas.getContext("2d");
  if (!context2d) return;
  const width = canvas.width || 640;
  const height = canvas.height || 360;
  context2d.clearRect(0, 0, width, height);
  context2d.fillStyle = "#f8f3e7";
  context2d.fillRect(0, 0, width, height);
  context2d.fillStyle = "#6b5230";
  context2d.font = "18px Arial, sans-serif";
  context2d.textAlign = "center";
  context2d.textBaseline = "middle";
  context2d.fillText("Model preview", width / 2, height / 2 - 12);
  if (canName) {
    context2d.font = "16px Arial, sans-serif";
    context2d.fillStyle = "#4a3c20";
    context2d.fillText(canName, width / 2, height / 2 + 12);
  }
}

function navigateToCan(canId, index, page = "can.html") {
  const safePage = String(page || "can.html").trim() || "can.html";
  const query = `?id=${encodeURIComponent(canId)}&index=${index}`;
  window.location.href = `${safePage}${query}`;
}

function runGalleryAnimations(cards) {
  if (!window.gsap || !Array.isArray(cards) || cards.length === 0) {
    return;
  }

  const timelineTargets = cards.filter((card) => card instanceof HTMLElement);
  window.gsap.from(timelineTargets, {
    y: 30,
    opacity: 0,
    rotationZ: -1.2,
    duration: 0.95,
    ease: "power2.out",
    stagger: 0.12,
    delay: 0.15,
  });

  timelineTargets.forEach((card, index) => {
    window.gsap.to(card, {
      y: `${index % 2 === 0 ? -8 : 8}px`,
      duration: 3 + (index * 0.2),
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
  });

  const leftWave = document.querySelector(".v2-wave");
  if (leftWave) {
    window.gsap.to(leftWave, {
      rotation: 12,
      duration: 20,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
  }
}

loadGallery();
