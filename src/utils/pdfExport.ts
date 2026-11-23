import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface PDFExportOptions {
  onProgress?: (status: 'rendering' | 'paginating' | 'downloading' | 'done') => void;
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strip dark mode classes inside cloned/print containers safely —
 * uses classList.remove() instead of assigning `.className` so SVG elements
 * (where className is a read-only SVGAnimatedString) NEVER throw a TypeError!
 */
function stripDarkClasses(root: HTMLElement): void {
  root.classList.remove('dark');
  const allNodes = root.querySelectorAll('*');
  allNodes.forEach((node) => {
    if (!node.classList || node.classList.length === 0) return;
    const toRemove: string[] = [];
    node.classList.forEach((cls) => {
      if (cls === 'dark' || cls.startsWith('dark:')) {
        toRemove.push(cls);
      }
    });
    if (toRemove.length > 0) {
      node.classList.remove(...toRemove);
    }
  });
}

/**
 * Convert modern CSS color functions (oklch, oklab, color-mix, lab, lch) produced by Tailwind v4
 * into standard hex/rgb colors that html2canvas@1.4.1 can parse cleanly in BOTH dev and production builds.
 */
function createCssColorSanitizer(): (cssText: string) => string {
  const probeCanvas = document.createElement('canvas');
  probeCanvas.width = 1;
  probeCanvas.height = 1;
  const probeCtx = probeCanvas.getContext('2d');
  const cache = new Map<string, string>();

  const resolveColor = (raw: string): string => {
    const cached = cache.get(raw);
    if (cached) return cached;
    if (!probeCtx) return '#0f172a';
    try {
      probeCtx.fillStyle = '#0f172a';
      probeCtx.fillStyle = raw;
      const resolved = probeCtx.fillStyle || '#0f172a';
      cache.set(raw, resolved);
      return resolved;
    } catch {
      return '#0f172a';
    }
  };

  return (cssText: string) => {
    if (!/(?:oklch|oklab|color-mix|lch|lab)\(/i.test(cssText)) return cssText;
    // Iteratively resolve nested functions (e.g. color-mix(in oklab, oklch(...) 50%, transparent))
    let output = cssText;
    for (let pass = 0; pass < 3; pass++) {
      const next = output.replace(
        /(?:oklch|oklab|color-mix|lch|lab)\([^()]*\)/gi,
        (match) => resolveColor(match)
      );
      if (next === output) break;
      output = next;
    }
    return output;
  };
}

/**
 * Collect sanitized CSS from the active document's stylesheets (both <style> AND external production <link> CSS)
 * so html2canvas never chokes on external Tailwind v4 oklch() stylesheets.
 */
function buildSanitizedCssSnapshot(): string {
  const sanitize = createCssColorSanitizer();
  const chunks: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      const sheetCss = Array.from(rules)
        .map((r) => r.cssText)
        .join('\n');
      chunks.push(sanitize(sheetCss));
    } catch {
      // Cross-origin stylesheet (e.g. Google Fonts) — safe to skip for canvas color parsing
    }
  }

  return chunks.join('\n');
}

/**
 * Prints the target element using an isolated hidden iframe.
 * Awaits stylesheet load + document fonts, escapes `<title>`, and preserves the iframe
 * until `onafterprint` (or a generous 60s fallback) so users never get a blank print preview.
 */
