import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { BottomToolbar } from "./components/BottomToolbar";
import { LinkDialog } from "./components/LinkDialog";
import { LivePreviewEditor, type LivePreviewEditorHandle } from "./components/LivePreviewEditor";
import { ResizeHandles } from "./components/ResizeHandles";
import { SettingsMenu } from "./components/SettingsMenu";
import { TopToolbar } from "./components/TopToolbar";
import { createEmptyNote, defaultNoteSettings } from "./settings/defaults";
import { SerializedTaskQueue, withClosingState, withTimeout } from "./notes/saveQueue";
import { createNoteWindow, loadAppData, restoreSavedNoteWindows, saveNote } from "./notes/store";
import type { AppData, CopiedImage, Hyperlink, Note, NoteSettings } from "./types";
import { invokeCommand, isTauriRuntime } from "./utils/tauri";

const appVersion = "0.2.0";
const autosaveDelayMs = 450;
const closeSaveTimeoutMs = 10_000;
const windowCloseTimeoutMs = 5_000;

function logClose(message: string, details: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.info(`[KitNote close] ${message}`, details);
  }
}

function noteIdFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get("noteId");
}

export default function App() {
  const editorRef = useRef<LivePreviewEditorHandle | null>(null);
  const noteRef = useRef<Note | null>(null);
  const persistedUpdatedAtRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef(new SerializedTaskQueue());
  const closeInProgressRef = useRef(false);
  const restoreStartedRef = useRef(false);
  const [appData, setAppData] = useState<AppData | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [closingNote, setClosingNote] = useState(false);
  const [status, setStatus] = useState("Loading KitNote...");

  noteRef.current = note;

  const queueSave = useCallback((snapshot: Note): Promise<AppData> => {
    return saveQueueRef.current.enqueue(async () => {
      const windowLabel = isTauriRuntime() ? getCurrentWindow().label : "browser";
      const next = { ...snapshot, updatedAt: new Date().toISOString() };
      logClose("Rust save command starts", { noteId: snapshot.id, windowLabel });
      try {
        const data = await saveNote(next, persistedUpdatedAtRef.current);
        persistedUpdatedAtRef.current = next.updatedAt;
        setAppData(data);
        setStatus("Saved locally");
        logClose("Rust save command succeeds", { noteId: snapshot.id, windowLabel });
        return data;
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Save failed");
        console.error("[KitNote close] Rust save command fails", {
          noteId: snapshot.id,
          windowLabel,
          error
        });
        throw error;
      }
    });
  }, []);

  useEffect(() => {
    loadAppData()
      .then(({ data, warning }) => {
        setAppData(data);
        const requestedNoteId = noteIdFromLocation();
        console.info("KitNote initializing window", { requestedNoteId });
        const selected = requestedNoteId
          ? data.notes.find((item) => item.id === requestedNoteId)
          : data.notes[0] ?? createEmptyNote();
        if (!selected) {
          const message = `Note ${requestedNoteId} was not found in local data.`;
          console.error("KitNote note initialization failed", { requestedNoteId, noteCount: data.notes.length });
          setStatus(message);
          return;
        }
        persistedUpdatedAtRef.current = selected.updatedAt;
        setNote(selected);
        setStatus(warning ?? "Saved locally");

        if (
          !restoreStartedRef.current &&
          isTauriRuntime() &&
          getCurrentWindow().label === "main" &&
          data.globalSettings.restoreAllNotesOnLaunch
        ) {
          restoreStartedRef.current = true;
          void restoreSavedNoteWindows(data, selected.id)
            .then((count) => {
              if (!warning && count > 0) {
                setStatus(`Restored ${count} saved ${count === 1 ? "note" : "notes"}`);
              }
            })
            .catch((error) =>
              setStatus(error instanceof Error ? error.message : "Could not restore saved notes")
            );
        }
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to load notes"));
  }, []);

  useEffect(() => {
    if (!note) return;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void queueSave(note).catch(() => undefined);
    }, autosaveDelayMs);

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [note, queueSave]);

  const closeCurrentNote = useCallback(async () => {
    if (closeInProgressRef.current) return;
    if (!isTauriRuntime()) {
      window.close();
      return;
    }

    const windowLabel = getCurrentWindow().label;
    const closingNoteId = noteRef.current?.id ?? null;
    closeInProgressRef.current = true;
    logClose("close starts", { noteId: closingNoteId, windowLabel });
    try {
      await withClosingState(setClosingNote, async () => {
        if (autosaveTimerRef.current !== null) {
          window.clearTimeout(autosaveTimerRef.current);
          autosaveTimerRef.current = null;
        }

        const latest = noteRef.current;
        if (latest) {
          setStatus("Saving before close...");
          logClose("pending autosave flush starts", { noteId: latest.id, windowLabel });
          await withTimeout(
            queueSave(latest),
            closeSaveTimeoutMs,
            "Saving this note timed out. The note stayed open so you can retry."
          );
          logClose("pending autosave flush succeeds", { noteId: latest.id, windowLabel });
        }

        logClose("window destroy is called", { noteId: latest?.id ?? null, windowLabel });
        await withTimeout(
          getCurrentWindow().destroy(),
          windowCloseTimeoutMs,
          "Windows did not confirm the close request. The note stayed open so you can retry."
        );
      });
    } catch (error) {
      console.error("[KitNote close] close is cancelled", {
        noteId: closingNoteId,
        windowLabel,
        error
      });
      setStatus(
        error instanceof Error
          ? `Note stayed open: ${error.message}`
          : "Note stayed open because the close attempt failed"
      );
    } finally {
      closeInProgressRef.current = false;
      setClosingNote(false);
    }
  }, [queueSave]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const closeListener = getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      logClose("native close request intercepted", {
        noteId: noteRef.current?.id ?? null,
        windowLabel: getCurrentWindow().label
      });
      void closeCurrentNote();
    });
    return () => {
      void closeListener.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, [closeCurrentNote]);

  useEffect(() => {
    if (!note || !isTauriRuntime()) return;
    getCurrentWindow().setAlwaysOnTop(note.settings.alwaysOnTop).catch(() => {
      setStatus("Could not update always-on-top");
    });
  }, [note?.settings.alwaysOnTop]);

  useEffect(() => {
    if (!note?.id || !isTauriRuntime()) return;
    let disposed = false;
    const noteId = note.id;
    const currentWindow = getCurrentWindow();

    const applyWindowState = (windowState: Partial<Note["window"]>) => {
      if (disposed) return;
      setNote((current) =>
        current && current.id === noteId
          ? {
              ...current,
              window: {
                ...current.window,
                ...windowState
              }
            }
          : current
      );
    };

    const syncWindowState = async () => {
      const scaleFactor = await currentWindow.scaleFactor();
      const [position, size] = await Promise.all([currentWindow.outerPosition(), currentWindow.outerSize()]);
      const logicalPosition = position.toLogical(scaleFactor);
      const logicalSize = size.toLogical(scaleFactor);
      applyWindowState({
        x: Math.round(logicalPosition.x),
        y: Math.round(logicalPosition.y),
        width: Math.round(logicalSize.width),
        height: Math.round(logicalSize.height)
      });
    };

    const movedListener = currentWindow.onMoved(async ({ payload }) => {
      const scaleFactor = await currentWindow.scaleFactor();
      const logicalPosition = payload.toLogical(scaleFactor);
      applyWindowState({
        x: Math.round(logicalPosition.x),
        y: Math.round(logicalPosition.y)
      });
    });
    const resizedListener = currentWindow.onResized(async ({ payload }) => {
      const scaleFactor = await currentWindow.scaleFactor();
      const logicalSize = payload.toLogical(scaleFactor);
      applyWindowState({
        width: Math.round(logicalSize.width),
        height: Math.round(logicalSize.height)
      });
    });

    void syncWindowState().catch((error) => console.warn("KitNote could not sync window state.", error));

    return () => {
      disposed = true;
      void movedListener.then((unlisten) => unlisten()).catch(() => undefined);
      void resizedListener.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, [note?.id]);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".settings-menu") || target?.closest("[data-settings-toggle]")) {
        return;
      }
      setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const updateSettings = useCallback((settings: NoteSettings) => {
    setNote((current) => (current ? { ...current, settings } : current));
  }, []);

  const insertText = useCallback((before: string, after = "") => {
    if (editorRef.current) {
      editorRef.current.insertText(before, after);
      return;
    }
    setNote((current) =>
      current ? { ...current, content: `${current.content}${before}${after}` } : current
    );
  }, []);

  const insertImageFromPath = useCallback(
    async (path: string) => {
      if (!note) return;
      try {
        const copied = await invokeCommand<CopiedImage>("copy_image_to_note", { noteId: note.id, path });
        setNote((current) =>
          current
            ? {
                ...current,
                images: [...current.images, copied],
                content: `${current.content}\n![${copied.fileName}](${copied.storedPath})\n`
              }
            : current
        );
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Image insert failed");
      }
    },
    [note]
  );

  const chooseImage = useCallback(async () => {
    if (!isTauriRuntime()) {
      setStatus("Image picker is available in the desktop app.");
      return;
    }
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }]
    });
    if (typeof selected === "string") {
      await insertImageFromPath(selected);
    }
  }, [insertImageFromPath]);

  const createAnotherNote = useCallback(async () => {
    if (!note || creatingNote) return;
    setCreatingNote(true);
    setStatus("Creating note...");
    try {
      const next = await createNoteWindow(note);
      if (!isTauriRuntime()) {
        persistedUpdatedAtRef.current = null;
        setNote(next);
      }
      setStatus("New note created");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create note");
    } finally {
      setCreatingNote(false);
    }
  }, [creatingNote, note]);

  const insertLink = useCallback((text: string, target: string, kind: Hyperlink["kind"]) => {
    const link: Hyperlink = { id: crypto.randomUUID(), text, target, kind };
    setNote((current) =>
      current
        ? {
            ...current,
            links: [...current.links, link],
            content: `${current.content}[${text}](${target})`
          }
        : current
    );
    setLinkDialogOpen(false);
  }, []);

  const openLinkTarget = useCallback(async (target: string) => {
    const kind = /^https?:\/\//i.test(target) ? "web" : "file";
    try {
      await invokeCommand<void>("open_link_target", { target, kind });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open link");
    }
  }, []);

  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    const firstImage = files.find((file) => file.type.startsWith("image/"));
    const path = firstImage ? ((firstImage as File & { path?: string }).path ?? "") : "";
    if (!path) {
      setStatus("Use the image button if drag and drop does not expose a file path.");
      return;
    }
    await insertImageFromPath(path);
  };

  if (!note || !appData) {
    return <main className="loading">{status}</main>;
  }

  return (
    <main
      className="note-shell"
      style={
        {
          "--note-bg": note.settings.backgroundColor,
          "--note-fg": note.settings.fontColor,
          "--note-opacity": note.settings.opacity,
          "--note-radius": `${note.settings.cornerRadius}px`,
          "--note-font-family": note.settings.fontFamily,
          "--note-font-size": `${note.settings.fontSize}px`
        } as React.CSSProperties
      }
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <ResizeHandles onError={setStatus} />
      <TopToolbar
        note={note}
        onCreateNote={createAnotherNote}
        newNoteDisabled={creatingNote}
        onCloseNote={closeCurrentNote}
        closeDisabled={closingNote}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onTitleChange={(title) => setNote((current) => (current ? { ...current, title } : current))}
      />
      {menuOpen ? (
        <SettingsMenu settings={note.settings} appVersion={appVersion} onSettingsChange={updateSettings} />
      ) : null}
      <section className="editor-frame">
        <LivePreviewEditor
          key={note.id}
          ref={editorRef}
          value={note.content}
          onChange={(content) => setNote((current) => (current ? { ...current, content } : current))}
          onOpenLink={openLinkTarget}
        />
      </section>
      <BottomToolbar
        settings={note.settings}
        onSettingsChange={updateSettings}
        onFormat={insertText}
        onInsertImage={chooseImage}
        onInsertLink={() => setLinkDialogOpen(true)}
      />
      <div className="status-line">{status}</div>
      {linkDialogOpen ? <LinkDialog onCancel={() => setLinkDialogOpen(false)} onInsert={insertLink} /> : null}
    </main>
  );
}
