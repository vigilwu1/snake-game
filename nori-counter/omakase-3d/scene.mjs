import * as T from '../nigiri-preview/vendor/three.module.js';
import { material, box, makePlate, makeContactShadow, makeRice } from '../nigiri-preview/scene.mjs?v=omakase-1';
import { clamp, plate, riceShape } from '../nigiri-preview/kitchen.mjs';
import { recipes } from './menu.mjs';
import { elapsed, stepOf } from './service.mjs';
import { add, oval, bowl, liquid, knife, stockMesh, cutPiece, topping, octopus, steamed, noriRing,
  gunkan, temaki, makeSurfaces, disposeObjects } from './food.mjs';

export const counterBoard = { x: 0.04, y: 0.125, z: 1.99, width: 3.63, depth: 1.35 };
export const coldPlate = { x: 1.37, y: .10, z: -.35, radius: .65 };
export const toolLocation = { x: .73, y: .13, z: 2.19 };
export const dishAt = (run, i) => run.items.length === 2 ?
  {x: i === 0 ? -1.03 : 1.04, z: i === 0 ? .01 : -.09, scale: .73} :
  {x: -.53, z: recipes[run.items[i]?.id]?.mode==='cut'?-.48:.04, scale: .99};

function floorLight(geometry) {
  const vertices=geometry.attributes.position;
  const colors=new Float32Array(vertices.count*3);
  for(let i=0;i<vertices.count;i++){
    const x=vertices.getX(i), z=-vertices.getY(i)+.90;
    const light=Math.exp(-(((x+.44)/3.5)**2+((z+.65)/5.3)**2));
    colors.set([.58+.42*light,.53+.47*light,.46+.54*light],i*3);
  }
  geometry.setAttribute('color',new T.BufferAttribute(colors,3));
  return geometry;
}

function vaporTexture() {
  const c=document.createElement('canvas');
  c.width=c.height=96;
  const ctx=c.getContext('2d');
  const fade=ctx.createRadialGradient(48,48,3,48,48,47);
  fade.addColorStop(0,'rgba(252,242,215,.76)');
  fade.addColorStop(.36,'rgba(249,234,211,.43)');
  fade.addColorStop(1,'rgba(249,234,211,0)');
  ctx.fillStyle=fade;
  ctx.fillRect(0,0,96,96);
  return new T.CanvasTexture(c);
}

