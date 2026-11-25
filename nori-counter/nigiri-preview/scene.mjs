import * as THREE from './vendor/three.module.js';
import { board, clamp, plate, riceTopAt, shoulderPower } from './kitchen.mjs';

const worldUp = new THREE.Vector3(0, 1, 0);
const key = new THREE.Vector3(-3.7, 7.0, 2.8);
const signedPower = (n) => Math.sign(n) * Math.abs(n) ** shoulderPower;

function material(color, properties = {}) {
  return new THREE.MeshStandardMaterial({ color, ...properties });
}

function makeMesh(geometry, surface, x, y, z, casts = true) {
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.position.set(x, y, z);
  mesh.castShadow = casts;
  mesh.receiveShadow = true;
  return mesh;
}

function box(width, thickness, depth, bevel = 0.028) {
  const hw = width / 2 - bevel;
  const hd = depth / 2 - bevel;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hd);
  shape.lineTo(hw, -hd);
  shape.lineTo(hw, hd);
  shape.lineTo(-hw, hd);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2, bevelEnabled: true, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 2, steps: 1,
  });
  const positions = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    uv.setXY(i, (positions.getX(i) + width / 2) / width, (positions.getY(i) + depth / 2) / depth);
  }
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);
  return geometry;
}

function makePlate(surface) {
  const outline = [
    [0, 0.034], [0.41, 0.034], [0.57, 0.010], [0.70, 0.013],
    [0.83, 0.055], [0.94, 0.111], [0.99, 0.165], [1, 0.200],
    [0.979, 0.225], [0.939, 0.223], [0.879, 0.186], [0.766, 0.120],
    [0.64, 0.092], [0.39, plate.floor], [0, plate.floor],
  ].map(([radius, y]) => new THREE.Vector2(radius, y));
  const geometry = new THREE.LatheGeometry(outline, 100);
  const vertices = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const z = vertices.getZ(i);
    const r = Math.hypot(x, z);
    const theta = Math.atan2(z, x);
    const ripple = r ** 2 * (0.028 * Math.sin(theta * 5 + 0.8) + 0.017 * Math.cos(theta * 9));
    vertices.setXYZ(i, x * plate.radiusX * (1 + ripple),
      vertices.getY(i) + ripple * 0.24, z * plate.radiusZ * (1 + ripple));
    uv.setXY(i, 0.5 + x * 0.49, 0.5 + z * 0.49);
  }
  geometry.computeVertexNormals();
  return makeMesh(geometry, surface, 0, 0, 0);
}

function makeContactShadow(width, depth) {
  const image = document.createElement('canvas');
  image.width = image.height = 128;
  const context = image.getContext('2d');
  const fade = context.createRadialGradient(64, 64, 11, 64, 64, 64);
  fade.addColorStop(0, '#3219079c');
  fade.addColorStop(0.53, '#3219077d');
  fade.addColorStop(0.81, '#32190721');
  fade.addColorStop(1, '#32190700');
  context.fillStyle = fade;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  const shadow = makeMesh(new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }), 0, 0.004, 0, false);
  shadow.rotation.x = -Math.PI / 2;
  return shadow;
}

function plateTopAt(x, z) {
  const radius = Math.hypot(x / plate.radiusX, z / plate.radiusZ);
  return plate.floor + 0.146 * clamp((radius - 0.64) / 0.36, 0, 1) ** 1.6;
}

