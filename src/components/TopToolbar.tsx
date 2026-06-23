import { Menu, Plus, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconButton } from "./IconButton";
import type { Note } from "../types";
import { isTauriRuntime } from "../utils/tauri";

interface TopToolbarProps {
  note: Note;
  onCreateNote: () => void;
  newNoteDisabled?: boolean;
  onToggleMenu: () => void;
}

export function TopToolbar({ note, onCreateNote, newNoteDisabled = false, onToggleMenu }: TopToolbarProps) {
  const startWindowDrag = async (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !isTauriRuntime()) return;
    if ((event.target as HTMLElement).closest("button,input,select,textarea,a")) return;
    event.preventDefault();
    try {
      await getCurrentWindow().startDragging();
    } catch (error) {
      console.error("KitNote drag failed", error);
    }
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

  return (
    <div className="toolbar top-toolbar" onPointerDown={startWindowDrag}>
      <div className="toolbar-title">
        {note.title}
      </div>
      <div className="toolbar-actions">
        <IconButton label="New note" onClick={onCreateNote} disabled={newNoteDisabled}>
          <Plus size={16} />
        </IconButton>
        <IconButton label="Settings" onClick={onToggleMenu}>
          <Menu size={16} />
        </IconButton>
        <IconButton label="Close note" onClick={closeWindow}>
          <X size={16} />
        </IconButton>
      </div>
    </div>
  );
}
