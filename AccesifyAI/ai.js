'use strict';

(() => {

  /**
   * Scores how important an image is (0–100).
   * Higher score = more meaningful image.
   * Accepts optional precomputed rect for performance.
   */
  function scoreImage(img, rect) {
    let score = 0;

    const w = img.naturalWidth  || img.width  || img.offsetWidth;
    const h = img.naturalHeight || img.height || img.offsetHeight;

    if (w > 600 || h > 400) score += 40;
    else if (w > 200 || h > 200) score += 20;
    else score += 5;

    const r = rect ?? img.getBoundingClientRect();
    if (r.top < window.innerHeight) score += 20;

    if (img.closest('article, main, [role="main"]')) score += 25;
    if (img.closest('a')) score += 10;
    if (img.closest('figure')) score += 10;

    if (w < 20 || h < 20) score = Math.max(score - 40, 0);

    return Math.min(score, 100);
  }

  /**
   * Attempts to classify an image type for better alt text.
   */
  function classifyImage(img) {
    const src = (img.src || img.dataset.src || '').toLowerCase();
    const cls = img.className.toLowerCase();
    const parentCls = (img.parentElement?.className || '').toLowerCase();

    if (/logo/.test(src) || /logo/.test(cls)) return 'logo';
    if (/icon/.test(src) || /icon/.test(cls)) return 'icon';
    if (/avatar|profile|user|gravatar/.test(src) || /avatar/.test(cls)) return 'avatar';
    if (/banner|hero|header/.test(src) || /banner|hero/.test(cls)) return 'banner';
    if (/chart|graph|plot/.test(src) || /chart|graph/.test(cls)) return 'chart';
    if (/photo|image|img|pic/.test(cls) || /photo|image/.test(parentCls)) return 'photo';

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    if (w && h) {
      const ratio = w / h;
      if (ratio > 3) return 'banner';
      if (Math.abs(ratio - 1) < 0.1 && w < 100) return 'icon';
      if (Math.abs(ratio - 1) < 0.2) return 'avatar';
    }

    return 'unknown';
  }

  function tokensFromSrc(src) {
    const filename = src.split('/').pop().split('?')[0].split('#')[0];
    return filename
      .replace(/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i, '')
      .replace(/[-_+.]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\d{3,}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generates alt text using local heuristics.
   */
  function generateDescription(img) {
    const type = classifyImage(img);

    if (img.title?.trim()) return img.title.trim();
    if (img.ariaLabel?.trim()) return img.ariaLabel.trim();
    if (img.dataset.alt?.trim()) return img.dataset.alt.trim();

    const figure = img.closest('figure');
    if (figure) {
      const caption = figure.querySelector('figcaption');
      if (caption?.textContent.trim())
        return caption.textContent.trim().slice(0, 200);
    }

    const nearbyText = getNearbyText(img);
    const src = img.src || img.dataset.src || '';
    const tokens = tokensFromSrc(src);
    const heading = getNearestHeading(img);

    switch (type) {
      case 'logo':
        if (nearbyText) return `${nearbyText} logo`;
        if (tokens) return `${capitalise(tokens)} logo`;
        return 'Company logo';

      case 'icon':
        if (tokens && tokens.length > 2 && !isHashLike(tokens))
          return `${capitalise(tokens)} icon`;
        return nearbyText ? `${nearbyText} icon` : 'Decorative icon';

      case 'avatar':
        if (nearbyText) return `Profile photo of ${nearbyText}`;
        return 'User profile photo';

      case 'banner':
        if (heading) return `Banner image: ${heading}`;
        if (tokens && !isHashLike(tokens)) return `Banner: ${capitalise(tokens)}`;
        return 'Page banner image';

      case 'chart':
        if (heading) return `Chart: ${heading}`;
        if (nearbyText) return `Data visualization: ${nearbyText}`;
        return 'Data chart or graph';

      default:
        if (nearbyText && nearbyText.length > 5)
          return nearbyText.slice(0, 150);
        if (tokens && !isHashLike(tokens) && tokens.length > 3)
          return capitalise(tokens).slice(0, 150);
        if (heading) return `Image: ${heading.slice(0, 100)}`;
        return 'Image';
    }
  }

  function capitalise(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  function isHashLike(str) {
    return /^[0-9a-f\-_]{8,}$/i.test(str.replace(/\s/g, ''));
  }

  function getNearbyText(img) {
    const parent = img.parentElement;
    if (!parent) return '';

    const textNodes = [...parent.childNodes]
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent.trim())
      .filter(t => t.length > 3)
      .join(' ')
      .trim();

    if (textNodes.length > 3) return textNodes.slice(0, 120);

    const anchor = img.closest('a');
    if (anchor) {
      const anchorText = anchor.textContent.trim();
      if (anchorText.length > 3) return anchorText.slice(0, 120);
    }

    const sib = img.nextElementSibling || img.previousElementSibling;
    if (sib) {
      const sibText = sib.textContent?.trim();
      if (sibText && sibText.length > 3) return sibText.slice(0, 100);
    }

    return '';
  }

  function getNearestHeading(el) {
    let node = el.parentElement;
    let depth = 0;

    while (node && node !== document.body && depth < 6) {
      const heading = node.querySelector('h1,h2,h3,h4,h5,h6');
      if (heading?.textContent.trim())
        return heading.textContent.trim().slice(0, 100);

      let sib = node.previousElementSibling;
      while (sib) {
        if (sib.matches('h1,h2,h3,h4,h5,h6'))
          return sib.textContent.trim().slice(0, 100);
        sib = sib.previousElementSibling;
      }

      node = node.parentElement;
      depth++;
    }

    return document.title ? document.title.trim().slice(0, 80) : '';
  }

  /**
   * Processes all images missing alt text.
   * Uses a single layout pass for performance.
   */
  async function processAllImages(opts = {}) {
    const images = [...document.querySelectorAll('img')].filter(img => {
      const alt = img.getAttribute('alt');
      return alt === null || alt.trim() === '';
    });

    const rectMap = new Map();
    images.forEach(img => rectMap.set(img, img.getBoundingClientRect()));

    let processed = 0;
    let skipped = 0;

    for (const img of images) {
      const rect = rectMap.get(img);
      const score = scoreImage(img, rect);

      if (score < 5) {
        img.setAttribute('alt', '');
        skipped++;
      } else {
        img.setAttribute('alt', generateDescription(img));
        img.dataset.accesifyFixed = 'true';
        processed++;
      }

      opts.onProgress?.(processed + skipped, images.length);
      await new Promise(r => setTimeout(r, 0));
    }

    return { processed, skipped };
  }

  window.AccesifyAI = {
    generateDescription,
    scoreImage,
    classifyImage,
    processAllImages,
  };

})();
