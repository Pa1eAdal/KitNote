import type { AppData, Note, NoteSettings } from "../types";
import { DEFAULT_NOTE_HEIGHT, DEFAULT_NOTE_WIDTH } from "../types";

export const defaultNoteSettings: NoteSettings = {
  alwaysOnTop: true,
  backgroundColor: "#fff3a6",
  fontColor: "#231f1a",
  fontFamily: "Segoe UI, system-ui, sans-serif",
  fontSize: 16,
  opacity: 0.96,
  cornerRadius: 18
};

export const createEmptyNote = (settings: NoteSettings = defaultNoteSettings): Note => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "Untitled note",
    content: "",
    createdAt: now,
    updatedAt: now,
    settings: { ...settings },
    window: {
      width: DEFAULT_NOTE_WIDTH,
      height: DEFAULT_NOTE_HEIGHT
    },
    images: [],
    links: []
  };
};

export const defaultAppData = (): AppData => ({
  schemaVersion: 1,
  globalSettings: {
    restoreAllNotesOnLaunch: true,
    confirmRiskyLocalLinks: true
  },
  notes: [createEmptyNote()]
});
