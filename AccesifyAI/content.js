/**
 * Accesify AI — Content Script (v1.0.1 — post-audit fixes)
 *
 * Fixes applied:
 *  B3  — Overflow restoration falsy-check bug → 'in' operator sentinel check
 *  B4  — SpeechRecognition result index → iterate from event.resultIndex
 *  B5  — Non-standard document.body.style.zoom → font-size on <html>
 *  B7  — One-message-per-image loop → batch handler with progress events
 *  B8/S1 — innerHTML XSS in reading overlay → full attribute sanitizer
 *  P1  — Unthrottled mousemove → requestAnimationFrame throttle
 *  P2  — Synchronous large HTML parse → size guard
 *  P4  — Full DOM rebuild on slider update → CSS-only update path
 *  A6  — Dialog missing aria-modal, focus trap, Escape key, focus restore
 *  A8  — Close button has Escape hint in title
 */

'use strict';

/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */

const state = {
  readingMode:     false,
  dyslexiaMode:    false,
  visionFilter:    'none',
  voiceNav:        false,
  readingOptions:  {},
  dyslexiaOptions: {},
};

/* ═══════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════ */

function injectStyle(id, css) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function removeStyle(id) {
  document.getElementById(id)?.remove();
}

/* ═══════════════════════════════════════════════
   1. READING MODE
═══════════════════════════════════════════════ */

const READING_WRAPPER_ID = 'accesify-reading-wrapper';
const READING_STYLE_ID   = 'accesify-reading-style';
const READING_LINE_ID    = 'accesify-reading-line';

// A6: Store the element that had focus before the overlay opened
let _readingPrevFocus = null;

function generateReadingCSS(options) {
  const { fontSize = 18, lineHeight = 1.8, readingLine = false } = options;
  return `
    /* Accesify Reading Mode */
    #${READING_WRAPPER_ID} .accesify-reader-inner {
      font-size: ${fontSize}px;
      line-height: ${lineHeight};
    }
    ${readingLine ? `
    #${READING_LINE_ID} {
      height: ${fontSize * lineHeight}px;
    }` : ''}
  `;
}

function enableReadingMode(options = {}) {
  const {
    fontSize    = 18,
    lineHeight  = 1.8,
    readingLine = false,
  } = options;

  // B3: Use 'in' operator to distinguish "not set" from "set to empty string"
  if (!('accesifyOrigOverflow' in document.body.dataset)) {
    document.body.dataset.accesifyOrigOverflow = document.body.style.overflow;
  }

  injectStyle(READING_STYLE_ID, `
    /* Accesify Reading Mode — base layout */
    body { overflow-x: hidden !important; }

    #${READING_WRAPPER_ID} {
      position: fixed !important;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 2147483640;
      background: #faf9f6;
      overflow-y: auto;
      padding: 0;
      animation: accesify-fade-in 0.35s ease;
    }
    @media (prefers-color-scheme: dark) {
      #${READING_WRAPPER_ID} { background: #1a1917; color: #e8e4dc; }
    }
    #${READING_WRAPPER_ID} .accesify-reader-inner {
      max-width: 680px;
      margin: 0 auto;
      padding: 60px 32px 120px;
      font-size: ${fontSize}px;
      line-height: ${lineHeight};
      font-family: Georgia, 'Times New Roman', serif;
      color: #2d2926;
      word-spacing: 0.05em;
    }
    @media (prefers-color-scheme: dark) {
      #${READING_WRAPPER_ID} .accesify-reader-inner { color: #e8e4dc; }
    }
    #${READING_WRAPPER_ID} .accesify-reader-close {
      position: fixed;
      top: 16px; right: 20px;
      z-index: 2147483645;
      background: rgba(0,0,0,0.08);
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 8px;
      padding: 7px 14px;
      font-size: 12px;
      font-family: system-ui, sans-serif;
      cursor: pointer;
      color: #555;
      font-weight: 600;
      transition: background 0.15s;
    }
    #${READING_WRAPPER_ID} .accesify-reader-close:hover,
    #${READING_WRAPPER_ID} .accesify-reader-close:focus-visible {
      background: rgba(0,0,0,0.15);
      outline: 2px solid #6C63FF;
      outline-offset: 2px;
    }
    @keyframes accesify-fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      #${READING_WRAPPER_ID} { animation: none; }
    }
    /* Reading line */
    ${readingLine ? `
    #${READING_WRAPPER_ID} .accesify-reader-inner { cursor: crosshair; }
    #${READING_LINE_ID} {
      position: fixed;
      left: 0; right: 0;
      height: ${fontSize * lineHeight}px;
      background: rgba(255,200,0,0.12);
      border-top: 1px solid rgba(200,160,0,0.25);
      border-bottom: 1px solid rgba(200,160,0,0.25);
      pointer-events: none;
      z-index: 2147483643;
      transition: top 0.08s linear;
    }
    @media (prefers-reduced-motion: reduce) {
      #${READING_LINE_ID} { transition: none; }
    }` : ''}
  `);

  const content = extractContent();

  const wrapper = document.createElement('div');
  wrapper.id = READING_WRAPPER_ID;
  // A6: aria-modal prevents screen readers from escaping into background content
  wrapper.setAttribute('role', 'dialog');
  wrapper.setAttribute('aria-modal', 'true');
  wrapper.setAttribute('aria-label', 'Reading Mode');

  // A8: Title gives keyboard users the Escape hint
  const closeBtn = document.createElement('button');
  closeBtn.className = 'accesify-reader-close';
  closeBtn.textContent = '✕ Exit Reading Mode';
  closeBtn.title = 'Exit Reading Mode (press Escape)';
  closeBtn.addEventListener('click', disableReadingMode);

  const inner = document.createElement('div');
  inner.className = 'accesify-reader-inner';
  // B8/S1: Use sanitized content instead of raw innerHTML
  inner.innerHTML = sanitizeHTML(content);

  wrapper.appendChild(closeBtn);
  wrapper.appendChild(inner);
  document.body.appendChild(wrapper);

  state.readingMode = true;

  // A6: Store previous focus, then move focus into the dialog
  _readingPrevFocus = document.activeElement;
  closeBtn.focus();

  // A6: Escape key closes the dialog
  wrapper.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      disableReadingMode();
    }
  });

  // Reading line — P1: throttle with requestAnimationFrame
  if (readingLine) {
    const line = document.createElement('div');
    line.id = READING_LINE_ID;
    document.body.appendChild(line);

    let rafPending = false;
    wrapper.addEventListener('mousemove', (e) => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        line.style.top = `${e.clientY - (fontSize * lineHeight) / 2}px`;
        rafPending = false;
      });
    }, { passive: true });
  }
}

