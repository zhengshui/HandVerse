export function createParticleSystem({ THREE, particleGroup, scene, spriteTexture }) {
  const particleCount = 6500;
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const seeds = new Float32Array(particleCount);
  const origin = new Float32Array(particleCount * 3);
  const color = new THREE.Color();

  for (let i = 0; i < particleCount; i++) {
    const radius = Math.random() * 0.75;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    origin[i * 3] = x;
    origin[i * 3 + 1] = y;
    origin[i * 3 + 2] = z;
    velocities[i * 3] = (Math.random() - 0.5) * 0.02;
    velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
    seeds[i] = Math.random();
    color.setHSL(0.6 + seeds[i] * 0.2, 0.9, 0.55);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const particleMaterial = new THREE.PointsMaterial({
    size: 0.085,
    map: spriteTexture,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });

  const swarm = new THREE.Points(particleGeometry, particleMaterial);
  particleGroup.add(swarm);

  const sparkCount = 900;
  const sparkPositions = new Float32Array(sparkCount * 3);
  const sparkSeeds = new Float32Array(sparkCount);
  for (let i = 0; i < sparkCount; i++) {
    sparkSeeds[i] = Math.random();
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMaterial = new THREE.PointsMaterial({
    size: 0.035,
    map: spriteTexture,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xffffff,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  scene.add(sparks);

  const velocityNoise = new THREE.Vector3();
  let clusterScale = 1;

  function update({ time, state, smoothedAttractor, gestureEnergy, gesturePulse }) {
    let pull = 0.028;
    let swirl = 0.012;
    let damping = 0.935;
    let hueBase = 0.56;
    let paletteShift = 0;
    let scaleTarget = state.hasHand ? 0.85 : 1.2;
    let bloom = 0;
    let vortexLift = 0;
    let ringPull = 0;
    let ringRadius = 1;
    let heartPulse = 0;

    if (state.gesture === "open") {
      pull = -0.02;
      swirl = 0.022;
      hueBase = 0.18;
      paletteShift = 0.12;
      scaleTarget = 1.25;
      bloom = 0.05;
      damping = 0.93;
    } else if (state.gesture === "pinch") {
      pull = 0.14;
      swirl = 0.008;
      hueBase = 0.92;
      paletteShift = -0.08;
      scaleTarget = 0.3;
      damping = 0.91;
    } else if (state.gesture === "fist") {
      pull = -0.06;
      swirl = 0.035;
      hueBase = 0.72;
      paletteShift = 0.22;
      scaleTarget = 1.45;
      damping = 0.9;
      vortexLift = 0.05;
    } else if (state.gesture === "ok") {
      pull = 0.08;
      swirl = 0.026;
      hueBase = 0.12;
      paletteShift = 0.08;
      scaleTarget = 0.55;
      damping = 0.92;
      bloom = 0.01;
      ringPull = 0.06;
      ringRadius = 1.05;
    } else if (state.gesture === "love") {
      pull = -0.035;
      swirl = 0.02;
      hueBase = 0.94;
      paletteShift = 0.16;
      scaleTarget = 1.2;
      damping = 0.92;
      bloom = 0.08;
      vortexLift = 0.02;
      heartPulse = 0.008;
    }

    const pulseForce =
      gesturePulse *
      (state.gesture === "pinch"
        ? 0.14
        : state.gesture === "open"
          ? -0.12
          : state.gesture === "fist"
            ? -0.1
            : state.gesture === "ok"
              ? 0.09
              : state.gesture === "love"
                ? -0.12
                : -0.06);

    clusterScale = THREE.MathUtils.lerp(clusterScale, scaleTarget, 0.12);
    const influenceRadius = 1.3 * clusterScale;
    const noiseStrength = 0.004 + gestureEnergy * 0.01;
    const cohesion =
      0.012 +
      (state.gesture === "pinch"
        ? 0.014
        : state.gesture === "ok"
          ? 0.01
          : state.gesture === "love"
            ? 0.004
            : 0.006);

    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      const x = positions[idx];
      const y = positions[idx + 1];
      const z = positions[idx + 2];

      const dx = smoothedAttractor.x - x;
      const dy = smoothedAttractor.y - y;
      const dz = smoothedAttractor.z - z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.0001;
      const influence = Math.max(0, 1 - dist / influenceRadius);
      const accel = pull * influence * (state.hasHand ? 1.15 : 0.6);

      const targetX = smoothedAttractor.x + origin[idx] * clusterScale;
      const targetY = smoothedAttractor.y + origin[idx + 1] * clusterScale;
      const targetZ = smoothedAttractor.z + origin[idx + 2] * clusterScale;
      const tx = targetX - x;
      const ty = targetY - y;
      const tz = targetZ - z;
      velocities[idx] += tx * cohesion;
      velocities[idx + 1] += ty * cohesion;
      velocities[idx + 2] += tz * cohesion;

      velocities[idx] += (dx / dist) * accel;
      velocities[idx + 1] += (dy / dist) * accel;
      velocities[idx + 2] += (dz / dist) * accel;

      if (pulseForce) {
        velocities[idx] += (dx / dist) * pulseForce * influence;
        velocities[idx + 1] += (dy / dist) * pulseForce * influence;
        velocities[idx + 2] += (dz / dist) * pulseForce * influence;
      }

      if (bloom > 0) {
        velocities[idx] -= (dx / dist) * bloom * (0.4 + influence);
        velocities[idx + 1] -= (dy / dist) * bloom * (0.4 + influence);
        velocities[idx + 2] -= (dz / dist) * bloom * (0.4 + influence);
      }

      if (ringPull > 0) {
        const radial = Math.sqrt(dx * dx + dz * dz) + 0.0001;
        const ringDelta = ringRadius - radial;
        const ringForce = ringPull * ringDelta * influence;
        velocities[idx] += (dx / radial) * ringForce;
        velocities[idx + 2] += (dz / radial) * ringForce;
        velocities[idx + 1] += Math.sin(time * 2.2 + seeds[i] * 6) * ringPull * 0.12;
      }

      if (heartPulse > 0) {
        velocities[idx + 1] += Math.sin(time * 2.4 + seeds[i] * 8) * heartPulse * influence;
        velocities[idx] += Math.cos(time * 1.6 + seeds[i] * 5) * heartPulse * 0.6 * influence;
      }

      velocities[idx] += -dy * swirl * influence;
      velocities[idx + 1] += dx * swirl * influence;

      if (vortexLift > 0) {
        velocities[idx] += -dz * vortexLift * influence;
        velocities[idx + 2] += dx * vortexLift * influence;
        velocities[idx + 1] += vortexLift * (0.6 + influence);
      }

      velocityNoise.set(
        Math.sin(time + seeds[i] * 10),
        Math.cos(time * 1.2 + seeds[i] * 12),
        Math.sin(time * 0.9 + seeds[i] * 8)
      );
      velocities[idx] += velocityNoise.x * noiseStrength;
      velocities[idx + 1] += velocityNoise.y * noiseStrength;
      velocities[idx + 2] += velocityNoise.z * noiseStrength;

      velocities[idx] *= damping;
      velocities[idx + 1] *= damping;
      velocities[idx + 2] *= damping;

      positions[idx] += velocities[idx];
      positions[idx + 1] += velocities[idx + 1];
      positions[idx + 2] += velocities[idx + 2];

      const bound = 5;
      if (positions[idx] > bound || positions[idx] < -bound) velocities[idx] *= -0.6;
      if (positions[idx + 1] > bound || positions[idx + 1] < -bound) velocities[idx + 1] *= -0.6;
      if (positions[idx + 2] > bound || positions[idx + 2] < -bound) velocities[idx + 2] *= -0.6;

      const baseHue = hueBase + seeds[i] * 0.18 + gestureEnergy * 0.12 + paletteShift;
      const hue = (baseHue + (seeds[i] > 0.7 ? 0.12 : 0)) % 1;
      const saturation = Math.min(1, 0.98 + gesturePulse * 0.06);
      const lightness = Math.min(0.95, 0.5 + influence * 0.35 + gestureEnergy * 0.28 + gesturePulse * 0.25);
      color.setHSL(hue, saturation, lightness);
      colors[idx] = color.r;
      colors[idx + 1] = color.g;
      colors[idx + 2] = color.b;
    }

    particleGeometry.attributes.position.needsUpdate = true;
    particleGeometry.attributes.color.needsUpdate = true;
    const sizeBoost =
      state.gesture === "pinch"
        ? 0.02
        : state.gesture === "open"
          ? 0.03
          : state.gesture === "fist"
            ? 0.025
            : state.gesture === "ok"
              ? 0.028
              : state.gesture === "love"
                ? 0.035
                : 0.015;
    particleMaterial.size = 0.07 + gestureEnergy * 0.05 + sizeBoost + gesturePulse * 0.04;

    const sparkBase =
      state.gesture === "pinch"
        ? 0.65
        : state.gesture === "open"
          ? 1.15
          : state.gesture === "ok"
            ? 0.9
            : state.gesture === "love"
              ? 1.3
              : state.gesture === "fist"
                ? 1.55
                : 0.95;
    const sparkSpin =
      state.gesture === "fist" ? 2.4 : state.gesture === "ok" ? 2 : state.gesture === "love" ? 1.1 : 1.5;
    const sparkHeight =
      state.gesture === "fist" ? 1.2 : state.gesture === "love" ? 0.9 : state.gesture === "ok" ? 0.6 : 0.5;
    const sparkColor =
      state.gesture === "pinch"
        ? 0xff7b47
        : state.gesture === "open"
          ? 0x7cff64
          : state.gesture === "ok"
            ? 0xffd166
            : state.gesture === "love"
              ? 0xff6fb3
              : state.gesture === "fist"
                ? 0x7c5cff
                : 0x5ef6ff;
    sparkMaterial.color.setHex(sparkColor);
    sparkMaterial.size =
      0.03 + gestureEnergy * 0.03 + gesturePulse * 0.02 + (state.gesture === "love" ? 0.012 : 0);

    for (let i = 0; i < sparkCount; i++) {
      const idx = i * 3;
      const seed = sparkSeeds[i];
      if (state.gesture === "love") {
        const angle = time * 0.6 + seed * Math.PI * 2;
        const pulse = 1 + gesturePulse * 0.8;
        const heartScale = (0.055 + gestureEnergy * 0.03) * pulse;
        const sinA = Math.sin(angle);
        const hx = heartScale * 16 * sinA * sinA * sinA;
        const hz =
          heartScale *
          (13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle));
        sparkPositions[idx] = smoothedAttractor.x + hx;
        sparkPositions[idx + 2] = smoothedAttractor.z + hz;
        sparkPositions[idx + 1] =
          smoothedAttractor.y + Math.sin(time * 2.2 + seed * 6) * 0.25 + (seed - 0.5) * 0.2;
        continue;
      }
      const angle = time * (0.8 + seed * 1.6) * sparkSpin + seed * Math.PI * 2;
      const radius = sparkBase + Math.sin(time * 1.4 + seed * 6) * 0.2 + gestureEnergy * 0.4;
      const height = Math.cos(time * 1.2 + seed * 5) * 0.3 * sparkHeight;
      sparkPositions[idx] = smoothedAttractor.x + Math.cos(angle) * radius;
      sparkPositions[idx + 1] = smoothedAttractor.y + height + (state.gesture === "fist" ? (seed - 0.5) * 1.1 : 0);
      sparkPositions[idx + 2] = smoothedAttractor.z + Math.sin(angle) * radius;
    }
    sparkGeometry.attributes.position.needsUpdate = true;
  }

  return {
    particleMaterial,
    particleGeometry,
    update,
  };
}
