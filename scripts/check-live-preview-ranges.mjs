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
  let enterState = EditorState.create({
    doc: beforeEnter,
    selection: EditorSelection.cursor(beforeEnter.length),
    extensions: [noteMarkdown()]
  });
  const handled = insertNoteNewline({
    state: enterState,
    dispatch(transaction) {
      enterState = transaction.state;
    }
  });

  assert.equal(handled, true, `Enter should be handled after ${line}`);
  assert.equal(
    enterState.doc.toString(),
    `${beforeEnter}\n`,
    `Enter after ${line} should add one plain newline without changing or indenting source`
  );
}

console.log("Live Preview active-range checks passed.");
