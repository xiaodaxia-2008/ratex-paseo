import { useState } from "react";
import { Image, Pressable, ScrollView, Text, useWindowDimensions } from "react-native";

/** Native inline Images can be nested inside Text; native Views cannot. */
export function FormulaImage({ image, source, inline, color, fontSize, onShowSource }: {
  image: { base64: string; width: number; height: number };
  source: string;
  inline: boolean;
  color: string;
  fontSize: number;
  onShowSource: () => void;
}) {
  const [failedUri, setFailedUri] = useState<string>();
  const window = useWindowDimensions();
  const scale = inline ? Math.min(1, Math.max(1, window.width - 48) / image.width) : 1;
  const uri = `data:image/png;base64,${image.base64}`;
  if (failedUri === uri) return <Text selectable style={{ color, fontSize }}>{source}</Text>;
  const picture = <Image
    source={{ uri }}
    style={{ width: image.width * scale, height: image.height * scale }}
    resizeMode="contain"
    accessibilityLabel={source}
    onError={() => setFailedUri(uri)}
  />;
  if (inline) {
    return <Text accessibilityRole="button" accessibilityLabel="View formula source"
      onPress={(event) => { event.stopPropagation(); onShowSource(); }}>{picture}</Text>;
  }
  return <ScrollView horizontal style={{ maxWidth: "100%" }}>
    <Pressable accessibilityRole="button" accessibilityLabel="View formula source" onPress={onShowSource}>
      {picture}
    </Pressable>
  </ScrollView>;
}
