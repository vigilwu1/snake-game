window.mealSource = {app:{"pages": ["pages/prep/index", "pages/today/index", "pages/recipes/index", "pages/review/index", "pages/recipe/index", "pages/recipe/edit", "pages/schedule/index", "pages/records/index"], "window": {"navigationBarTitleText": "周末备餐", "navigationBarBackgroundColor": "#fdfbf7", "navigationBarTextStyle": "black", "backgroundColor": "#fdfbf7"}, "tabBar": {"color": "#6b6057", "selectedColor": "#a33e2e", "backgroundColor": "#fdfbf7", "borderStyle": "white", "list": [{"pagePath": "pages/prep/index", "text": "备餐", "iconPath": "assets/prep.png", "selectedIconPath": "assets/prep-active.png"}, {"pagePath": "pages/recipes/index", "text": "菜谱", "iconPath": "assets/recipes.png", "selectedIconPath": "assets/recipes-active.png"}, {"pagePath": "pages/review/index", "text": "历史", "iconPath": "assets/review.png", "selectedIconPath": "assets/review-active.png"}]}, "style": "v2", "sitemapLocation": "sitemap.json"},titles:{"pages/prep/index": "备餐", "pages/today/index": "周末备餐", "pages/recipes/index": "菜谱", "pages/review/index": "历史", "pages/recipe/index": "菜谱详情", "pages/recipe/edit": "新增菜谱", "pages/schedule/index": "编辑菜单", "pages/records/index": "备餐记录"},assetVersions:{"/assets/rec-boiled-shrimp.jpg": "11f6d497a289", "/assets/rec-broccoli-beef.jpg": "b3ede3980ce2", "/assets/rec-cauliflower-chickpeas.jpg": "31d60316e722", "/assets/rec-miso-salmon.jpg": "c68a4942d842", "/assets/rec-mushroom-tofu.jpg": "07bdc7a6fbb1", "/assets/rec-pepper-chicken.jpg": "0061d8ed86bf", "/assets/rec-roasted-vegetables.jpg": "c36b6412dcda", "/assets/rec-shiitake-chicken.jpg": "71c28d655739", "/assets/rec-soy-drumsticks.jpg": "309b8ed9b79e", "/assets/rec-steamed-cod.jpg": "f77725d95823", "/assets/rec-tomato-beef-beans.jpg": "16fad809036f", "/assets/rec-tomato-egg-edamame.jpg": "6e18f1024ec7", "/assets/welcome.jpg": "f6e45efb4e1d"},modules:{"app":function(require,module,exports){
App({ globalData: { activeWeek: '' } })

},"lib/dates":function(require,module,exports){
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const mealLabels = { lunch: '午餐', dinner: '晚餐' }

function pad(number) {
  return String(number).padStart(2, '0')
}

function dayKey(date = new Date()) {
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-')
}

function dayDate(key) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function addDays(key, days) {
  const date = dayDate(key)
  date.setDate(date.getDate() + days)
  return dayKey(date)
}

function monday(key = dayKey()) {
  return addDays(key, -((dayDate(key).getDay() + 6) % 7))
}

function nextMonday() {
  return addDays(monday(), 7)
}

function weekday(key) {
  return weekdays[dayDate(key).getDay()]
}

function shortDate(key) {
  return key.slice(5).replace('-', '.')
}

function weekLabel(start) {
  const end = addDays(start, 6)
  const first = start.slice(0, 4) === dayKey().slice(0, 4) ? shortDate(start) : start.replace(/-/g, '.')
  const last = start.slice(0, 4) === end.slice(0, 4) ? shortDate(end) : end.replace(/-/g, '.')
  return first + ' – ' + last
}

function defaultSlots(start) {
  return Array.from({ length: 5 }, (_, offset) => ({
    date: addDays(start, offset),
    meal: 'lunch'
  }))
}

function slotKey(date, meal) {
  return date + '/' + meal
}

function compareSlots(first, second) {
  return first.date.localeCompare(second.date) ||
    Number(first.meal === 'dinner') - Number(second.meal === 'dinner')
}

function moveSlots(slots, from, to) {
  const dates = new Map(Array.from({ length: 7 }, (_, index) => [
    addDays(from, index),
    addDays(to, index)
  ]))
  return slots.map(slot => ({ date: dates.get(slot.date), meal: slot.meal }))
}

function timeLabel(timestamp) {
  const date = new Date(timestamp)
  return pad(date.getHours()) + ':' + pad(date.getMinutes())
}

module.exports = {
  addDays, compareSlots, dayKey, defaultSlots, mealLabels, monday, moveSlots, nextMonday,
  shortDate, slotKey, timeLabel, weekLabel, weekday
}

},"lib/journal":function(require,module,exports){
const dates = require('./dates')
const recommendations = require('./recommendations')
const storageKey = 'weekend-meals/v1'
const places = ['chilled', 'frozen']
let idSequence = 0

function makeId() {
  idSequence += 1
  return Date.now().toString(36) + '-' + idSequence.toString(36) + '-' + Math.random().toString(36).slice(2, 7)
}

function read() {
  const state = wx.getStorageSync(storageKey) || { recipes: [], weeks: {} }
  for (const [start, current] of Object.entries(state.weeks)) {
    if (current.menu) continue
    const { recipe, ...old } = current
    state.weeks[start] = {
      ...emptyWeek(start), ...old,
      menu: recipe ? [recipe] : [],
      targetBoxes: old.slots?.length || 5
    }
  }
  return state
}

function write(state) {
  try {
    wx.setStorageSync(storageKey, state)
  } catch (error) {
    throw new Error('保存失败，请检查可用存储空间后重试')
  }
}

function emptyWeek(start) {
  return {
    start, menu: [], targetBoxes: 5, slots: [], shopping: [], expenses: [], notes: [], cooked: [], batch: null, eaten: []
  }
}

function week(start, state = read()) {
  return state.weeks[start] || emptyWeek(start)
}

function updateWeek(start, edit) {
  const state = read()
  const current = week(start, state)
  edit(current)
  state.weeks[start] = current
  write(state)
}

function ingredientsFromText(text) {
  const ingredients = new Map()
  for (const line of text.split(/\r?\n/)) {
    const [name, ...amount] = line.trim().split(/\s+/)
    if (name) {
      ingredients.set(name, { name, amount: amount.join(' ') })
    }
  }
  return Array.from(ingredients.values())
}

function ingredientsToText(ingredients) {
  return ingredients.map(({ name, amount }) => [name, amount].filter(Boolean).join(' ')).join('\n')
}

function findRecipe(id, state = read()) {
  return state.recipes.find(recipe => recipe.id === id) || recommendations.find(recipe => recipe.id === id)
}

function collectRecommendation(id) {
  const original = recommendations.find(recipe => recipe.id === id)
  if (!original) throw new Error('找不到这道推荐菜谱')
  const state = read()
  const existing = state.recipes.find(recipe => recipe.recommendationId === id)
  if (existing) return existing
  const recipe = {
    ...original, source: { ...original.source }, id: makeId(),
    ingredients: original.ingredients.map(item => ({ ...item })),
    recommendationId: id, updatedAt: Date.now()
  }
  state.recipes.unshift(recipe)
  write(state)
  return recipe
}

function uncollectRecommendation(id) {
  const state = read()
  const recipe = state.recipes.find(item => item.recommendationId === id)
  if (!recipe) return null
  const { recommendationId, customized, ...personal } = recipe
  // Older edits dropped the original duration without recording an edit flag.
  const kept = customized ?? (recipe.minutes == null)
  state.recipes = kept
    ? state.recipes.map(item => item.id === recipe.id ? personal : item)
    : state.recipes.filter(item => item.id !== recipe.id)
  write(state)
  return { recipe, kept }
}

function deleteRecipe(id) {
  const state = read()
  const recipe = state.recipes.find(item => item.id === id)
  if (!recipe) throw new Error('找不到这份菜谱')
  state.recipes = state.recipes.filter(item => item.id !== id)
  write(state)
  return recipe
}

function saveRecipe(input) {
  const title = input.title.trim()
  if (!title) throw new Error('先写一个菜名')
  const state = read()
  const existing = state.recipes.find(recipe => recipe.id === input.id)
  if (input.id && !existing) throw new Error('找不到这份菜谱')
  const servingsInput = String(input.servings ?? existing?.servings ?? '').trim()
  const servings = servingsInput ? countValue(servingsInput, '菜谱份数') : null
  if (servings === 0) throw new Error('菜谱份数至少为 1')
  const recipe = {
    id: existing ? existing.id : makeId(),
    title,
    photo: input.photo || '',
    ingredients: ingredientsFromText(input.ingredients),
    method: input.method.trim(),
    category: input.category ?? existing?.category ?? '',
    ...(servings ? { servings } : {}),
    updatedAt: Date.now(),
    ...(existing?.recommendationId ? { recommendationId: existing.recommendationId, customized: true } : {}),
    ...(existing?.source ? { source: { ...existing.source } } : {})
  }
  state.recipes = [recipe, ...state.recipes.filter(item => item.id !== recipe.id)]
  write(state)
  return recipe
}

function shoppingKey(name) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

function amountParts(amount) {
  const match = (amount || '').trim().match(/^(\d+(?:\.\d+)?)\s*([\u4e00-\u9fffA-Za-z]+)$/)
  return match ? { value: Number(match[1]), unit: match[2].toLowerCase() } : null
}

function quantity(value, unit) {
  return Number(value.toFixed(2)) + ' ' + unit
}

function shoppingNeeds(menu, targetBoxes) {
  const groups = new Map()
  for (const dish of menu) {
    for (const item of dish.ingredients) {
      const key = shoppingKey(item.name)
      if (!groups.has(key)) groups.set(key, { name: item.name, uses: [] })
      const parts = amountParts(item.amount)
      const value = parts && parts.value * (dish.servings ? targetBoxes / dish.servings : 1)
      groups.get(key).uses.push({
        dishId: dish.id, title: dish.title, amount: parts && dish.servings ? quantity(value, parts.unit) : item.amount,
        unit: parts ? parts.unit : '', value
      })
    }
  }
  for (const group of groups.values()) {
    const [first] = group.uses
    const addable = first.unit && group.uses.every(use => use.unit === first.unit)
    group.amount = addable ? quantity(group.uses.reduce((sum, use) => sum + use.value, 0), first.unit)
      : (group.uses.length === 1 ? first.amount : '')
  }
  return groups
}

function syncShopping(current) {
  const desired = shoppingNeeds(current.menu, current.targetBoxes)
  const shopping = []
  for (const item of current.shopping) {
    const key = shoppingKey(item.name)
    const need = desired.get(key)
    desired.delete(key)
    if (need) shopping.push({
      ...item, ...need, ...(item.manual ? { amount: item.amount || need.amount } : {}), removed: false
    })
    else if (item.manual) shopping.push({ ...item, uses: [], removed: false })
    else if (item.status !== 'todo') shopping.push({ ...item, uses: [], removed: true })
  }
  for (const need of desired.values()) shopping.push({ ...need, id: makeId(), status: 'todo', manual: false })
  current.shopping = shopping
}

function checkPlan(start, targetBoxes, slots) {
  if (dates.monday(start) !== start) throw new Error('请选择一个备餐周')
  if (!countValue(targetBoxes, '计划盒数')) throw new Error('至少计划一盒')
  const keys = new Set()
  for (const { date, meal } of slots) {
    const key = dates.slotKey(date, meal)
    if (dates.monday(date) !== start || !dates.mealLabels[meal] || keys.has(key)) {
      throw new Error('这周的排餐日期有误，请重新选择')
    }
    keys.add(key)
  }

}

function updatePlan(start, edit) {
  updateWeek(start, current => {
    if (current.batch) throw new Error('这周已分装，请选择其他备餐周')
    edit(current)
    syncShopping(current)
  })
}

function setPlan(start, targetBoxes, slots) {
  checkPlan(start, targetBoxes, slots)
  updatePlan(start, current => {
    current.targetBoxes = Number(targetBoxes)
    current.slots = slots.slice().sort(dates.compareSlots)
  })
}

function addDish(start, recipe) {
  if (!recipe?.title?.trim()) throw new Error('先填写菜名')
  if (dates.monday(start) !== start) throw new Error('请选择一个备餐周')
  const dish = {
    ...recipe, id: recipe.id || makeId(), title: recipe.title.trim(),
    photo: recipe.photo || '', method: recipe.method || '',
    ingredients: (recipe.ingredients || []).map(item => ({ ...item }))
  }
  updatePlan(start, current => {
    if (current.menu.some(item => item.id === dish.id || (!recipe.id && item.title === dish.title))) {
      throw new Error('菜单里已有这道菜')
    }
    current.menu.push(dish)
  })
}

function removeDish(start, id) {
  updatePlan(start, current => {
    current.menu = current.menu.filter(dish => dish.id !== id)
    current.cooked = current.cooked.filter(dishId => dishId !== id)
  })
}

function copyPlan(from, to) {
  const source = week(from)
  if (!source.menu.length || from === to) throw new Error('请选择另一周复做这套菜单')
  const slots = dates.moveSlots(source.slots, from, to)
  checkPlan(to, source.targetBoxes, slots)
  updatePlan(to, current => {
    current.menu = source.menu
    current.targetBoxes = source.targetBoxes
    current.slots = slots
    current.cooked = []
  })
}

function setCookDone(start, id, done) {
  updateWeek(start, current => {
    if (!current.menu.some(dish => dish.id === id)) throw new Error('找不到这道菜')
    current.cooked = current.cooked.filter(dishId => dishId !== id)
    if (done) current.cooked.push(id)
  })
}

function addShopping(start, name, amount) {
  name = name.trim()
  if (!name) throw new Error('先填写食材名')
  updateWeek(start, current => {
    if (current.shopping.some(item => item.name === name)) throw new Error('清单里已经有这项食材')
    current.shopping.push({ id: makeId(), name, amount: amount.trim(), status: 'todo', manual: true })
  })
}

function setShoppingStatus(start, id, status) {
  if (!['todo', 'at-home', 'bought'].includes(status)) throw new Error('无效的采购状态')
  updateWeek(start, current => {
    const item = current.shopping.find(entry => entry.id === id)
    if (!item) throw new Error('找不到这项食材')
    item.status = status
  })
}

function expenseCents(value) {
  const amount = String(value).trim()
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(amount)) throw new Error('请填写金额，最多两位小数')
  const [yuan, fraction = ''] = amount.split('.')
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, '0'))
  if (cents <= 0) throw new Error('实付金额需要大于 0')
  return cents
}

