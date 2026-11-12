import { Buffer } from "node:buffer";
import { Writable } from "node:stream";
import { gunzipSync } from "node:zlib";
import * as opentype from "opentype.js";
import { encodePNGToStream, make } from "pureimage";
import { renderToCanvas } from "../node_modules/ratex-wasm/dist/renderer.js";
import { formulaDepth, formulaLayout } from "../shared/layout.ts";
import type { DisplayList } from "../shared/ratex.ts";
import { FONT_WOFF_GZIP_BASE64 } from "./vendor/fonts.ts";
import { CJK_WOFF_BASE64 } from "./vendor/cjk-font.ts";

const fonts = new Map<string, opentype.Font>();
let fontBytes: Record<string, string> | undefined;
const cache = new Map<string, { base64: string; width: number; height: number }>();
let cacheBytes = 0;
const CACHE_BYTES = 8 * 1024 * 1024;

function resolveFont(css: string) {
  const match = /([\d.]+)px\s+(KaTeX_\w+|sans-serif)/.exec(css);
  if (!match) throw new Error(`Unsupported bitmap font: ${css}`);
  const key = `${match[2]}|${/\bbold\b/.test(css) ? "bold" : "normal"}|${/\bitalic\b/.test(css) ? "italic" : "normal"}`;
  let font = fonts.get(key);
  if (!font) {
    fontBytes ??= JSON.parse(gunzipSync(Buffer.from(FONT_WOFF_GZIP_BASE64, "base64")).toString());
    const encoded = match[2] === "sans-serif" ? CJK_WOFF_BASE64 : fontBytes![key];
    if (!encoded) throw new Error(`Missing bitmap font: ${key}`);
    const bytes = Uint8Array.from(Buffer.from(encoded, "base64"));
    font = opentype.parse(bytes.buffer);
    fonts.set(key, font);
  }
  return { font, size: Number(match[1]) };
}

/** Reuse RaTeX's Canvas renderer with a portable, pure-JavaScript rasterizer. */
export async function renderBitmap(list: DisplayList, fontSize: number, pixelRatio: number, padding: number) {
  if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 96 ||
      !Number.isFinite(pixelRatio) || pixelRatio < 1 || pixelRatio > 3) {
    throw new Error("Bitmap size or pixel ratio is out of range");
  }
  const layout = formulaLayout(list, fontSize, padding, undefined, pixelRatio);
  const width = Math.round(layout.naturalWidth * pixelRatio);
  const height = Math.round(layout.naturalHeight * pixelRatio);
  if (width > 8192 || height > 4096 || width * height > 2_000_000 || list.items.length > 10_000) {
    throw new Error("Formula bitmap exceeds the rendering budget");
  }
  const key = JSON.stringify([fontSize, pixelRatio, padding, list]);
  const cached = cache.get(key);
  if (cached) return cached;
  const bitmap = make(width, height);
  bitmap.data.fill(0);
  const context = bitmap.getContext("2d");
  // PureImage's text API does not select weight/style variants and fills glyph
  // contours separately. Feed complete font outlines to one fill instead.
  let fontCss = "";
  let dash: number[] = [];
  let start = [0, 0];
  let end = [0, 0];
  const proxy = new Proxy(context, {
    set(target, property, value) {
      if (property === "font") { fontCss = String(value); return true; }
      return Reflect.set(target, property, value);
    },
    get(target, property) {
      if (property === "fillText") return (text: string, x: number, y: number) => {
        let { font, size } = resolveFont(fontCss);
        // Some CJK punctuation is tagged Main-Regular by the layout engine.
        // Use the same CJK fallback for missing glyphs in any math face.
        if ([...text].some((character) => font.charToGlyphIndex(character) === 0)) {
          font = resolveFont(`${size}px sans-serif`).font;
        }
        if ([...text].some((character) => font.charToGlyphIndex(character) === 0)) {
          throw new Error(`Formula contains a glyph missing from the bundled fonts: ${text}`);
        }
        const path = font.getPath(text, x, y, size);
        target.beginPath();
        for (const command of path.commands) {
          switch (command.type) {
            case "M": target.moveTo(command.x, command.y); break;
            case "L": target.lineTo(command.x, command.y); break;
            case "Q": target.quadraticCurveTo(command.x1, command.y1, command.x, command.y); break;
            case "C": target.bezierCurveTo(command.x1, command.y1, command.x2, command.y2, command.x, command.y); break;
            case "Z": target.closePath(); break;
          }
        }
        target.fill();
      };
      if (property === "setLineDash") return (value: number[]) => { dash = value; };
      if (property === "restore") return () => { dash = []; target.restore(); };
      if (property === "moveTo") return (x: number, y: number) => { start = [x, y]; target.moveTo(x, y); };
      if (property === "lineTo") return (x: number, y: number) => { end = [x, y]; target.lineTo(x, y); };
      if (property === "stroke") return () => {
        if (dash.length) {
          // RaTeX emits dashed horizontal lines with equal dash/gap lengths.
          target.beginPath();
          for (let x = start[0]; x < end[0]; x += dash[0] + dash[1]) {
            target.moveTo(x, start[1]);
            target.lineTo(Math.min(x + dash[0], end[0]), end[1]);
          }
        }
        target.stroke();
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const canvas = { width, height, getContext: () => proxy };
  renderToCanvas({ ...list, depth: formulaDepth(list) } as never, canvas as never, {
    fontSize: fontSize * pixelRatio,
    padding: padding * pixelRatio,
    backgroundColor: "rgba(0,0,0,0)",
  });
  const chunks: Buffer[] = [];
  await encodePNGToStream(bitmap, new Writable({
    write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); },
  }));
  const result = { base64: Buffer.concat(chunks).toString("base64"), width: layout.naturalWidth, height: layout.naturalHeight };
  const weight = 2 * (key.length + result.base64.length);
  if (weight <= CACHE_BYTES) {
    while (cache.size >= 128 || cacheBytes + weight > CACHE_BYTES) {
      const oldest = cache.keys().next().value!;
      const entry = cache.get(oldest)!;
      cacheBytes -= 2 * (oldest.length + entry.base64.length);
      cache.delete(oldest);
    }
    cache.set(key, result);
    cacheBytes += weight;
  }
  return result;
}
