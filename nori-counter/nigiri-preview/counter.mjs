import { board, centered, clamp, clearEdges, dropOnRice, guestResponse, plate,
  pressEdge, recipes, riceEdge, riceShape } from './kitchen.mjs';
import { makeCounter } from './scene.mjs';

const get = (id) => document.getElementById(id);
const root = get('counter');
const canvas = get('table');
const guide = get('guide');
const instruction = get('instruction');
const reaction = get('reaction');
const response = get('response');
const next = get('next');
const reset = get('reset');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

let scene;
let recipeIndex = 0;
let recipe;
let plateZ;
let edges;
let shape;
let fish;
let drag = null;
let shaped;
let served;
let animating = 0;
let motionFrame = 0;
let step;

function inform(text) {
  if (instruction.textContent !== text) instruction.textContent = text;
}

function drawGuide() {
  guide.hidden = true;
  if (drag || animating || !recipe || served) return;

  let from, to;
  if (step === 'shape') {
    if (recipe.id === 'amaebi') {
      const x = plate.x + shape.x;
      from = [x, plate.floor + 0.14, plateZ + shape.z + shape.radiusZ * 0.88];
      to = [x, plate.floor + 0.25, plateZ + shape.z + shape.radiusZ * 0.18];
    } else {
      const z = plateZ + shape.z + 0.10;
      from = [plate.x + shape.x - shape.radiusX * 0.87, plate.floor + 0.14, z];
      to = [plate.x + shape.x - shape.radiusX * 0.28, plate.floor + 0.28, z];
    }
  } else if (step === 'fish') {
    from = [fish.x, board.height + 0.15, fish.z];
    to = [plate.x + shape.x, plate.floor + shape.height + 0.05, plateZ + shape.z];
  } else if (step === 'serve') {
    from = [plate.x + 0.62, 0.17, plateZ + 0.73];
    to = [plate.x + 0.62, 0.17, plateZ - 0.52];
  } else {
    return;
  }
  const [x, y] = scene.project(...from);
  const [endX, endY] = scene.project(...to);
  const length = Math.hypot(endX - x, endY - y);
  guide.style.setProperty('--guide-x', x + 'px');
  guide.style.setProperty('--guide-y', y + 'px');
  guide.style.setProperty('--guide-angle', Math.atan2(endY - y, endX - x) + 'rad');
  guide.style.setProperty('--guide-length', Math.max(14, Math.min(63, length)) + 'px');
  guide.hidden = false;
}

function describe(override) {
  let text;
  if (served) {
    step = 'served';
  } else if (fish.placed) {
    step = 'serve';
    text = centered(recipe, shape, fish.x - plate.x, fish.z - plateZ)
      ? '推住碟边，沿吧台滑过金线'
      : recipe.adjust + '，或推碟上菜';
  } else if (shaped) {
    step = 'fish';
    text = recipe.addFish;
  } else {
    step = 'shape';
    text = recipe.firstMove;
  }
  root.dataset.step = step;
  if (text) inform(override || text);
  drawGuide();
}

function redraw(settle, lift) {
  scene.updatePlate(plateZ);
  scene.updateRice(shape);
  scene.updateFish(shape, fish, plateZ, settle, lift);
}

function clearMotion() {
  cancelAnimationFrame(motionFrame);
  motionFrame = 0;
  animating = 0;
}

function animate(milliseconds, update, finish) {
  clearMotion();
  if (reduceMotion.matches) {
    update(1);
    finish();
    return;
  }
  animating = performance.now();
  function frame(now) {
    const elapsed = clamp((now - animating) / milliseconds, 0, 1);
    update(1 - (1 - elapsed) ** 3);
    if (elapsed < 1) {
      motionFrame = requestAnimationFrame(frame);
    } else {
      clearMotion();
      finish();
    }
  }
  motionFrame = requestAnimationFrame(frame);
}

