(function () {
  'use strict';

  const rules = globalThis.NoriRules;
  const key = 'nori-counter.omakase.v2';
  const $ = id => document.getElementById(id);
  const dialog = $('pause-menu');
  const phaseNames = { starter: '下一道小菜', nigiri: '下一贯', gunkan: '军舰', finish: '收尾' };
  const targets = {
    slice: { from: [.76, .26], to: [.63, .66], start: '切片起点', end: '切片终点' },
    place: { from: [.25, .36], to: [.72, .66], start: '拿起食材', end: '放到目标处' },
    garnish: { from: [.25, .34], to: [.67, .57], start: '拿起点缀', end: '点缀菜面' },
    brush: { from: [.31, .43], to: [.69, .49], start: '蘸取酱汁', end: '刷过穴子表面' },
    fill: { from: [.26, .36], to: [.70, .60], start: '舀起鱼料', end: '放入军舰' },
    pour: { from: [.25, .36], to: [.69, .59], start: '舀起味噌汤', end: '盛进碗里' },
  };

  let saved = readSave();
  let run = saved.run;
  let page = 'home';
  let touch = null;
  let tapArmed = false;
  let releaseClick = false;
  let hold = null;
  let animation = 0;
  let transition = 0;
  let menuScroll = 0;

  function asset(name) {
    return `omakase/${name}.png`;
  }

  function readSave() {
    const empty = { version: 2, best: {}, run: null, completed: null };
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      if (parsed?.version !== 2) return empty;
      const best = Object.fromEntries(rules.seats.map(seat => [seat.id,
        Number.isFinite(parsed.best?.[seat.id]) ? Math.max(0, Math.min(100, parsed.best[seat.id])) : null]));
      return {
        ...empty,
        best,
        run: restoreRun(parsed.run),
        completed: restoreRun(parsed.completed, true),
      };
    } catch {
      return empty;
    }
  }

  function restoreRun(previous, completed = false) {
    if (!rules.seatById[previous?.seat] || !Array.isArray(previous.served) ||
      previous.served.length > rules.total || completed !== (previous.served.length === rules.total)) return null;
    const restored = rules.createRun(previous.seat);
    for (const entry of previous.served) {
      if (!restoreEntry(restored, entry) || !rules.serve(restored)) return null;
    }
    if (previous.active && !restoreEntry(restored, previous.active)) return null;
    if (!restored.active) rules.select(restored, previous.selected);
    return restored;
  }

  function restoreEntry(restored, entry) {
    if (!Array.isArray(entry?.marks) || !rules.select(restored, entry.id) || !rules.begin(restored)) return false;
    return entry.marks.every(mark => rules.record(restored, mark.action, mark.rating, mark.detail));
  }

  function save() {
    saved.run = run;
    try {
      localStorage.setItem(key, JSON.stringify(saved));
    } catch {
      $('save-notice').hidden = false;
    }
  }

  function announce(message) {
    $('announcement').textContent = message;
  }

  function show(pageName) {
    page = pageName;
    $('app').dataset.view = page;
    for (const name of ['home', 'shift', 'report']) $(name).hidden = name !== page;
    $('pause').hidden = page !== 'shift';
    if (page !== 'shift') $('position').textContent = '';
  }

  function photo(name, cls = '') {
    return `<img class="${cls}" src="${asset(name)}" alt="" draggable="false">`;
  }

  function name(recipe) {
    return recipe.phase === 'nigiri' && recipe.id !== 'anago' ? `${recipe.name}握寿司` : recipe.name;
  }

  function food(recipe, entry = null, classes = '') {
    const place = entry?.marks.find(mark => mark.action === 'place' && mark.detail && typeof mark.detail === 'object');
    const move = place ? Math.max(-10, Math.min(10, (place.detail.x - .72) * 110)) : 0;
    if (recipe.phase === 'nigiri') {
      const seared = entry?.marks.find(mark => mark.action === 'sear');
      const topping = seared?.detail === 'early' ? 'salmon-belly' : recipe.preview;
      const finish = seared?.detail === 'late' ? ' overdone' : entry?.marks.some(mark => mark.action === 'brush') ? ' brushed' : '';
      return `<span class="food food--nigiri ${classes}" aria-hidden="true" style="--offset:${move}%">${photo('rice', 'rice-base')}${photo(topping, 'topping' + finish)}</span>`;
    }
    if (recipe.phase === 'gunkan') {
      return `<span class="food food--gunkan ${classes}" aria-hidden="true">${photo('nori-cup', 'cup')}${photo(recipe.preview, 'filling')}</span>`;
    }
    return `<span class="food food--plate ${classes}" aria-hidden="true">${photo(recipe.preview)}${recipe.id === 'chawan' ? photo('garnish', 'cup-garnish') : ''}</span>`;
  }

  function home() {
    show('home');
    $('home').innerHTML = `
      <div class="home-scene bar">${food(rules.byId.chutoro)}<p>十六道 Omakase 晚席</p></div>
      <div class="home-options">
        ${run ? '<button class="primary" type="button" data-action="resume">继续当前晚席</button>' : ''}
        ${rules.seats.map(seat => `<button class="seat" type="button" data-action="start" data-id="${seat.id}" ${run ? 'disabled' : ''}>
          <span><strong>${seat.name}</strong><small>${seat.preference}</small></span>
          ${saved.best[seat.id] == null ? '' : `<span class="best">${saved.best[seat.id]} 分</span>`}
        </button>`).join('')}
        ${saved.completed ? '<button class="secondary" type="button" data-action="review">回看上一席</button>' : ''}
      </div>`;
  }

  function start(id) {
    if (!rules.seatById[id] || run) return;
    run = rules.createRun(id);
    menuScroll = 0;
    show('shift');
    refresh();
  }

  function renderProgress() {
    const counts = rules.phaseCounts(run);
    const current = rules.phaseAt(run.served.length);
    $('position').textContent = `第${run.served.length + 1}道 / ${rules.total}`;
    $('phase').innerHTML = rules.phases.map(part => `
      <span class="phase-part${part.id === current?.id ? ' is-current' : ''}" ${part.id === current?.id ? 'aria-current="step"' : ''}>
        ${part.label}<span>${counts[part.id]}/${part.count}</span></span>`).join('');
  }

  function feedback(palate) {
    const seat = rules.seatById[run.seat];
    if (palate.palate) return '已符合客人口味';
    if (seat.id === 'seared' && run.served.some(entry => entry.id === 'salmon-belly')) return '腹肉已出品，本席仍可继续';
    if (seat.id === 'light' && run.served.length >= 8) return '前六贯清鲜目标已结算';
    return seat.note;
  }

  function menu() {
    const picks = rules.available(run);
    const recipe = picks.find(choice => choice.id === run.selected) ?? picks[0];
    const seat = rules.seatById[run.seat];
    const palate = rules.summarize(run);
    if (!recipe) return;
    rules.select(run, recipe.id);
    $('scene').className = 'scene bar';
    $('scene').innerHTML = `${food(recipe, null, 'hero-food')}
      <span class="guest-note">${feedback(palate)}</span>
      <span class="preview-label">成品预览</span>`;
    $('controls').innerHTML = `
      <div class="menu-heading"><h2>${phaseNames[recipe.phase]}</h2><span>${seat.preference}</span></div>
      <div class="recipe-strip" id="recipe-strip" role="group" aria-label="可用菜品" style="--visible:${Math.min(3,picks.length)}">
        ${picks.map(option => `<button class="recipe" type="button" data-action="pick" data-id="${option.id}" aria-pressed="${option.id === recipe.id}">
          <strong>${option.name}</strong><span class="flavor">${option.flavor}</span>
          ${food(option)}${option.ingredient === 'salmon-belly' ? '<small class="stock">剩1份</small>' : ''}
        </button>`).join('')}
      </div>
      <button class="primary" type="button" data-action="begin">做这道</button>`;
    const strip = $('recipe-strip');
    strip.scrollLeft = menuScroll;
    strip.querySelector('[aria-pressed="true"]').scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function point([x, y]) {
    return `--point-x:${x * 100}%;--point-y:${y * 100}%`;
  }

  function dot(descriptor, from) {
    return `<button class="point point--${from ? 'from' : 'to'}" type="button" data-action="point"
      data-point="${from ? 'from' : 'to'}" aria-label="${from ? descriptor.start : descriptor.end}" style="${point(from ? descriptor.from : descriptor.to)}"><span></span></button>`;
  }

  function workScenery(recipe, action) {
    const preparation = { 'squid-sashimi': 'squid', 'salmon-seared': 'salmon-belly', octopus: 'octopus-cut', tamago: 'tamago-cut' };
    const assetId = preparation[recipe.id] ?? recipe.preview;
    if (action === 'slice') {
      return `<span class="slab">${photo(assetId, 'slice-main')}${photo(assetId, 'slice-piece')}</span><span class="cut-line" aria-hidden="true"></span>
        ${recipe.phase === 'nigiri' ? `<span class="waiting-rice">${photo('rice')}</span>` : ''}`;
    }
    if (action === 'brush') {
      return `<span class="prepared">${food(recipe, run.active)}</span><span class="brush-trail" aria-hidden="true"></span>`;
    }
    const pieces = {
      place: {
        source: assetId,
        target: recipe.phase === 'nigiri' ? 'rice' : 'empty-plate',
      },
      fill: { source: assetId, target: 'nori-cup' },
      garnish: { source: 'garnish', target: recipe.preview },
      pour: { source: 'ladle', target: 'empty-bowl' },
    };
    const { source, target } = pieces[action];
    const base = action === 'garnish' && recipe.id === 'octopus'
      ? `${photo('empty-plate')}${photo('octopus-cut', 'ungarnished')}`
      : photo(target);
    return `<span class="work-item work-source" style="${point(targets[action].from)}">${photo(source)}</span>
      <span class="work-item work-base" style="${point(targets[action].to)}">${base}</span>
      <span class="work-item drag-ghost" hidden>${photo(source)}</span>`;
  }

  function craft() {
    const recipe = rules.byId[run.active.id];
    const action = rules.step(run);
    const last = run.active.marks.at(-1);
    const lastText = last ? rules.markMessage(last) : '';
    if (action === 'serve') {
      $('scene').className = 'scene bar';
      $('scene').innerHTML = `${food(recipe, run.active, 'hero-food')}<span class="guest-note">${name(recipe)}</span><span class="preview-label">已做好</span>`;
      $('controls').innerHTML = `<p class="last-note">${lastText}</p><button class="primary" type="button" data-action="serve">上桌</button>`;
      return;
    }

    $('scene').className = 'scene bench';
    const descriptor = targets[action];
    const frame = action === 'sear'
      ? `<div class="heat-dish" aria-hidden="true">${food(rules.byId['salmon-belly'])}
          <span class="heated">${food(recipe)}</span><span class="heat-light"></span></div>`
      : `${workScenery(recipe, action)}${dot(descriptor, true)}${dot(descriptor, false)}`;
    $('scene').innerHTML = `<div class="worktop worktop--${action}" id="worktop">
        <div class="work-label"><strong>${name(recipe)}</strong><span>${rules.actionInfo[action].title}</span></div>
        ${frame}<p class="work-feedback" id="work-feedback" ${lastText ? '' : 'hidden'}>${lastText}</p></div>`;
    const hint = action === 'place' && recipe.phase === 'nigiri' ? '把鱼片贴到醋饭上' : rules.actionInfo[action].hint;
    $('controls').innerHTML = action === 'sear'
      ? `<p class="instruction">${hint}</p><div class="heat-meter" aria-hidden="true"><span></span><i></i></div>
          <button class="primary hold" type="button" data-action="sear">按住炙烧</button>`
      : `<p class="instruction" id="instruction">${hint}</p>
          <button class="secondary" type="button" data-action="tap-mode">${action === 'slice' ? '点按切片' : '点按操作'}</button>`;
  }

  function refresh() {
    tapArmed = false;
    renderProgress();
    if (run.active) craft();
    else menu();
    save();
  }

  function report(data) {
    const result = rules.summarize(data);
    const seat = rules.seatById[data.seat];
    show('report');
    $('report').innerHTML = `
      <div class="report-head"><div><h2>收席</h2><p>${seat.name} · 16 道已上桌</p></div><strong>${result.score}<span> 分</span></strong></div>
      <div class="score-summary"><p>手艺 ${result.craft} / 80</p><p>口味 ${result.palate} / 20</p></div>
      <p class="report-goal">${result.palate ? '口味达标' : '口味未达标'} · ${seat.preference}</p>
      <ol class="course-history">${data.served.map(entry => {
        const recipe = rules.byId[entry.id];
        return `<li>${food(recipe, entry)}<div><strong>${name(recipe)}</strong>
          <small>${entry.marks.map(rules.markMessage).join(' · ')}</small></div></li>`;
      }).join('')}</ol>
      <div class="report-buttons"><button class="primary" type="button" data-action="start" data-id="${seat.id}">再开这一席</button>
      <button class="secondary" type="button" data-action="home">返回选席</button></div>`;
    $('report').scrollTop = 0;
  }

  function currentAction() {
    return page === 'shift' && !dialog.open && !document.hidden && !transition ? rules.step(run) : null;
  }

  function preserveMenuScroll() {
    menuScroll = $('recipe-strip')?.scrollLeft ?? 0;
  }

  function focusNext(selector) {
    document.querySelector(selector)?.focus({ preventScroll: true });
  }

  function screenPoint(event, board) {
    const rect = board.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
  }

  function distance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  function actionMessage(message) {
    const feedback = $('work-feedback');
    if (feedback) {
      feedback.textContent = message;
      feedback.hidden = false;
    }
    announce(message);
  }

  function commitAction(action, rating, detail, keyboard) {
    if (!rules.record(run, action, rating, detail)) return;
    announce(rules.markMessage(run.active.marks.at(-1)));
    const next = () => {
      transition = 0;
      refresh();
      if (keyboard) focusNext('#worktop .point--from, #controls button');
    };
    if (action === 'slice' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      save();
      $('worktop').classList.add('is-cut');
      transition = setTimeout(next, 190);
    } else next();
  }

  function applyPoint(action, from, to, keyboard = false) {
    const descriptor = targets[action];
    const offset = Math.max(distance(from, descriptor.from), distance(to, descriptor.to));
    const limit = action === 'slice' ? .18 : .23;
    if (offset > limit || (action === 'slice' && to[1] - from[1] < .22)) {
      actionMessage(action === 'slice' ? '从上方标记划到下方标记，再试一刀' : '放到标记范围内，再试一次');
      return;
    }
    const rating = offset <= .065 ? 1 : offset <= .14 ? .75 : .45;
    commitAction(action, rating, { x: to[0], y: to[1] }, keyboard);
  }

  function arm(keyboard) {
    tapArmed = true;
    $('worktop')?.classList.add('is-armed');
    if ($('instruction')) $('instruction').textContent = `点按「${targets[currentAction()].end}」`;
    if (keyboard) focusNext('.point--to');
  }

  function pointClick(button, keyboard) {
    const action = currentAction();
    if (!targets[action]) return;
    if (button.dataset.point === 'from') {
      arm(keyboard);
      return;
    }
    if (!tapArmed) {
      actionMessage(`先点按「${targets[action].start}」`);
      if (keyboard) focusNext('.point--from');
      return;
    }
    applyPoint(action, targets[action].from, targets[action].to, keyboard);
  }

  function touchStart(event) {
    const action = currentAction();
    if (touch || !targets[action] || event.button !== 0) return;
    const button = event.target.closest('.point--from');
    const board = $('worktop');
    if (!button || !board) return;
    touch = {
      action, pointer: event.pointerId, board, origin: screenPoint(event, board),
      x: event.clientX, y: event.clientY, moved: false,
    };
    button.setPointerCapture(event.pointerId);
  }

  function touchMove(event) {
    if (touch?.pointer !== event.pointerId) return;
    const at = screenPoint(event, touch.board);
    touch.moved ||= Math.hypot(event.clientX - touch.x, event.clientY - touch.y) >= 12;
    const ghost = touch.board.querySelector('.drag-ghost');
    if (!touch.moved) return;
    touch.board.classList.add('is-dragging');
    touch.board.style.setProperty('--gesture-travel', `${Math.min(1, distance(at, touch.origin) * 2.4)}`);
    if (ghost) {
      ghost.hidden = false;
      ghost.style.cssText = point(at);
    }
  }

  function finishTouch(event) {
    if (touch?.pointer !== event.pointerId) return;
    const gesture = touch;
    cancelTouch();
    if (gesture.moved && gesture.action === currentAction()) {
      releaseClick = true;
      applyPoint(gesture.action, gesture.origin, screenPoint(event, gesture.board));
    }
  }

  function cancelTouch() {
    if (!touch) return;
    touch.board.classList.remove('is-dragging');
    touch.board.querySelector('.drag-ghost')?.setAttribute('hidden', '');
    touch = null;
  }

  function startHold(source, pointer) {
    if (hold || currentAction() !== 'sear') return false;
    hold = { start: performance.now(), source, pointer };
    animation = requestAnimationFrame(paintHeat);
    return true;
  }

  function paintHeat(now) {
    if (!hold) return;
    const duration = now - hold.start;
    const cook = Math.max(0, Math.min(1, (duration - 220) / 700));
    const dark = Math.max(0, Math.min(.51, (duration - 1150) / 1600));
    const pot = document.querySelector('.heat-dish');
    const meter = document.querySelector('.heat-meter');
    pot?.style.setProperty('--cooked', cook);
    pot?.style.setProperty('--char', dark);
    pot?.classList.add('is-heating');
    meter?.style.setProperty('--heat', Math.min(1, duration / 1650));
    animation = requestAnimationFrame(paintHeat);
  }

  function stopHold(commit = false) {
    if (!hold) return;
    const { start, source } = hold;
    hold = null;
    cancelAnimationFrame(animation);
    document.querySelector('.heat-dish')?.classList.remove('is-heating');
    if (commit && currentAction() === 'sear') {
      const duration = performance.now() - start;
      if (duration >= 150) {
        const mark = rules.searRating(duration);
        commitAction('sear', mark.rating, mark.detail, source === 'key');
        return;
      }
    }
    document.querySelector('.heat-dish')?.removeAttribute('style');
    document.querySelector('.heat-meter')?.removeAttribute('style');
  }

  function cancelInput() {
    cancelTouch();
    stopHold();
    tapArmed = false;
    $('worktop')?.classList.remove('is-armed');
    if (transition) {
      clearTimeout(transition);
      transition = 0;
      if (page === 'shift') refresh();
    }
  }

  function setPause() {
    if (page !== 'shift' || dialog.open) return;
    cancelInput();
    save();
    dialog.showModal();
  }

  function click(event) {
    if (releaseClick && event.detail > 0) {
      releaseClick = false;
      event.preventDefault();
      return;
    }
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const keyboard = event.detail === 0;
    const { action, id } = button.dataset;
    if (action === 'start') {
      start(id);
      if (keyboard) focusNext('.recipe[aria-pressed="true"]');
    } else if (action === 'resume' && run) {
      show('shift');
      refresh();
    } else if (action === 'review' && saved.completed) {
      report(saved.completed);
    } else if (action === 'home') {
      if (dialog.open) dialog.close();
      cancelInput();
      home();
    } else if (action === 'pause') {
      setPause();
    } else if (action === 'continue') {
      dialog.close();
    } else if (page === 'shift' && !dialog.open) {
      if (action === 'pick' && rules.select(run, id)) {
        preserveMenuScroll();
        refresh();
        if (keyboard) focusNext('.recipe[aria-pressed="true"]');
      } else if (action === 'begin' && rules.begin(run)) {
        refresh();
        if (keyboard) focusNext('.point--from, #controls button');
      } else if (action === 'point') {
        pointClick(button, keyboard);
      } else if (action === 'tap-mode' && targets[currentAction()]) {
        const descriptor = targets[currentAction()];
        $('instruction').textContent = `依次点按「${descriptor.start}」「${descriptor.end}」`;
        focusNext('.point--from');
      } else if (action === 'serve' && rules.serve(run)) {
        menuScroll = 0;
        announce('已上桌');
        if (run.served.length === rules.total) {
          const completed = run;
          const score = rules.summarize(completed).score;
          saved.best[completed.seat] = Math.max(score, saved.best[completed.seat] ?? 0);
          saved.completed = completed;
          run = null;
          save();
          report(completed);
          if (keyboard) focusNext('.report-buttons .primary');
        } else {
          refresh();
          if (keyboard) focusNext('.recipe[aria-pressed="true"]');
        }
      }
    }
  }

  document.addEventListener('click', click);
  document.addEventListener('pointerdown', event => {
    releaseClick = false;
    const button = event.target.closest('.hold');
    if (button && event.button === 0 && startHold('pointer', event.pointerId)) {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
    } else {
      touchStart(event);
    }
  });
  document.addEventListener('pointermove', touchMove);
  document.addEventListener('pointerup', event => {
    finishTouch(event);
    if (hold?.source === 'pointer' && hold.pointer === event.pointerId) {
      releaseClick = true;
      stopHold(true);
    }
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    document.addEventListener(type, event => {
      if (touch?.pointer === event.pointerId) cancelTouch();
      if (hold?.source === 'pointer' && hold.pointer === event.pointerId) stopHold();
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && page === 'shift' && !dialog.open) {
      event.preventDefault();
      setPause();
    }
    if (event.target.closest('.hold') && [' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      if (!event.repeat) startHold('key');
    }
  });
  document.addEventListener('keyup', event => {
    if (hold?.source === 'key' && [' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      stopHold(true);
    }
  });
  window.addEventListener('blur', cancelInput);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelInput();
      save();
    }
  });
  window.addEventListener('pagehide', save);
  home();
})();