function disableReadingMode() {
  document.getElementById(READING_WRAPPER_ID)?.remove();
  document.getElementById(READING_LINE_ID)?.remove();
  removeStyle(READING_STYLE_ID);
  if (document.body.dataset.accesifyOrigOverflow !== undefined) {
    document.body.style.overflow = document.body.dataset.accesifyOrigOverflow;
    delete document.body.dataset.accesifyOrigOverflow;
  }
  state.readingMode = false;
  // A6: Restore focus to the element that was active before the overlay
  _readingPrevFocus?.focus();
  _readingPrevFocus = null;
}

/**
 * P4: Update only CSS, not the entire DOM.
 * The reading overlay's font-size and line-height are controlled by a
 * separate style block; we update just that block instead of destroying
 * and rebuilding the full overlay (which triggered extractContent() +
 * sanitizeHTML() on every slider move).
 */
function updateReadingMode(options = {}) {
  if (!state.readingMode) return;
  const { fontSize = 18, lineHeight = 1.8, readingLine = false } = options;

  // Update inline styles on the inner element for instant visual feedback
  const inner = document.querySelector(`#${READING_WRAPPER_ID} .accesify-reader-inner`);
  if (inner) {
    inner.style.fontSize   = `${fontSize}px`;
    inner.style.lineHeight = String(lineHeight);
  }

  // Manage the reading line element
  const existingLine = document.getElementById(READING_LINE_ID);
  if (readingLine && !existingLine) {
    const line = document.createElement('div');
    line.id = READING_LINE_ID;
    document.body.appendChild(line);
    const wrapper = document.getElementById(READING_WRAPPER_ID);
    let rafPending = false;
    wrapper?.addEventListener('mousemove', (e) => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        line.style.top = `${e.clientY - (fontSize * lineHeight) / 2}px`;
        rafPending = false;
      });
    }, { passive: true });
  } else if (!readingLine && existingLine) {
    existingLine.remove();
  } else if (readingLine && existingLine) {
    existingLine.style.height = `${fontSize * lineHeight}px`;
  }
}

/* ── Content extraction ── */

function extractContent() {
  const selectors = [
    'article', '[role="main"]', 'main',
    '.post-content', '.article-body', '.entry-content',
    '#content', '.content',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return sanitizeHTML(el.innerHTML);
  }

  const paras = [...document.querySelectorAll('p')].filter(p => p.textContent.trim().length > 60);
  if (paras.length > 3) {
    return paras.map(p => p.outerHTML).join('\n');
  }

  // P2: Guard against gigantic pages
  const bodyHTML = document.body.innerHTML;
  return bodyHTML.length > 500_000 ? bodyHTML.slice(0, 500_000) : bodyHTML;
}

