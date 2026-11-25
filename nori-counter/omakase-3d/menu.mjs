import { recipes as preview } from '../nigiri-preview/kitchen.mjs';

const [middle, shrimp] = preview;
const hand = (x, z, height, targetRatio, edge, instruction) => ({ x, z, height, targetRatio, edge, instruction });
const standard = hand(0.76, 0.45, 0.27, [1, 3]);
const cut = (id, name, surface, target, length, depth, height, lean, reserve) => ({
  id, name, mode: 'cut', surface, target, length, depth, height, lean, reserve,
});
const dish = (id, name, mode, surface, extra = {}) => ({ id, name, mode, surface, ...extra });
const grip = (id, name, surface, fish, extra = {}) =>
  dish(id, name, 'nigiri', surface, { rice: standard, fish: { fitX: 0.23, fitZ: 0.18, ...fish }, ...extra });

const whiteRice = hand(0.81, 0.51, 0.31, [1.85, 2.6], 'near', '从饭团近侧推窄，给薄片留一条长底');
const fattyRice = hand(0.83, 0.58, 0.34, [1.16, 1.42], 'left', '从侧边收短饭团，给大腹留一面宽底');
const catalog = [
  dish('octopus', '柚子章鱼', 'garnish', 'octopus'),
  dish('chawan', '蛤蜊茶碗蒸', 'steam', 'egg', { duration: 7000 }),
  cut('tai-sashimi', '真鲷薄切刺身', 'tai', 0.16, 1.66, 1.06, 0.37, 0.67, 'tai-stock'),
  cut('akami-sashimi', '金枪鱼赤身刺身', 'akami', 0.30, 1.78, 1.12, 0.46, 0, 'akami-stock'),
  cut('ika-sashimi', '鱿鱼细切刺身', 'ika', 0.18, 0.62, 1.03, 0.115, 0, null),
  grip('tai', '真鲷握', 'tai', { x: 1.01, z: 0.39, fitZ: 0.14 }, { rice: whiteRice, source: 'tai-stock' }),
  grip('amaebi', '甜虾握', 'shrimp', shrimp.fish, { rice: { ...shrimp.rice, edge: 'near', instruction: shrimp.firstMove } }),
  grip('salmon-back', '三文鱼背肉握', 'salmonBack', { x: 1.07, z: 0.43, fitZ: 0.15 }),
  grip('aji', '竹荚鱼握', 'silver', { x: 0.96, z: 0.41 }),
  dish('saikyo', '西京烧银鳕鱼', 'grill', 'cod'),
  grip('kohada', '醋渍小肌握', 'silver', { x: 1.00, z: 0.40, fitZ: 0.14 }),
  grip('zuke', '渍赤身握', 'akami', { x: 0.94, z: 0.51 }, { method: 'marinate', source: 'akami-stock' }),
  grip('chutoro', '少饭中腹握', 'tuna', middle.fish, { rice: { ...middle.rice, edge: 'left', instruction: middle.firstMove } }),
  grip('otoro', '金枪鱼大腹握', 'otoro', { x: 0.96, z: 0.65 }, { rice: fattyRice }),
  grip('aburi', '炙三文鱼腹握', 'salmonBelly', { x: 1.10, z: 0.54 }, { method: 'torch' }),
  grip('anago', '刷汁煮穴子握', 'eel', { x: 1.14, z: 0.44 }, { method: 'brush' }),
  dish('awabi', '清酒蒸鲍鱼', 'steam', 'abalone', { duration: 4400 }),
  dish('ikura', '鲑鱼籽军舰', 'gunkan', 'roe'),
  dish('temaki', '葱花金枪鱼手卷', 'roll', 'akami'),
  dish('tamago', '玉子烧', 'egg', 'egg'),
  cut('hirame-sashimi', '比目鱼薄切刺身', 'hirame', 0.145, 1.59, 1.12, 0.32, 0.78, 'hirame-stock'),
  grip('hirame', '比目鱼握', 'hirame', { x: 1.04, z: 0.37, fitZ: 0.13 }, { rice: whiteRice, source: 'hirame-stock' }),
  grip('salmon-belly', '生三文鱼腹握', 'salmonBelly', { x: 1.02, z: 0.57 }),
  dish('miso', '鱼骨味噌汤', 'soup', 'broth'),
  grip('hotate', '帆立贝握', 'ika', { x: 0.77, z: 0.52 }),
  dish('uni', '海胆军舰', 'gunkan', 'uni'),
];

export const recipes = Object.fromEntries(catalog.map((recipe) => [recipe.id, recipe]));

const classic = [
  ['octopus', 'chawan'], ['tai-sashimi'], ['akami-sashimi'], ['ika-sashimi'],
  ['tai', 'amaebi'], ['salmon-back', 'aji'], ['saikyo'],
  ['kohada', 'zuke'], ['chutoro', 'otoro'], ['aburi', 'anago'],
  ['awabi'], ['ikura'], ['temaki'], ['tamago'],
];
const replace = (substitutes) => classic.map(group => group.map(id => substitutes[id] ?? id));
export const menus = {
  classic: { name: '经典席', note: '我想先吃点清口的。小肌可以先于渍赤身。', first: 'octopus', groups: classic },
  light: { name: '清鲜席', note: '白身鱼想吃薄一点，先来一口清爽的。', first: 'octopus', groups: replace({
    'tai-sashimi': 'hirame-sashimi', tai: 'hirame', aburi: 'salmon-belly', tamago: 'miso',
  }) },
  flame: { name: '炙香席', note: '想先吃热的，三文鱼腹请炙得匀一点。', first: 'chawan', groups: replace({
    aji: 'hotate', ikura: 'uni',
  }) },
  rehearsal: { name: '六道验证席', note: '茶碗蒸可以和章鱼一起备。赤身留一片稍后入渍汁。', first: 'octopus',
    groups: [['octopus', 'chawan'], ['tai-sashimi'], ['akami-sashimi'], ['zuke', 'aburi']] },
  practice: { name: '切付练习', note: '练习赤身平切、真鲷斜切、鱿鱼细切。', groups: [
    ['akami-sashimi'], ['tai-sashimi'], ['ika-sashimi'],
  ] },
};
