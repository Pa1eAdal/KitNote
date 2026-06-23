import { Menu, Plus, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconButton } from "./IconButton";
import type { Note } from "../types";
import { isTauriRuntime } from "../utils/tauri";

interface TopToolbarProps {
  note: Note;
  onCreateNote: () => void;
  onToggleMenu: () => void;
}

export function TopToolbar({ note, onCreateNote, onToggleMenu }: TopToolbarProps) {
  const closeWindow = async () => {
    if (isTauriRuntime()) {
      await getCurrentWindow().hide();
      return;
    }
    window.close();
  };

  return (
    <div className="toolbar top-toolbar" data-tauri-drag-region>
      <div className="toolbar-title" data-tauri-drag-region>
        {note.title}
      </div>
      <div className="toolbar-actions">
        <IconButton label="New note" onClick={onCreateNote}>
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
