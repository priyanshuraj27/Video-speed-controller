// background.js - service worker for command shortcuts
chrome.commands.onCommand.addListener((command) => {
  try {
    console.log('[VSC][background] command received:', command);
  } catch (e) {}
  // send a simple message to the active tab so content script can execute changes
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) {
      try { console.log('[VSC][background] no active tab found for command'); } catch (e) {}
      return;
    }
    try { console.log('[VSC][background] sending command to tab', tabs[0].id); } catch (e) {}
    chrome.tabs.sendMessage(tabs[0].id, { type: 'vsc-command', command });
  });
});
