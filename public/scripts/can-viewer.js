import * as THREE from "../vendor/three/build/three.module.js";
import { OrbitControls } from "../vendor/three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "../vendor/three/examples/jsm/loaders/GLTFLoader.js";

const nameEl = document.getElementById("can-name");
const taglineEl = document.getElementById("can-tagline");
const descriptionEl = document.getElementById("can-description");
const volumeEl = document.getElementById("can-volume");
const abvEl = document.getElementById("can-abv");
const notesEl = document.getElementById("note-pills");
const notesSection = document.getElementById("notes-section");
const viewerPanel = document.querySelector(".viewer-panel");
const viewerContainer = document.getElementById("viewer");
const statsRow = document.getElementById("stats-row");
const statVolumeCard = document.getElementById("stat-volume");
const statAbvCard = document.getElementById("stat-abv");

const params = new URLSearchParams(window.location.search);
const rawRequestedIndex = params.get("index");
const requestedIndex = rawRequestedIndex === null || rawRequestedIndex === "" ? NaN : Number(rawRequestedIndex);
const requestedId = resolveRequestedId();

let renderer;
let camera;
let scene;
let controls;
let model;
let cleanup;
let clock;
const canBaseY = 0.2;
const floatAmount = 0.045;
const floatSpeed = 1.0;

bootstrap();

