(function(){
  const DEBUG = false;
  const log = (...a) => { if (DEBUG) { try { console.log(...a); } catch (e) {} } };
  const warn = (...a) => { if (DEBUG) { try { console.warn(...a); } catch (e) {} } };

  const inc = document.getElementById('inc');
  const dec = document.getElementById('dec');
  const reset = document.getElementById('reset');
  const speedLabel = document.getElementById('speed');
  const speedSlider = document.getElementById('speedSlider');
  const presets = document.querySelectorAll('.preset');
  const blockedNotice = document.getElementById('blockedNotice');
  const openOptionsLink = document.getElementById('openOptions');
  const popupRoot = document.querySelector('.popup-root');

  if (openOptionsLink) {
    openOptionsLink.addEventListener('click', (e) => {
      e.preventDefault();
      try { chrome.runtime.openOptionsPage(); } catch (err) {}
    });
  }

  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      try { chrome.runtime.openOptionsPage(); } catch (err) {}
    });
  }

  function checkBlocked() {
    try {
      chrome.tabs.query({active:true,currentWindow:true}, (tabs) => {
        if (!tabs || !tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { type: 'vsc-get-blocked' }, (resp) => {
          if (chrome.runtime.lastError) return; // no content script (e.g. chrome:// pages) — leave enabled
          if (resp && resp.blocked) {
            if (blockedNotice) blockedNotice.hidden = false;
            if (popupRoot) popupRoot.classList.add('is-blocked');
          }
        });
      });
    } catch (e) {}
  }

  function updatePresetHighlight(speed) {
    const EPS = 0.03;
    if (!presets || !presets.length) return;
    presets.forEach((btn) => {
      const v = parseFloat(btn.getAttribute('data-speed'));
      if (!isNaN(v) && Math.abs(v - speed) < EPS) btn.classList.add('active'); else btn.classList.remove('active');
    });
  }

  function applySpeedToUI(speed) {
    if (typeof speed !== 'number' || isNaN(speed)) return;
    speedLabel.textContent = speed.toFixed(2) + '×';
    if (speedSlider) speedSlider.value = speed;
    updatePresetHighlight(speed);
  }

  function sendCommand(command) {
    try {
      chrome.tabs.query({active:true,currentWindow:true}, (tabs) => {
        if (!tabs || !tabs[0]) return;
        const tabId = tabs[0].id;
        log('[VSC][popup] sending command', command, 'to tab', tabId);
        chrome.tabs.sendMessage(tabId, { type: 'vsc-command', command }, () => {
          if (chrome.runtime.lastError) {
            log('[VSC][popup] sendMessage failed, falling back to executeScript:', chrome.runtime.lastError.message);
            chrome.scripting.executeScript({
              target: { tabId },
              func: (cmd) => {
                const STEP = 0.1;
                const clamp = (v) => Math.min(4, Math.max(0.25, v));
                const vids = Array.from(document.querySelectorAll('video'));
                if (!vids.length) return null;
                vids.forEach(v => {
                  try {
                    if (cmd === 'speed-up') v.playbackRate = clamp(v.playbackRate + STEP);
                    else if (cmd === 'speed-down') v.playbackRate = clamp(v.playbackRate - STEP);
                    else if (cmd === 'reset-speed') v.playbackRate = 1.0;
                  } catch (e) {}
                });
                return vids[0] ? vids[0].playbackRate : null;
              },
              args: [command]
            }).then((results) => {
              const speed = results && results[0] && results[0].result;
              applySpeedToUI(speed);
            }).catch(err => warn('[VSC][popup] executeScript fallback failed', err));
          }
        });
      });
    } catch (e) { warn('[VSC][popup] sendCommand error', e); }
  }

  function setSpeedExplicit(val) {
    if (isNaN(val)) return;
    applySpeedToUI(val);
    try {
      chrome.tabs.query({active:true,currentWindow:true}, (tabs) => {
        if (!tabs || !tabs[0]) return;
        const tabId = tabs[0].id;
        chrome.tabs.sendMessage(tabId, { type: 'vsc-set-speed', speed: val }, () => {
          if (chrome.runtime.lastError) {
            chrome.scripting.executeScript({
              target: { tabId },
              func: (s) => {
                const clamp = v => Math.min(4, Math.max(0.25, v));
                const vids = Array.from(document.querySelectorAll('video'));
                vids.forEach(v => { try { v.playbackRate = clamp(s); } catch (e) {} });
                return vids[0] ? vids[0].playbackRate : null;
              },
              args: [val]
            }).then((results) => {
              const speed = results && results[0] && results[0].result;
              applySpeedToUI(speed);
            }).catch(err => warn('[VSC][popup] executeScript set-speed failed', err));
          }
        });
      });
    } catch (err) { warn('[VSC][popup] setSpeedExplicit error', err); }
  }

  function updateCurrentSpeed() {
    try {
      chrome.tabs.query({active:true,currentWindow:true}, (tabs) => {
        if (!tabs || !tabs[0]) return;
        const tabId = tabs[0].id;
        chrome.tabs.sendMessage(tabId, { type: 'vsc-get-speed' }, (resp) => {
          if (resp && typeof resp.speed === 'number') {
            applySpeedToUI(resp.speed);
            return;
          }
          if (chrome.runtime.lastError || !resp) {
            chrome.scripting.executeScript({
              target: { tabId },
              func: () => {
                const v = document.querySelector('video');
                return v ? v.playbackRate : null;
              }
            }).then((results) => {
              const speed = results && results[0] && results[0].result;
              applySpeedToUI(speed);
            }).catch(err => warn('[VSC][popup] executeScript get-speed failed', err));
          }
        });
      });
    } catch (e) {}
  }

  inc.addEventListener('click', () => sendCommand('speed-up'));
  dec.addEventListener('click', () => sendCommand('speed-down'));
  reset.addEventListener('click', () => sendCommand('reset-speed'));

  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => setSpeedExplicit(parseFloat(e.target.value)));
  }

  if (presets && presets.length) {
    presets.forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = parseFloat(btn.getAttribute('data-speed'));
        setSpeedExplicit(v);
      });
    });
  }

  updateCurrentSpeed();
  checkBlocked();

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'vsc-current-speed' && typeof msg.speed === 'number') {
        applySpeedToUI(msg.speed);
      }
    });
  } catch (e) {}
})();
