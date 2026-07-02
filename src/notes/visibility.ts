import type { AppData, Note } from "../types";

export function isNoteVisible(note: Note): boolean {
  return note.window.visible === true;
}

export function visibleNotes(notes: Note[]): Note[] {
  return notes.filter(isNoteVisible);
}

export function ensureAtLeastOneVisibleNote(data: AppData): AppData {
  if (data.notes.length === 0 || data.notes.some(isNoteVisible)) {
    return data;
  }
  const fallback = data.notes.reduce((latest, note) =>
    note.updatedAt > latest.updatedAt ? note : latest
  );
  return {
    ...data,
    notes: data.notes.map((note) => ({
      ...note,
      window: {
        ...note.window,
        visible: note.id === fallback.id
      }
    }))
  };
}

export function selectStartupNote(notes: Note[], requestedNoteId: string | null): Note | undefined {
  if (requestedNoteId) {
    return notes.find((note) => note.id === requestedNoteId);
  }
  return visibleNotes(notes)[0] ?? notes[0];
}
