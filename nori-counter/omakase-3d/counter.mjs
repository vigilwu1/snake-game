import { clamp, dropOnRice, plate, pressEdge, riceEdge, riceShape } from '../nigiri-preview/kitchen.mjs';
import { menus, recipes } from './menu.mjs';
import { STORAGE, action, activate, cutGap, cutoffRatio, decode, done, elapsed, groupDone, newService,
  nextGroup, requiredCuts, stepOf, totalPlates } from './service.mjs';
import { coldPlate, dishAt, makeWorld } from './scene.mjs';

const get=id=>document.getElementById(id);
const root=get('counter'), canvas=get('table'), instruction=get('instruction');
const home=get('home'), receipt=get('receipt'), order=get('order'), guide=get('guide');
const pause=get('pause-menu'), reaction=get('reaction');
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
let soundEnabled=read(STORAGE+'-sound')!=='off', context;
let run=null, active=0, gesture=null, scene, fatal=false, notice='', completionSound=false;
let lastClock=performance.now(), lastSaved=0, currentSteps='';
const stored=key=>decode(read(STORAGE+':'+key));

function read(key){
  try{return localStorage.getItem(key);}catch{return null;}
}

function write(key,value){
  try{localStorage.setItem(key,value);return true;}catch{return false;}
}

function save(){
  if(!run||run.menu==='practice') return;
  if(!write(STORAGE+':'+run.menu,JSON.stringify(run))){
    if(!root.dataset.volatile) root.dataset.volatile='true';
  }
  lastSaved=run.clock;
}

function sound(kind){
  if(!soundEnabled) return;
  try{
    const Audio=window.AudioContext??window.webkitAudioContext;
    if(!Audio)return;
    context??=new Audio();
    if(context.state==='suspended') context.resume().catch(()=>{});
    if(context.state==='closed')return;
    const p={
      start:[220,.10,.044,0], cut:[148,.14,.05,.60], plate:[482,.21,.052,.18],
      steam:[788,.22,.035,.40], heat:[97,.13,.028,.86], touch:[305,.08,.035,.22],
    }[kind]??[305,.08,.035,.25];
    const t=context.currentTime,d=p[1],gain=context.createGain(),osc=context.createOscillator();
    gain.gain.setValueAtTime(.0001,t);
    gain.gain.exponentialRampToValueAtTime(p[2],t+.013);
    gain.gain.exponentialRampToValueAtTime(.0001,t+d);
    gain.connect(context.destination);
    osc.type='sine';
    osc.frequency.setValueAtTime(p[0],t);
    osc.frequency.exponentialRampToValueAtTime(p[0]*.58,t+d);
    osc.connect(gain);osc.start(t);osc.stop(t+d+.01);
    if(p[3]){
      const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*d),context.sampleRate);
      const data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      const noise=context.createBufferSource(), volume=context.createGain(), filter=context.createBiquadFilter();
      noise.buffer=buffer;
      filter.type='lowpass';filter.frequency.value=kind==='heat'?1600:2700;
      volume.gain.value=p[3]*.052;
      noise.connect(filter);filter.connect(volume);volume.connect(gain);noise.start(t);
    }
  }catch{
    // Interaction and visual cues work with audio unavailable.
  }
}

function soundToggle(){
  soundEnabled=!soundEnabled;
  write(STORAGE+'-sound',soundEnabled?'on':'off');
  drawSound();
  if(soundEnabled)sound('touch');
}

function drawSound(){
  for(const id of ['sound-home','sound-pause']){
    get(id).textContent=soundEnabled?'声音开':'声音关';
    get(id).setAttribute('aria-pressed',String(soundEnabled));
  }
}

function drawHome(){
  run=null;
  notice='';
  currentSteps='';
  order.hidden=true;receipt.hidden=true;reaction.hidden=true;instruction.hidden=true;guide.hidden=true;
  home.hidden=false;
  root.dataset.step='home';delete root.dataset.menu;
  const seats=get('seats');
  seats.replaceChildren();
  for(const key of ['classic','light','flame']){
    const menu=menus[key], saved=stored(key), button=document.createElement('button');
    button.type='button';button.dataset.menu=key;
    const title=document.createElement('strong'), sub=document.createElement('small');
    title.textContent=menu.name;
    sub.textContent=saved&&!done(saved)?'续玩 · 已上 '+saved.served.length+' / 20 道':menu.note;
    button.append(title,sub);seats.append(button);
  }
  drawSound();
  scene.show(null,0);
}

