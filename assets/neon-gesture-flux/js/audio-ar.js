import { ARButton } from "https://unpkg.com/three@0.159.0/examples/jsm/webxr/ARButton.js";

export function createAudioSystem({ state, soundToggle, updateHUD }) {
  let audioCtx = null;
  let droneOsc = null;
  let droneGain = null;
  let filter = null;

  function initAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      soundToggle.textContent = "Sound Unsupported";
      return;
    }
    audioCtx = new AudioCtx();
    droneOsc = audioCtx.createOscillator();
    droneOsc.type = "sawtooth";
    filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 360;
    filter.Q.value = 4;
    droneGain = audioCtx.createGain();
    droneGain.gain.value = 0;

    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.frequency.value = 0.15;
    lfoGain.gain.value = 40;
    lfo.connect(lfoGain).connect(droneOsc.frequency);

    droneOsc.connect(filter).connect(droneGain).connect(audioCtx.destination);
    droneOsc.start();
    lfo.start();
  }

  soundToggle.addEventListener("click", async () => {
    if (!audioCtx) {
      initAudio();
    }
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    state.soundActive = !state.soundActive;
    soundToggle.textContent = state.soundActive ? "Sound On" : "Sound Off";
    updateHUD();
  });

  function updateAudio({ state: currentState, gestureEnergy }) {
    if (audioCtx && currentState.soundActive) {
      const pitchBase =
        currentState.gesture === "pinch"
          ? 520
          : currentState.gesture === "open"
            ? 300
            : currentState.gesture === "ok"
              ? 440
              : currentState.gesture === "love"
                ? 260
                : 420;
      const targetPitch = pitchBase + gestureEnergy * 360;
      droneOsc.frequency.setTargetAtTime(targetPitch, audioCtx.currentTime, 0.08);
      filter.frequency.setTargetAtTime(240 + gestureEnergy * 1200, audioCtx.currentTime, 0.08);
      droneGain.gain.setTargetAtTime(0.08 + gestureEnergy * 0.2, audioCtx.currentTime, 0.08);
    } else if (audioCtx && droneGain) {
      droneGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    }
  }

  return {
    updateAudio,
  };
}

export function setupAR({ renderer, state, updateHUD, arSlot }) {
  if (!navigator.xr) return;
  navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
    if (!supported) return;
    const button = ARButton.createButton(renderer, {
      optionalFeatures: ["dom-overlay", "local-floor"],
      domOverlay: { root: document.body },
    });
    button.className = "hud-btn";
    button.textContent = "Enter AR";
    arSlot.appendChild(button);
  });

  renderer.xr.addEventListener("sessionstart", () => {
    state.arActive = true;
    updateHUD();
    renderer.setClearColor(0x000000, 0);
  });

  renderer.xr.addEventListener("sessionend", () => {
    state.arActive = false;
    updateHUD();
    renderer.setClearColor(0x05060b, 0.65);
  });
}
