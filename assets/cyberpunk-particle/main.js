import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import {
  ATTRACT_DURATION,
  BURST_DURATION,
  BURST_PULSE_FORCE,
  BURST_SWIRL_FORCE,
  BURST_RADIUS_SCALE,
  DAMPING,
  FIST_BURST_FORCE,
  LERP_FACTOR,
  Mode,
  OPEN_BURST_FORCE,
  OPEN_BURST_RADIUS,
  PARTICLE_COUNT,
  PARTICLE_SIZE,
  PINCH_FORCE,
  PULL_FORCE,
  PULL_RADIUS,
  SCATTER_FORCE,
  SCATTER_RADIUS,
  SNOW_DRIFT,
  SNOW_SPEED,
  SNOW_SWAY,
  SPHERE_DEPTH_FAR,
  SPHERE_DEPTH_NEAR,
  SPHERE_MAX_SCREEN_RATIO,
  SPHERE_MIN_SCREEN_RATIO,
  SPHERE_RADIUS_LERP,
  SHOCKWAVE_FORCE,
  STABLE_FRAMES,
  SWIRL_FORCE,
  TEXT_CONFIGS,
} from "./js/config.js";
import { createScene } from "./js/scene.js";
import { createTextSystem } from "./js/text-system.js";
import { createHandSystem } from "./js/hand-system.js";
import { createAudioSystem } from "./js/audio-system.js";
import { createSimulation } from "./js/simulation.js";

const hudFps = document.getElementById("hud-fps");
const hudCount = document.getElementById("hud-count");
const hudLeft = document.getElementById("hud-left");
const hudRight = document.getElementById("hud-right");
const flash = document.getElementById("flash");
const cameraCanvas = document.getElementById("camera-canvas");
const cameraCtx = cameraCanvas.getContext("2d");
const videoElement = document.getElementById("camera-feed");

hudCount.textContent = PARTICLE_COUNT.toString();

const world = { width: 1, height: 1 };
const currentTextRef = { value: TEXT_CONFIGS[0] };
const screenToWorld = (normX, normY) => ({
  x: (normX - 0.5) * world.width,
  y: (0.5 - normY) * world.height,
});

const sceneData = createScene({
  THREE,
  particleCount: PARTICLE_COUNT,
  container: document.body,
});

const textSystem = createTextSystem({
  particleCount: PARTICLE_COUNT,
  baseTargets: sceneData.arrays.baseTargets,
  world,
});

const audioSystem = createAudioSystem({ audioUrl: "./assets/laser.mp3" });

const handSystem = createHandSystem({
  textConfigs: TEXT_CONFIGS,
  stableFrames: STABLE_FRAMES,
  screenToWorld,
  hudLeft,
  hudRight,
  cameraCanvas,
  cameraCtx,
  currentTextRef,
  onLeftActionChange: (action) => {
    if (action !== "NONE") {
      audioSystem.playActionSound();
    }
  },
});

const simulation = createSimulation({
  THREE,
  config: {
    ATTRACT_DURATION,
    BURST_DURATION,
    BURST_PULSE_FORCE,
    BURST_SWIRL_FORCE,
    BURST_RADIUS_SCALE,
    DAMPING,
    FIST_BURST_FORCE,
    LERP_FACTOR,
    Mode,
    OPEN_BURST_FORCE,
    OPEN_BURST_RADIUS,
    PARTICLE_COUNT,
    PARTICLE_SIZE,
    PINCH_FORCE,
    PULL_FORCE,
    PULL_RADIUS,
    SCATTER_FORCE,
    SCATTER_RADIUS,
    SNOW_DRIFT,
    SNOW_SPEED,
    SNOW_SWAY,
    SPHERE_DEPTH_FAR,
    SPHERE_DEPTH_NEAR,
    SPHERE_MAX_SCREEN_RATIO,
    SPHERE_MIN_SCREEN_RATIO,
    SPHERE_RADIUS_LERP,
    SHOCKWAVE_FORCE,
    SWIRL_FORCE,
    TEXT_CONFIGS,
  },
  sceneData,
  textSystem,
  handState: handSystem.handState,
  world,
  hudFps,
  flashEl: flash,
  currentTextRef,
});

window.addEventListener("resize", () => {
  simulation.resize();
  handSystem.resizeCameraCanvas();
});

function start() {
  simulation.rebuildAll();
  simulation.resize();
  handSystem.resizeCameraCanvas();
  window.addEventListener("pointerdown", audioSystem.initAudio, { once: true });
  window.addEventListener("touchstart", audioSystem.initAudio, { once: true });
  window.addEventListener("keydown", audioSystem.initAudio, { once: true });
  handSystem.initHands(videoElement);
  simulation.start();
}

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(start);
} else {
  start();
}
