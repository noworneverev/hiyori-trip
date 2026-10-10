import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface PDFExportOptions {
  onProgress?: (status: string) => void;
}

/**
 * Prints the target element using an isolated hidden iframe.
 * Produces 100% native vector output with fully selectable/copyable text,
 * zero layout clipping, zero duplicate pages, and pristine high-resolution typography.
 */
export function printElementInIframe(element: HTMLElement, title: string = 'Itinerary_Guidebook'): Promise<void> {
  return new Promise((resolve) => {
    // 1. Create isolated hidden iframe
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
      // Fallback to window.print if iframe fails
      window.print();
      resolve();
      return;
    }

    // 2. Extract parent stylesheets, Tailwind styles, and fonts
    const headNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML)
      .join('\n');

    // 3. Construct clean standalone printable HTML
    doc.open();
    doc.write(`
      <!doctype html>
      <html lang="zh-TW">
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
            /* Ensure tables and containers never clip */
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
          <div style="width: 100%; max-width: 100%; margin: 0 auto; background: #ffffff;">
            ${element.innerHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();

    // 4. Wait for fonts & rendering to settle before invoking native print
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Iframe print error, falling back to window.print:', err);
        window.print();
      }

      // 5. Clean up iframe
      setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
        resolve();
      }, 1500);
    }, 400);
  });
}

/**
 * Captures an element and converts it into a multi-page A4 PDF file for direct download.
 * Clones into an unconstrained container to prevent modal overflow clipping or page repeats.
 */
export async function exportElementToPDF(
  element: HTMLElement,
  filename: string,
  options?: PDFExportOptions
): Promise<void> {
  if (options?.onProgress) {
    options.onProgress('rendering');
  }

  // Create an offscreen, completely unconstrained clone container
  const cloneWrapper = document.createElement('div');
  cloneWrapper.style.position = 'fixed';
  cloneWrapper.style.left = '-9999px';
  cloneWrapper.style.top = '0';
  cloneWrapper.style.width = '794px'; // Standard A4 96 DPI pixel width
  cloneWrapper.style.background = '#ffffff';
  cloneWrapper.style.color = '#0f172a';
  cloneWrapper.style.zIndex = '-999';
  cloneWrapper.style.overflow = 'visible';

  // Deep clone target
  const cloned = element.cloneNode(true) as HTMLElement;
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

  cloneWrapper.appendChild(cloned);
  document.body.appendChild(cloneWrapper);

  try {
    // 1. High-DPI canvas capture (scale: 2 for sharp vector-like text)
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
    });

    if (options?.onProgress) {
      options.onProgress('paginating');
    }

    // 2. Standard A4 specifications
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210 mm
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297 mm

    // Pixels corresponding to one A4 page height
    const pageHeightPx = Math.floor((canvas.width * pdfHeight) / pdfWidth);

    let renderedHeightPx = 0;
    let pageCount = 0;

    // 3. Sequential slice pagination (never repeats content, covers 100% of height)
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

      const sliceImgData = sliceCanvas.toDataURL('image/png');
      const renderedMmHeight = (chunkHeightPx * pdfWidth) / canvas.width;

      if (pageCount > 0) {
        pdf.addPage();
      }

      pdf.addImage(sliceImgData, 'PNG', 0, 0, pdfWidth, renderedMmHeight);

      renderedHeightPx += chunkHeightPx;
      pageCount++;
    }

    if (options?.onProgress) {
      options.onProgress('downloading');
    }

    // 4. Download blob
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

    if (options?.onProgress) {
      options.onProgress('done');
    }
  } catch (err) {
    console.warn('Canvas PDF export error, falling back to isolated vector print:', err);
    await printElementInIframe(element, filename);
  } finally {
    // Always clean up offscreen clone
    if (cloneWrapper.parentNode) {
      document.body.removeChild(cloneWrapper);
    }
  }
}

/**
 * Triggers native browser print dialog for paper or system PDF printing
 */
export function triggerNativePrint(element?: HTMLElement, title: string = 'Itinerary_Guidebook'): void {
  if (element) {
    printElementInIframe(element, title);
  } else {
    window.print();
  }
}
