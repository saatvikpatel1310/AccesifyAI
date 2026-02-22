/**
 * Accesify AI — Background Service Worker (v1.0.1 — post-audit fixes)
 *
 * Fixes applied:
 *  B6  — Merged two onInstalled listeners into one; contextMenus permission
 *         now declared in manifest.json so chrome.contextMenus is available.
 *  S3  — sendMessage error handler no longer silently swallows all errors.
 */

'use strict';

/* ─── Install / Update ─── */

// B6: Single onInstalled listener handles both defaults and context menu setup
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({
      accesify: {
        readingMode:    false,
        dyslexiaMode:   false,
        visionFilter:   'none',
        voiceNav:       false,
        fontSize:       18,
        lineHeight:     180,
        readingLine:    false,
        dyslexiaFont:   'lexend',
        letterSpacing:  2,
      },
    });
    console.log('[Accesify] Extension installed. Defaults set.');
  }

  if (reason === 'update') {
    console.log('[Accesify] Extension updated to v1.0.1.');
  }

  // B6: contextMenus permission is now declared in manifest.json,
  // so this call will succeed (no longer silently fails).
  chrome.contextMenus.create({
    id:       'accesify-readmode',
    title:    'Open in Reading Mode',
    contexts: ['page', 'selection'],
  }, () => {
    // Suppress "already exists" error on reload during development
    if (chrome.runtime.lastError) {
      const msg = chrome.runtime.lastError.message || '';
      if (!msg.includes('already exists')) {
        console.warn('[Accesify] contextMenus.create error:', msg);
      }
    }
  });
});

/* ─── Context Menu Click ─── */

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'accesify-readmode' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action:  'setReadingMode',
      enabled: true,
      options: { fontSize: 18, lineHeight: 1.8, readingLine: false },
    }).catch(e => console.warn('[Accesify] Context menu sendMessage failed:', e.message));
  }
});

/* ─── Message Relay ─── */

/**
 * Relay voice command confirmations from content scripts to the popup.
 * The popup validates sender.tab is undefined to confirm origin (S2).
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'voiceCommand' || msg.action === 'altProgress') {
    // Broadcast to popup (if open). Popup-side listeners filter by sender.tab.
    chrome.runtime.sendMessage(msg).catch((e) => {
      // S3: Only suppress the expected "popup is closed" error.
      // Log anything unexpected.
      const expected = [
        'Could not establish connection',
        'The message port closed',
        'No receiving end',
      ];
      if (!expected.some(s => e.message?.includes(s))) {
        console.error('[Accesify BG] Unexpected relay error:', e.message);
      }
    });
    sendResponse({ relayed: true });
  }

  return true;
});
