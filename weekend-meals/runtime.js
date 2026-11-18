'use strict';

(() => {
  const source = window.mealSource;
  const photos = window.mealPhotos;
  const manifest = source.app;
  const shell = document.querySelector('#shell');
  const header = document.querySelector('#header');
  const view = document.querySelector('#page');
  const tabs = document.querySelector('#tabs');
  const dialog = document.querySelector('#dialog');
  const imagePicker = document.querySelector('#images');
  const toast = document.querySelector('#toast');
  const definitions = new Map();
  const modules = new Map();
  const renderedPhotos = new WeakMap();
  const templates = Object.fromEntries(source.templates['templates/shared'][4]
    .map(template => [template[1].name, template]));
  const tabPaths = new Set(manifest.tabBar.list.map(tab => tab.pagePath));
  const initialRoute = '/' + manifest.pages[0];
  const storagePrefix = 'weekend-meals:web:';
  const interactive = ['input', 'textarea', 'select', 'button'];
  let registering = '';
  let app;
  let pages = [];
  let scheduled = false;
  let toastTimer;
  let shellKey = '';

  window.App = definition => { app = definition; };
  window.Page = definition => { definitions.set(registering, definition); };
  window.getApp = () => app;
  window.getCurrentPages = () => pages.slice();

  function sourcePath(parent, dependency) {
    if (!dependency.startsWith('.')) return dependency;
    const segments = parent.split('/').slice(0, -1);
    for (const part of dependency.split('/')) {
      if (part === '..') segments.pop();
      else if (part !== '.') segments.push(part);
    }
    return segments.join('/');
  }

  function load(key) {
    if (modules.has(key)) return modules.get(key).exports;
    const module = { exports: {} };
    modules.set(key, module);
    const previous = registering;
    registering = key;
    try {
      source.modules[key](dependency => load(sourcePath(key, dependency)), module, module.exports);
      return module.exports;
    } finally {
      registering = previous;
    }
  }

  function getActive() {
    return pages.at(-1);
  }

  function commitRoute(urls, mode, depth = 0) {
    const [path] = urls.at(-1).split('?');
    if (!manifest.pages.includes(path.slice(1))) return;
    if (mode) {
      const method = mode === 'push' ? 'pushState' : 'replaceState';
      history[method]({ weekendMeals: urls, depth }, '', '#' + urls.at(-1).slice(1));
    }
    const previous = getActive();
    previous?.onHide?.();
    const instances = urls.map((url, index) =>
      pages[index]?.url === url ? pages[index] : newPage(url));
    pages = instances;
    const active = getActive();
    if (!active.loaded) {
      active.loaded = true;
      active.onLoad?.(Object.fromEntries(new URLSearchParams(active.query)));
    }
    if (active !== getActive()) return;
    active.onShow?.();
    if (previous !== active) window.scrollTo(0, 0);
    requestRender();
  }

  function newPage(url) {
    const [path, query = ''] = url.slice(1).split('?');
    load(path);
    const definition = definitions.get(path);
    return {
      ...definition,
      route: path,
      query,
      url,
      title: source.titles[path],
      data: JSON.parse(JSON.stringify(definition.data)),
      setData(values) {
        for (const [key, value] of Object.entries(values)) {
          const [parent, child] = key.split('.');
          if (child) this.data[parent][child] = value;
          else this.data[key] = value;
        }
        requestRender();
      }
    };
  }

  function restoreRoute() {
    const stored = history.state;
    const hash = location.hash.slice(1);
    if (stored?.weekendMeals?.at(-1) === '/' + hash) {
      commitRoute(stored.weekendMeals);
      return;
    }
    const url = manifest.pages.includes(hash.split('?')[0]) ? '/' + hash : initialRoute;
    const paths = tabPaths.has(url.slice(1).split('?')[0]) ? [url] : [initialRoute, url];
    commitRoute(paths, 'replace');
  }

  function back() {
    if (pages.length < 2) return;
    if (history.state?.depth > 0) history.back();
    else commitRoute(pages.slice(0, -1).map(page => page.url), 'replace');
  }

  function notify(title, duration = 2300) {
    clearTimeout(toastTimer);
    toast.textContent = title;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, duration);
  }

  function button(text, className) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function showDialog(title, body, actions, dismiss) {
    const content = document.createElement('div');
    content.className = 'stack';
    if (title) {
      const heading = document.createElement('strong');
      heading.id = 'dialog-heading';
      heading.className = 'section-title';
      heading.textContent = title;
      content.append(heading);
      dialog.setAttribute('aria-labelledby', heading.id);
    } else {
      dialog.removeAttribute('aria-labelledby');
      dialog.setAttribute('aria-label', '查看照片');
    }
    if (typeof body === 'string' && body) {
      const description = document.createElement('div');
      description.className = 'body';
      description.textContent = body;
      content.append(description);
    } else if (body) content.append(body);
    let completed = false;
    for (const [label, action, color] of actions) {
      const control = button(label, 'button button-' + color);
      control.onclick = () => {
        completed = true;
        dialog.close();
        action();
      };
      content.append(control);
    }
    dialog.onclose = () => { if (!completed) dismiss?.(); };
    dialog.replaceChildren(content);
    dialog.showModal();
  }

  window.wx = {
    env: { USER_DATA_PATH: photos.root },
    getStorageSync(key) {
      const value = localStorage.getItem(storagePrefix + key);
      return value ? JSON.parse(value) : '';
    },
    setStorageSync(key, value) {
      localStorage.setItem(storagePrefix + key, JSON.stringify(value));
    },
    showToast({ title, duration }) { notify(title, duration); },
    setNavigationBarTitle({ title }) {
      getActive().title = title;
      requestRender();
    },
    switchTab({ url }) { commitRoute([url], 'replace'); },
    navigateTo({ url }) {
      commitRoute([...pages.map(page => page.url), url], 'push', (history.state?.depth || 0) + 1);
    },
    redirectTo({ url }) {
      commitRoute([...pages.slice(0, -1).map(page => page.url), url], 'replace', history.state?.depth || 0);
    },
    navigateBack: back,
    pageScrollTo({ scrollTop }) { window.scrollTo({ top: scrollTop, behavior: 'smooth' }); },
    showModal({ title, content, confirmText = '确认', success }) {
      showDialog(title, content, [
        [confirmText, () => success({ confirm: true }), 'primary'],
        ['取消', () => success({ confirm: false }), 'quiet']
      ], () => success({ confirm: false }));
    },
    showActionSheet({ alertText, itemList, success, complete }) {
      const finish = () => complete?.();
      const options = itemList.map((label, tapIndex) =>
        [label, () => { success({ tapIndex }); finish(); }, 'outline']);
      showDialog(alertText || '选择状态', '', [...options, ['取消', finish, 'quiet']], finish);
    },
    chooseMedia({ success, fail }) {
      imagePicker.value = '';
      imagePicker.oncancel = () => fail({ errMsg: 'chooseMedia:fail cancel' });
      imagePicker.onchange = async () => {
        const file = imagePicker.files[0];
        if (!file) return fail({ errMsg: 'chooseMedia:fail cancel' });
        try {
          const tempFilePath = await photos.pick(file);
          success({ tempFiles: [{ tempFilePath }] });
        } catch {
          fail({ errMsg: 'chooseMedia:fail decode' });
        }
      };
      imagePicker.click();
    },
    getFileSystemManager() {
      return {
        copyFile({ srcPath, destPath, success, fail }) {
          photos.copy(srcPath, destPath).then(success, fail);
        },
        unlink({ filePath, fail }) { photos.remove(filePath).catch(fail); }
      };
    },
    async previewImage({ current }) {
      try {
        const url = await photos.resolve(current);
        if (!url) return;
        const image = document.createElement('img');
        image.alt = '';
        image.src = url;
        image.className = 'photo-preview';
        showDialog('', image, [['关闭', () => {}, 'quiet']]);
      } catch {
        notify('暂时无法打开这张照片');
      }
    }
  };

  function value(binding, scope) {
    if (typeof binding !== 'function') return binding;
    try {
      return binding(scope);
    } catch (error) {
      if (error instanceof ReferenceError || error instanceof TypeError) return undefined;
      throw error;
    }
  }

  function appendText(parent, content) {
    if (content != null && String(content).trim()) parent.append(String(content));
  }

  function appendChildren(parent, children, scope) {
    let matched = false;
    for (const node of children) {
      const [, attrs, , tail] = node;
      if ('wx:if' in attrs) {
        matched = Boolean(value(attrs['wx:if'], scope));
        if (!matched) continue;
      } else if ('wx:elif' in attrs) {
        if (matched || !value(attrs['wx:elif'], scope)) continue;
        matched = true;
      } else if ('wx:else' in attrs && matched) continue;
      parent.append(renderNode(node, scope));
      appendText(parent, value(tail, scope));
    }
  }

  function picker(attrs, scope) {
    const select = document.createElement('select');
    select.className = 'input';
    select.dataset.change = attrs.bindchange;
    select.setAttribute('aria-label', '跳到有记录的周');
    const options = value(attrs.range, scope) || [];
    const selected = value(attrs.value, scope);
    options.forEach((item, index) => {
      const label = attrs['range-key'] ? item[attrs['range-key']] : item;
      const option = new Option(label, String(index), false, index === selected);
      select.append(option);
    });
    return select;
  }

  function renderNode([tag, attrs, text, tail, children], scope, key) {
    if (attrs['wx:for']) {
      const group = document.createDocumentFragment();
      const entries = value(attrs['wx:for'], scope) || [];
      entries.forEach((item, index) => group.append(renderNode(
        [tag, { ...attrs, 'wx:for': undefined }, text, tail, children], { ...scope, item, index },
        item[attrs['wx:key']] ?? index
      )));
      return group;
    }
    if (tag === 'template' && attrs.is) return renderNode(templates[attrs.is], value(attrs.data, scope));
    if (tag === 'import') return document.createDocumentFragment();
    if (tag === 'picker') return picker(attrs, scope);
    const element = ['root', 'block', 'template'].includes(tag)
      ? document.createDocumentFragment()
      : document.createElement({ view: 'div', text: 'span', image: 'img' }[tag] || tag);

    if (element instanceof HTMLElement) {
      if (key != null) element.dataset.key = String(key);
      for (const name of ['class', 'placeholder', 'maxlength', 'aria-label']) {
        const attr = value(attrs[name], scope);
        if (attr != null) element.setAttribute(name, attr);
      }
      for (const [name, binding] of Object.entries(attrs)) {
        if (name.startsWith('data-')) element.setAttribute(name, value(binding, scope) ?? '');
      }
      if (tag === 'button') {
        element.type = 'button';
        element.disabled = Boolean(value(attrs.disabled, scope));
      }
      if (tag === 'input' && attrs.type === 'digit') element.inputMode = 'decimal';
      if (['input', 'textarea'].includes(tag)) element.value = value(attrs.value, scope) ?? '';
      if (tag === 'image') {
        element.alt = '';
        element.dataset.source = value(attrs.src, scope) ?? '';
      }
      if (attrs.bindtap) {
        element.dataset.tap = attrs.bindtap;
        if (!interactive.includes(tag)) {
          element.tabIndex = 0;
          element.setAttribute('role', 'button');
        }
      }
      if (attrs.bindinput) element.dataset.input = attrs.bindinput;
    }
    appendText(element, value(text, scope));
    appendChildren(element, children, scope);
    return element;
  }

  function syncElement(current, next) {
    const nextValue = next.value;
    for (const attribute of [...current.attributes]) {
      if (attribute.name === 'src' && current.tagName === 'IMG') continue;
      if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
    }
    for (const attribute of next.attributes) {
      if (current.getAttribute(attribute.name) !== attribute.value) {
        current.setAttribute(attribute.name, attribute.value);
      }
    }
    syncChildren(current, next);
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(current.tagName) && current.value !== nextValue) {
      current.value = nextValue;
    }
  }

  function syncChildren(current, next) {
    const children = [...next.childNodes];
    for (const [index, wanted] of children.entries()) {
      const actual = current.childNodes[index];
      if (!actual) current.append(wanted);
      else if (actual.nodeName !== wanted.nodeName ||
        actual.nodeType === 1 && actual.dataset.key !== wanted.dataset.key) actual.replaceWith(wanted);
      else if (actual.nodeType === 1) syncElement(actual, wanted);
      else if (actual.nodeValue !== wanted.nodeValue) actual.nodeValue = wanted.nodeValue;
    }
    for (const extra of [...current.childNodes].slice(children.length)) extra.remove();
  }

  function drawChrome(active) {
    const showingTabs = tabPaths.has(active.route);
    const key = [active.title, active.route, pages.length].join('/');
    if (shellKey === key) return;
    shellKey = key;
    shell.classList.toggle('tab-open', showingTabs);
    const buttonBack = pages.length > 1 ? button('', 'web-back') : document.createElement('span');
    if (pages.length > 1) {
      const arrow = document.createElement('span');
      arrow.className = 'chevron chevron-left';
      buttonBack.append(arrow);
      buttonBack.setAttribute('aria-label', '返回');
      buttonBack.onclick = back;
    }
    const title = document.createElement('strong');
    title.textContent = active.title;
    header.replaceChildren(buttonBack, title);
    tabs.hidden = !showingTabs;
    if (!showingTabs) return;
    tabs.replaceChildren(...manifest.tabBar.list.map(tab => {
      const activeTab = active.route === tab.pagePath;
      const link = button(tab.text, 'web-tab');
      const icon = document.createElement('img');
      icon.src = './' + (activeTab ? tab.selectedIconPath : tab.iconPath);
      icon.alt = '';
      link.prepend(icon);
      if (activeTab) link.setAttribute('aria-current', 'page');
      link.onclick = () => {
        if (!activeTab) wx.switchTab({ url: '/' + tab.pagePath });
      };
      return link;
    }));
  }

  function render() {
    const active = getActive();
    if (!active) return;
    drawChrome(active);
    const next = renderNode(source.templates[active.route], active.data);
    // Keep the mounted controls while their data changes, so the mobile keyboard stays open.
    syncChildren(view, next);
    view.querySelectorAll('img[data-source]').forEach(image => {
      const path = image.dataset.source;
      if (renderedPhotos.get(image) === path) return;
      renderedPhotos.set(image, path);
      image.removeAttribute('src');
      if (path) photos.resolve(path).then(url => {
        if (image.dataset.source === path && url) image.src = url;
      }).catch(() => {});
    });
  }

  function requestRender() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      render();
    });
  }

  function eventFor(element) {
    return { currentTarget: { dataset: { ...element.dataset } }, detail: { value: element.value } };
  }

  view.addEventListener('click', event => {
    const element = event.target.closest('[data-tap]');
    if (element && !element.disabled) getActive()[element.dataset.tap]?.(eventFor(element));
  });
  view.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role=button]')) {
      event.preventDefault();
      event.target.click();
    }
  });
  view.addEventListener('input', event => {
    getActive()[event.target.dataset.input]?.(eventFor(event.target));
  });
  view.addEventListener('change', event => {
    getActive()[event.target.dataset.change]?.(eventFor(event.target));
  });
  window.addEventListener('popstate', restoreRoute);
  window.addEventListener('hashchange', () => {
    if (getActive()?.url !== '/' + location.hash.slice(1)) restoreRoute();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) getActive()?.onShow?.();
  });
  load('app');
  restoreRoute();
})();
