/**
 * repository.js — Single IndexedDB store for board v2 + blobs.
 */
(function () {
  const DB_NAME = 'soundboard-v3';
  const DB_VERSION = 1;
  const META_KEY = 'meta';
  const API_PATH = '/api/soundboard';
  const DEFAULT_BOARD_URL = '/soundboard/boards/default/board.json';
  let dbPromise = null;
  let liveBoard = null;
  let dirty = false;
  let saveTimer = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () { resolve(req.result); };
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      };
    });
    return dbPromise;
  }

  function tx(store, mode) {
    return openDb().then(function (db) {
      return db.transaction(store, mode).objectStore(store);
    });
  }

  function getMeta() {
    return tx('meta', 'readonly').then(function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.get(META_KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function putMeta(board) {
    return tx('meta', 'readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.put(board, META_KEY);
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function putBlob(key, arrayBuffer, mime) {
    return tx('blobs', 'readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.put({ bytes: arrayBuffer, mime: mime || 'application/octet-stream' }, String(key));
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function getBlob(key) {
    return tx('blobs', 'readonly').then(function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.get(String(key));
        req.onsuccess = function () {
          const v = req.result;
          resolve(v && v.bytes ? v.bytes : null);
        };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  function deleteBlob(key) {
    return tx('blobs', 'readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.delete(String(key));
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function clearAll() {
    return openDb().then(function (db) {
      return Promise.all(['meta', 'blobs'].map(function (name) {
        return new Promise(function (resolve, reject) {
          const t = db.transaction(name, 'readwrite');
          t.objectStore(name).clear();
          t.oncomplete = function () { resolve(); };
          t.onerror = function () { reject(t.error); };
        });
      }));
    }).then(function () {
      liveBoard = null;
      dirty = false;
    });
  }

  function getBoard() {
    return liveBoard;
  }

  function setBoard(board, options) {
    const Schema = window.SoundboardSchema;
    liveBoard = Schema ? Schema.normalizeBoard(board) : board;
    const opts = options || {};
    if (opts.markDirty !== false) dirty = true;
    if (opts.save !== false) scheduleSave();
    return liveBoard;
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveNow(); }, 300);
  }

  function setServerStatus(text) {
    const el = document.getElementById('status-line');
    if (el) el.textContent = text || '';
  }

  function saveToServer(board) {
    return fetch(API_PATH, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: board })
    }).then(function (res) {
      if (res.status === 401) {
        const err = new Error('not signed in');
        err.code = 'auth';
        throw err;
      }
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          throw new Error((body && body.error) || 'save failed');
        });
      }
      return res.json();
    });
  }

  function loadFromServer() {
    return fetch(API_PATH, { credentials: 'same-origin', cache: 'no-cache' }).then(function (res) {
      if (res.status === 401) return { unauthorized: true };
      if (!res.ok) throw new Error('soundboard load failed');
      return res.json();
    });
  }

  function saveNow() {
    if (!liveBoard) return Promise.resolve();
    dirty = false;
    const Schema = window.SoundboardSchema;
    const copy = Schema ? Schema.normalizeBoard(liveBoard) : JSON.parse(JSON.stringify(liveBoard));
    copy.updatedAt = new Date().toISOString();
    liveBoard.updatedAt = copy.updatedAt;
    return putMeta(copy).then(function () {
      return saveToServer(copy);
    }).then(function () {
      setServerStatus('Saved on the server.');
    }).catch(function (err) {
      if (err && err.code === 'auth') {
        setServerStatus('Sign in to ClassManager to save the sound board on the server.');
        return;
      }
      dirty = true;
      setServerStatus('Could not save the sound board on the server.');
      console.warn('soundboard server save failed', err);
    });
  }

  function loadBoard() {
    return getMeta().then(function (board) {
      if (board && board.sounds && board.sounds.length) {
        const Schema = window.SoundboardSchema;
        liveBoard = Schema ? Schema.normalizeBoard(board) : board;
        dirty = false;
        return { board: liveBoard, source: 'idb' };
      }
      return null;
    });
  }

  function loadDefaultBoardJson() {
    return fetch(DEFAULT_BOARD_URL, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('default board fetch failed');
        return res.json();
      });
  }

  function mergeMissingFromDefault(savedBoard) {
    const Schema = window.SoundboardSchema;
    return loadDefaultBoardJson().then(function (data) {
      const defaultBoard = Schema ? Schema.normalizeBoard(data) : data;
      const existingIds = new Set((savedBoard.sounds || []).map(function (s) { return String(s.id); }));
      const addedSounds = [];
      (defaultBoard.sounds || []).forEach(function (s) {
        const id = String(s.id);
        if (existingIds.has(id)) return;
        const sound = Schema ? Schema.normalizeSoundV2(s) : s;
        savedBoard.sounds.push(sound);
        existingIds.add(id);
        addedSounds.push(sound);
      });
      if (!addedSounds.length) {
        return { board: savedBoard, source: 'idb', added: 0, addedTitles: [] };
      }
      liveBoard = Schema ? Schema.normalizeBoard(savedBoard) : savedBoard;
      dirty = true;
      return saveNow().then(function () {
        return {
          board: liveBoard,
          source: 'idb+default',
          added: addedSounds.length,
          addedTitles: addedSounds.map(function (s) { return s.title || s.id; })
        };
      });
    });
  }

  function loadDefaultBoard() {
    return loadDefaultBoardJson()
      .then(function (data) {
        const Schema = window.SoundboardSchema;
        const board = Schema ? Schema.normalizeBoard(data) : data;
        liveBoard = board;
        dirty = true;
        return saveNow().then(function () { return { board: liveBoard, source: 'default' }; });
      });
  }

  function adoptServerBoard(board) {
    const Schema = window.SoundboardSchema;
    liveBoard = Schema ? Schema.normalizeBoard(board) : board;
    dirty = false;
    return putMeta(liveBoard).catch(function () { return null; }).then(function () {
      return { board: liveBoard, source: 'server' };
    });
  }

  function loadInitial() {
    return loadFromServer().then(function (remote) {
      if (remote && remote.board && Array.isArray(remote.board.sounds)) {
        return adoptServerBoard(remote.board);
      }
      if (remote && remote.unauthorized) {
        return loadBoard().then(function (saved) {
          if (saved) return saved;
          return loadDefaultBoard();
        });
      }
      return loadDefaultBoard();
    }).catch(function () {
      return loadBoard().then(function (saved) {
        if (saved) return mergeMissingFromDefault(saved.board);
        return loadDefaultBoard();
      });
    });
  }

  function blobKeyForSound(soundId, kind) {
    return kind + ':' + String(soundId);
  }

  function parseBlobRef(ref) {
    const m = String(ref || '').match(/^blob:(audio|image):(.+)$/);
    if (!m) return null;
    return { kind: m[1], soundId: m[2], key: m[1] + ':' + m[2] };
  }

  window.SoundboardRepository = {
    openDb,
    getBoard,
    setBoard,
    scheduleSave,
    saveNow,
    loadInitial,
    loadDefaultBoard,
    putBlob,
    getBlob,
    deleteBlob,
    clearAll,
    blobKeyForSound,
    parseBlobRef
  };
})();
