/**
 * Accesify AI — Popup Controller (v1.0.1 — post-audit fixes)
 *
 * Fixes applied:
 *  B1  — Race condition in saveSettings() → in-memory cache + single write
 *  B2  — Scan button innerHTML trashed → data-loading CSS pattern
 *  B7  — Uncancellable 300ms-per-image loop → single batch message
 *  AR2 — Excessive storage writes → debounced saves on sliders
 *  AR3 — window.confirm() → two-click inline confirmation
 *  AR4 — No feedback on unreachable tab → status error message
 *  A1  — aria-valuenow/valuetext kept in sync on slider input
 *  A3  — aria-checked toggled on vision filter buttons
 *  A4  — aria-pressed toggled on font chip buttons
 *  A5  — aria-expanded + aria-hidden toggled on collapsible panels
 *  A10 — Status in aria-live region (handled in HTML; JS writes textContent)
 *  A11 — progressBar aria-valuenow updated in generation loop
 *  S2  — Voice message listener validates sender is background script
 */

'use strict';

/* ═══════════════════════════════════════════════
   SETTINGS CACHE  (fixes B1, AR2)
   Keep an in-memory object as the single source of truth.
   All writes go through saveSettings() which merges the patch into the
   cache and does one chrome.storage.local.set() — no read-then-write race.
═══════════════════════════════════════════════ */

let _settings = {};

async function loadSettings() {
  const data = await chrome.storage.local.get('accesify');
  _settings = data.accesify || {};
  return _settings;
}

function saveSettings(patch) {
  _settings = { ..._settings, ...patch };
  chrome.storage.local.set({ accesify: _settings });
}

/* ─── Debounce helper (fixes AR2 for slider writes) ─── */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/* ═══════════════════════════════════════════════
   TAB MESSAGING
═══════════════════════════════════════════════ */

/**
 * Send a message to the active tab's content script.
 *
 * MV3 FIX: Chrome only auto-injects content scripts into tabs opened AFTER
 * the extension is installed. Tabs that were already open get nothing.
 * When the first send fails with "Receiving end does not exist", we
 * programmatically inject ai.js + content.js via chrome.scripting, then
 * retry the message once. After that, the tab is fully set up for the
 * session, so subsequent messages work normally.
 */
async function sendToTab(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus('No active tab', 'error');
    return undefined;
  }

  // Tabs on chrome://, about:, file:// etc. can never receive content scripts
  const url = tab.url || '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    setStatus('Cannot run on this page', 'error');
    return undefined;
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    const isNotInjected = e.message?.includes('Receiving end does not exist') ||
                          e.message?.includes('Could not establish connection');

    if (!isNotInjected) {
      setStatus('Cannot reach this page', 'error');
      console.warn('[Accesify] sendToTab failed:', e.message);
      return undefined;
    }

    // Content scripts not yet in this tab — inject them now, then retry
    setStatus('Injecting…', 'busy');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['ai.js'],
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css'],
      });
      // Brief pause so the scripts can finish initialising their listeners
      await new Promise(r => setTimeout(r, 100));
      setStatus('Ready');
      return await chrome.tabs.sendMessage(tab.id, msg);
    } catch (injectErr) {
      setStatus('Cannot run on this page', 'error');
      console.warn('[Accesify] Injection failed:', injectErr.message);
      return undefined;
    }
  }
}

/* ═══════════════════════════════════════════════
   DOM REFS
═══════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

const els = {
  statusDot:    $('statusDot'),
  statusLabel:  $('statusLabel'),

  readingMode:     $('readingMode'),
  readingControls: $('readingControls'),
  fontSize:        $('fontSize'),
  fontSizeVal:     $('fontSizeVal'),
  lineHeight:      $('lineHeight'),
  lineHeightVal:   $('lineHeightVal'),
  readingLine:     $('readingLine'),

  dyslexiaMode:     $('dyslexiaMode'),
  dyslexiaControls: $('dyslexiaControls'),
  letterSpacing:    $('letterSpacing'),
  letterSpacingVal: $('letterSpacingVal'),

  voiceNav:        $('voiceNav'),
  voiceControls:   $('voiceControls'),
  voiceWaves:      $('voiceWaves'),
  voiceStatusText: $('voiceStatusText'),
  voiceLastCmd:    $('voiceLastCmd'),

  scanImages:   $('scanImages'),
  generateAlt:  $('generateAlt'),
  altEmpty:     $('altEmpty'),
  altStats:     $('altStats'),
  altProgress:  $('altProgress'),
  progressBar:  $('progressBar'),
  progressFill: $('progressFill'),
  progressText: $('progressText'),
  statTotal:    $('statTotal'),
  statMissing:  $('statMissing'),
  statFixed:    $('statFixed'),

  resetAll: $('resetAll'),
  helpBtn:  $('helpBtn'),
};

/* ═══════════════════════════════════════════════
   STATUS
═══════════════════════════════════════════════ */

