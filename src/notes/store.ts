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
    const note = await invokeCommand<Note>("create_note_window", { source });
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const label = `note-${note.id}`;
    const windowUrl = `/?noteId=${encodeURIComponent(note.id)}`;
    const webview = new WebviewWindow(label, {
      url: windowUrl,
      title: "KitNote",
      width: note.window.width,
      height: note.window.height,
      minWidth: 260,
      minHeight: 220,
      resizable: true,
      decorations: false,
      transparent: true,
      alwaysOnTop: note.settings.alwaysOnTop,
      shadow: false,
      focus: true
    });

    await waitForWindowCreation(webview, label);
    return note;
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

async function waitForWindowCreation(webview: import("@tauri-apps/api/webviewWindow").WebviewWindow, label: string) {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      settle(() => reject(new Error(`Timed out while creating ${label}.`)));
    }, 8000);

    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      finish();
    };

    void webview.once("tauri://created", () => {
      console.info("KitNote note window created", { label });
      settle(resolve);
    });

    void webview.once<unknown>("tauri://error", (event) => {
      console.error("KitNote note window creation failed", { label, error: event.payload });
      settle(() => reject(new Error(String(event.payload ?? `Could not create ${label}.`))));
    });
  });
}
