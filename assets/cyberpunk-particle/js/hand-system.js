export function createHandSystem({
  textConfigs,
  stableFrames,
  screenToWorld,
  hudLeft,
  hudRight,
  cameraCanvas,
  cameraCtx,
  currentTextRef,
  onLeftActionChange,
}) {
  let cameraDpr = 1;
  let leftHand = null;
  let rightHand = null;

  let leftFingers = 0;
  let leftOpen = false;
  let rightFingers = 0;
  let rightGesture = "NONE";
  let rightPinch = false;
  let leftFist = false;
  let leftPinch = false;
  let leftPalmWorld = { x: 0, y: 0 };
  let rightIndexWorld = null;
  let rightPalmWorld = null;

  let prevLeftAction = "NONE";
  let leftCandidate = { fingers: 0, fist: false, count: 0 };
  let rightCandidate = { gesture: "NONE", count: 0 };
  let leftPinchCandidate = { active: false, count: 0 };
  let leftOpenCandidate = { active: false, count: 0 };

  const handState = {
    leftFingers: 0,
    leftOpen: false,
    rightFingers: 0,
    rightGesture: "NONE",
    rightPinch: false,
    leftFist: false,
    leftPinch: false,
    leftBurst: false,
    leftPalmWorld: { x: 0, y: 0 },
    rightIndexWorld: null,
    rightPalmWorld: null,
    leftConfig: null,
    rightOpen: false,
  };

  function resizeCameraCanvas() {
    cameraDpr = Math.min(window.devicePixelRatio || 1, 1.6);
    cameraCanvas.width = window.innerWidth * cameraDpr;
    cameraCanvas.height = window.innerHeight * cameraDpr;
  }

  function drawVideoCover(image) {
    if (!image) return;
    const canvasWidth = cameraCanvas.width;
    const canvasHeight = cameraCanvas.height;
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

    cameraCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    cameraCtx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  }

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = (a.z || 0) - (b.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function isExtended(wrist, tip, mcp, threshold) {
    return distance(wrist, tip) > distance(wrist, mcp) * threshold;
  }

  function inferHandedness(landmarks) {
    return landmarks[5].x < landmarks[17].x ? "Right" : "Left";
  }

  function thumbExtended(landmarks, handSize, thresholdScale, spreadScale) {
    const handedness = inferHandedness(landmarks);
    const thumbTip = landmarks[4];
    const thumbIP = landmarks[3];
    const thumbMcp = landmarks[2];
    const threshold = handSize * thresholdScale;
    const spread = handSize * spreadScale;
    const dir = thumbTip.x - thumbIP.x;
    let extended = handedness === "Right" ? dir < -threshold : dir > threshold;
    if (extended && distance(thumbTip, thumbMcp) < spread) {
      extended = false;
    }
    return extended;
  }

  function fingerExtended(landmarks, tip, pip, mcp, threshold, yMargin) {
    const wrist = landmarks[0];
    const yExtended = landmarks[tip].y < landmarks[pip].y - yMargin;
    const distExtended = isExtended(wrist, landmarks[tip], landmarks[mcp], threshold);
    return yExtended && distExtended;
  }

  function detectOpenHand(landmarks) {
    if (!landmarks) return false;
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    const handSize = distance(wrist, middleMcp) || 0.1;
    const index = fingerExtended(landmarks, 8, 6, 5, 1.06, 0.015);
    const middle = fingerExtended(landmarks, 12, 10, 9, 1.06, 0.015);
    const ring = fingerExtended(landmarks, 16, 14, 13, 1.04, 0.014);
    const pinky = fingerExtended(landmarks, 20, 18, 17, 1.02, 0.014);
    const thumb = thumbExtended(landmarks, handSize, 0.08, 0.28);
    return index && middle && ring && pinky && thumb;
  }

  function detectFist(landmarks) {
    if (!landmarks) return false;
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    const handSize = distance(wrist, middleMcp) || 0.1;
    const threshold = handSize * 0.9;
    const tips = [4, 8, 12, 16, 20];
    let closeCount = 0;
    for (let i = 0; i < tips.length; i += 1) {
      if (distance(wrist, landmarks[tips[i]]) < threshold) {
        closeCount += 1;
      }
    }
    return closeCount >= 4;
  }

  function detectPinch(landmarks) {
    if (!landmarks) return false;
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    const handSize = distance(wrist, middleMcp) || 0.1;
    return distance(landmarks[4], landmarks[8]) < handSize * 0.35;
  }

  function countFingers(landmarks) {
    if (!landmarks) return 0;
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    const handSize = distance(wrist, middleMcp) || 0.1;
    const thumb = thumbExtended(landmarks, handSize, 0.12, 0.35);
    const index = fingerExtended(landmarks, 8, 6, 5, 1.08, 0.018);
    const middle = fingerExtended(landmarks, 12, 10, 9, 1.08, 0.018);
    const ring = fingerExtended(landmarks, 16, 14, 13, 1.06, 0.017);
    const pinky = fingerExtended(landmarks, 20, 18, 17, 1.04, 0.017);
    return (thumb ? 1 : 0) + (index ? 1 : 0) + (middle ? 1 : 0) + (ring ? 1 : 0) + (pinky ? 1 : 0);
  }

  function updateLeftStable(fingers, fist) {
    if (leftCandidate.fingers === fingers && leftCandidate.fist === fist) {
      leftCandidate.count += 1;
    } else {
      leftCandidate = { fingers, fist, count: 1 };
    }
    if (leftCandidate.count >= stableFrames) {
      leftFingers = leftCandidate.fingers;
      leftFist = leftCandidate.fist;

      console.log("leftFingers", leftFingers);
      console.log("leftFist", leftFist);
    }
  }

  function updateRightStable(gesture) {
    if (rightCandidate.gesture === gesture) {
      rightCandidate.count += 1;
    } else {
      rightCandidate = { gesture, count: 1 };
    }
    if (rightCandidate.count >= stableFrames) {
      rightGesture = rightCandidate.gesture;
      rightPinch = rightGesture === "PINCH";
    }
  }

  function updateLeftPinchStable(active) {
    if (leftPinchCandidate.active === active) {
      leftPinchCandidate.count += 1;
    } else {
      leftPinchCandidate = { active, count: 1 };
    }
    if (leftPinchCandidate.count >= stableFrames) {
      leftPinch = leftPinchCandidate.active;
    }
  }

  function updateLeftOpenStable(active) {
    if (leftOpenCandidate.active === active) {
      leftOpenCandidate.count += 1;
    } else {
      leftOpenCandidate = { active, count: 1 };
    }
    if (leftOpenCandidate.count >= stableFrames) {
      leftOpen = leftOpenCandidate.active;
    }
  }

  function updateHandStates() {
    let rawLeftFingers = 0;
    let rawLeftFist = false;
    let rawLeftPinch = false;
    let rawLeftOpen = false;
    let rawRightGesture = "NONE";

    rightIndexWorld = null;
    rightPalmWorld = null;

    if (leftHand) {
      rawLeftFingers = countFingers(leftHand);
      rawLeftFist = detectFist(leftHand);
      rawLeftPinch = detectPinch(leftHand);
      rawLeftOpen = detectOpenHand(leftHand);
      if (rawLeftFist) {
        rawLeftFingers = 0;
      }
      leftPalmWorld = screenToWorld(
        (leftHand[0].x + leftHand[5].x + leftHand[9].x + leftHand[13].x + leftHand[17].x) / 5,
        (leftHand[0].y + leftHand[5].y + leftHand[9].y + leftHand[13].y + leftHand[17].y) / 5
      );
      updateLeftStable(rawLeftFingers, rawLeftFist);
      updateLeftPinchStable(rawLeftPinch);
      updateLeftOpenStable(rawLeftOpen);
    } else {
      leftCandidate = { fingers: 0, fist: false, count: stableFrames };
      leftFingers = 0;
      leftFist = false;
      leftPinchCandidate = { active: false, count: stableFrames };
      leftPinch = false;
      leftOpenCandidate = { active: false, count: stableFrames };
      leftOpen = false;
    }

    if (rightHand) {
      rightFingers = countFingers(rightHand);
      const rawRightPinch = detectPinch(rightHand);
      rightIndexWorld = screenToWorld(rightHand[8].x, rightHand[8].y);
      rightPalmWorld = screenToWorld(
        (rightHand[0].x + rightHand[5].x + rightHand[9].x + rightHand[13].x + rightHand[17].x) / 5,
        (rightHand[0].y + rightHand[5].y + rightHand[9].y + rightHand[13].y + rightHand[17].y) / 5
      );
      if (rawRightPinch) {
        rawRightGesture = "PINCH";
      } else if (rightFingers === 0) {
        rawRightGesture = "FIST";
      } else if (rightFingers === 1) {
        rawRightGesture = "POINT";
      } else if (rightFingers === 2) {
        rawRightGesture = "DUO";
      } else if (rightFingers === 3) {
        rawRightGesture = "TRI";
      } else if (rightFingers === 4) {
        rawRightGesture = "QUAD";
      } else if (rightFingers === 5) {
        rawRightGesture = "OPEN";
      }
      updateRightStable(rawRightGesture);
    } else {
      rightCandidate = { gesture: "NONE", count: stableFrames };
      rightGesture = "NONE";
      rightPinch = false;
    }

    const leftConfig =
      leftHand && !leftFist && !leftPinch && !leftOpen
        ? textConfigs.find((cfg) => cfg.fingers === leftFingers)
        : null;

    const currentText = currentTextRef?.value?.text ?? "";
    const leftStatus = leftHand
      ? leftPinch
        ? "PINCH / BURST"
        : leftFist
          ? "FIST / BURST"
          : leftOpen
            ? "SPHERE / CATCH"
            : `${leftFingers}F ${leftConfig ? leftConfig.text : currentText}`
      : "NO HAND";

    const rightStatus = rightHand
      ? rightGesture === "OPEN"
        ? "OPEN / BURST"
        : rightGesture === "PINCH"
          ? "PINCH / BURST"
          : rightGesture === "FIST"
            ? "FIST / SHOCK"
            : rightGesture === "DUO"
              ? "2F / PULL"
              : rightGesture === "TRI"
                ? "3F / SWIRL"
                : rightGesture === "QUAD"
                  ? "4F / RIPPLE"
                  : "POINT / SCATTER"
      : "NO HAND";

    hudLeft.textContent = leftStatus;
    hudRight.textContent = rightStatus;

    const rightOpen = rightGesture === "OPEN";
    const leftBurst = leftFist || leftPinch;
    const leftAction = leftBurst ? "BURST" : leftOpen ? "SPHERE" : leftConfig ? leftConfig.text : "NONE";

    if (leftAction !== prevLeftAction) {
      if (onLeftActionChange) {
        onLeftActionChange(leftAction);
      }
      prevLeftAction = leftAction;
    }

    handState.leftFingers = leftFingers;
    handState.leftOpen = leftOpen;
    handState.rightFingers = rightFingers;
    handState.rightGesture = rightGesture;
    handState.rightPinch = rightPinch;
    handState.leftFist = leftFist;
    handState.leftPinch = leftPinch;
    handState.leftBurst = leftBurst;
    handState.leftPalmWorld = leftPalmWorld;
    handState.rightIndexWorld = rightIndexWorld;
    handState.rightPalmWorld = rightPalmWorld;
    handState.leftConfig = leftConfig;
    handState.rightOpen = rightOpen;
  }

  function initHands(videoElement) {
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    hands.onResults((results) => {
      if (results.image) {
        drawVideoCover(results.image);
      }
      leftHand = null;
      rightHand = null;
      if (results.multiHandLandmarks && results.multiHandLandmarks.length) {
        results.multiHandLandmarks.forEach((landmarks, index) => {
          const label = results.multiHandedness[index].label;
          if (label === "Left") {
            rightHand = landmarks;
          } else {
            leftHand = landmarks;
          }
        });
      }
      updateHandStates();
    });

    const cameraFeed = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 1280,
      height: 720,
      facingMode: { ideal: "environment" },
    });

    cameraFeed.start();
  }

  return {
    handState,
    initHands,
    resizeCameraCanvas,
  };
}