function begin(key){
  if(!menus[key])return;
  const old=stored(key);
  run=old&&!done(old)&&key!=='practice'?old:newService(key);
  active=Math.max(0,run.items.findIndex(item=>!item.served));
  if(run.items[active])activate(run,run.items[active]);
  lastClock=performance.now();
  lastSaved=run.clock;
  home.hidden=true;receipt.hidden=true;order.hidden=false;
  root.dataset.menu=key;
  notice='';
  completionSound=false;
  sound('start');
  save();
  sync();
}

function drawReceipt(){
  order.hidden=true;instruction.hidden=true;reaction.hidden=true;guide.hidden=true;
  root.dataset.step='receipt';
  receipt.hidden=false;
  get('receipt-seat').textContent=menus[run.menu].name;
  get('receipt-title').textContent=run.served.length+' 道已上桌';
  const notes=get('receipt-notes'), list=get('receipt-dishes');
  notes.replaceChildren();list.replaceChildren();
  const selected=[];
  for(const entry of [...run.served.filter(d=>!d.score),...run.served.filter(d=>d.score)]){
    if(selected.some(e=>e.text===entry.text))continue;
    selected.push(entry);
    if(selected.length===2)break;
  }
  for(const item of selected){
    const line=document.createElement('p');
    line.textContent=recipes[item.id].name+' · '+item.text;
    notes.append(line);
  }
  for(const item of run.served){
    const line=document.createElement('li');
    line.textContent=recipes[item.id].name;
    list.append(line);
  }
  save();
  get('back').focus({preventScroll:true,focusVisible:false});
}

function currentItem(){return run?.items[active];}

function explain(r,item,step){
  switch(step){
    case 'cut': {
      const label=r.reserve?(r.lean?'刀位靠近切面可薄切':'左右挪刀选厚度'):'沿刀身直拉，分出鱿鱼细条';
      return label+' · 向自己拉刀 '+item.cuts.length+'/'+requiredCuts(r);
    }
    case 'arrange': return r.reserve?'两片放陶碟，一片留右边冷盘':'把三条鱿鱼摆进陶碟';
    case 'shape': return r.rice.instruction;
    case 'lay': return '抓住'+(r.surface==='shrimp'?'虾身':'鱼片')+'，拖到饭团中央';
    case 'dip': return '把留好的赤身拖入渍汁';
    case 'soaking': return '赤身正在入味，可以先做同批另一贯';
    case 'lift': return '鱼面已上色，把赤身拖出渍汁';
    case 'torch': return '按住鱼片一端，沿鱼身扫过';
    case 'brush': return '沿穴子扫一遍，刷亮整条鱼身';
    case 'steam': return '轻碰盖钮开蒸，可以同时做冷菜';
    case 'steaming': return '蒸锅在冒汽，白汽升起后揭盖';
    case 'lid': return '抓住盖钮，向前揭开';
    case 'garnish': return '抓起柚子，拖到章鱼上方调味';
    case 'grilling': return item.turnedAt===null?'等第一面上色，再翻银鳕鱼':'第二面正在上色';
    case 'flip': return '沿鱼身向右翻面';
    case 'wrap': return '提起海苔，拖向饭团围合';
    case 'scoop': return '舀起配料，送到军舰口';
    case 'roll': return '拉海苔右下角，沿斜线收紧';
    case 'egg': return '向自己拉刀，切两小块玉子烧';
    case 'soup': return '拖勺入碗，舀一碗鱼骨味噌汤';
    case 'serve': return '抓住碟边，沿吧台推过金线';
    default: return '';
  }
}

function makeGuide(){
  guide.hidden=true;
  if(!run||!scene||fatal||gesture||pause.open||done(run)||groupDone(run))return;
  const from=scene.guide();
  if(!from)return;
  const [x,y]=scene.project(from.x,from.y,from.z);
  const [endX,endY]=from.to?scene.project(...from.to):[x,y];
  guide.style.setProperty('--x',x+'px');
  guide.style.setProperty('--y',y+'px');
  guide.style.setProperty('--angle',Math.atan2(endY-y,endX-x)+'rad');
  guide.style.setProperty('--length',Math.max(17,Math.min(68,Math.hypot(endX-x,endY-y)))+'px');
  guide.toggleAttribute('data-tap',!from.to);
  guide.dataset.kind=from.kind;
  guide.hidden=false;
}

