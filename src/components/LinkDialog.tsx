import { useState } from "react";
import type { LinkKind } from "../types";

interface LinkDialogProps {
  onCancel: () => void;
  onInsert: (text: string, target: string, kind: LinkKind) => void;
}

export function LinkDialog({ onCancel, onInsert }: LinkDialogProps) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const [kind, setKind] = useState<LinkKind>("web");

  return (
    <div className="dialog-backdrop" role="presentation">
      <form
        className="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim() && target.trim()) {
            onInsert(text.trim(), target.trim(), kind);
          }
        }}
      >
        <h2>Insert hyperlink</h2>
        <label>
          <span>Display text</span>
          <input value={text} onChange={(event) => setText(event.currentTarget.value)} autoFocus />
        </label>
        <label>
          <span>Target</span>
          <input value={target} onChange={(event) => setTarget(event.currentTarget.value)} />
        </label>
        <label>
          <span>Type</span>
          <select value={kind} onChange={(event) => setKind(event.currentTarget.value as LinkKind)}>
            <option value="web">Web URL</option>
            <option value="file">Local file or folder</option>
          </select>
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit">Insert</button>
        </div>
      </form>
    </div>
  );
}
