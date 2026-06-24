import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { BottomToolbar } from "./components/BottomToolbar";
import { LinkDialog } from "./components/LinkDialog";
import { ResizeHandles } from "./components/ResizeHandles";
import { SettingsMenu } from "./components/SettingsMenu";
import { TopToolbar } from "./components/TopToolbar";
import { renderMarkdown } from "./editor/markdown";
import { createEmptyNote, defaultNoteSettings } from "./settings/defaults";
import { createNoteWindow, loadAppData, saveNote } from "./notes/store";
import type { AppData, CopiedImage, Hyperlink, Note, NoteSettings } from "./types";
import { invokeCommand, isTauriRuntime } from "./utils/tauri";

const appVersion = "0.1.1";
const autosaveDelayMs = 450;

function noteIdFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get("noteId");
}

export default function App() {
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [appData, setAppData] = useState<AppData | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [preview, setPreview] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [status, setStatus] = useState("Loading KitNote...");

  useEffect(() => {
    loadAppData()
      .then((data) => {
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
        setNote(selected);
        setStatus("Saved locally");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to load notes"));
  }, []);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => {
      const next = { ...note, updatedAt: new Date().toISOString() };
      saveNote(next)
        .then((data) => {
          setAppData(data);
          setStatus("Saved locally");
        })
        .catch((error) => setStatus(error instanceof Error ? error.message : "Save failed"));
    }, autosaveDelayMs);

    return () => window.clearTimeout(timer);
  }, [note]);

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

  const updateSettings = useCallback((settings: NoteSettings) => {
    setNote((current) => (current ? { ...current, settings } : current));
  }, []);

  const renderedHtml = useMemo(() => renderMarkdown(note?.content ?? ""), [note?.content]);

  const insertText = useCallback((before: string, after = "") => {
    const textarea = editorRef.current;
    setNote((current) => {
      if (!current) return current;
      if (!textarea) {
        return { ...current, content: `${current.content}${before}${after}` };
      }
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = current.content.slice(start, end);
      const nextContent = `${current.content.slice(0, start)}${before}${selected}${after}${current.content.slice(
        end
      )}`;
      window.requestAnimationFrame(() => {
        textarea.focus();
        textarea.selectionStart = start + before.length;
        textarea.selectionEnd = start + before.length + selected.length;
      });
      return { ...current, content: nextContent };
    });
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

  const handlePreviewClick = async (event: React.MouseEvent<HTMLElement>) => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-kitnote-link]");
    if (!anchor) return;
    event.preventDefault();
    const target = anchor.dataset.kitnoteLink ?? anchor.href;
    const kind = /^https?:\/\//i.test(target) ? "web" : "file";
    try {
      await invokeCommand<void>("open_link_target", { target, kind });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open link");
    }
  };

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
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onTitleChange={(title) => setNote((current) => (current ? { ...current, title } : current))}
      />
      {menuOpen ? (
        <SettingsMenu settings={note.settings} appVersion={appVersion} onSettingsChange={updateSettings} />
      ) : null}
      <section className="editor-frame">
        <div className="editor-tabs" role="tablist">
          <button className={!preview ? "active" : ""} onClick={() => setPreview(false)}>
            Edit
          </button>
          <button className={preview ? "active" : ""} onClick={() => setPreview(true)}>
            Preview
          </button>
        </div>
        {preview ? (
          <article
            className="markdown-preview"
            onDoubleClick={handlePreviewClick}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : (
          <textarea
            ref={editorRef}
            value={note.content}
            spellCheck
            onChange={(event) => setNote({ ...note, content: event.currentTarget.value })}
            placeholder="Write Markdown, TeX, links, and notes..."
          />
        )}
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