function sync(){
  if(!run||fatal)return;
  if(done(run)){
    scene.show(run,active);drawReceipt();return;
  }
  scene.show(run,active);
  currentSteps=run.items.map(item=>stepOf(run,item)).join('|');
  const item=currentItem(), r=recipes[item.id], step=stepOf(run,item);
  root.dataset.step=step;root.dataset.dish=item.id;
  get('progress').textContent=menus[run.menu].name+'  ·  '+run.served.length+' / '+totalPlates(run.menu);
  get('dish').textContent=r.name;
  let detail=run.group===0?menus[run.menu].note:'';
  if(r.source){
    const piece=run.stock[r.source];
    if(piece)detail=r.method==='marinate'?'冷盘留片 · '+(item.marinated?'已入味':item.started===null?'待浸渍汁':'正在入味'):'冷盘留片 · 本贯使用';
  }
  if(r.id==='chutoro')detail='客人要少饭';
  if(root.dataset.volatile)detail=detail?detail+' · 本机无法保存':'本机无法保存进度';
  get('guest').textContent=detail;
  const plates=get('plates');plates.replaceChildren();
  if(run.items.length>1) for(const [index,other] of run.items.entries()){
    const button=document.createElement('button');
    button.type='button';button.dataset.index=index;button.disabled=other.served;
    button.setAttribute('aria-pressed',String(index===active));
    const state=stepOf(run,other);
    const suffix={served:' · 已上',serve:' · 可上',steaming:' · 蒸着',lid:' · 可揭盖',soaking:' · 浸着',lift:' · 可夹'}[state]??'';
    button.textContent=recipes[other.id].name+suffix;
    plates.append(button);
  }
  const completed=groupDone(run);
  reaction.hidden=!completed;instruction.hidden=completed;
  const text=notice||explain(r,item,step);
  if(!completed&&instruction.textContent!==text)instruction.textContent=text;
  if(completed){
    const results=run.served.slice(-run.items.length);
    const point=results.find(result=>!result.score)??results.at(-1);
    get('response').textContent='“'+point.text+'”';
    get('next').textContent=run.group+1===menus[run.menu].groups.length?'看今晚菜单':'下一道';
  }
  makeGuide();
}

function select(index){
  if(!run||!run.items[index]||run.items[index].served||gesture||pause.open)return;
  active=index;activate(run,run.items[index]);
  notice='';
  save();sync();
}

function forward(){
  if(!run||!nextGroup(run))return;
  active=0;
  if(!done(run)) activate(run,currentItem());
  notice='';
  completionSound=false;
  save();sync();
}

function stageChanged(){
  const next=run.items.map(item=>stepOf(run,item));
  if(currentSteps===next.join('|'))return;
  if(!completionSound&&next.some(step=>step==='lid')){
    sound('steam');completionSound=true;
  }
  notice='';
  save();sync();
}

function tick(){
  const now=performance.now(), dt=clamp(now-lastClock,0,200);
  lastClock=now;
  if(!run||fatal||home.hidden===false||done(run)||groupDone(run)||document.hidden||pause.open)return;
  run.clock+=dt;
  if(gesture?.target.kind==='torch'&&gesture.inRange){
    deposit(gesture,gesture.world,Math.min(dt,75)*.00142);
    scene.preview(gesture);
  }
  if(!gesture)stageChanged();
  scene.time(run);
  if(run.clock-lastSaved>1400)save();
}

function detach(){
  const d=gesture;
  if(!d)return null;
  gesture=null;
  delete canvas.dataset.drag;
  if(canvas.hasPointerCapture(d.pointer))canvas.releasePointerCapture(d.pointer);
  return d;
}

function cancel(){
  if(detach()&&run&&!fatal)sync();
}

function start(event){
  if(!run||fatal||gesture||document.hidden||pause.open||done(run)||groupDone(run)||
    event.button!==0||!event.isPrimary)return;
  const target=scene.pick(event);
  if(!target)return;
  if(target.kind==='select'){select(target.index);return;}
  const item=run.items[target.index], r=recipes[item.id];
  const origin=scene.point(event,target.y);
  if(!origin)return;
  const loc=dishAt(run,target.index);
  event.preventDefault();
  gesture={pointer:event.pointerId,target,item,r,loc,origin,world:origin,prev:origin,gap:item.gap,edges:item.edges,
    progress:0,marks:Array(7).fill(0),plateZ:loc.z,dx:0,dz:0,kind:'',moved:false,inRange:false,
    edge: r.mode==='nigiri'&&target.kind==='rice' ? riceEdge(riceShape(r,item.edges),(target.x-loc.x)/loc.scale,(target.z-loc.z)/loc.scale) : null,
  };
  canvas.setPointerCapture(event.pointerId);
  canvas.dataset.drag=target.kind;
  guide.hidden=true;
  if(target.kind==='torch'){
    deposit(gesture,origin,0);
    scene.preview(gesture);
    sound('heat');
  }
}

