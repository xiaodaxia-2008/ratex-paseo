import { type PluginFilePanelProps, useFileText } from "@getpaseo/plugin/client";
import { Loading } from "@getpaseo/plugin/client/ui";
import { ScrollView, Text } from "react-native";
import { RatexMarkdown } from "./message";

/** Read through the host file capability, including remote hosts and disk updates. */
export function MarkdownFilePanel({ file, theme, layout }: PluginFilePanelProps) {
  const content = useFileText(file);
  if (content.status === "loading") return <Loading />;
  if (content.status === "error") {
    return <Text selectable style={{ color: theme.colors.foreground }}>{content.error.message}</Text>;
  }
  return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
    contentContainerStyle={{ padding: layout.compact ? 16 : 24 }}>
    <RatexMarkdown key={file.path} text={content.text} theme={theme} layout={layout} />
  </ScrollView>;
}