function makeRice() {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(1, 36, 22);
  const positions = geometry.attributes.position;
  const original = positions.array.slice();
  const core = makeMesh(geometry, material('#ece0c5', { roughness: 0.66 }), 0, 0, 0);
  const grains = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 9, 6),
    material('#fff8e7', { roughness: 0.43, metalness: 0.02 }), 158);
  grains.receiveShadow = true;
  grains.frustumCulled = false;
  const palette = ['#f4e5c6', '#ffebce', '#f8e8c6', '#fff3da', '#e7d2af', '#efddbc'];
  const grainSpecs = [];
  for (let i = 0; i < grains.count; i++) {
    const y = 0.04 + 0.955 * (i + 0.5) / grains.count;
    const theta = i * 2.399963;
    const radial = Math.sqrt(1 - y * y);
    const x = Math.cos(theta) * radial;
    const z = Math.sin(theta) * radial;
    grainSpecs.push({
      x, y, z, angle: Math.sin(i * 83.619) * 1.17,
      length: 0.061 + (1 + Math.sin(i * 9.767)) * 0.015,
      width: 0.035 + (1 + Math.cos(i * 4.71)) * 0.006,
    });
    grains.setColorAt(i, new THREE.Color(palette[i % palette.length]));
  }
  group.add(core, grains);
  const grain = new THREE.Object3D();
  const normal = new THREE.Vector3();
  const tilt = new THREE.Quaternion();

  function update(shape) {
    const bottom = plate.floor + 0.013;
    for (let i = 0; i < positions.count; i++) {
      const x = original[i * 3], y = original[i * 3 + 1], z = original[i * 3 + 2];
      positions.setXYZ(i, shape.x + signedPower(x) * shape.radiusX,
        bottom + (y < 0 ? y * 0.024 : y * shape.height), shape.z + signedPower(z) * shape.radiusZ);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    for (const [index, spec] of grainSpecs.entries()) {
      normal.set(spec.x / shape.radiusX, Math.max(0.15, spec.y) / shape.height, spec.z / shape.radiusZ).normalize();
      grain.position.set(shape.x + signedPower(spec.x) * shape.radiusX,
        bottom + spec.y * shape.height, shape.z + signedPower(spec.z) * shape.radiusZ);
      grain.position.addScaledVector(normal, -0.008);
      grain.quaternion.setFromUnitVectors(worldUp, normal);
      grain.quaternion.multiply(tilt.setFromAxisAngle(worldUp, spec.angle));
      grain.scale.set(spec.length, spec.width * 0.76, spec.width);
      grain.updateMatrix();
      grains.setMatrixAt(index, grain.matrix);
    }
    grains.instanceMatrix.needsUpdate = true;
  }

  return { group, core, update };
}

