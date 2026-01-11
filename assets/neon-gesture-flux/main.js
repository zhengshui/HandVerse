import * as THREE from "https://unpkg.com/three@0.159.0/build/three.module.js";
import { createScene } from "./js/scene.js";
import { createParticleSystem } from "./js/particle-system.js";
import { createTextSystem } from "./js/text-system.js";
import { createInputSystem } from "./js/input-system.js";
import { createAudioSystem, setupAR } from "./js/audio-ar.js";

const sceneContainer = document.getElementById("scene");
const handCanvas = document.getElementById("hand-canvas");
const handCtx = handCanvas.getContext("2d");
const gestureEl = document.querySelector("[data-gesture]");
const handsEl = document.querySelector("[data-hands]");
const arEl = document.querySelector("[data-ar]");
const visionStatusEl = document.querySelector("[data-vision]");
const soundStatusEl = document.querySelector("[data-sound]");
const signalEl = document.querySelector("[data-signal]");
const glyphEl = document.querySelector("[data-glyph]");
const halo = document.getElementById("halo");
const soundToggle = document.getElementById("soundToggle");
const visionToggle = document.getElementById("visionToggle");
const videoElement = document.getElementById("input-video");
const arSlot = document.getElementById("ar-slot");

const state = {
  gesture: "searching",
  hands: 0,
  hasHand: false,
  arActive: false,
  soundActive: false,
  visionActive: false,
  gestureEnergy: 0,
  gesturePulse: 0,
};

const { renderer, scene, camera, particleGroup, textGroup, starField, spriteTexture } = createScene({
  THREE,
  sceneContainer,
});

const particleSystem = createParticleSystem({ THREE, particleGroup, scene, spriteTexture });
const textSystem = createTextSystem({ THREE, textGroup, spriteTexture, glyphEl });

function updateHUD() {
  handsEl.textContent = String(state.hands);
  arEl.textContent = state.arActive ? "ACTIVE" : "STANDBY";
  if (visionStatusEl) {
    visionStatusEl.textContent = state.visionActive ? "ACTIVE" : "STANDBY";
  }
  if (soundStatusEl) {
    soundStatusEl.textContent = state.soundActive ? "ON" : "OFF";
  }
}

function setGesture(label) {
  if (state.gesture !== label) {
    state.gesture = label;
    state.gesturePulse = 1;
    textSystem.updateGlyph(label);
  }
  if (gestureEl) {
    gestureEl.textContent = label === "searching" ? "SEARCH" : label.toUpperCase();
  }
}

updateHUD();
textSystem.updateGlyph(state.gesture);
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => textSystem.updateGlyph(state.gesture));
}

const attractor = new THREE.Vector3(0, 0, 0);
const smoothedAttractor = new THREE.Vector3(0, 0, 0);

const inputSystem = createInputSystem({
  state,
  handCanvas,
  handCtx,
  videoElement,
  visionToggle,
  setGesture,
  updateHUD,
  updateHaloPosition: (x, y) => {
    halo.style.transform = `translate(${x}px, ${y}px)`;
  },
  attractor,
});

const audioSystem = createAudioSystem({ state, soundToggle, updateHUD });
setupAR({ renderer, state, updateHUD, arSlot });

inputSystem.resizeHandCanvas();
inputSystem.startVision();

function animate(time) {
  const t = time * 0.001;
  state.gesturePulse = Math.max(0, state.gesturePulse - 0.02);
  if (signalEl) {
    const signalStrength = 0.3 + state.gestureEnergy * 0.7;
    signalEl.style.transform = `scaleX(${signalStrength})`;
  }
  halo.style.opacity = state.hasHand ? "1" : "0.5";
  if (state.hasHand) {
    smoothedAttractor.lerp(attractor, 0.2);
  } else {
    smoothedAttractor.set(
      Math.sin(t * 0.6) * 1.4,
      Math.cos(t * 0.4) * 0.8,
      Math.sin(t * 0.3) * 0.6
    );
    state.gestureEnergy = THREE.MathUtils.lerp(state.gestureEnergy, 0.2, 0.05);
  }

  particleSystem.update({
    time: t,
    state,
    smoothedAttractor,
    gestureEnergy: state.gestureEnergy,
    gesturePulse: state.gesturePulse,
  });
  textSystem.updateText({
    time: t,
    state,
    smoothedAttractor,
    gestureEnergy: state.gestureEnergy,
    gesturePulse: state.gesturePulse,
  });
  starField.rotation.y = t * 0.02;

  audioSystem.updateAudio({ state, gestureEnergy: state.gestureEnergy });

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  inputSystem.resizeHandCanvas();
});
