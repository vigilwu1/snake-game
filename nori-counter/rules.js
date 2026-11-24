(function () {
  'use strict';

  const groups = [
    { id: 'salmon', label: '三文鱼' },
    { id: 'tuna', label: '金枪鱼' },
    { id: 'seafood', label: '其他海鲜' },
  ];

  const ingredients = [
    { id: 'salmon-back', group: 'salmon', label: '背肉', name: '三文鱼背肉', color: '#db6c42' },
    { id: 'salmon-belly', group: 'salmon', label: '腹肉', name: '三文鱼腹肉', color: '#ef936b' },
    { id: 'tuna-red', group: 'tuna', label: '赤身', name: '金枪鱼赤身', color: '#922d38' },
    { id: 'tuna-middle', group: 'tuna', label: '中腹', name: '金枪鱼中腹', color: '#bf5a65' },
    { id: 'tuna-fat', group: 'tuna', label: '大腹', name: '金枪鱼大腹', color: '#e4928e' },
    { id: 'squid', group: 'seafood', label: '鱿鱼', name: '鱿鱼', color: '#eee2cd' },
    { id: 'shrimp', group: 'seafood', label: '甜虾', name: '甜虾', color: '#e4987d' },
  ];

  const fishById = Object.fromEntries(ingredients.map(fish => [fish.id, fish]));
  const days = [
    { name: '开张', detail: '2 单 · 练习选料和切卷', orders: 2 },
    { name: '晚市', detail: '4 单 · 两单并做', orders: 4 },
    { name: '满座', detail: '5 单 · 卷物和握寿司', orders: 5 },
  ];

  const RICE_CAPACITY = 3;
  const RICE_COOK_TIME = 8000;
  const NORMAL_WAIT = 50000;
  const SHORT_WAIT = 25000;
  const CUT_COUNT = 5;
  const MIN_HOLD = 200;
  const GOOD_HOLD_START = 600;
  const GOOD_HOLD_END = 1000;
  const HOLD_METER_END = 1500;

  function plateName(type, fishId) {
    return `${fishById[fishId].name}${type === 'roll' ? '卷' : '握寿司'}`;
  }

  function dayMenu(day, random) {
    const roll = (fish, patience = NORMAL_WAIT) => ({ type: 'roll', fish, patience });
    const nigiri = (fish, patience = NORMAL_WAIT) => ({ type: 'nigiri', fish, patience });

    if (day === 1) return [roll('salmon-back', null), roll('tuna-red', null)];

    if (day === 2) {
      return [roll('tuna-middle'), roll('salmon-belly', SHORT_WAIT), roll('tuna-fat'), roll('tuna-red')];
    }

    const choices = ingredients.filter(fish => fish.group !== 'seafood').map(fish => fish.id);
    const first = choices.splice(Math.floor(random() * choices.length), 1)[0];
    const second = choices[Math.floor(random() * choices.length)];
    return [nigiri('shrimp'), roll('tuna-fat', SHORT_WAIT), nigiri('squid'), nigiri(first, SHORT_WAIT), nigiri(second)];
  }

  function addOrder(run) {
    if (!run.queue.length) return;

    const recipe = run.queue.shift();
    run.orders.push({
      ...recipe,
      arrivedAt: run.elapsed,
      stage: recipe.type === 'roll' ? 'fill' : 'shape',
      tab: fishById[recipe.fish].group,
      started: false,
      selectedFish: null,
      cuts: [],
      shapes: [],
    });
  }

  function startDay(day, random = Math.random) {
    const run = {
      day,
      elapsed: 0,
      rice: RICE_CAPACITY,
      riceReadyAt: null,
      orders: [],
      served: [],
      queue: dayMenu(day, random).map((recipe, index) => ({ ...recipe, id: index + 1 })),
      selected: 1,
    };

    addOrder(run);
    if (day > 1) addOrder(run);
    return run;
  }

  function activeOrder(run) {
    return run.orders.find(order => order.id === run.selected);
  }

  function canStart(run, order) {
    return order.started || run.rice > 0;
  }

  function useRice(run, order) {
    if (!canStart(run, order)) return false;
    if (!order.started) {
      run.rice--;
      order.started = true;
    }
    return true;
  }

  function selectFish(run, id) {
    const order = activeOrder(run);
    if (!order || !fishById[id] || !['fill', 'top'].includes(order.stage) || !useRice(run, order)) return false;
    order.selectedFish = id;
    return true;
  }

  function prepare(run) {
    const order = activeOrder(run);
    if (!order?.selectedFish) return false;
    if (order.stage === 'fill') {
      order.stage = 'cut';
      return true;
    }
    if (order.stage === 'top') {
      order.stage = 'serve';
      return true;
    }
    return false;
  }

  function cutCenter(index) {
    return (index + 1) / (CUT_COUNT + 1);
  }

  function cut(run, position) {
    const order = activeOrder(run);
    if (order?.stage !== 'cut' || !Number.isFinite(position)) return false;

    const distance = Math.abs(position - cutCenter(order.cuts.length));
    const halfBand = 0.5 / (CUT_COUNT + 1);
    if (distance > halfBand) return false;

    order.cuts.push({ position, points: distance <= halfBand / 3 ? 6 : 3 });
    if (order.cuts.length === CUT_COUNT) order.stage = 'serve';
    return true;
  }

  function shape(run, duration) {
    const order = activeOrder(run);
    if (order?.stage !== 'shape' || duration < MIN_HOLD || !Number.isFinite(duration) || !useRice(run, order)) return false;

    order.shapes.push(duration >= GOOD_HOLD_START && duration <= GOOD_HOLD_END ? 15 : 8);
    if (order.shapes.length === 2) order.stage = 'top';
    return true;
  }

  function refill(run) {
    if (run.day === 1 || run.rice > 1 || run.riceReadyAt !== null) return false;
    run.riceReadyAt = run.elapsed + RICE_COOK_TIME;
    return true;
  }

  function advance(run, delta) {
    run.elapsed += delta;
    if (run.riceReadyAt !== null && run.elapsed >= run.riceReadyAt) {
      run.rice = Math.min(RICE_CAPACITY, run.rice + 2);
      run.riceReadyAt = null;
    }
  }

  function patienceLeft(run, order) {
    return order.patience === null ? 1 : Math.max(0, 1 - (run.elapsed - order.arrivedAt) / order.patience);
  }

  function serve(run) {
    const order = activeOrder(run);
    if (order?.stage !== 'serve') return null;

    const matched = order.fish === order.selectedFish ? 50 : 0;
    const craft = order.type === 'roll'
      ? order.cuts.reduce((points, mark) => points + mark.points, 0)
      : order.shapes.reduce((points, portion) => points + portion, 0);
    const tip = Math.round(patienceLeft(run, order) * 20);
    const result = { ...order, matched, craft, tip, total: matched + craft + tip };

    run.served.push(result);
    run.orders = run.orders.filter(ticket => ticket.id !== order.id);
    addOrder(run);
    run.selected = run.orders[0]?.id ?? null;
    return result;
  }

  globalThis.NoriRules = Object.freeze({
    groups, ingredients, fishById, days, CUT_COUNT, GOOD_HOLD_START, GOOD_HOLD_END, HOLD_METER_END,
    plateName, startDay, activeOrder, canStart, selectFish, prepare, cutCenter, cut, shape, refill,
    advance, patienceLeft, serve,
  });
})();