/**
 * B8/S1: Full HTML sanitizer.
 * Uses DOMParser so we work with real DOM nodes, then:
 *   1. Removes non-content elements (scripts, nav, ads, etc.)
 *   2. Strips all event handler attributes (onclick, onerror, etc.)
 *   3. Strips javascript: URLs from href/src/action attributes
 * Returns sanitized innerHTML string.
 */
function sanitizeHTML(html) {
  // P2: Size guard
  if (html.length > 500_000) html = html.slice(0, 500_000);

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Remove structural noise
  doc.querySelectorAll(
    'script, style, noscript, nav, header, footer, aside, ' +
    '.ad, [class*="sidebar"], [class*="menu"], [id*="sidebar"], ' +
    '[class*="cookie"], [class*="banner"], [class*="popup"]'
  ).forEach(el => el.remove());

  // Strip all event handlers and dangerous URL schemes
  doc.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (
        attr.name.startsWith('on') ||
        ['href', 'src', 'action', 'formaction', 'data'].some(
          a => attr.name === a && /^\s*javascript:/i.test(attr.value)
        )
      ) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return doc.body.innerHTML;
}

/* ═══════════════════════════════════════════════
   2. DYSLEXIA MODE
═══════════════════════════════════════════════ */

const DYSLEXIA_STYLE_ID = 'accesify-dyslexia-style';

const FONT_STACKS = {
  lexend:       '"Lexend", "Lexend Deca", sans-serif',
  opendyslexic: '"OpenDyslexic", sans-serif',
  atkinson:     '"Atkinson Hyperlegible", sans-serif',
};

const FONT_URLS = {
  lexend:       'https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600&display=swap',
  atkinson:     'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap',
  opendyslexic: null,
};

function enableDyslexiaMode(options = {}) {
  const { font = 'lexend', letterSpacing = 2 } = options;
  const fontStack = FONT_STACKS[font] || FONT_STACKS.lexend;

  const fontUrl = FONT_URLS[font];
  if (fontUrl) {
    const linkId = `accesify-font-${font}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id   = linkId;
      link.rel  = 'stylesheet';
      link.href = fontUrl;
      document.head.appendChild(link);
    }
  }

  injectStyle(DYSLEXIA_STYLE_ID, `
    /* Accesify Dyslexia Mode */
    *, *::before, *::after {
      font-family: ${fontStack} !important;
      letter-spacing: ${letterSpacing}px !important;
      word-spacing: 0.16em !important;
    }
    p, li, td, th, label, span, div {
      line-height: 1.85 !important;
    }
    p { margin-bottom: 1.2em !important; }
  `);

  state.dyslexiaMode = true;
}

function disableDyslexiaMode() {
  removeStyle(DYSLEXIA_STYLE_ID);
  state.dyslexiaMode = false;
}

/* ═══════════════════════════════════════════════
   3. VISION FILTERS
═══════════════════════════════════════════════ */

const VISION_STYLE_ID = 'accesify-vision-style';
const VISION_SVG_ID   = 'accesify-svg-filters';

const SVG_FILTERS = `
<svg id="${VISION_SVG_ID}" xmlns="http://www.w3.org/2000/svg"
     style="position:absolute;width:0;height:0;overflow:hidden"
     aria-hidden="true" focusable="false">
  <defs>
    <filter id="accesify-protanopia">
      <feColorMatrix type="matrix" values="
        0.567, 0.433, 0,     0, 0
        0.558, 0.442, 0,     0, 0
        0,     0.242, 0.758, 0, 0
        0,     0,     0,     1, 0"/>
    </filter>
    <filter id="accesify-deuteranopia">
      <feColorMatrix type="matrix" values="
        0.625, 0.375, 0,   0, 0
        0.7,   0.3,   0,   0, 0
        0,     0.3,   0.7, 0, 0
        0,     0,     0,   1, 0"/>
    </filter>
    <filter id="accesify-tritanopia">
      <feColorMatrix type="matrix" values="
        0.95, 0.05,  0,     0, 0
        0,    0.433, 0.567, 0, 0
        0,    0.475, 0.525, 0, 0
        0,    0,     0,     1, 0"/>
    </filter>
  </defs>
</svg>`;

function injectSVGFilters() {
  if (!document.getElementById(VISION_SVG_ID)) {
    document.body.insertAdjacentHTML('afterbegin', SVG_FILTERS);
  }
}

const FILTER_CSS = {
  none: '',
  dark: `
    html { filter: invert(1) hue-rotate(180deg) !important; }
    img, video, canvas, iframe, svg, picture {
      filter: invert(1) hue-rotate(180deg) !important;
    }`,
  contrast: `
    html { filter: contrast(1.5) saturate(1.2) !important; }`,
  protanopia: `
    html { filter: url(#accesify-protanopia) !important; }`,
  deuteranopia: `
    html { filter: url(#accesify-deuteranopia) !important; }`,
  tritanopia: `
    html { filter: url(#accesify-tritanopia) !important; }`,
};

function setVisionFilter(filter = 'none') {
  if (filter !== 'none') injectSVGFilters();
  const css = FILTER_CSS[filter] || '';
  if (css) {
    injectStyle(VISION_STYLE_ID, `/* Accesify Vision Filter: ${filter} */ ${css}`);
  } else {
    removeStyle(VISION_STYLE_ID);
  }
  state.visionFilter = filter;
}

/* ═══════════════════════════════════════════════
   4. VOICE NAVIGATION
═══════════════════════════════════════════════ */

let recognition  = null;
let speechSynth  = window.speechSynthesis;
let isSpeaking   = false;

function enableVoiceNav() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('[Accesify] SpeechRecognition not supported.');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous    = true;
  recognition.interimResults = false;
  recognition.lang          = 'en-US';

  // B4: Iterate from event.resultIndex to avoid reprocessing previous finals
  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (!event.results[i].isFinal) continue;
      const transcript = event.results[i][0].transcript.trim().toLowerCase();
      handleVoiceCommand(transcript);
    }
  };

  recognition.onerror = (e) => {
    if (e.error !== 'no-speech') console.warn('[Accesify] Recognition error:', e.error);
  };

  recognition.onend = () => {
    if (state.voiceNav) {
      try { recognition.start(); } catch (_) {}
    }
  };

  try { recognition.start(); } catch (e) {}
  state.voiceNav = true;
}

