(function () {
  const DEBUG = false;
  const log = (...a) => { if (DEBUG) { try { console.log(...a); } catch (e) {} } };

  try {
    if (window !== window.top) {
      const frame = window.frameElement;
      if (frame && frame.hasAttribute && frame.hasAttribute('sandbox')) {
        const s = frame.getAttribute('sandbox') || '';
        if (!s.includes('allow-scripts')) {
          log('[VSC][content] skipping injection: sandboxed frame without allow-scripts', location.href);
          return;
        }
      }
    }
    if (location.protocol === 'about:' || location.protocol === 'data:' || location.protocol === 'blob:') {
      log('[VSC][content] skipping injection: unsupported protocol', location.href);
      return;
    }
  } catch (e) {
    return;
  }

  if (window.__vsc_injected) return;
  window.__vsc_injected = true;

  const IS_TOP_FRAME = (window === window.top);
  log('[VSC][content] injected into', location.origin, 'top:', IS_TOP_FRAME);

  const DEFAULT_SPEED = 1.0;
  const MIN_SPEED = 0.25;
  const MAX_SPEED = 4.0;
  const STEP = 0.05;
  const CLICK_STEP = 0.1;
  const FORWARD_TAG = '__vsc_forward__';
  const STORAGE_KEY = 'vsc_speed_' + location.origin;
  const SAVE_TOGGLE_KEY = 'vsc_save_' + location.origin;
  const BLOCKLIST_KEY = 'vsc_blocklist';

  let saveEnabled = true;
  let disabled = false;
  let targetSpeed = DEFAULT_SPEED; // user's intended speed — survives video element swaps

  function matchesBlocklist(url, patterns) {
    if (!Array.isArray(patterns) || !patterns.length) return false;
    for (const raw of patterns) {
      const p = (raw || '').trim();
      if (!p) continue;
      if (url.includes(p)) return true;
    }
    return false;
  }

  function clamp(v) {
    return Math.min(MAX_SPEED, Math.max(MIN_SPEED, v));
  }

  function getAnyVideo() {
    return document.querySelector('video');
  }

  function getCurrentSpeed() {
    // Prefer the user's target — the live video.playbackRate can momentarily reset
    // to 1.0 when sites swap the <video> element (e.g. YouTube Shorts on scroll).
    if (Math.abs(targetSpeed - DEFAULT_SPEED) > 1e-9) return targetSpeed;
    const v = getAnyVideo();
    return v ? v.playbackRate : DEFAULT_SPEED;
  }

  function forwardToSubframes(payload) {
    if (!IS_TOP_FRAME) return;
    document.querySelectorAll('iframe').forEach((f) => {
      try { f.contentWindow && f.contentWindow.postMessage({ [FORWARD_TAG]: true, payload }, '*'); } catch (e) {}
    });
  }

  function applySpeedToLocalVideos(speed) {
    const vids = document.querySelectorAll('video');
    log('[VSC][content] applying speed', speed, 'to', vids.length, 'videos');
    vids.forEach((v) => {
      try { v.playbackRate = speed; } catch (e) {}
    });
  }

  function broadcastCurrentSpeed(speed) {
    if (!IS_TOP_FRAME) return;
    try { chrome.runtime.sendMessage({ type: 'vsc-current-speed', speed }); } catch (e) {}
  }

  function setSpeed(speed, opts) {
    if (disabled) return;
    const o = opts || {};
    speed = clamp(parseFloat((Math.round((speed / STEP)) * STEP).toFixed(3)));
    targetSpeed = speed;
    applySpeedToLocalVideos(speed);
    if (IS_TOP_FRAME) {
      broadcastCurrentSpeed(speed);
      if (!o.fromSubframeForward) forwardToSubframes({ type: 'vsc-set-speed', speed });
    }
    try {
      if (saveEnabled && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        if (Math.abs(speed - DEFAULT_SPEED) < 1e-9) {
          chrome.storage.local.remove(STORAGE_KEY);
        } else {
          chrome.storage.local.set({ [STORAGE_KEY]: speed });
        }
      }
    } catch (e) {}
  }

  function increase() {
    setSpeed(getCurrentSpeed() + CLICK_STEP);
    if (IS_TOP_FRAME) forwardToSubframes({ type: 'vsc-command', command: 'speed-up' });
  }
  function decrease() {
    setSpeed(getCurrentSpeed() - CLICK_STEP);
    if (IS_TOP_FRAME) forwardToSubframes({ type: 'vsc-command', command: 'speed-down' });
  }
  function reset() {
    setSpeed(DEFAULT_SPEED);
    if (IS_TOP_FRAME) forwardToSubframes({ type: 'vsc-command', command: 'reset-speed' });
  }

  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg) return;
      if (msg.type === 'vsc-command') {
        log('[VSC][content] runtime message received:', msg.command);
        if (msg.command === 'speed-up') increase();
        else if (msg.command === 'speed-down') decrease();
        else if (msg.command === 'reset-speed') reset();
        return;
      }
      if (msg.type === 'vsc-get-speed') {
        try { sendResponse({ speed: getCurrentSpeed() }); } catch (e) {}
        return true;
      }
      if (msg.type === 'vsc-get-blocked') {
        try { sendResponse({ blocked: disabled, url: location.href }); } catch (e) {}
        return true;
      }
      if (msg.type === 'vsc-set-speed' && typeof msg.speed === 'number') {
        try { setSpeed(msg.speed); } catch (e) {}
        return;
      }
    });
  } catch (e) {}

  window.addEventListener('message', (e) => {
    const data = e.data;
    if (!data || typeof data !== 'object' || !data[FORWARD_TAG]) return;
    const payload = data.payload;
    if (!payload) return;
    if (payload.type === 'vsc-set-speed' && typeof payload.speed === 'number') {
      setSpeed(payload.speed, { fromSubframeForward: true });
    } else if (payload.type === 'vsc-command') {
      if (payload.command === 'speed-up') setSpeed(getCurrentSpeed() + CLICK_STEP, { fromSubframeForward: true });
      else if (payload.command === 'speed-down') setSpeed(getCurrentSpeed() - CLICK_STEP, { fromSubframeForward: true });
      else if (payload.command === 'reset-speed') setSpeed(DEFAULT_SPEED, { fromSubframeForward: true });
    }
  });

  function reapplyTarget(video) {
    if (disabled || !video) return;
    if (Math.abs(video.playbackRate - targetSpeed) > 1e-3) {
      try { video.playbackRate = targetSpeed; } catch (e) {}
    }
  }

  function attachVideoListeners(video) {
    if (!video || video.__vsc_listeners) return;
    video.__vsc_listeners = true;
    // Re-apply target whenever the media source/state resets the rate
    video.addEventListener('loadstart', () => reapplyTarget(video));
    video.addEventListener('loadedmetadata', () => reapplyTarget(video));
    video.addEventListener('canplay', () => reapplyTarget(video));
    video.addEventListener('play', () => {
      reapplyTarget(video);
      broadcastCurrentSpeed(video.playbackRate);
    });
    video.addEventListener('ratechange', () => broadcastCurrentSpeed(video.playbackRate));
  }

  function applyToNewVideos() {
    if (disabled) return;
    const speed = targetSpeed;
    document.querySelectorAll('video').forEach((v) => {
      try { v.playbackRate = speed; } catch (e) {}
      attachVideoListeners(v);
    });
    if (IS_TOP_FRAME) broadcastCurrentSpeed(speed);
  }

  const mo = new MutationObserver((mutations) => {
    let found = false;
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) {
          if (n.tagName === 'VIDEO' || (n.querySelector && n.querySelector('video'))) found = true;
        }
      });
    }
    if (found) {
      log('[VSC][content] mutation observed: new video nodes found');
      applyToNewVideos();
    }
  });
  mo.observe(document.documentElement || document, { childList: true, subtree: true });

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY, SAVE_TOGGLE_KEY, BLOCKLIST_KEY], (result) => {
        const stored = result && result[STORAGE_KEY];
        const savedToggle = result && result[SAVE_TOGGLE_KEY];
        const blocklist = result && result[BLOCKLIST_KEY];
        saveEnabled = (typeof savedToggle === 'boolean') ? savedToggle : true;
        disabled = matchesBlocklist(location.href, blocklist);
        log('[VSC][content] blocklist match for', location.href, '=>', disabled);

        if (disabled) return;

        if (typeof stored === 'number') {
          log('[VSC][content] loaded stored speed', stored, 'for', STORAGE_KEY);
          targetSpeed = clamp(stored);
          setSpeed(stored);
        } else {
          applyToNewVideos();
        }
      });

      try {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local' || !changes[BLOCKLIST_KEY]) return;
          const next = changes[BLOCKLIST_KEY].newValue;
          const wasDisabled = disabled;
          disabled = matchesBlocklist(location.href, next);
          log('[VSC][content] blocklist updated; disabled =>', disabled);
          if (wasDisabled && !disabled) applyToNewVideos();
        });
      } catch (e) {}
    } else {
      applyToNewVideos();
    }
  } catch (e) {
    log('[VSC][content] error reading storage; applying to new videos', e);
    applyToNewVideos();
  }

  function deepActiveElement(root) {
    let el = (root || document).activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    return el;
  }

  function isEditableContext(el) {
    if (!el) return false;
    if (typeof el.closest === 'function' && el.closest('input,textarea,[contenteditable=""],[contenteditable="true"]')) return true;
    if (el.isContentEditable) return true;
    return false;
  }

  window.addEventListener('keydown', (e) => {
    if (isEditableContext(deepActiveElement(document))) return;
    if ((e.key === '+' || e.key === '=') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); increase(); }
    if (e.key === '-' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); decrease(); }
    if (e.key === '0' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); reset(); }
  });

  // SPA navigation (YouTube, etc. don't reload between routes) — re-check blocklist
  // and re-apply target speed when the URL changes.
  (function watchUrlChanges() {
    let lastUrl = location.href;
    function onUrlChange() {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      log('[VSC][content] SPA url change ->', location.href);
      try {
        chrome.storage.local.get(BLOCKLIST_KEY, (result) => {
          const wasDisabled = disabled;
          disabled = matchesBlocklist(location.href, result && result[BLOCKLIST_KEY]);
          if (!disabled) applyToNewVideos();
          else if (!wasDisabled) log('[VSC][content] became blocked after navigation');
        });
      } catch (e) {
        if (!disabled) applyToNewVideos();
      }
    }
    try {
      const origPush = history.pushState;
      const origReplace = history.replaceState;
      history.pushState = function () { const r = origPush.apply(this, arguments); onUrlChange(); return r; };
      history.replaceState = function () { const r = origReplace.apply(this, arguments); onUrlChange(); return r; };
    } catch (e) {}
    window.addEventListener('popstate', onUrlChange);
    window.addEventListener('hashchange', onUrlChange);
  })();

})();