function makePiece(surface, sample, thickness, shades) {
  const sx = 37, sz = 17, layer = sx * sz;
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array(layer * 6);
  const colors = new Float32Array(layer * 6);
  const uv = new Float32Array(layer * 4);
  const sites = [];
  const faces = [];
  const dark = new THREE.Color(shades[0]);
  const light = new THREE.Color(shades[1]);
  const hue = new THREE.Color();

  for (let j = 0; j < sz; j++) for (let i = 0; i < sx; i++) {
    const u = i / (sx - 1);
    const v = j / (sz - 1);
    const idx = i + j * sx;
    const [x, z] = sample(u, v * 2 - 1);
    const crown = (Math.sin(Math.PI * u) * Math.sin(Math.PI * v)) ** 0.56;
    sites.push({ x, z, crown });
    for (const start of [0, layer]) {
      const k = idx + start;
      uv[k * 2] = 0.09 + u * 0.82;
      uv[k * 2 + 1] = 0.11 + v * 0.78;
      hue.copy(dark).lerp(light, clamp(0.23 + 0.77 * crown + 0.07 * Math.sin(u * 35 + v * 8), 0, 1));
      hue.toArray(colors, k * 3);
    }
    if (i >= sx - 1 || j >= sz - 1) continue;
    faces.push(idx, idx + sx, idx + 1, idx + 1, idx + sx, idx + sx + 1);
    faces.push(idx + layer, idx + 1 + layer, idx + sx + layer,
      idx + 1 + layer, idx + sx + 1 + layer, idx + sx + layer);
  }
  const perimeter = [];
  for (let i = 0; i < sx; i++) perimeter.push(i);
  for (let j = 1; j < sz; j++) perimeter.push(j * sx + sx - 1);
  for (let i = sx - 2; i >= 0; i--) perimeter.push((sz - 1) * sx + i);
  for (let j = sz - 2; j > 0; j--) perimeter.push(j * sx);
  for (const [i, a] of perimeter.entries()) {
    const b = perimeter[(i + 1) % perimeter.length];
    faces.push(a, b, a + layer, b, b + layer, a + layer);
  }
  geometry.setIndex(faces);
  const positions = new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  function update(floorAt, bend) {
    for (const [i, { x, z, crown }] of sites.entries()) {
      const localRise = 0.014 + 0.046 * crown;
      const base = floorAt(x, z) + localRise * (1 - bend);
      positions.setXYZ(i, x, base + thickness * (0.32 + 0.68 * crown), z);
      positions.setXYZ(i + layer, x, base, z);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }
  return { mesh: makeMesh(geometry, surface, 0, 0, 0), update };
}

function makeTopping(recipe, surfaces) {
  const group = new THREE.Group();
  const pieces = [];
  const { x, z } = recipe.fish;
  if (recipe.id === 'chutoro') {
    pieces.push(makePiece(surfaces.tuna, (u, v) => {
      const width = 0.45 + 0.51 * Math.sin(Math.PI * u) ** 0.55 + u * 0.09;
      return [(u * 2 - 1) * x + 0.07 * v, z * width * v + 0.055 * Math.sin(u * 4.2)];
    }, 0.111, ['#c37670', '#fff1e6']));
  } else {
    for (const side of [-1, 1]) {
      pieces.push(makePiece(surfaces.shrimp, (u, v) => {
        const width = (0.37 + 0.63 * Math.sin(Math.PI * u ** 0.75)) * (1 - 0.42 * u);
        const center = side * (0.224 - 0.185 * u);
        return [(u * 2 - 1) * x * 0.88 - 0.12, center + v * width * z * 0.66];
      }, 0.105, ['#ca7b6b', '#fff5e7']));
      pieces.push(makePiece(surfaces.tail, (u, v) => {
        const spread = 0.028 + u * 0.22;
        const fan = (0.015 + 0.094 * Math.sin(Math.PI * u * 0.96)) * v;
        return [x * 0.62 + 0.43 * u - 0.04 * v, side * spread + fan];
      }, 0.041, ['#ac403e', '#f7a69a']));
    }
  }
  group.add(...pieces.map((p) => p.mesh));
  const update = (floorAt, bend) => pieces.forEach((piece) => piece.update(floorAt, bend));
  return { group, update };
}

function applyTexture(surfaces, names, file, renderer) {
  return new THREE.TextureLoader().loadAsync('./art/' + file + '.jpg').then((texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    for (const name of names) {
      const target = surfaces[name];
      target.map = texture;
      target.color.set(name === 'wood' ? '#f7e0c6' : '#ffffff');
      target.bumpMap = texture;
      target.needsUpdate = true;
    }
  }).catch(() => {});
}

export function makeCounter(canvas, onResize, onContextLost) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'default' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.11;

  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 70);
  camera.position.set(1.37, 7.0, 10.65);
  camera.lookAt(-0.06, 0.05, -0.13);
  camera.updateMatrixWorld();

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffe8cd', '#a66243', 1.52));
  const light = new THREE.DirectionalLight('#fff0d9', 1.75);
  light.position.copy(key);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -5.6, right: 5.6, top: 6.0, bottom: -5.5, near: 0.2, far: 17 });
  light.shadow.normalBias = 0.020;
  light.shadow.bias = -0.00024;
  scene.add(light);
  const bounce = new THREE.DirectionalLight('#ffd7ae', 0.60);
  bounce.position.set(5, 3, -3.8);
  scene.add(bounce);

  const surfaces = {
    wood: material('#b77b49', { roughness: 0.63, bumpScale: 0.012, vertexColors: true }),
    board: material('#c59458', { roughness: 0.76 }),
    plate: material('#302722', { roughness: 0.49, metalness: 0.04, bumpScale: 0.021 }),
    tuna: material('#c75756', { roughness: 0.37, vertexColors: true, side: THREE.DoubleSide, bumpScale: 0.018 }),
    shrimp: material('#f3b39a', { roughness: 0.34, vertexColors: true, side: THREE.DoubleSide, bumpScale: 0.014 }),
    tail: material('#d64f47', { roughness: 0.40, vertexColors: true, side: THREE.DoubleSide }),
  };
  const texturesReady = Promise.all([
    applyTexture(surfaces, ['wood', 'board'], 'hinoki', renderer),
    applyTexture(surfaces, ['plate'], 'stoneware', renderer),
    applyTexture(surfaces, ['tuna'], 'chutoro', renderer),
    applyTexture(surfaces, ['shrimp'], 'amaebi', renderer),
  ]);

  // A continuous worktop. The inlaid serving line and its support are in the same plane.
  const worktopGeometry = new THREE.PlaneGeometry(14.6, 15.4, 22, 22);
  const woodPositions = worktopGeometry.attributes.position;
  const woodColors = new Float32Array(woodPositions.count * 3);
  for (let i = 0; i < woodPositions.count; i++) {
    const x = woodPositions.getX(i), z = -woodPositions.getY(i) + 0.90;
    const pool = Math.exp(-(((x + 0.50) / 3.25) ** 2 + ((z + 0.66) / 5.1) ** 2));
    woodColors.set([0.58 + 0.42 * pool, 0.48 + 0.52 * pool, 0.42 + 0.58 * pool], i * 3);
  }
  worktopGeometry.setAttribute('color', new THREE.BufferAttribute(woodColors, 3));
  const worktop = makeMesh(worktopGeometry, surfaces.wood, 0, 0, 0.90, false);
  worktop.rotation.x = -Math.PI / 2;
  scene.add(worktop);
  const inlay = makeMesh(new THREE.PlaneGeometry(12.8, 0.038),
    material('#b99a59', { roughness: 0.37, metalness: 0.51 }), 0, 0.002, plate.lineZ, false);
  inlay.rotation.x = -Math.PI / 2;
  scene.add(inlay);
  scene.add(makeMesh(box(2.62, board.height, 1.40), surfaces.board, board.x, 0, board.z));

  const cupProfile = [[0, 0.014], [0.40, 0.014], [0.44, 0.07], [0.52, 0.31],
    [0.53, 0.385], [0.515, 0.406], [0.474, 0.39], [0.45, 0.25], [0.35, 0.071], [0, 0.071]];
  const cup = makeMesh(new THREE.LatheGeometry(cupProfile.map(([x, y]) => new THREE.Vector2(x, y)), 64),
    surfaces.plate, -1.42, 0, 3.58);
  const soy = makeMesh(new THREE.CircleGeometry(0.423, 48),
    material('#392616', { roughness: 0.15, metalness: 0.05 }), -1.42, 0.205, 3.58, false);
  soy.rotation.x = -Math.PI / 2;
  scene.add(cup, soy);

  const tray = new THREE.Group();
  const plateMesh = makePlate(surfaces.plate);
  const rice = makeRice();
  tray.add(makeContactShadow(3.12, 2.18), plateMesh, rice.group);
  tray.position.set(plate.x, 0, plate.prepZ);
  scene.add(tray);

  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const calcPlane = new THREE.Plane(worldUp, 0);
  const cameraPoint = new THREE.Vector3();
  let topping;
  let animation = 0;
  let lost = false;

  function render() {
    if (animation || lost) return;
    animation = requestAnimationFrame(() => {
      animation = 0;
      renderer.render(scene, camera);
    });
  }

  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    const size = Math.max(8.9, 4.62 / camera.aspect);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(size / 25.6));
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    onResize();
    render();
  }

  function newRecipe(recipe) {
    if (topping) {
      scene.remove(topping.group);
      topping.group.traverse((object) => object.geometry?.dispose());
    }
    topping = makeTopping(recipe, surfaces);
    scene.add(topping.group);
  }

  function updateRice(shape) {
    rice.update(shape);
    render();
  }

  function updateFish(shape, fish, plateZ, settle = fish.placed ? 1 : 0, startHeight = 0) {
    const locX = fish.x - plate.x;
    const locZ = fish.z - plateZ;
    topping.group.position.set(fish.x, 0, fish.z);
    function support(x, z) {
      if (!fish.placed) return board.height;
      const gx = locX + x, gz = locZ + z;
      const top = (riceTopAt(shape, gx, gz) * 3 + riceTopAt(shape, gx + 0.065, gz)
        + riceTopAt(shape, gx - 0.065, gz) + riceTopAt(shape, gx, gz + 0.065)
        + riceTopAt(shape, gx, gz - 0.065)) / 7;
      const floor = Math.max(plateTopAt(gx, gz) + 0.009,
        plate.floor + 0.014 + top + Math.min(top * 0.38, 0.031));
      return startHeight * (1 - settle) + floor * settle;
    }
    topping.update(fish.lift ? () => fish.lift : support, settle);
    render();
  }

  function updatePlate(z) {
    tray.position.z = z;
    render();
  }

  function setRay(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, camera);
  }

  function point(event, height) {
    setRay(event.clientX, event.clientY);
    calcPlane.constant = -height;
    return ray.ray.intersectPlane(calcPlane, new THREE.Vector3());
  }

  function hit(event) {
    setRay(event.clientX, event.clientY);
    scene.updateMatrixWorld();
    const objects = [...topping.group.children, rice.core, plateMesh];
    const first = ray.intersectObjects(objects, false)[0];
    if (!first) return null;
    const type = first.object === rice.core ? 'rice' : first.object === plateMesh ? 'plate' : 'fish';
    return { type, point: first.point };
  }

  function project(x, y, z) {
    cameraPoint.set(x, y, z).project(camera);
    return [(cameraPoint.x + 1) * canvas.clientWidth / 2, (1 - cameraPoint.y) * canvas.clientHeight / 2];
  }

  function contextLost(event) {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(animation);
    animation = 0;
    onContextLost();
  }

  canvas.addEventListener('webglcontextlost', contextLost);
  new ResizeObserver(resize).observe(canvas);
  texturesReady.then(render);
  return { newRecipe, updateRice, updateFish, updatePlate, point, hit, project };
}

// Shared meshes for the full 3D counter.
export { material, makeMesh, box, makePlate, makeContactShadow, makeRice, makePiece, plateTopAt };
