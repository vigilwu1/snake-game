import * as T from '../nigiri-preview/vendor/three.module.js';
import { material, makeMesh, box, makePiece, makeRice, plateTopAt } from '../nigiri-preview/scene.mjs?v=omakase-1';
import { clamp, plate, riceTopAt } from '../nigiri-preview/kitchen.mjs';

const assets = '../nigiri-preview/art/';
const textures = {
  wood: [assets + 'hinoki.jpg', '#c58b55'], board: [assets + 'hinoki.jpg', '#cc9b65'],
  plate: [assets + 'stoneware.jpg', '#38302b'],
  tuna: [assets + 'chutoro.jpg', '#b74f55'], shrimp: [assets + 'amaebi.jpg', '#eeb49b'],
  akami: ['./art/akami.jpg', '#aa302f'], otoro: ['./art/otoro.jpg', '#ebaaaa'],
  salmonBack: ['./art/salmon-back.jpg', '#ef7832'], salmonBelly: ['./art/salmon-belly.jpg', '#ee9861'],
  tai: ['./art/tai.jpg', '#f0dbc3'], hirame: ['./art/ika.jpg', '#e5dfc9'],
  silver: ['./art/silver.jpg', '#858889'], ika: ['./art/ika.jpg', '#f4e5dd'],
  nori: ['./art/nori.jpg', '#29301a'], eel: ['./art/eel.jpg', '#975529'],
  cod: ['./art/tai.jpg', '#e9c17d'],
};

export function makeSurfaces(renderer, onReady) {
  const result = {};
  const loader = new T.TextureLoader();
  for (const [key, [url, color]] of Object.entries(textures)) {
    const fish = !['wood', 'board', 'plate', 'nori'].includes(key);
    const surface = material(color, { roughness: fish ? 0.43 : 0.68, bumpScale: fish ? 0.012 : 0.025 });
    result[key] = surface;
    loader.load(url, (texture) => {
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      surface.map = texture;
      surface.bumpMap = texture;
      surface.color.set(key === 'cod' ? '#dab77d' : key === 'board' ? '#eed3a9' : key === 'akami' ? '#dcb8b4' : '#ffffff');
      surface.needsUpdate = true;
      onReady();
    }, undefined, () => {});
  }
  Object.assign(result, {
    egg: material('#e6ad51', { roughness: 0.56 }),
    custard: material('#f4d396', { roughness: 0.33 }),
    broth: material('#9b6741', { roughness: 0.22 }),
    soy: material('#4b2519', { roughness: 0.22 }),
    octopus: material('#f2c9b0', { roughness: 0.44 }),
    skin: material('#925e58', { roughness: 0.41 }),
    abalone: material('#bf9472', { roughness: 0.45 }),
    uni: material('#e69132', { roughness: 0.55 }),
    roe: material('#ed6723', { roughness: 0.25, metalness: 0.04 }),
    green: material('#4b7530', { roughness: 0.62 }),
    zest: material('#fed063', { roughness: 0.52 }),
    steel: material('#b6bcc0', { roughness: 0.29, metalness: 0.62 }),
    steelEdge: material('#ece7d9', { roughness: 0.33, metalness: 0.32 }),
    handle: material('#211815', { roughness: 0.63 }),
    tail: material('#c44b42', { roughness: 0.46 }),
  });
  return result;
}

export function add(parent, geometry, surface, x=0, y=0, z=0) {
  const mesh = makeMesh(geometry, surface, x, y, z);
  parent.add(mesh);
  return mesh;
}

export function oval(parent, surface, x, y, z, rx, ry, rz) {
  const mesh = add(parent,new T.SphereGeometry(1,20,12),surface,x,y,z);
  mesh.scale.set(rx,ry,rz);
  return mesh;
}

export function bowl(parent, surface, x=0, z=0, width=0.76, height=0.41) {
  const rings = [[0,0.015],[0.46,0.015],[0.62,0.09],[0.79,0.31],[0.92,0.68],
    [1,0.99],[0.976,1.01],[0.916,0.96],[0.78,0.54],[0.61,0.20],[0,0.15]];
  const path = rings.map(([r,y]) => new T.Vector2(r*width,y*height));
  return add(parent,new T.LatheGeometry(path,56),surface,x,0,z);
}

