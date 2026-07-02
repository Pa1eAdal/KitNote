export type LinkKind = "web" | "file";

export interface GlobalSettings {
  restoreAllNotesOnLaunch: boolean;
  confirmRiskyLocalLinks: boolean;
}

export interface NoteSettings {
  alwaysOnTop: boolean;
  backgroundColor: string;
  fontColor: string;
  fontFamily: string;
  fontSize: number;
  opacity: number;
  cornerRadius: number;
}

export interface NoteWindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  visible: boolean;
}

export interface InsertedImage {
  id: string;
  originalPath: string;
  storedPath: string;
  width?: number;
  height?: number;
}

export interface Hyperlink {
  id: string;
  text: string;
  target: string;
  kind: LinkKind;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  settings: NoteSettings;
  window: NoteWindowState;
  images: InsertedImage[];
  links: Hyperlink[];
}

export interface AppData {
  schemaVersion: number;
  globalSettings: GlobalSettings;
  notes: Note[];
}

export interface LoadAppDataResult {
  data: AppData;
  warning?: string;
}

export interface CopiedImage {
  id: string;
  originalPath: string;
  storedPath: string;
  fileName: string;
}

export const DEFAULT_NOTE_WIDTH = 360;
export const DEFAULT_NOTE_HEIGHT = 420;
