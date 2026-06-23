import type { AppData, Note, NoteWindowState } from "../types";
import { defaultAppData } from "../settings/defaults";
import { invokeCommand, isTauriRuntime } from "../utils/tauri";

const browserStorageKey = "kitnote.dev.notes";
const newNoteGap = 16;

interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
    const sourceWindow = await readCurrentWindowState(source.window);
    const workArea = await readCurrentWorkArea();
    const template = createNoteFromTemplate(source, sourceWindow, workArea);
    const note = await invokeCommand<Note>("create_note_window", { source: template });
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const label = `note-${note.id}`;
    const windowUrl = `/?noteId=${encodeURIComponent(note.id)}`;
    const webview = new WebviewWindow(label, {
      url: windowUrl,
      title: "KitNote",
      width: note.window.width,
      height: note.window.height,
      x: note.window.x,
      y: note.window.y,
      minWidth: 260,
      minHeight: 220,
      preventOverflow: { width: newNoteGap, height: newNoteGap },
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

  return createNoteFromTemplate(source, source.window);
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

export function createNoteFromTemplate(source: Note, sourceWindow: NoteWindowState, workArea?: WorkArea): Note {
  const now = new Date().toISOString();
  const size = {
    width: sourceWindow.width,
    height: sourceWindow.height
  };
  const position = calculateNewNotePosition(sourceWindow, size, workArea);

  return {
    ...source,
    id: crypto.randomUUID(),
    title: "Untitled note",
    content: "",
    createdAt: now,
    updatedAt: now,
    settings: { ...source.settings },
    window: {
      ...size,
      ...position
    },
    images: [],
    links: []
  };
}

export function calculateNewNotePosition(
  sourceWindow: NoteWindowState,
  newNoteSize: Pick<NoteWindowState, "width" | "height">,
  workArea?: WorkArea
): Pick<NoteWindowState, "x" | "y"> {
  const minX = workArea?.x ?? 0;
  const minY = workArea?.y ?? 0;
  const maxX = workArea ? workArea.x + workArea.width : Number.POSITIVE_INFINITY;
  const maxY = workArea ? workArea.y + workArea.height : Number.POSITIVE_INFINITY;
  const sourceX = sourceWindow.x ?? minX + newNoteGap;
  const sourceY = sourceWindow.y ?? minY + newNoteGap;
  const sourceWidth = sourceWindow.width;
  const sourceHeight = sourceWindow.height;
  const newWidth = newNoteSize.width;
  const newHeight = newNoteSize.height;

  const rightX = sourceX + sourceWidth + newNoteGap;
  if (rightX + newWidth <= maxX) {
    return { x: rightX, y: clamp(sourceY, minY, maxY - newHeight) };
  }

  const leftX = sourceX - newWidth - newNoteGap;
  if (leftX >= minX) {
    return { x: leftX, y: clamp(sourceY, minY, maxY - newHeight) };
  }

  const belowY = sourceY + sourceHeight + newNoteGap;
  if (belowY + newHeight <= maxY) {
    return { x: clamp(sourceX, minX, maxX - newWidth), y: belowY };
  }

  const aboveY = sourceY - newHeight - newNoteGap;
  if (aboveY >= minY) {
    return { x: clamp(sourceX, minX, maxX - newWidth), y: aboveY };
  }

  return {
    x: clamp(rightX, minX, maxX - newWidth),
    y: clamp(sourceY, minY, maxY - newHeight)
  };
}

async function readCurrentWindowState(fallback: NoteWindowState): Promise<NoteWindowState> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const currentWindow = getCurrentWindow();
    const scaleFactor = await currentWindow.scaleFactor();
    const [position, size] = await Promise.all([currentWindow.outerPosition(), currentWindow.outerSize()]);
    const logicalPosition = position.toLogical(scaleFactor);
    const logicalSize = size.toLogical(scaleFactor);

    return {
      x: Math.round(logicalPosition.x),
      y: Math.round(logicalPosition.y),
      width: Math.round(logicalSize.width),
      height: Math.round(logicalSize.height)
    };
  } catch (error) {
    console.warn("KitNote could not read current window geometry; using saved note window state.", error);
    return fallback;
  }
}

async function readCurrentWorkArea(): Promise<WorkArea | undefined> {
  try {
    const { currentMonitor } = await import("@tauri-apps/api/window");
    const monitor = await currentMonitor();
    if (!monitor) return undefined;

    const position = monitor.workArea.position.toLogical(monitor.scaleFactor);
    const size = monitor.workArea.size.toLogical(monitor.scaleFactor);
    return {
      x: Math.round(position.x),
      y: Math.round(position.y),
      width: Math.round(size.width),
      height: Math.round(size.height)
    };
  } catch (error) {
    console.warn("KitNote could not read current monitor work area; using offset-only note placement.", error);
    return undefined;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(max) || max < min) return min;
  return Math.min(Math.max(value, min), max);
}