export function liquid(parent,surface,x,z,r,y) {
  const mesh=add(parent,new T.CircleGeometry(r,48),surface,x,y,z);
  mesh.rotation.x=-Math.PI/2;
  return mesh;
}

export function knife(parent,surfaces) {
  const group = new T.Group();
  parent.add(group);
  const shape = new T.Shape();
  shape.moveTo(-1.51,0.22);
  shape.quadraticCurveTo(-1.24,0.04,-0.75,0.015);
  shape.lineTo(0.03,0.008);
  shape.lineTo(0.12,0.24);
  shape.lineTo(-0.84,0.25);
  shape.closePath();
  const blade=new T.ExtrudeGeometry(shape,{depth:0.025,bevelEnabled:false});
  blade.rotateY(-Math.PI/2);
  add(group,blade,surfaces.steel);
  const edge=add(group, new T.BoxGeometry(0.032,0.022,0.80),surfaces.steelEdge,0,0.02,-0.38);
  edge.rotation.x=-0.014;
  const handle=add(group,new T.CylinderGeometry(0.087,0.102,0.51,10),surfaces.handle,0,0.13,0.35);
  handle.rotation.x=Math.PI/2;
  const bolster=add(group,new T.CylinderGeometry(0.092,0.092,0.13,12),surfaces.steel,0,0.13,0.105);
  bolster.rotation.x=Math.PI/2;
  return group;
}

function fishBlock(width,height,depth,bevel,offset=0) {
  const geometry=box(width,height,depth,bevel);
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
  for(let i=0;i<p.count;i++){
    const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
    const along=nx>nz&&nx>ny?p.getZ(i)/depth+.5:p.getX(i)/width+.5;
    const cross=ny>=nx&&ny>=nz?p.getZ(i)/depth+.5:p.getY(i)/height;
    uv.setXY(i,clamp(.08+along*.75+offset*.11,.02,.98),.09+.82*cross);
  }
  return geometry;
}

export function stockMesh(parent,surface,recipe,width) {
  const geometry=fishBlock(width,recipe.height,recipe.depth,Math.min(.021,width*.18,recipe.height*.18),recipe.length-width);
  const positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++) positions.setX(i,positions.getX(i)+(positions.getY(i)-recipe.height/2)*recipe.lean);
  geometry.computeVertexNormals();
  return add(parent,geometry,surface);
}

export function cutPiece(parent,surface,recipe,slice) {
  const narrow = !recipe.reserve;
  const x = narrow ? slice.thickness : recipe.height * (1.24+recipe.lean*0.24);
  const y = narrow ? recipe.height*0.74 : slice.thickness * 0.52;
  const z = recipe.depth;
  const geometry = fishBlock(x,y,z,Math.min(.028,y*.25,x*.16),slice.offset);
  const p = geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    p.setZ(i,p.getZ(i)+p.getX(i)*recipe.lean*0.40);
  }
  geometry.computeVertexNormals();
  const mesh=add(parent,geometry,surface);
  return {mesh,x,z};
}

