(function () {
  'use strict';

  const phases = [
    { id: 'starter', label: '开席', count: 2 },
    { id: 'nigiri', label: '握寿司', count: 12 },
    { id: 'gunkan', label: '军舰', count: 1 },
    { id: 'finish', label: '收尾', count: 1 },
  ];
  const total = 16;
  const batches = ['form', 'season', 'form', 'heat', 'form', 'order'];
  const batchNames = { form: '合握', season: '调味', heat: '热工位', order: '决定先后' };
  const recipes = [
    ['chawan','蛤蜊茶碗蒸','starter','温鲜'],
    ['octopus','章鱼小菜','starter','鲜香'],
    ['squid-sashimi','鱿鱼刺身','starter','清鲜','squid'],
    ['madai','真鲷','nigiri','清鲜'], ['hirame','比目鱼','nigiri','清鲜'],
    ['amaebi','甜虾','nigiri','清鲜'], ['hotate','帆立贝','nigiri','清鲜'],
    ['salmon-back','三文鱼背肉','nigiri','清鲜'], ['akami','金枪鱼赤身','nigiri','清鲜'],
    ['kohada','醋渍小肌','nigiri','酸鲜'], ['aji','竹荚鱼','nigiri','鲜香'],
    ['chutoro','金枪鱼中腹','nigiri','油润'], ['salmon-belly','三文鱼腹肉','nigiri','油润'],
    ['salmon-seared','炙三文鱼腹肉','nigiri','炙香','salmon-belly'],
    ['otoro','金枪鱼大腹','nigiri','油润'], ['anago','煮穴子','nigiri','熟香'],
    ['squid','鱿鱼','nigiri','清鲜'], ['buri','鰤鱼','nigiri','油润'], ['akagai','赤贝','nigiri','清鲜'],
    ['ikura','鲑鱼籽军舰','gunkan','咸鲜'], ['uni','海胆军舰','gunkan','鲜甜'],
    ['tamago','玉子烧','finish','甘甜'], ['miso','味噌汤','finish','温鲜'],
  ].map(([id,name,phase,flavor,ingredient = id]) => ({ id,name,phase,flavor,ingredient }));
  const byId = Object.fromEntries(recipes.map(recipe => [recipe.id,recipe]));
  const seats = [
    { id:'light', name:'清鲜之席', preference:'先上清口小菜 · 前六贯至少四贯清鲜', opener:'cold' },
    { id:'seared', name:'炙香之席', preference:'热菜先上 · 后半席出一道炙烧', opener:'hot' },
    { id:'classic', name:'江户风味', preference:'先上清口小菜 · 小肌与穴子都上桌', opener:'cold' },
  ];
  const seatById = Object.fromEntries(seats.map(seat => [seat.id, seat]));
  const sauces = [
    { id:'yuzu', name:'柚子', flavor:'酸鲜', label:'清爽' },
    { id:'soy', name:'薄酱油', flavor:'鲜香', label:'鲜香' },
  ];
  const hotCuts = ['salmon-belly','anago'];
  const COOK = 8000;
  const PEAK = 13000;
  const clamp = (number, low, high) => Math.max(low, Math.min(high, number));

  function createRun(seat) {
    return { seat, served:[], clock:0, steamAt:null, coldId:'octopus', coldPrep:null, picks:[], batch:null, closeId:null, closePrep:null };
  }

  function phase(run) {
    const n = run.served.length;
    return n < 2 ? 'starter' : n < 14 ? 'nigiri' : n === 14 ? 'gunkan' : n === 15 ? 'finish' : null;
  }

  function phaseCounts(run) {
    return Object.fromEntries(phases.map(part => [
      part.id,run.served.filter(item => byId[item.id].phase === part.id).length,
    ]));
  }

  function steam(run) {
    if (run.served.some(item => item.id === 'chawan')) return { state:'served' };
    if (run.steamAt === null) return { state:'idle' };
    const warmed = run.clock - run.steamAt;
    if (warmed >= PEAK) return { state:'late' };
    if (warmed >= COOK) return { state:'ready', remaining:Math.ceil((PEAK - warmed) / 1000) };
    return { state:'cooking', remaining:Math.ceil((COOK - warmed) / 1000), progress:warmed / COOK };
  }

  function startSteam(run) {
    if (phase(run) !== 'starter' || steam(run).state !== 'idle') return false;
    run.steamAt = run.clock;
    return true;
  }

  function plate(id, points, note, data = {}) {
    return { id, points, note, flavor:byId[id].flavor, ...data };
  }

  function serveSteam(run) {
    if (phase(run) !== 'starter') return false;
    const { state } = steam(run);
    if (state !== 'ready' && state !== 'late') return false;
    run.served.push(plate('chawan',state === 'ready' ? 10 : 4,state === 'ready' ? '刚好出锅，趁热上桌' : '已过最佳火候，仍能上桌'));
    return true;
  }

  function coldServed(run) {
    return run.served.some(item => ['octopus','squid-sashimi'].includes(item.id));
  }

  function pickCold(run,id) {
    if (phase(run) !== 'starter' || coldServed(run) || !['octopus','squid-sashimi'].includes(id)) return false;
    run.coldId = id;
    run.coldPrep = null;
    return true;
  }

  function seasonCold(run,id) {
    const sauce = sauces.find(item => item.id === id);
    if (!sauce || phase(run) !== 'starter' || coldServed(run) || run.coldId !== 'octopus') return false;
    run.coldPrep = { id:sauce.id, flavor:sauce.flavor, points:10, note:`${sauce.name}调味` };
    return true;
  }

  function sliceCold(run,rating) {
    if (phase(run) !== 'starter' || coldServed(run) || run.coldId !== 'squid-sashimi' || !Number.isFinite(rating) || run.coldPrep) return false;
    run.coldPrep = { flavor:'清鲜',points:Math.round(clamp(rating,0,1) * 10),note:rating >= .9 ? '切得匀' : '切面稍偏' };
    return true;
  }

  function serveCold(run) {
    if (phase(run) !== 'starter' || coldServed(run) || !run.coldPrep) return false;
    const { flavor, points, note, id:sauce } = run.coldPrep;
    run.served.push(plate(run.coldId,points,note,{ flavor,sauce }));
    return true;
  }

  function batchIndex(run) {
    return Math.floor(Math.max(0,run.served.length - 2) / 2);
  }

  function batchKind(run) {
    return batches[batchIndex(run)] ?? null;
  }

  function canPickPair(run) {
    return phase(run) === 'nigiri' || (phase(run) === 'starter' && coldServed(run));
  }

  function candidates(run) {
    const used = new Set(run.served.map(item => byId[item.id].ingredient));
    const kind = canPickPair(run) ? 'nigiri' : phase(run);
    if (kind === 'starter' || !kind) return [];
    return recipes.filter(recipe => recipe.phase === kind && recipe.id !== 'salmon-seared' && !used.has(recipe.ingredient));
  }

  function pairStatus(run, ids) {
    if (!canPickPair(run)) return '当前还没到握寿司';
    const stock = candidates(run);
    if (ids.length !== 2 || ids[0] === ids[1] || ids.some(id => !stock.some(item => item.id === id))) return '先选两款鱼料';
    if (batchIndex(run) < 3 && !stock.some(item => hotCuts.includes(item.id) && !ids.includes(item.id))) return '腹肉和穴子至少留一份给热工位';
    if (batchKind(run) === 'heat' && !ids.some(id => hotCuts.includes(id))) return '这一批选入腹肉或穴子';
    return '';
  }

  function pickFish(run,id) {
    if (!canPickPair(run) || run.batch || !candidates(run).some(item => item.id === id)) return false;
    run.picks = run.picks.includes(id) ? run.picks.filter(pick => pick !== id) : [...run.picks.slice(-1),id];
    return true;
  }

  function beginBatch(run) {
    if (phase(run) !== 'nigiri' || run.batch || pairStatus(run,run.picks)) return false;
    const kind = batchKind(run);
    run.batch = { kind, ids:[...run.picks], cooked:null, preparation:null, surface:[0,0,0] };
    if (kind === 'heat') run.batch.cooked = run.batch.ids.find(id => hotCuts.includes(id));
    return true;
  }

  function finishBatch(run, kind, ratio, note, extra = {}) {
    if (phase(run) !== 'nigiri' || run.batch?.kind !== kind || run.batch.preparation) return false;
    if (!Number.isFinite(ratio)) return false;
    run.batch.preparation = { points:Math.round(clamp(ratio,0,1) * 8), note, ...extra };
    return true;
  }

  function riceRange(run) {
    const small = (run.seat !== 'seared' && batchIndex(run) === 2) || (run.seat === 'light' && batchIndex(run) === 4);
    return small ? { label:'小饭团',min:570,max:870 } : { label:'标准饭量',min:850,max:1220 };
  }

  function form(run, duration) {
    const range = riceRange(run);
    const off = Math.max(range.min - duration,duration - range.max,0);
    const ratio = off === 0 ? 1 : off <= 250 ? .75 : .45;
    return finishBatch(run,'form',ratio,off ? (duration < range.min ? '饭团偏小' : '饭团偏大') : '两贯饭量正好',
      { shape:clamp(duration / ((range.min + range.max)/2),.73,1.25) });
  }

  function seasonBatch(run,id) {
    const sauce = sauces.find(item => item.id === id);
    return Boolean(sauce && finishBatch(run,'season',1,`以${sauce.name}调味`,{ sauce:id }));
  }

  function pickHeat(run,id) {
    const batch = run.batch;
    if (batch?.kind !== 'heat' || batch.preparation || batch.surface.some(Boolean) || !batch.ids.includes(id) || !hotCuts.includes(id)) return false;
    batch.cooked = id;
    return true;
  }

  function spread(run,zone,amount) {
    const batch = run.batch;
    if (batch?.kind !== 'heat' || !batch.cooked || batch.preparation || ![0,1,2].includes(zone) || !Number.isFinite(amount) || amount <= 0) return false;
    batch.surface[zone] = Math.min(900,batch.surface[zone] + amount);
    return true;
  }

  function heatGrade(exposure) {
    return exposure >= 110 && exposure <= 400 ? 1 : exposure > 0 && exposure < 640 ? .65 : .22;
  }

  function finishHeat(run) {
    const batch = run.batch;
    if (batch?.kind !== 'heat' || !batch.surface.some(Boolean)) return false;
    const torched = batch.cooked === 'salmon-belly';
    const grades = batch.surface.map(value => torched ? heatGrade(value) : value > 0 ? 1 : .25);
    const note = torched
      ? batch.surface.some(value => value > 400) ? '有一处炙得偏深' : grades.every(value => value === 1) ? '三段火候均匀' : '有一处炙色偏浅'
      : grades.every(value => value === 1) ? '酱汁刷得均匀' : '有一处还没刷到';
    return finishBatch(run,'heat',grades.reduce((sum,x) => sum + x,0)/3,note,
      { torched,deep:torched && batch.surface.some(value => value > 400) });
  }

  const fresh = flavor => ['清鲜','酸鲜'].includes(flavor);
  const rich = flavor => ['油润','炙香','熟香','鲜香'].includes(flavor);

  function requestFresh(run) {
    return rich(run.served.at(-1)?.flavor);
  }

  function swap(run) {
    if (!run.batch || (run.batch.kind !== 'order' && !run.batch.preparation)) return false;
    run.batch.ids.reverse();
    if (run.batch.kind === 'order') run.batch.preparation = null;
    return true;
  }

  function confirmOrder(run) {
    const batch = run.batch;
    if (batch?.kind !== 'order') return false;
    const [first, second] = batch.ids.map(id => byId[id]);
    const balanced = (!requestFresh(run) || fresh(first.flavor)) && (!rich(first.flavor) || fresh(second.flavor));
    return finishBatch(run,'order',balanced ? 1 : .65,balanced ? '两贯接得顺口' : '再接一口清鲜会更舒服');
  }

  function serveBatch(run) {
    const batch = run.batch;
    if (phase(run) !== 'nigiri' || !batch?.preparation || pairStatus(run,batch.ids)) return false;
    const { points, note, sauce, shape, torched, deep } = batch.preparation;
    const cooked = batch.cooked;
    for (const [index,fish] of batch.ids.entries()) {
      const id = fish === cooked && torched ? 'salmon-seared' : fish;
      const placedSauce = index === 0 ? sauce : null;
      const flavor = placedSauce === 'yuzu' ? '酸鲜' : placedSauce === 'soy' && fresh(byId[id].flavor) ? '鲜香' : byId[id].flavor;
      const balance = requestFresh(run) ? fresh(flavor) : null;
      run.served.push(plate(id,index === 0 ? Math.ceil(points / 2) : Math.floor(points / 2),note,
        { flavor, balance, sauce:placedSauce, shape, deep:fish === cooked && deep }));
    }
    run.batch = null;
    run.picks = [];
    return true;
  }

  function pickClose(run,id) {
    if (run.closeId !== null || !['gunkan','finish'].includes(phase(run)) || !candidates(run).some(recipe => recipe.id === id)) return false;
    run.closeId = id;
    return true;
  }

  function closeAction(run) {
    return ({ ikura:'fill',uni:'fill',tamago:'place',miso:'pour' })[run.closeId] ?? null;
  }

  function finishClose(run, ratio) {
    if (!closeAction(run) || run.closePrep || !Number.isFinite(ratio)) return false;
    run.closePrep = { points:Math.round(6 * clamp(ratio,0,1)), note:ratio >= .9 ? '出品利落' : '还有一点偏差' };
    return true;
  }

  function serveClose(run) {
    if (!run.closePrep || !candidates(run).some(recipe => recipe.id === run.closeId)) return false;
    run.served.push(plate(run.closeId,run.closePrep.points,run.closePrep.note));
    run.closeId = null;
    run.closePrep = null;
    return true;
  }

  function summarize(run) {
    const [first] = run.served;
    const openingFit = Boolean(first && (seatById[run.seat].opener === 'hot'
      ? first.id === 'chawan'
      : first.id !== 'chawan' && fresh(first.flavor)));
    const nigiri = run.served.filter(item => byId[item.id].phase === 'nigiri');
    const prompt = run.seat === 'light' ? nigiri.slice(0,6).filter(item => fresh(item.flavor)).length >= 4
      : run.seat === 'seared' ? nigiri.slice(6).some(item => item.id === 'salmon-seared')
      : ['kohada','anago'].every(id => nigiri.some(item => item.id === id));
    const chances = nigiri.filter(item => typeof item.balance === 'boolean');
    const balance = chances.length ? Math.round(8 * chances.filter(item => item.balance).length / chances.length) : 8;
    const craft = run.served.reduce((sum,item) => sum + item.points,0);
    const palate = (openingFit ? 4 : 0) + (prompt ? 8 : 0) + balance;
    return { craft,palate,score:craft+palate,openingFit,prompt,balance };
  }

  globalThis.NoriRules = Object.freeze({ phases,total,batches,batchNames,byId,seats,seatById,sauces,hotCuts,
    createRun,phase,phaseCounts,steam,startSteam,serveSteam,coldServed,pickCold,seasonCold,sliceCold,serveCold,
    batchIndex,batchKind,candidates,pairStatus,pickFish,beginBatch,riceRange,form,seasonBatch,pickHeat,spread,heatGrade,finishHeat,
    fresh,requestFresh,swap,confirmOrder,serveBatch,pickClose,closeAction,finishClose,serveClose,summarize });
})();
