import MarkdownIt from "markdown-it";
import katex from "katex";
import { convertFileSrc } from "@tauri-apps/api/core";

const localPathPattern = /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/;

export const isLocalPath = (value: string): boolean => localPathPattern.test(value);

export interface MathPreview {
  html: string;
  error: string | null;
}

export function renderMathPreview(source: string, displayMode: boolean): MathPreview {
  try {
    return {
      html: katex.renderToString(source, {
        displayMode,
        throwOnError: true,
        strict: "warn",
        trust: false
      }),
      error: null
    };
  } catch (error) {
    return {
      html: "",
      error: error instanceof Error ? error.message : "Invalid TeX"
    };
  }
}

function renderMath(source: string, displayMode: boolean): string {
  const preview = renderMathPreview(source, displayMode);
  if (!preview.error) {
    return preview.html;
  }

  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      strict: "warn",
      trust: false
    });
  } catch {
    return source;
  }
}

function mathPlugin(md: MarkdownIt) {
  md.inline.ruler.after("escape", "kitnote_inline_math", (state, silent) => {
    const start = state.pos;
    if (state.src[start] !== "$" || state.src[start + 1] === "$") return false;

    const end = state.src.indexOf("$", start + 1);
    if (end <= start + 1) return false;
    if (!silent) {
      const token = state.push("kitnote_inline_math", "span", 0);
      token.content = state.src.slice(start + 1, end);
    }
    state.pos = end + 1;
    return true;
  });

  md.block.ruler.after("blockquote", "kitnote_block_math", (state, startLine, _endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    const firstLine = state.src.slice(start, max).trim();
    if (!firstLine.startsWith("$$")) return false;

    let content = firstLine.slice(2);
    let nextLine = startLine;
    if (content.endsWith("$$") && content.length > 2) {
      content = content.slice(0, -2);
    } else {
      for (nextLine = startLine + 1; nextLine < state.lineMax; nextLine += 1) {
        const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
        const lineEnd = state.eMarks[nextLine];
        const line = state.src.slice(lineStart, lineEnd);
        const closeIndex = line.indexOf("$$");
        if (closeIndex >= 0) {
          content += `\n${line.slice(0, closeIndex)}`;
          break;
        }
        content += `\n${line}`;
      }
    }

    if (nextLine >= state.lineMax) return false;
    if (!silent) {
      const token = state.push("kitnote_block_math", "div", 0);
      token.block = true;
      token.content = content.trim();
      token.map = [startLine, nextLine + 1];
    }
    state.line = nextLine + 1;
    return true;
  });

  md.renderer.rules.kitnote_inline_math = (tokens, idx) => renderMath(tokens[idx].content, false);
  md.renderer.rules.kitnote_block_math = (tokens, idx) => renderMath(tokens[idx].content, true);
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
}).use(mathPlugin);

const defaultImageRenderer =
  markdown.renderer.rules.image ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

const defaultLinkOpenRenderer =
  markdown.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
  const srcIndex = tokens[idx].attrIndex("src");
  if (srcIndex >= 0) {
    const src = tokens[idx].attrs?.[srcIndex]?.[1] ?? "";
    if (isLocalPath(src)) {
      tokens[idx].attrs![srcIndex][1] = convertFileSrc(src);
    }
  }

  return defaultImageRenderer(tokens, idx, options, env, self);
};

markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const hrefIndex = tokens[idx].attrIndex("href");
  if (hrefIndex >= 0) {
    const href = tokens[idx].attrs?.[hrefIndex]?.[1] ?? "";
    tokens[idx].attrSet("data-kitnote-link", href);
    tokens[idx].attrSet("title", href);
  }
  tokens[idx].attrSet("rel", "noreferrer");

  return defaultLinkOpenRenderer(tokens, idx, options, env, self);
};

export const renderMarkdown = (source: string): string => markdown.render(source);
export const renderMarkdownInline = (source: string): string => markdown.renderInline(source);
