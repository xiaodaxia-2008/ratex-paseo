import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire, isBuiltin } from "node:module";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../../", import.meta.url));
await mkdir(new URL("../../test-results/", import.meta.url), { recursive: true });
const output = new URL("../../test-results/native-components.mjs", import.meta.url);
await build({
  entryPoints: [fileURLToPath(new URL("fixture.jsx", import.meta.url))],
  outfile: fileURLToPath(output),
  bundle: true, platform: "node", format: "esm", jsx: "automatic",
  packages: "external",
  plugins: [{ name: "native-host-fixture", setup(builder) {
    builder.onResolve({ filter: /^(react-native|@getpaseo\/plugin(?:\/.*)?)$/ }, ({ path }) => ({ path, namespace: "host" }));
    builder.onLoad({ filter: /.*/, namespace: "host" }, ({ path }) => ({ loader: "js", contents:
      path === "react-native" ? `
        export const Text = "Text", View = "View", Image = "Image", Pressable = "Pressable", ScrollView = "ScrollView";
        export const PixelRatio = {get: () => 3}; export const Platform = {OS: "android"};
        export const useWindowDimensions = () => ({width: 390, height: 844});`
        : path.endsWith("/client/ui") ? `export const copyText = async (value) => { globalThis.copied = value; };`
        : path.endsWith("/client") ? `export const useRpc = () => globalThis.nativeRpc;`
        : `export const defineRpc = (contract) => contract;`,
    }));
  } }],
});
await import(output.href);

// Paseo evaluates the daemon bundle with its own require function, not from the
// source directory. Catch unbundled dependencies and relative asset reads here.
const backend = await build({
  entryPoints: [fileURLToPath(new URL("../../index.server.ts", import.meta.url))],
  bundle: true, platform: "node", format: "cjs", write: false,
  external: ["@getpaseo/plugin", "@getpaseo/plugin/server", "zod"],
});
const nodeRequire = createRequire(import.meta.url);
const module = { exports: {} };
const runtimeRequire = (name) => {
  if (name === "@getpaseo/plugin") return { defineRpc: (contract) => contract };
  if (name === "zod" || isBuiltin(name)) return nodeRequire(name);
  throw new Error(`Dependency escaped daemon bundle: ${name}`);
};
new Function("require", "exports", "module", backend.outputFiles[0].text)(runtimeRequire, module.exports, module);
let contract, handler;
module.exports.default({ handle(rpc, callback) { contract = rpc; handler = callback; } });
const input = contract.input.parse({ latex: "\\text{状态}=(x,a),\\qquad \\text{控制}=j", displayMode: true, bitmap: { fontSize: 20, pixelRatio: 2 } });
const result = contract.output.parse(await handler(input));
assert.ok(result.ok && result.image?.base64.startsWith("iVBOR"));
console.log("Daemon bundle harness: bundled renderer, embedded fonts, RPC schemas and PNG output passed.");
