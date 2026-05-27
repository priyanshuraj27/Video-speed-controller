// background.js - service worker for command shortcuts
const DEBUG = false;
const log = (...a) => { if (DEBUG) { try { console.log(...a); } catch (e) {} } };

chrome.commands.onCommand.addListener((command) => {
  log('[VSC][background] command received:', command);
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) {
      log('[VSC][background] no active tab found for command');
      return;
    }
    log('[VSC][background] sending command to tab', tabs[0].id);
    // Top-frame content script forwards to subframes via window.postMessage.
    chrome.tabs.sendMessage(tabs[0].id, { type: 'vsc-command', command });
  });
});