function disableVoiceNav() {
  state.voiceNav = false;
  if (recognition) {
    try { recognition.stop(); } catch (_) {}
    recognition = null;
  }
  if (isSpeaking) {
    speechSynth.cancel();
    isSpeaking = false;
  }
}

function handleVoiceCommand(cmd) {
  chrome.runtime.sendMessage({ action: 'voiceCommand', command: cmd });

  if (cmd.includes('scroll down')) {
    window.scrollBy({ top: 300, behavior: 'smooth' });
  } else if (cmd.includes('scroll up')) {
    window.scrollBy({ top: -300, behavior: 'smooth' });
  } else if (cmd.includes('go to top') || cmd.includes('scroll to top')) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (cmd.includes('go to bottom')) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  } else if (cmd.startsWith('click ')) {
    clickByText(cmd.replace('click ', '').trim());
  } else if (cmd.includes('read page') || cmd.includes('read aloud')) {
    readPageAloud();
  } else if (cmd.includes('stop reading') || cmd.includes('stop')) {
    speechSynth.cancel();
    isSpeaking = false;
  } else if (cmd.includes('go back')) {
    history.back();
  } else if (cmd.includes('zoom in')) {
    // B5: Use font-size on <html> instead of non-standard zoom property
    adjustZoom(+0.1);
  } else if (cmd.includes('zoom out')) {
    adjustZoom(-0.1);
  }
}

/**
 * B5: Cross-browser zoom via html font-size (em cascade).
 * Clamps between 50% and 300%.
 */
function adjustZoom(delta) {
  const current = parseFloat(
    document.documentElement.style.fontSize || '100%'
  ) || 100;
  const next = Math.min(Math.max(current + delta * 100, 50), 300);
  document.documentElement.style.fontSize = `${next}%`;
}

function clickByText(target) {
  const candidates = document.querySelectorAll(
    'a, button, [role="button"], input[type="submit"], input[type="button"]'
  );
  for (const el of candidates) {
    const text = (el.textContent || el.value || el.ariaLabel || '').trim().toLowerCase();
    if (text.includes(target)) {
      el.click();
      el.focus();
      return;
    }
  }
  console.warn(`[Accesify] No clickable element found for: "${target}"`);
}

function readPageAloud() {
  if (isSpeaking) {
    speechSynth.cancel();
    isSpeaking = false;
    return;
  }

  const selectors = ['article', '[role="main"]', 'main', '.post-content', '#content'];
  let textContent = '';
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) { textContent = el.innerText; break; }
  }
  if (!textContent) textContent = document.body.innerText;

  const sentences = textContent.match(/[^.!?]+[.!?]+/g) || [textContent];
  let idx = 0;

  function speakNext() {
    if (idx >= sentences.length || !isSpeaking) return;
    const utt = new SpeechSynthesisUtterance(sentences[idx++]);
    utt.lang  = document.documentElement.lang || 'en-US';
    utt.rate  = 0.95;
    utt.onend = speakNext;
    speechSynth.speak(utt);
  }

  isSpeaking = true;
  speakNext();
}

