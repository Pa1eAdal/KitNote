import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

export type PreviewKind =
  | "heading"
  | "strong"
  | "emphasis"
  | "inline-code"
  | "link"
  | "fenced-code"
  | "blockquote"
  | "list"
  | "inline-math"
  | "block-math";

export interface PreviewRegion {
  from: number;
  to: number;
  kind: PreviewKind;
  block: boolean;
  source: string;
  mathSource?: string;
}

function overlapsExistingRegion(regions: PreviewRegion[], from: number, to: number): boolean {
  return regions.some((region) => from < region.to && to > region.from);
}

function isEscaped(source: string, position: number): boolean {
  let slashCount = 0;
  for (let index = position - 1; index >= 0 && source[index] === "\\"; index -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function isStandaloneBlock(source: string, from: number, to: number): boolean {
  const lineStart = source.lastIndexOf("\n", from - 1) + 1;
  const nextLineBreak = source.indexOf("\n", to);
  const lineEnd = nextLineBreak >= 0 ? nextLineBreak : source.length;
  return source.slice(lineStart, from).trim() === "" && source.slice(to, lineEnd).trim() === "";
}

function findMathRegions(source: string, existingRegions: PreviewRegion[]): PreviewRegion[] {
  const regions: PreviewRegion[] = [];
  let position = 0;

  while (position < source.length) {
    if (source[position] !== "$" || isEscaped(source, position)) {
      position += 1;
      continue;
    }

    const doubleDelimiter = source[position + 1] === "$";
    const delimiterLength = doubleDelimiter ? 2 : 1;
    const contentStart = position + delimiterLength;
    let close = contentStart;

    while (close < source.length) {
      if (!doubleDelimiter && source[close] === "\n") {
        close = -1;
        break;
      }
      if (
        source.startsWith(doubleDelimiter ? "$$" : "$", close) &&
        !isEscaped(source, close) &&
        (doubleDelimiter || source[close + 1] !== "$")
      ) {
        break;
      }
      close += 1;
    }

    if (close < contentStart || close >= source.length) {
      position += delimiterLength;
      continue;
    }

    const to = close + delimiterLength;
    if (close > contentStart && !overlapsExistingRegion(existingRegions, position, to)) {
      regions.push({
        from: position,
        to,
        kind: doubleDelimiter ? "block-math" : "inline-math",
        block: doubleDelimiter && isStandaloneBlock(source, position, to),
        source: source.slice(position, to),
        mathSource: source.slice(contentStart, close).trim()
      });
    }
    position = to;
  }

  return regions;
}

export function findPreviewRegions(state: EditorState): PreviewRegion[] {
  const source = state.doc.toString();
  const regions: PreviewRegion[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      let kind: PreviewKind | null = null;
      let block = false;

      if (/^ATXHeading[1-6]$/.test(node.name)) {
        kind = "heading";
        block = true;
      } else if (node.name === "StrongEmphasis") {
        kind = "strong";
      } else if (node.name === "Emphasis") {
        kind = "emphasis";
      } else if (node.name === "InlineCode") {
        kind = "inline-code";
      } else if (node.name === "Link") {
        kind = "link";
      } else if (node.name === "FencedCode") {
        kind = "fenced-code";
        block = true;
      } else if (node.name === "Blockquote") {
        kind = "blockquote";
        block = true;
      } else if (node.name === "BulletList" || node.name === "OrderedList") {
        kind = "list";
        block = true;
      }

      if (!kind || node.to <= node.from) return;
      regions.push({
        from: node.from,
        to: node.to,
        kind,
        block,
        source: source.slice(node.from, node.to)
      });
      return false;
    }
  });

  regions.push(...findMathRegions(source, regions));
  return regions.sort((left, right) => left.from - right.from || right.to - left.to);
}

export function selectionTouchesRegion(
  selection: { ranges: readonly { from: number; to: number }[] },
  region: PreviewRegion
): boolean {
  return selection.ranges.some((range) => {
    if (range.from === range.to) {
      return range.from >= region.from && range.from <= region.to;
    }
    return range.from < region.to && range.to > region.from;
  });
}
