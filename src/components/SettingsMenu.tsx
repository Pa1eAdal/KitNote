import type { NoteSettings } from "../types";

interface SettingsMenuProps {
  settings: NoteSettings;
  appVersion: string;
  onSettingsChange: (settings: NoteSettings) => void;
}

export function SettingsMenu({ settings, appVersion, onSettingsChange }: SettingsMenuProps) {
  return (
    <div className="settings-menu">
      <label className="toggle-row">
        <span>Always on top</span>
        <input
          type="checkbox"
          checked={settings.alwaysOnTop}
          onChange={(event) => onSettingsChange({ ...settings, alwaysOnTop: event.currentTarget.checked })}
        />
      </label>
      <label>
        <span>Opacity</span>
        <input
          type="range"
          min={0.55}
          max={1}
          step={0.01}
          value={settings.opacity}
          onChange={(event) => onSettingsChange({ ...settings, opacity: Number(event.currentTarget.value) })}
        />
      </label>
      <label>
        <span>Corner radius</span>
        <input
          type="range"
          min={0}
          max={30}
          step={1}
          value={settings.cornerRadius}
          onChange={(event) =>
            onSettingsChange({ ...settings, cornerRadius: Number(event.currentTarget.value) })
          }
        />
      </label>
      <label>
        <span>Font family</span>
        <select
          value={settings.fontFamily}
          onChange={(event) => onSettingsChange({ ...settings, fontFamily: event.currentTarget.value })}
        >
          <option value="Segoe UI, system-ui, sans-serif">Segoe UI</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="Consolas, monospace">Consolas</option>
        </select>
      </label>
      <div className="about-line">KitNote {appVersion}</div>
      {import.meta.env.DEV ? <div className="debug-line">Development build</div> : null}
    </div>
  );
}
