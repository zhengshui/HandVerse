export function createSimulation({
  THREE,
  config,
  sceneData,
  textSystem,
  handState,
  world,
  hudFps,
  flashEl,
  currentTextRef,
}) {
  const {
    PARTICLE_COUNT,
    PARTICLE_SIZE,
    LERP_FACTOR,
    DAMPING,
    SCATTER_RADIUS,
    SCATTER_FORCE,
    PINCH_FORCE,
    OPEN_BURST_RADIUS,
    OPEN_BURST_FORCE,
    PULL_RADIUS,
    PULL_FORCE,
    SWIRL_FORCE,
    SHOCKWAVE_FORCE,
    FIST_BURST_FORCE,
    BURST_RADIUS_SCALE,
    BURST_DURATION,
    BURST_PULSE_FORCE,
    BURST_SWIRL_FORCE,
    SPHERE_DEPTH_FAR,
    SPHERE_DEPTH_NEAR,
    SPHERE_MAX_SCREEN_RATIO,
    SPHERE_MIN_SCREEN_RATIO,
    SPHERE_RADIUS_LERP,
    Mode,
    TEXT_CONFIGS,
    SNOW_SPEED,
    SNOW_SWAY,
    SNOW_DRIFT,
  } = config;

  const { scene, camera, renderer, geometry, material } = sceneData;
  const { positions, velocities, baseTargets, sphereTargets, colors, sizes, boosts, snowOffsets, seeds } =
    sceneData.arrays;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const sphereBaseColor = new THREE.Color(0xffd000);
  const sphereBaseR = sphereBaseColor.r;
  const sphereBaseG = sphereBaseColor.g;
  const sphereBaseB = sphereBaseColor.b;
  const sphereLightX = 0.32;
  const sphereLightY = 0.18;
  const sphereLightZ = 0.93;

  const ribbonSegments = 360;
  function createRibbon(lineOpacity, glowOpacity, pointSize) {
    const positions = new Float32Array(ribbonSegments * 3);
    const colors = new Float32Array(ribbonSegments * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const ribbonMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: lineOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const line = new THREE.LineLoop(geometry, ribbonMaterial);
    line.visible = false;
    line.renderOrder = 2;
    scene.add(line);

    const glowMaterial = new THREE.PointsMaterial({
      size: pointSize,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: glowOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const glow = new THREE.Points(geometry, glowMaterial);
    glow.visible = false;
    glow.renderOrder = 2;
    scene.add(glow);
    return { positions, colors, geometry, line, glow };
  }

  const ribbonA = createRibbon(0.9, 0.85, 8);
  const ribbonB = createRibbon(0.85, 0.75, 7);
  const ribbonC = createRibbon(0.8, 0.7, 6.5);
  const ribbonPurple = new THREE.Color(0xb400ff);
  const ribbonBlue = new THREE.Color(0x00a8ff);
  const ribbonGreen = new THREE.Color(0x00ff6a);

  const burstPalette = [
    new THREE.Color(0xffe34d),
    new THREE.Color(0x35ff9a),
    new THREE.Color(0x36b4ff),
    new THREE.Color(0xb400ff),
    new THREE.Color(0xff4fd8),
  ].map((color) => [color.r, color.g, color.b]);

  const sparkCount = 1400;
  const sparkPositions = new Float32Array(sparkCount * 3);
  const sparkVelocities = new Float32Array(sparkCount * 3);
  const sparkColors = new Float32Array(sparkCount * 3);
  const sparkBaseColors = new Float32Array(sparkCount * 3);
  const sparkSizes = new Float32Array(sparkCount);
  const sparkAlphas = new Float32Array(sparkCount);
  const sparkSeeds = new Float32Array(sparkCount);
  for (let i = 0; i < sparkCount; i += 1) {
    sparkSeeds[i] = Math.random();
    sparkSizes[i] = 4.2 + sparkSeeds[i] * 6.5;
    sparkAlphas[i] = 0;
  }

  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  sparkGeometry.setAttribute("color", new THREE.BufferAttribute(sparkColors, 3));
  sparkGeometry.setAttribute("size", new THREE.BufferAttribute(sparkSizes, 1));
  sparkGeometry.setAttribute("alpha", new THREE.BufferAttribute(sparkAlphas, 1));

  const sparkMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: `
      attribute float size;
      attribute float alpha;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vAlpha = alpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = size * uPixelRatio * (220.0 / -mvPosition.z);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float dist = length(uv);
        float core = smoothstep(0.28, 0.0, dist);
        float glow = smoothstep(0.75, 0.08, dist);
        float alpha = max(core, glow * 0.75) * vAlpha;
        vec3 color = vColor * (0.7 + glow * 0.9);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  const sparkPoints = new THREE.Points(sparkGeometry, sparkMaterial);
  sparkPoints.visible = false;
  sparkPoints.renderOrder = 3;
  scene.add(sparkPoints);

  let sparkActive = false;
  let sparkStart = 0;
  let sparkLastUpdate = performance.now();

  let currentMode = Mode.NEBULA;
  let currentText = currentTextRef?.value || TEXT_CONFIGS[0];
  let nebulaTargets = new Float32Array(PARTICLE_COUNT * 3);
  let ultimateActive = false;
  let ultimateStart = 0;
  let sphereRadius = 1;
  let sphereRadiusTarget = 1;
  let sphereMinRadius = 1;
  let sphereMaxRadius = 1;
  let sphereSeams = new Float32Array(PARTICLE_COUNT);
  let leftBurstUntil = 0;
  let burstActive = false;
  let prevLeftBurst = false;
  let burstStart = 0;
  let burstOrigin = { x: 0, y: 0 };

  function updateWorld() {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const height = 2 * Math.tan(vFov / 2) * camera.position.z;
    const width = height * camera.aspect;
    world.width = width;
    world.height = height;
  }

  function updateSphereRadiusRange() {
    sphereMinRadius = world.height * SPHERE_MIN_SCREEN_RATIO * 0.5;
    sphereMaxRadius = world.height * SPHERE_MAX_SCREEN_RATIO * 0.5;
    sphereRadius = clamp(sphereRadius, sphereMinRadius, sphereMaxRadius);
    sphereRadiusTarget = clamp(sphereRadiusTarget, sphereMinRadius, sphereMaxRadius);
  }

  function updateSphereRadiusFromHand() {
    if (typeof handState.leftPalmDepth === "number") {
      const depthT = clamp(
        (handState.leftPalmDepth - SPHERE_DEPTH_NEAR) / (SPHERE_DEPTH_FAR - SPHERE_DEPTH_NEAR),
        0,
        1
      );
      sphereRadiusTarget = sphereMinRadius + depthT * (sphereMaxRadius - sphereMinRadius);
    } else {
      sphereRadiusTarget = (sphereMinRadius + sphereMaxRadius) * 0.5;
    }
    sphereRadius += (sphereRadiusTarget - sphereRadius) * SPHERE_RADIUS_LERP;
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    sparkMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    updateWorld();
    updateSphereRadiusRange();
    buildNebulaTargets();
    buildSphereTargets();
    if (currentMode === Mode.NEBULA) {
      applyNebulaTargets();
    } else if (currentMode === Mode.TEXT) {
      textSystem.fillTargetsFromPoints(currentText.text);
    }
  }

  function buildNebulaTargets() {
    nebulaTargets = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      nebulaTargets[i * 3] = (Math.random() - 0.5) * world.width;
      nebulaTargets[i * 3 + 1] = (Math.random() - 0.5) * world.height;
      nebulaTargets[i * 3 + 2] = 0;
      snowOffsets[i] = Math.random() * world.height;
    }
  }

  function setColors(hex, boost = 1) {
    const color = new THREE.Color(hex);
    const r = Math.min(1, color.r * boost);
    const g = Math.min(1, color.g * boost);
    const b = Math.min(1, color.b * boost);
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    geometry.attributes.color.needsUpdate = true;
  }

  function applyNebulaColors() {
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const shade = 0.96 + seeds[i] * 0.04;
      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade;
      colors[i * 3 + 2] = shade;
    }
    geometry.attributes.color.needsUpdate = true;
  }

  function applyBurstProfile() {
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const palette = burstPalette[Math.floor(seeds[i] * burstPalette.length)];
      const flare = 1.1 + seeds[i] * 0.9;
      colors[i * 3] = Math.min(1, palette[0] * flare);
      colors[i * 3 + 1] = Math.min(1, palette[1] * flare);
      colors[i * 3 + 2] = Math.min(1, palette[2] * flare);
      sizes[i] = 6.2 + seeds[i] * 4.6;
      boosts[i] = 4.8 + seeds[i] * 0.6;
    }
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.size.needsUpdate = true;
    geometry.attributes.boost.needsUpdate = true;
  }

  function applySizeProfile(mode) {
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      let size = PARTICLE_SIZE;
      let boost = 1;
      if (mode === Mode.NEBULA) {
        const large = seeds[i] > 0.92;
        size = large ? 5.2 + seeds[i] * 1.6 : 2.2 + seeds[i] * 1.1;
        boost = 1.8;
      } else if (mode === Mode.SPHERE) {
        size = 3.8 + seeds[i] * 1.4;
        boost = 3.6;
      } else {
        size = 4.2 + seeds[i] * 1.6;
        boost = 4.0;
      }
      sizes[i] = size;
      boosts[i] = boost;
    }
    geometry.attributes.size.needsUpdate = true;
    geometry.attributes.boost.needsUpdate = true;
  }

  function buildSphereTargets() {
    sphereSeams = new Float32Array(PARTICLE_COUNT);
    const offset = 2 / PARTICLE_COUNT;
    const increment = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const y = i * offset - 1 + offset / 2;
      const r = Math.sqrt(1 - y * y);
      const phi = i * increment;
      const x = Math.cos(phi) * r;
      const z = Math.sin(phi) * r;
      sphereTargets[i * 3] = x;
      sphereTargets[i * 3 + 1] = y;
      sphereTargets[i * 3 + 2] = z;
      const theta = Math.atan2(z, x);
      const seamA = Math.abs(y) < 0.08;
      const seamB = Math.abs(Math.sin(theta * 2)) < 0.2;
      sphereSeams[i] = seamA || seamB ? 1 : 0;
    }
  }

  function applySphereColors() {
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      if (sphereSeams[i]) {
        colors[i * 3] = 0.1;
        colors[i * 3 + 1] = 0.1;
        colors[i * 3 + 2] = 0.1;
      } else {
        colors[i * 3] = Math.min(1, sphereBaseR * 1.6);
        colors[i * 3 + 1] = Math.min(1, sphereBaseG * 1.6);
        colors[i * 3 + 2] = Math.min(1, sphereBaseB * 1.6);
      }
    }
    geometry.attributes.color.needsUpdate = true;
  }

  function spawnSparks(origin, now) {
    sparkActive = true;
    sparkStart = now;
    sparkLastUpdate = now;
    sparkPoints.visible = true;
    const spread = Math.max(8, sphereRadius * 0.12);
    const baseSpeed = Math.max(160, sphereRadius * 1.4);
    const liftBoost = Math.max(60, sphereRadius * 0.6);
    for (let i = 0; i < sparkCount; i += 1) {
      const idx = i * 3;
      sparkSeeds[i] = Math.random();
      const palette = burstPalette[Math.floor(Math.random() * burstPalette.length)];
      sparkBaseColors[idx] = palette[0];
      sparkBaseColors[idx + 1] = palette[1];
      sparkBaseColors[idx + 2] = palette[2];
      sparkSizes[i] = 4 + Math.random() * 7.5;
      sparkAlphas[i] = 1;

      sparkPositions[idx] = origin.x + (Math.random() - 0.5) * spread;
      sparkPositions[idx + 1] = origin.y + (Math.random() - 0.5) * spread;
      sparkPositions[idx + 2] = (Math.random() - 0.5) * spread * 0.6;

      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const z = v * 2 - 1;
      const root = Math.sqrt(1 - z * z);
      const dx = root * Math.cos(theta);
      const dy = root * Math.sin(theta);
      const dz = z;
      const speed = baseSpeed * (0.6 + Math.random() * 0.7);

      sparkVelocities[idx] = dx * speed;
      sparkVelocities[idx + 1] = dy * speed + liftBoost;
      sparkVelocities[idx + 2] = dz * speed;
    }
    sparkGeometry.attributes.position.needsUpdate = true;
    sparkGeometry.attributes.color.needsUpdate = true;
    sparkGeometry.attributes.size.needsUpdate = true;
    sparkGeometry.attributes.alpha.needsUpdate = true;
  }

  function updateSparks(time, now) {
    if (!sparkActive) {
      sparkPoints.visible = false;
      sparkLastUpdate = now;
      return;
    }
    const elapsed = now - sparkStart;
    const life = 1 - elapsed / BURST_DURATION;
    if (life <= 0) {
      sparkActive = false;
      sparkPoints.visible = false;
      sparkLastUpdate = now;
      return;
    }
    const dt = Math.min((now - sparkLastUpdate) / 1000, 0.05);
    sparkLastUpdate = now;
    const fadeBase = life * life;
    const drag = 0.92;
    for (let i = 0; i < sparkCount; i += 1) {
      const idx = i * 3;
      const seed = sparkSeeds[i];
      let vx = sparkVelocities[idx];
      let vy = sparkVelocities[idx + 1];
      let vz = sparkVelocities[idx + 2];
      const swirl = (seed - 0.5) * 28;

      vx += Math.sin(time * 3 + seed * 6) * swirl * dt;
      vz += Math.cos(time * 2.6 + seed * 5) * swirl * dt;
      vy += (18 + seed * 14) * dt;

      sparkPositions[idx] += vx * dt;
      sparkPositions[idx + 1] += vy * dt;
      sparkPositions[idx + 2] += vz * dt;

      vx *= drag;
      vy *= drag;
      vz *= drag;
      sparkVelocities[idx] = vx;
      sparkVelocities[idx + 1] = vy;
      sparkVelocities[idx + 2] = vz;

      const twinkle = 0.65 + 0.35 * Math.sin(time * 10 + seed * 12);
      const fade = fadeBase * (0.45 + seed * 0.55);
      const colorScale = Math.min(1.6, 0.6 + fadeBase * 0.8 + twinkle * 0.3);
      sparkAlphas[i] = fade;
      sparkColors[idx] = sparkBaseColors[idx] * colorScale;
      sparkColors[idx + 1] = sparkBaseColors[idx + 1] * colorScale;
      sparkColors[idx + 2] = sparkBaseColors[idx + 2] * colorScale;
    }
    sparkGeometry.attributes.position.needsUpdate = true;
    sparkGeometry.attributes.color.needsUpdate = true;
    sparkGeometry.attributes.alpha.needsUpdate = true;
  }

  function updateRibbon(time) {
    ribbonA.line.visible = true;
    ribbonA.glow.visible = true;
    ribbonB.line.visible = true;
    ribbonB.glow.visible = true;
    ribbonC.line.visible = true;
    ribbonC.glow.visible = true;

    const baseRadius = sphereRadius * 1.2;
    const phaseA = time * 2.6;
    const phaseB = -time * 2.1 + Math.PI * 0.35;
    const phaseC = time * 1.7 + Math.PI * 0.8;
    const tiltX = Math.sin(time * 0.55) * 0.45;
    const tiltZ = Math.cos(time * 0.35) * 0.35;
    const cosX = Math.cos(tiltX);
    const sinX = Math.sin(tiltX);
    const cosZ = Math.cos(tiltZ);
    const sinZ = Math.sin(tiltZ);

    for (let i = 0; i < ribbonSegments; i += 1) {
      const t = i / ribbonSegments;
      const angle = t * Math.PI * 2;

      const waveA = Math.sin(angle * 4 - time * 3.4) * (sphereRadius * 0.12);
      const liftA = Math.cos(angle * 2 + time * 1.8) * (sphereRadius * 0.3);
      const radiusA = baseRadius + waveA;
      let ax = Math.cos(angle + phaseA) * radiusA;
      let az = Math.sin(angle + phaseA) * radiusA;
      let ay = liftA;

      let ary = ay * cosX - az * sinX;
      let arz = ay * sinX + az * cosX;
      let arx = ax * cosZ - ary * sinZ;
      ary = ax * sinZ + ary * cosZ;
      ax = arx;
      ay = ary;
      az = arz;

      const idx = i * 3;
      ribbonA.positions[idx] = handState.leftPalmWorld.x + ax;
      ribbonA.positions[idx + 1] = handState.leftPalmWorld.y + ay;
      ribbonA.positions[idx + 2] = az;

      const pulseA = 2.4 + 0.6 * Math.sin(angle * 3 + time * 2.4);
      ribbonA.colors[idx] = ribbonPurple.r * pulseA;
      ribbonA.colors[idx + 1] = ribbonPurple.g * pulseA;
      ribbonA.colors[idx + 2] = ribbonPurple.b * pulseA;

      const waveB = Math.sin(angle * 5 + time * 2.6) * (sphereRadius * 0.09);
      const liftB = Math.cos(angle * 3 - time * 1.6) * (sphereRadius * 0.22);
      const radiusB = baseRadius * 0.92 + waveB;
      let bx = Math.cos(angle + phaseB) * radiusB;
      let bz = Math.sin(angle + phaseB) * radiusB;
      let by = liftB;

      let bry = by * cosX - bz * sinX;
      let brz = by * sinX + bz * cosX;
      let brx = bx * cosZ - bry * sinZ;
      bry = bx * sinZ + bry * cosZ;
      bx = brx;
      by = bry;
      bz = brz;

      ribbonB.positions[idx] = handState.leftPalmWorld.x + bx;
      ribbonB.positions[idx + 1] = handState.leftPalmWorld.y + by;
      ribbonB.positions[idx + 2] = bz;

      const pulseB = 2.2 + 0.6 * Math.sin(angle * 4 - time * 2.0);
      ribbonB.colors[idx] = ribbonBlue.r * pulseB;
      ribbonB.colors[idx + 1] = ribbonBlue.g * pulseB;
      ribbonB.colors[idx + 2] = ribbonBlue.b * pulseB;

      const waveC = Math.sin(angle * 6 + time * 2.2) * (sphereRadius * 0.08);
      const liftC = Math.sin(angle * 3 + time * 1.4) * (sphereRadius * 0.26);
      const radiusC = baseRadius * 1.05 + waveC;
      let cx = Math.cos(angle + phaseC) * radiusC;
      let cz = Math.sin(angle + phaseC) * radiusC;
      let cy = liftC;

      let cry = cy * cosX - cz * sinX;
      let crz = cy * sinX + cz * cosX;
      let crx = cx * cosZ - cry * sinZ;
      cry = cx * sinZ + cry * cosZ;
      cx = crx;
      cy = cry;
      cz = crz;

      ribbonC.positions[idx] = handState.leftPalmWorld.x + cx;
      ribbonC.positions[idx + 1] = handState.leftPalmWorld.y + cy;
      ribbonC.positions[idx + 2] = cz;

      const pulseC = 2.1 + 0.55 * Math.sin(angle * 5 + time * 2.2);
      ribbonC.colors[idx] = ribbonGreen.r * pulseC;
      ribbonC.colors[idx + 1] = ribbonGreen.g * pulseC;
      ribbonC.colors[idx + 2] = ribbonGreen.b * pulseC;
    }
    ribbonA.geometry.attributes.position.needsUpdate = true;
    ribbonA.geometry.attributes.color.needsUpdate = true;
    ribbonB.geometry.attributes.position.needsUpdate = true;
    ribbonB.geometry.attributes.color.needsUpdate = true;
    ribbonC.geometry.attributes.position.needsUpdate = true;
    ribbonC.geometry.attributes.color.needsUpdate = true;
  }

  function applyNebulaTargets() {
    baseTargets.set(nebulaTargets);
    applyNebulaColors();
    applySizeProfile(Mode.NEBULA);
  }

  function startBurst(now) {
    burstActive = true;
    burstStart = now;
    leftBurstUntil = now + BURST_DURATION;
    burstOrigin = { x: handState.leftPalmWorld.x, y: handState.leftPalmWorld.y };
    applyBurstProfile();
    spawnSparks(burstOrigin, now);
  }

  function startUltimate() {
    ultimateActive = true;
    ultimateStart = performance.now();
    if (flashEl) {
      flashEl.style.opacity = "0.6";
      setTimeout(() => {
        flashEl.style.opacity = "0";
      }, 260);
    }
    applySphereColors();
  }

  function stopUltimate() {
    ultimateActive = false;
    setColors(currentText.color, 4.0);
  }

  function updateModeFromHands(now) {
    const leftConfig = handState.leftConfig;
    if (leftConfig && currentText.text !== leftConfig.text) {
      currentText = leftConfig;
      if (currentTextRef) {
        currentTextRef.value = currentText;
      }
      if (currentMode === Mode.TEXT) {
        textSystem.fillTargetsFromPoints(currentText.text);
      }
      setColors(currentText.color, 4.0);
    }

    const leftBurst = handState.leftBurst;
    if (leftBurst) {
      if (!prevLeftBurst) {
        startBurst(now);
      }
      applyBurstProfile();
      prevLeftBurst = leftBurst;
      return;
    } else if (handState.leftOpen) {
      if (currentMode !== Mode.SPHERE) {
        currentMode = Mode.SPHERE;
        applySphereColors();
        applySizeProfile(Mode.SPHERE);
      }
    } else if (leftConfig) {
      if (currentMode !== Mode.TEXT) {
        currentMode = Mode.TEXT;
        textSystem.fillTargetsFromPoints(currentText.text);
        setColors(currentText.color, 4.0);
        applySizeProfile(Mode.TEXT);
      }
    } else if (handState.rightOpen) {
      if (currentMode !== Mode.NEBULA) {
        currentMode = Mode.NEBULA;
        applyNebulaTargets();
      }
    } else if (currentMode !== Mode.NEBULA) {
      currentMode = Mode.NEBULA;
      applyNebulaTargets();
    }

    prevLeftBurst = leftBurst;
  }

  function animate(now) {
    requestAnimationFrame(animate);
    const time = now * 0.001;

    updateModeFromHands(now);
    if (currentMode === Mode.SPHERE) {
      updateSphereRadiusFromHand();
    }

    if (burstActive && now > leftBurstUntil) {
      burstActive = false;
      leftBurstUntil = 0;
      if (currentMode === Mode.SPHERE) {
        applySphereColors();
        applySizeProfile(Mode.SPHERE);
      } else if (currentMode === Mode.TEXT) {
        setColors(currentText.color, 4.0);
        applySizeProfile(Mode.TEXT);
      } else {
        applyNebulaColors();
        applySizeProfile(Mode.NEBULA);
      }
    }

    const burstActiveNow = leftBurstUntil && now < leftBurstUntil;
    const burstProgress = burstActiveNow ? Math.min((now - burstStart) / BURST_DURATION, 1) : 0;
    const burstEnvelope = burstActiveNow ? Math.cos(burstProgress * Math.PI * 0.5) : 0;
    const burstRadius = burstActiveNow ? Math.max(1, Math.min(world.width, world.height) * BURST_RADIUS_SCALE) : 1;
    const burstCenter = burstActiveNow ? burstOrigin : handState.leftPalmWorld;
    const burstDamping = burstActiveNow ? Math.min(0.9, DAMPING + 0.08) : DAMPING;

    if (currentMode === Mode.SPHERE) {
      updateRibbon(time);
    } else if (ribbonA.line.visible || ribbonB.line.visible || ribbonC.line.visible) {
      ribbonA.line.visible = false;
      ribbonA.glow.visible = false;
      ribbonB.line.visible = false;
      ribbonB.glow.visible = false;
      ribbonC.line.visible = false;
      ribbonC.glow.visible = false;
    }

    updateSparks(time, now);

    const updateSphereColors = currentMode === Mode.SPHERE;
    let sphereCosY = 1;
    let sphereSinY = 0;
    let sphereCosX = 1;
    let sphereSinX = 0;
    let sphereCosZ = 1;
    let sphereSinZ = 0;
    let sphereRadiusScaled = sphereRadius;
    if (updateSphereColors) {
      const rotY = time * 3.5;
      const rotX = time * 2.0;
      const rotZ = time * 1.1;
      sphereCosY = Math.cos(rotY);
      sphereSinY = Math.sin(rotY);
      sphereCosX = Math.cos(rotX);
      sphereSinX = Math.sin(rotX);
      sphereCosZ = Math.cos(rotZ);
      sphereSinZ = Math.sin(rotZ);
      const burstExpand = burstActiveNow ? 1 + burstEnvelope * 1.8 : 1;
      sphereRadiusScaled = sphereRadius * burstExpand;
    }

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const idx = i * 3;
      let tx = baseTargets[idx];
      let ty = baseTargets[idx + 1];
      let tz = baseTargets[idx + 2];

      if (currentMode === Mode.NEBULA) {
        const fallSpeed = SNOW_SPEED * (0.55 + seeds[i] * 0.9);
        const fall = (time * fallSpeed + snowOffsets[i]) % world.height;
        ty = world.height * 0.5 - fall;
        const sway = Math.sin(time * (0.8 + seeds[i] * 0.7) + seeds[i] * 9) * SNOW_SWAY;
        const drift = Math.cos(time * 0.6 + seeds[i] * 5) * (SNOW_SWAY * 0.35);
        tx = baseTargets[idx] + sway + drift;
        tz = Math.sin(time * 0.5 + seeds[i] * 7) * SNOW_DRIFT;
        ty += Math.sin(time * 1.6 + seeds[i] * 6) * 4.5;
      }

      if (currentMode === Mode.NEBULA && handState.rightIndexWorld) {
        const dx = tx - handState.rightIndexWorld.x;
        const dy = ty - handState.rightIndexWorld.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
        const falloff = Math.exp(-dist * 0.015);
        let waveAmp = 10;
        let waveSpeed = 9;
        let swirlStrength = 0;
        if (handState.rightGesture === "DUO") {
          waveAmp = -14;
        } else if (handState.rightGesture === "PINCH") {
          waveAmp = 22;
        } else if (handState.rightGesture === "QUAD") {
          waveAmp = 18;
        } else if (handState.rightGesture === "TRI") {
          waveAmp = 6;
          swirlStrength = 26;
        }
        const wave = Math.sin(dist * 0.08 - time * waveSpeed) * waveAmp;
        tx += (dx / dist) * wave * falloff;
        ty += (dy / dist) * wave * falloff;
        if (swirlStrength) {
          const swirl = swirlStrength * falloff;
          tx += (-dy / dist) * swirl;
          ty += (dx / dist) * swirl;
        }
      }

      if (currentMode === Mode.ATTRACT) {
        tx = handState.leftPalmWorld.x;
        ty = handState.leftPalmWorld.y + Math.sin(time * 12 + seeds[i] * 10) * 14;
        tz = 0;
      }

      if (currentMode === Mode.SPHERE) {
        const bx = sphereTargets[idx];
        const by = sphereTargets[idx + 1];
        const bz = sphereTargets[idx + 2];
        let rx = bx * sphereCosY + bz * sphereSinY;
        let rz = -bx * sphereSinY + bz * sphereCosY;
        let ry = by * sphereCosX - rz * sphereSinX;
        rz = by * sphereSinX + rz * sphereCosX;
        const rrx = rx * sphereCosZ - ry * sphereSinZ;
        const rry = rx * sphereSinZ + ry * sphereCosZ;
        rx = rrx;
        ry = rry;
        tx = burstCenter.x + rx * sphereRadiusScaled;
        ty = burstCenter.y + ry * sphereRadiusScaled;
        tz = rz * sphereRadiusScaled;

        if (updateSphereColors) {
          const ndotl = Math.max(0, rx * sphereLightX + ry * sphereLightY + rz * sphereLightZ);
          const rim = 1 - Math.abs(rz);
          const intensity = Math.min(1, 0.45 + ndotl * 0.65 + rim * rim * 0.35);
          if (sphereSeams[i]) {
            const seam = 0.08 + rim * 0.08;
            colors[idx] = seam;
            colors[idx + 1] = seam;
            colors[idx + 2] = seam;
          } else {
            colors[idx] = Math.min(1, sphereBaseR * intensity);
            colors[idx + 1] = Math.min(1, sphereBaseG * intensity);
            colors[idx + 2] = Math.min(1, sphereBaseB * intensity);
          }
        }
      }

      if (burstActiveNow && currentMode !== Mode.SPHERE) {
        tx = positions[idx];
        ty = positions[idx + 1];
        tz = positions[idx + 2];
      }

      const vxIdx = idx;
      let vx = velocities[vxIdx];
      let vy = velocities[vxIdx + 1];
      let vz = velocities[vxIdx + 2];

      vx += (tx - positions[idx]) * LERP_FACTOR;
      vy += (ty - positions[idx + 1]) * LERP_FACTOR;
      vz += (tz - positions[idx + 2]) * LERP_FACTOR;

      if (currentMode === Mode.SPHERE && handState.rightPinch) {
        const dx = positions[idx] - handState.leftPalmWorld.x;
        const dy = positions[idx + 1] - handState.leftPalmWorld.y;
        const dz = positions[idx + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
        const burst = (1 - Math.min(dist / (sphereRadius * 2.2), 1)) * PINCH_FORCE;
        vx += (dx / dist) * burst;
        vy += (dy / dist) * burst;
        vz += (dz / dist) * burst;
      }

      if (burstActiveNow) {
        const dx = positions[idx] - burstCenter.x;
        const dy = positions[idx + 1] - burstCenter.y;
        const dz = positions[idx + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
        const falloff = Math.max(0, 1 - dist / burstRadius);
        const baseBurst = FIST_BURST_FORCE * (0.45 + burstEnvelope * 0.55);
        const pulseBurst = BURST_PULSE_FORCE * burstEnvelope;
        const burst = falloff * (baseBurst + pulseBurst);
        vx += (dx / dist) * burst;
        vy += (dy / dist) * burst;
        vz += (dz / dist) * burst;
        const swirl = BURST_SWIRL_FORCE * falloff * burstEnvelope;
        vx += (-dy / dist) * swirl;
        vy += (dx / dist) * swirl;
      }

      if (currentMode === Mode.TEXT && handState.rightIndexWorld) {
        const dx = positions[idx] - handState.rightIndexWorld.x;
        const dy = positions[idx + 1] - handState.rightIndexWorld.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
        if (handState.rightGesture === "OPEN") {
          const origin = handState.rightPalmWorld || handState.rightIndexWorld;
          const odx = positions[idx] - origin.x;
          const ody = positions[idx + 1] - origin.y;
          const odist = Math.sqrt(odx * odx + ody * ody) + 0.001;
          if (odist < OPEN_BURST_RADIUS) {
            const force = (1 - odist / OPEN_BURST_RADIUS) * OPEN_BURST_FORCE;
            vx += (odx / odist) * force;
            vy += (ody / odist) * force;
          }
        } else if (handState.rightGesture === "DUO") {
          if (dist < PULL_RADIUS) {
            const force = (1 - dist / PULL_RADIUS) * PULL_FORCE;
            vx -= (dx / dist) * force;
            vy -= (dy / dist) * force;
          }
        } else if (handState.rightGesture === "TRI") {
          if (dist < PULL_RADIUS) {
            const force = (1 - dist / PULL_RADIUS) * SWIRL_FORCE;
            vx += (-dy / dist) * force;
            vy += (dx / dist) * force;
          }
        } else if (handState.rightGesture === "QUAD") {
          if (dist < PULL_RADIUS) {
            const wave = Math.sin(time * 9 - dist * 0.12) * SHOCKWAVE_FORCE * (1 - dist / PULL_RADIUS);
            vx += (dx / dist) * wave;
            vy += (dy / dist) * wave;
          }
        } else {
          const radius = handState.rightGesture === "PINCH" ? SCATTER_RADIUS * 1.35 : SCATTER_RADIUS;
          const forceBase =
            handState.rightGesture === "PINCH"
              ? PINCH_FORCE
              : handState.rightGesture === "FIST"
                ? SCATTER_FORCE * 1.4
                : SCATTER_FORCE;
          if (dist < radius) {
            const force = (1 - dist / radius) * forceBase;
            vx += (dx / dist) * force;
            vy += (dy / dist) * force;
          }
        }
      }

      vx *= burstDamping;
      vy *= burstDamping;
      vz *= burstDamping;

      positions[idx] += vx;
      positions[idx + 1] += vy;
      positions[idx + 2] += vz;

      velocities[vxIdx] = vx;
      velocities[vxIdx + 1] = vy;
      velocities[vxIdx + 2] = vz;
    }

    geometry.attributes.position.needsUpdate = true;
    if (updateSphereColors) {
      geometry.attributes.color.needsUpdate = true;
    }
    renderer.render(scene, camera);
    updateFps(now);
  }

  let lastFpsTime = performance.now();
  let frameCount = 0;
  function updateFps(now) {
    frameCount += 1;
    const elapsed = now - lastFpsTime;
    if (elapsed > 500) {
      const fps = (frameCount * 1000) / elapsed;
      hudFps.textContent = fps.toFixed(0);
      lastFpsTime = now;
      frameCount = 0;
    }
  }

  function rebuildAll() {
    updateWorld();
    updateSphereRadiusRange();
    setColors(currentText.color, 4.0);
    buildNebulaTargets();
    buildSphereTargets();
    if (currentMode === Mode.TEXT) {
      textSystem.fillTargetsFromPoints(currentText.text);
      applySizeProfile(Mode.TEXT);
    } else if (currentMode === Mode.SPHERE) {
      applySphereColors();
      applySizeProfile(Mode.SPHERE);
    } else {
      applyNebulaTargets();
    }
  }

  return {
    resize,
    rebuildAll,
    start: () => requestAnimationFrame(animate),
  };
}
