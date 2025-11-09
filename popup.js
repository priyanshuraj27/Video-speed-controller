(function(){
  const inc = document.getElementById('inc');
  const dec = document.getElementById('dec');
  const reset = document.getElementById('reset');
  const speedLabel = document.getElementById('speed');
  // toggleController removed
  const speedSlider = document.getElementById('speedSlider');

  function sendCommand(command) {
    // send to active tab
    try {
      chrome.tabs.query({active:true,currentWindow:true}, (tabs) => {
        if (!tabs || !tabs[0]) return;
        const tabId = tabs[0].id;
        try { console.log('[VSC][popup] sending command', command, 'to tab', tabId); } catch (e) {}
        chrome.tabs.sendMessage(tabId, { type: 'vsc-command', command }, (resp) => {
          // if message failed (no content script) fall back to executing page script
          if (chrome.runtime.lastError) {
            try { console.log('[VSC][popup] sendMessage failed, falling back to scripting.executeScript:', chrome.runtime.lastError.message); } catch (e) {}
            // fallback: apply change directly in page
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
              try {
                const speed = results && results[0] && results[0].result;
                if (typeof speed === 'number') {
                  document.getElementById('speed').textContent = speed.toFixed(2) + '×';
                }
              } catch (e) {}
            }).catch(err => { try { console.warn('[VSC][popup] executeScript fallback failed', err); } catch (e) {} });
          }
        });
      });
    } catch (e) { console.warn('[VSC][popup] sendCommand error', e); }
  }

  function updateCurrentSpeed() {
    // request the current speed from the content script via message and update label
    try {
      chrome.tabs.query({active:true,currentWindow:true}, (tabs) => {
        if (!tabs || !tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { type: 'vsc-get-speed' }, (resp) => {
          try {
            if (resp && typeof resp.speed === 'number') {
              speedLabel.textContent = resp.speed.toFixed(2) + '×';
              if (speedSlider) speedSlider.value = resp.speed;
              updatePresetHighlight(resp.speed);
              return;
            }
            // fallback: query page directly via scripting
            if (chrome.runtime.lastError || !resp) {
              const tabId = tabs[0].id;
              chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                  const v = document.querySelector('video');
                  return v ? v.playbackRate : null;
                }
              }).then((results) => {
                try {
                  const speed = results && results[0] && results[0].result;
                  if (typeof speed === 'number') {
                    speedLabel.textContent = speed.toFixed(2) + '×';
                    if (typeof speed === 'number' && speedSlider) speedSlider.value = speed;
                    updatePresetHighlight(speed);
                  }
                } catch (e) {}
              }).catch(err => { try { console.warn('[VSC][popup] executeScript get-speed failed', err); } catch (e) {} });
            }
          } catch (e) {}
        });
      });
    } catch (e) {}
  }

  inc.addEventListener('click', () => { sendCommand('speed-up'); setTimeout(updateCurrentSpeed, 150); });
  dec.addEventListener('click', () => { sendCommand('speed-down'); setTimeout(updateCurrentSpeed, 150); });
  reset.addEventListener('click', () => { sendCommand('reset-speed'); setTimeout(updateCurrentSpeed, 150); });

  // slider input: send explicit speed value
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (isNaN(val)) return;
      // update label immediately
      speedLabel.textContent = val.toFixed(2) + '×';
      updatePresetHighlight(val);
      // try messaging content script first
      try {
        chrome.tabs.query({active:true,currentWindow:true}, (tabs) => {
          if (!tabs || !tabs[0]) return;
          const tabId = tabs[0].id;
          chrome.tabs.sendMessage(tabId, { type: 'vsc-set-speed', speed: val }, (resp) => {
            if (chrome.runtime.lastError) {
              // fallback to executeScript
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
                try { const speed = results && results[0] && results[0].result; if (typeof speed === 'number') speedLabel.textContent = speed.toFixed(2) + '×'; } catch (e) {}
              }).catch(err => { try { console.warn('[VSC][popup] executeScript set-speed failed', err); } catch (e) {} });
            }
          });
        });
      } catch (err) {
        try { console.warn('[VSC][popup] slider send error', err); } catch (e) {}
      }
    });
  }

  function updatePresetHighlight(speed) {
    const EPS = 0.03;
    if (!presets || !presets.length) return;
    presets.forEach((btn) => {
      const v = parseFloat(btn.getAttribute('data-speed'));
      if (!isNaN(v) && Math.abs(v - speed) < EPS) btn.classList.add('active'); else btn.classList.remove('active');
    });
  }

  // quick preset buttons
  const presets = document.querySelectorAll('.preset');
  if (presets && presets.length) {
    presets.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const v = parseFloat(btn.getAttribute('data-speed'));
        if (isNaN(v)) return;
        // update UI
        speedLabel.textContent = v.toFixed(2) + '×';
        if (speedSlider) speedSlider.value = v;
        // send set-speed message with fallback
        try {
          chrome.tabs.query({active:true,currentWindow:true}, (tabs) => {
            if (!tabs || !tabs[0]) return;
            const tabId = tabs[0].id;
            chrome.tabs.sendMessage(tabId, { type: 'vsc-set-speed', speed: v }, (resp) => {
              if (chrome.runtime.lastError) {
                chrome.scripting.executeScript({
                  target: { tabId },
                  func: (s) => { const clamp = v => Math.min(4, Math.max(0.25, v)); const vids = Array.from(document.querySelectorAll('video')); vids.forEach(v=>{try{v.playbackRate=clamp(s)}catch(e){}}); return vids[0]?vids[0].playbackRate:null; },
                  args: [v]
                }).then((results) => { try { const speed = results && results[0] && results[0].result; if (typeof speed === 'number') speedLabel.textContent = speed.toFixed(2) + '×'; } catch (e) {} });
              }
            });
          });
        } catch (e) { try { console.warn('[VSC][popup] preset set error', e); } catch (er) {} }
      });
    });
  }

  // Toggle controller feature removed — no handler

  // update when popup opens
  updateCurrentSpeed();

  // also listen for incoming responses if content script posts current speed proactively
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'vsc-current-speed' && typeof msg.speed === 'number') {
        speedLabel.textContent = msg.speed.toFixed(2) + '×';
        if (speedSlider) speedSlider.value = msg.speed;
        updatePresetHighlight(msg.speed);
      }
    });
  } catch (e) {}
})();
