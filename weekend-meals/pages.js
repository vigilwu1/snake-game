window.mealSource = {app:{"pages": ["pages/today/index", "pages/prep/index", "pages/recipes/index", "pages/review/index", "pages/recipe/index", "pages/recipe/edit", "pages/schedule/index", "pages/records/index"], "window": {"navigationBarTitleText": "周末备餐", "navigationBarBackgroundColor": "#f8f7f1", "navigationBarTextStyle": "black", "backgroundColor": "#f8f7f1"}, "tabBar": {"color": "#677168", "selectedColor": "#24533c", "backgroundColor": "#fffef9", "borderStyle": "white", "list": [{"pagePath": "pages/today/index", "text": "今天", "iconPath": "assets/today.png", "selectedIconPath": "assets/today-active.png"}, {"pagePath": "pages/prep/index", "text": "备餐", "iconPath": "assets/prep.png", "selectedIconPath": "assets/prep-active.png"}, {"pagePath": "pages/recipes/index", "text": "菜谱", "iconPath": "assets/recipes.png", "selectedIconPath": "assets/recipes-active.png"}, {"pagePath": "pages/review/index", "text": "回顾", "iconPath": "assets/review.png", "selectedIconPath": "assets/review-active.png"}]}, "style": "v2", "sitemapLocation": "sitemap.json"},titles:{"pages/today/index": "周末备餐", "pages/prep/index": "备餐", "pages/recipes/index": "菜谱", "pages/review/index": "回顾", "pages/recipe/index": "菜谱详情", "pages/recipe/edit": "新增菜谱", "pages/schedule/index": "排餐", "pages/records/index": "备餐记录"},modules:{"app":function(require,module,exports){
App({
  globalData: {
    prepTarget: '',
    recipeTarget: ''
  }
})

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
const storageKey = 'weekend-meals/v1'
const places = ['chilled', 'frozen']
let idSequence = 0

function makeId() {
  idSequence += 1
  return Date.now().toString(36) + '-' + idSequence.toString(36) + '-' + Math.random().toString(36).slice(2, 7)
}

function read() {
  return wx.getStorageSync(storageKey) || { recipes: [], weeks: {} }
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
    start, recipe: null, slots: [], shopping: [], expenses: [], notes: [], batch: null, eaten: []
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

function saveRecipe(input) {
  const title = input.title.trim()
  if (!title) throw new Error('先写一个菜名')
  const state = read()
  const existing = state.recipes.find(recipe => recipe.id === input.id)
  if (input.id && !existing) throw new Error('找不到这份菜谱')
  const recipe = {
    id: existing ? existing.id : makeId(),
    title,
    photo: input.photo || '',
    ingredients: ingredientsFromText(input.ingredients),
    method: input.method.trim(),
    updatedAt: Date.now()
  }
  state.recipes = [recipe, ...state.recipes.filter(item => item.id !== recipe.id)]
  write(state)
  return recipe
}

function syncShopping(current, ingredients) {
  const desired = new Set(ingredients.map(item => item.name))
  const kept = current.filter(item => desired.has(item.name) || item.manual || item.status !== 'todo')
  const existingNames = new Set(kept.map(item => item.name))
  return [
    ...kept,
    ...ingredients.filter(item => !existingNames.has(item.name)).map(item => ({
      ...item, id: makeId(), status: 'todo', manual: false
    }))
  ]
}

function schedule(start, recipe, slots, { replace = false } = {}) {
  if (!recipe || !recipe.title) throw new Error('先选一份菜谱')
  if (!slots.length) throw new Error('至少选一顿要安排的餐')
  if (dates.monday(start) !== start) throw new Error('请选择一个备餐周')

  const keys = new Set()
  for (const { date, meal } of slots) {
    const key = dates.slotKey(date, meal)
    if (dates.monday(date) !== start || !dates.mealLabels[meal] || keys.has(key)) {
      throw new Error('这周的排餐日期有误，请重新选择')
    }
    keys.add(key)
  }

  updateWeek(start, current => {
    if (current.batch) throw new Error('这周已分装，请选择其他备餐周')
    if (current.recipe && !replace) throw new Error('请先确认更新这周的安排')
    current.recipe = {
      id: recipe.id,
      title: recipe.title,
      photo: recipe.photo,
      ingredients: recipe.ingredients.map(item => ({ ...item })),
      method: recipe.method
    }
    current.slots = slots.slice().sort(dates.compareSlots)
    current.shopping = syncShopping(current.shopping, current.recipe.ingredients)
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
    const entry = {
      id: existing ? existing.id : makeId(),
      createdAt: existing ? existing.createdAt : Date.now(),
      photo: input.photo || '',
      ...fields
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
    if (!current.recipe) throw new Error('先排好这周的菜谱')
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

function eat(start, date, meal, place) {
  updateWeek(start, current => {
    if (!current.slots.some(slot => slot.date === date && slot.meal === meal)) {
      throw new Error('这顿饭目前不在排餐里')
    }
    if (current.eaten.some(entry => entry.date === date && entry.meal === meal)) {
      throw new Error('这顿已经记过了')
    }
    if (!places.includes(place) || stockFor(current)[place] <= 0) {
      throw new Error('这个位置已经没有餐盒了')
    }
    current.eaten.push({ date, meal, place, createdAt: Date.now() })
  })
}

function undoEat(start, date, meal) {
  updateWeek(start, current => {
    current.eaten = current.eaten.filter(entry => entry.date !== date || entry.meal !== meal)
  })
}

function totalSpent(current) {
  return current.expenses.reduce((total, item) => total + item.cents, 0)
}

module.exports = {
  addShopping, eat, expenseCents, ingredientsToText, read, removeEntry, saveBatch, saveEntry,
  saveRecipe, schedule, setShoppingStatus, stockFor, totalSpent, undoEat, week
}

},"lib/ui":function(require,module,exports){
const dates = require('./dates')
const journal = require('./journal')

const storageLabels = { chilled: '冷藏', frozen: '冷冻' }
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
    title, content, confirmText, confirmColor: '#24543b',
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
  if (!photo || photo.startsWith(root)) return save(photo || '')

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
      (week.recipe && week.recipe.photo === photo) ||
      (week.batch && week.batch.photo === photo) ||
      week.expenses.some(entry => entry.photo === photo) ||
      week.notes.some(entry => entry.photo === photo)
    )
    if (!used) wx.getFileSystemManager().unlink({ filePath: photo, fail() {} })
  } catch (error) {
    // A cleanup failure should not fail a record that was already saved.
  }
}

function previewPhoto(event) {
  const photo = event.currentTarget.dataset.photo
  if (photo) wx.previewImage({ current: photo, urls: [photo] })
}

function openPrep(start) {
  getApp().globalData.prepTarget = start || ''
  wx.switchTab({ url: '/pages/prep/index' })
}

function openRecipes(start) {
  getApp().globalData.recipeTarget = start || ''
  wx.switchTab({ url: '/pages/recipes/index' })
}

function weekView(current) {
  return {
    ...current,
    label: dates.weekLabel(current.start),
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
  attempt, choosePhoto, confirm, datedEntry, formatMoney, message, nutritionParts, openPrep,
  openRecipes, previewPhoto, releasePhoto, report, saveWithPhoto, shoppingLabels, storageLabels, submit, weekView
}

},"pages/prep/index":function(require,module,exports){
const dates = require('../../lib/dates')
const journal = require('../../lib/journal')
const ui = require('../../lib/ui')

Page({
  data: { current: null, timing: '', slotSummary: '' },

  onShow() {
    const app = getApp()
    const start = app.globalData.prepTarget || this.data.start || dates.nextMonday()
    app.globalData.prepTarget = ''
    this.refresh(start)
  },

  refresh(start) {
    const current = ui.weekView(journal.week(start))
    const thisWeek = dates.monday()
    const timing = start === thisWeek ? '本周' : (start === dates.addDays(thisWeek, 7) ? '下周' : '')
    const weekdayLunch = dates.defaultSlots(start)
    const isWeekdayLunch = current.slots.length === weekdayLunch.length &&
      current.slots.every((slot, index) => slot.date === weekdayLunch[index].date && slot.meal === 'lunch')
    const slotSummary = isWeekdayLunch
      ? '周一至周五 · 午餐'
      : current.slots.map(slot => dates.weekday(slot.date) + dates.mealLabels[slot.meal]).join('、')
    this.setData({ start, current, timing, slotSummary })
  },

  changeWeek(event) {
    this.refresh(dates.addDays(this.data.start, 7 * Number(event.currentTarget.dataset.step)))
  },

  chooseRecipe() {
    ui.openRecipes(this.data.start)
  },

  openRecipe() {
    wx.navigateTo({ url: '/pages/recipe/index?week=' + this.data.start })
  },

  editPlan() {
    wx.navigateTo({ url: '/pages/schedule/index?edit=' + this.data.start })
  },

  openRecords(event) {
    const mode = event.currentTarget.dataset.mode
    if (mode === 'batch' && !this.data.current.recipe) {
      ui.message('先选一道菜谱，再登记成品')
      return
    }
    wx.navigateTo({ url: '/pages/records/index?mode=' + mode + '&week=' + this.data.start })
  }
})

},"pages/recipe/edit":function(require,module,exports){
const journal = require('../../lib/journal')
const ui = require('../../lib/ui')

Page({
  data: { title: '', photo: '', ingredients: '', method: '', saving: false },

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
      method: recipe.method
    })
  },

  input(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [field]: event.detail.value })
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
        id: this.recipeId, title: data.title, ingredients: data.ingredients, method: data.method, photo
      }))
      if (previous && previous.photo !== recipe.photo) ui.releasePhoto(previous.photo)
      if (this.recipeId) wx.navigateBack()
      else wx.redirectTo({ url: '/pages/recipe/index?id=' + recipe.id + this.targetQuery() })
    })
  },

  targetQuery() {
    const pages = getCurrentPages()
    const previous = pages[pages.length - 2]
    const target = previous && previous.route === 'pages/recipes/index' ? previous.data.target : ''
    return target ? '&target=' + target : ''
  }
})

},"pages/recipe/index":function(require,module,exports){
const dates = require('../../lib/dates')
const journal = require('../../lib/journal')
const ui = require('../../lib/ui')

Page({
  data: { recipe: null, ready: false, isSnapshot: false, target: '', targetLabel: '' },

  onLoad(options) {
    this.recipeId = options.id
    this.weekStart = options.week
    const target = options.target || ''
    this.setData({ isSnapshot: Boolean(options.week), target, targetLabel: target ? dates.weekLabel(target) : '' })
  },

  onShow() {
    const recipe = this.weekStart
      ? journal.week(this.weekStart).recipe
      : journal.read().recipes.find(item => item.id === this.recipeId)
    this.setData({ recipe: recipe || null, ready: true })
  },

  editRecipe() {
    wx.navigateTo({ url: '/pages/recipe/edit?id=' + this.recipeId })
  },

  schedule() {
    const target = this.data.target ? '&target=' + this.data.target : ''
    wx.navigateTo({ url: '/pages/schedule/index?id=' + this.recipeId + target })
  },

  previewPhoto: ui.previewPhoto
})

},"pages/recipes/index":function(require,module,exports){
const dates = require('../../lib/dates')
const journal = require('../../lib/journal')

Page({
  data: { recipes: [], query: '', target: '', targetLabel: '', total: 0 },

  onShow() {
    const app = getApp()
    const target = app.globalData.recipeTarget || this.data.target
    app.globalData.recipeTarget = ''
    this.setData({ target, targetLabel: target ? dates.weekLabel(target) : '' })
    this.refresh(this.data.query)
  },

  onHide() {
    if (!this.openingDetail) this.setData({ target: '', targetLabel: '' })
    this.openingDetail = false
  },

  refresh(query) {
    const { recipes } = journal.read()
    const needle = query.trim().toLowerCase()
    this.setData({
      query, total: recipes.length,
      recipes: recipes.filter(recipe => recipe.title.toLowerCase().includes(needle))
    })
  },

  search(event) {
    this.refresh(event.detail.value)
  },

  addRecipe() {
    this.openingDetail = true
    wx.navigateTo({ url: '/pages/recipe/edit' })
  },

  openRecipe(event) {
    this.openingDetail = true
    const { id } = event.currentTarget.dataset
    const target = this.data.target ? '&target=' + this.data.target : ''
    wx.navigateTo({ url: '/pages/recipe/index?id=' + id + target })
  }
})

},"pages/records/index":function(require,module,exports){
const dates = require('../../lib/dates')
const journal = require('../../lib/journal')
const ui = require('../../lib/ui')

const titles = { shop: '采购', cook: '烹饪记录', batch: '分装' }
const entryTypes = { expense: 'expenses', note: 'notes' }
const storageFields = [
  { field: 'count', label: '实际盒数' },
  { field: 'chilled', label: '冷藏' },
  { field: 'frozen', label: '冷冻' }
]

function batchFromWeek(current) {
  const batch = current.batch || {
    count: current.slots.length || 1, chilled: 0, frozen: 0, photo: ''
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
    batch: {}, difference: 0, storageFields
  },

  onLoad(options) {
    this.start = options.week || dates.nextMonday()
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
    this.setData({
      current,
      shopping: current.shopping.map(item => ({ ...item, statusLabel: ui.shoppingLabels[item.status] })),
      expenses: current.expenses.slice().reverse().map(item => ({
        ...ui.datedEntry(item), amount: ui.formatMoney(item.cents)
      })),
      notes: current.notes.map(ui.datedEntry)
    })
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

  addNote() {
    this.setEditor('note', { id: '', text: '', photo: '' })
  },

  async newPhotoNote() {
    try {
      const photo = await ui.choosePhoto()
      if (photo) this.setEditor('note', { id: '', text: '', photo })
    } catch (error) {
      ui.report(error)
    }
  },

  editEntry(event) {
    if (this.data.editor || this.data.saving) return
    const { id, kind } = event.currentTarget.dataset
    const entry = this.data[entryTypes[kind]].find(item => item.id === id)
    if (!entry) return
    const form = kind === 'expense'
      ? { id, amount: entry.amount, shop: entry.shop, photo: entry.photo }
      : { id, text: entry.text, photo: entry.photo }
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
  data: { current: null, weeks: [], start: '', notes: [], nutrition: [], hasContent: false },

  onShow() {
    const state = journal.read()
    const weeks = Object.values(state.weeks)
      .sort((a, b) => b.start.localeCompare(a.start))
      .map(week => ({ start: week.start, label: dates.weekLabel(week.start) }))
    const start = this.data.start || (weeks[0] && weeks[0].start) || dates.monday()
    this.setData({ weeks })
    this.refresh(start, state)
  },

  refresh(start, state = journal.read()) {
    const current = ui.weekView(journal.week(start, state))
    const notes = current.notes.map(ui.datedEntry)
    const hasContent = Boolean(current.batch || current.expenses.length || notes.length)
    const weekIndex = this.data.weeks.findIndex(week => week.start === start)
    this.setData({
      start, current, notes, hasContent, weekIndex,
      nutrition: ui.nutritionParts(current.batch)
    })
  },

  changeWeek(event) {
    this.refresh(dates.addDays(this.data.start, 7 * Number(event.currentTarget.dataset.step)))
  },

  jumpWeek(event) {
    const selected = this.data.weeks[Number(event.detail.value)]
    if (selected) this.refresh(selected.start)
  },

  previewPhoto: ui.previewPhoto,

  openPrep() {
    ui.openPrep(this.data.start)
  },

  repeat() {
    wx.navigateTo({ url: '/pages/schedule/index?copyFrom=' + this.data.start })
  }
})

},"pages/schedule/index":function(require,module,exports){
const dates = require('../../lib/dates')
const journal = require('../../lib/journal')
const ui = require('../../lib/ui')

Page({
  data: { recipe: null, rows: [], label: '', total: 0, existingTitle: '', locked: false, saving: false },

  onLoad(options) {
    const state = journal.read()
    this.editing = Boolean(options.edit)
    const start = options.edit || options.target || dates.nextMonday()
    const source = options.copyFrom ? journal.week(options.copyFrom, state) : null
    const existing = journal.week(start, state)
    const recipe = source ? source.recipe : (
      this.editing ? existing.recipe : state.recipes.find(item => item.id === options.id)
    )
    if (!recipe) {
      ui.message('先选一份菜谱')
      return
    }
    const slots = source
      ? dates.moveSlots(source.slots, source.start, start)
      : (existing.slots.length ? existing.slots : dates.defaultSlots(start))
    this.setData({ recipe, editing: this.editing })
    this.render(start, slots)
  },

  render(start, slots) {
    this.slots = slots
    const existing = journal.week(start)
    const selected = new Set(slots.map(slot => dates.slotKey(slot.date, slot.meal)))
    const rows = Array.from({ length: 7 }, (_, offset) => {
      const date = dates.addDays(start, offset)
      return {
        date, label: dates.weekday(date), short: dates.shortDate(date),
        lunch: selected.has(dates.slotKey(date, 'lunch')),
        dinner: selected.has(dates.slotKey(date, 'dinner'))
      }
    })
    this.setData({
      start, label: dates.weekLabel(start), rows, total: slots.length,
      existingTitle: existing.recipe ? existing.recipe.title : '',
      locked: Boolean(existing.batch)
    })
  },

  changeWeek(event) {
    if (this.data.saving) return
    const from = this.data.start
    const start = dates.addDays(from, 7 * Number(event.currentTarget.dataset.step))
    this.render(start, dates.moveSlots(this.slots, from, start))
  },

  toggleMeal(event) {
    if (this.data.saving) return
    const { date, meal } = event.currentTarget.dataset
    const exists = this.slots.some(slot => slot.date === date && slot.meal === meal)
    const slots = exists
      ? this.slots.filter(slot => slot.date !== date || slot.meal !== meal)
      : [...this.slots, { date, meal }]
    this.render(this.data.start, slots)
  },

  save() {
    return ui.submit(this, async () => {
      const { start, recipe } = this.data
      const existing = journal.week(start)
      const replace = Boolean(existing.recipe)
      if (!this.slots.length) throw new Error('至少选一顿要安排的餐')
      if (existing.batch) throw new Error('这周已分装，请选择其他备餐周')
      if (replace && !this.editing &&
        !await ui.confirm('更新这周的安排？', '这周已有「' + existing.recipe.title + '」。已记的采购支出和过程照片会保留。', '更新安排')) return
      journal.schedule(start, recipe, this.slots, { replace })
      ui.openPrep(start)
    })
  }
})

},"pages/today/index":function(require,module,exports){
const dates = require('../../lib/dates')
const journal = require('../../lib/journal')
const ui = require('../../lib/ui')

Page({
  data: {
    dateLabel: '', start: '', recipe: null, slots: [], stock: {}, next: null,
    photo: '', isReference: false, busy: false
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const today = dates.dayKey()
    const state = journal.read()
    const start = dates.monday(today)
    const current = journal.week(start, state)
    const stock = journal.stockFor(current)
    const slots = current.slots.filter(slot => slot.date === today).map(slot => ({
      ...slot,
      label: dates.mealLabels[slot.meal],
      eaten: current.eaten.some(entry => entry.date === today && entry.meal === slot.meal)
    }))
    const upcoming = Object.values(state.weeks)
      .flatMap(week => week.slots.filter(slot => slot.date > today).map(slot => ({ ...slot, week })))
      .sort(dates.compareSlots)[0]
    const next = upcoming ? {
      start: upcoming.week.start,
      date: dates.shortDate(upcoming.date) + ' ' + dates.weekday(upcoming.date),
      meal: dates.mealLabels[upcoming.meal],
      recipe: upcoming.week.recipe.title,
      photo: upcoming.week.recipe.photo
    } : null
    const actualPhoto = current.batch && current.batch.photo
    const photo = actualPhoto || (current.recipe && current.recipe.photo) || ''
    this.setData({
      dateLabel: dates.shortDate(today) + ' ' + dates.weekday(today),
      today, start, recipe: current.recipe, slots, stock, next, photo,
      isReference: Boolean(photo && !actualPhoto),
      mealTitle: slots.length === 1 ? '今日' + slots[0].label : '今日餐盒',
      unready: current.batch ? '这周的餐盒已用完' : '待分装'
    })
  },

  openRecipes() {
    ui.openRecipes()
  },

  openPlan(event) {
    ui.openPrep(event.currentTarget.dataset.start || dates.nextMonday())
  },

  viewRecipe() {
    wx.navigateTo({ url: '/pages/recipe/index?week=' + this.data.start })
  },

  previewPhoto: ui.previewPhoto,

  eat(event) {
    const meal = event.currentTarget.dataset.meal
    if (this.data.busy) return
    const { start, today } = this.data
    const stock = journal.stockFor(journal.week(start))
    const places = Object.keys(ui.storageLabels).filter(place => stock[place] > 0)
    if (!places.length) {
      this.refresh()
      return
    }
    const record = place => {
      ui.attempt(() => journal.eat(start, today, meal, place))
      this.refresh()
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

  undo(event) {
    const { start, today } = this.data
    ui.attempt(() => journal.undoEat(start, today, event.currentTarget.dataset.meal))
    this.refresh()
  }
})

}},templates:{"pages/prep/index":["root",{},"","",[["import",{"src":"../../templates/shared.wxml"},"","\n",[]],["view",{"wx:if":function($){with($){return (current)}},"class":"screen stack"},"\n  ","\n",[["template",{"is":"week-switch","data":function($){with($){return (({label: current.label}))}}},"","\n  ",[]],["view",{"class":"row between"},"\n    ","\n  ",[["text",{"class":"section-title"},"备餐安排","\n    ",[]],["text",{"wx:if":function($){with($){return (timing)}},"class":"pill"},function($){with($){return (timing)}},"\n  ",[]]]],["view",{"wx:if":function($){with($){return (current.recipe)}},"class":"card"},"\n    ","\n  ",[["view",{"class":"pad row","bindtap":"openRecipe","hover-class":"tap-hover"},"\n      ","\n    ",[["image",{"wx:if":function($){with($){return (current.recipe.photo)}},"class":"thumb","src":function($){with($){return (current.recipe.photo)}},"mode":"aspectFill"},"","\n      ",[]],["view",{"wx:else":"","class":"thumb cover-empty"},"","\n      ",[["view",{"class":"plate-mark"},"","",[]]]],["view",{"class":"grow stack compact"},"\n        ","\n      ",[["text",{"class":"title"},function($){with($){return (current.recipe.title)}},"\n        ",[]],["text",{"class":"small muted"},function($){with($){return (slotSummary)}},"\n        ",[]],["text",{"class":"label"},function($){with($){return ("计划 " + String((current.slots.length) ?? '') + " 盒")}},"\n      ",[]]]],["text",{"class":"chevron"},"","\n    ",[]]]],["view",{"wx:if":function($){with($){return (!current.batch)}},"class":"pad divider row"},"\n      ","\n  ",[["button",{"class":"button button-small button-quiet grow","bindtap":"editPlan"},"调整餐期","\n      ",[]],["button",{"class":"button button-small button-quiet grow","bindtap":"chooseRecipe"},"重新选菜","\n    ",[]]]]]],["view",{"wx:else":"","class":"card soft pad stack"},"\n    ","\n  ",[["text",{"class":"title"},"这周准备做什么？","\n    ",[]],["text",{"class":"body muted"},"选一道菜，再勾选要吃的日期。","\n    ",[]],["button",{"class":"button button-primary","bindtap":"chooseRecipe","hover-class":"tap-hover"},"从菜谱选一道","\n  ",[]]]],["view",{"class":"card"},"\n    ","\n",[["view",{"class":"action-row","bindtap":"openRecords","data-mode":"shop","hover-class":"tap-hover"},"\n      ","\n    ",[["view",{"class":"action-icon"},"采","",[]],["text",{"class":"grow label"},"采购","\n      ",[]],["text",{"class":"label"},function($){with($){return ("¥" + String((current.spent) ?? '') + "")}},"",[]],["text",{"class":"chevron"},"","\n    ",[]]]],["view",{"class":"action-row","bindtap":"openRecords","data-mode":"cook","hover-class":"tap-hover"},"\n      ","\n    ",[["view",{"class":"action-icon"},"记","",[]],["text",{"class":"grow label"},"烹饪记录","\n      ",[]],["text",{"class":"label"},function($){with($){return ("" + String((current.notes.length) ?? '') + " 条")}},"",[]],["text",{"class":"chevron"},"","\n    ",[]]]],["view",{"class":"action-row","bindtap":"openRecords","data-mode":"batch","hover-class":"tap-hover"},"\n      ","\n  ",[["view",{"class":"action-icon"},"盒","",[]],["text",{"class":"grow label"},"分装","\n      ",[]],["text",{"wx:if":function($){with($){return (current.batch)}},"class":"label"},function($){with($){return ("" + String((current.batch.count) ?? '') + " 盒")}},"\n      ",[]],["text",{"wx:else":"","class":"small muted"},"待分装","",[]],["text",{"class":"chevron"},"","\n    ",[]]]]]]]]]],"pages/recipe/edit":["root",{},"","",[["view",{"class":"screen stack"},"\n  ","\n",[["view",{"class":"card pad stack"},"\n    ","\n  ",[["view",{"class":"field"},"\n      ","\n    ",[["text",{"class":"label"},"菜名","\n      ",[]],["input",{"class":"input","data-field":"title","bindinput":"input","value":function($){with($){return (title)}},"maxlength":"48","placeholder":"比如照烧鸡腿糙米饭"},"","\n    ",[]]]],["view",{"class":"field"},"\n      ","\n  ",[["text",{"class":"label"},"参考图片","\n      ",[]],["block",{"wx:if":function($){with($){return (photo)}}},"\n        ","\n      ",[["image",{"class":"cover card","mode":"aspectFill","src":function($){with($){return (photo)}},"bindtap":"previewPhoto","data-photo":function($){with($){return (photo)}}},"","\n        ",[]],["view",{"class":"row"},"\n          ","\n      ",[["button",{"class":"button button-small button-quiet grow","bindtap":"pickPhoto"},"更换图片","\n          ",[]],["button",{"class":"button button-small button-outline","bindtap":"removePhoto"},"移除","\n        ",[]]]]]],["view",{"wx:else":"","class":"upload","bindtap":"pickPhoto","hover-class":"tap-hover"},"＋ 添加参考图","\n    ",[]]]]]],["view",{"class":"card pad stack"},"\n    ","\n  ",[["view",{"class":"field"},"\n      ","\n    ",[["text",{"class":"label"},"食材与用量","\n      ",[]],["textarea",{"class":"textarea textarea-short","data-field":"ingredients","bindinput":"input","value":function($){with($){return (ingredients)}},"maxlength":"1500","placeholder":"一行写一种食材，例如「鸡腿 600 g」"},"","\n    ",[]]]],["view",{"class":"field"},"\n      ","\n  ",[["text",{"class":"label"},"做法","\n      ",[]],["textarea",{"class":"textarea","data-field":"method","bindinput":"input","value":function($){with($){return (method)}},"maxlength":"6000","placeholder":"粘贴或写下步骤、用时和调味"},"","\n    ",[]]]]]],["button",{"class":"button button-primary","bindtap":"save","disabled":function($){with($){return (saving)}},"loading":function($){with($){return (saving)}},"hover-class":"tap-hover"},"保存菜谱","\n",[]]]]]],"pages/recipe/index":["root",{},"","",[["view",{"wx:if":function($){with($){return (recipe)}},"class":"screen stack"},"\n  ","\n",[["view",{"class":"row between"},"\n    ","\n  ",[["text",{"class":"title grow"},function($){with($){return (recipe.title)}},"\n    ",[]],["button",{"wx:if":function($){with($){return (!isSnapshot)}},"class":"button button-small button-quiet","bindtap":"editRecipe"},"编辑","\n  ",[]]]],["view",{"wx:if":function($){with($){return (recipe.photo)}},"class":"card relative"},"\n    ","\n  ",[["image",{"class":"cover cover-tall","mode":"aspectFill","src":function($){with($){return (recipe.photo)}},"bindtap":"previewPhoto","data-photo":function($){with($){return (recipe.photo)}}},"","\n    ",[]],["text",{"class":"caption"},"参考图","\n  ",[]]]],["view",{"wx:if":function($){with($){return (recipe.ingredients.length)}},"class":"card pad stack compact"},"\n    ","\n  ",[["text",{"class":"section-title"},"食材","\n    ",[]],["view",{"wx:for":function($){with($){return (recipe.ingredients)}},"wx:key":"name","class":"row between"},"\n      ","\n  ",[["text",{"class":"body grow"},function($){with($){return (item.name)}},"\n      ",[]],["text",{"class":"small muted"},function($){with($){return (item.amount)}},"\n    ",[]]]]]],["view",{"class":"card pad stack compact"},"\n    ","\n  ",[["text",{"class":"section-title"},"做法","\n    ",[]],["text",{"wx:if":function($){with($){return (recipe.method)}},"class":"note"},function($){with($){return (recipe.method)}},"\n    ",[]],["text",{"wx:else":"","class":"muted"},"待补充","\n  ",[]]]],["button",{"wx:if":function($){with($){return (!isSnapshot)}},"class":"button button-primary","bindtap":"schedule","hover-class":"tap-hover"},function($){with($){return (targetLabel ? '安排到所选周' : '排到下周')}},"\n",[]]]],["view",{"wx:elif":function($){with($){return (ready)}},"class":"screen"},"","\n",[["view",{"class":"card empty-text muted"},"找不到这份菜谱","",[]]]]]],"pages/recipes/index":["root",{},"","",[["view",{"class":"screen stack"},"\n  ","\n",[["view",{"class":"row between"},"\n    ","\n  ",[["text",{"class":"heading"},"我的菜谱","\n    ",[]],["button",{"class":"button button-primary button-small","bindtap":"addRecipe","hover-class":"tap-hover"},"＋ 新增菜谱","\n  ",[]]]],["text",{"wx:if":function($){with($){return (targetLabel)}},"class":"small muted"},function($){with($){return ("为 " + String((targetLabel) ?? '') + " 选一道菜")}},"\n  ",[]],["input",{"wx:if":function($){with($){return (total)}},"class":"input search","type":"text","placeholder":"搜菜名","value":function($){with($){return (query)}},"bindinput":"search","confirm-type":"search"},"","\n  ",[]],["view",{"wx:if":function($){with($){return (recipes.length)}},"class":"list-images"},"\n    ","\n  ",[["view",{"wx:for":function($){with($){return (recipes)}},"wx:key":"id","class":"card","bindtap":"openRecipe","data-id":function($){with($){return (item.id)}},"hover-class":"tap-hover"},"\n      ","\n  ",[["image",{"wx:if":function($){with($){return (item.photo)}},"class":"cover library-cover","mode":"aspectFill","src":function($){with($){return (item.photo)}}},"","\n      ",[]],["view",{"wx:else":"","class":"cover library-cover cover-empty"},"","\n      ",[["view",{"class":"plate-mark"},"","",[]]]],["view",{"class":"library-card label"},function($){with($){return (item.title)}},"\n    ",[]]]]]],["view",{"wx:elif":function($){with($){return (total)}},"class":"card empty-text"},"\n    ","\n  ",[["text",{"class":"muted"},"没找到这个菜名","\n  ",[]]]],["view",{"wx:else":"","class":"card empty-text"},"\n    ","\n",[["text",{"class":"section-title"},"收藏想做的饭","\n    ",[]],["text",{"class":"body muted"},"把参考图和做法存下来，周末挑一道排到下周。","\n  ",[]]]]]]]],"pages/records/index":["root",{},"","",[["import",{"src":"../../templates/shared.wxml"},"","\n",[]],["view",{"wx:if":function($){with($){return (current)}},"class":"screen stack"},"\n  ","\n",[["text",{"class":"small muted"},function($){with($){return (current.label)}},"\n  ",[["text",{"wx:if":function($){with($){return (current.recipe)}}},function($){with($){return (" · " + String((current.recipe.title) ?? '') + "")}},"",[]]]],["block",{"wx:if":function($){with($){return (mode === 'shop')}}},"\n    ","\n  ",[["view",{"class":"card pad soft stack compact"},"\n      ","\n    ",[["text",{"class":"label"},"本周实付","\n      ",[]],["text",{"class":"number number-major"},function($){with($){return ("¥" + String((current.spent) ?? '') + "")}},"\n    ",[]]]],["button",{"wx:if":function($){with($){return (!editor)}},"class":"button button-primary","bindtap":"addExpense","hover-class":"tap-hover"},"＋ 记一笔","\n  ",[]]]],["view",{"wx:if":function($){with($){return (mode === 'cook' && !editor)}},"class":"two-up"},"\n    ","\n\n  ",[["button",{"class":"button button-primary","bindtap":"newPhotoNote","hover-class":"tap-hover"},"拍一张","\n    ",[]],["button",{"class":"button button-quiet","bindtap":"addNote","hover-class":"tap-hover"},"写一句","\n  ",[]]]],["view",{"wx:if":function($){with($){return (editor)}},"class":"card pad stack"},"\n    ","\n\n  ",[["text",{"class":"section-title"},function($){with($){return (editor === 'shopping' ? '添加食材' : (editor === 'expense' ? '采购支出' : '过程记录'))}},"\n    ",[]],["block",{"wx:if":function($){with($){return (editor === 'expense')}}},"\n      ","\n    ",[["view",{"class":"field"},"\n        ","\n      ",[["text",{"class":"label"},"实付金额（元）","\n        ",[]],["input",{"class":"input","type":"digit","value":function($){with($){return (form.amount)}},"data-model":"form","data-field":"amount","bindinput":"fieldInput","placeholder":"0.00"},"","\n      ",[]]]],["view",{"class":"field"},"\n        ","\n    ",[["text",{"class":"label"},"店名","\n        ",[]],["input",{"class":"input","maxlength":"48","value":function($){with($){return (form.shop)}},"data-model":"form","data-field":"shop","bindinput":"fieldInput","placeholder":"选填"},"","\n      ",[]]]]]],["block",{"wx:elif":function($){with($){return (editor === 'shopping')}}},"\n      ","\n    ",[["view",{"class":"field"},"\n        ","\n      ",[["text",{"class":"label"},"食材","\n        ",[]],["input",{"class":"input","maxlength":"48","value":function($){with($){return (form.name)}},"data-model":"form","data-field":"name","bindinput":"fieldInput","placeholder":"例如柠檬"},"","\n      ",[]]]],["view",{"class":"field"},"\n        ","\n    ",[["text",{"class":"label"},"用量","\n        ",[]],["input",{"class":"input","maxlength":"32","value":function($){with($){return (form.amount)}},"data-model":"form","data-field":"amount","bindinput":"fieldInput","placeholder":"选填"},"","\n      ",[]]]]]],["textarea",{"wx:else":"","class":"textarea textarea-short","maxlength":"1500","value":function($){with($){return (form.text)}},"data-model":"form","data-field":"text","bindinput":"fieldInput","placeholder":"写下这次做了什么，或下次想怎么调"},"","\n\n    ",[]],["block",{"wx:if":function($){with($){return (editor !== 'shopping')}}},"\n      ","\n\n    ",[["view",{"wx:if":function($){with($){return (form.photo)}},"class":"stack compact"},"\n        ","\n      ",[["image",{"class":"timeline-image","mode":"aspectFill","src":function($){with($){return (form.photo)}},"data-photo":function($){with($){return (form.photo)}},"bindtap":"previewPhoto"},"","\n        ",[]],["view",{"class":"row"},"\n          ","\n      ",[["button",{"class":"button button-small button-quiet grow","bindtap":"pickPhoto","data-model":"form"},"更换照片","\n          ",[]],["button",{"class":"button button-small button-outline","bindtap":"clearPhoto","data-model":"form"},"移除","\n        ",[]]]]]],["view",{"wx:else":"","class":"upload","bindtap":"pickPhoto","data-model":"form","hover-class":"tap-hover"},function($){with($){return (editor === 'expense' ? '＋ 添加小票照片' : '＋ 添加过程照片')}},"\n    ",[]]]],["view",{"class":"row"},"\n      ","\n    ",[["button",{"class":"button button-quiet","bindtap":"cancelEdit","disabled":function($){with($){return (saving)}}},"取消","\n      ",[]],["button",{"class":"button button-primary grow","bindtap":"saveEntry","disabled":function($){with($){return (saving)}},"loading":function($){with($){return (saving)}}},"保存","\n    ",[]]]],["button",{"wx:if":function($){with($){return (form.id)}},"class":"button button-small button-danger","bindtap":"deleteEntry","disabled":function($){with($){return (saving)}}},"删除记录","\n  ",[]]]],["block",{"wx:if":function($){with($){return (mode === 'shop')}}},"\n    ","\n\n  ",[["view",{"class":"row between"},"\n      ","\n    ",[["text",{"class":"section-title"},"采购清单","\n      ",[]],["button",{"wx:if":function($){with($){return (!editor)}},"class":"button button-small button-quiet","bindtap":"addShopping"},"＋ 食材","\n    ",[]]]],["view",{"class":"card"},"\n      ","\n    ",[["view",{"wx:for":function($){with($){return (shopping)}},"wx:key":"id","class":"action-row","bindtap":"changeShoppingStatus","data-id":function($){with($){return (item.id)}},"hover-class":"tap-hover"},"\n        ","\n      ",[["view",{"class":"grow stack compact"},"\n          ","\n        ",[["text",{"class":"label"},function($){with($){return (item.name)}},"",[]],["text",{"wx:if":function($){with($){return (item.amount)}},"class":"small muted"},function($){with($){return (item.amount)}},"\n        ",[]]]],["text",{"class":function($){with($){return ("pill " + String((item.status === 'at-home' ? 'pill-blue' : (item.status === 'todo' ? 'pill-neutral' : '')) ?? '') + "")}}},function($){with($){return (item.statusLabel)}},"\n      ",[]]]],["view",{"wx:if":function($){with($){return (!shopping.length)}},"class":"empty-text muted"},"选好菜谱后带入食材，也可以手动加。","\n    ",[]]]],["text",{"class":"section-title"},"支出记录","\n    ",[]],["view",{"class":"card"},"\n      ","\n  ",[["view",{"wx:for":function($){with($){return (expenses)}},"wx:key":"id","class":"action-row","bindtap":"editEntry","data-id":function($){with($){return (item.id)}},"data-kind":"expense","hover-class":"tap-hover"},"\n        ","\n      ",[["image",{"wx:if":function($){with($){return (item.photo)}},"class":"expense-thumb","mode":"aspectFill","src":function($){with($){return (item.photo)}}},"","\n        ",[]],["view",{"class":"grow stack compact"},"\n          ","\n        ",[["text",{"class":"label"},function($){with($){return ("¥" + String((item.amount) ?? '') + "")}},"\n          ",[]],["text",{"class":"small muted"},function($){with($){return (item.day)}},"\n        ",[["text",{"wx:if":function($){with($){return (item.shop)}}},function($){with($){return (" · " + String((item.shop) ?? '') + "")}},"",[]]]]]],["text",{"class":"chevron"},"","\n      ",[]]]],["view",{"wx:if":function($){with($){return (!expenses.length)}},"class":"empty-text muted"},"结账后，记下实际花了多少。","\n    ",[]]]]]],["block",{"wx:if":function($){with($){return (mode === 'cook')}}},"\n    ","\n\n  ",[["view",{"wx:if":function($){with($){return (notes.length)}},"class":"timeline"},"\n      ","\n    ",[["view",{"wx:for":function($){with($){return (notes)}},"wx:key":"id","class":"timeline-item"},"\n        ","\n    ",[["view",{"class":"card pad stack compact"},"\n          ","\n      ",[["view",{"class":"row between"},"\n            ","\n          ",[["text",{"class":"small muted"},function($){with($){return ("" + String((item.day) ?? '') + " · " + String((item.time) ?? '') + "")}},"\n            ",[]],["button",{"class":"button button-small button-quiet","bindtap":"editEntry","data-id":function($){with($){return (item.id)}},"data-kind":"note"},"编辑","\n          ",[]]]],["text",{"wx:if":function($){with($){return (item.text)}},"class":"note"},function($){with($){return (item.text)}},"\n          ",[]],["image",{"wx:if":function($){with($){return (item.photo)}},"class":"timeline-image","mode":"aspectFill","src":function($){with($){return (item.photo)}},"data-photo":function($){with($){return (item.photo)}},"bindtap":"previewPhoto"},"","\n        ",[]]]]]]]],["view",{"wx:elif":function($){with($){return (!editor)}},"class":"card empty-text"},"\n      ","\n  ",[["text",{"class":"section-title"},"记下这次怎么做的","\n      ",[]],["text",{"class":"body muted"},"拍一张腌制或出炉的照片，或者记一句下次想调整的地方。","\n    ",[]]]]]],["block",{"wx:if":function($){with($){return (mode === 'batch' && current.recipe)}}},"\n    ","\n",[["view",{"class":"card pad stack"},"\n      ","\n    ",[["text",{"class":"section-title"},function($){with($){return ("计划 " + String((current.slots.length) ?? '') + " 盒")}},"\n      ",[]],["view",{"wx:for":function($){with($){return (storageFields)}},"wx:key":"field","class":"row between counter-row"},"\n        ","\n      ",[["text",{"class":"label"},function($){with($){return (item.label)}},"\n        ",[]],["template",{"is":"stepper","data":function($){with($){return (({field: item.field, label: item.label, value: batch[item.field]}))}}},"","\n      ",[]]]],["text",{"wx:if":function($){with($){return (difference > 0)}},"class":"small muted"},function($){with($){return ("还有 " + String((difference) ?? '') + " 盒待填写存放方式")}},"\n      ",[]],["text",{"wx:elif":function($){with($){return (0 > difference)}},"class":"small hint-error"},"存放盒数超过实际盒数","\n    ",[]]]],["view",{"class":"card pad stack"},"\n      ","\n    ",[["text",{"class":"section-title"},"成品照","\n      ",[]],["block",{"wx:if":function($){with($){return (batch.photo)}}},"\n        ","\n      ",[["image",{"class":"cover card","mode":"aspectFill","src":function($){with($){return (batch.photo)}},"data-photo":function($){with($){return (batch.photo)}},"bindtap":"previewPhoto"},"","\n        ",[]],["view",{"class":"row"},"\n          ","\n      ",[["button",{"class":"button button-small button-quiet grow","bindtap":"pickPhoto","data-model":"batch"},"更换照片","\n          ",[]],["button",{"class":"button button-small button-outline","bindtap":"clearPhoto","data-model":"batch"},"移除","\n        ",[]]]]]],["view",{"wx:else":"","class":"upload","bindtap":"pickPhoto","data-model":"batch","hover-class":"tap-hover"},"＋ 拍成品","\n    ",[]]]],["view",{"class":"card"},"\n      ","\n    ",[["view",{"class":"action-row","bindtap":"toggleNutrition","hover-class":"tap-hover"},"\n        ","\n      ",[["text",{"class":"grow label"},"营养选填","",[]],["text",{"class":function($){with($){return ("chevron " + String((nutritionOpen ? 'chevron-down' : '') ?? '') + "")}}},"","\n      ",[]]]],["view",{"wx:if":function($){with($){return (nutritionOpen)}},"class":"pad divider stack"},"\n        ","\n    ",[["view",{"class":"field"},"\n          ","\n        ",[["text",{"class":"label"},"每盒重量（g）","\n          ",[]],["input",{"class":"input","type":"digit","value":function($){with($){return (batch.weight)}},"data-model":"batch","data-field":"weight","bindinput":"fieldInput","placeholder":"选填"},"","\n        ",[]]]],["view",{"class":"field"},"\n          ","\n        ",[["text",{"class":"label"},"每盒热量（kcal）","\n          ",[]],["input",{"class":"input","type":"digit","value":function($){with($){return (batch.calories)}},"data-model":"batch","data-field":"calories","bindinput":"fieldInput","placeholder":"选填"},"","\n        ",[]]]],["view",{"class":"field"},"\n          ","\n      ",[["text",{"class":"label"},"每盒蛋白质（g）","\n          ",[]],["input",{"class":"input","type":"digit","value":function($){with($){return (batch.protein)}},"data-model":"batch","data-field":"protein","bindinput":"fieldInput","placeholder":"选填"},"","\n        ",[]]]]]]]],["button",{"class":"button button-primary","bindtap":"saveBatch","disabled":function($){with($){return (saving || difference !== 0 || !batch.count)}},"loading":function($){with($){return (saving)}},"hover-class":"tap-hover"},function($){with($){return ("保存 " + String((batch.count) ?? '') + " 盒")}},"\n  ",[]]]]]]]],"pages/review/index":["root",{},"","",[["import",{"src":"../../templates/shared.wxml"},"","\n",[]],["view",{"wx:if":function($){with($){return (current)}},"class":"screen stack"},"\n  ","\n",[["template",{"is":"week-switch","data":function($){with($){return (({label: current.label}))}}},"","\n  ",[]],["picker",{"wx:if":function($){with($){return (weeks.length > 1)}},"range":function($){with($){return (weeks)}},"range-key":"label","value":function($){with($){return (0 > weekIndex ? 0 : weekIndex)}},"bindchange":"jumpWeek"},"\n    ","\n  ",[["view",{"class":"row between card action-row"},"\n      ","\n  ",[["text",{"class":"label"},"跳到有记录的周","",[]],["text",{"class":"chevron chevron-down"},"","\n    ",[]]]]]],["view",{"wx:if":function($){with($){return (current.recipe || hasContent)}},"class":"card"},"\n    ","\n  ",[["view",{"wx:if":function($){with($){return (current.batch && current.batch.photo)}},"class":"relative"},"\n      ","\n    ",[["image",{"class":"cover cover-tall","mode":"aspectFill","src":function($){with($){return (current.batch.photo)}},"bindtap":"previewPhoto","data-photo":function($){with($){return (current.batch.photo)}}},"","\n      ",[]],["text",{"class":"caption"},"本周成品","\n    ",[]]]],["view",{"class":"pad stack"},"\n      ","\n  ",[["text",{"class":"title"},function($){with($){return (current.recipe ? current.recipe.title : '这周的记录')}},"\n      ",[]],["view",{"class":"stats"},"\n        ","\n      ",[["view",{"class":"stat"},"","\n        ",[["text",{"class":"small muted"},"计划","",[]],["view",{"class":"stat-value"},function($){with($){return ("" + String((current.slots.length) ?? '') + " 盒")}},"",[]]]],["view",{"class":"stat"},"","\n        ",[["text",{"class":"small muted"},"实做","",[]],["view",{"class":"stat-value"},function($){with($){return ("" + String((current.batch ? current.batch.count : 0) ?? '') + " 盒")}},"",[]]]],["view",{"class":"stat"},"","\n        ",[["text",{"class":"small muted"},"已吃","",[]],["view",{"class":"stat-value"},function($){with($){return ("" + String((current.eaten.length) ?? '') + " 盒")}},"",[]]]],["view",{"class":"stat"},"","\n      ",[["text",{"class":"small muted"},"支出","",[]],["view",{"class":"stat-value"},function($){with($){return ("¥" + String((current.spent) ?? '') + "")}},"",[]]]]]],["view",{"wx:if":function($){with($){return (nutrition.length)}},"class":"divider nutrition-summary"},"\n        ","\n    ",[["text",{"class":"small muted"},"每盒","\n        ",[]],["text",{"wx:for":function($){with($){return (nutrition)}},"wx:key":"key","class":"pill pill-neutral"},function($){with($){return ("" + String((item.label) ?? '') + " " + String((item.value) ?? '') + " " + String((item.unit) ?? '') + "")}},"\n      ",[]]]]]]]],["view",{"wx:else":"","class":"card empty-text"},"\n    ","\n  ",[["text",{"class":"section-title"},"这周还没有记录","\n    ",[]],["button",{"class":"button button-quiet","bindtap":"openPrep","hover-class":"tap-hover"},"去备餐","\n  ",[]]]],["button",{"wx:if":function($){with($){return (current.recipe)}},"class":"button button-primary","bindtap":"repeat","hover-class":"tap-hover"},"再做一次","\n  ",[]],["view",{"wx:if":function($){with($){return (notes.length)}},"class":"stack"},"\n    ","\n",[["text",{"class":"section-title"},"烹饪记录","\n    ",[]],["view",{"class":"timeline"},"\n      ","\n  ",[["view",{"wx:for":function($){with($){return (notes)}},"wx:key":"id","class":"timeline-item"},"\n        ","\n    ",[["view",{"class":"card pad stack compact"},"\n          ","\n      ",[["text",{"class":"small muted"},function($){with($){return ("" + String((item.day) ?? '') + " · " + String((item.time) ?? '') + "")}},"\n          ",[]],["text",{"wx:if":function($){with($){return (item.text)}},"class":"note"},function($){with($){return (item.text)}},"\n          ",[]],["image",{"wx:if":function($){with($){return (item.photo)}},"class":"timeline-image","mode":"aspectFill","src":function($){with($){return (item.photo)}},"data-photo":function($){with($){return (item.photo)}},"bindtap":"previewPhoto"},"","\n        ",[]]]]]]]]]]]]]],"pages/schedule/index":["root",{},"","",[["import",{"src":"../../templates/shared.wxml"},"","\n",[]],["view",{"wx:if":function($){with($){return (recipe)}},"class":"screen stack"},"\n  ","\n",[["view",{"class":"card pad row"},"\n    ","\n  ",[["image",{"wx:if":function($){with($){return (recipe.photo)}},"class":"thumb thumb-mini","src":function($){with($){return (recipe.photo)}},"mode":"aspectFill"},"","\n    ",[]],["view",{"wx:else":"","class":"thumb thumb-mini cover-empty"},"","\n    ",[["view",{"class":"plate-mark"},"","",[]]]],["view",{"class":"grow stack compact"},"\n      ","\n  ",[["text",{"class":"title"},function($){with($){return (recipe.title)}},"\n      ",[]],["text",{"class":"small muted"},function($){with($){return ("一道菜谱 · 计划 " + String((total) ?? '') + " 盒")}},"\n    ",[]]]]]],["view",{"wx:if":function($){with($){return (editing)}},"class":"week-date"},function($){with($){return (label)}},"\n  ",[]],["template",{"wx:else":"","is":"week-switch","data":function($){with($){return (({label: label}))}}},"","\n  ",[]],["view",{"wx:if":function($){with($){return (locked)}},"class":"card pad small hint-error"},"这周已分装。请选择其他备餐周。","\n  ",[]],["view",{"wx:elif":function($){with($){return (existingTitle && !editing)}},"class":"card pad small muted"},function($){with($){return ("这周已安排 " + String((existingTitle) ?? '') + "")}},"\n  ",[]],["view",{"class":"card"},"\n    ","\n  ",[["view",{"wx:for":function($){with($){return (rows)}},"wx:key":"date","class":"slot-row"},"\n      ","\n  ",[["view",{"class":"slot-day"},"\n        ","\n      ",[["text",{"class":"label"},function($){with($){return (item.label)}},"\n        ",[]],["text",{"class":"small muted"},function($){with($){return ("　" + String((item.short) ?? '') + "")}},"\n      ",[]]]],["button",{"class":function($){with($){return ("slot-choice " + String((item.lunch ? 'slot-choice-active' : '') ?? '') + "")}},"bindtap":"toggleMeal","data-date":function($){with($){return (item.date)}},"data-meal":"lunch","aria-label":function($){with($){return ("" + String((item.label) ?? '') + "午餐")}}},function($){with($){return (item.lunch ? '✓ 午餐' : '午餐')}},"\n      ",[]],["button",{"class":function($){with($){return ("slot-choice " + String((item.dinner ? 'slot-choice-active' : '') ?? '') + "")}},"bindtap":"toggleMeal","data-date":function($){with($){return (item.date)}},"data-meal":"dinner","aria-label":function($){with($){return ("" + String((item.label) ?? '') + "晚餐")}}},function($){with($){return (item.dinner ? '✓ 晚餐' : '晚餐')}},"\n    ",[]]]]]],["button",{"class":"button button-primary","bindtap":"save","loading":function($){with($){return (saving)}},"disabled":function($){with($){return (saving || locked || !total)}},"hover-class":"tap-hover"},function($){with($){return ("确认排餐 · " + String((total) ?? '') + " 盒")}},"\n",[]]]]]],"pages/today/index":["root",{},"","",[["view",{"class":"screen stack"},"\n  ","\n",[["text",{"class":"small muted"},function($){with($){return (dateLabel)}},"\n  ",[]],["block",{"wx:if":function($){with($){return (slots.length)}}},"\n    ","\n  ",[["view",{"class":"heading"},function($){with($){return (mealTitle)}},"\n    ",[]],["view",{"class":"card"},"\n      ","\n    ",[["view",{"wx:if":function($){with($){return (photo)}},"class":"relative"},"\n        ","\n      ",[["image",{"class":"cover cover-tall","mode":"aspectFill","src":function($){with($){return (photo)}},"data-photo":function($){with($){return (photo)}},"bindtap":"previewPhoto"},"","\n        ",[]],["text",{"wx:if":function($){with($){return (isReference)}},"class":"caption"},"菜谱参考图","\n      ",[]]]],["view",{"class":"pad stack"},"\n        ","\n    ",[["view",{"class":"row between","bindtap":"viewRecipe","hover-class":"tap-hover"},"\n          ","\n        ",[["text",{"class":"title grow"},function($){with($){return (recipe.title)}},"\n          ",[]],["text",{"class":"chevron"},"","\n        ",[]]]],["view",{"wx:if":function($){with($){return (stock.total)}},"class":"row wrap-stock"},"\n          ","\n      ",[["text",{"class":"label"},function($){with($){return ("剩 " + String((stock.total) ?? '') + " 盒")}},"\n          ",[]],["text",{"class":"pill pill-blue"},function($){with($){return ("冷藏 " + String((stock.chilled) ?? '') + "")}},"\n          ",[]],["text",{"class":"pill pill-blue"},function($){with($){return ("冷冻 " + String((stock.frozen) ?? '') + "")}},"\n        ",[]]]]]]]],["view",{"wx:for":function($){with($){return (slots)}},"wx:key":"meal","class":"stack compact"},"\n      ","\n  ",[["text",{"wx:if":function($){with($){return (slots.length > 1)}},"class":"label"},function($){with($){return (item.label)}},"\n      ",[]],["view",{"wx:if":function($){with($){return (item.eaten)}},"class":"card pad row between"},"\n        ","\n      ",[["text",{"class":"status-line"},"已吃","\n        ",[]],["button",{"class":"button button-small button-quiet","bindtap":"undo","data-meal":function($){with($){return (item.meal)}}},"撤回","\n      ",[]]]],["button",{"wx:elif":function($){with($){return (stock.total)}},"class":"button button-primary","bindtap":"eat","data-meal":function($){with($){return (item.meal)}},"disabled":function($){with($){return (busy)}},"hover-class":"tap-hover"},"记为已吃","\n      ",[]],["view",{"wx:else":"","class":"card pad muted"},function($){with($){return (unready)}},"\n    ",[]]]]]],["block",{"wx:elif":function($){with($){return (next)}}},"\n    ","\n  ",[["view",{"class":"heading"},"下次吃什么","\n    ",[]],["view",{"class":"card","bindtap":"openPlan","data-start":function($){with($){return (next.start)}},"hover-class":"tap-hover"},"\n      ","\n  ",[["view",{"wx:if":function($){with($){return (next.photo)}},"class":"relative"},"\n        ","\n      ",[["image",{"class":"cover cover-tall","mode":"aspectFill","src":function($){with($){return (next.photo)}}},"","\n        ",[]],["text",{"class":"caption"},"菜谱参考图","\n      ",[]]]],["view",{"class":"pad row between"},"\n        ","\n    ",[["view",{"class":"grow stack compact"},"\n          ","\n        ",[["text",{"class":"small muted"},function($){with($){return ("" + String((next.date) ?? '') + " · " + String((next.meal) ?? '') + "")}},"\n          ",[]],["text",{"class":"title"},function($){with($){return (next.recipe)}},"\n        ",[]]]],["text",{"class":"chevron"},"","\n      ",[]]]]]]]],["block",{"wx:else":""},"\n    ","\n",[["view",{"class":"heading"},"下周吃什么？","\n    ",[]],["view",{"class":"card"},"\n      ","\n  ",[["image",{"class":"cover cover-tall","mode":"aspectFill","src":"/assets/welcome.jpg"},"","\n      ",[]],["view",{"class":"pad stack"},"\n        ","\n    ",[["text",{"class":"title"},"存下想做的菜","\n        ",[]],["text",{"class":"body muted"},"选一道喜欢的菜谱，一次做好几盒，下周慢慢吃。","\n        ",[]],["button",{"class":"button button-primary","bindtap":"openRecipes","hover-class":"tap-hover"},"去菜谱","\n      ",[]]]]]]]]]]]],"templates/shared":["root",{},"","",[["template",{"name":"week-switch"},"\n  ","\n\n",[["view",{"class":"week-switch"},"\n    ","\n",[["button",{"aria-label":"上一周","hover-class":"tap-hover","bindtap":"changeWeek","data-step":"-1"},"","\n    ",[["text",{"class":"chevron chevron-left"},"","",[]]]],["text",{"class":"week-date"},function($){with($){return (label)}},"\n    ",[]],["button",{"aria-label":"下一周","hover-class":"tap-hover","bindtap":"changeWeek","data-step":"1"},"","\n  ",[["text",{"class":"chevron"},"","",[]]]]]]]],["template",{"name":"stepper"},"\n  ","\n",[["view",{"class":"stepper"},"\n    ","\n",[["button",{"aria-label":function($){with($){return ("减少" + String((label) ?? '') + "")}},"disabled":function($){with($){return (0 >= value)}},"bindtap":"step","data-field":function($){with($){return (field)}},"data-step":"-1"},"−","\n    ",[]],["text",{"class":"stepper-value"},function($){with($){return (value)}},"\n    ",[]],["button",{"aria-label":function($){with($){return ("增加" + String((label) ?? '') + "")}},"disabled":function($){with($){return (value >= 99)}},"bindtap":"step","data-field":function($){with($){return (field)}},"data-step":"1"},"＋","\n  ",[]]]]]]]]}};