export function makeWorld(canvas, resized, lost) {
  const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'default'});
  renderer.setClearColor(0,0);
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=T.PCFShadowMap;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.10;
  const world=new T.Scene();
  const lived=new T.Group();
  const board=counterBoard;
  world.add(lived,new T.HemisphereLight('#ffe5c7','#a76748',1.55));
  const sun=new T.DirectionalLight('#ffedda',1.9);
  sun.position.set(-3.8,7,2.5);
  sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-5.6,right:5.6,top:6.0,bottom:-5.7,near:.2,far:18});
  sun.shadow.bias=-.00024;
  sun.shadow.normalBias=.020;
  const rim=new T.DirectionalLight('#ffd5ad',.57);
  rim.position.set(5,3,-3.5);
  world.add(sun,rim);

  let drawing=0, stopped=false, current, focus=0, closer=false;
  function paint(){
    if(drawing||stopped) return;
    drawing=requestAnimationFrame(()=>{
      drawing=0;
      renderer.render(world,camera);
    });
  }

  const s=makeSurfaces(renderer,()=>{
    if(current && !stopped) requestTextureRefresh();
    paint();
  });
  s.wood.vertexColors=true;
  let refreshFrame=0;
  function requestTextureRefresh(){
    if(refreshFrame) return;
    refreshFrame=requestAnimationFrame(()=>{
      refreshFrame=0;
      if(current&&!canvas.dataset.drag) show(current,focus);
    });
  }

  const floor=add(world,floorLight(new T.PlaneGeometry(15,15.4,24,24)),s.wood,0,0,.90);
  floor.rotation.x=-Math.PI/2;
  floor.castShadow=false;
  const line=add(world,new T.PlaneGeometry(13,.036),material('#ba9359',{roughness:.4,metalness:.33}),0,.002,plate.lineZ);
  line.rotation.x=-Math.PI/2;
  line.castShadow=false;
  const counterMat=box(board.width,board.y,board.depth,.030);
  const cuttingBoard=add(world,counterMat,s.board,board.x,0,board.z);
  bowl(world,s.plate,-1.57,3.42,.41,.29);
  liquid(world,s.soy,-1.57,3.42,.35,.175);
  bowl(world,s.plate,1.38,-2.43,.36,.34);

  const camera=new T.PerspectiveCamera(43,1,.1,65);
  camera.position.set(1.37,7.0,10.65);
  camera.lookAt(-.06,.05,-.13);
  camera.updateMatrixWorld();
  const ray=new T.Raycaster(), pointer=new T.Vector2(), ground=new T.Plane(new T.Vector3(0,1,0),0);
  const projected=new T.Vector3();
  const views=[];
  const trayShade=makeContactShadow(3.10,2.12);
  const steamMap=vaporTexture();
  const flameBlue=new T.MeshBasicMaterial({color:'#63adff',transparent:true,opacity:.73,depthWrite:false});
  const flameCore=new T.MeshBasicMaterial({color:'#d5ecff',transparent:true,opacity:.84,depthWrite:false});
  const grillSurface=material('#362f28',{roughness:.8});
  const gold=material('#c0893a',{metalness:.36,roughness:.45});

  function setLens(){
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h) return;
    camera.aspect=w/h;
    const frame=Math.max(8.9,4.86/camera.aspect)*(closer?.985:1);
    camera.fov=T.MathUtils.radToDeg(2*Math.atan(frame/25.6));
    camera.updateProjectionMatrix();
    renderer.setSize(w,h,false);
  }
  function resize(){setLens();resized();paint();}
  new ResizeObserver(resize).observe(canvas);
  setLens();

  function point(event,height){
    const bounds=canvas.getBoundingClientRect();
    pointer.set((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2);
    ray.setFromCamera(pointer,camera);
    ground.constant=-height;
    return ray.ray.intersectPlane(ground,new T.Vector3());
  }
  function project(x,y,z){
    projected.set(x,y,z).project(camera);
    return [(projected.x+1)*canvas.clientWidth/2,(1-projected.y)*canvas.clientHeight/2];
  }

  function objectTarget(view,kind,x,y,z,r=.25,to=null,extra={}){
    const descriptor={index:view.index,kind,x,y,z,r,to,...extra};
    view.targets.push(descriptor);
    return descriptor;
  }

  function tray(view,skin){
    const group=new T.Group();
    lived.add(group);
    group.position.set(view.x,0,view.item.served?plate.serveZ:view.z);
    group.scale.setScalar(view.scale);
    const shade=trayShade.clone();
    shade.geometry=trayShade.geometry.clone();
    group.add(shade,makePlate(skin));
    view.tray=group;
    return group;
  }

  function drawCut(view){
    const {recipe:r,item,group}=view;
    tray(view,s.plate);
    const width=r.length-item.cuts.reduce((n,p)=>n+p.thickness,0);
    const baseX=-.92;
    const z=board.z-.50;
    if(width>.025){
      const rest=stockMesh(group,s[r.surface],r,width);
      rest.position.set(baseX+r.length-width/2,board.y+.002,z);
    }
    if(r.reserve){
      const iceDish=makePlate(s.plate);
      iceDish.position.set(coldPlate.x,0,coldPlate.z);
      iceDish.scale.setScalar(.52);
      group.add(iceDish);
      for(let i=0;i<5;i++)oval(group,s.ika,coldPlate.x+Math.sin(i*2.4)*.37,.065,
        coldPlate.z+Math.cos(i*2.4)*.26,.11,.018,.078);
    }
    const plated=item.cuts.filter(p=>p.to==='plate');
    const loose=item.cuts.filter(p=>!p.to);
    const looseSlots=[[-1.20,2.63],[-.45,2.64],[.29,2.64]];
    for(const piece of item.cuts){
      const platedIndex=plated.indexOf(piece), looseIndex=loose.indexOf(piece);
      const settled=piece.to==='plate', reserve=piece.to==='cold';
      const parent=settled?view.tray:group;
      const model=cutPiece(parent,s[r.surface],r,piece);
      const mesh=model.mesh;
      if(settled){
        mesh.position.set((platedIndex-(plated.length-1)/2)*.49,plate.floor+.035+platedIndex*.014,.05-platedIndex*.14);
        mesh.rotation.y=.30+platedIndex*.20;
      }else if(reserve){
        mesh.position.set(coldPlate.x,.10,coldPlate.z);
        mesh.rotation.y=-.64;
      }else{
        mesh.position.set(looseSlots[looseIndex][0],board.y+.008,looseSlots[looseIndex][1]);
        mesh.rotation.y=-.12+looseIndex*.15;
        if(view.step==='arrange'){
          const servedCount=plated.length;
          const needsCold=r.reserve&&!item.cuts.some(p=>p.to==='cold');
          const suggested = needsCold&&(servedCount===2||piece.thickness===Math.min(...loose.map(p=>p.thickness))&&loose.length>2);
          const target=suggested?[coldPlate.x,coldPlate.y,coldPlate.z]:[view.x,.20,view.z];
          objectTarget(view,'piece',mesh.position.x,board.y+.11,mesh.position.z,.23,target,{key:piece.key,mesh});
        }
      }
    }
    if(view.step==='cut'){
      const preview=knife(group,s);
      preview.rotation.z=-Math.atan(r.lean)*.625;
      const offset = r.length-width;
      const x=baseX+offset+item.gap;
      const y=board.y+r.height+.025, start=board.z+.03;
      preview.position.set(x,y,start);
      view.knife={mesh:preview,x,start,y};
      objectTarget(view,'knife',x,y+.14,start+.40,.29,[x,y+.05,start+1.43]);
    }
  }

  function drawNigiri(view){
    const {recipe:r,item,group,selected}=view;
    const dish=tray(view,s.plate);
    const rice=makeRice();
    dish.add(rice.group);
    const shape=riceShape(r,item.edges);
    rice.update(shape);
    view.rice=rice;
    const source=item.usedPiece??current.stock[r.source];
    const sourceSize=source ? clamp(source.depth/1.08,.87,1.18) : 1;
    const spec=source?{...r,fish:{...r.fish,x:r.fish.x*sourceSize}}:r;
    const soaking=view.step==='soaking'||view.step==='lift';
    const soyX=-.80, soyZ=toolLocation.z-.10;
    if(r.method==='marinate'&&!item.marinated){
      bowl(group,s.plate,soyX,soyZ,.71,.29).position.y=board.y;
      liquid(group,s.soy,soyX,soyZ,.60,board.y+.195);
    }
    const displayed=item.placement || selected || soaking;
    if(displayed){
      const fish=topping(item.placement?dish:group,s,spec,source);
      view.fish=fish;
      view.shape=shape;
      view.spec=spec;
      if(item.placement){
        fish.group.position.set(item.placement.x,0,item.placement.z);
        fish.pose(shape,item.placement,0,1);
        if(r.method==='torch'||r.method==='brush') fish.marks(item.marks,r.method==='torch');
        if(r.method==='marinate') fish.marks(Array(7).fill(.49),false);
      }else{
        const x=toolLocation.x,z=toolLocation.z-.03;
        const scale=view.scale+.06;
        fish.group.scale.setScalar(scale);
        fish.group.position.set(soaking?soyX:x,0,soaking?soyZ:z);
        fish.pose(shape,{x:0,z:0},(soaking?board.y+.18:board.y)/scale);
        if(r.method==='marinate'&&!item.marinated){
          if(view.step==='dip'){
            objectTarget(view,'dip',x,board.y+.13,z,.37,[soyX,board.y+.20,soyZ],{fish});
          }else if(view.step==='lift'){
            objectTarget(view,'lift',soyX,board.y+.25,soyZ,.43,[x,board.y+.13,z],{fish});
          }
        }
        if(view.step==='lay'){
          const rawY=board.y+.13;
          objectTarget(view,'fish',x,rawY,z,.40,[view.x,(plate.floor+shape.height)*view.scale,view.z],{fish});
          if(r.method==='marinate') fish.marks(Array(7).fill(.48),false);
        }
      }
    }
    if(view.step==='shape'&&selected){
      const atNear=r.rice.edge==='near';
      const scale=view.scale;
      const x=view.x+(atNear?shape.x:shape.x-shape.radiusX*.87)*scale;
      const z=view.z+(atNear?shape.z+shape.radiusZ*.85:shape.z+.06)*scale;
      objectTarget(view,'rice',x,.22,z,.33,[view.x+shape.x*scale,.28,view.z+shape.z*scale],{shape});
    }
    if(item.placement&&selected){
      const x=view.x+(item.placement.x||0)*view.scale,z=view.z+item.placement.z*view.scale;
      const fishY=(plate.floor+shape.height+.11)*view.scale;
      if(r.method==='torch'||r.method==='brush'){
        const tool=new T.Group();
        group.add(tool);
        const isHeat=r.method==='torch';
        const shell=add(tool,new T.CylinderGeometry(.075,.084,isHeat?.46:.38,16),isHeat?s.steel:s.handle,0,.15,.17);
        shell.rotation.x=Math.PI/2;
        if(isHeat){
          add(tool,new T.CylinderGeometry(.13,.13,.32,16),s.handle,0,.32,.33);
          const flame=new T.Group();
          tool.add(flame);
          const burn=add(flame,new T.ConeGeometry(.064,.48,11),flameBlue,0,.19,-.26);
          burn.rotation.x=-Math.PI/2;
          const hot=add(flame,new T.ConeGeometry(.029,.26,9),flameCore,0,.19,-.17);
          hot.rotation.x=-Math.PI/2;
          flame.visible=false;
          view.flame=flame;
        }else add(tool,new T.BoxGeometry(.18,.072,.27),gold,0,.14,-.17);
        tool.position.set(x+.56,.16,z+.99);
        view.tool=tool;
        if(view.step===r.method||view.step==='serve') objectTarget(view,r.method,x-r.fish.x*view.scale*.80,fishY,z,.37,
          [x+r.fish.x*view.scale*.93,fishY,z],{center:x,half:r.fish.x*view.scale, depth:z, tool,fishY});
      }else if(view.step==='serve'){
        objectTarget(view,'fish',x,fishY,z,.31,[view.x,fishY,view.z],{fish:view.fish});
      }
    }
  }

  function drawOther(view){
    const {recipe:r,item,group,selected,step}=view;
    const dish=tray(view,s.plate);
    const ox=toolLocation.x,oz=toolLocation.z;
    const serving=new T.Group();
    dish.add(serving);
    serving.position.y=.11;
    if(r.mode==='steam'){
      const lid=steamed(serving,s,r,item);
      view.lid=lid;
      if(step==='steam'||step==='lid') objectTarget(view,step,view.x,.57*view.scale,view.z,.42,
        step==='lid'?[view.x,.71,view.z-.95]:null,{lid});
      if(item.started!==null){
        view.vapor=Array.from({length:4},()=>{
          const m=new T.SpriteMaterial({map:steamMap,transparent:true,depthWrite:false,opacity:0});
          const puff=new T.Sprite(m);
          puff.userData.ownMaterial=m;
          serving.add(puff);
          return puff;
        });
      }
    }else if(r.mode==='garnish'){
      octopus(serving,s,item.prepared);
      if(selected&&!item.prepared){
        const citrus=oval(group,s.zest,ox,board.y+.13,oz,.24,.12,.20);
        objectTarget(view,'garnish',ox,.28,oz,.33,[view.x,.27,view.z],{mesh:citrus});
      }
    }else if(r.mode==='grill'){
      add(serving,box(1.91,.11,.98,.024),grillSurface,0,-.015,0);
      const cod=add(serving,box(1.44,.34,.69,.068),s.cod,0,.095,0);
      view.cod=cod;
      if(step==='flip') objectTarget(view,'flip',view.x,.42,view.z,.51,[view.x+.76,.40,view.z],{mesh:cod});
    }else if(r.mode==='gunkan'){
      serving.position.y=0;
      gunkan(serving,s,item,r);
      if(step==='wrap'){
        const sheet=add(group,box(1.09,.045,.75,.009),s.nori,ox,board.y,oz);
        view.folding=new T.Group();
        serving.add(view.folding);
        objectTarget(view,'wrap',ox,.18,oz,.44,[view.x,.28,view.z],{mesh:sheet});
      }
      if(step==='scoop'){
        bowl(group,s.plate,ox,oz,.62,.28);
        const amount=r.surface==='roe'?15:5;
        for(let i=0;i<amount;i++) oval(group,s[r.surface],ox+Math.sin(i*2.4)*.34,.27,oz+Math.cos(i*2.4)*.24,
          r.surface==='roe'?.076:.15,.069,.076);
        const spoon=oval(group,s.steel,ox+.37,.29,oz+.27,.13,.055,.24);
        objectTarget(view,'scoop',ox+.19,.30,oz,.48,[view.x,.50,view.z],{mesh:spoon});
      }
    }else if(r.mode==='roll'){
      if(item.prepared) temaki(serving,s,true);
      else{
        const sheet=new T.Group(); group.add(sheet);
        sheet.position.set(ox,board.y,oz);
        view.flatRoll=new T.Group();sheet.add(view.flatRoll);
        temaki(view.flatRoll,s,false);
        view.folding=new T.Group();
        sheet.add(view.folding);
        objectTarget(view,'roll',ox+.52,.15,oz+.30,.39,[ox-.60,.29,oz-.26],{mesh:sheet});
      }
    }else if(r.mode==='egg'){
      const egg=(parent,x,y,z,w)=>add(parent,box(w,.35,.62,.031),s.egg,x,y,z);
      if(item.prepared){
        egg(serving,-.27,0,.04,.44).rotation.y=.22;
        egg(serving,.24,.032,-.1,.44).rotation.y=.36;
      }else{
        egg(group,.42,board.y,oz,.98);
        const blade=knife(group,s);
        blade.position.set(.39,.29,oz);
        objectTarget(view,'egg',.39,.42,oz+.41,.39,[.39,.31,oz+1.27],{mesh:blade});
      }
    }else if(r.mode==='soup'){
      bowl(serving,s.plate,0,0,.75,.44);
      if(item.prepared){
        liquid(serving,s.broth,0,0,.62,.33);
        for(let i=0;i<6;i++) oval(serving,s.green,Math.sin(i*2.2)*.45,.349,Math.cos(i*2.2)*.33,.052,.016,.041);
      }else{
        bowl(group,s.plate,ox,oz,.69,.34);
        liquid(group,s.broth,ox,oz,.57,.23);
        const ladle=oval(group,s.steel,ox+.37,.34,oz+.18,.15,.073,.30);
        objectTarget(view,'soup',ox+.13,.30,oz+.07,.45,[view.x,.44,view.z],{mesh:ladle});
      }
    }
  }

  function show(run,index){
    current=run;focus=index;
    disposeObjects(lived);
    views.length=0;
    const isCut=run&&recipes[run.items[index]?.id]?.mode==='cut';
    cuttingBoard.scale.z=isCut?1.85:1;
    if(closer!==Boolean(isCut)){closer=Boolean(isCut);setLens();}
    if(!run||!run.items.length){
      cuttingBoard.visible=true;
      const garnish=new T.Group(); lived.add(garnish);
      garnish.position.set(-.68,0,-.22);
      garnish.add(makePlate(s.plate));
      octopus(garnish,s,true);
      const cutting=knife(lived,s);
      cutting.position.set(.74,board.y,board.z+.34);
      const raw=new T.Group(); lived.add(raw);
      raw.position.set(-.42,board.y,board.z-.11);
      stockMesh(raw,s.akami,recipes['akami-sashimi'],1.44);
      paint();
      return;
    }
    for(const [i,item] of run.items.entries()){
      const r=recipes[item.id], step=stepOf(run,item), selected=index===i;
      const view={...dishAt(run,i),recipe:r,item,index:i,step,selected,targets:[],group:new T.Group()};
      lived.add(view.group);
      views.push(view);
      if(r.mode==='cut') drawCut(view);
      else if(r.mode==='nigiri') drawNigiri(view);
      else drawOther(view);
      if(step==='serve'){
        const reach=step==='serve'&&run.items.length>1? .56:.70;
        const x=view.x+view.scale*.47;
        objectTarget(view,'plate',x,.17*view.scale,view.z+reach,.36,[x,.14,plate.lineZ-.32]);
      }else if(step!=='served'&&!selected){
        objectTarget(view,'select',view.x,.15,view.z+.49,.42);
      }
    }
    time(run);
    paint();
  }

  function time(run){
    for(const view of views){
      if(view.vapor){
        const ratio=clamp(elapsed(run,view.item.started)/view.recipe.duration,0,1);
        for(const [i,puff] of view.vapor.entries()){
          const rise=((run.clock/1100+i*.22)%1);
          puff.position.set(Math.sin(i*2.49+rise)*.29,.57+rise*.81,Math.cos(i*2)*.20);
          const size=.14+rise*.65;
          puff.scale.set(size,size*1.32,1);
          puff.material.opacity=(.16+.20*Number(view.item.prepared))*ratio*(1-rise);
        }
        paint();
      }
      if(view.step==='soaking'&&view.fish){
        const tone=clamp(elapsed(run,view.item.started)/3500,.03,.83);
        view.fish.marks(Array(7).fill(tone),false);
        paint();
      }
      if(view.cod){
        const baked=clamp(elapsed(run,view.item.turnedAt??view.item.started)/5500,0,1);
        const cod=view.cod;
        if(!cod.userData.ownMaterial){cod.material=cod.material.clone();cod.userData.ownMaterial=cod.material;}
        cod.material.color.setRGB(1-.26*baked,.85-.38*baked,.64-.35*baked);
        paint();
      }
    }
  }

  function guide(){
    const view=views[focus];
    if(!view) return null;
    const targets=view.targets;
    if(view.step==='serve') return targets.find(t=>t.kind==='plate');
    return targets.find(t=>t.kind===view.step)||targets.find(t=>!['select','plate'].includes(t.kind));
  }

  function pick(event){
    const rect=canvas.getBoundingClientRect();
    const u=event.clientX-rect.left,v=event.clientY-rect.top;
    let best=null, distance=1.01;
    for(const view of views) for(const t of view.targets){
      const [x,y]=project(t.center??t.x,t.y,t.z);
      const [ex]=project((t.center??t.x)+(t.half??t.r),t.y,t.z);
      const radius=Math.max(22,Math.abs(ex-x));
      const d=Math.hypot((u-x)/radius,(v-y)/(t.half?28:radius*.79+5));
      if(d<distance){best=t;distance=d;}
    }
    return best;
  }

  function preview(d){
    const view=views[d.target.index], t=d.target;
    if(!view||!d.world) return;
    const at=d.world;
    switch(t.kind){
      case 'knife':
        view.knife.mesh.position.x=view.knife.x+(d.gap-view.item.gap);
        view.knife.mesh.position.z=view.knife.start+d.progress*1.0;
        view.knife.mesh.position.y=T.MathUtils.lerp(view.knife.y,board.y+.002,d.progress);
        break;
      case 'piece':
        t.mesh.position.set(at.x,Math.max(board.y+.03,.24),at.z);
        break;
      case 'plate':
        view.tray.position.z=d.plateZ;
        break;
      case 'rice': {
        const newRice=riceShape(view.recipe,d.edges);
        view.rice.update(newRice);
        if(view.item.placement&&view.fish) view.fish.pose(newRice,view.item.placement,0,1);
        break;
      }
      case 'fish':
      case 'dip':
      case 'lift': {
        const fish=view.fish;
        const wasPlaced=Boolean(view.item.placement);
        if(wasPlaced&&fish.group.parent!==view.group){
          view.group.add(fish.group);
          fish.group.scale.setScalar(view.scale);
        }
        const scale=fish.group.scale.x;
        fish.group.position.set(at.x,0,at.z);
        fish.pose(view.shape??riceShape(view.recipe,view.item.edges),{x:0,z:0},.45/scale);
        break;
      }
      case 'lid':
        if(t.lid){
          t.lid.position.y=.49+d.progress*.40;
          t.lid.position.z=-d.progress*.60;
        }
        break;
      case 'brush':
      case 'torch':
        if(!view.fish) break;
        view.fish.marks(view.item.marks.map((n,i)=>n+d.marks[i]),t.kind==='torch');
        view.tool.position.set(at.x+.27,t.fishY-.24,at.z+.49);
        view.tool.rotation.y=.54;
        if(view.flame) view.flame.visible=d.inRange;
        break;
      case 'wrap':
      case 'roll':
        disposeObjects(view.folding);
        if(t.kind==='wrap'){
          t.mesh.visible=d.progress<.22;
          if(d.progress>.08)noriRing(view.folding,s,d.progress);
        }else if(d.progress>.08){
          view.flatRoll.visible=false;
          temaki(view.folding,s,false,d.progress);
        }else view.flatRoll.visible=true;
        break;
      case 'flip':
        if(t.mesh){
          t.mesh.rotation.z=d.progress*Math.PI;
          t.mesh.position.y=.095+Math.sin(d.progress*Math.PI)*.25;
        }
        break;
      default:
        if(t.mesh) t.mesh.position.set(at.x,.34,at.z);
    }
    paint();
  }

  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();
    stopped=true;
    cancelAnimationFrame(drawing);
    lost();
  });
  show(null,0);
  return {show,point,project,pick,guide,preview,time,paint};
}
