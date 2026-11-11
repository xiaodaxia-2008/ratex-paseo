import assert from "node:assert/strict";
import React from "react";
import { act, create } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RatexFormula } from "../../client/formula-view.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const colors = { foreground: "#eee", foregroundMuted: "#aaa", surface2: "#222", border: "#444" };
const image = { base64: "fixture", width: 80, height: 30 };
const calls = [];
globalThis.nativeRpc = async (input) => {
  calls.push(input);
  return { ok: true, displayList: { width: 1, height: 1, items: [] }, image };
};
const event = { stopPropagation() {} };

for (const platform of ["android", "ios"]) {
  for (const displayMode of [false, true]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let tree;
    await act(async () => {
      tree = create(<QueryClientProvider client={client}>
        <RatexFormula latex="x^2" source="$x^2$" displayMode={displayMode} platform={platform} colors={colors} />
      </QueryClientProvider>);
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
    const picture = tree.root.findByType("Image");
    assert.equal(picture.props.source.uri, "data:image/png;base64,fixture");
    assert.equal(picture.props.style.width, 80);
    assert.equal(calls.at(-1).bitmap.pixelRatio, 3);
    if (!displayMode) {
      assert.equal(tree.root.findAllByType("View").length, 0, "inline math must not insert native Views into Text");
      await act(async () => tree.root.findByProps({ accessibilityRole: "button" }).props.onPress(event));
      assert.equal(tree.root.findAllByType("Image").length, 0);
      const source = tree.root.findByType("Text");
      assert.equal(source.props.children, "$x^2$");
      assert.equal(source.props.selectable, true);
      await act(async () => source.props.onPress());
      assert.equal(tree.root.findAllByType("Image").length, 1);
    } else {
      assert.equal(tree.root.findAllByType("ScrollView").length, 1);
      await act(async () => tree.root.findByType("Pressable").props.onPress());
      await act(async () => tree.root.findByProps({ accessibilityLabel: "Copy formula source" }).props.onPress(event));
      assert.equal(globalThis.copied, "$x^2$");
      await act(async () => tree.root.findByProps({ accessibilityLabel: "Show formula" }).props.onPress(event));
    }
    await act(async () => tree.root.findByType("Image").props.onError());
    assert.equal(tree.root.findAllByType("Image").length, 0, "decode errors must show source");
    await act(async () => tree.unmount());
    client.clear();
  }
}
console.log("Native component harness: Android/iOS inline/block images, source/copy/restore, decode failure passed (no device).");
