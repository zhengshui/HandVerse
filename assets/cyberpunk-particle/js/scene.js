export function createScene({ THREE, particleCount, container }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 3000);
  camera.position.z = 720;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x050507, 0);
  container.appendChild(renderer.domElement);

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);
  const baseTargets = new Float32Array(particleCount * 3);
  const sphereTargets = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const boosts = new Float32Array(particleCount);
  const snowOffsets = new Float32Array(particleCount);
  const seeds = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 400;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
    positions[i * 3 + 2] = 0;
    seeds[i] = Math.random();
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("boost", new THREE.BufferAttribute(boosts, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: `
      attribute float size;
      attribute float boost;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vBoost;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vBoost = boost;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = size * uPixelRatio * (300.0 / -mvPosition.z);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vBoost;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float dist = length(uv);
        float core = smoothstep(0.22, 0.0, dist);
        core = pow(core, 0.6);
        float glow = smoothstep(0.6, 0.08, dist);
        float alpha = max(core, glow * 0.75);
        vec3 color = vColor * vBoost;
        vec3 halo = color * 0.85;
        vec3 finalColor = color * core + halo * glow;
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  return {
    scene,
    camera,
    renderer,
    geometry,
    material,
    points,
    arrays: {
      positions,
      velocities,
      baseTargets,
      sphereTargets,
      colors,
      sizes,
      boosts,
      snowOffsets,
      seeds,
    },
  };
}
