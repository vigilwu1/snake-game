import { menus, recipes } from './menu.mjs';
import { clamp, clearEdges, riceShape, centered } from '../nigiri-preview/kitchen.mjs';

export const STORAGE = 'nori-omakase-3d-v1';

export function newService(menu) {
  const run = { version: 1, menu, group: 0, clock: 0, stock: {}, served: [], items: [] };
  setup(run);
  return run;
}

function setup(run) {
  run.items = (menus[run.menu].groups[run.group] ?? []).map(id => ({
    id, served: false, edges: clearEdges(), shaped: false, placement: null, marks: [0, 0, 0, 0, 0, 0, 0],
    cuts: [], gap: recipes[id].target || 0, started: null, turnedAt: null,
  }));
}

export function decode(value) {
  try {
    const run = JSON.parse(value);
    const menu = menus[run?.menu];
    if (run?.version !== 1 || !menu || !Number.isInteger(run.group) || run.group < 0 ||
        run.group > menu.groups.length || !Number.isFinite(run.clock) || run.clock < 0 ||
        !Array.isArray(run.items) || !Array.isArray(run.served) || !run.stock) return null;
    const slots = menu.groups[run.group] ?? [];
    if (slots.length !== run.items.length || slots.some((id, i) => run.items[i]?.id !== id ||
      !Array.isArray(run.items[i].cuts) || !Array.isArray(run.items[i].marks))) return null;
    return run;
  } catch {
    return null;
  }
}

export const elapsed = (run, since) => since === null ? 0 : Math.max(0, run.clock - since);
export const done = run => run.group === menus[run.menu].groups.length;
export const groupDone = run => run.items.length > 0 && run.items.every(item => item.served);
export const requiredCuts = recipe => recipe.reserve ? 3 : 2;
export const totalPlates = menu => menus[menu].groups.flat().length;
export const cutoffRatio = 0.83;

export function stepOf(run, item) {
  const r = recipes[item.id];
  if (item.served) return 'served';
  switch (r.mode) {
    case 'cut':
      if (item.cuts.length < requiredCuts(r)) return 'cut';
      if (item.cuts.some(slice => !slice.to)) return 'arrange';
      return 'serve';
    case 'nigiri':
      if (r.rice.edge && !item.shaped && !item.placement) return 'shape';
      if (r.method === 'marinate' && !item.marinated) {
        if (item.started === null) return 'dip';
        return elapsed(run, item.started) < 3600 ? 'soaking' : 'lift';
      }
      if (!item.placement) return 'lay';
      if ((r.method === 'torch' || r.method === 'brush') && !item.marks.some(n => n >= 0.17)) return r.method;
      return 'serve';
    case 'steam':
      if (item.started === null) return 'steam';
      if (elapsed(run, item.started) < r.duration) return 'steaming';
      return item.prepared ? 'serve' : 'lid';
    case 'grill':
      if (item.turnedAt === null) return elapsed(run, item.started) >= 2000 ? 'flip' : 'grilling';
      return elapsed(run, item.turnedAt) >= 2100 ? 'serve' : 'grilling';
    case 'gunkan': return item.prepared ? 'serve' : item.wrapped ? 'scoop' : 'wrap';
    default: return item.prepared ? 'serve' : r.mode;
  }
}

export function activate(run, item) {
  if (recipes[item.id].mode === 'grill' && item.started === null) item.started = run.clock;
}

export function cutGap(recipe, value) {
  return clamp(value, recipe.target * 0.58, recipe.target * 1.60);
}

export function action(run, item, name, value) {
  const r = recipes[item.id];
  const step = stepOf(run, item);
  if (step === 'served') return false;
  switch (name) {
    case 'gap':
      if (step !== 'cut') return false;
      item.gap = cutGap(r, value);
      return true;
    case 'cut': {
      if (step !== 'cut' || value.progress < cutoffRatio) return false;
      const index = item.cuts.length;
      const used = item.cuts.reduce((sum, slice) => sum + slice.thickness, 0);
      const isIka = !r.reserve;
      const thickness = isIka ? Math.min(item.gap, r.length - used - 0.08) : item.gap;
      item.cuts.push({ key: item.id + '-' + (index + 1), thickness, offset: used, to: null });
      if (isIka && index === 1) item.cuts.push({
        key: item.id + '-3', thickness: r.length - used - thickness, offset: used + thickness, to: null,
      });
      item.gap = r.reserve && item.cuts.length === 2 && r.surface === 'akami' ? r.target * 0.70 : r.target;
      return true;
    }
    case 'allocate': {
      if (step !== 'arrange') return false;
      const piece = item.cuts.find(slice => slice.key === value.key);
      if (!piece || piece.to) return false;
      const limit = value.to === 'plate' ? (r.reserve ? 2 : 3) : r.reserve && value.to === 'cold' ? 1 : 0;
      if (item.cuts.filter(slice => slice.to === value.to).length >= limit) return false;
      piece.to = value.to;
      if (value.to === 'cold') run.stock[r.reserve] = {
        key: piece.key, thickness: piece.thickness, offset: piece.offset, lean: r.lean, depth: r.depth,
      };
      return true;
    }
    case 'shape':
      if (r.mode !== 'nigiri' || !r.rice.edge || !['shape','lay','serve','brush','torch'].includes(step)) return false;
      item.edges = value;
      item.shaped ||= Object.values(value).some(n => n > 0.055);
      return true;
    case 'lay':
      if (r.mode !== 'nigiri' || !['lay','serve','torch','brush'].includes(step)) return false;
      item.placement = value;
      return true;
    case 'steam':
    case 'dip':
      if (step !== name) return false;
      item.started = run.clock;
      return true;
    case 'lift':
      if (step !== name) return false;
      item.marinated = true;
      item.marinade = elapsed(run, item.started);
      return true;
    case 'torch':
    case 'brush':
      if (r.method !== name || !item.placement || ![name, 'serve'].includes(step) || !value.some(n => n > 0)) return false;
      item.marks = item.marks.map((n, i) => n + value[i]);
      return true;
    case 'flip':
      if (step !== name) return false;
      item.turnedAt = run.clock;
      return true;
    case 'wrap':
      if (step !== name) return false;
      item.wrapped = true;
      return true;
    case 'garnish':
    case 'lid':
    case 'scoop':
    case 'roll':
    case 'egg':
    case 'soup':
      if (step !== name) return false;
      item.prepared = true;
      item.finishRatio = value?.ratio ?? 1;
      return true;
    case 'serve':
      if (step !== name) return false;
      item.served = true;
      run.served.push({ id: item.id, ...feedback(run, item) });
      if (r.source) {
        item.usedPiece = run.stock[r.source];
        delete run.stock[r.source];
      }
      return true;
    default:
      return false;
  }
}