function deposit(d,point,quantity){
  const t=d.target;
  const unit=(point.x-t.center)/(t.half||.8);
  d.inRange=Math.abs(unit)<=1.23&&Math.abs(point.z-t.depth)<=.66;
  if(!d.inRange)return;
  const k=clamp((unit+1)*3,0,6), j=Math.floor(k), frac=k-j;
  d.marks[j]+=quantity*(1-frac);
  if(j<6)d.marks[j+1]+=quantity*frac;
}

function move(event, ending=false){
  const d=gesture;
  if(!d||event.pointerId!==d.pointer)return;
  const t=d.target, at=scene.point(event,t.y);
  if(!at)return;
  d.dx=at.x-d.origin.x;d.dz=at.z-d.origin.z;
  if(!d.moved&&Math.hypot(d.dx,d.dz)<.045)return;
  d.moved=true;
  d.world=at;
  switch(t.kind){
    case 'knife':
      if(!d.kind)d.kind=Math.abs(d.dx)>Math.abs(d.dz)*1.30?'gap':'cut';
      if(d.kind==='gap')d.gap=cutGap(d.r,d.item.gap+d.dx);
      else d.progress=clamp(d.dz/1.02,0,1);
      break;
    case 'rice':
      d.edges=pressEdge(d.r,d.item.edges,d.edge,d.dx/d.loc.scale,d.dz/d.loc.scale);
      break;
    case 'plate':
      d.plateZ=clamp(d.loc.z+d.dz,plate.serveZ,d.loc.z+.19);
      break;
    case 'lid':
      d.progress=clamp(-d.dz/.79,0,1);
      break;
    case 'flip':
      d.progress=clamp(d.dx/.64,0,1);
      break;
    case 'egg':
      d.progress=clamp(d.dz/.80,0,1);
      break;
    case 'wrap':
    case 'roll':
      d.progress=clamp(Math.hypot(d.dx,d.dz)/(t.kind==='wrap'?1.1:.87),0,1);
      break;
    case 'torch':
    case 'brush': {
      const length=Math.hypot(at.x-d.prev.x,at.z-d.prev.z);
      const count=Math.max(1,Math.ceil(length/.10));
      for(let i=1;i<=count;i++){
        const frac=i/count;
        deposit(d,{x:d.prev.x+(at.x-d.prev.x)*frac,z:d.prev.z+(at.z-d.prev.z)*frac},length/count*(t.kind==='torch'?1.75:1.61));
      }
      break;
    }
  }
  d.prev=at;
  if(!ending)scene.preview(d);
}

function closeTo(event,point,radius=54){
  const rect=canvas.getBoundingClientRect(), p=scene.project(...point);
  return Math.hypot(event.clientX-rect.left-p[0],event.clientY-rect.top-p[1])<=radius;
}

