import assert from "node:assert/strict";
import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  findPreviewRegions,
  selectionTouchesRegion
} from "../src/editor/livePreviewRanges.ts";

function cursor(position) {
  return { ranges: [EditorSelection.cursor(position)] };
}

function selection(from, to) {
  return { ranges: [EditorSelection.range(from, to)] };
}

const source = "456$e^{x}$789";
const state = EditorState.create({ doc: source, extensions: [markdown()] });
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
  const sampleState = EditorState.create({ doc: `a${sample}b`, extensions: [markdown()] });
  const region = findPreviewRegions(sampleState)[0];
  assert.ok(region, `${sample} region should be detected`);
  assert.equal(selectionTouchesRegion(cursor(region.from - 1), region), false);
  assert.equal(selectionTouchesRegion(cursor(region.from), region), true);
  assert.equal(selectionTouchesRegion(cursor(region.to), region), true);
  assert.equal(selectionTouchesRegion(cursor(region.to + 1), region), false);
}

console.log("Live Preview active-range checks passed.");
