import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

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
      const notice = requestedId ? `Could not find can "${requestedId}". Showing ${fallback.name} instead.` : `No can selected. Showing ${fallback.name}.`;
      console.warn(notice);
      showToast(notice);
      can = fallback;
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

function initThree(modelPath, can) {
  const width = viewerContainer.clientWidth || viewerPanel.clientWidth;
  const height = viewerContainer.clientHeight || viewerPanel.clientHeight || window.innerHeight * 0.6;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  viewerContainer.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
  camera.position.set(0, 1.2, 3);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI / 2.2;
  controls.minDistance = 1.4;
  controls.maxDistance = 3.5;

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222233, 1.1);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(2.5, 4, 3);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xffa95e, 0.8);
  rimLight.position.set(-3, 2, -2);
  scene.add(rimLight);

  const loader = new GLTFLoader();
  loader.load(
    modelPath,
    (gltf) => {
      model = gltf.scene;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      model.rotation.y = Math.PI * 0.2;
      model.position.y = 0.4;
      scene.add(model);
    },
    undefined,
    (err) => {
      console.error(err);
      showUnavailable("Unable to render the 3D model. Try reloading.");
    }
  );

  window.addEventListener("resize", onWindowResize);
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (model) {
    const time = performance.now() * 0.0006;
    model.rotation.y += 0.002;
    model.position.y = 0.4 + Math.sin(time * 2) * 0.08;
  }
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function onWindowResize() {
  if (!renderer || !camera) return;
  const width = viewerPanel.clientWidth;
  const height = viewerPanel.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function hexWithAlpha(hex, alpha) {
  const sanitized = hex.replace("#", "");
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