export function createTextSystem({ particleCount, baseTargets, world }) {
  const textCache = new Map();

  function makeTextPoints(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 1700;
    canvas.height = 540;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 190px Orbitron, monospace";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const points = [];
    const step = 1;
    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const idx = (y * canvas.width + x) * 4 + 3;
        if (image.data[idx] > 30) {
          points.push({
            x: x - canvas.width / 2,
            y: canvas.height / 2 - y,
          });
        }
      }
    }
    return { points, width: canvas.width, height: canvas.height };
  }

  function getTextData(text) {
    if (!textCache.has(text)) {
      textCache.set(text, makeTextPoints(text));
    }
    return textCache.get(text);
  }

  function fillTargetsFromPoints(text) {
    const data = getTextData(text);
    const scale = Math.min(world.width / data.width, world.height / data.height) * 1.1;
    const jitter = 2.4;
    const count = data.points.length;
    for (let i = 0; i < particleCount; i += 1) {
      const p = data.points[(i * 7) % count];
      baseTargets[i * 3] = p.x * scale + (Math.random() - 0.5) * jitter;
      baseTargets[i * 3 + 1] = p.y * scale * 1.35 + (Math.random() - 0.5) * jitter;
      baseTargets[i * 3 + 2] = 0;
    }
  }

  return {
    fillTargetsFromPoints,
  };
}