export function topping(parent,surfaces,recipe,source) {
  const group=new T.Group();
  parent.add(group);
  const surface=surfaces[recipe.surface].clone();
  surface.vertexColors=true;
  surface.side=T.DoubleSide;
  group.userData.ownMaterial=surface;
  const pieces=[];
  const {x,z}=recipe.fish;
  const thickness=source ? clamp(source.thickness*0.38,0.043,0.20) :
    recipe.surface==='otoro' ? .15 : recipe.surface==='eel' ? .158 : .108;
  const shades=['#d3a995','#fff5e8'];
  if(recipe.surface==='shrimp'){
    for(const side of [-1,1]){
      pieces.push(makePiece(surface,(u,v)=>{
        const width=(0.35+0.65*Math.sin(Math.PI*u**0.7))*(1-0.46*u);
        return [(u*2-1)*x*0.88-0.12,side*(0.23-0.18*u)+v*width*z*0.70];
      },.098,shades));
      pieces.push(makePiece(surfaces.tail,(u,v)=>[x*.64+.38*u-.05*v,side*(.055+.21*u)+(0.028+.096*Math.sin(Math.PI*u))*v],.04,shades));
    }
  } else {
    pieces.push(makePiece(surface,(u,v)=>{
      const taper = recipe.surface==='silver' ? 0.36+0.62*Math.sin(Math.PI*u)**0.72 :
        0.53+0.47*Math.sin(Math.PI*u)**0.50;
      const lean = source?.lean ?? (recipe.surface==='salmonBack' ? 0.52 : 0.15);
      return [(u*2-1)*x+v*lean*0.18,z*v*taper+Math.sin(u*4.1)*0.035];
    },thickness,shades));
  }
  group.add(...pieces.map(piece=>piece.mesh));
  const bases = pieces.map(piece => piece.mesh.geometry.attributes.color.array.slice());
  const baseTint = new T.Color();
  const cookedTint = new T.Color();
  const marksTint = new T.Color();

  function marks(values, torch) {
    for(const [index,piece] of pieces.entries()){
      const {color,uv}=piece.mesh.geometry.attributes;
      for(let i=0;i<color.count;i++){
        const k=clamp((uv.getX(i)-.09)/.82*6,0,6);
        const j=Math.floor(k), amount=T.MathUtils.lerp(values[j],values[Math.min(j+1,6)],k-j);
        baseTint.fromArray(bases[index],i*3);
        if(torch){
          const freckles=Math.sin(uv.getX(i)*152.1+uv.getY(i)*193.2)*Math.sin(uv.getY(i)*118.4);
          const toast=clamp((amount-.25)*1.2,0,1)*clamp((freckles-.59)*2.8,0,.87);
          cookedTint.setRGB(1.48,1.47,1.07).lerp(marksTint.setRGB(.32,.22,.13),clamp(amount-.91+toast,0,1));
          baseTint.lerp(cookedTint,clamp(amount*1.83,0,1));
        } else {
          baseTint.lerp(marksTint.setRGB(.56,.42,.32),clamp(amount*.58,0,.8));
        }
        color.setXYZ(i,baseTint.r,baseTint.g,baseTint.b);
      }
      color.needsUpdate=true;
    }
    if(!torch) surface.roughness=clamp(.46-values.reduce((s,n)=>s+n,0)/30,.18,.46);
  }

  function pose(shape, offset, height, bend=0) {
    for(const piece of pieces) piece.update((x,z)=>{
      if(!bend) return height;
      const px=offset.x+x, pz=offset.z+z;
      const support = (riceTopAt(shape,px,pz)*3+riceTopAt(shape,px+.07,pz)+riceTopAt(shape,px-.07,pz)+
        riceTopAt(shape,px,pz+.07)+riceTopAt(shape,px,pz-.07))/7;
      return Math.max(plateTopAt(px,pz)+.012,plate.floor+.017+support+Math.min(.029,support*.38));
    },bend);
  }
  return { group, pose, marks };
}

export function octopus(parent,surfaces,seasoned) {
  for(let i=0;i<4;i++){
    const cell=new T.Group();
    parent.add(cell);
    cell.position.set((i-1.5)*.31,0.02,-0.04+i*.02);
    cell.rotation.y=(i-1.5)*.38;
    oval(cell,surfaces.skin,0,.10,0,.29,.135,.26);
    oval(cell,surfaces.octopus,0,.154,.014,.249,.10,.223);
    for(let j=0;j<3;j++){
      const x=(j-1)*.115;
      oval(cell,surfaces.skin,x,.104,.207,.052,.052,.042);
      oval(cell,surfaces.octopus,x,.111,.235,.038,.036,.019);
    }
  }
  if(seasoned) for(let i=0;i<11;i++){
    oval(parent,i%3===0?surfaces.zest:surfaces.green,Math.sin(i*2.4)*.56,.25+Math.sin(i)*.028,Math.cos(i*2.4)*.22,.033,.022,.018);
  }
}

