import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Plus Jakarta Sans as inline @font-face rules, so payslips (preview, print, PDF, email) render in
 * the exact typeface with no network request. ~50 KB; read once per process.
 */
const DIR = path.join(process.cwd(), "node_modules/@fontsource-variable/plus-jakarta-sans/files");
const FACES = [
  { file: "plus-jakarta-sans-latin-wght-normal.woff2", range: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" },
  { file: "plus-jakarta-sans-latin-ext-wght-normal.woff2", range: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" },
];

let cached: Promise<string> | null = null;

export function payslipFontCss() {
  cached ??= Promise.all(
    FACES.map(async (f) => {
      const b64 = (await readFile(/*turbopackIgnore: true*/ path.join(DIR, f.file))).toString("base64");
      return `@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-display:block;font-weight:200 800;src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${f.range};}`;
    }),
  )
    .then((rules) => rules.join("\n"))
    .catch(() => {
      cached = null;
      return ""; // fall back to the Google Fonts link in the template
    });
  return cached;
}
