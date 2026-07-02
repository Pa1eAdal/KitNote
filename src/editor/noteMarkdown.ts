import { insertNewline } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import type { KeyBinding } from "@codemirror/view";

export const noteMarkdown = () => markdown({ addKeymap: false });

export const insertNoteNewline = insertNewline;

export const noteEnterKeyBinding: KeyBinding = {
  key: "Enter",
  run: insertNoteNewline,
  shift: insertNoteNewline
};