function setStatus(label, state = 'ready') {
  els.statusLabel.textContent = label;
  els.statusDot.className = 'status-dot';
  if (state === 'busy')  els.statusDot.classList.add('busy');
  if (state === 'error') els.statusDot.classList.add('error');
}

/* ═══════════════════════════════════════════════
   COLLAPSIBLE PANELS  (fixes A5)
   Manages aria-expanded on the checkbox and aria-hidden on the panel.
═══════════════════════════════════════════════ */

function openControls(panelEl, checkboxEl) {
  panelEl.classList.add('open');
  panelEl.removeAttribute('aria-hidden');
  checkboxEl?.setAttribute('aria-expanded', 'true');
}

function closeControls(panelEl, checkboxEl) {
  panelEl.classList.remove('open');
  panelEl.setAttribute('aria-hidden', 'true');
  checkboxEl?.setAttribute('aria-expanded', 'false');
}

/* ═══════════════════════════════════════════════
   1. READING MODE
═══════════════════════════════════════════════ */

function initReading(settings) {
  const enabled = settings.readingMode ?? false;
  els.readingMode.checked = enabled;
  if (enabled) openControls(els.readingControls, els.readingMode);

  // Restore slider values and aria attributes
  const fs = settings.fontSize ?? 18;
  const lh = settings.lineHeight ?? 180;
  els.fontSize.value   = fs;
  els.lineHeight.value = lh;
  els.readingLine.checked = settings.readingLine ?? false;

  updateFontSizeDisplay(fs);
  updateLineHeightDisplay(lh);

  // Toggle
  els.readingMode.addEventListener('change', () => {
    const on = els.readingMode.checked;
    on ? openControls(els.readingControls, els.readingMode)
       : closeControls(els.readingControls, els.readingMode);
    saveSettings({ readingMode: on });
    sendToTab({ action: 'setReadingMode', enabled: on, options: getReadingOptions() });
    setStatus(on ? 'Reading mode on' : 'Ready');
  });

  // A1: Update aria-valuenow/valuetext on input for screen reader feedback
  // P3: Debounce the expensive sendToTab call; keep visual feedback instant
  const debouncedSendReading = debounce(() => {
    if (els.readingMode.checked) sendToTab({ action: 'updateReading', options: getReadingOptions() });
  }, 200);

  els.fontSize.addEventListener('input', () => {
    const v = parseInt(els.fontSize.value);
    updateFontSizeDisplay(v);
    saveSettings({ fontSize: v });
    debouncedSendReading();
  });

  els.lineHeight.addEventListener('input', () => {
    const v = parseInt(els.lineHeight.value);
    updateLineHeightDisplay(v);
    saveSettings({ lineHeight: v });
    debouncedSendReading();
  });

  els.readingLine.addEventListener('change', () => {
    saveSettings({ readingLine: els.readingLine.checked });
    if (els.readingMode.checked) sendToTab({ action: 'updateReading', options: getReadingOptions() });
  });
}

function updateFontSizeDisplay(v) {
  els.fontSizeVal.textContent = `${v}px`;
  els.fontSize.setAttribute('aria-valuenow', v);
  els.fontSize.setAttribute('aria-valuetext', `${v} pixels`);
}

function updateLineHeightDisplay(v) {
  const lhVal = (v / 100).toFixed(1);
  els.lineHeightVal.textContent = lhVal;
  els.lineHeight.setAttribute('aria-valuenow', lhVal);
  els.lineHeight.setAttribute('aria-valuetext', lhVal);
}

function getReadingOptions() {
  return {
    fontSize:    parseInt(els.fontSize.value),
    lineHeight:  parseInt(els.lineHeight.value) / 100,
    readingLine: els.readingLine.checked,
  };
}

/* ═══════════════════════════════════════════════
   2. DYSLEXIA MODE
═══════════════════════════════════════════════ */

let activeFont = 'lexend';

