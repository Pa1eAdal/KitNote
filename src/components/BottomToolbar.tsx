import { Bold, Code2, Heading2, Image, Italic, Link, List, Quote, Type } from "lucide-react";
import { IconButton } from "./IconButton";
import type { NoteSettings } from "../types";

interface BottomToolbarProps {
  settings: NoteSettings;
  onSettingsChange: (settings: NoteSettings) => void;
  onFormat: (before: string, after?: string) => void;
  onInsertImage: () => void;
  onInsertLink: () => void;
}

export function BottomToolbar({
  settings,
  onSettingsChange,
  onFormat,
  onInsertImage,
  onInsertLink
}: BottomToolbarProps) {
  return (
    <div className="toolbar bottom-toolbar">
      <IconButton label="Bold" onClick={() => onFormat("**", "**")}>
        <Bold size={16} />
      </IconButton>
      <IconButton label="Italic" onClick={() => onFormat("*", "*")}>
        <Italic size={16} />
      </IconButton>
      <IconButton label="Heading" onClick={() => onFormat("## ")}>
        <Heading2 size={16} />
      </IconButton>
      <IconButton label="List" onClick={() => onFormat("- ")}>
        <List size={16} />
      </IconButton>
      <IconButton label="Quote" onClick={() => onFormat("> ")}>
        <Quote size={16} />
      </IconButton>
      <IconButton label="Code" onClick={() => onFormat("`", "`")}>
        <Code2 size={16} />
      </IconButton>
      <IconButton label="Insert image" onClick={onInsertImage}>
        <Image size={16} />
      </IconButton>
      <IconButton label="Insert hyperlink" onClick={onInsertLink}>
        <Link size={16} />
      </IconButton>
      <label className="compact-field" title="Font size">
        <Type size={15} />
        <input
          aria-label="Font size"
          type="number"
          min={10}
          max={42}
          value={settings.fontSize}
          onChange={(event) =>
            onSettingsChange({ ...settings, fontSize: Number(event.currentTarget.value) })
          }
        />
      </label>
      <label className="swatch-field" title="Font color">
        <input
          aria-label="Font color"
          type="color"
          value={settings.fontColor}
          onChange={(event) => onSettingsChange({ ...settings, fontColor: event.currentTarget.value })}
        />
      </label>
      <label className="swatch-field" title="Note color">
        <input
          aria-label="Note color"
          type="color"
          value={settings.backgroundColor}
          onChange={(event) =>
            onSettingsChange({ ...settings, backgroundColor: event.currentTarget.value })
          }
        />
      </label>
    </div>
  );
}
