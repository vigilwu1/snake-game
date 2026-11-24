(function () {
  'use strict';

  const rules = globalThis.NoriRules;
  const storageKey = 'nori-counter.v1';
  const $ = id => document.getElementById(id);
  const asset = name => `assets/${name}.png`;
  const screens = ['home', 'shift', 'report'];
  const state = load();
  const pauseMenu = $('pause-menu');

  let run = state.run;
  let view = 'home';
  let foreground = !document.hidden;
  let lastTick = performance.now();
  let lastSave = lastTick;
  let hold = null;
  let holdFrame = 0;
  let toastTimer = 0;

  function load() {
    const empty = { version: 1, unlocked: 1, best: {}, run: null };
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved?.version !== 1 || !rules.days[saved.unlocked - 1] || !saved.best) return empty;
      const current = saved.run;
      if (current && (!rules.days[current.day - 1] || !Array.isArray(current.queue) || !Array.isArray(current.served) ||
        !Array.isArray(current.orders) || !current.orders.length || !rules.activeOrder(current) ||
        current.orders.some(order => !rules.fishById[order.fish] || !Array.isArray(order.cuts) || !Array.isArray(order.shapes)))) {
        saved.run = null;
      }
      return saved;
    } catch {
      return empty;
    }
  }

  function save() {
    lastSave = performance.now();
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      $('save-note').hidden = false;
    }
  }

  function changeView(nextView) {
    view = nextView;
    $('app').dataset.view = nextView;
    for (const screen of screens) $(screen).hidden = screen !== nextView;
    $('pause-button').hidden = nextView !== 'shift';
    $('day-label').textContent = nextView === 'home' ? '' : `第${run.day}天`;
    lastTick = performance.now();
  }

  function nigiriDish(fishId, portions = 2) {
    return `<span class="nigiri-pair" aria-hidden="true">${[0, 1].map(index => {
      if (index >= portions) return '<span class="nigiri-piece is-empty"></span>';
      return `<span class="nigiri-piece">
        <img class="rice-base" src="${asset('rice')}" alt="" draggable="false">
        ${fishId ? `<img class="fish-top" src="${asset(fishId)}" alt="" draggable="false">` : ''}
      </span>`;
    }).join('')}</span>`;
  }

  function makiDish(fishId, cuts) {
    const boundaries = [0, ...(cuts?.map(mark => mark.position) ?? []), 1];
    const widths = cuts ? boundaries.slice(1).map((end, index) => (end - boundaries[index]) * 6) : Array(6).fill(1);
    return `<span class="maki-set" aria-hidden="true" style="--fish-color:${rules.fishById[fishId].color}">${widths.map(width =>
      `<span class="maki" style="--piece-width:${Math.max(.58, Math.min(1.18, width))}"><img src="${asset(fishId)}" alt="" draggable="false"></span>`).join('')}</span>`;
  }

  function dish(type, fishId, cuts) {
    return type === 'nigiri' ? nigiriDish(fishId) : makiDish(fishId, cuts);
  }

  function showHome() {
    changeView('home');
    $('home').innerHTML = `
      <div class="home-hero">${nigiriDish('salmon-belly')}</div>
      <div class="home-panel">
        <button class="primary" type="button" data-action="${state.run ? 'continue' : 'start'}" data-day="${state.unlocked}">${state.run ? `继续第${state.run.day}天` : '开始营业'}</button>
        <div class="day-list">${rules.days.map((day, index) => {
          const number = index + 1;
          const locked = number > state.unlocked;
          return `<button class="day-choice" type="button" data-action="start" data-day="${number}" ${locked || state.run ? 'disabled' : ''}>
            <strong>第${number}天 · ${day.name}</strong><small>${day.detail}</small>
            ${locked ? '<span>待解锁</span>' : state.best[number] !== undefined ? `<span>最高 ${state.best[number]} 分</span>` : ''}
          </button>`;
        }).join('')}</div>
      </div>`;
  }

  function start(day) {
    if (!rules.days[day - 1] || day > state.unlocked || state.run) return;
    run = rules.startDay(day);
    state.run = run;
    save();
    showShift();
  }

  function showShift() {
    run = state.run;
    changeView('shift');
    $('toast').hidden = true;
    renderShift();
  }

  function renderOrders() {
    $('orders').innerHTML = run.orders.map(order => {
      const fish = rules.fishById[order.fish];
      const family = fish.group === 'seafood' ? fish.name : rules.groups.find(group => group.id === fish.group).label;
      const style = order.type === 'roll' ? '卷' : '握寿司';
      const variant = fish.group === 'seafood' ? style : `${fish.label}${style}`;
      return `<button type="button" class="order" data-action="order" data-id="${order.id}" data-focus="order-${order.id}"
        aria-pressed="${order.id === run.selected}" aria-label="订单 ${rules.plateName(order.type, order.fish)}">
          <span class="dish-mini">${dish(order.type, order.fish)}</span>
          <span class="order-title">${family}<small>${variant}</small></span>
          <span class="order-progress" aria-hidden="true"><span class="progress-track"><span class="progress-fill"></span></span><small></small></span>
        </button>`;
    }).join('');
  }

  function scene(photo, content, extra = '') {
    return `<div class="scene ${extra}"><img class="scene-photo" src="assets/${photo}.jpg" alt="" draggable="false">${content}</div>`;
  }

  function cutScene(order, animated) {
    const index = order.cuts.length;
    const center = rules.cutCenter(index) * 100;
    const halfBand = 50 / (rules.CUT_COUNT + 1);
    return scene('plate', `<div class="roll-log${animated ? ' is-rolling' : ''}" style="--fish-color:${rules.fishById[order.selectedFish].color}">
        <span class="roll-end"></span>
        ${order.cuts.map(mark => `<span class="cut-mark" style="left:${mark.position * 100}%"></span>`).join('')}
        <span class="cut-mark is-guide" style="left:${center}%"></span>
        <button type="button" class="cut-target" data-action="cut" data-focus="cut" style="--cut-left:${center - halfBand}%"
          aria-label="切第${index + 1}刀"><span class="cut-number" aria-hidden="true">第${index + 1}刀</span></button>
      </div>`);
  }

  function fishControls(order, outOfRice) {
    const options = rules.ingredients.filter(fish => fish.group === order.tab);
    return `<div class="tabs" role="group" aria-label="鱼料分类">${rules.groups.map(group =>
      `<button type="button" class="tab" data-action="tab" data-id="${group.id}" data-focus="tab-${group.id}" aria-pressed="${group.id === order.tab}">${group.label}</button>`).join('')}</div>
      <div class="trays" style="--trays:${options.length}">${options.map(fish =>
        `<button type="button" class="tray" data-action="fish" data-id="${fish.id}" data-focus="fish-${fish.id}" aria-label="${fish.name}"
          aria-pressed="${fish.id === order.selectedFish}" ${outOfRice ? 'disabled' : ''}><img src="${asset(fish.id)}" alt="" draggable="false"><span>${fish.label}</span></button>`).join('')}</div>
      <button type="button" class="primary" data-action="prepare" data-focus="prepare" ${order.selectedFish ? '' : 'disabled'}>${order.stage === 'fill' ? '卷起来' : '盖上鱼料'}</button>`;
  }

  function renderStation(animated = false) {
    const order = rules.activeOrder(run);
    const orderFish = rules.fishById[order.fish];
    const outOfRice = !rules.canStart(run, order);
    const labels = {
      fill: '铺鱼料',
      cut: `切卷 ${order.cuts.length}/${rules.CUT_COUNT}`,
      shape: `捏饭团 ${order.shapes.length}/2`,
      top: '盖鱼料',
      serve: '上菜',
    };
    $('step-label').textContent = labels[order.stage];

    let board;
    let hint;
    let controls;
    if (order.stage === 'fill') {
      const toppings = order.selectedFish ? `<div class="fish-line" aria-hidden="true">${Array.from({ length: 5 }, () =>
        `<img src="${asset(order.selectedFish)}" alt="" draggable="false">`).join('')}</div>` : '';
      board = scene('mat', outOfRice ? '<span class="scene-note">米饭用完了</span>' : toppings, outOfRice ? 'is-empty' : '');
      hint = run.day === 1 ? `点选${orderFish.name}，再卷起来` : '按小票选择鱼料和部位';
      controls = fishControls(order, outOfRice);
    } else if (order.stage === 'cut') {
      board = cutScene(order, animated);
      hint = '沿高亮刀痕，依次点切';
      controls = '<div class="cut-instruction">五刀切成六块</div>';
    } else if (order.stage === 'shape') {
      board = scene('plate', outOfRice ? '<span class="scene-note">米饭用完了</span>' : nigiriDish(null, order.shapes.length), outOfRice ? 'is-empty' : '');
      hint = '指针进入绿色区时松手';
      controls = `<div class="hold-meter" aria-hidden="true"><span class="hold-zone"></span><span class="hold-fill"></span><span class="hold-needle"></span></div>
        <button class="primary hold-button" type="button" data-action="shape" data-focus="shape" ${outOfRice ? 'disabled' : ''}>按住捏饭</button>`;
    } else if (order.stage === 'top') {
      board = scene('plate', nigiriDish(null));
      hint = '选好鱼料，盖到两贯饭团上';
      controls = fishControls(order, outOfRice);
    } else {
      board = scene('plate', dish(order.type, order.selectedFish, order.cuts));
      hint = `已做好 · ${rules.plateName(order.type, order.selectedFish)}`;
      controls = '<button class="primary" type="button" data-action="serve" data-focus="serve">送上桌</button>';
    }

    $('board').innerHTML = board;
    $('step-hint').textContent = outOfRice ? '用右上方的米饭按钮补锅' : hint;
    $('controls').innerHTML = controls;
  }

  function renderShift(animated = false) {
    renderOrders();
    renderStation(animated);
    updateClockDisplay();
  }

  function updateClockDisplay() {
    for (const card of $('orders').querySelectorAll('.order')) {
      const order = run.orders.find(ticket => ticket.id === Number(card.dataset.id));
      if (!order) continue;
      const left = rules.patienceLeft(run, order);
      card.querySelector('.progress-fill').style.transform = `scaleX(${left})`;
      card.querySelector('.order-progress small').textContent = order.patience === null ? '练习' : `${Math.ceil(order.patience * left / 1000)} 秒`;
      card.classList.toggle('is-urgent', left <= .30);
    }

    const rice = $('rice');
    const cooking = run.riceReadyAt !== null;
    const readyIn = cooking ? Math.ceil((run.riceReadyAt - run.elapsed) / 1000) : 0;
    rice.disabled = run.day === 1 || run.rice > 1 || cooking;
    const label = cooking ? `米饭 ×${run.rice}<small>煮饭 ${readyIn}秒</small>` : `米饭 ×${run.rice}${rice.disabled ? '' : '<small>补饭</small>'}`;
    if (rice.innerHTML !== label) rice.innerHTML = label;
  }

  function syncClock(now = performance.now()) {
    const delta = Math.max(0, now - lastTick);
    lastTick = now;
    if (view !== 'shift' || !foreground || pauseMenu.open) return;

    const blocked = !rules.canStart(run, rules.activeOrder(run));
    const cooking = run.riceReadyAt !== null;
    rules.advance(run, delta);
    if (cooking && run.riceReadyAt === null) {
      if (blocked) renderStation();
      toast('米饭好了 · +2份');
      save();
    }
    updateClockDisplay();
    if (now - lastSave >= 1000) save();
  }

  function toast(message) {
    const element = $('toast');
    clearTimeout(toastTimer);
    element.textContent = message;
    element.hidden = false;
    toastTimer = setTimeout(() => { element.hidden = true; }, 2100);
  }

  function showReport() {
    const points = run.served.reduce((total, result) => total + result.total, 0);
    state.best[run.day] = Math.max(state.best[run.day] ?? 0, points);
    state.unlocked = Math.min(rules.days.length, Math.max(state.unlocked, run.day + 1));
    state.run = null;
    save();
    changeView('report');

    const tips = run.served.reduce((total, result) => total + result.tip, 0);
    const accurate = run.served.filter(result => result.matched === 50).length;
    $('report').innerHTML = `
      <div class="report-title"><h2>今日收摊</h2><p>${points} / ${run.served.length * 100} 分</p></div>
      <p class="report-meta">鱼料选对 ${accurate}/${run.served.length} 单 · 小费 ${tips} 分</p>
      <ol class="receipt-list">${run.served.map(result => `<li class="receipt">
        <div class="dish-mini">${dish(result.type, result.selectedFish)}</div>
        <div><strong>${rules.plateName(result.type, result.fish)}</strong>
        <small>${result.matched ? `鱼料 ${result.matched} · 制作 ${result.craft} · 小费 ${result.tip}` : `实做 ${rules.fishById[result.selectedFish].name} · 鱼料 0 分`}</small></div>
        <span>${result.total}</span></li>`).join('')}</ol>
      <div class="report-actions">
        ${run.day < rules.days.length ? `<button class="primary" type="button" data-action="start" data-day="${run.day + 1}">开始第${run.day + 1}天</button>` : ''}
        <div class="report-alt"><button class="${run.day === rules.days.length ? 'primary' : 'secondary'}" type="button" data-action="start" data-day="${run.day}">再营业一天</button>
        <button class="secondary" type="button" data-action="home">返回选日</button></div>
      </div>`;
    $('report').scrollTop = 0;
  }

  function restoreFocus(key, fallback = '#controls button:not(:disabled)') {
    const target = key && document.querySelector(`[data-focus="${CSS.escape(key)}"]`);
    (target || document.querySelector(fallback))?.focus({ preventScroll: true });
  }

  function pause() {
    if (view !== 'shift' || pauseMenu.open) return;
    syncClock();
    cancelHold();
    save();
    pauseMenu.showModal();
  }

  function resume() {
    pauseMenu.close();
    lastTick = performance.now();
  }

  function onClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const { action, id, day, focus } = button.dataset;
    const keyboard = event.detail === 0;

    if (action === 'home') {
      if (pauseMenu.open) resume();
      showHome();
      if (keyboard) $('home').querySelector('button')?.focus();
      return;
    }
    if (action === 'start' || action === 'continue') {
      if (action === 'start') start(Number(day));
      else if (state.run) showShift();
      if (keyboard) $('orders').querySelector('button')?.focus();
      return;
    }
    if (action === 'pause') return pause();
    if (action === 'resume') return resume();
    if (view !== 'shift' || pauseMenu.open) return;
    syncClock();

    if (action === 'rice') {
      if (rules.refill(run)) save();
      updateClockDisplay();
      return;
    }

    let focusNext = focus;
    let animated = false;
    if (action === 'order') {
      cancelHold();
      run.selected = Number(id);
    } else if (action === 'tab') {
      rules.activeOrder(run).tab = id;
    } else if (action === 'fish') {
      if (!rules.selectFish(run, id)) return;
    } else if (action === 'prepare') {
      if (!rules.prepare(run)) return;
      animated = rules.activeOrder(run).stage === 'cut';
      focusNext = animated ? 'cut' : 'serve';
    } else if (action === 'cut') {
      const log = button.closest('.roll-log');
      const bounds = log.getBoundingClientRect();
      const cutIndex = rules.activeOrder(run).cuts.length;
      const position = keyboard ? rules.cutCenter(cutIndex) : (event.clientX - bounds.left) / bounds.width;
      if (!rules.cut(run, position)) return;
      focusNext = rules.activeOrder(run).stage === 'serve' ? 'serve' : 'cut';
    } else if (action === 'serve') {
      const result = rules.serve(run);
      if (!result) return;
      const feedback = result.matched ? `鱼料选对了 · ${result.total} 分` : `小票点的是${rules.fishById[result.fish].name} · ${result.total} 分`;
      if (!run.orders.length) {
        showReport();
        if (keyboard) $('report').querySelector('button')?.focus();
        return;
      }
      toast(feedback);
      focusNext = `order-${run.selected}`;
    } else {
      return;
    }

    save();
    renderShift(animated);
    if (keyboard) restoreFocus(focusNext);
  }

  function startHold(button, source, pointerId) {
    if (hold || view !== 'shift' || pauseMenu.open || button.disabled || !foreground) return false;
    hold = { order: run.selected, started: performance.now(), source, pointerId };
    holdFrame = requestAnimationFrame(paintHold);
    return true;
  }

  function paintHold(now) {
    const meter = document.querySelector('.hold-meter');
    if (!hold || !meter) return;
    const duration = now - hold.started;
    const fraction = Math.min(1, duration / rules.HOLD_METER_END);
    meter.querySelector('.hold-fill').style.transform = `scaleX(${fraction})`;
    meter.querySelector('.hold-needle').style.left = `min(calc(100% - 3px), ${fraction * 100}%)`;
    meter.classList.toggle('in-zone', duration >= rules.GOOD_HOLD_START && duration <= rules.GOOD_HOLD_END);
    holdFrame = requestAnimationFrame(paintHold);
  }

  function cancelHold() {
    hold = null;
    cancelAnimationFrame(holdFrame);
    const meter = document.querySelector('.hold-meter');
    if (meter) {
      meter.querySelector('.hold-fill').style.transform = 'scaleX(0)';
      meter.querySelector('.hold-needle').style.left = '0';
      meter.classList.remove('in-zone');
    }
  }

  function releaseHold() {
    if (!hold) return;
    const duration = performance.now() - hold.started;
    const valid = view === 'shift' && !pauseMenu.open && hold.order === run.selected && foreground;
    const keyboard = hold.source === 'key';
    cancelHold();
    if (!valid) return;
    syncClock();
    if (rules.shape(run, duration)) {
      const order = rules.activeOrder(run);
      toast(order.shapes.at(-1) === 15 ? '饭团捏得刚好' : '饭团已成型');
      save();
      renderShift();
      if (keyboard) restoreFocus(order.stage === 'shape' ? 'shape' : 'tab-' + order.tab);
    }
  }

  document.addEventListener('click', onClick);
  document.addEventListener('pointerdown', event => {
    const button = event.target.closest('button[data-action="shape"]');
    if (!button || event.button !== 0 || !startHold(button, 'pointer', event.pointerId)) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointerup', event => {
    if (hold?.source === 'pointer' && hold.pointerId === event.pointerId) releaseHold();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    document.addEventListener(type, event => {
      if (hold?.source === 'pointer' && hold.pointerId === event.pointerId) cancelHold();
    });
  }

  document.addEventListener('keydown', event => {
    const button = event.target.closest('button[data-action="shape"]');
    if (button && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      if (!event.repeat) startHold(button, 'key');
    } else if (event.key === 'Escape' && view === 'shift' && !pauseMenu.open) {
      event.preventDefault();
      pause();
    }
  });
  document.addEventListener('keyup', event => {
    if (hold?.source === 'key' && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      releaseHold();
    }
  });

  pauseMenu.addEventListener('close', () => { lastTick = performance.now(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      syncClock();
      foreground = false;
      cancelHold();
      if (state.run) save();
    } else {
      foreground = true;
      lastTick = performance.now();
    }
  });
  window.addEventListener('blur', cancelHold);
  window.addEventListener('pagehide', () => {
    if (!state.run) return;
    syncClock();
    save();
  });

  setInterval(syncClock, 125);
  showHome();
})();
