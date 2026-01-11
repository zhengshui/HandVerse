export function createInputSystem({
  state,
  handCanvas,
  handCtx,
  videoElement,
  visionToggle,
  setGesture,
  updateHUD,
  updateHaloPosition,
  attractor,
}) {
  let hands = null;
  let handCamera = null;
  let lastIndex = null;

  function resizeHandCanvas() {
    handCanvas.width = window.innerWidth;
    handCanvas.height = window.innerHeight;
  }

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = (a.z || 0) - (b.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function isExtended(wrist, tip, mcp, threshold = 1.2) {
    return distance(wrist, tip) > distance(wrist, mcp) * threshold;
  }

  function detectGesture(landmarks) {
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    const handSize = distance(wrist, middleMcp) || 0.1;
    const pinch = distance(landmarks[4], landmarks[8]) < handSize * 0.35;
    const thumbExtended = isExtended(wrist, landmarks[4], landmarks[2], 1.08);
    const indexExtended = isExtended(wrist, landmarks[8], landmarks[5], 1.18);
    const middleExtended = isExtended(wrist, landmarks[12], landmarks[9], 1.18);
    const ringExtended = isExtended(wrist, landmarks[16], landmarks[13], 1.15);
    const pinkyExtended = isExtended(wrist, landmarks[20], landmarks[17], 1.12);

    const ok = pinch && middleExtended && ringExtended && pinkyExtended;
    const love = thumbExtended && pinkyExtended && indexExtended && !middleExtended && !ringExtended;
    const ySign = thumbExtended && pinkyExtended && !indexExtended && !middleExtended && !ringExtended;

    const open = indexExtended && middleExtended && ringExtended && pinkyExtended;
    const fist =
      !indexExtended &&
      !middleExtended &&
      !ringExtended &&
      !pinkyExtended &&
      distance(wrist, landmarks[8]) < handSize * 0.85;

    if (ok) return "love";
    if (love || ySign) return "love";
    if (pinch) return "pinch";
    if (fist) return "fist";
    if (open) return "open";
    return "flow";
  }

  function landmarkToWorld(landmark) {
    const x = (landmark.x - 0.5) * 6;
    const y = (0.5 - landmark.y) * 4;
    const z = -landmark.z * 3;
    return { x, y, z };
  }

  function updateEnergy(indexTip) {
    if (lastIndex) {
      const speed = distance(indexTip, lastIndex);
      const target = Math.min(1, speed * 12);
      state.gestureEnergy = state.gestureEnergy + (target - state.gestureEnergy) * 0.2;
    }
    lastIndex = { x: indexTip.x, y: indexTip.y, z: indexTip.z };
  }

  function setupHands() {
    hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.6,
    });
    hands.onResults(onResults);
  }

  function startVision() {
    if (!hands) setupHands();
    if (handCamera) return;
    handCamera = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 960,
      height: 540,
    });
    handCamera.start();
    state.visionActive = true;
    visionToggle.textContent = "Vision Active";
    updateHUD();
  }

  function drawVideoCover(image) {
    const canvasWidth = handCanvas.width;
    const canvasHeight = handCanvas.height;
    const sourceWidth = image.videoWidth || canvasWidth;
    const sourceHeight = image.videoHeight || canvasHeight;
    const canvasAspect = canvasWidth / canvasHeight;
    const sourceAspect = sourceWidth / sourceHeight;
    let drawWidth = canvasWidth;
    let drawHeight = canvasHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (sourceAspect > canvasAspect) {
      drawHeight = canvasHeight;
      drawWidth = drawHeight * sourceAspect;
      offsetX = (canvasWidth - drawWidth) * 0.5;
    } else {
      drawWidth = canvasWidth;
      drawHeight = drawWidth / sourceAspect;
      offsetY = (canvasHeight - drawHeight) * 0.5;
    }

    handCtx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  }

  function onResults(results) {
    handCtx.save();
    handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
    if (results.image) {
      drawVideoCover(results.image);
    }
    state.hands = results.multiHandLandmarks?.length || 0;
    if (state.hands > 0) {
      const landmarks = results.multiHandLandmarks[0];
      state.hasHand = true;
      const indexTip = landmarks[8];
      updateEnergy(indexTip);
      const world = landmarkToWorld(indexTip);
      attractor.set(world.x, world.y, world.z);
      setGesture(detectGesture(landmarks));
      updateHaloPosition(indexTip.x * window.innerWidth, indexTip.y * window.innerHeight);
    } else {
      state.hasHand = false;
      setGesture("searching");
    }
    updateHUD();
    handCtx.restore();
  }

  visionToggle.addEventListener("click", () => {
    startVision();
  });

  return {
    resizeHandCanvas,
    startVision,
  };
}
