import assert from "node:assert/strict";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  findPreviewRegions,
  selectPreviewRegions,
  selectionTouchesRegion
} from "../src/editor/livePreviewRanges.ts";
import { insertNoteNewline, noteMarkdown } from "../src/editor/noteMarkdown.ts";

function cursor(position) {
  return { ranges: [EditorSelection.cursor(position)] };
}

function selection(from, to) {
  return { ranges: [EditorSelection.range(from, to)] };
}

function pressEnter(source, position = source.length, rangeFrom = position, rangeTo = position) {
  let enterState = EditorState.create({
    doc: source,
    selection: EditorSelection.range(rangeFrom, rangeTo),
    extensions: [noteMarkdown()]
  });
  const handled = insertNoteNewline({
    state: enterState,
    dispatch(transaction) {
      enterState = transaction.state;
    }
  });
  return {
    handled,
    source: enterState.doc.toString(),
    cursor: enterState.selection.main.head
  };
}

const source = "456$e^{x}$789";
const state = EditorState.create({ doc: source, extensions: [noteMarkdown()] });
const inlineMath = findPreviewRegions(state).find((region) => region.kind === "inline-math");

assert.ok(inlineMath, "inline math region should be detected");
assert.deepEqual(
  { from: inlineMath.from, to: inlineMath.to, source: inlineMath.source },
  { from: 3, to: 10, source: "$e^{x}$" }
);

assert.equal(selectionTouchesRegion(cursor(2), inlineMath), false, "between 5 and 6 stays rendered");
assert.equal(selectionTouchesRegion(cursor(3), inlineMath), true, "before opening $ shows source");
assert.equal(selectionTouchesRegion(cursor(6), inlineMath), true, "inside math shows source");
assert.equal(selectionTouchesRegion(cursor(10), inlineMath), true, "after closing $ shows source");
assert.equal(selectionTouchesRegion(cursor(11), inlineMath), false, "between 7 and 8 stays rendered");

assert.equal(selectionTouchesRegion(selection(1, 3), inlineMath), false, "near selection stays rendered");
assert.equal(selectionTouchesRegion(selection(2, 4), inlineMath), true, "overlapping selection shows source");
assert.equal(selectionTouchesRegion(selection(10, 11), inlineMath), false, "selection after math stays rendered");

for (const sample of ["**bold**", "*italic*", "`code`", "[link](https://example.com)"]) {
  const sampleState = EditorState.create({ doc: `a${sample}b`, extensions: [noteMarkdown()] });
  const region = findPreviewRegions(sampleState)[0];
  assert.ok(region, `${sample} region should be detected`);
  assert.equal(selectionTouchesRegion(cursor(region.from - 1), region), false);
  assert.equal(selectionTouchesRegion(cursor(region.from), region), true);
  assert.equal(selectionTouchesRegion(cursor(region.to), region), true);
  assert.equal(selectionTouchesRegion(cursor(region.to + 1), region), false);
}

const listSource = "1.xxx$e^{x}$\n2. xxx";
const listState = EditorState.create({ doc: listSource, extensions: [noteMarkdown()] });
const listRegions = findPreviewRegions(listState);
const listMath = listRegions.find((region) => region.kind === "inline-math");
const secondItemCursor = listSource.indexOf("2. xxx") + 3;

assert.ok(listMath, "inline math inside a list should keep its own region");
assert.equal(selectionTouchesRegion(cursor(secondItemCursor), listMath), false);
assert.deepEqual(
  selectPreviewRegions(cursor(secondItemCursor), listRegions)
    .filter((region) => region.kind === "inline-math")
    .map((region) => region.kind),
  ["inline-math"],
  "editing the second item should leave first-item math rendered"
);

const paragraphSource = "1.xxx$e^{x}$\n2. xxx\na\nab\nabc\nabcd\n123\n1234";
const paragraphState = EditorState.create({ doc: paragraphSource, extensions: [noteMarkdown()] });
const paragraphRegions = findPreviewRegions(paragraphState);

assert.equal(
  paragraphRegions.some((region) => region.block && region.from < paragraphSource.length),
  false,
  "list-like lines and following paragraphs must remain editable source instead of a block widget"
);
assert.deepEqual(
  paragraphSource.split("\n").slice(2),
  ["a", "ab", "abc", "abcd", "123", "1234"],
  "post-list lines must remain unchanged"
);
for (let lineNumber = 3; lineNumber <= 8; lineNumber += 1) {
  const line = paragraphState.doc.line(lineNumber);
  assert.equal(
    paragraphRegions.some((region) => region.from < line.to && region.to > line.from),
    false,
    `no preview decoration should cover post-list line ${lineNumber}`
  );
}
assert.ok(
  paragraphRegions.some(
    (region) => region.kind === "inline-math" && region.source === "$e^{x}$"
  ),
  "inline math should still render independently inside source-style list lines"
);

for (const line of ["a", "ab", "abc", "abcd", "123", "1234"]) {
  const beforeEnter = `${listSource}\n${line}`;
  const result = pressEnter(beforeEnter);

  assert.equal(result.handled, true, `Enter should be handled after ${line}`);
  assert.equal(
    result.source,
    `${beforeEnter}\n`,
    `Enter after ${line} should add one plain newline without changing or indenting source`
  );
}

for (const [before, after] of [
  ["1. 123", "1. 123\n2. "],
  ["9. abc", "9. abc\n10. "],
  ["1) abc", "1) abc\n2) "],
  ["  1. nested", "  1. nested\n  2. "],
  ["- abc", "- abc\n- "],
  ["* abc", "* abc\n* "],
  ["+ abc", "+ abc\n+ "],
  ["  - nested", "  - nested\n  - "]
]) {
  const result = pressEnter(before);
  assert.equal(result.handled, true);
  assert.equal(result.source, after, `Enter should continue list item: ${before}`);
  assert.equal(result.cursor, after.length, "cursor should follow the inserted list marker");
}

for (const [before, after] of [
  ["1. abc\n2. ", "1. abc\n\n"],
  ["- abc\n- ", "- abc\n\n"],
  ["  1. nested\n  2. ", "  1. nested\n\n"],
  ["  - nested\n  - ", "  - nested\n\n"]
]) {
  const result = pressEnter(before);
  assert.equal(result.handled, true);
  assert.equal(result.source, after, `Enter should exit an empty list item: ${before}`);
  assert.equal(result.cursor, after.length, "cursor should move to the normal blank line");
}

const selectedText = "1. abc";
assert.deepEqual(
  pressEnter(selectedText, selectedText.length, 3, selectedText.length),
  { handled: true, source: "1. \n", cursor: 4 },
  "a non-empty selection should use plain Enter behavior"
);

assert.equal(
  pressEnter("1. abc tail", 6).source,
  "1. abc\n tail",
  "Enter before the end of a list line should remain a plain newline"
);
assert.equal(
  pressEnter("1.xxx").source,
  "1.xxx\n",
  "a marker without following whitespace is ordinary text"
);

console.log("Live Preview active-range checks passed.");
