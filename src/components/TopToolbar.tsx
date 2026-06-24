import { useEffect, useRef, useState } from "react";
import { Menu, Plus, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconButton } from "./IconButton";
import type { Note } from "../types";
import { isTauriRuntime } from "../utils/tauri";

const untitledNote = "Untitled note";
const dragThreshold = 4;

interface TopToolbarProps {
  note: Note;
  onCreateNote: () => void;
  newNoteDisabled?: boolean;
  onToggleMenu: () => void;
  onTitleChange: (title: string) => void;
}

export function TopToolbar({
  note,
  onCreateNote,
  newNoteDisabled = false,
  onToggleMenu,
  onTitleChange
}: TopToolbarProps) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const titleGestureRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const cancelingTitleRef = useRef(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(note.title);

  useEffect(() => {
    if (!editingTitle) {
      setTitleDraft(note.title);
    }
  }, [editingTitle, note.title]);

  useEffect(() => {
    if (!editingTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [editingTitle]);

  const dragCurrentWindow = async () => {
    if (!isTauriRuntime()) return;
    try {
      await getCurrentWindow().startDragging();
    } catch (error) {
      console.error("KitNote drag failed", error);
    }
  };

  const startWindowDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !isTauriRuntime()) return;
    if ((event.target as HTMLElement).closest("button,input,select,textarea,a")) return;
    event.preventDefault();
    void dragCurrentWindow();
  };

  const closeWindow = async () => {
    if (isTauriRuntime()) {
      try {
        await getCurrentWindow().close();
      } catch (error) {
        console.error("KitNote close failed", error);
      }
      return;
    }
    window.close();
  };

  const commitTitle = () => {
    const nextTitle = titleDraft.trim() || untitledNote;
    onTitleChange(nextTitle);
    setTitleDraft(nextTitle);
    setEditingTitle(false);
  };

  const cancelTitleEdit = () => {
    cancelingTitleRef.current = true;
    setTitleDraft(note.title);
    setEditingTitle(false);
  };

  const beginTitleEdit = () => {
    cancelingTitleRef.current = false;
    setEditingTitle(true);
  };

  return (
    <div className="toolbar top-toolbar" onPointerDown={startWindowDrag}>
      {editingTitle ? (
        <input
          ref={titleInputRef}
          className="toolbar-title-input"
          value={titleDraft}
          aria-label="Note title"
          maxLength={120}
          onChange={(event) => setTitleDraft(event.currentTarget.value)}
          onBlur={() => {
            if (cancelingTitleRef.current) {
              cancelingTitleRef.current = false;
              return;
            }
            commitTitle();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitTitle();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelTitleEdit();
            }
          }}
        />
      ) : (
        <div
          className="toolbar-title"
          title="Click to rename or drag to move"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            titleGestureRef.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const gesture = titleGestureRef.current;
            if (!gesture || gesture.pointerId !== event.pointerId) return;
            if (
              Math.abs(event.clientX - gesture.x) < dragThreshold &&
              Math.abs(event.clientY - gesture.y) < dragThreshold
            ) {
              return;
            }
            titleGestureRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            void dragCurrentWindow();
          }}
          onPointerUp={(event) => {
            const gesture = titleGestureRef.current;
            if (!gesture || gesture.pointerId !== event.pointerId) return;
            titleGestureRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            beginTitleEdit();
          }}
          onPointerCancel={() => {
            titleGestureRef.current = null;
          }}
        >
          {note.title || untitledNote}
        </div>
      )}
      <div className="toolbar-actions">
        <IconButton label="New note" onClick={onCreateNote} disabled={newNoteDisabled}>
          <Plus size={16} />
        </IconButton>
        <IconButton label="Settings" data-settings-toggle onClick={onToggleMenu}>
          <Menu size={16} />
        </IconButton>
        <IconButton label="Close note" onClick={closeWindow}>
          <X size={16} />
        </IconButton>
      </div>
    </div>
  );
}
