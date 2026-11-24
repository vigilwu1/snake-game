(function () {
  'use strict';

  const r = globalThis.NoriRules;
  const key = 'nori-counter.omakase.v3';
  const $ = id => document.getElementById(id);
  const dialog = $('pause-menu');
  const rangeEnd = 1600;
  const points = {
    slice: { from:[.75,.28], to:[.62,.66], start:'切片起点', end:'切片终点' },
    fill: { from:[.24,.36], to:[.72,.61], start:'拿起鱼料', end:'填到军舰' },
    place: { from:[.24,.36], to:[.72,.61], start:'拿起玉子烧', end:'盛到碟上' },
    pour: { from:[.24,.36], to:[.71,.60], start:'拿起汤勺', end:'盛进汤碗' },
  };
  const flavors = {
    opener: { cold:'客人想先来点清爽的', hot:'客人想先吃热的' },
  };
  const closeHints = { fill:'把鱼料放进海苔饭底', place:'把玉子烧放到碟上', pour:'端起汤勺，把汤盛进碗里' };
  let saved = load();
  let run = saved.run;
  let view = 'home';
  let foreground = !document.hidden;
  let lastTick = performance.now();
  let lastSave = lastTick;
  let scroll = 0;
  let gesture = null;
  let animation = 0;
  let armed = false;
  let suppressClick = false;
  let serving = 0;
  let sliceTransition = 0;

  function asset(name, ext = 'png') {
    return `omakase/${name}.${ext}`;
  }

  function escape(text) {
    return String(text ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  }

  function runValid(data, done) {
    if (!r.seatById[data?.seat] || !Number.isFinite(data.clock) || !Array.isArray(data.served) ||
      !Array.isArray(data.picks) || data.served.length > r.total || (data.served.length === r.total) !== done) return false;
    return data.served.every(item => r.byId[item?.id] && Number.isFinite(item.points)) &&
      data.picks.every(id => r.byId[id]?.phase === 'nigiri') &&
      (!data.closeId || r.byId[data.closeId]) &&
      (!data.batch || (r.batches.includes(data.batch.kind) && Array.isArray(data.batch.ids) &&
      data.batch.ids.length === 2 && data.batch.ids.every(id => r.byId[id]?.phase === 'nigiri') &&
      Array.isArray(data.batch.surface) && data.batch.surface.length === 3 &&
      data.batch.surface.every(Number.isFinite)));
  }

  function load() {
    const empty = { version:3, run:null, best:{}, last:null };
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (data?.version !== 3) return empty;
      const best = Object.fromEntries(r.seats.map(seat => [seat.id,Number.isFinite(data.best?.[seat.id]) ? data.best[seat.id] : null]));
      return { ...empty,best,run:runValid(data.run,false) ? data.run : null,last:runValid(data.last,true) ? data.last : null };
    } catch {
      return empty;
    }
  }

  function save() {
    saved.run = run;
    lastSave = performance.now();
    try {
      localStorage.setItem(key,JSON.stringify(saved));
    } catch {
      $('save-notice').hidden = false;
    }
  }

  function announce(message) {
    $('announcement').textContent = message;
  }

  function switchView(name) {
    if (name !== 'shift') {
      clearTimeout(serving);
      serving = 0;
      $('shift').querySelector('.service-note')?.remove();
    }
    view = name;
    $('app').dataset.view = name;
    for (const page of ['home','shift','report']) $(page).hidden = page !== name;
    $('pause').hidden = name !== 'shift';
    if (name !== 'shift') $('position').textContent = '';
    lastTick = performance.now();
  }

  function image(name, cls = '', ext) {
    return `<img class="${cls}" src="${asset(name,ext)}" alt="" draggable="false">`;
  }

  function food(id, entry, extra = '') {
    const recipe = r.byId[id];
    if (recipe.phase === 'nigiri') {
      const garnish = entry?.sauce ? `<span class="dish-season ${entry.sauce === 'yuzu' ? 'is-yuzu' : 'is-soy'}"></span>` : '';
      const shape = Number.isFinite(entry?.shape) ? Math.max(.73,Math.min(1.25,entry.shape)) : 1;
      return `<span class="food food--nigiri ${extra}" style="--rice-size:${shape}" aria-hidden="true">
        ${image('rice','rice-base')}${image(id,`topping${entry?.deep ? ' overdone' : ''}`)}${garnish}</span>`;
    }
    const plated = recipe.phase === 'gunkan' ? image('nori-cup','cup') + image(id,'filling')
      : id === 'octopus' && entry?.sauce !== 'yuzu'
        ? image('empty-plate') + image('octopus-cut',`octopus-layer${entry?.sauce === 'soy' ? ' soy-glaze' : ''}`)
        : image(id);
    return `<span class="food food--${recipe.phase === 'gunkan' ? 'gunkan' : 'plate'} ${extra}" aria-hidden="true">${plated}</span>`;
  }

  function scene(type, html) {
    $('scene').className = `scene ${type}`;
    $('scene').innerHTML = html;
  }

  function button(action,label,options = {}) {
    const { cls = 'primary',id,disabled = false } = options;
    return `<button type="button" class="${cls}" data-action="${action}"${id ? ` data-id="${id}"` : ''}${disabled ? ' disabled' : ''}>${label}</button>`;
  }

  function controls(content) {
    $('controls').innerHTML = content;
  }

  function home() {
    switchView('home');
    $('home').innerHTML = `<div class="home-scene bar">${food('chutoro')}<p>十六道 Omakase 晚席</p></div>
      <div class="home-options">
        ${run ? button('resume','继续当前晚席') : ''}
        ${r.seats.map(seat => `<button class="seat" type="button" data-action="start" data-id="${seat.id}" ${run ? 'disabled' : ''}>
          <span><strong>${seat.name}</strong><small>${seat.preference}</small></span>
          ${saved.best[seat.id] == null ? '' : `<span class="best">${saved.best[seat.id]} 分</span>`}
        </button>`).join('')}
        ${saved.last ? button('review','回看上一席',{cls:'secondary'}) : ''}
      </div>`;
  }

  function progress(count = run.served.length) {
    const shown = count === run.served.length ? run : {...run,served:run.served.slice(0,count)};
    const counts = r.phaseCounts(shown);
    const current = r.phase(shown);
    $('position').textContent = `已上 ${count} / ${r.total} 道`;
    $('phase').innerHTML = r.phases.map(part => `
      <span class="phase-part${part.id === current ? ' is-current' : ''}" ${part.id === current ? 'aria-current="step"' : ''}>
      ${part.label}<span>${counts[part.id]}/${part.count}</span></span>`).join('');
  }

  function steamCard() {
    return `<div class="steam-card" id="steam-card">
      <div><strong>茶碗蒸</strong><span id="steam-message"></span></div>
      <button class="steam-button" type="button" id="steam-button" data-action="steam"></button>
      <span class="steam-progress" id="steam-progress" aria-hidden="true"><i id="steam-fill"></i></span>
    </div>`;
  }

  function updateSteam() {
    const card = $('steam-card');
    if (!card || !run) return;
    const state = r.steam(run);
    card.dataset.state = state.state;
    const notes = {
      idle:'待加热', cooking:`还需 ${state.remaining} 秒`, ready:`可出锅 · 最佳 ${state.remaining} 秒`,
      late:'仍可出锅', served:'已上桌',
    };
    const label = $('steam-message');
    if (label.textContent !== notes[state.state]) label.textContent = notes[state.state];
    const action = $('steam-button');
    action.hidden = ['cooking','served'].includes(state.state);
    action.textContent = state.state === 'idle' ? '开蒸' : '出锅';
    $('steam-progress').hidden = state.state !== 'cooking';
    if (state.state === 'cooking') $('steam-fill').style.transform = `scaleX(${state.progress})`;
  }

  function sauceButtons(action) {
    return `<div class="sauces">${r.sauces.map(sauce => `
      <button class="sauce" type="button" data-action="${action}" data-id="${sauce.id}">
        <strong>${sauce.name} · ${sauce.label}</strong>${image(sauce.id,'','jpg')}
      </button>`).join('')}</div>`;
  }

  function opening() {
    const hasCold = r.coldServed(run);
    const isCold = !hasCold && run.openStation === 'cold';
    const seat = r.seatById[run.seat];
    if (hasCold) {
      const candidate = r.candidates(run);
      const picked = run.picks.length ? run.picks : candidate.slice(0,2).map(item => item.id);
      const problem = run.picks.length === 2 && r.pairStatus(run,run.picks);
      scene('bar',steamCard() + pairView(picked,'preview-pair') + '<span class="preview-label">成品预览</span>');
      controls(`<div class="menu-heading"><h2>先备第一批</h2><span>${problem || `已选 ${run.picks.length}/2`}</span></div>
      ${pickCards(candidate,run.picks,'pick-fish')}`);
      keepScroll(run.picks.at(-1));
    } else if (!isCold) {
      scene('steamer',steamCard() + `<span class="opening-guest">${flavors.opener[seat.opener]}</span>`);
      controls(`${button('cold-bench','先做章鱼',{id:'octopus'})}${button('cold-bench','做鱿鱼刺身',{cls:'secondary',id:'squid-sashimi'})}`);
    } else if (run.coldId === 'octopus' || run.coldPrep) {
      scene('bar',steamCard() + food(run.coldId,run.coldPrep ? { sauce:run.coldPrep.id } : null,'hero-food') +
        `<span class="preview-label">${run.coldPrep ? escape(run.coldPrep.note) : '冷菜备好'}</span>`);
      if (run.coldPrep) controls(button('serve-cold','上冷菜'));
      else controls(`<h2 class="section-title">给章鱼调味</h2>${sauceButtons('season-cold')}`);
    } else {
      const p = points.slice;
      scene('bench',steamCard() + `<div class="action-board opening-board" id="action-board" data-kind="slice">
        <span class="slice-slab">${image('squid','slice-main')}${image('squid','slice-tip')}</span><span class="knife-path"></span>
        ${dot(p,'from')}${dot(p,'to')}<span class="action-note" id="action-note" hidden></span></div>`);
      controls(`<p class="instruction">沿刀痕划一刀</p>${button('tap-mode','点按切片',{cls:'secondary'})}`);
    }
    updateSteam();
  }

  function pairView(ids, className = '', entries = null) {
    return `<div class="pair-view ${className}">${ids.map((id,index) => `<div class="pair-piece">
      ${food(id,entries?.[index])}<span>${r.byId[id].name}</span></div>`).join('')}</div>`;
  }

  function guestContext() {
    if (r.requestFresh(run)) return '客人想换一口清鲜';
    const kind = r.batchKind(run);
    if (kind === 'heat') return run.seat === 'seared' ? '客人想尝炙香，看看腹肉还在不在' : '这批留一道热手艺';
    if (kind === 'form') return `这一批两贯 · ${r.riceRange(run).label}`;
    return r.seatById[run.seat].preference;
  }

  function pickCards(items,selected,action) {
    return `<div class="recipe-strip" id="recipe-strip" role="group" aria-label="可用菜品" style="--visible:${Math.min(3,items.length)}">
      ${items.map(recipe => `<button class="recipe" type="button" data-action="${action}" data-id="${recipe.id}" aria-pressed="${selected.includes(recipe.id)}">
        <strong>${recipe.name}</strong><span class="flavor">${recipe.flavor}</span>${food(recipe.id)}
      </button>`).join('')}</div>`;
  }

  function keepScroll(selectedId) {
    const row = $('recipe-strip');
    if (!row) return;
    row.scrollLeft = scroll;
    if (selectedId) row.querySelector(`[data-id="${selectedId}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});
  }

  function batchMenu() {
    const index = r.batchIndex(run);
    const kind = r.batchKind(run);
    const problem = r.pairStatus(run,run.picks);
    const picked = run.picks.length ? run.picks : r.candidates(run).slice(0,2).map(item => item.id);
    scene('bar',pairView(picked,'preview-pair') + `<span class="guest-note">${guestContext()}</span><span class="preview-label">成品预览</span>`);
    const note = run.picks.length === 2 && problem ? problem : `已选 ${run.picks.length}/2`;
    controls(`<div class="menu-heading"><h2>第${index+1}批 · ${r.batchNames[kind]}</h2><span>${note}</span></div>
      ${pickCards(r.candidates(run),run.picks,'pick-fish')}${button('start-batch','备这一批',{disabled:Boolean(problem)})}`);
    keepScroll(run.picks.at(-1));
  }

  function batchWork() {
    const batch = run.batch;
    const { kind, ids, preparation } = batch;
    if (preparation) {
      const entries = ids.map((id,index) => ({ shape:preparation.shape,sauce:index === 0 ? preparation.sauce : null,
        deep:id === batch.cooked && preparation.deep }));
      const dishIds = ids.map(id => id === batch.cooked && preparation.torched ? 'salmon-seared' : id);
      scene('bar',pairView(dishIds,'preview-pair',entries) + `<span class="guest-note">${escape(preparation.note)}</span>`);
      controls(`${button('swap','换一下先后',{cls:'secondary'})}${button('serve-batch','依次上两贯')}`);
      return;
    }
    if (kind === 'form') {
      const target = r.riceRange(run);
      scene('bench',`<span class="guest-note">${target.label}</span>${pairView(ids,'form-reference')}
        <div class="form-rice" id="form-rice">${image('rice')}${image('rice')}</div>`);
      controls(`<p class="instruction" id="hold-instruction">这一批做两贯，指针入框时松手</p>
        <div class="form-meter" id="form-meter" aria-hidden="true" style="--low:${target.min/rangeEnd*100}%;--high:${target.max/rangeEnd*100}%"><span></span><i></i></div>
        ${button('hold','按住合握',{cls:'primary hold'})}`);
    } else if (kind === 'season') {
      scene('bar',pairView(ids,'preview-pair') + `<span class="guest-note">${guestContext()}</span>`);
      controls(`<h2 class="section-title">给先上的一贯调味</h2>${sauceButtons('season-batch')}`);
    } else if (kind === 'heat') {
      heatWork();
    } else {
      scene('bar',pairView(ids,'preview-pair') + `<span class="guest-note">${guestContext()}</span>`);
      controls(`<p class="instruction">先上${r.byId[ids[0]].name}，再上${r.byId[ids[1]].name}</p>
        ${button('swap','交换先后',{cls:'secondary'})}${button('confirm-order','就按这个顺序')}`);
    }
  }

  function heatWork() {
    const batch = run.batch;
    const torched = batch.cooked === 'salmon-belly';
    const hot = batch.ids.filter(id => r.hotCuts.includes(id));
    const ready = batch.surface.some(Boolean);
    scene('bench',`<span class="guest-note">${torched ? '炙三文鱼腹肉' : '刷汁煮穴子'}</span>
      <div class="heat-board" id="heat-board">
        ${image(batch.cooked,'heat-base')}
        ${[0,1,2].map(zone => image(torched ? 'salmon-seared' : 'anago',`heat-layer heat-layer-${zone}${torched ? '' : ' heat-glaze'}`)).join('')}
        <span class="heat-targets" aria-hidden="true"><i></i><i></i><i></i></span></div>
      <div class="heat-zones" aria-label="点按处理各段">${['左段','中段','右段'].map((name,zone) =>
        `<button type="button" class="zone" data-action="heat-zone" data-id="${zone}"><strong>${name}</strong><small id="zone-${zone}"></small></button>`).join('')}</div>`);
    controls(`${hot.length > 1 && !ready ? `<div class="heat-options">${hot.map(id => button('pick-heat',id === 'salmon-belly' ? '炙腹肉' : '刷穴子',{cls:`secondary${id === batch.cooked ? ' is-selected' : ''}`,id})).join('')}</div>` : ''}
      <p class="instruction">${torched ? '扫过鱼面三段，金黄处可以略过' : '从一端刷到另一端，让三段都沾上汁'}</p>
      ${button('finish-heat',torched ? '完成炙烧' : '完成刷汁',{disabled:!ready})}`);
    paintHeat();
  }

  function paintHeat() {
    if (run?.batch?.kind !== 'heat') return;
    const torched = run.batch.cooked === 'salmon-belly';
    run.batch.surface.forEach((value,zone) => {
      const layer = document.querySelector(`.heat-layer-${zone}`);
      const label = $(`zone-${zone}`);
      if (!layer || !label) return;
      layer.style.opacity = torched ? Math.min(.99,value / 170) : value > 0 ? .78 : 0;
      layer.style.filter = torched ? `brightness(${Math.max(.54,1 - Math.max(0,value-380)/930)})` : '';
      label.textContent = torched ? value === 0 ? '未炙' : value < 110 ? '偏浅' : value <= 400 ? '微金' : '偏深'
        : value ? '已刷好' : '待刷';
      label.parentElement.dataset.status = value === 0 ? 'idle' : value > 400 && torched ? 'over' : 'done';
    });
    const finish = document.querySelector('[data-action=finish-heat]');
    if (finish) finish.disabled = !run.batch.surface.some(Boolean);
  }

  function pointCss([x,y]) {
    return `--point-x:${x*100}%;--point-y:${y*100}%`;
  }

  function dot(target,key) {
    return `<button class="action-dot dot-${key}" type="button" data-action="point" data-id="${key}" style="${pointCss(target[key])}" aria-label="${key==='from' ? target.start : target.end}"><span></span></button>`;
  }

  function finale() {
    const phase = r.phase(run);
    const options = r.candidates(run);
    if (!run.closeId) {
      scene('bar',food(options[0].id,null,'hero-food') + '<span class="preview-label">成品预览</span>');
      controls(`<h2 class="section-title">${phase==='gunkan' ? '选一款军舰' : '选一道收尾'}</h2>${pickCards(options,[],'pick-close')}`);
      return;
    }
    if (run.closePrep) {
      scene('bar',food(run.closeId,null,'hero-food') + `<span class="guest-note">${escape(run.closePrep.note)}</span>`);
      controls(button('serve-close','上桌'));
      return;
    }
    const action = r.closeAction(run);
    const p = points[action];
    const source = action === 'pour' ? 'ladle' : action === 'place' ? 'tamago-cut' : run.closeId;
    const dest = { pour:'empty-bowl', place:'empty-plate', fill:'nori-cup' }[action];
    scene('bench',`<span class="guest-note">${r.byId[run.closeId].name}</span>
      <div class="action-board" id="action-board" data-kind="${action}">
        <span class="stage-item" style="${pointCss(p.from)}">${image(source)}</span>
        <span class="stage-item stage-base" style="${pointCss(p.to)}">${image(dest)}</span>
        <span class="stage-item stage-drag" hidden>${image(source)}</span>${dot(p,'from')}${dot(p,'to')}
        <span class="action-note" id="action-note" hidden></span></div>`);
    controls(`<p class="instruction">${closeHints[action]}</p>${button('tap-mode','点按操作',{cls:'secondary'})}`);
  }

  function render(saveNow = true) {
    armed = false;
    progress();
    const phase = r.phase(run);
    if (phase === 'starter') opening();
    else if (phase === 'nigiri') run.batch ? batchWork() : batchMenu();
    else if (phase) finale();
    if (saveNow) save();
  }

  function report(data) {
    switchView('report');
    const result = r.summarize(data);
    $('report').innerHTML = `<div class="report-head"><div><h2>收席</h2><p>${r.seatById[data.seat].name} · 16 道已上桌</p></div>
      <strong>${result.score}<span> 分</span></strong></div>
      <div class="score-summary"><p>手艺 ${result.craft} / 80</p><p>口味 ${result.palate} / 20</p></div>
      <p class="report-goal">${result.openingFit ? '开席合口' : '开席次序可再调整'} · ${result.prompt ? '客人口味达标' : '口味目标未齐'} · 清口衔接 ${result.balance}/8</p>
      <ol class="course-history">${data.served.map(item => `<li>${food(item.id,item)}<div><strong>${r.byId[item.id].name}</strong>
      <small>${escape(item.note)}${item.balance === true ? ' · 接得清爽' : item.balance === false ? ' · 还可以清一口' : ''}</small></div></li>`).join('')}</ol>
      <div class="report-buttons">${button('start','再开这一席',{id:data.seat})}${button('home','返回选席',{cls:'secondary'})}</div>`;
    $('report').scrollTop = 0;
  }

  function stepClock(now = performance.now()) {
    const delta = Math.max(0,now-lastTick);
    lastTick = now;
    if (!run || view !== 'shift' || dialog.open || !foreground || r.phase(run) !== 'starter') return;
    if (run.steamAt !== null && !['served','late'].includes(r.steam(run).state)) {
      run.clock += delta;
      updateSteam();
      if (now-lastSave >= 500) save();
    }
  }

  function finishMeal() {
    const completed = run;
    const score = r.summarize(completed).score;
    saved.best[completed.seat] = Math.max(score,saved.best[completed.seat] ?? 0);
    saved.last = completed;
    run = null;
    save();
    report(completed);
  }

  function serviceAnimation(items) {
    const label = document.createElement('div');
    label.className = 'service-note';
    label.setAttribute('aria-hidden','true');
    $('shift').append(label);
    controls('<p class="instruction">依次上桌</p>');
    const next = index => {
      if (index === items.length || view !== 'shift') {
        label.remove();
        serving = 0;
        if (view === 'shift') render(false);
        return;
      }
      progress(run.served.length - items.length + index + 1);
      label.textContent = `${r.byId[items[index].id].name}已上桌`;
      announce(label.textContent);
      serving = setTimeout(() => next(index+1),450);
    };
    next(0);
  }

  function start(id) {
    if (run || !r.seatById[id]) return;
    run = r.createRun(id);
    scroll = 0;
    switchView('shift');
    render();
  }

  function focus(selector) {
    document.querySelector(selector)?.focus({ preventScroll:true });
  }

  function message(text) {
    announce(text);
    const aria = $('action-note');
    if (aria) {
      aria.textContent = text;
      aria.hidden = false;
    }
  }

  function pointResult(kind,from,to) {
    const p = points[kind];
    const delta = Math.max(Math.hypot(from[0]-p.from[0],from[1]-p.from[1]),Math.hypot(to[0]-p.to[0],to[1]-p.to[1]));
    if (delta > .21 || (kind === 'slice' && to[1]-from[1] < .22)) {
      message(kind === 'slice' ? '再沿刀痕划一次' : '把食材放到标记处，再试一次');
      return;
    }
    const ratio = delta <= .08 ? 1 : delta <= .15 ? .75 : .5;
    if (kind !== 'slice') {
      if (r.finishClose(run,ratio)) render();
      return;
    }
    if (!r.sliceCold(run,ratio)) return;
    save();
    $('action-board')?.classList.add('is-sliced');
    clearTimeout(sliceTransition);
    sliceTransition = setTimeout(() => {
      sliceTransition = 0;
      if (view === 'shift') render();
    },170);
  }

  function pointClick(id,keyboard) {
    const board = $('action-board');
    const p = points[board?.dataset.kind];
    if (!p) return;
    if (id === 'from') {
      armed = true;
      board.classList.add('is-armed');
      message(`点按「${p.end}」`);
      if (keyboard) focus('.dot-to');
    } else if (armed) pointResult(board.dataset.kind,p.from,p.to);
    else message(`先点按「${p.start}」`);
  }

  function openingAction(action,id) {
    if (action === 'steam') {
      if (r.startSteam(run)) return true;
      if (!r.serveSteam(run)) return false;
      run.openStation = 'cold';
      announce('茶碗蒸已上桌');
      return true;
    }
    if (action === 'cold-bench' && r.pickCold(run,id)) {
      run.openStation = 'cold';
      return true;
    }
    if (action === 'season-cold') return r.seasonCold(run,id);
    if (action === 'serve-cold' && r.serveCold(run)) {
      run.openStation = 'steam';
      announce('小菜已上桌');
      return true;
    }
    return false;
  }

  function batchAction(action,id) {
    if (action === 'pick-fish') {
      scroll = $('recipe-strip')?.scrollLeft ?? 0;
      return r.pickFish(run,id);
    }
    if (action === 'start-batch') return r.beginBatch(run);
    if (action === 'season-batch') return r.seasonBatch(run,id);
    if (action === 'pick-heat') return r.pickHeat(run,id);
    if (action === 'finish-heat') return r.finishHeat(run);
    if (action === 'swap') return r.swap(run);
    if (action === 'confirm-order') return r.confirmOrder(run);
    return false;
  }

  function openPause() {
    if (view !== 'shift' || dialog.open) return;
    stepClock();
    cancelGesture();
    save();
    dialog.showModal();
  }

  function click(event) {
    if (suppressClick && event.detail > 0) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    const target = event.target.closest('button[data-action]');
    if (!target || target.disabled) return;
    const { action,id } = target.dataset;
    const keyboard = event.detail === 0;
    if (action === 'start') return start(id);
    if (action === 'pause') return openPause();
    if (action === 'continue') return dialog.close();
    if (action === 'home') {
      if (dialog.open) dialog.close();
      cancelGesture();
      home();
      return;
    }
    if (action === 'resume' && run) {
      switchView('shift');
      render();
      return;
    }
    if (action === 'review' && saved.last) return report(saved.last);
    if (view !== 'shift' || dialog.open || serving || sliceTransition) return;
    stepClock();
    const phase = r.phase(run);
    if (action === 'point') return pointClick(id,keyboard);
    if (action === 'tap-mode') {
      const kind = $('action-board')?.dataset.kind;
      if (points[kind]) message(`依次点按「${points[kind].start}」「${points[kind].end}」`);
      focus('.dot-from');
      return;
    }
    if (action === 'heat-zone') {
      if (r.spread(run,Number(id),160)) {
        paintHeat();
        save();
      }
      return;
    }
    if (action === 'serve-batch' && r.serveBatch(run)) {
      scroll = 0;
      save();
      serviceAnimation(run.served.slice(-2));
      return;
    }
    if (action === 'serve-close' && r.serveClose(run)) {
      if (r.phase(run)) render();
      else finishMeal();
      return;
    }
    const changed = action === 'pick-fish' ? batchAction(action,id)
      : phase === 'starter' ? openingAction(action,id) : phase === 'nigiri' ? batchAction(action,id)
      : action === 'pick-close' && r.pickClose(run,id);
    if (changed) {
      render();
      if (keyboard && action === 'pick-fish') focus(`.recipe[data-id="${id}"]`);
      else if (keyboard) focus('#controls .primary:not(:disabled), #controls .sauce, #controls .secondary');
    }
  }

  function location(event,board) {
    const rect = board.getBoundingClientRect();
    return [(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height];
  }

  function readyForInput() {
    return view === 'shift' && !dialog.open && foreground && !serving && !sliceTransition;
  }

  function holdStart(pointer,source) {
    if (gesture || !readyForInput() || run?.batch?.kind !== 'form' || run.batch.preparation) return false;
    gesture = { kind:'hold',pointer,source,start:performance.now() };
    animation = requestAnimationFrame(animate);
    return true;
  }

  function zoneAt([x,y]) {
    return x >= 0 && x < 1 && y >= .1 && y <= .9 ? Math.min(2,Math.floor(x*3)) : null;
  }

  function heatTick(now) {
    if (gesture?.kind !== 'heat') return;
    const delta = Math.max(0,Math.min(100,now-gesture.last));
    gesture.last = now;
    if (gesture.zone === null) return;
    const torched = run.batch.cooked === 'salmon-belly';
    if (torched || !run.batch.surface[gesture.zone]) {
      r.spread(run,gesture.zone,torched ? delta : 200);
      paintHeat();
    }
  }

  function animate(now) {
    if (!gesture) return;
    if (gesture.kind === 'hold') {
      const duration = now-gesture.start;
      const minMax = r.riceRange(run);
      $('form-meter')?.style.setProperty('--held',Math.min(1,duration/rangeEnd));
      $('form-rice')?.style.setProperty('--shape',Math.max(.7,Math.min(1.26,.7 + .56 * duration/rangeEnd)));
      $('hold-instruction').textContent = duration >= minMax.min && duration <= minMax.max ? '现在松手' : duration > minMax.max ? '饭团开始偏大' : '再按一会';
    } else if (gesture.kind === 'heat') {
      heatTick(now);
    }
    animation = requestAnimationFrame(animate);
  }

  function cancelGesture(commit = false,event = null) {
    if (!gesture) return;
    const current = gesture;
    if (current.kind === 'heat' && commit) heatTick(performance.now());
    gesture = null;
    cancelAnimationFrame(animation);
    if (current.kind === 'hold') {
      const duration = performance.now()-current.start;
      if (commit && duration >= 150 && readyForInput() && r.form(run,duration)) {
        suppressClick = current.source === 'pointer';
        render();
        if (current.source === 'key') focus('[data-action=serve-batch]');
      } else {
        $('form-meter')?.removeAttribute('data-held');
        $('form-meter')?.style.removeProperty('--held');
        $('form-rice')?.style.removeProperty('--shape');
        if ($('hold-instruction')) $('hold-instruction').textContent = '这一批做两贯，指针入框时松手';
      }
    } else if (current.kind === 'heat') {
      paintHeat();
      save();
    } else {
      const ghost = current.board.querySelector('.stage-drag');
      if (ghost) ghost.hidden = true;
      current.board.classList.remove('is-dragging');
      if (commit && event && current.moved && readyForInput()) {
        suppressClick = true;
        pointResult(current.type,current.origin,location(event,current.board));
      }
    }
  }

  document.addEventListener('click',click);
  document.addEventListener('pointerdown',event => {
    suppressClick = false;
    if (event.button !== 0 || gesture || !readyForInput()) return;
    const hold = event.target.closest('.hold');
    if (hold && holdStart(event.pointerId,'pointer')) {
      event.preventDefault();
      hold.setPointerCapture(event.pointerId);
      return;
    }
    const hot = event.target.closest('#heat-board');
    if (hot && run?.batch?.kind === 'heat' && !run.batch.preparation) {
      event.preventDefault();
      gesture = { kind:'heat',pointer:event.pointerId,board:hot,zone:zoneAt(location(event,hot)),last:performance.now() };
      hot.setPointerCapture(event.pointerId);
      animation = requestAnimationFrame(animate);
      return;
    }
    const dot = event.target.closest('.dot-from');
    const board = $('action-board');
    if (!dot || !board) return;
    gesture = { kind:'drag', pointer:event.pointerId,board,type:board.dataset.kind,origin:location(event,board),
      x:event.clientX,y:event.clientY,moved:false };
    dot.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove',event => {
    if (gesture?.pointer !== event.pointerId) return;
    if (gesture.kind === 'heat') {
      heatTick(performance.now());
      gesture.zone = zoneAt(location(event,gesture.board));
    } else if (gesture.kind === 'drag') {
      gesture.moved ||= Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y) >= 11;
      if (!gesture.moved) return;
      gesture.board.classList.add('is-dragging');
      const ghost = gesture.board.querySelector('.stage-drag');
      if (ghost) {
        ghost.hidden = false;
        ghost.style.cssText = pointCss(location(event,gesture.board));
      }
    }
  });
  document.addEventListener('pointerup',event => {
    if (gesture?.pointer === event.pointerId) cancelGesture(true,event);
  });
  for (const type of ['pointercancel','lostpointercapture']) document.addEventListener(type,event => {
    if (gesture?.pointer === event.pointerId) cancelGesture();
  });
  document.addEventListener('keydown',event => {
    if (event.key === 'Escape' && view === 'shift' && !dialog.open) {
      event.preventDefault();
      openPause();
    }
    if (event.target.closest('.hold') && [' ','Enter'].includes(event.key)) {
      event.preventDefault();
      if (!event.repeat) holdStart(null,'key');
    }
  });
  document.addEventListener('keyup',event => {
    if (gesture?.source === 'key' && [' ','Enter'].includes(event.key)) {
      event.preventDefault();
      cancelGesture(true);
    }
  });
  dialog.addEventListener('close',() => { lastTick = performance.now(); });
  window.addEventListener('blur',() => cancelGesture());
  document.addEventListener('visibilitychange',() => {
    stepClock();
    foreground = !document.hidden;
    lastTick = performance.now();
    if (!foreground) {
      cancelGesture();
      save();
    }
  });
  window.addEventListener('pagehide',() => {
    stepClock();
    save();
  });
  setInterval(stepClock,100);
  home();
})();
