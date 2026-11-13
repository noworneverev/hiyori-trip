import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface PDFExportOptions {
  onProgress?: (status: 'rendering' | 'paginating' | 'downloading' | 'done') => void;
}

/**
 * Strip dark mode classes inside cloned/print containers so PDFs and paper prints
 * always render crisp ink-on-white regardless of the user's active dark theme.
 */
function stripDarkClasses(root: HTMLElement): void {
  root.classList.remove('dark');
  const darkNodes = root.querySelectorAll('[class*="dark:"]');
  darkNodes.forEach((node) => {
    const classes = Array.from(node.classList).filter((c) => !c.startsWith('dark:'));
    node.className = classes.join(' ');
  });
}

/**
 * Prints the target element using an isolated hidden iframe.
 * Produces 100% native vector output with fully selectable/copyable text,
 * zero layout clipping, and dark-mode isolation.
 */
export function printElementInIframe(element: HTMLElement, title: string = 'Itinerary_Guidebook'): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      window.print();
      resolve();
      return;
    }

    const cloned = element.cloneNode(true) as HTMLElement;
    stripDarkClasses(cloned);

    const headNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML)
      .join('\n');

    doc.open();
    doc.write(`
      <!doctype html>
      <html lang="zh-TW" class="light" style="color-scheme: light;">
        <head>
          <meta charset="UTF-8" />
          <title>${title}</title>
          ${headNodes}
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm 12mm;
            }
            html, body {
              background: #ffffff !important;
              color: #0f172a !important;
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
            table {
              page-break-inside: auto;
            }
            tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }
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

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Iframe print error, falling back to window.print:', err);
        window.print();
      }

      setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
        resolve();
      }, 1500);
    }, 450);
  });
}

/**
 * Captures an element and converts it into a multi-page A4 PDF file for direct download.
 * Isolates light theme inside onclone so dark mode never leaks into generated PDFs.
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
  cloned.style.padding = '24px 32px';
  cloned.style.background = '#ffffff';
  cloned.style.color = '#0f172a';

  cloneWrapper.appendChild(cloned);
  document.body.appendChild(cloneWrapper);

  try {
    if ('fonts' in document) {
      await document.fonts.ready.catch(() => {});
    }

    const canvas = await html2canvas(cloned, {
      scale: 2,
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
      },
    });

    options?.onProgress?.('paginating');

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const pageHeightPx = Math.floor((canvas.width * pdfHeight) / pdfWidth);

    let renderedHeightPx = 0;
    let pageCount = 0;

    while (renderedHeightPx < canvas.height) {
      const chunkHeightPx = Math.min(pageHeightPx, canvas.height - renderedHeightPx);

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = chunkHeightPx;
      const ctx = sliceCanvas.getContext('2d');

      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          renderedHeightPx,
          canvas.width,
          chunkHeightPx,
          0,
          0,
          canvas.width,
          chunkHeightPx
        );
      }

      const sliceImgData = sliceCanvas.toDataURL('image/jpeg', 0.92);
      const renderedMmHeight = (chunkHeightPx * pdfWidth) / canvas.width;

      if (pageCount > 0) {
        pdf.addPage();
      }

      pdf.addImage(sliceImgData, 'JPEG', 0, 0, pdfWidth, renderedMmHeight);

      renderedHeightPx += chunkHeightPx;
      pageCount++;
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

    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
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
