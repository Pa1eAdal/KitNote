import type { AppData, Note } from "../types";

export function isNoteVisible(note: Note): boolean {
  return note.window.visible === true;
}

export function visibleNotes(notes: Note[]): Note[] {
  return notes.filter(isNoteVisible);
}

function mostRecentlyUpdated(notes: Note[]): Note | undefined {
  return notes.reduce<Note | undefined>(
    (latest, note) => (!latest || note.updatedAt > latest.updatedAt ? note : latest),
    undefined
  );
}

function preferredFallbackNote(notes: Note[]): Note | undefined {
  return (
    mostRecentlyUpdated(notes.filter((note) => note.content.trim().length > 0)) ??
    mostRecentlyUpdated(notes)
  );
}

export function ensureAtLeastOneVisibleNote(data: AppData): AppData {
  if (data.notes.length === 0 || data.notes.some(isNoteVisible)) {
    return data;
  }
  const fallback = preferredFallbackNote(data.notes);
  if (!fallback) return data;

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
  return mostRecentlyUpdated(visibleNotes(notes)) ?? preferredFallbackNote(notes);
}
