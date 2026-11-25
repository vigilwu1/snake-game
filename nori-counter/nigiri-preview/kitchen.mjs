export const plate = { x: -0.36, prepZ: 0.45, serveZ: -4.68, lineZ: -3.92, radiusX: 1.37, radiusZ: 0.95, floor: 0.084 };
export const board = { x: 0.72, z: 2.38, height: 0.105 };

export const recipes = [
  {
    id: 'chutoro',
    name: '金枪鱼中腹',
    portion: '客人要少饭',
    rice: { x: 0.81, z: 0.55, height: 0.32, targetRatio: [1.17, 1.39] },
    fish: { x: 0.99, z: 0.59, fitX: 0.28, fitZ: 0.23 },
    firstMove: '从饭团左边往里推，让它短一点',
    addFish: '把中腹拖到饭团上',
    adjust: '鱼片有点偏，拨到饭团中央',
    shapeFeedback: '饭量正好，饭团再短一点会更衬这片中腹。',
    success: '少饭刚好，这片中腹贴得也好。',
  },
  {
    id: 'amaebi',
    name: '甜虾',
    portion: '客人要标准饭',
    rice: { x: 0.88, z: 0.58, height: 0.36, targetRatio: [1.79, 2.38] },
    fish: { x: 1.08, z: 0.40, fitX: 0.34, fitZ: 0.17 },
    firstMove: '从饭团靠你的一边往里推，让它窄一点',
    addFish: '把甜虾沿着饭团长边放下',
    adjust: '虾身有点偏，沿饭团长边拨正',
    shapeFeedback: '饭量刚好。饭团再收窄一点，虾身会更贴。',
    success: '虾身贴得很顺，这一口的饭也刚好。',
  },
];

export const clamp = (n, low, high) => Math.max(low, Math.min(n, high));
export const clearEdges = () => ({ left: 0, right: 0, near: 0, far: 0 });

export function riceShape(recipe, { left, right, near, far }) {
  const { x, z, height } = recipe.rice;
  const radiusX = x - (left + right) / 2;
  const radiusZ = z - (near + far) / 2;
  return {
    x: (left - right) / 2,
    z: (far - near) / 2,
    radiusX,
    radiusZ,
    height: height * x * z / (radiusX * radiusZ),
  };
}

// The flattened underside and the rounded shoulders use the same profile as the visible rice mesh.
export const shoulderPower = 0.78;
export function riceTopAt(shape, x, z) {
  const flatX = Math.abs((x - shape.x) / shape.radiusX) ** (2 / shoulderPower);
  const flatZ = Math.abs((z - shape.z) / shape.radiusZ) ** (2 / shoulderPower);
  return shape.height * Math.sqrt(Math.max(0, 1 - flatX - flatZ));
}

export function riceEdge(shape, x, z) {
  const across = (x - shape.x) / shape.radiusX;
  const depth = (z - shape.z) / shape.radiusZ;
  if (Math.abs(across) > Math.abs(depth)) return across < 0 ? 'left' : 'right';
  return depth > 0 ? 'near' : 'far';
}

export function pressEdge(recipe, original, edge, dx, dz) {
  const moves = { left: dx, right: -dx, near: -dz, far: dz };
  const limit = { left: 0.30, right: 0.30, near: 0.38, far: 0.30 };
  const opposite = { left: 'right', right: 'left', near: 'far', far: 'near' };
  const half = edge === 'left' || edge === 'right' ? recipe.rice.x : recipe.rice.z;
  const room = half * 0.69 - original[opposite[edge]];
  return { ...original, [edge]: clamp(original[edge] + moves[edge], 0, Math.min(limit[edge], room)) };
}

export function dropOnRice(recipe, shape, x, z) {
  const along = (x - shape.x) / (shape.radiusX * 0.70 + recipe.fish.x * 0.17);
  const across = (z - shape.z) / (shape.radiusZ * 0.79 + recipe.fish.z * 0.17);
  return along ** 2 + across ** 2 <= 1;
}

export function centered(recipe, shape, x, z) {
  const along = (x - shape.x) / recipe.fish.fitX;
  const across = (z - shape.z) / recipe.fish.fitZ;
  return along ** 2 + across ** 2 <= 1;
}

export function guestResponse(recipe, shape, x, z) {
  if (!centered(recipe, shape, x, z)) {
    return recipe.id === 'amaebi'
      ? '标准饭刚好。虾身偏了一点，下次沿着饭团放。'
      : '少饭刚好。中腹偏了一点，下次放在饭团中央。';
  }
  const ratio = shape.radiusX / shape.radiusZ;
  const [min, max] = recipe.rice.targetRatio;
  if (ratio >= min && ratio <= max) return recipe.success;
  if ((recipe.id === 'amaebi' && ratio < min) || (recipe.id === 'chutoro' && ratio > max)) {
    return recipe.shapeFeedback;
  }
  return recipe.id === 'amaebi' ? '虾身对齐了，饭团可以稍微宽一点。' : '中腹放得正，饭团可以再留一点长度。';
}
