import { insertNewline } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, type StateCommand } from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";

export const noteMarkdown = () => markdown({ addKeymap: false });

const orderedListPattern = /^(\s*)(\d+)([.)])\s+(.*)$/;
const unorderedListPattern = /^(\s*)([-*+])\s+(.*)$/;

export const insertNoteNewline: StateCommand = ({ state, dispatch }) => {
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) {
    return insertNewline({ state, dispatch });
  }

  const cursor = state.selection.main.head;
  const line = state.doc.lineAt(cursor);
  if (cursor !== line.to) {
    return insertNewline({ state, dispatch });
  }

  const ordered = orderedListPattern.exec(line.text);
  const unordered = unorderedListPattern.exec(line.text);
  if (!ordered && !unordered) {
    return insertNewline({ state, dispatch });
  }

  const content = ordered?.[4] ?? unordered?.[3] ?? "";
  if (content.trim().length === 0) {
    dispatch(
      state.update({
        changes: { from: line.from, to: line.to, insert: state.lineBreak },
        selection: EditorSelection.cursor(line.from + state.lineBreak.length),
        scrollIntoView: true,
        userEvent: "input"
      })
    );
    return true;
  }

  let marker: string;
  if (ordered) {
    marker = `${ordered[1]}${BigInt(ordered[2]) + 1n}${ordered[3]} `;
  } else {
    marker = `${unordered![1]}${unordered![2]} `;
  }
  const insert = `${state.lineBreak}${marker}`;
  dispatch(
    state.update({
      changes: { from: cursor, insert },
      selection: EditorSelection.cursor(cursor + insert.length),
      scrollIntoView: true,
      userEvent: "input"
    })
  );
  return true;
};

export const noteEnterKeyBinding: KeyBinding = {
  key: "Enter",
  run: insertNoteNewline,
  shift: insertNewline
};