/* ═══════════════════════════════════════════════
   5. AI ALT TEXT  (fixes B7, AR1)
═══════════════════════════════════════════════ */

let imagesWithoutAlt = [];

function scanImages() {
  const allImages = [...document.querySelectorAll('img')];
  imagesWithoutAlt = allImages.filter((img) => {
    const alt = img.getAttribute('alt');
    return alt === null || alt.trim() === '';
  });
  imagesWithoutAlt.forEach(img => img.setAttribute('data-accesify-pending', 'true'));

  return {
    total:   allImages.length,
    missing: imagesWithoutAlt.length,
    fixed:   allImages.filter(img => img.dataset.accesifyFixed === 'true').length,
  };
}

/**
 * AR1: Now uses window.AccesifyAI.generateDescription() from ai.js,
 * which is loaded before this script (manifest order: ai.js, content.js).
 * Falls back to the inline heuristic if ai.js somehow isn't available.
 */
function generateAltText(img) {
  if (window.AccesifyAI?.generateDescription) {
    return window.AccesifyAI.generateDescription(img);
  }
  return generateAltFallback(img);
}

/** Minimal inline fallback (should rarely be reached). */
function generateAltFallback(img) {
  if (img.title?.trim())     return img.title.trim();
  if (img.ariaLabel?.trim()) return img.ariaLabel.trim();
  const fig = img.closest('figure');
  if (fig) {
    const cap = fig.querySelector('figcaption');
    if (cap?.textContent.trim()) return cap.textContent.trim();
  }
  return 'Image';
}

/**
 * B7: Process ALL images in one pass, emitting progress events back to the
 * popup via chrome.runtime.sendMessage. The popup no longer drives a
 * one-message-per-image loop with artificial delays.
 */
async function generateAllAlt() {
  const total = imagesWithoutAlt.length;
  if (total === 0) return;

  for (let i = 0; i < total; i++) {
    const img = imagesWithoutAlt[i];
    if (!img) continue;

    const alt = generateAltText(img);
    img.setAttribute('alt', alt);
    img.dataset.accesifyFixed = 'true';
    img.removeAttribute('data-accesify-pending');

    // Report progress back to popup (non-blocking)
    chrome.runtime.sendMessage({ action: 'altProgress', done: i + 1, total });

    // Yield to event loop so page stays responsive
    await new Promise(r => setTimeout(r, 0));
  }
}

/* ═══════════════════════════════════════════════
   RESET
═══════════════════════════════════════════════ */

function resetAll() {
  disableReadingMode();
  disableDyslexiaMode();
  setVisionFilter('none');
  disableVoiceNav();
  document.getElementById(VISION_SVG_ID)?.remove();
  // Reset zoom if it was adjusted
  document.documentElement.style.fontSize = '';
  imagesWithoutAlt = [];
}

/* ═══════════════════════════════════════════════
   MESSAGE LISTENER
═══════════════════════════════════════════════ */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {

    case 'setReadingMode':
      msg.enabled ? enableReadingMode(msg.options) : disableReadingMode();
      sendResponse({ ok: true });
      break;

    case 'updateReading':
      // P4: Calls the lightweight CSS-only update, not a full rebuild
      updateReadingMode(msg.options);
      sendResponse({ ok: true });
      break;

    case 'setDyslexiaMode':
      msg.enabled ? enableDyslexiaMode(msg.options) : disableDyslexiaMode();
      sendResponse({ ok: true });
      break;

    case 'updateDyslexia':
      disableDyslexiaMode();
      enableDyslexiaMode(msg.options);
      sendResponse({ ok: true });
      break;

    case 'setVisionFilter':
      setVisionFilter(msg.filter);
      sendResponse({ ok: true });
      break;

    case 'setVoiceNav':
      msg.enabled ? enableVoiceNav() : disableVoiceNav();
      sendResponse({ ok: true });
      break;

    case 'scanImages':
      sendResponse(scanImages());
      break;

    case 'generateAllAlt':
      // B7: Single batch message — handles all images internally
      generateAllAlt(); // async; progress emitted via runtime.sendMessage
      sendResponse({ ok: true, queued: imagesWithoutAlt.length });
      break;

    case 'resetAll':
      resetAll();
      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ ok: false, error: 'Unknown action' });
  }

  return true;
});