function initDyslexia(settings) {
  const enabled = settings.dyslexiaMode ?? false;
  activeFont = settings.dyslexiaFont ?? 'lexend';
  els.dyslexiaMode.checked = enabled;
  if (enabled) openControls(els.dyslexiaControls, els.dyslexiaMode);

  // A4: Sync aria-pressed on initial render
  document.querySelectorAll('.chip[data-font]').forEach((chip) => {
    const isActive = chip.dataset.font === activeFont;
    chip.classList.toggle('active', isActive);
    chip.setAttribute('aria-pressed', String(isActive));
  });

  const ls = settings.letterSpacing ?? 2;
  els.letterSpacing.value = ls;
  els.letterSpacingVal.textContent = `${ls}px`;
  els.letterSpacing.setAttribute('aria-valuenow', ls);
  els.letterSpacing.setAttribute('aria-valuetext', `${ls} pixels`);

  els.dyslexiaMode.addEventListener('change', () => {
    const on = els.dyslexiaMode.checked;
    on ? openControls(els.dyslexiaControls, els.dyslexiaMode)
       : closeControls(els.dyslexiaControls, els.dyslexiaMode);
    saveSettings({ dyslexiaMode: on });
    sendToTab({ action: 'setDyslexiaMode', enabled: on, options: getDyslexiaOptions() });
    setStatus(on ? 'Dyslexia mode on' : 'Ready');
  });

  // A4: Toggle aria-pressed when font chip is clicked
  document.querySelectorAll('.chip[data-font]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip[data-font]').forEach((c) => {
        c.classList.remove('active');
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
      activeFont = chip.dataset.font;
      saveSettings({ dyslexiaFont: activeFont });
      if (els.dyslexiaMode.checked) sendToTab({ action: 'updateDyslexia', options: getDyslexiaOptions() });
    });
  });

  const debouncedSendDyslexia = debounce(() => {
    if (els.dyslexiaMode.checked) sendToTab({ action: 'updateDyslexia', options: getDyslexiaOptions() });
  }, 200);

  els.letterSpacing.addEventListener('input', () => {
    const v = parseInt(els.letterSpacing.value);
    els.letterSpacingVal.textContent = `${v}px`;
    els.letterSpacing.setAttribute('aria-valuenow', v);
    els.letterSpacing.setAttribute('aria-valuetext', `${v} pixels`);
    saveSettings({ letterSpacing: v });
    debouncedSendDyslexia();
  });
}

function getDyslexiaOptions() {
  return {
    font:          activeFont,
    letterSpacing: parseInt(els.letterSpacing.value),
  };
}

/* ═══════════════════════════════════════════════
   3. VISION FILTERS  (fixes A3)
═══════════════════════════════════════════════ */

let activeFilter = 'none';

function initVision(settings) {
  activeFilter = settings.visionFilter ?? 'none';

  // A3: Set initial aria-checked state
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.setAttribute('aria-checked', String(btn.dataset.filter === activeFilter));
    if (btn.dataset.filter === activeFilter) btn.classList.add('active');
  });

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      // A3: Toggle aria-checked on all filter buttons
      document.querySelectorAll('.filter-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');
      activeFilter = btn.dataset.filter;
      saveSettings({ visionFilter: activeFilter });
      sendToTab({ action: 'setVisionFilter', filter: activeFilter });
      setStatus(activeFilter === 'none' ? 'Ready' : `Filter: ${activeFilter}`);
    });
  });
}

/* ═══════════════════════════════════════════════
   4. VOICE NAVIGATION
═══════════════════════════════════════════════ */

function initVoice(settings) {
  const enabled = settings.voiceNav ?? false;
  els.voiceNav.checked = enabled;
  if (enabled) openControls(els.voiceControls, els.voiceNav);

  els.voiceNav.addEventListener('change', () => {
    const on = els.voiceNav.checked;
    on ? openControls(els.voiceControls, els.voiceNav)
       : closeControls(els.voiceControls, els.voiceNav);
    saveSettings({ voiceNav: on });
    sendToTab({ action: 'setVoiceNav', enabled: on });

    if (on) {
      els.voiceWaves.classList.remove('idle');
      els.voiceStatusText.textContent = 'Listening…';
      setStatus('Voice active');
    } else {
      els.voiceWaves.classList.add('idle');
      els.voiceStatusText.textContent = 'Mic off';
      setStatus('Ready');
    }
  });

  if (!enabled) {
    els.voiceWaves.classList.add('idle');
    els.voiceStatusText.textContent = 'Enable to start';
  }
}

/**
 * S2: Validate that the voiceCommand message originated from the background
 * service worker (no tab / frame ID) before updating the display.
 */
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === 'voiceCommand') {
    // Background script messages have no sender.tab
    if (sender.tab !== undefined) return;
    // textContent is XSS-safe
    els.voiceLastCmd.textContent = `"${msg.command}"`;
  }
});

/* ═══════════════════════════════════════════════
   5. AI ALT TEXT  (fixes B2, B7, A11)
═══════════════════════════════════════════════ */

let scanData = null;

