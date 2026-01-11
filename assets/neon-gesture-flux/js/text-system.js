export function createTextSystem({ THREE, textGroup, spriteTexture, glyphEl }) {
  const textCanvas = document.createElement("canvas");
  textCanvas.width = 512;
  textCanvas.height = 160;
  const textCtx = textCanvas.getContext("2d");
  const textMaterial = new THREE.PointsMaterial({
    size: 0.07,
    map: spriteTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
  let textPoints = null;
  let currentGlyph = "";
  const textAnchor = new THREE.Vector3();
  const textOffset = new THREE.Vector3(0.5, 0.6, -0.2);

  const glyphMap = {
    searching: "侦测",
    flow: "流动",
    open: "绽放",
    pinch: "凝聚",
    fist: "涡旋",
    ok: "确认",
    love: "我爱你",
  };

  const glyphColors = {
    searching: 0x5ef6ff,
    flow: 0x5ef6ff,
    open: 0x7cff64,
    pinch: 0xff7b47,
    fist: 0x7c5cff,
    ok: 0xffd166,
    love: 0xff6fb3,
  };

  function buildTextPoints(label, hexColor) {
    textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
    textCtx.fillStyle = "#ffffff";
    textCtx.textAlign = "center";
    textCtx.textBaseline = "middle";
    textCtx.font = "700 96px 'Noto Sans SC', 'Orbitron', sans-serif";
    textCtx.fillText(label, textCanvas.width / 2, textCanvas.height / 2);

    const image = textCtx.getImageData(0, 0, textCanvas.width, textCanvas.height).data;
    const points = [];
    for (let y = 0; y < textCanvas.height; y += 4) {
      for (let x = 0; x < textCanvas.width; x += 4) {
        const idx = (y * textCanvas.width + x) * 4 + 3;
        if (image[idx] > 60) {
          points.push({ x, y });
        }
      }
    }

    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);
    const baseColor = new THREE.Color(hexColor);
    const scale = 0.008;

    for (let i = 0; i < points.length; i++) {
      const px = (points[i].x - textCanvas.width / 2) * scale;
      const py = (textCanvas.height / 2 - points[i].y) * scale;
      const pz = (Math.random() - 0.5) * 0.2;
      const glow = 1 + Math.random() * 0.5;
      positions[i * 3] = px;
      positions[i * 3 + 1] = py;
      positions[i * 3 + 2] = pz;
      colors[i * 3] = baseColor.r * glow;
      colors[i * 3 + 1] = baseColor.g * glow;
      colors[i * 3 + 2] = baseColor.b * glow;
    }

    if (textPoints) {
      textPoints.geometry.dispose();
      textGroup.remove(textPoints);
    }

    const textGeometry = new THREE.BufferGeometry();
    textGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    textGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    textPoints = new THREE.Points(textGeometry, textMaterial);
    textGroup.add(textPoints);
  }

  function updateGlyph(label) {
    const glyph = glyphMap[label] || glyphMap.searching;
    if (glyph === currentGlyph) return;
    currentGlyph = glyph;
    const color = glyphColors[label] ?? glyphColors.searching;
    buildTextPoints(glyph, color);
    if (glyphEl) {
      glyphEl.textContent = glyph;
    }
  }

  function updateText({ time, state, smoothedAttractor, gestureEnergy, gesturePulse }) {
    const textTargetOpacity = state.hasHand ? 0.95 : 0.4;
    const searchingDim = state.gesture === "searching" ? 0.4 : 1;
    textMaterial.opacity = THREE.MathUtils.lerp(textMaterial.opacity, textTargetOpacity * searchingDim, 0.08);
    textAnchor.copy(smoothedAttractor).add(textOffset);
    textAnchor.y += Math.sin(time * 1.2) * 0.08;
    textGroup.position.lerp(textAnchor, 0.15);
    textGroup.rotation.y = Math.sin(time * 0.2) * 0.4;
    textGroup.rotation.z = Math.cos(time * 0.16) * 0.2;
    const textScaleBoost = state.gesture === "pinch" ? -0.1 : state.gesture === "love" ? 0.12 : state.gesture === "ok" ? 0.05 : 0;
    textGroup.scale.setScalar(0.6 + gestureEnergy * 0.08 + gesturePulse * 0.25 + textScaleBoost);
  }

  textGroup.scale.setScalar(0.6);

  return {
    textMaterial,
    updateGlyph,
    updateText,
  };
}