function feedback(run, item) {
  const r = recipes[item.id];
  const good = text => ({ score: 1, text });
  const better = text => ({ score: 0, text });
  if (run.served.length === 0 && menus[run.menu].first && item.id !== menus[run.menu].first) {
    return better(menus[run.menu].first === 'chawan' ? '我喜欢先喝口热的，下次茶碗蒸先来。' : '下次先来一道柚子章鱼开开胃。');
  }
  if (run.menu === 'classic' && item.id === 'zuke' && !run.served.some(d => d.id === 'kohada')) {
    return better('下次可先尝小肌的醋香，再吃渍赤身。');
  }
  if (r.mode === 'cut') {
    const served = item.cuts.filter(slice => slice.to === 'plate');
    const tolerance = run.menu === 'light' && r.lean ? 0.24 : 0.38;
    const tooThick = served.some(slice => slice.thickness > r.target * (1 + tolerance));
    const uneven = served.length > 1 && Math.max(...served.map(s => s.thickness)) - Math.min(...served.map(s => s.thickness)) > r.target * 0.5;
    if (tooThick || uneven) return better(r.lean ? '薄片再切匀一点，摆开会更透。' : '刀距放匀一点，两片的口感会更接近。');
    return good(r.reserve ? '两片切得匀，冷盘里还留了一片。' : '鱿鱼切得细，三条都分开了。');
  }
  if (r.mode === 'nigiri') {
    if (r.method === 'torch' || r.method === 'brush') {
      const torch = r.method === 'torch';
      const min = torch ? 0.20 : 0.23;
      const max = torch ? 1.37 : 1.80;
      const missed = item.marks.findIndex(n => n < min);
      const excess = item.marks.some(n => n > max);
      if (excess) return better(torch ? '有一段火停得久了，下次匀速扫过。' : '有一段酱汁太厚，下次一刷带过去。');
      if (missed !== -1) {
        const side = missed < 2 ? '左端' : missed >= 5 ? '右端' : '中段';
        return better(torch ? side + '还带着生色，可以再扫一遍。' : side + '还没刷亮，下次记得带过去。');
      }
    }
    if (r.method === 'marinate' && item.marinade > 12000) return better('赤身的汁味偏浓，变色后可以早点夹起。');
    if (r.source && run.stock[r.source]?.thickness > (r.source === 'akami-stock' ? 0.31 : 0.20)) {
      return better('这片留料厚了些，下次挑薄一点的更贴饭。');
    }
    const rice = riceShape(r, item.edges);
    if (!centered(r, rice, item.placement.x, item.placement.z)) return better('鱼片偏了一点，下次沿饭团中心放。');
    const ratio = rice.radiusX / rice.radiusZ;
    if (r.rice.edge && (ratio < r.rice.targetRatio[0] || ratio > r.rice.targetRatio[1])) {
      return better(r.rice.edge === 'near' ? '饭团再收窄一些，鱼料会更贴。' : '饭团再收短一点，鱼片更容易盖住。');
    }
    return good(r.method === 'torch' ? '两端都炙到了，火候很匀。' : r.method === 'brush' ? '穴子的刷汁薄而匀。' :
      r.source ? '前面留的那片贴饭正好。' : '这贯鱼和饭贴得很顺。');
  }
  if (r.mode === 'steam' && elapsed(run, item.started) > r.duration + 9000) return better('蒸好后早些揭盖，端上来会更嫩。');
  if (r.mode === 'grill' && item.turnedAt - item.started > 8000) return better('银鳕鱼第一面上色偏深，下次可以早点翻。');
  if (r.mode === 'gunkan' && item.finishRatio > 1.18) return better('配料高出海苔边一点，下次少舀些。');
  return good(r.mode === 'steam' ? '端上来时还有蒸汽。' : r.mode === 'roll' ? '海苔收得紧，拿起来刚好。' : '这道刚好。');
}

export function nextGroup(run) {
  if (!groupDone(run)) return false;
  run.group += 1;
  setup(run);
  return true;
}
