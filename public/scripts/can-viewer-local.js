import * as THREE from "./vendor/three/build/three.module.js";
import { OrbitControls } from "./vendor/three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";

const nameEl = document.getElementById("can-name");
const taglineEl = document.getElementById("can-tagline");
const descriptionEl = document.getElementById("can-description");
const volumeEl = document.getElementById("can-volume");
const abvEl = document.getElementById("can-abv");
const notesEl = document.getElementById("note-pills");
const viewerPanel = document.querySelector(".viewer-panel");
const viewerContainer = document.getElementById("viewer");

const params = new URLSearchParams(window.location.search);
const requestedId = params.get("id");

let renderer;
let camera;
let scene;
let controls;
let model;
let cleanup;

bootstrap();

async function bootstrap() {
  try {
    const response = await fetch("data/cans.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load can data");
    const cans = await response.json();
    if (!Array.isArray(cans) || cans.length === 0) {
      showUnavailable("No mimosa cans have been added yet.");
      return;
    }

    let can = cans.find((entry) => entry.id === requestedId);
    if (!can) {
      const fallback = cans[0];
      const notice = requestedId
        ? `Could not find can "${requestedId}". Showing ${fallback.name}.`
        : `No can selected. Showing ${fallback.name}.`;
      console.warn(notice);
      showToast(notice);
      can = fallback;
    }

    if (!isGlbModel(can.model)) {
      showUnavailable("This kiosk supports GLB models only.");
      return;
    }

    hydrateDetails(can);
    initThree(can.model, can);
  } catch (error) {
    console.error(error);
    showUnavailable("Something went wrong while loading this mimosa.");
  }
}

function hydrateDetails(can) {
  document.title = `${can.name} | Carallosol`;
  nameEl.textContent = can.name;
  taglineEl.textContent = can.tagline || "Limited release";
  descriptionEl.textContent = can.description || "";
  volumeEl.textContent = can.volume || "—";
  abvEl.textContent = can.abv || "—";
  viewerPanel.style.background = `radial-gradient(circle at top, ${hexWithAlpha(can.heroColor || "#ff9a3c", 0.35)}, #050608)`;

  notesEl.innerHTML = "";
  (can.notes || []).forEach((note) => {
    const pill = document.createElement("span");
    pill.textContent = note;
    notesEl.appendChild(pill);
  });
}

function initThree(modelPath) {
  const width = viewerContainer.clientWidth || viewerPanel.clientWidth || 1;
  const height = viewerContainer.clientHeight || viewerPanel.clientHeight || window.innerHeight * 0.6;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  viewerContainer.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(0, 1.2, 3);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.8;
  controls.maxPolarAngle = Math.PI / 1.8;
  controls.minDistance = 1.0;
  controls.maxDistance = 5.0;

  scene.background = null;

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x26242e, 1.05);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(2.2, 3.8, 2.6);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffa95e, 0.4);
  fillLight.position.set(-2.6, 1.8, -2.1);
  scene.add(fillLight);

  const ambient = new THREE.AmbientLight(0x202020, 1);
  scene.add(ambient);

  const loader = new GLTFLoader();
  loader.setCrossOrigin("anonymous");

  loader.load(
    modelPath,
    (gltf) => {
      model = gltf.scene;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
          if (child.material && child.material.map) {
            child.material.map.colorSpace = THREE.SRGBColorSpace;
            child.material.map.needsUpdate = true;
          }
        }
      });

      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = maxDim > 0 ? 1.6 / maxDim : 1;
      model.scale.setScalar(scale);

      model.position.copy(center).multiplyScalar(-scale);
      model.position.y += 0.15;

      const distance = Math.max(1.8, maxDim * 2.2);
      camera.position.set(0, 0.4, distance);
      camera.lookAt(0, 0.2, 0);
      controls.target.set(0, 0.2, 0);
      controls.update();

      scene.add(model);
      cleanup = true;
    },
    (progress) => {
      if (!progress.total) return;
      const ratio = Math.min(1, progress.loaded / progress.total);
      if (ratio < 1) {
        canProgress(ratio);
      }
    },
    (err) => {
      console.error(err);
      showUnavailable("Unable to render the 3D model. Verify GLB path and texture folder permissions.");
    }
  );

  window.addEventListener("resize", onWindowResize);
  animate();
}

function canProgress(ratio) {
  if (ratio >= 1) {
    return;
  }
  taglineEl.textContent = `Loading model ${Math.round(ratio * 100)}%`;
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();

  if (model) {
    const time = performance.now() * 0.0006;
    model.rotation.y += 0.002;
    model.position.y = 0.15 + Math.sin(time * 2) * 0.06;
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function onWindowResize() {
  if (!renderer || !camera) return;
  const width = viewerPanel.clientWidth;
  const height = Math.max(320, viewerPanel.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function hexWithAlpha(hex, alpha) {
  const sanitized = String(hex || "#000").replace("#", "");
  const bigint = parseInt(sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function showUnavailable(message) {
  nameEl.textContent = "Unavailable";
  taglineEl.textContent = message;
  descriptionEl.textContent = "";
  notesEl.innerHTML = "";
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.bottom = "1.5rem";
  toast.style.left = "50%";
  toast.style.transform = "translateX(-50%)";
  toast.style.padding = "0.85rem 1.4rem";
  toast.style.background = "rgba(0, 0, 0, 0.65)";
  toast.style.border = "1px solid rgba(255, 255, 255, 0.1)";
  toast.style.backdropFilter = "blur(10px)";
  toast.style.borderRadius = "999px";
  toast.style.fontSize = "0.85rem";
  toast.style.zIndex = "50";
  toast.style.color = "white";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

function isGlbModel(modelPath) {
  return typeof modelPath === "string" && modelPath.toLowerCase().trim().endsWith(".glb");
}