export function steamed(parent,surfaces,recipe,item) {
  bowl(parent,surfaces.plate,0,0,.67,.48);
  if(recipe.surface==='abalone'){
    liquid(parent,surfaces.broth,0,0,.55,.34);
    for(let i=0;i<3;i++){
      const meat=oval(parent,surfaces.abalone,(i-1)*.25,.43,i*.05,.26,.098,.26);
      meat.rotation.y=i*.31;
    }
  }else{
    liquid(parent,surfaces.custard,0,0,.565,.37);
    for(const [x,z] of [[-.22,-.15],[.14,.16],[.21,-.23]]){
      oval(parent,surfaces.abalone,x,.406,z,.13,.048,.074);
      oval(parent,surfaces.green,x-.045,.416,z+.06,.053,.024,.034);
    }
  }
  if(item.prepared) return null;
  const lid=new T.Group();
  parent.add(lid);
  lid.position.y=.49;
  oval(lid,surfaces.plate,0,0,0,.69,.146,.69);
  oval(lid,surfaces.plate,0,.14,0,.13,.09,.13);
  return lid;
}

export function noriRing(parent,surfaces,progress=1) {
  const geometry=new T.CylinderGeometry(.60,.56,.46,45,3,true,-Math.PI/2,Math.PI*2*clamp(progress,.05,1));
  const shell=surfaces.nori.clone();
  shell.side=T.DoubleSide;
  const mesh=add(parent,geometry,shell,0,.24,0);
  mesh.userData.ownMaterial=shell;
  mesh.scale.z=.77;
  return mesh;
}

export function gunkan(parent,surfaces,item,recipe) {
  const rice=makeRice();
  parent.add(rice.group);
  rice.update({x:0,z:0,radiusX:.55,radiusZ:.39,height:.30});
  if(item.wrapped) noriRing(parent,surfaces);
  if(!item.prepared) return;
  if(recipe.surface==='roe') for(let i=0;i<Math.round(27*item.finishRatio);i++){
    const a=i*2.39996,r=Math.sqrt(i/27);
    oval(parent,surfaces.roe,Math.cos(a)*r*.45,.48-.105*r,Math.sin(a)*r*.32,.075,.069,.074);
  } else {
    for(let i=0;i<3;i++) oval(parent,surfaces.uni,(i-1)*.23,.43,0,.19,.12,.30).rotation.y=(i-1)*.25;
  }
}

export function temaki(parent,surfaces,finished,fold=0) {
  const sashimi = [];
  if(finished || fold>.04){
    const sheet=surfaces.nori.clone();
    sheet.side=T.DoubleSide;
    const cone=add(parent,new T.CylinderGeometry(.45,.034,1.39,51,7,true,0,2*Math.PI*(finished?1:fold)),sheet);
    cone.userData.ownMaterial=sheet;
    cone.position.set(0,.28,0);
    cone.rotation.z=-Math.PI/2+.26;
    if(!finished) return cone;
    oval(parent,surfaces.custard,.63,.46,0,.11,.27,.33);
    for(let i=0;i<8;i++) sashimi.push([.64+Math.sin(i*2)*.07,.44+Math.cos(i)*.16,Math.cos(i*2)*.24]);
  }else{
    add(parent,box(1.73,.045,1.22,.009),surfaces.nori,0,.005,0);
    oval(parent,surfaces.custard,-.30,.13,-.12,.43,.14,.34);
    for(let i=0;i<8;i++) sashimi.push([-.34+Math.sin(i*2)*.28,.19+Math.cos(i)*.025,-.15+Math.cos(i*2)*.24]);
  }
  for(const [x,y,z] of sashimi){
    add(parent,box(.18,.11,.19,.024),surfaces.akami,x,y,z).rotation.y=x*1.5;
    oval(parent,surfaces.green,x+.064,y+.063,z-.04,.049,.027,.033);
  }
  return null;
}

export function disposeObjects(group) {
  group.traverse(object => {
    object.geometry?.dispose();
    object.userData.ownMaterial?.dispose();
    object.dispose?.();
  });
  group.clear();
}
