/**
 * Code block panel — renders fenced code blocks in Markdown as a bordered panel
 * with a language label and a subtle background, so they read as code instead of
 * blending into prose.
 *
 * Pi 1.5.2 renders a fence as literal text:
 *     ```                <- printed verbatim (pi-tui markdown.js, `code` case)
 *       const x = 1;     <- 2-space indent + syntax highlight
 *     ```
 *
 * This extension wraps `Markdown.prototype.renderToken` and replaces only the
 * `code` token:
 *
 *     ╭─ typescript ─────────────────────╮
 *     │ const x = 1;                      │
 *     │ function f(): number {            │
 *     ╰───────────────────────────────────╯
 *
 * Background comes from the active theme (`toolPendingBg` by default), so the
 * panel follows /settings → Theme. Environment overrides:
 *
 *     PI_CODE_BLOCK_BG=toolSuccessBg   background token, or "none" to disable
 *     PI_CODE_BLOCK_BOX=0              no border/label, background only
 *
 * Nothing else is touched: no tools, no commands, no stored messages.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Markdown, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const PATCHED = Symbol.for("pi-code-block-panel.patched");
const ORIGINAL = Symbol.for("pi-code-block-panel.original");

const CH = { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" } as const;

type MarkdownThemeLike = {
  codeBlock: (text: string) => string;
  codeBlockBorder: (text: string) => string;
  highlightCode?: (code: string, lang?: string) => string[];
};

type ThemeLike = {
  bg: (token: string, text: string) => string;
  fg: (token: string, text: string) => string;
};

/** Truncate/pad to exactly `width` visible columns (ANSI-aware). */
function fitLine(text: string, width: number): string {
  if (width <= 0) return "";
  const visible = visibleWidth(text);
  if (visible > width) return truncateToWidth(text, width, "…", true);
  return text + " ".repeat(width - visible);
}

function renderPanel(
  code: string,
  lang: string | undefined,
  width: number,
  md: MarkdownThemeLike,
  theme: ThemeLike | undefined,
  bgToken: string | undefined,
  showBox: boolean,
): string[] {
  const body = code.replace(/\n$/, "");
  const sourceLines = body.length === 0 ? [""] : body.split("\n");
  const highlighted = md.highlightCode
    ? md.highlightCode(sourceLines.join("\n"), lang)
    : sourceLines.map((line) => md.codeBlock(line));

  const paint = (line: string) => (bgToken ? theme?.bg(bgToken, line) ?? line : line);

  if (!showBox) {
    // Background-only mode: keep Pi's 2-space indent, no fences.
    return highlighted.map((line) => paint("  " + fitLine(line ?? "", width - 2)));
  }

  // "│ " + inner + " │" costs 4 columns.
  const inner = Math.max(1, width - 4);
  const border = (s: string) => md.codeBlockBorder(s);
  const label = (lang || "text").trim() || "text";

  const labelText = ` ${label} `;
  const labelWidth = Math.min(visibleWidth(labelText), Math.max(0, width - 3));
  const dashes = Math.max(0, width - 3 - labelWidth);
  const top = border(CH.tl + CH.h) + border(labelText) + border(CH.h.repeat(dashes)) + border(CH.tr);

  const rows = highlighted.map((line) => border(CH.v) + " " + fitLine(line ?? "", inner) + " " + border(CH.v));
  const bottom = border(CH.bl + CH.h.repeat(Math.max(0, width - 2)) + CH.br);

  return [top, ...rows, bottom].map(paint);
}

export default function (pi: ExtensionAPI): void {
  let dispose: (() => void) | undefined;

  const install = (getTheme: () => ThemeLike | undefined) => {
    const proto = Markdown.prototype as unknown as {
      renderToken?: ((token: any, width: number, next?: string) => string[]) & Record<symbol, any>;
    };
    const original = proto.renderToken;
    if (typeof original !== "function") return undefined;
    // Another copy of this extension already patched the shared renderer: that is fine.
    if (original[PATCHED]) return () => {};

    // Fail safe: verify the renderer still produces the shape this patch expects.
    const identity = (t: string) => t;
    const probeTheme = {
      heading: identity, link: identity, linkUrl: identity, code: identity,
      codeBlock: identity, codeBlockBorder: identity, quote: identity,
      quoteBorder: identity, hr: identity, listBullet: identity,
      bold: identity, italic: identity, strikethrough: identity, underline: identity,
    };
    const probe = new Markdown("```text\nprobe\n```", 0, 0, probeTheme as any).render(20).map((l) => l.trimEnd());
    if (JSON.stringify(probe) !== JSON.stringify(["```text", "  probe", "```"])) {
      return undefined;
    }

    const bgSetting = process.env.PI_CODE_BLOCK_BG?.trim();
    const bgToken = bgSetting === "" ? "toolPendingBg" : bgSetting === "none" ? undefined : bgSetting ?? "toolPendingBg";
    const showBox = process.env.PI_CODE_BLOCK_BOX !== "0";

    const patched = function (this: any, token: any, width: number, next?: string) {
      if (token?.type !== "code" || typeof token.text !== "string") {
        return original.call(this, token, width, next);
      }
      const md = this.theme as MarkdownThemeLike | undefined;
      if (!md?.codeBlockBorder) return original.call(this, token, width, next);

      const lines = renderPanel(String(token.text), token.lang, width, md, getTheme(), bgToken, showBox);
      // Match Pi's spacing: blank line after a block unless a space token follows.
      if (next && next !== "space") lines.push("");
      return lines;
    };
    patched[PATCHED] = true;
    patched[ORIGINAL] = original;
    proto.renderToken = patched as any;

    return () => {
      if (proto.renderToken === (patched as any)) proto.renderToken = original;
    };
  };

  pi.on("session_start", (_event, ctx) => {
    dispose?.();
    dispose = undefined;
    if (ctx.mode !== "tui") return;
    const getTheme = () => (ctx.ui as any)?.theme as ThemeLike | undefined;
    dispose = install(getTheme);
    if (!dispose) {
      ctx.ui.notify("Code block panel: renderer not compatible, left unchanged.", "warning");
    }
  });

  pi.on("session_shutdown", () => {
    dispose?.();
    dispose = undefined;
  });
}