function begin(index, focus = false) {
  clearMotion();
  cancelDrag();
  recipeIndex = index;
  recipe = recipes[recipeIndex];
  root.dataset.dish = recipe.id;
  shaped = false;
  served = false;
  edges = clearEdges();
  shape = riceShape(recipe, edges);
  plateZ = plate.prepZ;
  fish = { x: board.x, z: board.z, lift: 0, placed: false };
  scene.newRecipe(recipe);
  redraw();
  get('dish').textContent = recipe.name;
  get('portion').textContent = recipe.portion;
  reaction.hidden = true;
  instruction.hidden = false;
  reset.disabled = false;
  if (focus) reset.focus({ preventScroll: true });
  describe();
}

function touchTarget(event) {
  const direct = scene.hit(event);
  if (direct?.type !== 'plate' && direct) return direct;
  if (event.pointerType !== 'touch') return direct;
  const contact = scene.point(event, fish.placed ? plate.floor + shape.height : board.height + 0.07);
  if (contact && Math.hypot((contact.x - fish.x) / (recipe.fish.x + 0.10),
    (contact.z - fish.z) / (recipe.fish.z + 0.13)) < 1.02) {
    return { type: 'fish', point: contact };
  }
  if (direct) return direct;
  const surface = scene.point(event, 0.12);
  if (surface && Math.hypot((surface.x - plate.x) / (plate.radiusX + 0.14),
    (surface.z - plateZ) / (plate.radiusZ + 0.12)) < 1) return { type: 'plate', point: surface };
  return null;
}

function startDrag(event) {
  if (drag || animating || served || !recipe || event.button !== 0 || !event.isPrimary) return;
  const hit = touchTarget(event);
  if (!hit) return;
  if (hit.type === 'plate' && !fish.placed) {
    describe(shaped ? '先把食材放在饭团上，再推碟' : recipe.firstMove);
    return;
  }
  event.preventDefault();
  const height = hit.type === 'fish' ? 0.54 : hit.point.y;
  const origin = scene.point(event, height);
  if (!origin) return;
  drag = {
    id: event.pointerId, type: hit.type, height, origin, moved: false,
    previousFish: { ...fish }, previousEdges: edges, previousPlate: plateZ,
    edge: riceEdge(shape, hit.point.x - plate.x, hit.point.z - plateZ),
    grabX: hit.point.x - fish.x,
    grabZ: hit.point.z - fish.z,
  };
  canvas.setPointerCapture(event.pointerId);
  canvas.dataset.dragging = drag.type;
  drawGuide();
}

function moveDrag(event) {
  if (!drag) {
    const hover = !served && !animating && recipe && scene.hit(event);
    canvas.toggleAttribute('data-hover', Boolean(hover && (hover.type !== 'plate' || fish.placed)));
    return;
  }
  if (event.pointerId !== drag.id) return;
  const at = scene.point(event, drag.height);
  if (!at) return;
  const dx = at.x - drag.origin.x, dz = at.z - drag.origin.z;
  if (Math.hypot(dx, dz) < 0.035 && !drag.moved) return;
  drag.moved = true;
  switch (drag.type) {
    case 'rice':
      edges = pressEdge(recipe, drag.previousEdges, drag.edge, dx, dz);
      shape = riceShape(recipe, edges);
      scene.updateRice(shape);
      if (fish.placed) scene.updateFish(shape, fish, plateZ);
      break;
    case 'fish':
      fish = {
        x: clamp(at.x - drag.grabX, -3.2, 3.2),
        z: clamp(at.z - drag.grabZ, plate.serveZ + 0.4, 4.2),
        lift: drag.height,
        placed: false,
      };
      scene.updateFish(shape, fish, plateZ);
      break;
    case 'plate':
      setPlate(clamp(drag.previousPlate + dz, plate.serveZ, plate.prepZ + 0.18));
      break;
  }
}

