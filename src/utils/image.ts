/**
 * Client-side image utility for receipts, travel spot check-in photos, and attachments.
 * Aggressively compresses camera photos or gallery images down to ~20-40KB
 * ensuring lightning-fast loading, smooth mobile performance, and Firestore 1MB document safety.
 */

export const compressImageFile = async (
  file: File,
  maxWidth = 640,
  quality = 0.55
): Promise<string> => {
  // Helper to draw and get dataUrl
  const renderToJpeg = (
    source: ImageBitmap | HTMLImageElement,
    srcWidth: number,
    srcHeight: number,
    maxDimension: number,
    q: number
  ): string => {
    let width = srcWidth;
    let height = srcHeight;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.drawImage(source, 0, 0, width, height);
    let dataUrl = canvas.toDataURL('image/jpeg', q);

    // Safeguard: if compressed output is still > 60KB (base64 length > ~80000), downscale further
    if (dataUrl.length > 80000) {
      const secondWidth = Math.round(width * 0.75);
      const secondHeight = Math.round(height * 0.75);
      canvas.width = secondWidth;
      canvas.height = secondHeight;
      const ctx2 = canvas.getContext('2d');
      if (ctx2) {
        ctx2.drawImage(source, 0, 0, secondWidth, secondHeight);
        dataUrl = canvas.toDataURL('image/jpeg', Math.max(0.4, q - 0.15));
      }
    }

    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  };

  // 1. Prefer createImageBitmap off-thread decoding when available (zero main thread memory allocation)
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      const dataUrl = renderToJpeg(bitmap, bitmap.width, bitmap.height, maxWidth, quality);
      bitmap.close();
      if (dataUrl) return dataUrl;
    } catch (_) {
      // Fallback to URL.createObjectURL
    }
  }

  // 2. Fallback using URL.createObjectURL
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const dataUrl = renderToJpeg(img, img.width, img.height, maxWidth, quality);
      img.src = '';
      resolve(dataUrl);
    };

    img.src = objectUrl;
  });
};