function saveEntry(start, type, input) {
  const isExpense = type === 'expenses'
  if (!isExpense && type !== 'notes') throw new Error('找不到这个记录类型')
  const text = (input.text || '').trim()
  if (!isExpense && !text && !input.photo) throw new Error('拍张照片或写一句再保存')
  const fields = isExpense
    ? { cents: expenseCents(input.amount), shop: (input.shop || '').trim() }
    : { text }

  updateWeek(start, current => {
    const index = current[type].findIndex(entry => entry.id === input.id)
    if (input.id && index < 0) throw new Error('找不到这条记录')
    const existing = current[type][index]
    const dish = isExpense ? null : current.menu.find(item => item.id === input.dishId)
    const entry = {
      id: existing ? existing.id : makeId(),
      createdAt: existing ? existing.createdAt : Date.now(),
      photo: input.photo || '',
      ...fields,
      ...(dish ? { dishId: dish.id, dishTitle: dish.title } : {}),
      ...(!dish && existing?.dishId === input.dishId && input.dishId
        ? { dishId: existing.dishId, dishTitle: existing.dishTitle } : {})
    }
    if (existing) current[type][index] = entry
    else current[type].push(entry)
  })
}

function removeEntry(start, type, id) {
  if (!['expenses', 'notes'].includes(type)) throw new Error('找不到这个记录类型')
  updateWeek(start, current => {
    current[type] = current[type].filter(entry => entry.id !== id)
  })
}

function stockFor(current) {
  const result = { chilled: 0, frozen: 0, total: 0 }
  if (current.batch) {
    result.chilled = current.batch.chilled
    result.frozen = current.batch.frozen
    for (const entry of current.eaten) result[entry.place] -= 1
    result.total = result.chilled + result.frozen
  }
  return result
}

function countValue(input, label) {
  const normalized = String(input).trim()
  const number = Number(normalized)
  if (!/^\d+$/.test(normalized) || number > 99) throw new Error(label + '需要是 0 到 99 的整数')
  return number
}

function optionalNumber(input, label) {
  const normalized = String(input || '').trim()
  if (normalized === '') return null
  const value = Number(normalized)
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(normalized)) throw new Error('请检查' + label + '的数值')
  return value
}

function saveBatch(start, input) {
  const count = countValue(input.count, '实际盒数')
  const chilled = countValue(input.chilled, '冷藏盒数')
  const frozen = countValue(input.frozen, '冷冻盒数')
  if (!count) throw new Error('至少登记一盒成品')
  if (chilled + frozen !== count) throw new Error('冷藏和冷冻盒数加起来要等于实际盒数')

  updateWeek(start, current => {
    if (!current.menu.length) throw new Error('先安排这周的菜单')
    const usedChilled = current.eaten.filter(entry => entry.place === 'chilled').length
    const usedFrozen = current.eaten.length - usedChilled
    if (chilled < usedChilled || frozen < usedFrozen) throw new Error('存放盒数不能少于已经吃掉的对应盒数')
    current.batch = {
      count, chilled, frozen, photo: input.photo || '',
      weight: optionalNumber(input.weight, '每盒重量'),
      calories: optionalNumber(input.calories, '每盒热量'),
      protein: optionalNumber(input.protein, '每盒蛋白质')
    }
  })
}

function eat(start, place) {
  updateWeek(start, current => {
    if (!places.includes(place) || stockFor(current)[place] <= 0) {
      throw new Error('这个位置已经没有餐盒了')
    }
    current.eaten.push({ date: dates.dayKey(), place, createdAt: Date.now() })
  })
}

function undoEat(start) {
  updateWeek(start, current => {
    current.eaten.pop()
  })
}

function totalSpent(current) {
  return current.expenses.reduce((total, item) => total + item.cents, 0)
}

module.exports = {
  addDish, addShopping, collectRecommendation, copyPlan, deleteRecipe, eat, expenseCents, findRecipe, ingredientsToText, read,
  removeDish, removeEntry, saveBatch, saveEntry, saveRecipe, setCookDone, setPlan, setShoppingStatus, stockFor,
  totalSpent, uncollectRecommendation, undoEat, week
}

},"lib/photo-credits":function(require,module,exports){
function pexels(slug, note = '') {
  return {
    name: 'Pexels',
    url: 'https://www.pexels.com/photo/' + slug + '/',
    note
  }
}

module.exports = {
  '/assets/welcome.jpg': pexels('flat-lay-photography-of-three-tray-of-foods-1640775'),
  '/assets/rec-soy-drumsticks.jpg': pexels('sizzling-chicken-drumsticks-in-a-pan-36718511', '锅煮鸡腿实拍'),
  '/assets/rec-roasted-vegetables.jpg': pexels('grilled-vegetables-plate-bell-pepper-zucchini-onion-36183197', '彩椒与西葫芦摆盘'),
  '/assets/rec-boiled-shrimp.jpg': pexels('boiled-shrimps-566344', '水煮带壳虾实拍'),
  '/assets/rec-steamed-cod.jpg': pexels('steamed-fish-with-mushrooms-8983415', '整鱼清蒸摆盘参考'),
  '/assets/rec-shiitake-chicken.jpg': pexels('gourmet-grilled-chicken-with-mushrooms-and-sauce-37045063', '鸡肉与蘑菇摆盘参考'),
  '/assets/rec-broccoli-beef.jpg': pexels('bowl-of-meat-and-broccoli-5836633', '牛肉与西兰花摆盘'),
  '/assets/rec-tomato-beef-beans.jpg': pexels('hand-holding-a-bowl-with-chilli-con-carne-14866629', '牛肉炖豆实拍'),
  '/assets/rec-miso-salmon.jpg': pexels('baked-salmon-in-ceramic-plate-5741440', '烤三文鱼摆盘参考'),
  '/assets/rec-pepper-chicken.jpg': pexels('delicious-stir-fried-asian-chicken-with-vegetables-37297750', '鸡肉小炒摆盘参考'),
  '/assets/rec-cauliflower-chickpeas.jpg': pexels('chickpeas-and-vegetables-on-a-tray-6541639', '烤花菜与鹰嘴豆实拍'),
  '/assets/rec-mushroom-tofu.jpg': pexels('cooked-food-on-ceramic-plate-5848471', '照片中豆腐搭配木耳'),
  '/assets/rec-tomato-egg-edamame.jpg': pexels('delicious-chinese-tomato-and-egg-stir-fry-29529570', '番茄炒蛋摆盘参考')
}

},"lib/recommendations":function(require,module,exports){
const sides = new Set(['roasted-vegetables', 'cauliflower-chickpeas'])

function entry(id, title, minutes, summary, pairing, ingredients, steps, sourceName, sourceUrl) {
  return {
    id: 'rec-' + id,
    title,
    category: sides.has(id) ? 'side' : 'main',
    photo: '/assets/rec-' + id + '.jpg',
    minutes,
    servings: 5,
    summary,
    pairing,
    ingredients: ingredients.map(([name, amount]) => ({ name, amount })),
    method: steps.map((step, index) => (index + 1) + '. ' + step).join('\n\n'),
    source: { name: sourceName, url: sourceUrl }
  }
}

module.exports = [
  entry('soy-drumsticks', '酱香卤鸡腿', 40, '姜葱和八角提香，一锅卤五只，酱香够浓。', '配彩椒西葫芦和糙米。',
    [['鸡小腿', '5 只，约 800 g'], ['低钠生抽', '35 mL'], ['老抽', '5 mL'], ['姜', '4 片'], ['葱', '1 根'], ['八角', '1 颗']],
    [
      '鸡腿擦干，想减油可以先去皮。小锅里放姜、葱、八角、生抽、老抽和约 450 mL 水，煮开。',
      '放入鸡腿，转小火盖锅卤约 25–30 分钟，中途翻一次。鸡腿最厚处达到 74°C 后关火。',
      '取出分装，每份舀一小勺卤汁。喜欢更清爽，可以出锅后撒些葱花。'
    ], 'The Woks of Life · 豉油鸡', 'https://thewoksoflife.com/soy-sauce-chicken/'),

  entry('roasted-vegetables', '彩椒西葫芦烤盘', 25, '边缘微焦，彩椒自然回甜，备餐时很省手。', '作便当配菜，配卤鸡腿、虾或豆腐。',
    [['彩椒', '3 个'], ['西葫芦', '2 根'], ['橄榄油', '10 mL'], ['蒜粉', '½ 小匙'], ['黑胡椒', '少许'], ['盐', '少许']],
    [
      '烤箱预热至 220°C。彩椒切粗条，西葫芦切约 1.5 厘米厚的半月片，擦干多余水分。',
      '拌橄榄油、蒜粉和黑胡椒，平铺在烤盘上。装不下就用两个烤盘。',
      '烤约 15–20 分钟，中途翻一次。边缘上色就出炉，按口味撒一点盐。'
    ], 'RecipeTin Eats · 烤蔬菜', 'https://www.recipetineats.com/roasted-vegetables/'),

  entry('boiled-shrimp', '姜葱白灼基围虾', 15, '姜葱水煮虾，鲜甜弹嫩，蘸汁可单独装。', '配烤蔬菜和杂粮饭。',
    [['基围虾', '约 1 kg，带壳'], ['姜', '5 片'], ['葱', '2 根'], ['低钠生抽', '20 mL'], ['米醋', '10 mL']],
    [
      '虾冲净并按需要挑去虾线。姜片和一半葱段加水煮开。',
      '虾下锅，量多就分两批。水再次沸腾后观察虾肉，变成白色或珠白色且不透明就捞出。',
      '剩下的葱切碎，用生抽、米醋和一小勺凉开水调蘸汁。虾和蘸汁分开装。'
    ], 'The Woks of Life · 姜葱白灼虾', 'https://thewoksoflife.com/boiled-shrimp-dipping-sauce/'),

  entry('steamed-cod', '清蒸姜葱鳕鱼', 20, '用鱼柳省去处理整鱼，姜丝和葱丝调味。', '配西兰花和糙米，蒸鱼汁单独装。',
    [['鳕鱼柳', '650 g'], ['姜', '约 15 g'], ['葱', '2 根'], ['低钠生抽', '20 mL'], ['香油', '5 mL']],
    [
      '鳕鱼在冰箱冷藏室解冻后擦干，切五份。姜和葱切细丝，取一半姜丝铺到鱼上。',
      '蒸锅水沸后上锅。约 2–3 厘米厚的鱼柳先蒸 7–10 分钟，再按厚度调整，中心达到 63°C。',
      '倒掉盘里多余水分，撒上剩下的姜葱。淋生抽、香油和一小勺热水即可。'
    ], 'The Woks of Life · 粤式清蒸鱼', 'https://thewoksoflife.com/cantonese-steamed-fish/'),

  entry('shiitake-chicken', '香菇蒸鸡', 35, '鸡腿肉和香菇一起蒸，汤汁能直接拌饭。', '配菜心和杂粮饭。',
    [['去皮鸡腿肉', '650 g'], ['鲜香菇', '250 g'], ['低钠生抽', '25 mL'], ['姜', '约 10 g'], ['玉米淀粉', '2 小匙'], ['葱', '1 根']],
    [
      '鸡腿肉切约 2 厘米块，香菇切片。拌入姜丝、生抽、淀粉和一小勺水，腌 10 分钟。',
      '鸡块和香菇铺在浅盘里，尽量排成一层。水开后大火蒸约 12–16 分钟，鸡肉中心达到 74°C。',
      '撒葱花，连同盘中蒸汁分装。量大时分盘蒸，受热更均匀。'
    ], 'Red House Spice · 香菇蒸鸡', 'https://redhousespice.com/steamed-chicken-mushroom/'),

  entry('broccoli-beef', '西兰花嫩炒牛肉', 25, '牛肉逆纹切，青菜单独焯一下，复热也好拌饭。', '配糙米或蒸南瓜。',
    [['瘦牛肉', '550 g'], ['西兰花', '600 g'], ['低钠生抽', '25 mL'], ['蒜', '3 瓣'], ['玉米淀粉', '2 小匙'], ['食用油', '10 mL'], ['黑胡椒', '少许']],
    [
      '牛肉逆纹切薄片，用一半生抽、淀粉和一小勺水拌匀，放 10 分钟。西兰花分小朵，焯约 1 分钟后沥干。',
      '热锅放油，牛肉分批摊开快炒至熟，盛起。用锅中余油炒香蒜末，加入西兰花。',
      '牛肉倒回锅，放余下的生抽、两小勺水和黑胡椒，翻炒至均匀。'
    ], 'The Woks of Life · 西兰花炒牛肉', 'https://thewoksoflife.com/beef-with-broccoli-all-purpose-stir-fry-sauce/'),

  entry('tomato-beef-beans', '番茄牛肉炖红腰豆', 35, '番茄酸甜，牛肉末和现成红腰豆一锅炖。', '适合分装冷冻，配糙米或全麦卷饼。',
    [['瘦牛肉末', '500 g'], ['罐装碎番茄', '400 g'], ['罐装熟红腰豆', '1 罐，沥干约 240 g'], ['洋葱', '1 个'], ['食用油', '5 mL'], ['孜然粉', '1 小匙'], ['黑胡椒', '少许']],
    [
      '洋葱切丁，红腰豆沥干冲洗。锅里加一点油，把洋葱炒软，再加牛肉末炒散。',
      '加入碎番茄、孜然和约 80 mL 水。小火炖 15–20 分钟，牛肉末煮透至 71°C。',
      '倒入红腰豆再炖 5 分钟，最后撒黑胡椒。喜欢辣可以在分装时另外加辣椒粉。'
    ], 'Good Food · 牛肉炖豆', 'https://www.bbcgoodfood.com/recipes/chilli-con-carne-recipe'),

  entry('miso-salmon', '味噌烤三文鱼', 30, '薄薄抹一层味噌，烤出咸鲜和焦香。', '配芦笋、烤南瓜或杂粮饭。',
    [['三文鱼柳', '约 650 g，切 5 块'], ['白味噌', '25 g'], ['米醋', '5 mL'], ['温水', '15 mL'], ['柠檬', '½ 个']],
    [
      '烤箱预热至 200°C。味噌用温水和米醋调匀，薄薄抹在鱼肉上，放 10 分钟。',
      '鱼皮朝下摆在烤盘里，按厚度烤约 10–15 分钟。鱼肉最厚处达到 63°C 即可出炉。',
      '吃前挤一点柠檬汁。复热时盖住餐盒透气加热，鱼肉更容易保湿。'
    ], 'Just One Cookbook · 味噌三文鱼', 'https://www.justonecookbook.com/miso-salmon/'),

  entry('pepper-chicken', '黑椒杏鲍菇鸡胸', 25, '鸡胸切成小块，杏鲍菇和彩椒让口感更丰富。', '配杂粮饭或蒸小土豆。',
    [['鸡胸肉', '650 g'], ['杏鲍菇', '300 g'], ['彩椒', '1 个'], ['低钠生抽', '25 mL'], ['玉米淀粉', '2 小匙'], ['食用油', '10 mL'], ['粗磨黑胡椒', '1 小匙']],
    [
      '鸡胸切成约 2 厘米块，用一半生抽、淀粉和一点水拌匀。杏鲍菇和彩椒切块。',
      '锅热后倒一半油，分批炒鸡胸；鸡肉达到 74°C 后盛起。加剩下的油，把杏鲍菇炒到边缘上色，加入彩椒。',
      '鸡胸倒回锅，加剩余生抽、黑胡椒和少量清水，翻匀后起锅。'
    ], 'Omnivore’s Cookbook · 黑椒鸡', 'https://omnivorescookbook.com/black-pepper-chicken/'),

  entry('cauliflower-chickpeas', '柠檬孜然烤花菜鹰嘴豆', 35, '花菜微焦，鹰嘴豆有嚼劲，出炉挤柠檬很提味。', '作配菜，配煎豆腐、鸡腿或鸡蛋。',
    [['花菜', '650 g'], ['罐装熟鹰嘴豆', '1 罐，沥干约 240 g'], ['橄榄油', '10 mL'], ['孜然粉', '1 小匙'], ['柠檬', '½ 个'], ['黑胡椒', '少许']],
    [
      '烤箱预热至 220°C。花菜切小朵，熟鹰嘴豆冲洗沥干，用厨房纸擦干。',
      '一起拌橄榄油、孜然和黑胡椒，摊在烤盘上，烤约 22–28 分钟，中途翻动。',
      '花菜变软、边缘上色后出炉，挤上柠檬汁再分装。'
    ], 'Good Food · 孜然花菜和鹰嘴豆', 'https://www.bbcgoodfood.com/recipes/spiced-cauliflower-chickpeas-herbs-pine-nuts/'),

  entry('mushroom-tofu', '葱香蘑菇煎豆腐', 25, '老豆腐煎出金边，蘑菇自带鲜味。', '配烤蔬菜和杂粮饭。',
    [['老豆腐', '750 g'], ['口蘑', '300 g'], ['葱', '2 根'], ['蒜', '2 瓣'], ['低钠生抽', '25 mL'], ['食用油', '10 mL']],
    [
      '老豆腐擦干切厚片，口蘑切片，葱蒜切碎。',
      '平底锅刷薄油，豆腐分批煎到两面金黄后盛起。用剩下的油炒蒜末和蘑菇，等蘑菇水分收掉。',
      '豆腐回锅，加生抽和两小勺水翻匀，撒上葱花。'
    ], 'The Woks of Life · 煎豆腐', 'https://thewoksoflife.com/pan-fried-tofu/'),

  entry('tomato-egg-edamame', '番茄毛豆炒蛋', 20, '番茄炒出汁，毛豆加点嚼劲，家常口味。', '配糙米，想加一份菜可以搭烤西葫芦。',
    [['鸡蛋', '8 枚'], ['番茄', '约 650 g'], ['冷冻毛豆仁', '300 g'], ['葱', '1 根'], ['食用油', '10 mL'], ['盐', '少许']],
    [
      '毛豆仁按包装说明煮熟沥干。番茄切瓣，鸡蛋打散。',
      '锅中放一半油，把鸡蛋炒至刚凝固后盛起。放剩下的油煸葱白，加番茄炒出汁。',
      '加毛豆和鸡蛋一起翻熟，鸡蛋熟透后加一点盐和葱花。'
    ], 'The Woks of Life · 番茄炒蛋', 'https://thewoksoflife.com/stir-fried-tomato-and-egg/')
]

},"lib/ui":function(require,module,exports){
const dates = require('./dates')
const journal = require('./journal')

const storageLabels = { chilled: '冷藏', frozen: '冷冻' }
const dishCategories = [
  { id: 'main', label: '主菜' }, { id: 'side', label: '配菜' },
  { id: 'staple', label: '主食' }, { id: 'one-pot', label: '一锅餐' }
]
const shoppingLabels = { todo: '待购买', 'at-home': '家里有', bought: '已买' }

function formatMoney(cents) {
  return (cents / 100).toFixed(2)
}

function message(title) {
  wx.showToast({ title, icon: 'none', duration: 2300 })
}

function report(error) {
  message(error instanceof Error ? error.message : '这次操作未完成，请重试')
}

function attempt(work) {
  try {
    return work()
  } catch (error) {
    report(error)
    return undefined
  }
}

async function submit(page, work) {
  if (page.data.saving) return
  page.setData({ saving: true })
  try {
    await work()
  } catch (error) {
    report(error)
  } finally {
    page.setData({ saving: false })
  }
}

function confirm(title, content, confirmText = '确认') {
  return new Promise(resolve => wx.showModal({
    title, content, confirmText, confirmColor: '#a33e2e',
    success: result => resolve(result.confirm),
    fail: () => resolve(false)
  }))
}

function choosePhoto() {
  return new Promise((resolve, reject) => wx.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sourceType: ['album', 'camera'],
    sizeType: ['compressed'],
    success: result => resolve(result.tempFiles[0] ? result.tempFiles[0].tempFilePath : ''),
    fail: error => {
      if (/cancel/i.test(error.errMsg || '')) resolve('')
      else reject(new Error('读取照片失败，请确认相机或相册权限'))
    }
  }))
}

