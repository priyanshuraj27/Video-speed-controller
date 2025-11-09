document.addEventListener('DOMContentLoaded', () => {
  try { console.log('[VSC][options] options page loaded'); } catch (e) {}
  const listEl = document.getElementById('list');
  const refreshBtn = document.getElementById('refresh');
  const clearAllBtn = document.getElementById('clearAll');
  const PREFIX = 'vsc_speed_';

  function render(items) {
    listEl.innerHTML = '';
    const keys = Object.keys(items).filter(k => k.startsWith(PREFIX));
    if (!keys.length) {
      try { console.log('[VSC][options] no saved speeds'); } catch (e) {}
      listEl.innerHTML = '<p>No saved speeds found.</p>';
      return;
    }
    const ul = document.createElement('ul');
    keys.forEach((k) => {
      const li = document.createElement('li');
      const origin = k.substring(PREFIX.length);
      const speed = items[k];
      li.innerHTML = `<strong>${origin}</strong> — <code>${speed}</code> <button class="del" data-key="${k}">Delete</button>`;
      ul.appendChild(li);
    });
    listEl.appendChild(ul);
    listEl.querySelectorAll('button.del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        try { console.log('[VSC][options] deleting key', key); } catch (e) {}
        chrome.storage.local.remove(key, () => { refresh(); });
      });
    });
  }

  function refresh() {
    chrome.storage.local.get(null, (items) => {
      try { console.log('[VSC][options] refresh fetched', Object.keys(items || {}).length, 'items'); } catch (e) {}
      render(items || {});
    });
  }

  refreshBtn.addEventListener('click', refresh);
  clearAllBtn.addEventListener('click', () => {
    chrome.storage.local.get(null, (items) => {
      const keys = Object.keys(items).filter(k => k.startsWith(PREFIX));
      if (!keys.length) return refresh();
      try { console.log('[VSC][options] clearing keys', keys.length); } catch (e) {}
      chrome.storage.local.remove(keys, () => { refresh(); });
    });
  });

  refresh();
});