function releasePointer() {
  if (!drag) return null;
  const completed = drag;
  drag = null;
  delete canvas.dataset.dragging;
  if (canvas.hasPointerCapture(completed.id)) canvas.releasePointerCapture(completed.id);
  return completed;
}

function cancelDrag() {
  const interrupted = releasePointer();
  if (!interrupted) return;
  fish = interrupted.previousFish;
  edges = interrupted.previousEdges;
  shape = riceShape(recipe, edges);
  plateZ = interrupted.previousPlate;
  redraw();
  describe();
}

function setPlate(z) {
  fish.z += z - plateZ;
  plateZ = z;
  scene.updatePlate(plateZ);
  scene.updateFish(shape, fish, plateZ);
}

function endDrag(event) {
  if (event.pointerId !== drag?.id) return;
  moveDrag(event);
  const completed = releasePointer();
  if (!completed.moved) {
    describe();
    return;
  }
  if (completed.type === 'rice') {
    shaped ||= Object.values(edges).some((distance) => distance > 0.065);
    describe();
  } else if (completed.type === 'fish') {
    const fits = dropOnRice(recipe, shape, fish.x - plate.x, fish.z - plateZ);
    const airborne = fish;
    const landing = fits ? { ...fish, lift: 0, placed: true } : completed.previousFish;
    animate(180, (progress) => {
      fish = {
        ...landing,
        x: airborne.x + (landing.x - airborne.x) * progress,
        z: airborne.z + (landing.z - airborne.z) * progress,
        lift: landing.placed ? 0 : airborne.lift * (1 - progress) + board.height * progress,
      };
      scene.updateFish(shape, fish, plateZ, landing.placed ? progress : 0, airborne.lift);
    }, () => {
      fish = landing;
      scene.updateFish(shape, fish, plateZ);
      describe(fits ? undefined : recipe.addFish);
    });
  } else {
    const willServe = fish.placed && plateZ <= plate.lineZ;
    const from = plateZ;
    const target = willServe ? plate.serveZ : plate.prepZ;
    animate(willServe ? 220 : 250, (progress) => {
      setPlate(from + (target - from) * progress);
    }, () => {
      if (willServe) serve();
      else describe('把陶碟推过金线，再松手');
    });
  }
}

function serve() {
  served = true;
  canvas.removeAttribute('data-hover');
  response.textContent = '“' + guestResponse(recipe, shape, fish.x - plate.x, fish.z - plateZ) + '”';
  next.firstChild.textContent = recipeIndex + 1 < recipes.length ? '再做一贯 · 甜虾' : '再做一轮';
  instruction.hidden = true;
  reaction.hidden = false;
  next.focus({ preventScroll: true, focusVisible: false });
  describe();
}

function unavailable(text) {
  clearMotion();
  cancelDrag();
  recipe = null;
  reset.disabled = true;
  guide.hidden = true;
  reaction.hidden = true;
  instruction.hidden = false;
  root.dataset.step = 'unavailable';
  inform(text);
}

try {
  scene = makeCounter(canvas, () => {
    cancelDrag();
    drawGuide();
  }, () => unavailable('3D 画面已暂停，请刷新页面重试'));
  begin(0);
  canvas.addEventListener('pointerdown', startDrag);
  canvas.addEventListener('pointermove', moveDrag);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', (event) => {
    if (event.pointerId === drag?.id) cancelDrag();
  });
  canvas.addEventListener('lostpointercapture', (event) => {
    if (event.pointerId === drag?.id) cancelDrag();
  });
  canvas.addEventListener('pointerleave', () => canvas.removeAttribute('data-hover'));
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelDrag(); });
  reset.addEventListener('click', () => begin(recipeIndex));
  next.addEventListener('click', (event) => begin((recipeIndex + 1) % recipes.length, event.detail === 0));
} catch (error) {
  console.error(error);
  unavailable('这个浏览器没能启动 3D 吧台。刷新页面或换一个浏览器试试。');
}
