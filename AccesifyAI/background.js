'use strict';

/**
 * Runs when extension is installed or updated.
 * Sets default settings and creates context menu entry.
 */
chrome.runtime.onInstalled.addListener(({ reason }) => {

  if (reason === 'install') {
    chrome.storage.local.set({
      accesify: {
        readingMode: false,
        dyslexiaMode: false,
        visionFilter: 'none',
        voiceNav: false,
        fontSize: 18,
        lineHeight: 180,
        readingLine: false,
        dyslexiaFont: 'lexend',
        letterSpacing: 2,
      },
    });

    console.log('[Accesify] Installed — defaults initialized.');
  }

  if (reason === 'update') {
    console.log('[Accesify] Updated successfully.');
  }

  chrome.contextMenus.create({
    id: 'accesify-readmode',
    title: 'Open in Reading Mode',
    contexts: ['page', 'selection'],
  }, () => {
    if (chrome.runtime.lastError) {
      const msg = chrome.runtime.lastError.message || '';
      if (!msg.includes('already exists')) {
        console.warn('[Accesify] Context menu error:', msg);
      }
    }
  });
});


/**
 * Handles context menu clicks.
 * Sends message to content script to enable reading mode.
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'accesify-readmode' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'setReadingMode',
      enabled: true,
      options: {
        fontSize: 18,
        lineHeight: 1.8,
        readingLine: false,
      },
    }).catch(e =>
      console.warn('[Accesify] Message send failed:', e.message)
    );
  }
});


/**
 * Relays messages from content scripts to popup UI.
 * Used for voice command confirmations and progress updates.
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.action === 'voiceCommand' || msg.action === 'altProgress') {

    chrome.runtime.sendMessage(msg).catch((e) => {
      const expectedErrors = [
        'Could not establish connection',
        'The message port closed',
        'No receiving end',
      ];

      if (!expectedErrors.some(text => e.message?.includes(text))) {
        console.error('[Accesify] Unexpected relay error:', e.message);
      }
    });

    sendResponse({ relayed: true });
  }

  return true;
});
