/**
 * Zero-dependency ISO/IEC 18004 QR Code (Byte mode, ECC Level M, Versions 1..12) generator.
 * Renders crisp local SVG QR codes 100% offline without leaking private ?collab= URLs to third-party servers.
 */

interface QrVersionSpec {
  version: number;
  totalCodewords: number;
  ecPerBlock: number;
  numBlocks: number;
  alignCenters: number[];
}

// ISO/IEC 18004 Table 9 for Error Correction Level M (supports up to 287 UTF-8 bytes)
const VERSION_SPECS_M: QrVersionSpec[] = [
  { version: 1, totalCodewords: 26, ecPerBlock: 10, numBlocks: 1, alignCenters: [] },
  { version: 2, totalCodewords: 44, ecPerBlock: 16, numBlocks: 1, alignCenters: [6, 18] },
  { version: 3, totalCodewords: 70, ecPerBlock: 26, numBlocks: 1, alignCenters: [6, 22] },
  { version: 4, totalCodewords: 100, ecPerBlock: 18, numBlocks: 2, alignCenters: [6, 26] },
  { version: 5, totalCodewords: 134, ecPerBlock: 24, numBlocks: 2, alignCenters: [6, 30] },
  { version: 6, totalCodewords: 172, ecPerBlock: 16, numBlocks: 4, alignCenters: [6, 34] },
  { version: 7, totalCodewords: 196, ecPerBlock: 18, numBlocks: 4, alignCenters: [6, 22, 38] },
  { version: 8, totalCodewords: 242, ecPerBlock: 22, numBlocks: 4, alignCenters: [6, 24, 42] },
  { version: 9, totalCodewords: 292, ecPerBlock: 22, numBlocks: 5, alignCenters: [6, 26, 46] },
  { version: 10, totalCodewords: 346, ecPerBlock: 26, numBlocks: 5, alignCenters: [6, 28, 50] },
  { version: 11, totalCodewords: 404, ecPerBlock: 30, numBlocks: 5, alignCenters: [6, 30, 54] },
  { version: 12, totalCodewords: 466, ecPerBlock: 22, numBlocks: 8, alignCenters: [6, 32, 58] },
];

// GF(256) multiplication with primitive polynomial 0x11D
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsGeneratorPoly(degree: number): Uint8Array {
  const poly = new Uint8Array(degree);
  poly[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      poly[j] = gfMul(poly[j], root);
      if (j + 1 < degree) poly[j] ^= poly[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return poly;
}

function rsRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const rem = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ rem[0];
    rem.copyWithin(0, 1);
    rem[rem.length - 1] = 0;
    for (let i = 0; i < divisor.length; i++) {
      rem[i] ^= gfMul(divisor[i], factor);
    }
  }
  return rem;
}

function encodeBits(bytes: Uint8Array, spec: QrVersionSpec): Uint8Array {
  const dataCodewords = spec.totalCodewords - spec.ecPerBlock * spec.numBlocks;
  const capacityBits = dataCodewords * 8;
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };

  // Byte mode indicator (0100) + length (8 bits for v1..9, 16 bits for v10+)
  pushBits(0b0100, 4);
  pushBits(bytes.length, spec.version <= 9 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);

  // Terminator + byte alignment
  const termLen = Math.min(4, capacityBits - bits.length);
  pushBits(0, termLen);
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad bytes alternating 0xEC, 0x11
  let padToggle = 0;
  while (bits.length < capacityBits) {
    pushBits(padToggle % 2 === 0 ? 0xec : 0x11, 8);
    padToggle++;
  }

  const data = new Uint8Array(dataCodewords);
  for (let i = 0; i < dataCodewords; i++) {
    let val = 0;
    for (let b = 0; b < 8; b++) val = (val << 1) | bits[i * 8 + b];
    data[i] = val;
  }

  // Interleave data blocks & Reed-Solomon ECC blocks
  const numShortBlocks = spec.numBlocks - (spec.totalCodewords % spec.numBlocks);
  const shortBlockTotalLen = Math.floor(spec.totalCodewords / spec.numBlocks);
  const shortDataLen = shortBlockTotalLen - spec.ecPerBlock;
  const divisor = rsGeneratorPoly(spec.ecPerBlock);

  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < spec.numBlocks; i++) {
    const dLen = shortDataLen + (i < numShortBlocks ? 0 : 1);
    const block = data.slice(offset, offset + dLen);
    offset += dLen;
    dataBlocks.push(block);
    eccBlocks.push(rsRemainder(block, divisor));
  }

  const out = new Uint8Array(spec.totalCodewords);
  let idx = 0;
  const maxDataLen = shortDataLen + (numShortBlocks < spec.numBlocks ? 1 : 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < spec.numBlocks; b++) {
      if (i < dataBlocks[b].length) out[idx++] = dataBlocks[b][i];
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (let b = 0; b < spec.numBlocks; b++) {
      out[idx++] = eccBlocks[b][i];
    }
  }
  return out;
}