async function saveWithPhoto(photo, save) {
  const root = wx.env.USER_DATA_PATH + '/meal-'
  if (!photo || photo.startsWith(root) || photo.startsWith('/assets/')) return save(photo || '')

  const fs = wx.getFileSystemManager()
  const extension = photo.match(/\.(jpe?g|png|webp|heic|heif)$/i)
  const path = root + Date.now() + '-' + Math.random().toString(36).slice(2, 9) +
    (extension ? extension[0] : '.jpg')
  await new Promise((resolve, reject) => fs.copyFile({
    srcPath: photo,
    destPath: path,
    success: resolve,
    fail: () => reject(new Error('照片保存失败，请重新选图或检查存储空间'))
  }))
  try {
    return save(path)
  } catch (error) {
    fs.unlink({ filePath: path, fail() {} })
    throw error
  }
}

function releasePhoto(photo) {
  if (!photo || !photo.startsWith(wx.env.USER_DATA_PATH + '/meal-')) return
  try {
    const { recipes, weeks } = journal.read()
    const used = recipes.some(recipe => recipe.photo === photo) || Object.values(weeks).some(week =>
      week.menu.some(dish => dish.photo === photo) ||
      (week.batch && week.batch.photo === photo) ||
      week.expenses.some(entry => entry.photo === photo) ||
      week.notes.some(entry => entry.photo === photo)
    )
    if (!used) wx.getFileSystemManager().unlink({ filePath: photo, fail() {} })
  } catch (error) {
    // A cleanup failure should not fail a record that was already saved.
  }
}

function cancelCollection(id) {
  const result = journal.uncollectRecommendation(id)
  if (!result) return null
  if (!result.kept) releasePhoto(result.recipe.photo)
  message(result.kept ? '已取消收藏，保留修改版' : '已取消收藏')
  return result
}

const recipeManagement = {
  openRecipeManagement(event) {
    const { id } = event.currentTarget.dataset
    const recipe = journal.read().recipes.find(item => item.id === id)
    if (!recipe) return message('找不到这份菜谱')
    this.setData({ managedRecipe: recipe })
  },

  closeRecipeManagement() {
    if (!this.data.saving) this.setData({ managedRecipe: null })
  },

  manageRecipe(event) {
    const { action } = event.currentTarget.dataset
    const { managedRecipe: recipe } = this.data
    if (!recipe || this.data.saving) return
    if (action === 'edit') {
      this.closeRecipeManagement()
      wx.navigateTo({ url: '/pages/recipe/edit?id=' + recipe.id })
      return
    }
    return submit(this, async () => {
      let removed = false
      if (action === 'delete') {
        if (!await confirm('删除「' + recipe.title + '」？', '已排的周菜单和历史记录会保留。', '删除')) return
        const deleted = journal.deleteRecipe(recipe.id)
        releasePhoto(deleted.photo)
        message('已删除菜谱')
        removed = true
      } else if (action === 'uncollect') {
        removed = Boolean(recipe.recommendationId && cancelCollection(recipe.recommendationId)?.kept === false)
      }
      this.setData({ managedRecipe: null })
      if (removed && this.recipeId === recipe.id) wx.navigateBack()
      else this.onShow()
    })
  }
}

function previewPhoto(event) {
  const photo = event.currentTarget.dataset.photo
  if (photo) wx.previewImage({ current: photo, urls: [photo] })
}

function activeWeek() {
  const selected = getApp().globalData.activeWeek
  if (selected) return selected
  const today = dates.dayKey()
  const thisWeek = dates.monday(today)
  const current = journal.week(thisWeek)
  const weekend = ['周六', '周日'].includes(dates.weekday(today))
  return !weekend && (current.menu.length || current.batch) ? thisWeek : dates.nextMonday()
}

function openPrep(start) {
  if (start) getApp().globalData.activeWeek = start
  wx.switchTab({ url: '/pages/prep/index' })
}

function openRecipes(start) {
  if (start) getApp().globalData.activeWeek = start
  wx.switchTab({ url: '/pages/recipes/index' })
}

function weekView(current) {
  return {
    ...current,
    menu: current.menu.map(dish => ({
      ...dish, categoryLabel: dishCategories.find(type => type.id === dish.category)?.label || ''
    })),
    label: dates.weekLabel(current.start),
    slotSummary: current.slots.map(slot => dates.weekday(slot.date) + dates.mealLabels[slot.meal]).join('、'),
    spent: formatMoney(journal.totalSpent(current)),
    stock: journal.stockFor(current)
  }
}

function datedEntry(entry) {
  const key = dates.dayKey(new Date(entry.createdAt))
  return {
    ...entry,
    day: dates.shortDate(key),
    time: dates.timeLabel(entry.createdAt)
  }
}

function nutritionParts(batch) {
  if (!batch) return []
  return [
    { key: 'weight', label: '重量', value: batch.weight, unit: 'g' },
    { key: 'calories', label: '热量', value: batch.calories, unit: 'kcal' },
    { key: 'protein', label: '蛋白质', value: batch.protein, unit: 'g' }
  ].filter(part => part.value !== null && part.value !== undefined)
}

