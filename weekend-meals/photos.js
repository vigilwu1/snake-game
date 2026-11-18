'use strict';

window.mealPhotos = (() => {
  const root = 'meals-local:';
  const temp = 'meals-preview:';
  const previews = new Map();
  const savedUrls = new Map();
  let database;
  let sequence = 0;

  function connect() {
    if (!database) {
      database = new Promise((resolve, reject) => {
        const request = indexedDB.open('weekend-meals-photos', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('photos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('照片库暂时被占用'));
      }).catch(error => {
        database = undefined;
        throw error;
      });
    }
    return database;
  }

  async function transaction(mode, run) {
    const db = await connect();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('photos', mode);
      const request = run(transaction.objectStore('photos'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error || request.error);
    });
  }

  function assetUrl(path) {
    return new URL('.' + path, location.href).href;
  }

  async function resolve(path) {
    if (!path) return '';
    if (path.startsWith('/assets/')) return assetUrl(path);
    if (path.startsWith(temp)) return previews.get(path)?.url || '';
    if (!path.startsWith(root + '/')) return '';
    if (!savedUrls.has(path)) {
      savedUrls.set(path, transaction('readonly', store => store.get(path))
        .then(blob => blob ? URL.createObjectURL(blob) : '')
        .catch(error => {
          savedUrls.delete(path);
          throw error;
        }));
    }
    return savedUrls.get(path);
  }

  async function compact(file, source) {
    const image = new Image();
    image.src = source;
    await image.decode();
    const scale = Math.min(1, 1440 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.84));
  }

  async function pick(file) {
    const original = URL.createObjectURL(file);
    try {
      const blob = await compact(file, original);
      const path = temp + (++sequence) + '.jpg';
      previews.set(path, { blob, url: URL.createObjectURL(blob) });
      return path;
    } finally {
      URL.revokeObjectURL(original);
    }
  }

  async function copy(from, to) {
    const photo = previews.get(from);
    if (!photo) throw new Error('请重新选择照片');
    await transaction('readwrite', store => store.put(photo.blob, to));
  }

  async function remove(path) {
    await transaction('readwrite', store => store.delete(path));
    const previous = savedUrls.get(path);
    savedUrls.delete(path);
    if (previous) {
      const url = await previous;
      if (url) URL.revokeObjectURL(url);
    }
  }

  return { copy, pick, remove, resolve, root };
})();