export function generateQrMatrix(text: string): boolean[][] | null {
  const bytes = new TextEncoder().encode(text);
  const spec = VERSION_SPECS_M.find((s) => {
    const dataBytes = s.totalCodewords - s.ecPerBlock * s.numBlocks;
    const overheadBits = 4 + (s.version <= 9 ? 8 : 16);
    return bytes.length * 8 + overheadBits <= dataBytes * 8;
  });
  if (!spec) return null;

  const size = spec.version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunc: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setFunc = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark;
    isFunc[y][x] = true;
  };

  // Timing patterns
  for (let i = 0; i < size; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  // 3 Finder patterns + separators
  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFunc(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  // Alignment patterns
  const centers = spec.alignCenters;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      ) {
        continue;
      }
      const cx = centers[i];
      const cy = centers[j];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunc(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve format info areas + dark module
  for (let i = 0; i <= 5; i++) setFunc(8, i, false);
  setFunc(8, 7, false);
  setFunc(8, 8, false);
  setFunc(7, 8, false);
  for (let i = 9; i < 15; i++) setFunc(14 - i, 8, false);
  for (let i = 0; i < 8; i++) setFunc(size - 1 - i, 8, false);
  for (let i = 8; i < 15; i++) setFunc(8, size - 15 + i, false);
  setFunc(8, size - 8, true);

  // Version info (v7+)
  if (spec.version >= 7) {
    let rem = spec.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vBits = (spec.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunc(a, b, bit);
      setFunc(b, a, bit);
    }
  }

  // Place data codewords in zigzag columns
  const codewords = encodeBits(bytes, spec);
  let bitIdx = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunc[y][x] && bitIdx < codewords.length * 8) {
          modules[y][x] = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
          bitIdx++;
        }
      }
    }
  }

  // Apply Mask Pattern 0 ((x + y) % 2 === 0) — universally reliable & compact
  const mask = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isFunc[y][x] && (x + y) % 2 === 0) {
        modules[y][x] = !modules[y][x];
      }
    }
  }

  // Write format info for ECC Level M (00) + mask 0 (000)
  const formatData = (0b00 << 3) | mask;
  let rem = formatData;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const fBits = ((formatData << 10) | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i++) modules[i][8] = ((fBits >>> i) & 1) !== 0;
  modules[7][8] = ((fBits >>> 6) & 1) !== 0;
  modules[8][8] = ((fBits >>> 7) & 1) !== 0;
  modules[8][7] = ((fBits >>> 8) & 1) !== 0;
  for (let i = 9; i < 15; i++) modules[8][14 - i] = ((fBits >>> i) & 1) !== 0;
  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = ((fBits >>> i) & 1) !== 0;
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = ((fBits >>> i) & 1) !== 0;

  return modules;
}

export function generateQrSvgPath(text: string): { size: number; path: string } | null {
  const matrix = generateQrMatrix(text);
  if (!matrix) return null;
  const n = matrix.length;
  const quiet = 4; // ISO/IEC 18004 §6.3.3 standard 4-module quiet zone for optical scanners
  const parts: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (matrix[y][x]) {
        parts.push(`M${x + quiet},${y + quiet}h1v1h-1z`);
      }
    }
  }
  return { size: n + quiet * 2, path: parts.join('') };
}
