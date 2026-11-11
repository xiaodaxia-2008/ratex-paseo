import type { RpcInput } from "@getpaseo/plugin";
import { initRatex, renderLatexToDisplayList } from "./ratex.ts";
import { MAX_LATEX_LENGTH, renderLatexRpc } from "../shared/ratex.ts";
import { renderBitmap } from "./bitmap.ts";

export async function renderLatex({ latex, displayMode, color, bitmap }: RpcInput<typeof renderLatexRpc>) {
  try {
    // Inside the try: a WASM init failure must reach the client as ok:false, not as a
    // rejected RPC that bypasses the contract.
    if (latex.length > MAX_LATEX_LENGTH) {
      throw new Error(`formula is ${latex.length} characters, over the ${MAX_LATEX_LENGTH} limit`);
    }
    await initRatex();
    const displayList = renderLatexToDisplayList(latex, { displayMode, color });
    const image = bitmap ? await renderBitmap(displayList, bitmap.fontSize, bitmap.pixelRatio, displayMode ? 4 : 1) : undefined;
    return { ok: true as const, displayList, ...(image ? { image } : {}) };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
