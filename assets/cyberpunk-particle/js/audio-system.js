export function createAudioSystem({ audioUrl }) {
  const audioState = {
    context: null,
    buffer: null,
    ready: false,
    lastPlayTime: 0,
    cooldown: 0.75,
    pending: false,
  };

  async function initAudio() {
    if (audioState.context) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const context = new AudioCtx();
    audioState.context = context;
    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch (error) {
        console.warn("Audio resume blocked", error);
      }
    }
    try {
      const response = await fetch(audioUrl);
      const buffer = await response.arrayBuffer();
      audioState.buffer = await context.decodeAudioData(buffer);
      audioState.ready = true;
      if (audioState.pending) {
        audioState.pending = false;
        playActionSound();
      }
    } catch (error) {
      console.warn("Audio load failed", error);
    }
  }

  function playActionSound() {
    if (!audioState.context) {
      initAudio();
    }
    if (!audioState.ready) {
      audioState.pending = true;
      return;
    }
    const now = audioState.context.currentTime;
    if (now - audioState.lastPlayTime < audioState.cooldown) return;
    if (audioState.context.state === "suspended") {
      audioState.context.resume().catch(() => {});
    }
    const source = audioState.context.createBufferSource();
    source.buffer = audioState.buffer;
    source.connect(audioState.context.destination);
    source.start(now, 0, 0.5);
    audioState.lastPlayTime = now;
  }

  return {
    initAudio,
    playActionSound,
  };
}
