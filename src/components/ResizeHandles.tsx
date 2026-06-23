import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "../utils/tauri";

type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

const handles: Array<{ direction: ResizeDirection; className: string; label: string }> = [
  { direction: "North", className: "resize-handle resize-handle-n", label: "Resize from top edge" },
  { direction: "South", className: "resize-handle resize-handle-s", label: "Resize from bottom edge" },
  { direction: "West", className: "resize-handle resize-handle-w", label: "Resize from left edge" },
  { direction: "East", className: "resize-handle resize-handle-e", label: "Resize from right edge" },
  { direction: "NorthWest", className: "resize-handle resize-handle-nw", label: "Resize from top-left corner" },
  { direction: "NorthEast", className: "resize-handle resize-handle-ne", label: "Resize from top-right corner" },
  { direction: "SouthWest", className: "resize-handle resize-handle-sw", label: "Resize from bottom-left corner" },
  { direction: "SouthEast", className: "resize-handle resize-handle-se", label: "Resize from bottom-right corner" }
];

interface ResizeHandlesProps {
  onError: (message: string) => void;
}

export function ResizeHandles({ onError }: ResizeHandlesProps) {
  const startResize = async (direction: ResizeDirection) => {
    if (!isTauriRuntime()) return;
    try {
      await getCurrentWindow().startResizeDragging(direction);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onError(`Could not start resize: ${message}`);
      console.error("KitNote resize failed", error);
    }
  };

  return (
    <>
      {handles.map((handle) => (
        <button
          key={handle.direction}
          type="button"
          className={handle.className}
          aria-label={handle.label}
          title={handle.label}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            void startResize(handle.direction);
          }}
        />
      ))}
    </>
  );
}
