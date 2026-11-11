import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { test } from "node:test";
import { URL } from "node:url";
import { renderLatex } from "../server/render.ts";
import { DEFAULT_LATEX } from "../shared/ratex.ts";

async function render(latex: string, color = "#eeeeee", displayMode = true, pixelRatio = 2) {
  const result = await renderLatex({ latex, displayMode, color, bitmap: { fontSize: 20, pixelRatio } });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok || !result.image) throw new Error("No bitmap returned");
  const bytes = Buffer.from(result.image.base64, "base64");
  const png = PNG.sync.read(bytes);
  assert.equal(png.width, Math.round(result.image.width * pixelRatio));
  assert.equal(png.height, Math.round(result.image.height * pixelRatio));
  return { png, bytes, result };
}

test("native rendering produces transparent PNGs for fractions, roots, integrals and matrices", async () => {
  await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
  const fixtures = [DEFAULT_LATEX, "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}",
    "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}", "\\mathbb{R} \\neq \\mathcal{F} + \\mathbf{x}"];
  for (const [index, latex] of fixtures.entries()) {
    const { png, bytes } = await render(latex);
    let transparent = 0, painted = 0;
    for (let offset = 3; offset < png.data.length; offset += 4) {
      if (png.data[offset] === 0) transparent++;
      else painted++;
    }
    assert.ok(transparent > 0 && painted > 20, "Bitmap must contain glyphs on a transparent background");
    await writeFile(new URL(`../test-results/native-${index}.png`, import.meta.url), bytes);
  }
});

test("theme color and pixel density affect native pixels while preserving logical dimensions", async () => {
  const light = await render("x^2", "#ffffff", false, 1);
  const dark = await render("x^2", "#000000", false, 3);
  assert.ok(Math.abs(light.result.image!.width - dark.result.image!.width) <= 1);
  assert.ok(Math.abs(light.result.image!.height - dark.result.image!.height) <= 1);
  assert.ok(dark.png.width >= light.png.width * 2);
  const firstPainted = (png: PNG) => {
    for (let offset = 0; offset < png.data.length; offset += 4) {
      if (png.data[offset + 3] > 128) return png.data[offset];
    }
    throw new Error("No opaque glyph pixels");
  };
  assert.equal(firstPainted(light.png), 255);
  assert.equal(firstPainted(dark.png), 0);
});

test("native failures use the source fallback contract and reject excessive bitmap dimensions", async () => {
  for (const latex of ["\\notARealCommand{x}", "x".repeat(4096)]) {
    const result = await renderLatex({ latex, displayMode: true, bitmap: { fontSize: 20, pixelRatio: 3 } });
    assert.equal(result.ok, false);
  }
  const result = await renderLatex({ latex: "x", displayMode: false, bitmap: { fontSize: 20, pixelRatio: 100 } });
  assert.equal(result.ok, false);
});

test("web requests still return only drawing instructions, native bitmaps are cached", async () => {
  const web = await renderLatex({ latex: "x", displayMode: false });
  assert.ok(web.ok && !web.image);
  const first = await render("x");
  const second = await render("x");
  assert.equal(first.result.image, second.result.image);
});