async function bootstrap() {
  try {
    const response = await fetch(`data/cans.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load can data");
    const cans = await response.json();
    console.log("Loaded cans:", cans.map(c => c.id));
    console.log("Requested ID from URL:", requestedId);

    if (!Array.isArray(cans) || cans.length === 0) {
      showUnavailable("No cans have been added yet.");
      return;
    }

    let can = findRequestedCan(cans, requestedId, requestedIndex);
    console.log("Found can:", can ? can.name : "NOT FOUND");
    if (!can) {
      const fallback = requestedIndex >= 0 ? cans[Math.min(Math.max(requestedIndex, 0), cans.length - 1)] : cans[0];
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
    showUnavailable("Something went wrong while loading this can.");
  }
}

function findRequestedCan(cans, requestedId, requestedIndex) {
  if (!Array.isArray(cans) || cans.length === 0) return null;

  if (typeof requestedId === "string" && requestedId.trim().length > 0) {
    const normalizedId = normalizeCanId(requestedId);
    const byId = cans.find((entry) => normalizeCanId(entry.id) === normalizedId);
    if (byId) {
      return byId;
    }
  }

  if (Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < cans.length) {
    return cans[requestedIndex];
  }

  return null;
}

function resolveRequestedId() {
  const explicitId = params.get("id");
  if (explicitId && explicitId.trim()) {
    return normalizeCanId(explicitId);
  }

  const path = (window.location.pathname || "").toLowerCase();
  const filename = path.split("/").pop();
  if (!filename) return "";

  if (filename.includes("can-peach")) return normalizeCanId("peach-bellini");
  if (filename.includes("can-mimosa")) return normalizeCanId("bartenura-mimosa");
  return "";
}

function normalizeCanId(value) {
  return String(value || "").trim().toLowerCase();
}

function hydrateDetails(can) {
  document.title = `${can.name} | Royal Wine`;
  nameEl.textContent = can.name;
  taglineEl.textContent = can.tagline || "Limited release";
  descriptionEl.textContent = can.description || "";
  const hasVolume = shouldShowStat(can.volume);
  const hasAbv = shouldShowStat(can.abv);

  if (hasVolume) {
    volumeEl.textContent = can.volume;
    statVolumeCard.hidden = false;
  } else {
    statVolumeCard.hidden = true;
  }

  if (hasAbv) {
    abvEl.textContent = can.abv;
    statAbvCard.hidden = false;
  } else {
    statAbvCard.hidden = true;
  }

  if (!hasVolume && !hasAbv) {
    statsRow.hidden = true;
  } else {
    statsRow.hidden = false;
  }

  viewerPanel.style.background = `radial-gradient(circle at top, ${hexWithAlpha(can.heroColor || "#2563eb", 0.35)}, #e2e8f0)`;

  const noteValues = normalizeNotes(can.notes || []);
  if (noteValues.length > 0) {
    notesSection.hidden = false;
    notesEl.innerHTML = "";
    noteValues.forEach((note) => {
      const pill = document.createElement("span");
      pill.textContent = note;
      notesEl.appendChild(pill);
    });
  } else {
    notesSection.hidden = true;
  }
}

function normalizeNotes(notes) {
  if (!Array.isArray(notes)) return [];
  const seen = new Set();
  return notes
    .map((note) => String(note || "").trim())
    .filter((note) => note.length > 0)
    .filter((note) => {
      const key = note.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
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
  renderer.toneMappingExposure = 0.6;
  viewerContainer.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(0, 1.2, 3);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.8;
  controls.maxPolarAngle = Math.PI / 1.8;
  controls.minDistance = 1.0;
  controls.maxDistance = 5.0;

  scene.background = null;

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xf6f9ff, 0.85);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
  keyLight.position.set(0, 2.0, 6.5);
  keyLight.target.position.set(0, 0.2, 0);
  scene.add(keyLight);
  scene.add(keyLight.target);

  const frontFill = new THREE.DirectionalLight(0xffffff, 0.3);
  frontFill.position.set(0.2, 1.3, 5.0);
  frontFill.target.position.set(0, 0.3, 0);
  scene.add(frontFill);
  scene.add(frontFill.target);

  const fillLight = new THREE.DirectionalLight(0xfff3de, 0.45);
  fillLight.position.set(-3.2, 1.8, -2.0);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xfff0ca, 0.15);
  rimLight.position.set(-2.2, 1.1, -2.4);
  scene.add(rimLight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.38);
  scene.add(ambient);

  const loader = new GLTFLoader();
  loader.setCrossOrigin("anonymous");
  clock = new THREE.Clock();

  loader.load(
    modelPath,
    (gltf) => {
      model = gltf.scene;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
          if (child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => {
              if (material && material.map) {
                material.map.colorSpace = THREE.SRGBColorSpace;
                material.map.needsUpdate = true;
              }
              if (typeof material.roughness === "number") {
                material.roughness = Math.min(1, material.roughness + 0.65);
              }
              if (typeof material.metalness === "number") {
                material.metalness = Math.min(0.08, material.metalness);
              }
              if (typeof material.clearcoat === "number") {
                material.clearcoat = Math.min(0.3, material.clearcoat);
              }
              if (typeof material.clearcoatRoughness === "number") {
                material.clearcoatRoughness = Math.max(0.75, material.clearcoatRoughness);
              }
              if (typeof material.reflectivity === "number") {
                material.reflectivity = Math.min(0.2, material.reflectivity);
              }
              if (typeof material.envMapIntensity === "number") {
                material.envMapIntensity = Math.min(0.16, material.envMapIntensity);
              }
              if (material.emissive && material.emissiveIntensity !== undefined) {
                material.emissiveIntensity = Math.min(0.06, material.emissiveIntensity);
              }
            });
          }
        }
      });

      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = maxDim > 0 ? 2.6 / maxDim : 1;
      model.scale.setScalar(scale);

      model.position.copy(center).multiplyScalar(-scale);
      model.position.y = canBaseY;
      model.rotation.set(0, 0, 0);

      const distance = Math.max(1.3, maxDim * 1.4);
      camera.position.set(0, 0.4, distance);
      camera.lookAt(0, canBaseY, 0);
      controls.target.set(0, canBaseY, 0);
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
    const floatY = canBaseY + Math.sin(clock.getElapsedTime() * floatSpeed) * floatAmount;
    model.position.y = floatY;
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
  notesSection.hidden = true;
  statsRow.hidden = true;
  statVolumeCard.hidden = true;
  statAbvCard.hidden = true;
}

function shouldShowStat(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.length > 0 && normalized !== "n/a" && normalized !== "na" && normalized !== "—";
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
