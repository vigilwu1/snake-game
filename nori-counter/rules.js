(function () {
  'use strict';

  const phases = [
    { id: 'starter', label: '小菜', count: 2 },
    { id: 'nigiri', label: '握寿司', count: 12 },
    { id: 'gunkan', label: '军舰', count: 1 },
    { id: 'finish', label: '收尾', count: 1 },
  ];
  const total = phases.reduce((sum, phase) => sum + phase.count, 0);

  function dish(id, name, phase, flavor, steps, ingredient = id, preview = id) {
    return { id, name, phase, flavor, steps, ingredient, preview };
  }

  const recipes = [
    dish('squid-sashimi', '鱿鱼刺身', 'starter', '清鲜', ['slice', 'place'], 'squid'),
    dish('chawan', '蛤蜊茶碗蒸', 'starter', '温鲜', ['garnish']),
    dish('octopus', '柚子章鱼', 'starter', '酸鲜', ['place', 'garnish']),
    dish('madai', '真鲷', 'nigiri', '清鲜', ['slice', 'place']),
    dish('hirame', '比目鱼', 'nigiri', '清鲜', ['slice', 'place']),
    dish('amaebi', '甜虾', 'nigiri', '清鲜', ['place']),
    dish('hotate', '帆立贝', 'nigiri', '清鲜', ['place']),
    dish('salmon-back', '三文鱼背肉', 'nigiri', '清鲜', ['slice', 'place']),
    dish('akami', '金枪鱼赤身', 'nigiri', '清鲜', ['slice', 'place']),
    dish('kohada', '醋渍小肌', 'nigiri', '酸鲜', ['place']),
    dish('aji', '竹荚鱼', 'nigiri', '鲜香', ['place']),
    dish('chutoro', '金枪鱼中腹', 'nigiri', '油润', ['slice', 'place']),
    dish('salmon-belly', '三文鱼腹肉', 'nigiri', '油润', ['slice', 'place']),
    dish('salmon-seared', '炙三文鱼腹肉', 'nigiri', '炙香', ['place', 'sear'], 'salmon-belly'),
    dish('otoro', '金枪鱼大腹', 'nigiri', '油润', ['slice', 'place']),
    dish('anago', '煮穴子', 'nigiri', '熟香', ['place', 'brush']),
    dish('squid', '鱿鱼', 'nigiri', '清鲜', ['slice', 'place']),
    dish('buri', '鰤鱼', 'nigiri', '油润', ['slice', 'place']),
    dish('akagai', '赤贝', 'nigiri', '清鲜', ['place']),
    dish('ikura', '鲑鱼籽军舰', 'gunkan', '咸鲜', ['fill']),
    dish('uni', '海胆军舰', 'gunkan', '鲜甜', ['fill']),
    dish('tamago', '玉子烧', 'finish', '甘甜', ['place']),
    dish('miso', '味噌汤', 'finish', '温鲜', ['pour']),
  ];

  const byId = Object.fromEntries(recipes.map(recipe => [recipe.id, recipe]));
  const seats = [
    { id: 'light', name: '清鲜之席', preference: '前六贯至少四贯清鲜', note: '客人想先尝清鲜' },
    { id: 'seared', name: '炙香之席', preference: '后六贯至少一道炙烧', note: '客人想尝炙香' },
    { id: 'classic', name: '江户风味', preference: '上醋渍小肌和煮穴子', note: '客人想尝小肌和穴子' },
  ];
  const seatById = Object.fromEntries(seats.map(seat => [seat.id, seat]));

  const actionInfo = {
    slice: { title: '切鱼片', hint: '沿刀痕划一刀', notes: ['切得匀', '切面稍偏', '鱼片薄厚不匀'] },
    place: { title: '摆放', hint: '把食材放到标记处', notes: ['摆得正', '落点稍偏', '落点偏离中心'] },
    garnish: { title: '点缀', hint: '把点缀放在菜面中央', notes: ['点缀恰好', '点缀稍偏', '点缀偏离中央'] },
    brush: { title: '刷汁', hint: '沿穴子表面刷一遍', notes: ['刷得匀', '酱汁略偏', '酱汁没有盖匀'] },
    fill: { title: '填军舰', hint: '把鱼料放进海苔饭底', notes: ['填得整齐', '鱼料略偏', '鱼料堆在一侧'] },
    pour: { title: '盛味噌汤', hint: '把汤盛进碗里', notes: ['盛得稳', '稍有溢出', '碗边洒了汤'] },
    sear: { title: '炙烧', hint: '表面微泛金黄时松手', notes: ['表面微金，火候正好', '炙色略浅或偏深', '火候不匀'] },
  };

  function createRun(id) {
    return { seat: id, served: [], active: null, selected: null };
  }

  function phaseAt(index) {
    for (const phase of phases) {
      if (index < phase.count) return phase;
      index -= phase.count;
    }
    return null;
  }

  function phaseCounts(run) {
    return Object.fromEntries(phases.map(phase => [
      phase.id, run.served.filter(entry => byId[entry.id].phase === phase.id).length,
    ]));
  }

  function available(run) {
    const phase = phaseAt(run.served.length);
    if (!phase) return [];
    const used = new Set(run.served.map(entry => byId[entry.id].ingredient));
    return recipes.filter(recipe => recipe.phase === phase.id && !used.has(recipe.ingredient) &&
      (recipe.id !== 'salmon-seared' || run.served.length >= 8));
  }

  function select(run, id) {
    if (run.active || !available(run).some(recipe => recipe.id === id)) return false;
    run.selected = id;
    return true;
  }

  function begin(run) {
    if (run.active) return false;
    const picked = available(run).find(recipe => recipe.id === run.selected);
    if (!picked) return false;
    run.active = { id: picked.id, marks: [] };
    return true;
  }

  function step(run) {
    return run.active ? byId[run.active.id].steps[run.active.marks.length] ?? 'serve' : null;
  }

  function record(run, action, value, detail) {
    if (step(run) !== action || !actionInfo[action] || !Number.isFinite(value)) return false;
    run.active.marks.push({ action, rating: Math.max(0, Math.min(1, value)), detail });
    return true;
  }

  function serve(run) {
    if (step(run) !== 'serve') return false;
    run.served.push(run.active);
    run.active = null;
    run.selected = null;
    return true;
  }

  function markMessage(mark) {
    if (mark.action === 'sear' && mark.detail === 'early') return '炙色偏浅';
    if (mark.action === 'sear' && mark.detail === 'late') return '表面过深';
    return actionInfo[mark.action].notes[mark.rating >= .95 ? 0 : mark.rating >= .65 ? 1 : 2];
  }

  function summarize(run) {
    const nigiri = run.served.filter(entry => byId[entry.id].phase === 'nigiri');
    const fresh = nigiri.slice(0, 6).filter(entry => byId[entry.id].flavor === '清鲜').length;
    const seared = nigiri.slice(6).some(entry => entry.id === 'salmon-seared');
    const classic = ['kohada', 'anago'].filter(id => nigiri.some(entry => entry.id === id)).length;
    const count = { light: fresh, seared: Number(seared), classic }[run.seat];
    const required = { light: 4, seared: 1, classic: 2 }[run.seat];
    const average = entries => entries.reduce((sum, mark) => sum + mark.rating, 0) / entries.length;
    const craft = Math.round(80 * run.served.reduce((sum, entry) => sum + average(entry.marks), 0) / total);
    const palate = count >= required ? 20 : 0;
    return { craft, palate, score: craft + palate, progress: Math.min(count, required), required };
  }

  function searRating(duration) {
    if (duration >= 700 && duration <= 1200) return { rating: 1, detail: 'gold' };
    const early = duration < 700;
    return { rating: duration >= 480 && duration <= 1480 ? .7 : .45, detail: early ? 'early' : 'late' };
  }

  globalThis.NoriRules = Object.freeze({
    phases, total, recipes, byId, seats, seatById, actionInfo, createRun, phaseAt, phaseCounts,
    available, select, begin, step, record, serve, markMessage, summarize, searRating,
  });
})();
