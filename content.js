(function () {
  // Defensive early exits to avoid running inside sandboxed frames or non-standard schemes
  try {
    // If inside a cross-origin or sandboxed frame that disallows scripts, bail out.
    if (window !== window.top) {
      const frame = window.frameElement;
      if (frame && frame.hasAttribute && frame.hasAttribute('sandbox')) {
        const s = frame.getAttribute('sandbox') || '';
        if (!s.includes('allow-scripts')) {
          try { console.log('[VSC][content] skipping injection: sandboxed frame without allow-scripts', location.href); } catch (e) {}
          return; // scripts are blocked here
        }
      }
    }
    // Don't run on special protocols where content scripts shouldn't operate
    if (location.protocol === 'about:' || location.protocol === 'data:' || location.protocol === 'blob:') {
      try { console.log('[VSC][content] skipping injection: unsupported protocol', location.href); } catch (e) {}
      return;
    }
  } catch (e) {
    // If any of these checks throw (very rare), avoid running the injection
    return;
  }

  if (window.__vsc_injected) return;
  window.__vsc_injected = true;
  try { console.log('[VSC][content] injected into', location.origin, 'href:', location.href); } catch (e) {}

  const DEFAULT_SPEED = 1.0;
  const MIN_SPEED = 0.25;
  const MAX_SPEED = 4.0;
  const STEP = 0.05; // slider step
  const CLICK_STEP = 0.1; // step for +/- buttons and commands
  // use origin (protocol + host + port) to avoid mixing sites on same hostname with different schemes
  const STORAGE_KEY = 'vsc_speed_' + location.origin;

  function clamp(v) {
    return Math.min(MAX_SPEED, Math.max(MIN_SPEED, v));
  }

  function getAnyVideo() {
    return document.querySelector('video');
  }

  function getCurrentSpeed() {
    const v = getAnyVideo();
    return v ? v.playbackRate : DEFAULT_SPEED;
  }

  let saveEnabled = true; // whether changes should be persisted for this origin
  const SAVE_TOGGLE_KEY = 'vsc_save_' + location.origin;

  function setSpeed(speed) {
    speed = clamp(parseFloat((Math.round((speed / STEP)) * STEP).toFixed(3)));
    const vids = document.querySelectorAll('video');
    try { console.log('[VSC][content] applying speed', speed, 'to', vids.length, 'videos'); } catch (e) {}
    vids.forEach((v) => {
      try { v.playbackRate = speed; } catch (e) { /* some pages protect props */ }
    });
    updateUI(speed);
    // persist per-site preference (remove entry if default)
    try {
      if (saveEnabled && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        if (Math.abs(speed - DEFAULT_SPEED) < 1e-9) {
          chrome.storage.local.remove(STORAGE_KEY, () => { try { console.log('[VSC][content] removed stored speed for', STORAGE_KEY); } catch (e) {} });
        } else {
          const obj = {};
          obj[STORAGE_KEY] = speed;
          chrome.storage.local.set(obj, () => { try { console.log('[VSC][content] saved speed', speed, 'for', STORAGE_KEY); } catch (e) {} });
        }
      }
    } catch (e) {
      // storage may not be available in some contexts; ignore
    }
  }

  function increase() {
    setSpeed(getCurrentSpeed() + CLICK_STEP);
  }

  function decrease() {
    setSpeed(getCurrentSpeed() - CLICK_STEP);
  }

  function reset() {
    setSpeed(DEFAULT_SPEED);
  }

  // build UI
  const container = document.createElement('div');
  container.id = 'vsc-container';
  container.innerHTML = `
    <div id="vsc-root" class="vsc-root" title="Video Speed Controller">
      <button id="vsc-dec" class="vsc-btn" aria-label="Decrease">−</button>
      <input id="vsc-slider" class="vsc-slider" type="range" min="${MIN_SPEED}" max="${MAX_SPEED}" step="${STEP}" />
      <button id="vsc-inc" class="vsc-btn" aria-label="Increase">+</button>
      <button id="vsc-reset" class="vsc-reset" aria-label="Reset">1×</button>
      <div id="vsc-label" class="vsc-label">1.00×</div>
      <label class="vsc-save" title="Save per-site speed">
        <input id="vsc-save-toggle" type="checkbox" checked />
        <span>Save</span>
      </label>
      <div id="vsc-presets" class="vsc-presets">
        <button class="vsc-preset" data-speed="0.5">0.5×</button>
        <button class="vsc-preset" data-speed="1.5">1.5×</button>
        <button class="vsc-preset" data-speed="2">2×</button>
        <button class="vsc-preset" data-speed="3">3×</button>
        <button class="vsc-preset" data-speed="4">4×</button>
      </div>
      <div id="vsc-preset-tooltip" class="vsc-tooltip" aria-hidden="true"></div>
    </div>
  `;
  document.documentElement.appendChild(container);

  const slider = container.querySelector('#vsc-slider');
  const decBtn = container.querySelector('#vsc-dec');
  const incBtn = container.querySelector('#vsc-inc');
  const resetBtn = container.querySelector('#vsc-reset');
  const label = container.querySelector('#vsc-label');
  const root = container.querySelector('#vsc-root');
  const saveToggle = container.querySelector('#vsc-save-toggle');
  const presetsRow = container.querySelector('#vsc-presets');
  const presetButtons = presetsRow ? Array.from(presetsRow.querySelectorAll('.vsc-preset')) : [];
  const presetTooltip = container.querySelector('#vsc-preset-tooltip');

  function updateUI(speed) {
    slider.value = speed;
    label.textContent = speed.toFixed(2) + '×';
    // broadcast current speed so popup (or other listeners) can sync
    try { chrome.runtime.sendMessage({ type: 'vsc-current-speed', speed }); } catch (e) {}
  }

  decBtn.addEventListener('click', (e) => { e.preventDefault(); decrease(); });
  incBtn.addEventListener('click', (e) => { e.preventDefault(); increase(); });
  resetBtn.addEventListener('click', (e) => { e.preventDefault(); reset(); });
  slider.addEventListener('input', (e) => { setSpeed(parseFloat(e.target.value)); });
  // update preset highlight while sliding
  slider.addEventListener('input', (e) => { updatePresetHighlight(parseFloat(e.target.value)); });
  // toggle persistence
  saveToggle.addEventListener('change', (e) => {
    saveEnabled = !!e.target.checked;
    try { console.log('[VSC][content] save toggle changed:', saveEnabled, 'for', STORAGE_KEY); } catch (e) {}
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const obj = {};
        obj[SAVE_TOGGLE_KEY] = saveEnabled;
        chrome.storage.local.set(obj, () => { try { console.log('[VSC][content] persisted save toggle', saveEnabled, 'for', SAVE_TOGGLE_KEY); } catch (e) {} });
        if (!saveEnabled) {
          chrome.storage.local.remove(STORAGE_KEY, () => { try { console.log('[VSC][content] removed stored speed because save disabled for', STORAGE_KEY); } catch (e) {} });
        }
      }
    } catch (err) {
      try { console.log('[VSC][content] error persisting save toggle', err); } catch (e) {}
    }
  });

  // Respond to messages (from background/service worker)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'vsc-command') return;
    try { console.log('[VSC][content] runtime message received:', msg && msg.command); } catch (e) {}
    if (msg.command === 'speed-up') increase();
    else if (msg.command === 'speed-down') decrease();
    else if (msg.command === 'reset-speed') reset();
  });

  // respond to popup queries and toggle
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'vsc-get-speed') {
      const s = getCurrentSpeed();
      try { sendResponse({ speed: s }); } catch (e) {}
      return true; // indicate async response possible
    }
    if (msg.type === 'vsc-set-speed' && typeof msg.speed === 'number') {
      try { setSpeed(msg.speed); } catch (e) { }
      return;
    }
    if (msg.type === 'vsc-toggle-controller') {
      try {
        const el = document.getElementById('vsc-container');
        if (el) {
          el.style.display = (el.style.display === 'none') ? '' : 'none';
          try { console.log('[VSC][content] toggled controller visibility to', el.style.display); } catch (e) {}
        } else {
          // no container found (maybe content script ran early in a document that later removed root) - try to reapply
          try { console.log('[VSC][content] no controller element found to toggle; re-applying UI'); } catch (e) {}
          applyToNewVideos();
        }
      } catch (e) {}
    }
  });

  // handle preset clicks
  function onPresetClick(e) {
    const btn = e.currentTarget;
    const v = parseFloat(btn.getAttribute('data-speed'));
    if (!isNaN(v)) setSpeed(v);
  }
  presetButtons.forEach((b) => b.addEventListener('click', onPresetClick));

  // highlight presets when speed matches
  function updatePresetHighlight(speed) {
    const EPS = 0.03;
    let matched = null;
    presetButtons.forEach((btn) => {
      const v = parseFloat(btn.getAttribute('data-speed'));
      if (!isNaN(v) && Math.abs(v - speed) < EPS) {
        btn.classList.add('active');
        matched = btn;
      } else {
        btn.classList.remove('active');
      }
    });
    // show tooltip over matched button
    if (matched && presetTooltip) {
      presetTooltip.textContent = matched.textContent;
      // compute center position relative to container
      const btnRect = matched.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      const left = (btnRect.left - contRect.left) + (btnRect.width / 2) - (presetTooltip.offsetWidth / 2);
      presetTooltip.style.left = Math.max(6, left) + 'px';
      presetTooltip.classList.add('visible');
      presetTooltip.setAttribute('aria-hidden', 'false');
    } else if (presetTooltip) {
      presetTooltip.classList.remove('visible');
      presetTooltip.setAttribute('aria-hidden', 'true');
    }
  }

  // Keep UI in sync when a video changes playbackRate (some sites change it themselves)
  function attachVideoListeners(video) {
    if (!video || video.__vsc_listeners) return;
    video.__vsc_listeners = true;
    try { console.log('[VSC][content] attaching listeners to video', video); } catch (e) {}
    video.addEventListener('ratechange', () => updateUI(video.playbackRate));
    video.addEventListener('play', () => updateUI(video.playbackRate));
  }

  function applyToNewVideos() {
    const speed = getCurrentSpeed();
    document.querySelectorAll('video').forEach((v) => { try { v.playbackRate = speed; } catch (e) {} attachVideoListeners(v); });
    updateUI(speed);
  }

  // Observe addition of video elements
  const mo = new MutationObserver((mutations) => {
    let found = false;
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) {
          if (n.tagName === 'VIDEO' || n.querySelector && n.querySelector('video')) found = true;
        }
      });
    }
    if (found) {
      try { console.log('[VSC][content] mutation observed: new video nodes found'); } catch (e) {}
      applyToNewVideos();
    }
  });
  mo.observe(document.documentElement || document, { childList: true, subtree: true });

  // initialize: try to load stored per-origin speed and save toggle state, then attach to videos
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY, SAVE_TOGGLE_KEY], (result) => {
        const stored = result && result[STORAGE_KEY];
        const savedToggle = result && result[SAVE_TOGGLE_KEY];
        if (typeof savedToggle === 'boolean') {
          saveEnabled = savedToggle;
          if (saveToggle) saveToggle.checked = !!savedToggle;
          try { console.log('[VSC][content] loaded save toggle', savedToggle, 'for', SAVE_TOGGLE_KEY); } catch (e) {}
        } else {
          saveEnabled = true;
          if (saveToggle) saveToggle.checked = true;
        }

        if (typeof stored === 'number') {
          try { console.log('[VSC][content] loaded stored speed', stored, 'for', STORAGE_KEY); } catch (e) {}
          setSpeed(stored);
        } else {
          try { console.log('[VSC][content] no stored speed for', STORAGE_KEY, '; using default'); } catch (e) {}
          applyToNewVideos();
        }
      });
    } else {
      try { console.log('[VSC][content] chrome.storage not available; applying to new videos only'); } catch (e) {}
      applyToNewVideos();
    }
  } catch (e) {
    try { console.log('[VSC][content] error reading storage; applying to new videos', e); } catch (er) {}
    applyToNewVideos();
  }

  // Draggable behavior for the controller
  (function makeDraggable(el) {
    let isDown = false, startX = 0, startY = 0, origX = 0, origY = 0;
    el.style.position = 'fixed';
    el.style.right = '12px';
    el.style.bottom = '12px';
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // only left button
      isDown = true;
      startX = e.clientX; startY = e.clientY;
      const rect = el.getBoundingClientRect();
      origX = rect.right; origY = rect.bottom;
      document.body.style.userSelect = 'none';
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      const dx = startX - e.clientX; // because anchored to right
      const dy = startY - e.clientY; // anchored to bottom
      el.style.right = (12 + dx) + 'px';
      el.style.bottom = (12 + dy) + 'px';
    });
    window.addEventListener('mouseup', () => { isDown = false; document.body.style.userSelect = ''; });
  })(container);

  // small keyboard support while page focused (optional)
  window.addEventListener('keydown', (e) => {
    // use +/- on keypad or =/- keys while focusing the page (ignore typing into inputs)
    const activeTag = document.activeElement && document.activeElement.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement && document.activeElement.isContentEditable) return;
    if ((e.key === '+' || e.key === '=' ) && (e.ctrlKey || e.metaKey)) { e.preventDefault(); increase(); }
    if ((e.key === '-') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); decrease(); }
    if (e.key === '0' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); reset(); }
  });

})();