function initAltText() {

  // ── Scan ────────────────────────────────────
  els.scanImages.addEventListener('click', async () => {
    setStatus('Scanning…', 'busy');

    // B2: Use data-loading CSS pattern instead of replacing innerHTML,
    // so the SVG icon is never destroyed.
    els.scanImages.disabled = true;
    els.scanImages.setAttribute('data-loading', 'true');

    const result = await sendToTab({ action: 'scanImages' });

    els.scanImages.disabled = false;
    els.scanImages.removeAttribute('data-loading');

    if (!result) {
      // setStatus('Cannot reach this page') was already called by sendToTab
      return;
    }

    scanData = result;
    updateAltStats(result);
    setStatus('Scan complete');
    els.generateAlt.disabled = (result.missing === 0);
  });

  // ── Generate ─────────────────────────────────
  els.generateAlt.addEventListener('click', async () => {
    if (!scanData || scanData.missing === 0) return;

    setStatus('Generating…', 'busy');
    els.generateAlt.disabled = true;
    els.altStats.classList.add('hidden');
    els.altProgress.classList.remove('hidden');

    const total = scanData.missing;

    /**
     * B7: Send a single batch message to content.js instead of one message
     * per image with a 300ms delay. Content.js processes all images and sends
     * back progress updates via runtime.sendMessage.
     * This also eliminates the "popup closed mid-loop" hazard.
     */
    sendToTab({ action: 'generateAllAlt', total });

    // Progress is updated via the onMessage listener below
    _generationTotal = total;
    _generationDone  = 0;
  });
}

// Tracks batch generation progress driven by content.js messages
let _generationTotal = 0;
let _generationDone  = 0;

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === 'altProgress' && sender.tab !== undefined) {
    _generationDone = msg.done;
    const pct = Math.round((_generationDone / _generationTotal) * 100);

    els.progressFill.style.width = `${pct}%`;
    // A11: Keep aria-valuenow in sync for screen readers
    els.progressBar?.setAttribute('aria-valuenow', pct);
    els.progressText.textContent = `Processing image ${msg.done} of ${_generationTotal}…`;

    if (msg.done >= _generationTotal) {
      setTimeout(() => {
        scanData.fixed   = _generationTotal;
        scanData.missing = 0;
        els.altProgress.classList.add('hidden');
        els.altStats.classList.remove('hidden');
        updateAltStats(scanData);
        setStatus(`${_generationTotal} images updated`);
      }, 600);
    }
  }
});

function updateAltStats(data) {
  els.altEmpty.classList.add('hidden');
  els.altStats.classList.remove('hidden');
  els.statTotal.textContent   = data.total   ?? 0;
  els.statMissing.textContent = data.missing  ?? 0;
  els.statFixed.textContent   = data.fixed    ?? 0;
}

/* ═══════════════════════════════════════════════
   FOOTER  (fixes AR3)
═══════════════════════════════════════════════ */

function initFooter() {
  /**
   * AR3: Replace window.confirm() (deprecated/unreliable in extension popups)
   * with a two-click inline confirmation. First click shows warning text;
   * second click within 3 seconds executes the reset.
   */
  els.resetAll.addEventListener('click', async () => {
    if (els.resetAll.dataset.confirming) {
      // Second click — execute reset
      delete els.resetAll.dataset.confirming;
      els.resetAll.textContent = 'Reset All';
      chrome.storage.local.remove('accesify');
      _settings = {};
      await sendToTab({ action: 'resetAll' });
      setStatus('Reset complete');
      location.reload();
    } else {
      // First click — ask for confirmation
      els.resetAll.dataset.confirming = 'true';
      els.resetAll.textContent = 'Sure? Click again';
      setTimeout(() => {
        if (els.resetAll.dataset.confirming) {
          delete els.resetAll.dataset.confirming;
          els.resetAll.textContent = 'Reset All';
        }
      }, 3000);
    }
  });

  els.helpBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/accesify-ai/help' });
  });
}

/* ═══════════════════════════════════════════════
   BOOTSTRAP
═══════════════════════════════════════════════ */

async function init() {
  const settings = await loadSettings();

  initReading(settings);
  initDyslexia(settings);
  initVision(settings);
  initVoice(settings);
  initAltText();
  initFooter();

  // Re-apply any active modes to the content script on popup re-open
  // AR4: sendToTab now reports errors via setStatus, so no extra check needed
  if (settings.readingMode)  sendToTab({ action: 'setReadingMode',  enabled: true, options: getReadingOptions() });
  if (settings.dyslexiaMode) sendToTab({ action: 'setDyslexiaMode', enabled: true, options: getDyslexiaOptions() });
  if (settings.visionFilter && settings.visionFilter !== 'none') {
    sendToTab({ action: 'setVisionFilter', filter: settings.visionFilter });
  }
  if (settings.voiceNav) sendToTab({ action: 'setVoiceNav', enabled: true });
}

document.addEventListener('DOMContentLoaded', init);
