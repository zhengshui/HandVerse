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
    Mode,
    TEXT_CONFIGS,
  } = config;

  const { scene, camera, renderer, geometry, material } = sceneData;
  const { positions, velocities, baseTargets, sphereTargets, colors, sizes, boosts, snowOffsets, seeds } =
    sceneData.arrays;

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
  const ribbonPurple = new THREE.Color(0xb400ff);
  const ribbonBlue = new THREE.Color(0x00a8ff);

  let currentMode = Mode.NEBULA;
  let currentText = currentTextRef?.value || TEXT_CONFIGS[0];
  let nebulaTargets = new Float32Array(PARTICLE_COUNT * 3);
  let ultimateActive = false;
  let ultimateStart = 0;
  let sphereRadius = 1;
  let leftBurstUntil = 0;
  let burstActive = false;
  let prevLeftBurst = false;

  function updateWorld() {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const height = 2 * Math.tan(vFov / 2) * camera.position.z;
    const width = height * camera.aspect;
    world.width = width;
    world.height = height;
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    updateWorld();
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
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
      sizes[i] = 4.6 + seeds[i] * 2.6;
      boosts[i] = 2.6;
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
    sphereRadius = Math.min(world.width, world.height) * 0.2;
    const offset = 2 / PARTICLE_COUNT;
    const increment = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const y = i * offset - 1 + offset / 2;
      const r = Math.sqrt(1 - y * y);
      const phi = i * increment;
      const x = Math.cos(phi) * r;
      const z = Math.sin(phi) * r;
      sphereTargets[i * 3] = x * sphereRadius;
      sphereTargets[i * 3 + 1] = y * sphereRadius;
      sphereTargets[i * 3 + 2] = z * sphereRadius;
    }
  }

  function applySphereColors() {
    const base = new THREE.Color(0xffd000);
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const x = sphereTargets[i * 3];
      const y = sphereTargets[i * 3 + 1];
      const z = sphereTargets[i * 3 + 2];
      const theta = Math.atan2(z, x);
      const seamA = Math.abs(y) < sphereRadius * 0.08;
      const seamB = Math.abs(Math.sin(theta * 2)) < 0.2;
      const isSeam = seamA || seamB;
      colors[i * 3] = isSeam ? 0.1 : Math.min(1, base.r * 2.0);
      colors[i * 3 + 1] = isSeam ? 0.1 : Math.min(1, base.g * 2.0);
      colors[i * 3 + 2] = isSeam ? 0.1 : Math.min(1, base.b * 2.0);
    }
    geometry.attributes.color.needsUpdate = true;
  }

  function updateRibbon(time) {
    ribbonA.line.visible = true;
    ribbonA.glow.visible = true;
    ribbonB.line.visible = true;
    ribbonB.glow.visible = true;

    const baseRadius = sphereRadius * 1.2;
    const phaseA = time * 2.6;
    const phaseB = -time * 2.1 + Math.PI * 0.35;
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
    }
    ribbonA.geometry.attributes.position.needsUpdate = true;
    ribbonA.geometry.attributes.color.needsUpdate = true;
    ribbonB.geometry.attributes.position.needsUpdate = true;
    ribbonB.geometry.attributes.color.needsUpdate = true;
  }

  function applyNebulaTargets() {
    baseTargets.set(nebulaTargets);
    applyNebulaColors();
    applySizeProfile(Mode.NEBULA);
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
        leftBurstUntil = performance.now() + 820;
        burstActive = true;
      }
      if (currentMode !== Mode.NEBULA) {
        currentMode = Mode.NEBULA;
        applyNebulaTargets();
      }
      applyBurstProfile();
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

    if (burstActive && now > leftBurstUntil) {
      burstActive = false;
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

    if (currentMode === Mode.SPHERE) {
      updateRibbon(time);
    } else if (ribbonA.line.visible || ribbonB.line.visible) {
      ribbonA.line.visible = false;
      ribbonA.glow.visible = false;
      ribbonB.line.visible = false;
      ribbonB.glow.visible = false;
    }

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const idx = i * 3;
      let tx = baseTargets[idx];
      let ty = baseTargets[idx + 1];
      let tz = baseTargets[idx + 2];

      if (currentMode === Mode.NEBULA) {
        const fall = (time * 18 + snowOffsets[i]) % world.height;
        ty = world.height * 0.5 - fall;
        tx = baseTargets[idx] + Math.sin(time * 0.6 + seeds[i] * 8) * 6;
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
        const rotY = time * 3.5;
        const rotX = time * 2.0;
        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);
        const cosX = Math.cos(rotX);
        const sinX = Math.sin(rotX);
        let rx = bx * cosY + bz * sinY;
        let rz = -bx * sinY + bz * cosY;
        let ry = by * cosX - rz * sinX;
        rz = by * sinX + rz * cosX;
        tx = handState.leftPalmWorld.x + rx;
        ty = handState.leftPalmWorld.y + ry;
        tz = rz;
      }

      if (leftBurstUntil && now < leftBurstUntil) {
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

      if (leftBurstUntil && now < leftBurstUntil) {
        const dx = positions[idx] - handState.leftPalmWorld.x;
        const dy = positions[idx + 1] - handState.leftPalmWorld.y;
        const dz = positions[idx + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
        const burstRadius = Math.max(1, Math.min(world.width, world.height) * BURST_RADIUS_SCALE);
        const burst = (1 - Math.min(dist / burstRadius, 1)) * FIST_BURST_FORCE;
        vx += (dx / dist) * burst;
        vy += (dy / dist) * burst;
        vz += (dz / dist) * burst;
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

      vx *= DAMPING;
      vy *= DAMPING;
      vz *= DAMPING;

      positions[idx] += vx;
      positions[idx + 1] += vy;
      positions[idx + 2] += vz;

      velocities[vxIdx] = vx;
      velocities[vxIdx + 1] = vy;
      velocities[vxIdx + 2] = vz;
    }

    geometry.attributes.position.needsUpdate = true;
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
