import type { AppData, Note } from "../types";
import { defaultAppData } from "../settings/defaults";
import { invokeCommand, isTauriRuntime } from "../utils/tauri";

const browserStorageKey = "kitnote.dev.notes";

export const loadAppData = async (): Promise<AppData> => {
  if (isTauriRuntime()) {
    return invokeCommand<AppData>("load_app_data");
  }

  const stored = localStorage.getItem(browserStorageKey);
  return stored ? (JSON.parse(stored) as AppData) : defaultAppData();
};

export const saveNote = async (note: Note): Promise<AppData> => {
  if (isTauriRuntime()) {
    return invokeCommand<AppData>("save_note", { note });
  }

  const current = await loadAppData();
  const notes = current.notes.some((item) => item.id === note.id)
    ? current.notes.map((item) => (item.id === note.id ? note : item))
    : [...current.notes, note];
  const next = { ...current, notes };
  localStorage.setItem(browserStorageKey, JSON.stringify(next));
  return next;
};

export const createNoteWindow = async (source: Note): Promise<Note> => {
  if (isTauriRuntime()) {
    return invokeCommand<Note>("create_note_window", { source });
  }

  return {
    ...source,
    id: crypto.randomUUID(),
    title: "Untitled note",
    content: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    images: [],
    links: []
  };
};
