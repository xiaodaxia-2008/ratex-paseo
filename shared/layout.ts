export type FormulaMetrics = {
  width: number;
  height: number;
  depth?: number;
};

export const CHAT_FONT_SIZE = 16;

/** Paseo's default code text size (`theme.fontSize.code`). */
export const CODE_FONT_SIZE = 12;

const HEADING_SCALE = [1.6, 1.4, 1.2, 1.1, 1, 1];

/** Paseo's Settings → Appearance text sizes that its chat Markdown uses. */
export type AppearanceTextSizes = { content: number; code: number };

/** Where Paseo's web and desktop clients persist their app settings (AsyncStorage → localStorage). */
export const APP_SETTINGS_KEY = "@paseo:app-settings";

const WEB_CONTENT_FONT_SIZE = 15;
const WEB_UI_BASE_FONT_SIZE = 14;

/** Paseo's `parseClampedFontSize`: a number or numeric string, floored and clamped; else null. */
function clampedSize(value: unknown, min: number, max: number): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : null;
}

/**
 * Resolve the web client's Appearance text sizes from the stored `@paseo:app-settings` JSON the
 * way Paseo 0.14–0.15 does, including settings saved before `contentFontSize` existed (content
 * then follows the interface size). Returns null when nothing usable is stored.
 */
export function storedTextSizes(json: string | null): AppearanceTextSizes | null {
  if (!json) return null;
  let stored: unknown;
  try {
    stored = JSON.parse(json);
  } catch {
    return null;
  }
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
  const settings = stored as Record<string, unknown>;

  let content: number;
  if (settings.contentFontSize !== undefined) {
    content = clampedSize(settings.contentFontSize, 10, 21) ?? WEB_CONTENT_FONT_SIZE;
  } else {
    const uiBase =
      settings.uiBaseFontSize === undefined ? null : clampedSize(settings.uiBaseFontSize, 10, 21);
    const legacyUi =
      settings.uiFontSize === undefined ? null : clampedSize(settings.uiFontSize, 11, 24);
    content =
      uiBase ??
      (legacyUi === null ? WEB_UI_BASE_FONT_SIZE : Math.round((WEB_UI_BASE_FONT_SIZE * legacyUi) / 16));
  }
  const code = clampedSize(settings.codeFontSize, 9, 22) ?? CODE_FONT_SIZE;
  return { content, code };
}

/**
 * Paseo's chat Markdown typography (`createMarkdownStyles`): content text at the Appearance
 * content size with 1.4x line height, headings scaled from it, code at the code size. Without
 * `sizes`, Paseo's defaults apply: 15px content on web, 16px on iOS/Android, 12px code.
 */
export function messageTypography(platform: string, sizes?: AppearanceTextSizes | null) {
  const fontSize = sizes?.content ?? (platform === "web" ? WEB_CONTENT_FONT_SIZE : 16);
  const codeFontSize = sizes?.code ?? CODE_FONT_SIZE;
  return {
    fontSize,
    lineHeight: Math.round(fontSize * 1.4),
    heading(level: number) {
      const size = fontSize * HEADING_SCALE[Math.min(Math.max(level, 1), HEADING_SCALE.length) - 1];
      return { fontSize: Math.round(size), lineHeight: Math.round(size * 1.3) };
    },
    /** Code inside text of `size`: the code size in body text, scaled up in headings. */
    codeSize(size: number) {
      return Math.round((codeFontSize * size) / fontSize);
    },
  };
}

/** `depth` is optional in the DisplayList protocol; absent means zero, never NaN. */
export function formulaDepth(metrics: FormulaMetrics): number {
  return Number.isFinite(metrics.depth) ? (metrics.depth as number) : 0;
}

/**
 * Convert a RaTeX DisplayList (em units) into CSS pixels at a fixed em size.
 * `scale` is never greater than 1: wide formulas shrink to the container,
 * narrow formulas keep the same glyph size.
 *
 * The natural size is derived from the same ceil()ed device-pixel box that
 * `renderToCanvas` allocates, so the bitmap is never stretched anisotropically.
 */
export function formulaLayout(
  metrics: FormulaMetrics,
  fontSize: number,
  padding: number,
  containerWidth?: number,
  devicePixelRatio = 1,
) {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const em = fontSize * dpr;
  const pad = padding * dpr;
  const pixelWidth = Math.max(1, Math.ceil(metrics.width * em + 2 * pad));
  const pixelHeight = Math.max(1, Math.ceil((metrics.height + formulaDepth(metrics)) * em + 2 * pad));
  const naturalWidth = pixelWidth / dpr;
  const naturalHeight = pixelHeight / dpr;
  const scale =
    containerWidth && containerWidth > 0 ? Math.min(1, containerWidth / naturalWidth) : 1;
  return {
    naturalWidth,
    naturalHeight,
    scale,
    displayWidth: naturalWidth * scale,
    displayHeight: naturalHeight * scale,
  };
}