function finish(event){
  if(event.pointerId!==gesture?.pointer)return;
  move(event,true);
  const d=detach(), {target:t,item,r,loc}=d;
  let committed=false;
  const commit=(name,data)=>action(run,item,name,data);
  let error='';
  switch(t.kind){
    case 'steam': committed=!d.moved&&commit('steam'); break;
    case 'knife':
      if(d.kind==='gap')committed=commit('gap',d.gap);
      else if(d.progress>=cutoffRatio)committed=commit('cut',{progress:d.progress});
      else if(d.moved)error='刀走过整块鱼肉才会切下，松手可以重来';
      break;
    case 'piece':
      if(!d.moved)break;
      if(r.reserve&&closeTo(event,[coldPlate.x,coldPlate.y,coldPlate.z],57)){
        committed=commit('allocate',{key:t.key,to:'cold'});
        if(!committed)error='冷盘已经留了一片，把这片放陶碟';
      }else if(closeTo(event,[loc.x,.20,loc.z],70)){
        committed=commit('allocate',{key:t.key,to:'plate'});
        if(!committed)error='刺身碟已摆好，剩下的一片留冷盘';
      }else error='刺身放左边陶碟，留料放右边小冷盘';
      break;
    case 'rice': committed=d.moved&&commit('shape',d.edges);break;
    case 'fish': {
      if(!d.moved)break;
      const shape=riceShape(r,item.edges);
      const at=scene.point(event,(plate.floor+shape.height)*loc.scale);
      if(!at)break;
      const position={x:(at.x-loc.x)/loc.scale,z:(at.z-loc.z)/loc.scale};
      if(dropOnRice(r,shape,position.x,position.z))committed=commit('lay',position);
      else error='把鱼片拖回饭团上再松手';
      break;
    }
    case 'dip': case 'lift':
      committed=d.moved&&closeTo(event,t.to,64)&&commit(t.kind);
      if(!committed&&d.moved)error=t.kind==='dip'?'把赤身拖入渍碟':'把赤身从汁里拖回砧板';
      break;
    case 'plate':
      committed=d.plateZ<=plate.lineZ&&commit('serve');
      if(!committed&&d.moved)error='让碟子越过金线再松手';
      break;
    case 'torch':case 'brush':
      committed=commit(t.kind,d.marks);
      if(!committed&&d.moved)error='贴着鱼片表面，从一端扫向另一端';
      break;
    case 'lid':case 'flip':case 'egg':
      committed=d.progress>=.67&&commit(t.kind);
      break;
    case 'wrap':case 'roll':
      committed=d.progress>=.60&&closeTo(event,t.to,80)&&commit(t.kind);
      break;
    case 'scoop':case 'garnish':case 'soup':
      committed=d.moved&&closeTo(event,t.to,73)&&commit(t.kind,{ratio:1+clamp((Math.abs(d.dx)-2.2)*.16,0,.34)});
      break;
  }
  if(committed){
    if(t.kind==='plate'){
      sound('plate');
      const next=run.items.findIndex(other=>!other.served);
      if(next>=0){active=next;activate(run,currentItem());}
      if(!reduceMotion.matches){root.animate([{opacity:.97},{opacity:1}],{duration:210});}
    }else{
      active=t.index;
      sound(t.kind==='knife'&&d.kind==='cut'||t.kind==='egg'?'cut':t.kind==='steam'?'steam':'touch');
    }
    notice='';
    save();
  }else{
    notice=error;
  }
  sync();
}

function pauseService(){
  if(!run||done(run)||fatal)return;
  suspendGesture();pause.showModal();makeGuide();
}

function suspendGesture(){
  if(gesture?.target.kind==='torch')action(run,gesture.item,'torch',gesture.marks);
  cancel();
  save();
  lastClock=performance.now();
}
function exitService(){
  pause.close();
  save();
  if(!fatal)drawHome();
}

function unavailable(){
  fatal=true;
  order.hidden=true;home.hidden=true;receipt.hidden=true;reaction.hidden=true;guide.hidden=true;
  instruction.hidden=false;
  instruction.replaceChildren('当前浏览器无法开启 3D 吧台。可以重载，或玩 ');
  const previous=document.createElement('a');
  previous.className='fallback';
  previous.href=new URL('../legacy.html',import.meta.url).href;
  previous.textContent='原版晚席';
  instruction.append(previous);
  instruction.style.pointerEvents='auto';
}

try{
  scene=makeWorld(canvas,()=>{cancel();makeGuide();},()=>{
    cancel();save();unavailable();
  });
  const onTap=(container,selector,callback)=>
    container.addEventListener('click',event=>{const control=event.target.closest(selector);if(control)callback(control);});
  onTap(home,'[data-menu]',button=>begin(button.dataset.menu));
  onTap(get('plates'),'[data-index]',button=>select(Number(button.dataset.index)));
  for(const id of ['sound-home','sound-pause'])get(id).addEventListener('click',soundToggle);
  get('pause').addEventListener('click',pauseService);
  get('resume').addEventListener('click',()=>pause.close());
  get('to-home').addEventListener('click',exitService);
  get('back').addEventListener('click',drawHome);
  get('next').addEventListener('click',forward);
  pause.addEventListener('close',()=>{lastClock=performance.now();makeGuide();});
  canvas.addEventListener('pointerdown',start);
  canvas.addEventListener('pointermove',move);
  canvas.addEventListener('pointerup',finish);
  canvas.addEventListener('pointercancel',event=>{if(event.pointerId===gesture?.pointer)cancel();});
  canvas.addEventListener('lostpointercapture',event=>{if(event.pointerId===gesture?.pointer)cancel();});
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)suspendGesture();
    else lastClock=performance.now();
  });
  window.addEventListener('pagehide',suspendGesture);
  setInterval(tick,55);
  drawHome();
}catch(error){
  console.error(error);
  unavailable();
}