module.exports = {
  activeWeek, attempt, cancelCollection, choosePhoto, confirm, datedEntry, dishCategories, formatMoney, message,
  nutritionParts, openPrep, openRecipes, previewPhoto, recipeManagement, releasePhoto, report, saveWithPhoto,
  shoppingLabels, storageLabels, submit, weekView
}

},"pages/prep/index":function(require,module,exports){
const dates = require('../../lib/dates')
const journal = require('../../lib/journal')
const ui = require('../../lib/ui')

Page({
  data: { current: null, busy: false },

  onShow() {
    this.refresh(ui.activeWeek())
  },

  refresh(start) {
    getApp().globalData.activeWeek = start
    const state = journal.read()
    const current = ui.weekView(journal.week(start, state))
    const thisWeek = dates.monday()
    const nextWeek = dates.nextMonday()
    const timeline = Array.from({ length: 5 }, (_, index) => {
      const weekStart = dates.addDays(start, (index - 2) * 7)
      const recorded = state.weeks[weekStart]
      return {
        start: weekStart,
        label: dates.shortDate(weekStart),
        range: dates.weekLabel(weekStart),
        relative: weekStart === thisWeek ? '本周' : weekStart === nextWeek ? '下周' : '',
        hasRecords: Boolean(recorded && (recorded.menu.length || recorded.batch || recorded.expenses.length || recorded.notes.length))
      }
    })
    const nextAction = !current.menu.length ? ''
      : current.batch ? ''
        : current.shopping.some(item => item.status === 'todo') ? 'shop'
          : current.cooked.length < current.menu.length ? 'cook' : 'batch'
    this.setData({
      start, current, timeline, nextAction,
      cover: current.batch?.photo || '/assets/welcome.jpg'
    })
  },

  selectWeek(event) {
    this.refresh(event.currentTarget.dataset.start)
  },

  moveWeek(event) {
    this.refresh(dates.addDays(this.data.start, Number(event.currentTarget.dataset.step) * 7))
  },

  jumpToDate(event) {
    const date = event.detail.value
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && dates.addDays(date, 0) === date) {
      this.refresh(dates.monday(date))
    }
  },

  chooseRecipe() {
    ui.openRecipes(this.data.start)
  },

  editPlan() {
    wx.navigateTo({ url: '/pages/schedule/index?edit=' + this.data.start })
  },

  openDish(event) {
    const { id } = event.currentTarget.dataset
    wx.navigateTo({ url: '/pages/recipe/index?week=' + this.data.start + '&id=' + id })
  },

  openRecords(event) {
    const mode = event.currentTarget.dataset.mode
    wx.navigateTo({ url: '/pages/records/index?mode=' + mode + '&week=' + this.data.start })
  },

  previewPhoto: ui.previewPhoto,

  eat() {
    if (this.data.busy) return
    const { start, current } = this.data
    const places = Object.keys(ui.storageLabels).filter(place => current.stock[place] > 0)
    if (!places.length) return
    const record = place => {
      ui.attempt(() => journal.eat(start, place))
      this.refresh(start)
    }
    if (places.length === 1) {
      record(places[0])
      return
    }
    this.setData({ busy: true })
    wx.showActionSheet({
      alertText: '这盒从哪取的？',
      itemList: places.map(place => ui.storageLabels[place]),
      success: result => record(places[result.tapIndex]),
      complete: () => this.setData({ busy: false })
    })
  },

  undo() {
    ui.attempt(() => journal.undoEat(this.data.start))
    this.refresh(this.data.start)
  }
})

},"pages/recipe/edit":function(require,module,exports){
const journal = require('../../lib/journal')
const ui = require('../../lib/ui')

Page({
  data: { title: '', photo: '', ingredients: '', method: '', servings: '', category: '', categories: ui.dishCategories, saving: false },

  onLoad(options) {
    this.recipeId = options.id
    if (!this.recipeId) return
    const recipe = journal.read().recipes.find(item => item.id === this.recipeId)
    if (!recipe) {
      ui.message('找不到这份菜谱')
      wx.navigateBack()
      return
    }
    wx.setNavigationBarTitle({ title: '编辑菜谱' })
    this.setData({
      title: recipe.title,
      photo: recipe.photo,
      ingredients: journal.ingredientsToText(recipe.ingredients),
      method: recipe.method, servings: recipe.servings ? String(recipe.servings) : '', category: recipe.category || ''
    })
  },

  input(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [field]: event.detail.value })
  },

  selectCategory(event) {
    const { id } = event.currentTarget.dataset
    this.setData({ category: this.data.category === id ? '' : id })
  },

  async pickPhoto() {
    if (this.data.saving) return
    try {
      const photo = await ui.choosePhoto()
      if (photo) this.setData({ photo })
    } catch (error) {
      ui.report(error)
    }
  },

  removePhoto() {
    if (!this.data.saving) this.setData({ photo: '' })
  },

  previewPhoto: ui.previewPhoto,

  save() {
    return ui.submit(this, async () => {
      const data = this.data
      if (!data.title.trim()) throw new Error('先写一个菜名')
      const previous = this.recipeId && journal.read().recipes.find(item => item.id === this.recipeId)
      const recipe = await ui.saveWithPhoto(data.photo, photo => journal.saveRecipe({
        id: this.recipeId, title: data.title, ingredients: data.ingredients, method: data.method, category: data.category, servings: data.servings, photo
      }))
      if (previous && previous.photo !== recipe.photo) ui.releasePhoto(previous.photo)
      if (this.recipeId) wx.navigateBack()
      else {
        const pages = getCurrentPages()
        const library = pages[pages.length - 2]
        const target = library?.route === 'pages/recipes/index' ? library.data.target : ''
        if (target) library.setData({ tab: 'mine', query: '', category: '' })
        wx.redirectTo({ url: '/pages/recipe/index?id=' + recipe.id + (target ? '&target=' + target : '') })
      }
    })
  }
})

},"pages/recipe/index":function(require,module,exports){
const journal = require('../../lib/journal')
const recommendations = require('../../lib/recommendations')
const photoCredits = require('../../lib/photo-credits')
const ui = require('../../lib/ui')

Page({
  ...ui.recipeManagement,
  data: {
    recipe: null, ready: false, isSnapshot: false, isRecommendation: false,
    collected: false, photoCredit: null, target: '', managedRecipe: null, saving: false
  },

  onLoad(options) {
    this.recipeId = options.id
    this.weekStart = options.week
    const target = options.target || ui.activeWeek()
    this.setData({ isSnapshot: Boolean(options.week), target })
  },

  onShow() {
    const state = journal.read()
    const recipe = this.weekStart
      ? journal.week(this.weekStart, state).menu.find(dish => dish.id === this.recipeId)
      : journal.findRecipe(this.recipeId, state)
    const isRecommendation = !this.weekStart && recommendations.some(item => item.id === this.recipeId)
    const collected = isRecommendation && state.recipes.some(item => item.recommendationId === this.recipeId)
    const photoCredit = recipe ? photoCredits[recipe.photo] || null : null
    const plan = journal.week(this.data.target, state)
    this.setData({
      recipe: recipe || null, ready: true, isRecommendation, collected, photoCredit,
      selected: plan.menu.some(dish => dish.id === this.recipeId), locked: Boolean(plan.batch)
    })
  },

  schedule() {
    ui.attempt(() => {
      journal.addDish(this.data.target, this.data.recipe)
      this.setData({ selected: true })
      ui.message('已加入周菜单')
    })
  },

  collect() {
    if (!this.data.isRecommendation) return
    ui.attempt(() => {
      if (this.data.collected) ui.cancelCollection(this.recipeId)
      else {
        journal.collectRecommendation(this.recipeId)
        ui.message('已加入我的菜谱')
      }
      this.onShow()
    })
  },

  copySource(event) {
    const source = event.currentTarget.dataset.kind === 'photo' ? this.data.photoCredit : this.data.recipe.source
    if (!source) return
    wx.setClipboardData({
      data: source.url,
      showToast: false,
      success: () => ui.message('已复制参考网址'),
      fail: () => ui.message('暂时无法复制网址')
    })
  },

  previewPhoto: ui.previewPhoto
})

},"pages/recipes/index":function(require,module,exports){
const dates = require('../../lib/dates')
const journal = require('../../lib/journal')
const recommendations = require('../../lib/recommendations')
const ui = require('../../lib/ui')

Page({
  ...ui.recipeManagement,
  data: {
    recipes: [], query: '', category: '', tab: '', managedRecipe: null, saving: false,
    categories: [{ id: '', label: '全部' }, ...ui.dishCategories]
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const target = ui.activeWeek()
    const state = journal.read()
    const plan = journal.week(target, state)
    const { query, category } = this.data
    const tab = this.data.tab || (state.recipes.length ? 'mine' : 'recommended')
    const library = tab === 'mine' ? state.recipes : recommendations
    const needle = query.trim().toLowerCase()
    const selected = new Set(plan.menu.map(item => item.id))
    const recipes = library.filter(recipe =>
      (!category || recipe.category === category) &&
      [recipe.title, ...recipe.ingredients.map(item => item.name)].some(value => value.toLowerCase().includes(needle))
    ).map(recipe => ({
      ...recipe, selected: selected.has(recipe.id),
      categoryLabel: ui.dishCategories.find(type => type.id === recipe.category)?.label || ''
    }))
    this.setData({
      tab, target, recipes, selectedCount: plan.menu.length, locked: Boolean(plan.batch),
      targetLabel: target === dates.monday() ? '本周' : target === dates.nextMonday() ? '下周' : dates.weekLabel(target)
    })
  },

  search(event) {
    this.setData({ query: event.detail.value })
    this.refresh()
  },

  changeTab(event) {
    this.setData({ tab: event.currentTarget.dataset.tab })
    this.refresh()
  },

  changeCategory(event) {
    this.setData({ category: event.currentTarget.dataset.id })
    this.refresh()
  },

  addRecipe() {
    wx.navigateTo({ url: '/pages/recipe/edit' })
  },

  openRecipe(event) {
    const { id } = event.currentTarget.dataset
    wx.navigateTo({ url: '/pages/recipe/index?id=' + id + '&target=' + this.data.target })
  },

  toggleDish(event) {
    const { id } = event.currentTarget.dataset
    const { target } = this.data
    const selected = journal.week(target).menu.some(dish => dish.id === id)
    ui.attempt(() => {
      if (selected) journal.removeDish(target, id)
      else journal.addDish(target, journal.findRecipe(id))
      this.refresh()
    })
  },

  openPlan() {
    ui.openPrep(this.data.target)
  }
})

},"pages/records/index":function(require,module,exports){
const journal = require('../../lib/journal')
const ui = require('../../lib/ui')

const titles = { shop: '采购', cook: '烹饪', batch: '分装' }
const entryTypes = { expense: 'expenses', note: 'notes' }
const storageFields = [
  { field: 'count', label: '实际盒数' },
  { field: 'chilled', label: '冷藏' },
  { field: 'frozen', label: '冷冻' }
]

function batchFromWeek(current) {
  const batch = current.batch || {
    count: current.targetBoxes, chilled: 0, frozen: 0, photo: ''
  }
  return {
    ...batch,
    weight: batch.weight == null ? '' : String(batch.weight),
    calories: batch.calories == null ? '' : String(batch.calories),
    protein: batch.protein == null ? '' : String(batch.protein)
  }
}

Page({
  data: {
    current: null, mode: '', editor: '', form: {}, saving: false, nutritionOpen: false,
    batch: {}, difference: 0, storageFields, expandedIngredient: '', dish: null, steps: [], stepIndex: 0
  },

  onLoad(options) {
    this.start = options.week || ui.activeWeek()
    this.stepByDish = new Map()
    const mode = titles[options.mode] ? options.mode : 'shop'
    wx.setNavigationBarTitle({ title: titles[mode] })
    this.setData({ mode })
    this.refresh()
    if (mode === 'batch') {
      const batch = batchFromWeek(this.data.current)
      this.setBatch(batch)
      this.setData({ nutritionOpen: ui.nutritionParts(this.data.current.batch).length > 0 })
    }
  },

  refresh() {
    const current = ui.weekView(journal.week(this.start))
    const shopping = current.shopping.map(item => ({
      ...item, uses: item.uses || [], statusLabel: ui.shoppingLabels[item.status],
      detail: item.removed ? '已从菜单移除'
        : item.uses?.length > 1 ? '用于 ' + item.uses.length + ' 道菜'
          : item.uses?.[0]?.title || ''
    }))
    const todo = shopping.filter(item => item.status === 'todo')
    const processed = shopping.filter(item => item.status !== 'todo')
    this.setData({
      current,
      shoppingSections: [{ label: '待买', rows: todo }, { label: '已处理', rows: processed }],
      shoppingTotal: shopping.length, processedCount: processed.length,
      expenses: current.expenses.slice().reverse().map(item => ({
        ...ui.datedEntry(item), amount: ui.formatMoney(item.cents)
      })),
      notes: current.notes.map(ui.datedEntry)
    })
    if (this.data.mode === 'cook') {
      const dish = current.menu.find(item => item.id === this.data.dish?.id)
        || current.menu.find(item => !current.cooked.includes(item.id)) || current.menu[0]
      this.showDish(dish)
    }
  },

  showDish(dish) {
    const steps = (dish?.method || '').split(/\n+/).map(step => step.trim().replace(/^\d+[.、)）]\s*/, '')).filter(Boolean)
    this.setData({
      dish: dish || null, steps, stepIndex: this.stepByDish.get(dish?.id) || 0,
      dishDone: this.data.current.cooked.includes(dish?.id),
      cookMenu: this.data.current.menu.map(item => ({ ...item, done: this.data.current.cooked.includes(item.id) }))
    })
  },

  switchDish(event) {
    if (this.data.editor) return
    this.showDish(this.data.current.menu.find(item => item.id === event.currentTarget.dataset.id))
  },

  moveStep(event) {
    const { dish, stepIndex, steps } = this.data
    const next = stepIndex + Number(event.currentTarget.dataset.step)
    if (!dish || next < 0 || next >= steps.length) return
    this.stepByDish.set(dish.id, next)
    this.setData({ stepIndex: next })
  },

  toggleCookDone() {
    const { dish, dishDone } = this.data
    if (!dish) return
    ui.attempt(() => journal.setCookDone(this.start, dish.id, !dishDone))
    this.refresh()
  },

  toggleIngredient(event) {
    const { id } = event.currentTarget.dataset
    this.setData({ expandedIngredient: this.data.expandedIngredient === id ? '' : id })
  },

  setEditor(editor, form) {
    this.setData({ editor, form })
    wx.pageScrollTo({ scrollTop: 0, duration: 160 })
  },

  addShopping() {
    this.setEditor('shopping', { name: '', amount: '' })
  },

  addExpense() {
    this.setEditor('expense', { id: '', amount: '', shop: '', photo: '' })
  },

  addNote(event) {
    const dish = event?.currentTarget.dataset.scope === 'dish' ? this.data.dish : null
    this.setEditor('note', { id: '', text: '', photo: '', dishId: dish?.id || '', dishTitle: dish?.title || '' })
  },

  editEntry(event) {
    if (this.data.editor || this.data.saving) return
    const { id, kind } = event.currentTarget.dataset
    const entry = this.data[entryTypes[kind]].find(item => item.id === id)
    if (!entry) return
    const form = kind === 'expense'
      ? { id, amount: entry.amount, shop: entry.shop, photo: entry.photo }
      : { id, text: entry.text, photo: entry.photo, dishId: entry.dishId || '', dishTitle: entry.dishTitle || '' }
    this.setEditor(kind, form)
  },

  cancelEdit() {
    if (!this.data.saving) this.setData({ editor: '', form: {} })
  },

  fieldInput(event) {
    const { model, field } = event.currentTarget.dataset
    this.setData({ [model + '.' + field]: event.detail.value })
  },

  async pickPhoto(event) {
    if (this.data.saving) return
    const { model } = event.currentTarget.dataset
    try {
      const photo = await ui.choosePhoto()
      if (photo) this.setData({ [model + '.photo']: photo })
    } catch (error) {
      ui.report(error)
    }
  },

  clearPhoto(event) {
    if (!this.data.saving) this.setData({ [event.currentTarget.dataset.model + '.photo']: '' })
  },

  previewPhoto: ui.previewPhoto,

  changeShoppingStatus(event) {
    const { id } = event.currentTarget.dataset
    const keys = ['bought', 'at-home', 'todo']
    wx.showActionSheet({
      itemList: keys.map(key => ui.shoppingLabels[key]),
      success: result => {
        ui.attempt(() => journal.setShoppingStatus(this.start, id, keys[result.tapIndex]))
        this.refresh()
      }
    })
  },

  saveEntry() {
    return ui.submit(this, async () => {
      const { editor, form } = this.data
      if (editor === 'shopping') {
        journal.addShopping(this.start, form.name, form.amount)
      } else {
        if (editor === 'expense') journal.expenseCents(form.amount)
        const type = entryTypes[editor]
        const previous = this.data.current[type].find(entry => entry.id === form.id)
        await ui.saveWithPhoto(form.photo, photo => journal.saveEntry(this.start, type, { ...form, photo }))
        if (previous && previous.photo !== form.photo) ui.releasePhoto(previous.photo)
      }
      this.setData({ editor: '', form: {} })
      this.refresh()
      ui.message('已保存')
    })
  },

  deleteEntry() {
    return ui.submit(this, async () => {
      const { editor, form } = this.data
      if (!await ui.confirm('删除这条记录？', '删除后会同步更新本周记录。', '删除')) return
      const type = entryTypes[editor]
      const previous = this.data.current[type].find(entry => entry.id === form.id)
      journal.removeEntry(this.start, type, form.id)
      if (previous) ui.releasePhoto(previous.photo)
      this.setData({ editor: '', form: {} })
      this.refresh()
    })
  },

  setBatch(batch) {
    this.setData({ batch, difference: batch.count - batch.chilled - batch.frozen })
  },

  step(event) {
    if (this.data.saving) return
    const { field, step } = event.currentTarget.dataset
    const batch = { ...this.data.batch }
    batch[field] = Math.min(99, Math.max(0, batch[field] + Number(step)))
    this.setBatch(batch)
  },

  toggleNutrition() {
    this.setData({ nutritionOpen: !this.data.nutritionOpen })
  },

  saveBatch() {
    return ui.submit(this, async () => {
      const { batch, current } = this.data
      await ui.saveWithPhoto(batch.photo, photo => journal.saveBatch(this.start, { ...batch, photo }))
      if (current.batch && current.batch.photo !== batch.photo) ui.releasePhoto(current.batch.photo)
      wx.navigateBack()
    })
  }
})

},"pages/review/index":function(require,module,exports){
const dates = require('../../lib/dates')
const journal = require('../../lib/journal')
const ui = require('../../lib/ui')

Page({
  data: { weeks: [], saving: false },

  onShow() {
    const { weeks } = journal.read()
    this.setData({
      weeks: Object.values(weeks)
        .filter(week => week.batch || week.expenses.length || week.notes.length || (week.menu.length && week.start < dates.monday()))
        .sort((first, second) => second.start.localeCompare(first.start))
        .map(week => ({
          ...ui.weekView(week),
          menuText: week.menu.map(dish => dish.title).join(' · '),
          notes: week.notes.map(ui.datedEntry),
          nutrition: ui.nutritionParts(week.batch)
        }))
    })
  },

  previewPhoto: ui.previewPhoto,

  openPrep(event) {
    ui.openPrep(event.currentTarget.dataset.start)
  },

  repeat(event) {
    return ui.submit(this, async () => {
      const from = event.currentTarget.dataset.start
      const to = [dates.nextMonday(), dates.addDays(from, 7)].sort().pop()
      const current = journal.week(to)
      if (current.batch) throw new Error('目标周已经分装')
      if (current.menu.length) {
        const summary = current.menu.map(dish => dish.title).join('、')
        if (!await ui.confirm('复做到 ' + dates.weekLabel(to) + '？', '将替换这周的菜单「' + summary + '」。采购和过程记录会保留。', '复做')) return
      }
      journal.copyPlan(from, to)
      ui.openPrep(to)
    })
  }
})

},"pages/schedule/index":function(require,module,exports){
const dates = require('../../lib/dates')
const journal = require('../../lib/journal')
const ui = require('../../lib/ui')

Page({
  data: { current: null, rows: [], saving: false, datesOpen: false, name: '' },

  onLoad(options) {
    const start = options.edit || options.target || ui.activeWeek()
    const current = ui.weekView(journal.week(start))
    this.setData({
      start, current, targetBoxes: String(current.targetBoxes), datesOpen: Boolean(current.slots.length)
    })
    this.renderSlots(current.slots)
  },

  refresh() {
    this.setData({ current: ui.weekView(journal.week(this.data.start)) })
  },

  renderSlots(slots) {
    const { start } = this.data
    this.slots = slots
    const selected = new Set(slots.map(slot => dates.slotKey(slot.date, slot.meal)))
    this.setData({
      rows: Array.from({ length: 7 }, (_, offset) => {
        const date = dates.addDays(start, offset)
        return {
          date, label: dates.weekday(date), short: dates.shortDate(date),
          lunch: selected.has(dates.slotKey(date, 'lunch')),
          dinner: selected.has(dates.slotKey(date, 'dinner'))
        }
      }),
      dateCount: slots.length
    })
  },

  boxInput(event) {
    this.setData({ targetBoxes: event.detail.value })
  },

  dishInput(event) {
    this.setData({ name: event.detail.value })
  },

  addQuickDish() {
    ui.attempt(() => {
      journal.addDish(this.data.start, { title: this.data.name })
      this.setData({ name: '' })
      this.refresh()
    })
  },

  removeDish(event) {
    ui.attempt(() => journal.removeDish(this.data.start, event.currentTarget.dataset.id))
    this.refresh()
  },

  toggleDates() {
    this.setData({ datesOpen: !this.data.datesOpen })
  },

  toggleMeal(event) {
    const { date, meal } = event.currentTarget.dataset
    const exists = this.slots.some(slot => slot.date === date && slot.meal === meal)
    this.renderSlots(exists ? this.slots.filter(slot => slot.date !== date || slot.meal !== meal)
      : [...this.slots, { date, meal }])
  },

  choose() {
    ui.attempt(() => {
      journal.setPlan(this.data.start, this.data.targetBoxes, this.slots)
      ui.openRecipes(this.data.start)
    })
  },

  save() {
    return ui.submit(this, async () => {
      journal.setPlan(this.data.start, this.data.targetBoxes, this.slots)
      ui.openPrep(this.data.start)
    })
  }
})

},"pages/today/index":function(require,module,exports){
const ui = require('../../lib/ui')

Page({
  onShow() {
    ui.openPrep()
  }
})

}},templates:{"pages/prep/index":["root",{},"","",[["view",{"wx:if":function($){with($){return (current)}},"class":"screen stack prep-screen"},"\n  ","\n",[["view",{"class":"row between"},"\n    ","\n  ",[["text",{"class":"heading"},"备餐","\n    ",[]],["picker",{"mode":"date","value":function($){with($){return (start)}},"bindchange":"jumpToDate","class":"date-jump","aria-label":"跳到日期"},"\n      ","\n  ",[["text",{"class":"label accent"},"跳到日期","\n    ",[]]]]]],["view",{"class":"week-timeline","aria-label":"备餐周时间轴"},"\n    ","\n  ",[["button",{"class":"timeline-arrow","data-step":"-1","bindtap":"moveWeek","aria-label":"上一周"},"","\n    ",[["text",{"class":"chevron chevron-left"},"","",[]]]],["button",{"wx:for":function($){with($){return (timeline)}},"wx:key":"start","class":function($){with($){return ("timeline-week " + String((item.start === start ? 'timeline-selected' : '') ?? '') + "")}},"data-start":function($){with($){return (item.start)}},"bindtap":"selectWeek","aria-pressed":function($){with($){return (item.start === start)}},"aria-label":function($){with($){return (item.range)}}},"\n      ","\n    ",[["text",{},function($){with($){return (item.label)}},"\n      ",[]],["text",{"wx:if":function($){with($){return (item.relative)}},"class":"timeline-relative"},function($){with($){return (item.relative)}},"\n      ",[]],["view",{"wx:elif":function($){with($){return (item.hasRecords)}},"class":"timeline-dot"},"","\n    ",[]]]],["button",{"class":"timeline-arrow","data-step":"1","bindtap":"moveWeek","aria-label":"下一周"},"","\n  ",[["text",{"class":"chevron"},"","",[]]]]]],["view",{"class":"row between"},"\n    ","\n  ",[["text",{"class":"title week-range"},function($){with($){return (current.label)}},"\n    ",[]],["button",{"class":"week-chip week-chip-active","bindtap":"editPlan","disabled":function($){with($){return (current.batch)}}},function($){with($){return ("计划 " + String((current.targetBoxes) ?? '') + " 盒")}},"\n  ",[]]]],["view",{"class":"relative meal-hero"},"\n    ","\n  ",[["image",{"class":"cover","mode":"aspectFill","src":function($){with($){return (cover)}},"aria-label":"查看餐盒照片","data-photo":function($){with($){return (cover)}},"bindtap":"previewPhoto"},"","\n    ",[]],["text",{"wx:if":function($){with($){return (!(current.batch && current.batch.photo))}},"class":"caption"},"餐盒参考图","\n  ",[]]]],["text",{"class":"section-title"},"周菜单","\n  ",[]],["view",{"wx:if":function($){with($){return (current.menu.length)}}},"\n    ","\n  ",[["view",{"wx:for":function($){with($){return (current.menu)}},"wx:key":"id","class":"menu-row row between","bindtap":"openDish","data-id":function($){with($){return (item.id)}},"hover-class":"tap-hover"},"\n      ","\n  ",[["text",{"class":"label grow"},function($){with($){return (item.title)}},"\n      ",[]],["text",{"wx:if":function($){with($){return (item.categoryLabel)}},"class":"small muted"},function($){with($){return (item.categoryLabel)}},"\n      ",[]],["text",{"class":"chevron"},"","\n    ",[]]]]]],["view",{"wx:else":"","class":"stack compact"},"\n    ","\n  ",[["text",{"class":"body muted"},"选几道菜，搭成这周的餐盒。","\n    ",[]],["button",{"class":"button button-primary","bindtap":"chooseRecipe"},"从菜谱选菜","\n  ",[]]]],["view",{"wx:if":function($){with($){return (current.menu.length && !current.batch)}},"class":"stack compact"},"\n    ","\n  ",[["button",{"wx:if":function($){with($){return (nextAction === 'shop')}},"class":"button button-primary","data-mode":"shop","bindtap":"openRecords"},"去采购清单 →","\n    ",[]],["button",{"wx:elif":function($){with($){return (nextAction === 'cook')}},"class":"button button-primary","data-mode":"cook","bindtap":"openRecords"},"去烹饪 →","\n    ",[]],["button",{"wx:else":"","class":"button button-primary","data-mode":"batch","bindtap":"openRecords"},"去分装 →","\n  ",[]]]],["view",{"wx:if":function($){with($){return (current.batch)}},"class":"stack compact stock-panel"},"\n    ","\n  ",[["view",{"class":"row between"},"\n      ","\n    ",[["text",{"class":"section-title"},function($){with($){return ("剩 " + String((current.stock.total) ?? '') + " 盒")}},"\n      ",[]],["text",{"class":"small muted"},function($){with($){return ("冷藏 " + String((current.stock.chilled) ?? '') + " · 冷冻 " + String((current.stock.frozen) ?? '') + "")}},"\n    ",[]]]],["button",{"wx:if":function($){with($){return (current.stock.total)}},"class":"button button-primary","disabled":function($){with($){return (busy)}},"bindtap":"eat"},"记吃了一盒","\n    ",[]],["button",{"wx:if":function($){with($){return (current.eaten.length)}},"class":"text-action","bindtap":"undo"},"撤回上一次","\n  ",[]]]],["view",{"class":"prep-action-grid"},"\n    ","\n  ",[["button",{"class":"button button-outline","bindtap":"editPlan"},function($){with($){return (current.batch ? '查看菜单' : '编辑菜单')}},"\n    ",[]],["button",{"class":"button button-outline","data-mode":"cook","bindtap":"openRecords","disabled":function($){with($){return (!current.menu.length && !current.notes.length)}}},"烹饪","\n    ",[]],["button",{"class":"button button-outline","data-mode":"batch","bindtap":"openRecords","disabled":function($){with($){return (!current.menu.length)}}},"分装","\n  ",[]]]],["button",{"wx:if":function($){with($){return ((current.menu.length || current.expenses.length) && nextAction !== 'shop')}},"class":"text-action","data-mode":"shop","bindtap":"openRecords"},"采购清单","\n  ",[]],["text",{"wx:if":function($){with($){return (current.slotSummary)}},"class":"small muted"},function($){with($){return ("用餐 · " + String((current.slotSummary) ?? '') + "")}},"\n",[]]]]]],"pages/recipe/edit":["root",{},"","",[["view",{"class":"screen stack"},"\n  ","\n",[["view",{"class":"card pad stack"},"\n    ","\n  ",[["view",{"class":"field"},"\n      ","\n    ",[["text",{"class":"label"},"菜名","\n      ",[]],["input",{"class":"input","data-field":"title","bindinput":"input","value":function($){with($){return (title)}},"maxlength":"48","placeholder":"比如酱香卤鸡腿"},"","\n    ",[]]]],["view",{"class":"field"},"\n      ","\n    ",[["text",{"class":"label"},"分类","\n      ",[]],["view",{"class":"category-list"},"\n        ","\n    ",[["button",{"wx:for":function($){with($){return (categories)}},"wx:key":"id","data-id":function($){with($){return (item.id)}},"class":function($){with($){return ("category-chip " + String((category === item.id ? 'category-active' : '') ?? '') + "")}},"bindtap":"selectCategory"},function($){with($){return (item.label)}},"\n      ",[]]]]]],["view",{"class":"field"},"\n      ","\n  ",[["text",{"class":"label"},"参考图片","\n      ",[]],["block",{"wx:if":function($){with($){return (photo)}}},"\n        ","\n      ",[["image",{"class":"cover card","mode":"aspectFill","src":function($){with($){return (photo)}},"bindtap":"previewPhoto","data-photo":function($){with($){return (photo)}}},"","\n        ",[]],["view",{"class":"row"},"\n          ","\n      ",[["button",{"class":"button button-small button-quiet grow","bindtap":"pickPhoto"},"更换图片","\n          ",[]],["button",{"class":"button button-small button-outline","bindtap":"removePhoto"},"移除","\n        ",[]]]]]],["view",{"wx:else":"","class":"upload","bindtap":"pickPhoto","hover-class":"tap-hover"},"＋ 添加参考图","\n    ",[]]]]]],["view",{"class":"card pad stack"},"\n    ","\n  ",[["view",{"class":"field"},"\n      ","\n    ",[["text",{"class":"label"},"食材与用量","\n      ",[]],["input",{"class":"input","type":"number","maxlength":"2","data-field":"servings","bindinput":"input","value":function($){with($){return (servings)}},"placeholder":"这份用量做几份（选填）"},"","\n      ",[]],["textarea",{"class":"textarea textarea-short","data-field":"ingredients","bindinput":"input","value":function($){with($){return (ingredients)}},"maxlength":"1500","placeholder":"一行写一种食材，例如「鸡腿 600 g」"},"","\n    ",[]]]],["view",{"class":"field"},"\n      ","\n  ",[["text",{"class":"label"},"做法","\n      ",[]],["textarea",{"class":"textarea","data-field":"method","bindinput":"input","value":function($){with($){return (method)}},"maxlength":"6000","placeholder":"粘贴或写下步骤、用时和调味"},"","\n    ",[]]]]]],["button",{"class":"button button-primary","bindtap":"save","disabled":function($){with($){return (saving)}},"loading":function($){with($){return (saving)}},"hover-class":"tap-hover"},"保存菜谱","\n",[]]]]]],"pages/recipe/index":["root",{},"","",[["import",{"src":"../../templates/shared.wxml"},"","\n",[]],["view",{"wx:if":function($){with($){return (recipe)}},"class":"screen stack"},"\n  ","\n",[["view",{"class":"row between"},"\n    ","\n  ",[["text",{"class":"title grow"},function($){with($){return (recipe.title)}},"\n    ",[]],["button",{"wx:if":function($){with($){return (!isSnapshot && !isRecommendation)}},"class":"button button-small button-quiet","data-id":function($){with($){return (recipe.id)}},"bindtap":"openRecipeManagement"},"管理菜谱","\n  ",[]]]],["view",{"wx:if":function($){with($){return (recipe.photo)}},"class":"card relative"},"\n    ","\n  ",[["image",{"class":"cover cover-tall","mode":"aspectFill","src":function($){with($){return (recipe.photo)}},"bindtap":"previewPhoto","data-photo":function($){with($){return (recipe.photo)}}},"","\n    ",[]],["text",{"class":"caption"},function($){with($){return (photoCredit ? '实拍参考' : '参考图')}},"\n  ",[]]]],["view",{"wx:if":function($){with($){return (recipe.servings)}},"class":"card soft pad stack compact"},"\n    ","\n  ",[["view",{"class":"row"},"\n      ","\n    ",[["text",{"class":"pill"},function($){with($){return ("备餐 " + String((recipe.servings) ?? '') + " 份")}},"\n      ",[]],["text",{"wx:if":function($){with($){return (recipe.minutes)}},"class":"small muted"},function($){with($){return ("约 " + String((recipe.minutes) ?? '') + " 分钟")}},"\n    ",[]]]],["text",{"class":"body"},function($){with($){return (recipe.summary)}},"\n    ",[]],["text",{"class":"small muted"},function($){with($){return (recipe.pairing)}},"\n  ",[]]]],["view",{"wx:if":function($){with($){return (isRecommendation)}},"class":"recipe-actions"},"\n    ","\n  ",[["button",{"class":"button button-primary grow","bindtap":"schedule","disabled":function($){with($){return (selected || locked)}},"hover-class":"tap-hover"},function($){with($){return (locked ? '本周已分装' : (selected ? '已加入菜单' : '加入菜单'))}},"\n    ",[]],["button",{"class":"button button-outline","bindtap":"collect","aria-pressed":function($){with($){return (collected)}},"hover-class":"tap-hover"},function($){with($){return (collected ? '取消收藏' : '收藏菜谱')}},"\n  ",[]]]],["view",{"wx:if":function($){with($){return (recipe.ingredients.length)}},"class":"card pad stack compact"},"\n    ","\n  ",[["text",{"class":"section-title"},"食材","\n    ",[]],["view",{"wx:for":function($){with($){return (recipe.ingredients)}},"wx:key":"name","class":"row between"},"\n      ","\n  ",[["text",{"class":"body grow"},function($){with($){return (item.name)}},"\n      ",[]],["text",{"class":"small muted"},function($){with($){return (item.amount)}},"\n    ",[]]]]]],["view",{"class":"card pad stack compact"},"\n    ","\n  ",[["text",{"class":"section-title"},"做法","\n    ",[]],["text",{"wx:if":function($){with($){return (recipe.method)}},"class":"note"},function($){with($){return (recipe.method)}},"\n    ",[]],["text",{"wx:else":"","class":"muted"},"待补充","\n  ",[]]]],["view",{"wx:if":function($){with($){return (recipe.source || photoCredit)}},"class":"card"},"\n    ","\n  ",[["view",{"wx:if":function($){with($){return (recipe.source)}},"class":"action-row","bindtap":"copySource","data-kind":"recipe","hover-class":"tap-hover"},"\n      ","\n    ",[["view",{"class":"grow stack compact"},"\n        ","\n      ",[["text",{"class":"label"},"参考做法","\n        ",[]],["text",{"class":"small muted"},function($){with($){return (recipe.source.name)}},"\n      ",[]]]],["text",{"class":"small muted"},"复制网址","\n    ",[]]]],["view",{"wx:if":function($){with($){return (photoCredit)}},"class":"action-row","bindtap":"copySource","data-kind":"photo","hover-class":"tap-hover"},"\n      ","\n  ",[["view",{"class":"grow stack compact"},"\n        ","\n      ",[["text",{"class":"label"},"照片来源","\n        ",[]],["text",{"class":"small muted"},function($){with($){return (photoCredit.name)}},"\n      ",[["text",{"wx:if":function($){with($){return (photoCredit.note)}}},function($){with($){return (" · " + String((photoCredit.note) ?? '') + "")}},"",[]]]]]],["text",{"class":"small muted"},"复制网址","\n    ",[]]]]]],["button",{"wx:if":function($){with($){return (!isSnapshot && !isRecommendation)}},"class":"button button-primary","bindtap":"schedule","disabled":function($){with($){return (selected || locked)}},"hover-class":"tap-hover"},function($){with($){return (locked ? '本周已分装' : (selected ? '已加入菜单' : '加入菜单'))}},"\n",[]]]],["view",{"wx:elif":function($){with($){return (ready)}},"class":"screen"},"","\n",[["view",{"class":"card empty-text muted"},"找不到这份菜谱","",[]]]],["template",{"is":"recipe-management","data":function($){with($){return (({recipe: managedRecipe, saving: saving}))}}},"","\n",[]]]],"pages/recipes/index":["root",{},"","",[["import",{"src":"../../templates/shared.wxml"},"","\n",[]],["view",{"class":"screen stack library-screen"},"\n  ","\n",[["view",{"class":"row between"},"\n    ","\n  ",[["text",{"class":"label"},"周末备餐","\n    ",[]],["button",{"class":"button button-small add-recipe","bindtap":"addRecipe"},"＋ 新增菜谱","\n  ",[]]]],["text",{"class":"heading"},"菜谱","\n  ",[]],["view",{"class":"row recipe-tabs"},"\n    ","\n  ",[["button",{"class":function($){with($){return ("text-action " + String((tab === 'mine' ? 'recipe-tab-active' : '') ?? '') + "")}},"data-tab":"mine","aria-pressed":function($){with($){return (tab === 'mine')}},"bindtap":"changeTab"},"我的菜谱","\n    ",[]],["button",{"class":function($){with($){return ("text-action " + String((tab === 'recommended' ? 'recipe-tab-active' : '') ?? '') + "")}},"data-tab":"recommended","aria-pressed":function($){with($){return (tab === 'recommended')}},"bindtap":"changeTab"},"推荐","\n  ",[]]]],["input",{"class":"input search","type":"text","placeholder":"搜菜名或食材","value":function($){with($){return (query)}},"bindinput":"search","confirm-type":"search"},"","\n  ",[]],["view",{"class":"category-list"},"\n    ","\n  ",[["button",{"wx:for":function($){with($){return (categories)}},"wx:key":"id","class":function($){with($){return ("category-chip " + String((category === item.id ? 'category-active' : '') ?? '') + "")}},"data-id":function($){with($){return (item.id)}},"aria-pressed":function($){with($){return (category === item.id)}},"bindtap":"changeCategory"},function($){with($){return (item.label)}},"\n  ",[]]]],["view",{"wx:if":function($){with($){return (recipes.length)}},"class":"list-images"},"\n    ","\n  ",[["view",{"wx:for":function($){with($){return (recipes)}},"wx:key":"id","class":"card library-tile"},"\n      ","\n  ",[["view",{"data-id":function($){with($){return (item.id)}},"bindtap":"openRecipe","aria-label":function($){with($){return ('查看 ' + item.title)}},"hover-class":"tap-hover"},"\n        ","\n      ",[["image",{"wx:if":function($){with($){return (item.photo)}},"class":"cover library-cover","src":function($){with($){return (item.photo)}},"mode":"aspectFill"},"","\n        ",[]],["view",{"wx:else":"","class":"cover library-cover cover-empty"},"","\n      ",[["text",{"class":"small muted"},function($){with($){return (item.categoryLabel || '我的菜谱')}},"",[]]]]]],["view",{"class":"library-card"},"\n        ","\n    ",[["view",{"class":"label","data-id":function($){with($){return (item.id)}},"bindtap":"openRecipe","hover-class":"tap-hover"},function($){with($){return (item.title)}},"\n        ",[]],["view",{"class":"row tight recipe-card-actions"},"\n          ","\n      ",[["text",{"class":"small muted grow"},function($){with($){return (item.recommendationId ? '已收藏' : item.categoryLabel)}},"\n          ",[]],["button",{"class":function($){with($){return ("dish-add " + String((item.selected ? 'dish-selected' : '') ?? '') + "")}},"data-id":function($){with($){return (item.id)}},"disabled":function($){with($){return (locked)}},"bindtap":"toggleDish","aria-label":function($){with($){return ((item.selected ? '移除 ' : '加入 ') + item.title)}}},function($){with($){return (item.selected ? '✓' : '＋')}},"\n          ",[]],["button",{"wx:if":function($){with($){return (tab === 'mine')}},"class":"dish-manage","data-id":function($){with($){return (item.id)}},"bindtap":"openRecipeManagement","aria-label":function($){with($){return ('管理 ' + item.title)}}},"···","\n        ",[]]]]]]]]]],["view",{"wx:else":"","class":"empty-text muted"},function($){with($){return (tab === 'mine' && !query && !category ? '把常做的菜存进来，下次选菜更快。' : '没找到对应的菜谱')}},"\n  ",[]],["button",{"class":"button selection-bar","bindtap":"openPlan"},"\n    ","\n",[["text",{},function($){with($){return ("" + String((targetLabel) ?? '') + " · " + String((locked ? '已分装' : '已选 ' + selectedCount + ' 道') ?? '') + "")}},"",[]],["text",{},"看菜单 →","\n  ",[]]]]]],["template",{"is":"recipe-management","data":function($){with($){return (({recipe: managedRecipe, saving: saving}))}}},"","\n",[]]]],"pages/records/index":["root",{},"","",[["import",{"src":"../../templates/shared.wxml"},"","\n",[]],["view",{"wx:if":function($){with($){return (current)}},"class":"screen stack"},"\n  ","\n",[["view",{"class":"row between"},"\n    ","\n  ",[["text",{"class":"small muted"},function($){with($){return (current.label)}},"\n    ",[]],["button",{"wx:if":function($){with($){return (mode === 'shop' && !editor)}},"class":"text-action accent","bindtap":"addShopping"},"＋ 加食材","\n    ",[]],["text",{"wx:if":function($){with($){return (mode === 'cook')}},"class":"small muted"},function($){with($){return ("已完成 " + String((current.cooked.length) ?? '') + " / " + String((current.menu.length) ?? '') + " 道")}},"\n  ",[]]]],["view",{"class":"stack compact"},"\n    ","\n  ",[["text",{"class":"heading"},function($){with($){return (mode === 'shop' ? '采购' : (mode === 'cook' ? '烹饪' : '分装'))}},"\n    ",[]],["text",{"wx:if":function($){with($){return (mode === 'shop')}},"class":"small muted"},function($){with($){return ("" + String((current.menu.length) ?? '') + " 道菜合成一张清单")}},"\n    ",[]],["text",{"wx:elif":function($){with($){return (mode === 'cook' && dish)}},"class":"small muted"},function($){with($){return (dish.title)}},"\n  ",[]]]],["view",{"wx:if":function($){with($){return (editor)}},"class":"card pad stack"},"\n    ","\n\n  ",[["text",{"class":"section-title"},function($){with($){return (editor === 'shopping' ? '添加食材' : (editor === 'expense' ? '采购支出' : (form.dishTitle || '过程记录')))}},"\n    ",[]],["block",{"wx:if":function($){with($){return (editor === 'expense')}}},"\n      ","\n    ",[["view",{"class":"field"},"\n        ","\n      ",[["text",{"class":"label"},"实付金额（元）","\n        ",[]],["input",{"class":"input","type":"digit","value":function($){with($){return (form.amount)}},"data-model":"form","data-field":"amount","bindinput":"fieldInput","placeholder":"0.00"},"","\n      ",[]]]],["view",{"class":"field"},"\n        ","\n    ",[["text",{"class":"label"},"店名","\n        ",[]],["input",{"class":"input","maxlength":"48","value":function($){with($){return (form.shop)}},"data-model":"form","data-field":"shop","bindinput":"fieldInput","placeholder":"选填"},"","\n      ",[]]]]]],["block",{"wx:elif":function($){with($){return (editor === 'shopping')}}},"\n      ","\n    ",[["view",{"class":"field"},"\n        ","\n      ",[["text",{"class":"label"},"食材","\n        ",[]],["input",{"class":"input","maxlength":"48","value":function($){with($){return (form.name)}},"data-model":"form","data-field":"name","bindinput":"fieldInput","placeholder":"例如柠檬"},"","\n      ",[]]]],["view",{"class":"field"},"\n        ","\n    ",[["text",{"class":"label"},"用量","\n        ",[]],["input",{"class":"input","maxlength":"32","value":function($){with($){return (form.amount)}},"data-model":"form","data-field":"amount","bindinput":"fieldInput","placeholder":"选填"},"","\n      ",[]]]]]],["textarea",{"wx:else":"","class":"textarea textarea-short","maxlength":"1500","value":function($){with($){return (form.text)}},"data-model":"form","data-field":"text","bindinput":"fieldInput","placeholder":"写下这次做了什么，或下次想怎么调"},"","\n\n    ",[]],["block",{"wx:if":function($){with($){return (editor !== 'shopping')}}},"\n      ","\n\n    ",[["view",{"wx:if":function($){with($){return (form.photo)}},"class":"stack compact"},"\n        ","\n      ",[["image",{"class":"timeline-image","mode":"aspectFill","src":function($){with($){return (form.photo)}},"data-photo":function($){with($){return (form.photo)}},"bindtap":"previewPhoto"},"","\n        ",[]],["view",{"class":"row"},"\n          ","\n      ",[["button",{"class":"button button-small button-quiet grow","bindtap":"pickPhoto","data-model":"form"},"更换照片","\n          ",[]],["button",{"class":"button button-small button-outline","bindtap":"clearPhoto","data-model":"form"},"移除","\n        ",[]]]]]],["view",{"wx:else":"","class":"upload","bindtap":"pickPhoto","data-model":"form","hover-class":"tap-hover"},function($){with($){return (editor === 'expense' ? '＋ 添加小票照片' : '＋ 添加过程照片')}},"\n    ",[]]]],["view",{"class":"row"},"\n      ","\n    ",[["button",{"class":"button button-quiet","bindtap":"cancelEdit","disabled":function($){with($){return (saving)}}},"取消","\n      ",[]],["button",{"class":"button button-primary grow","bindtap":"saveEntry","disabled":function($){with($){return (saving)}},"loading":function($){with($){return (saving)}}},"保存","\n    ",[]]]],["button",{"wx:if":function($){with($){return (form.id)}},"class":"button button-small button-danger","bindtap":"deleteEntry","disabled":function($){with($){return (saving)}}},"删除记录","\n  ",[]]]],["block",{"wx:if":function($){with($){return (mode === 'shop')}}},"\n    ","\n\n  ",[["view",{"wx:if":function($){with($){return (shoppingTotal)}},"class":"row between purchase-progress"},"\n      ","\n    ",[["text",{"class":"small muted"},"采购进度","\n      ",[]],["text",{"class":"small accent"},function($){with($){return ("" + String((processedCount) ?? '') + " / " + String((shoppingTotal) ?? '') + " 项已处理")}},"\n    ",[]]]],["view",{"wx:for":function($){with($){return (shoppingSections)}},"wx:for-item":"section","wx:key":"label"},"\n      ","\n    ",[["text",{"wx:if":function($){with($){return (section.rows.length)}},"class":"label"},function($){with($){return (section.label)}},"\n      ",[]],["view",{"wx:for":function($){with($){return (section.rows)}},"wx:key":"id"},"\n        ","\n    ",[["view",{"class":"purchase-row row"},"\n          ","\n        ",[["button",{"class":function($){with($){return ("check-button " + String((item.status !== 'todo' ? 'check-active' : '') ?? '') + "")}},"data-id":function($){with($){return (item.id)}},"bindtap":"changeShoppingStatus","aria-label":function($){with($){return (item.name + ' · ' + item.statusLabel)}}},function($){with($){return (item.status !== 'todo' ? '✓' : '')}},"\n          ",[]],["view",{"class":"grow stack compact","data-id":function($){with($){return (item.id)}},"bindtap":"toggleIngredient"},"\n            ","\n          ",[["text",{"class":"label"},function($){with($){return (item.name)}},"\n            ",[]],["text",{"wx:if":function($){with($){return (item.status !== 'todo' || item.detail)}},"class":"small muted"},function($){with($){return (item.status !== 'todo' ? item.statusLabel : item.detail)}},"\n          ",[["text",{"wx:if":function($){with($){return (item.removed)}}},function($){with($){return (" · " + String((item.detail) ?? '') + "")}},"",[]]]]]],["text",{"wx:if":function($){with($){return (item.amount)}},"class":"label"},function($){with($){return (item.amount)}},"\n          ",[]],["button",{"wx:if":function($){with($){return (item.uses.length > 1)}},"class":"text-action accent","data-id":function($){with($){return (item.id)}},"bindtap":"toggleIngredient"},function($){with($){return (expandedIngredient === item.id ? '收起' : '展开')}},"\n        ",[]]]],["view",{"wx:if":function($){with($){return (expandedIngredient === item.id)}},"class":"ingredient-detail stack compact"},"\n          ","\n      ",[["view",{"wx:for":function($){with($){return (item.uses)}},"wx:for-item":"use","wx:key":"dishId","class":"row between"},"\n            ","\n        ",[["text",{"class":"small muted"},function($){with($){return (use.title)}},"\n            ",[]],["text",{"wx:if":function($){with($){return (use.amount)}},"class":"small"},function($){with($){return (use.amount)}},"\n          ",[]]]]]]]]]],["view",{"wx:if":function($){with($){return (!shoppingTotal)}},"class":"empty-text muted"},"菜谱里的食材会自动带入，也可以手动添加。","\n    ",[]],["text",{"class":"section-title"},"支出记录","\n    ",[]],["view",{"class":"card"},"\n      ","\n    ",[["view",{"wx:for":function($){with($){return (expenses)}},"wx:key":"id","class":"action-row","bindtap":"editEntry","data-id":function($){with($){return (item.id)}},"data-kind":"expense","hover-class":"tap-hover"},"\n        ","\n      ",[["image",{"wx:if":function($){with($){return (item.photo)}},"class":"expense-thumb","mode":"aspectFill","src":function($){with($){return (item.photo)}}},"","\n        ",[]],["view",{"class":"grow stack compact"},"\n          ","\n        ",[["text",{"class":"label"},function($){with($){return ("¥" + String((item.amount) ?? '') + "")}},"\n          ",[]],["text",{"class":"small muted"},function($){with($){return (item.day)}},"\n        ",[["text",{"wx:if":function($){with($){return (item.shop)}}},function($){with($){return (" · " + String((item.shop) ?? '') + "")}},"",[]]]]]],["text",{"class":"chevron"},"","\n      ",[]]]],["view",{"wx:if":function($){with($){return (!expenses.length)}},"class":"empty-text muted"},"结账后，记下实际花了多少。","\n    ",[]]]],["view",{"wx:if":function($){with($){return (!editor)}},"class":"purchase-footer row between"},"\n      ","\n  ",[["view",{"class":"stack compact"},"","\n      ",[["text",{"class":"small muted"},"采购支出","",[]],["text",{"class":"number"},function($){with($){return ("¥" + String((current.spent) ?? '') + "")}},"",[]]]],["button",{"class":"button button-primary","bindtap":"addExpense"},"记一笔","\n    ",[]]]]]],["block",{"wx:if":function($){with($){return (mode === 'cook')}}},"\n    ","\n\n  ",[["block",{"wx:if":function($){with($){return (dish && !editor)}}},"\n      ","\n    ",[["scroll-view",{"scroll-x":function($){with($){return (true)}},"class":"dish-tabs"},"\n        ","\n      ",[["view",{"class":"dish-tab-row"},"\n          ","\n      ",[["button",{"wx:for":function($){with($){return (cookMenu)}},"wx:key":"id","class":function($){with($){return ("cook-tab " + String((item.id === dish.id ? 'cook-tab-active' : '') ?? '') + "")}},"data-id":function($){with($){return (item.id)}},"bindtap":"switchDish"},function($){with($){return ("" + String((item.title) ?? '') + "" + String((item.done ? ' ✓' : '') ?? '') + "")}},"\n        ",[]]]]]],["image",{"wx:if":function($){with($){return (dish.photo)}},"class":"cover cook-cover","mode":"aspectFill","src":function($){with($){return (dish.photo)}},"data-photo":function($){with($){return (dish.photo)}},"bindtap":"previewPhoto"},"","\n      ",[]],["view",{"wx:if":function($){with($){return (steps.length)}},"class":"stack cook-step"},"\n        ","\n      ",[["text",{"class":"small accent"},function($){with($){return ("第 " + String((stepIndex + 1) ?? '') + " 步 / 共 " + String((steps.length) ?? '') + " 步")}},"\n        ",[]],["text",{"class":"step-text"},function($){with($){return (steps[stepIndex])}},"\n      ",[]]]],["text",{"wx:else":"","class":"body muted"},"这道菜还没有写做法，可以直接记录完成。","\n      ",[]],["view",{"class":"row between cook-tools"},"\n        ","\n      ",[["button",{"class":"text-action accent","data-scope":"dish","bindtap":"addNote"},"加照片或备注","\n        ",[]],["button",{"class":"text-action","bindtap":"addNote"},"记录整套","\n      ",[]]]],["view",{"class":"row"},"\n        ","\n      ",[["button",{"wx:if":function($){with($){return (steps.length > 1)}},"class":"button button-outline grow","data-step":"-1","bindtap":"moveStep","disabled":function($){with($){return (!stepIndex)}}},"上一步","\n        ",[]],["button",{"wx:if":function($){with($){return (steps.length > stepIndex + 1)}},"class":"button button-primary grow","data-step":"1","bindtap":"moveStep"},"下一步 →","\n        ",[]],["button",{"wx:else":"","class":"button button-primary grow","bindtap":"toggleCookDone"},function($){with($){return (dishDone ? '撤销完成' : '完成这道菜')}},"\n      ",[]]]],["button",{"wx:if":function($){with($){return (dishDone && steps.length > stepIndex + 1)}},"class":"text-action","bindtap":"toggleCookDone"},"撤销完成","\n    ",[]]]],["button",{"wx:if":function($){with($){return (!dish && !editor)}},"class":"button button-outline","bindtap":"addNote"},"记录这次烹饪","\n    ",[]],["view",{"wx:if":function($){with($){return (notes.length)}},"class":"timeline"},"\n      ","\n  ",[["view",{"wx:for":function($){with($){return (notes)}},"wx:key":"id","class":"timeline-item"},"\n        ","\n    ",[["view",{"class":"card pad stack compact"},"\n          ","\n      ",[["view",{"class":"row between"},"\n            ","\n          ",[["text",{"class":"small muted"},function($){with($){return ("" + String((item.dishTitle || '整套备餐') ?? '') + " · " + String((item.day) ?? '') + " " + String((item.time) ?? '') + "")}},"\n            ",[]],["button",{"class":"button button-small button-quiet","bindtap":"editEntry","data-id":function($){with($){return (item.id)}},"data-kind":"note"},"编辑","\n          ",[]]]],["text",{"wx:if":function($){with($){return (item.text)}},"class":"note"},function($){with($){return (item.text)}},"\n          ",[]],["image",{"wx:if":function($){with($){return (item.photo)}},"class":"timeline-image","mode":"aspectFill","src":function($){with($){return (item.photo)}},"data-photo":function($){with($){return (item.photo)}},"bindtap":"previewPhoto"},"","\n        ",[]]]]]]]]]],["block",{"wx:if":function($){with($){return (mode === 'batch' && current.menu.length)}}},"\n    ","\n",[["view",{"class":"card pad stack"},"\n      ","\n    ",[["view",{"class":"row between batch-summary"},"\n        ","\n      ",[["view",{"class":"stack compact"},"","\n        ",[["text",{"class":"small muted"},"计划","",[]],["text",{"class":"number"},function($){with($){return ("" + String((current.targetBoxes) ?? '') + " 盒")}},"",[]]]],["view",{"class":"stack compact"},"","\n      ",[["text",{"class":"small muted"},"实做","",[]],["text",{"class":"number"},function($){with($){return ("" + String((batch.count) ?? '') + " 盒")}},"",[]]]]]],["view",{"wx:for":function($){with($){return (storageFields)}},"wx:key":"field","class":"row between counter-row"},"\n        ","\n      ",[["text",{"class":"label"},function($){with($){return (item.label)}},"\n        ",[]],["template",{"is":"stepper","data":function($){with($){return (({field: item.field, label: item.label, value: batch[item.field]}))}}},"","\n      ",[]]]],["text",{"wx:if":function($){with($){return (difference > 0)}},"class":"small muted"},function($){with($){return ("还有 " + String((difference) ?? '') + " 盒待填写存放方式")}},"\n      ",[]],["text",{"wx:elif":function($){with($){return (0 > difference)}},"class":"small hint-error"},"存放盒数超过实际盒数","\n    ",[]]]],["view",{"class":"card pad stack"},"\n      ","\n    ",[["text",{"class":"section-title"},"成品照","\n      ",[]],["block",{"wx:if":function($){with($){return (batch.photo)}}},"\n        ","\n      ",[["image",{"class":"cover card","mode":"aspectFill","src":function($){with($){return (batch.photo)}},"data-photo":function($){with($){return (batch.photo)}},"bindtap":"previewPhoto"},"","\n        ",[]],["view",{"class":"row"},"\n          ","\n      ",[["button",{"class":"button button-small button-quiet grow","bindtap":"pickPhoto","data-model":"batch"},"更换照片","\n          ",[]],["button",{"class":"button button-small button-outline","bindtap":"clearPhoto","data-model":"batch"},"移除","\n        ",[]]]]]],["view",{"wx:else":"","class":"upload","bindtap":"pickPhoto","data-model":"batch","hover-class":"tap-hover"},"＋ 拍成品","\n    ",[]]]],["view",{"class":"card"},"\n      ","\n    ",[["view",{"class":"action-row","bindtap":"toggleNutrition","hover-class":"tap-hover"},"\n        ","\n      ",[["text",{"class":"grow label"},"营养选填","",[]],["text",{"class":function($){with($){return ("chevron " + String((nutritionOpen ? 'chevron-down' : '') ?? '') + "")}}},"","\n      ",[]]]],["view",{"wx:if":function($){with($){return (nutritionOpen)}},"class":"pad divider stack"},"\n        ","\n    ",[["view",{"class":"field"},"\n          ","\n        ",[["text",{"class":"label"},"每盒重量（g）","\n          ",[]],["input",{"class":"input","type":"digit","value":function($){with($){return (batch.weight)}},"data-model":"batch","data-field":"weight","bindinput":"fieldInput","placeholder":"选填"},"","\n        ",[]]]],["view",{"class":"field"},"\n          ","\n        ",[["text",{"class":"label"},"每盒热量（kcal）","\n          ",[]],["input",{"class":"input","type":"digit","value":function($){with($){return (batch.calories)}},"data-model":"batch","data-field":"calories","bindinput":"fieldInput","placeholder":"选填"},"","\n        ",[]]]],["view",{"class":"field"},"\n          ","\n      ",[["text",{"class":"label"},"每盒蛋白质（g）","\n          ",[]],["input",{"class":"input","type":"digit","value":function($){with($){return (batch.protein)}},"data-model":"batch","data-field":"protein","bindinput":"fieldInput","placeholder":"选填"},"","\n        ",[]]]]]]]],["button",{"class":"button button-primary","bindtap":"saveBatch","disabled":function($){with($){return (saving || difference !== 0 || !batch.count)}},"loading":function($){with($){return (saving)}},"hover-class":"tap-hover"},function($){with($){return ("保存 " + String((batch.count) ?? '') + " 盒")}},"\n  ",[]]]]]]]],"pages/review/index":["root",{},"","",[["view",{"class":"screen stack history-screen"},"\n  ","\n",[["text",{"class":"heading"},"历史","\n  ",[]],["view",{"wx:for":function($){with($){return (weeks)}},"wx:key":"start","class":"card history-card"},"\n    ","\n  ",[["image",{"wx:if":function($){with($){return (item.batch.photo)}},"class":"cover history-cover","mode":"aspectFill","src":function($){with($){return (item.batch.photo)}},"data-photo":function($){with($){return (item.batch.photo)}},"bindtap":"previewPhoto"},"","\n    ",[]],["view",{"class":"pad stack"},"\n      ","\n  ",[["text",{"class":"small muted"},function($){with($){return (item.label)}},"\n      ",[]],["text",{"wx:if":function($){with($){return (item.menuText)}},"class":"section-title"},function($){with($){return (item.menuText)}},"\n      ",[]],["view",{"class":"row history-stats"},"\n        ","\n      ",[["text",{"class":"label"},function($){with($){return ("实做 " + String((item.batch ? item.batch.count : 0) ?? '') + " 盒")}},"\n        ",[]],["text",{"class":"label"},function($){with($){return ("采购 ¥" + String((item.spent) ?? '') + "")}},"\n      ",[]]]],["view",{"wx:if":function($){with($){return (item.nutrition.length)}},"class":"row"},"\n        ","\n      ",[["text",{"class":"small muted"},"每盒","\n        ",[]],["text",{"wx:for":function($){with($){return (item.nutrition)}},"wx:for-item":"nutrient","wx:key":"key","class":"small"},function($){with($){return ("" + String((nutrient.value) ?? '') + " " + String((nutrient.unit) ?? '') + "")}},"\n      ",[]]]],["view",{"wx:if":function($){with($){return (item.notes.length)}},"class":"stack compact"},"\n        ","\n      ",[["view",{"wx:for":function($){with($){return (item.notes)}},"wx:for-item":"note","wx:key":"id","class":"history-note stack compact"},"\n          ","\n      ",[["text",{"class":"small muted"},function($){with($){return ("" + String((note.dishTitle || '整套备餐') ?? '') + " · " + String((note.day) ?? '') + "")}},"\n          ",[]],["text",{"wx:if":function($){with($){return (note.text)}},"class":"note"},function($){with($){return (note.text)}},"\n          ",[]],["image",{"wx:if":function($){with($){return (note.photo)}},"class":"timeline-image","mode":"aspectFill","src":function($){with($){return (note.photo)}},"data-photo":function($){with($){return (note.photo)}},"bindtap":"previewPhoto"},"","\n        ",[]]]]]],["view",{"class":"row"},"\n        ","\n    ",[["button",{"class":"button button-quiet grow","data-start":function($){with($){return (item.start)}},"bindtap":"openPrep"},"查看记录","\n        ",[]],["button",{"wx:if":function($){with($){return (item.menu.length)}},"class":"button button-outline grow","data-start":function($){with($){return (item.start)}},"bindtap":"repeat","disabled":function($){with($){return (saving)}}},"复做这套","\n      ",[]]]]]]]],["view",{"wx:if":function($){with($){return (!weeks.length)}},"class":"empty-text muted"},"分装成品、记过的支出和烹饪过程会出现在这里。","\n",[]]]]]],"pages/schedule/index":["root",{},"","",[["view",{"wx:if":function($){with($){return (current)}},"class":"screen stack"},"\n  ","\n",[["view",{"class":"stack compact"},"\n    ","\n  ",[["text",{"class":"heading"},function($){with($){return (current.batch ? '周菜单' : '编辑菜单')}},"\n    ",[]],["text",{"class":"small muted"},function($){with($){return (current.label)}},"\n  ",[]]]],["block",{"wx:if":function($){with($){return (!current.batch)}}},"\n    ","\n  ",[["view",{"class":"stack compact"},"\n      ","\n    ",[["view",{"wx:for":function($){with($){return (current.menu)}},"wx:key":"id","class":"menu-row row between"},"\n        ","\n      ",[["text",{"class":"label grow"},function($){with($){return (item.title)}},"\n        ",[]],["button",{"class":"button button-quiet button-small","data-id":function($){with($){return (item.id)}},"bindtap":"removeDish"},"移除","\n      ",[]]]],["view",{"class":"row"},"\n        ","\n      ",[["input",{"class":"input grow","value":function($){with($){return (name)}},"maxlength":"48","placeholder":"临时加一道菜，例如杂粮饭","bindinput":"dishInput","bindconfirm":"addQuickDish"},"","\n        ",[]],["button",{"class":"button button-outline","bindtap":"addQuickDish"},"添加","\n      ",[]]]],["button",{"class":"button button-outline","bindtap":"choose"},"从菜谱选菜","\n    ",[]]]],["view",{"class":"row between"},"\n      ","\n    ",[["text",{"class":"section-title"},"计划盒数","\n      ",[]],["input",{"class":"input plan-count","type":"number","maxlength":"2","value":function($){with($){return (targetBoxes)}},"bindinput":"boxInput"},"","\n    ",[]]]],["button",{"class":"button button-quiet","bindtap":"toggleDates"},function($){with($){return ("用餐日期 · " + String((dateCount ? '已选 ' + dateCount + ' 餐' : '选填') ?? '') + "")}},"\n    ",[]],["view",{"wx:if":function($){with($){return (datesOpen)}},"class":"card"},"\n      ","\n    ",[["view",{"wx:for":function($){with($){return (rows)}},"wx:key":"date","class":"slot-row"},"\n        ","\n    ",[["view",{"class":"slot-day stack compact"},"","\n        ",[["text",{"class":"label"},function($){with($){return (item.label)}},"",[]],["text",{"class":"small muted"},function($){with($){return (item.short)}},"",[]]]],["button",{"class":function($){with($){return ("slot-choice " + String((item.lunch ? 'slot-choice-active' : '') ?? '') + "")}},"data-date":function($){with($){return (item.date)}},"data-meal":"lunch","bindtap":"toggleMeal","aria-pressed":function($){with($){return (item.lunch)}}},"午餐","\n        ",[]],["button",{"class":function($){with($){return ("slot-choice " + String((item.dinner ? 'slot-choice-active' : '') ?? '') + "")}},"data-date":function($){with($){return (item.date)}},"data-meal":"dinner","bindtap":"toggleMeal","aria-pressed":function($){with($){return (item.dinner)}}},"晚餐","\n      ",[]]]]]],["button",{"class":"button button-primary","bindtap":"save","disabled":function($){with($){return (saving)}},"loading":function($){with($){return (saving)}}},"保存安排","\n  ",[]]]],["view",{"wx:else":""},"\n    ","\n",[["view",{"wx:for":function($){with($){return (current.menu)}},"wx:key":"id","class":"menu-row row between"},"\n      ","\n  ",[["text",{"class":"label grow"},function($){with($){return (item.title)}},"\n      ",[]],["text",{"wx:if":function($){with($){return (item.categoryLabel)}},"class":"small muted"},function($){with($){return (item.categoryLabel)}},"\n    ",[]]]]]]]]]],"pages/today/index":["root",{},"","",[["view",{"class":"screen"},"正在打开备餐","\n",[]]]],"templates/shared":["root",{},"","",[["template",{"name":"week-switch"},"\n  ","\n\n",[["view",{"class":"week-switch"},"\n    ","\n",[["button",{"aria-label":"上一周","hover-class":"tap-hover","bindtap":"changeWeek","data-step":"-1"},"","\n    ",[["text",{"class":"chevron chevron-left"},"","",[]]]],["text",{"class":"week-date"},function($){with($){return (label)}},"\n    ",[]],["button",{"aria-label":"下一周","hover-class":"tap-hover","bindtap":"changeWeek","data-step":"1"},"","\n  ",[["text",{"class":"chevron"},"","",[]]]]]]]],["template",{"name":"stepper"},"\n  ","\n",[["view",{"class":"stepper"},"\n    ","\n",[["button",{"aria-label":function($){with($){return ("减少" + String((label) ?? '') + "")}},"disabled":function($){with($){return (0 >= value)}},"bindtap":"step","data-field":function($){with($){return (field)}},"data-step":"-1"},"−","\n    ",[]],["text",{"class":"stepper-value"},function($){with($){return (value)}},"\n    ",[]],["button",{"aria-label":function($){with($){return ("增加" + String((label) ?? '') + "")}},"disabled":function($){with($){return (value >= 99)}},"bindtap":"step","data-field":function($){with($){return (field)}},"data-step":"1"},"＋","\n  ",[]]]]]],["template",{"name":"recipe-management"},"\n  ","\n",[["view",{"wx:if":function($){with($){return (recipe)}},"class":"recipe-modal"},"\n    ","\n",[["view",{"class":"recipe-scrim","bindtap":"closeRecipeManagement","aria-label":"关闭菜谱管理"},"","\n    ",[]],["view",{"class":"recipe-sheet stack","role":"dialog","aria-modal":"true","aria-label":"菜谱管理"},"\n      ","\n  ",[["text",{"class":"section-title"},function($){with($){return (recipe.title)}},"\n      ",[]],["button",{"class":"recipe-sheet-row","data-action":"edit","bindtap":"manageRecipe","disabled":function($){with($){return (saving)}}},"\n        ","\n      ",[["text",{"class":"label"},"修改菜谱","\n        ",[]],["text",{"class":"small muted"},"改菜名、照片、食材和步骤","\n      ",[]]]],["button",{"wx:if":function($){with($){return (recipe.recommendationId)}},"class":"recipe-sheet-row","data-action":"uncollect","bindtap":"manageRecipe","disabled":function($){with($){return (saving)}}},"\n        ","\n      ",[["text",{"class":"label"},"取消收藏","\n        ",[]],["text",{"class":"small muted"},"改过的版本会保留在我的菜谱","\n      ",[]]]],["button",{"class":"recipe-sheet-row accent","data-action":"delete","bindtap":"manageRecipe","disabled":function($){with($){return (saving)}}},"\n        ","\n      ",[["text",{"class":"label"},"删除菜谱","\n        ",[]],["text",{"class":"small muted"},"从我的菜谱删除，需再次确认","\n      ",[]]]],["button",{"class":"button button-outline","bindtap":"closeRecipeManagement","disabled":function($){with($){return (saving)}}},"关闭","\n    ",[]]]]]]]]]]}};
