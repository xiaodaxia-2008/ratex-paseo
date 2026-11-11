import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PixelRatio, Text, View } from "react-native";
import { CHAT_FONT_SIZE } from "../shared/layout";
import { mathSource } from "../shared/math";
import { renderLatexRpc } from "../shared/ratex";
import { CODE_FONT_FAMILY } from "./code-font";
import { FormulaCanvas, isWebPlatform } from "./web";
import { FormulaSource } from "./formula-source";
import { FormulaImage } from "./native-image";

export function RatexFormula({
  latex,
  displayMode,
  colors,
  platform,
  source,
  fontSize = CHAT_FONT_SIZE,
}: {
  latex: string;
  displayMode: boolean;
  colors: PluginTheme["colors"];
  platform: string;
  /** The formula exactly as written in the message, delimiters included. */
  source?: string;
  /** em size to draw at, so math in a heading matches the heading. */
  fontSize?: number;
}) {
  const renderLatex = useRpc(renderLatexRpc);
  const web = isWebPlatform(platform);
  const pixelRatio = Math.min(3, Math.max(1, PixelRatio.get()));
  const text = source ?? mathSource(latex, displayMode);
  const [sourceOpen, setSourceOpen] = useState(false);
  const showSource = useCallback(() => setSourceOpen(true), []);
  const closeSource = useCallback(() => setSourceOpen(false), []);
  useEffect(() => setSourceOpen(false), [text]);
  const query = useQuery({
    queryKey: ["ratex.render", latex, displayMode, colors.foreground, web ? "canvas" : "png", fontSize, pixelRatio],
    queryFn: () =>
      renderLatex({
        latex,
        displayMode,
        color: colors.foreground,
        ...(!web ? { bitmap: { fontSize, pixelRatio } } : {}),
      }),
    // A given (latex, mode, color) always renders to the same DisplayList.
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    // Keep the previous formula on screen while a theme change re-renders it,
    // instead of collapsing every formula and reflowing the transcript.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === latex && previousQuery.queryKey[2] === displayMode
        ? previous
        : undefined,
  });
  const result = query.data;
  const displayList = result?.ok ? result.displayList : null;
  const styles = useMemo(
    () => ({
      fallback: { color: colors.foregroundMuted, fontFamily: CODE_FONT_FAMILY, fontSize },
      wrap: {
        alignItems: "center" as const,
        alignSelf: "stretch" as const,
        paddingVertical: 8,
        width: "100%" as const,
        maxWidth: "100%" as const,
        // No userSelect: "none" here — a browser drops user-select:none subtrees from
        // the clipboard, which would hide the source text below from copy.
      },
      /**
       * The TeX source as real text: out of flow and invisible, but selectable, so a drag
       * across the message copies the formula. A canvas contributes no text of its own.
       * Deliberately no whiteSpace: Text already inherits pre-wrap, which is what keeps
       * the newlines inside a multi-line $$…$$ source.
       */
      source: {
        position: "absolute" as const,
        width: 1,
        height: 1,
        overflow: "hidden" as const,
        opacity: 0,
        userSelect: "text" as const,
      },
    }),
    [colors.foregroundMuted, fontSize],
  );

  if (sourceOpen) {
    // A native Text paragraph cannot contain the source panel's Views. Render
    // selectable inline source there; block formulas use the full copy toolbar.
    if (!web && !displayMode) return <Text selectable onPress={closeSource} style={styles.fallback}>{text}</Text>;
    return <FormulaSource source={text} colors={colors} displayMode={displayMode} onClose={closeSource} />;
  }

  // Pending requests and render failures show ordinary selectable text,
  // so they need no hidden twin.
  if (query.isError || !result || !result.ok) {
    return (
      <Text selectable style={styles.fallback}>
        {text}
      </Text>
    );
  }

  if (!web) {
    if (!result.image) return <Text selectable style={styles.fallback}>{text}</Text>;
    const image = <FormulaImage image={result.image} source={text} inline={!displayMode}
      color={colors.foregroundMuted} fontSize={fontSize} onShowSource={showSource} />;
    return displayMode ? <View style={styles.wrap}>{image}</View> : image;
  }

  if (!displayMode) {
    return (
      <>
        <Text style={styles.source}>{text}</Text>
        <FormulaCanvas
          displayList={displayList}
          backgroundColor="rgba(0,0,0,0)"
          fontSize={fontSize}
          padding={1}
          inline
          onShowSource={showSource}
        />
      </>
    );
  }

  return (
      <View style={styles.wrap}>
        <Text style={styles.source}>{text}</Text>
        <FormulaCanvas
          displayList={displayList}
          backgroundColor="rgba(0,0,0,0)"
          fontSize={fontSize}
          padding={4}
          onShowSource={showSource}
        />
      </View>
  );
}
