/// <reference types="vite/client" />

declare module 'exifr/dist/lite.esm.js' {
  export function parse(input: unknown, options?: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  const exifr: {
    parse: typeof parse;
  };
  export default exifr;
}