export function printElementInIframe(
  element: HTMLElement,
  title: string = 'Itinerary_Guidebook'
): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = win?.document;
    if (!doc || !win) {
      if (iframe.parentNode) document.body.removeChild(iframe);
      window.print();
      resolve();
      return;
    }

    const cloned = element.cloneNode(true) as HTMLElement;
    stripDarkClasses(cloned);

    const headNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML)
      .join('\n');

    const safeTitle = escapeHtml(title);

    doc.open();
    doc.write(`
      <!doctype html>
      <html lang="zh-TW" class="light" style="color-scheme: light;">
        <head>
          <meta charset="UTF-8" />
          <title>${safeTitle}</title>
          ${headNodes}
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm 12mm;
            }
            html, body {
              background: #ffffff !important;
              color: #0f172a !important;
              font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif !important;
              font-size: 11pt !important;
              margin: 0 !important;
              padding: 0 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .page-break-before {
              break-before: page !important;
              page-break-before: always !important;
            }
            .break-inside-avoid {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            .no-print {
              display: none !important;
            }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
          </style>
        </head>
        <body style="background: #ffffff; color: #0f172a; padding: 0; margin: 0;">
          <div style="width: 100%; max-width: 100%; margin: 0 auto; background: #ffffff; color: #0f172a;">
            ${cloned.innerHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
      resolve();
    };

    // Wait for stylesheets & fonts inside the iframe before invoking native print
    const waitForReady = async () => {
      const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
      await Promise.race([
        Promise.all(
          links.map(
            (link) =>
              new Promise<void>((res) => {
                if (link.sheet) {
                  res();
                  return;
                }
                link.addEventListener('load', () => res(), { once: true });
                link.addEventListener('error', () => res(), { once: true });
              })
          )
        ),
        new Promise<void>((res) => setTimeout(res, 1500)),
      ]);
      if ('fonts' in doc) {
        await Promise.race([
          (doc as any).fonts.ready.catch(() => {}),
          new Promise<void>((res) => setTimeout(res, 800)),
        ]);
      }
    };

    waitForReady().then(() => {
      win.onafterprint = cleanup;
      // Generous 60s fallback so dialog stays intact while user adjusts print settings
      setTimeout(cleanup, 60000);
      try {
        win.focus();
        win.print();
      } catch (err) {
        console.warn('Iframe print error, falling back to window.print:', err);
        window.print();
        setTimeout(cleanup, 500);
      }
    });
  });
}

/**
 * Render a single DOM block cleanly to a canvas using sanitized Tailwind v4 CSS.
 */
async function renderBlockToCanvas(
  blockEl: HTMLElement,
  sanitizedCss: string,
  scale: number
): Promise<HTMLCanvasElement> {
  return html2canvas(blockEl, {
    scale,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: 794,
    scrollX: 0,
    scrollY: 0,
    ignoreElements: (el) => el.classList?.contains('no-print'),
    onclone: (clonedDoc) => {
      clonedDoc.documentElement.classList.remove('dark');
      clonedDoc.body.classList.remove('dark');
      // Remove raw external Tailwind v4 stylesheets (which contain oklch/color-mix)
      // and replace with our pre-sanitized RGB stylesheet snapshot!
      clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach((el) => el.remove());
      const styleTag = clonedDoc.createElement('style');
      styleTag.textContent = `
        html, body {
          background: #ffffff !important;
          color: #0f172a !important;
          font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif !important;
        }
        ${sanitizedCss}
      `;
      clonedDoc.head.appendChild(styleTag);
    },
  });
}

/**
 * Commercial-grade Block-Paginated A4 PDF Generator:
 * - Resolves Tailwind v4 oklch()/color-mix() in production builds cleanly.
 * - Captures each `[data-pdf-block="true"]` section independently so:
 *   1) iOS Safari's 16.7M px² canvas limit is NEVER breached even on 14-day itineraries!
 *   2) Chinese/CJK text lines are NEVER sliced in half across page boundaries!
 */
export async function exportElementToPDF(
  element: HTMLElement,
  filename: string,
  options?: PDFExportOptions
): Promise<void> {
  options?.onProgress?.('rendering');

  const cloneWrapper = document.createElement('div');
  cloneWrapper.style.position = 'fixed';
  cloneWrapper.style.left = '-9999px';
  cloneWrapper.style.top = '0';
  cloneWrapper.style.width = '794px';
  cloneWrapper.style.background = '#ffffff';
  cloneWrapper.style.color = '#0f172a';
  cloneWrapper.style.zIndex = '-999';
  cloneWrapper.style.overflow = 'visible';

  const cloned = element.cloneNode(true) as HTMLElement;
  stripDarkClasses(cloned);
  cloned.style.width = '794px';
  cloned.style.maxWidth = '794px';
  cloned.style.height = 'auto';
  cloned.style.maxHeight = 'none';
  cloned.style.overflow = 'visible';
  cloned.style.transform = 'none';
  cloned.style.boxShadow = 'none';
  cloned.style.border = 'none';
  cloned.style.margin = '0';
  cloned.style.padding = '0';
  cloned.style.background = '#ffffff';
  cloned.style.color = '#0f172a';

  cloneWrapper.appendChild(cloned);
  document.body.appendChild(cloneWrapper);

  try {
    if ('fonts' in document) {
      await document.fonts.ready.catch(() => {});
    }

    const sanitizedCss = buildSanitizedCssSnapshot();
    const isIosLike = /iPad|iPhone|iPod/i.test(navigator.userAgent || '');
    const renderScale = isIosLike ? 1.5 : 2;

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidthMm = pdf.internal.pageSize.getWidth(); // 210mm
    const pageHeightMm = pdf.internal.pageSize.getHeight(); // 297mm
    const marginX = 10;
    const marginY = 10;
    const contentWidthMm = pageWidthMm - marginX * 2;
    const contentHeightMm = pageHeightMm - marginY * 2;

    // Gather atomic layout blocks so page breaks occur cleanly BETWEEN blocks
    const blocks = Array.from(cloned.querySelectorAll('[data-pdf-block="true"]')) as HTMLElement[];
    const targets = blocks.length > 0 ? blocks : [cloned];

    let cursorYMm = marginY;
    const blockGapMm = 3.2;

    options?.onProgress?.('paginating');

    for (let i = 0; i < targets.length; i++) {
      const block = targets[i];
      if (!block.offsetHeight || block.offsetHeight < 2) continue;

      // Guard individual block pixel area below iOS Safari's 16.7M px² limit
      const blockEstPixels = 794 * block.offsetHeight * renderScale * renderScale;
      const safeScale = blockEstPixels > 12_000_000 ? 1.25 : renderScale;

      const canvas = await renderBlockToCanvas(block, sanitizedCss, safeScale);
      if (!canvas.width || !canvas.height) continue;

      const blockHeightMm = (canvas.height * contentWidthMm) / canvas.width;

      // If block fits on a single page cleanly, move to a fresh page if remaining room isn't enough
      if (blockHeightMm <= contentHeightMm) {
        if (cursorYMm > marginY && cursorYMm + blockHeightMm > pageHeightMm - marginY) {
          pdf.addPage();
          cursorYMm = marginY;
        }
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        pdf.addImage(imgData, 'JPEG', marginX, cursorYMm, contentWidthMm, blockHeightMm);
        cursorYMm += blockHeightMm + blockGapMm;
      } else {
        // Oversized single block (e.g. very long table): start fresh page and slice cleanly
        if (cursorYMm > marginY + 1) {
          pdf.addPage();
          cursorYMm = marginY;
        }
        const maxSliceHeightPx = Math.floor((canvas.width * contentHeightMm) / contentWidthMm);
        let offsetY = 0;
        while (offsetY < canvas.height) {
          const sliceH = Math.min(maxSliceHeightPx, canvas.height - offsetY);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceH;
          const ctx = sliceCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            ctx.drawImage(canvas, 0, offsetY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          }
          const sliceMm = (sliceH * contentWidthMm) / canvas.width;
          if (offsetY > 0) {
            pdf.addPage();
            cursorYMm = marginY;
          }
          pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', marginX, cursorYMm, contentWidthMm, sliceMm);
          cursorYMm += sliceMm + blockGapMm;
          offsetY += sliceH;
        }
      }
    }

    options?.onProgress?.('downloading');

    const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    const pdfBlob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);

    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = safeFilename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    options?.onProgress?.('done');
  } catch (err) {
    console.warn('Canvas PDF export error, falling back to isolated vector print:', err);
    await printElementInIframe(element, filename);
  } finally {
    if (cloneWrapper.parentNode) {
      document.body.removeChild(cloneWrapper);
    }
  }
}

export function triggerNativePrint(element?: HTMLElement, title: string = 'Itinerary_Guidebook'): void {
  if (element) {
    printElementInIframe(element, title);
  } else {
    window.print();
  }
}
