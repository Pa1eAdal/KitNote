import assert from "node:assert/strict";
import {
  ensureAtLeastOneVisibleNote,
  selectStartupNote,
  visibleNotes
} from "../src/notes/visibility.ts";

const note = (id, updatedAt, visible) => ({
  id,
  title: id,
  content: "",
  createdAt: updatedAt,
  updatedAt,
  settings: {},
  window: { width: 360, height: 420, visible },
  images: [],
  links: []
});

const hiddenData = {
  schemaVersion: 1,
  globalSettings: {
    restoreAllNotesOnLaunch: true,
    confirmRiskyLocalLinks: true
  },
  notes: [
    note("older", "2026-01-01T00:00:00Z", false),
    note("newer", "2026-01-02T00:00:00Z", false)
  ]
};

const recovered = ensureAtLeastOneVisibleNote(hiddenData);
assert.notEqual(recovered, hiddenData, "all-hidden data should receive a visible startup fallback");
assert.deepEqual(visibleNotes(recovered.notes).map(({ id }) => id), ["newer"]);
assert.equal(hiddenData.notes.every(({ window }) => window.visible === false), true, "input stays immutable");
assert.equal(selectStartupNote(recovered.notes, null)?.id, "newer");
assert.equal(
  selectStartupNote(recovered.notes, "older")?.id,
  "older",
  "an explicitly requested hidden note remains addressable for recovery"
);

const alreadyVisible = {
  ...hiddenData,
  notes: [
    note("open", "2026-01-01T00:00:00Z", true),
    note("newer-open", "2026-01-03T00:00:00Z", true),
    note("hidden", "2026-01-02T00:00:00Z", false)
  ]
};
assert.equal(ensureAtLeastOneVisibleNote(alreadyVisible), alreadyVisible);
assert.deepEqual(visibleNotes(alreadyVisible.notes).map(({ id }) => id), ["open", "newer-open"]);
assert.equal(
  selectStartupNote(alreadyVisible.notes, null)?.id,
  "newer-open",
  "the main window should use the most recently updated visible note"
);

const olderNonEmpty = note("older-non-empty", "2026-01-01T00:00:00Z", false);
olderNonEmpty.content = "saved content";
const allHiddenWithNewerBlank = {
  ...hiddenData,
  notes: [
    olderNonEmpty,
    note("newer-blank", "2026-01-02T00:00:00Z", false)
  ]
};
const nonEmptyFallback = ensureAtLeastOneVisibleNote(allHiddenWithNewerBlank);
assert.deepEqual(
  visibleNotes(nonEmptyFallback.notes).map(({ id }) => id),
  ["older-non-empty"],
  "an all-hidden startup should prefer the most recently updated non-empty note"
);

const threeNotesAfterClosingTwo = {
  ...hiddenData,
  notes: [
    note("left-open", "2026-01-01T00:00:00Z", true),
    note("closed-two", "2026-01-02T00:00:00Z", false),
    note("closed-three", "2026-01-03T00:00:00Z", false)
  ]
};
const nextStartup = ensureAtLeastOneVisibleNote(threeNotesAfterClosingTwo);
assert.equal(nextStartup, threeNotesAfterClosingTwo);
assert.deepEqual(
  visibleNotes(nextStartup.notes).map(({ id }) => id),
  ["left-open"],
  "startup should restore only the note left open at the end of the previous session"
);
assert.equal(nextStartup.notes.length, 3, "closed note content should remain stored");

console.log("Note visibility and startup selection checks passed.");
