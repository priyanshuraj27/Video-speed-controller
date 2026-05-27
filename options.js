const DEBUG = false;
const log = (...a) => { if (DEBUG) { try { console.log(...a); } catch (e) {} } };

document.addEventListener('DOMContentLoaded', () => {
  log('[VSC][options] options page loaded');
  const listEl = document.getElementById('list');
  const refreshBtn = document.getElementById('refresh');
  const clearAllBtn = document.getElementById('clearAll');
  const addBlockForm = document.getElementById('addBlockForm');
  const blockInput = document.getElementById('blockInput');
  const blocklistList = document.getElementById('blocklistList');
  const blocklistStatus = document.getElementById('blocklistStatus');
  const PREFIX = 'vsc_speed_';
  const BLOCKLIST_KEY = 'vsc_blocklist';

  let blocklist = [];

  function flashStatus(msg) {
    blocklistStatus.textContent = msg;
    setTimeout(() => { blocklistStatus.textContent = ''; }, 1800);
  }

  function renderBlocklist() {
    blocklistList.replaceChildren();
    if (!blocklist.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No blocked patterns yet.';
      blocklistList.appendChild(li);
      return;
    }
    blocklist.forEach((pattern, idx) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.className = 'pattern';
      span.textContent = pattern;
      const del = document.createElement('button');
      del.className = 'del-btn';
      del.type = 'button';
      del.textContent = '×';
      del.setAttribute('aria-label', `Remove ${pattern}`);
      del.addEventListener('click', () => removePattern(idx));
      li.appendChild(span);
      li.appendChild(del);
      blocklistList.appendChild(li);
    });
  }

  function persistBlocklist(after) {
    chrome.storage.local.set({ [BLOCKLIST_KEY]: blocklist }, () => {
      log('[VSC][options] blocklist saved', blocklist.length, 'entries');
      if (typeof after === 'function') after();
    });
  }

  function addPattern(raw) {
    const p = (raw || '').trim();
    if (!p) return;
    if (blocklist.includes(p)) {
      flashStatus('Already in list');
      return;
    }
    blocklist.push(p);
    renderBlocklist();
    persistBlocklist(() => flashStatus('Added'));
  }

  function removePattern(idx) {
    if (idx < 0 || idx >= blocklist.length) return;
    blocklist.splice(idx, 1);
    renderBlocklist();
    persistBlocklist(() => flashStatus('Removed'));
  }

  function loadBlocklist() {
    chrome.storage.local.get(BLOCKLIST_KEY, (result) => {
      blocklist = (result && Array.isArray(result[BLOCKLIST_KEY])) ? result[BLOCKLIST_KEY].slice() : [];
      renderBlocklist();
    });
  }

  addBlockForm.addEventListener('submit', (e) => {
    e.preventDefault();
    addPattern(blockInput.value);
    blockInput.value = '';
    blockInput.focus();
  });

  loadBlocklist();

  function render(items) {
    listEl.replaceChildren();
    const keys = Object.keys(items).filter(k => k.startsWith(PREFIX));
    if (!keys.length) {
      log('[VSC][options] no saved speeds');
      const p = document.createElement('p');
      p.textContent = 'No saved speeds found.';
      listEl.appendChild(p);
      return;
    }
    const ul = document.createElement('ul');
    keys.forEach((k) => {
      const li = document.createElement('li');
      const origin = k.substring(PREFIX.length);
      const speed = items[k];

      const strong = document.createElement('strong');
      strong.textContent = origin;

      const code = document.createElement('code');
      code.textContent = String(speed);

      const btn = document.createElement('button');
      btn.className = 'del';
      btn.textContent = 'Delete';
      btn.addEventListener('click', () => {
        log('[VSC][options] deleting key', k);
        chrome.storage.local.remove(k, () => { refresh(); });
      });

      li.appendChild(strong);
      li.appendChild(document.createTextNode(' — '));
      li.appendChild(code);
      li.appendChild(document.createTextNode(' '));
      li.appendChild(btn);
      ul.appendChild(li);
    });
    listEl.appendChild(ul);
  }

  function refresh() {
    chrome.storage.local.get(null, (items) => {
      log('[VSC][options] refresh fetched', Object.keys(items || {}).length, 'items');
      render(items || {});
    });
  }

  refreshBtn.addEventListener('click', refresh);
  clearAllBtn.addEventListener('click', () => {
    chrome.storage.local.get(null, (items) => {
      const keys = Object.keys(items).filter(k => k.startsWith(PREFIX));
      if (!keys.length) return refresh();
      log('[VSC][options] clearing keys', keys.length);
      chrome.storage.local.remove(keys, () => { refresh(); });
    });
  });

  refresh();
});
