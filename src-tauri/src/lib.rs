mod link_policy;
mod persistence;

use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

struct AppState {
    data_lock: Mutex<()>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GlobalSettings {
    restore_all_notes_on_launch: bool,
    confirm_risky_local_links: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NoteSettings {
    always_on_top: bool,
    background_color: String,
    font_color: String,
    font_family: String,
    font_size: u16,
    opacity: f32,
    corner_radius: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NoteWindowState {
    x: Option<i32>,
    y: Option<i32>,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InsertedImage {
    id: String,
    original_path: String,
    stored_path: String,
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Hyperlink {
    id: String,
    text: String,
    target: String,
    kind: LinkKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum LinkKind {
    Web,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Note {
    id: String,
    title: String,
    content: String,
    created_at: String,
    updated_at: String,
    settings: NoteSettings,
    window: NoteWindowState,
    images: Vec<InsertedImage>,
    links: Vec<Hyperlink>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppData {
    schema_version: u16,
    global_settings: GlobalSettings,
    notes: Vec<Note>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadAppDataResponse {
    data: AppData,
    warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CopiedImage {
    id: String,
    original_path: String,
    stored_path: String,
    file_name: String,
}

fn now_stamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn default_note_settings() -> NoteSettings {
    NoteSettings {
        always_on_top: true,
        background_color: "#FFF4A8".to_string(),
        font_color: "#231f1a".to_string(),
        font_family: "Segoe UI, system-ui, sans-serif".to_string(),
        font_size: 16,
        opacity: 0.96,
        corner_radius: 18,
    }
}

fn empty_note(settings: NoteSettings) -> Note {
    let now = now_stamp();
    Note {
        id: Uuid::new_v4().to_string(),
        title: "Untitled note".to_string(),
        content: String::new(),
        created_at: now.clone(),
        updated_at: now,
        settings,
        window: NoteWindowState {
            x: None,
            y: None,
            width: 360.0,
            height: 420.0,
        },
        images: Vec::new(),
        links: Vec::new(),
    }
}

fn note_from_template(source: Note) -> Note {
    let mut note = empty_note(source.settings);
    note.window = source.window;
    note
}

fn default_app_data() -> AppData {
    let mut data = empty_app_data();
    data.notes.push(empty_note(default_note_settings()));
    data
}

fn empty_app_data() -> AppData {
    AppData {
        schema_version: 1,
        global_settings: GlobalSettings {
            restore_all_notes_on_launch: true,
            confirm_risky_local_links: true,
        },
        notes: Vec::new(),
    }
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve KitNote data directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create KitNote data directory: {error}"))?;
    Ok(dir)
}

fn append_log(app: &AppHandle, message: impl AsRef<str>) {
    let Ok(dir) = app_data_dir(app) else {
        eprintln!("{}", message.as_ref());
        return;
    };
    let line = format!("[{}] {}\n", now_stamp(), message.as_ref());
    if let Err(error) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("kitnote.log"))
        .and_then(|mut file| std::io::Write::write_all(&mut file, line.as_bytes()))
    {
        eprintln!(
            "Could not write KitNote log: {error}; original message: {}",
            message.as_ref()
        );
    }
}

fn with_data_access<T>(
    app: &AppHandle,
    state: &State<'_, AppState>,
    operation: impl FnOnce(&Path) -> Result<T, String>,
) -> Result<T, String> {
    let _process_guard = state
        .data_lock
        .lock()
        .map_err(|_| "KitNote's in-process data lock was poisoned.".to_string())?;
    let data_dir = app_data_dir(app)?;
    let lock_file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(data_dir.join("notes.lock"))
        .map_err(|error| format!("Could not open KitNote's interprocess data lock: {error}"))?;
    lock_file
        .try_lock_exclusive()
        .map_err(|error| {
            format!(
                "Another KitNote writer is using the note data. No data was changed; try again. Details: {error}"
            )
        })?;
    operation(&data_dir.join("notes.json"))
}

#[tauri::command]
fn load_app_data(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<LoadAppDataResponse, String> {
    let outcome = with_data_access(&app, &state, persistence::load_or_initialize)?;
    if let Some(warning) = &outcome.warning {
        append_log(&app, warning);
    }
    Ok(LoadAppDataResponse {
        data: outcome.data,
        warning: outcome.warning,
    })
}

#[tauri::command]
fn save_note(
    app: AppHandle,
    state: State<'_, AppState>,
    note: Note,
    expected_updated_at: Option<String>,
) -> Result<AppData, String> {
    let note_id = note.id.clone();
    append_log(&app, format!("Save started note_id={note_id}"));
    let result = with_data_access(&app, &state, |path| {
        persistence::save_note(path, note, expected_updated_at.as_deref())
    });
    match &result {
        Ok(_) => append_log(&app, format!("Save succeeded note_id={note_id}")),
        Err(error) => append_log(&app, format!("Save failed note_id={note_id} error={error}")),
    }
    result
}

#[tauri::command]
fn create_note_window(
    app: AppHandle,
    state: State<'_, AppState>,
    source: Note,
) -> Result<Note, String> {
    let note = with_data_access(&app, &state, |path| persistence::create_note(path, source))?;
    append_log(&app, format!("Prepared new note data note_id={}", note.id));
    Ok(note)
}

#[tauri::command]
fn copy_image_to_note(
    app: AppHandle,
    note_id: String,
    path: String,
) -> Result<CopiedImage, String> {
    let source =
        fs::canonicalize(&path).map_err(|error| format!("Could not read image path: {error}"))?;
    if !source.is_file() {
        return Err("The selected image is not a file.".to_string());
    }
    if !is_allowed_image_extension(&source) {
        return Err("KitNote supports PNG, JPG, JPEG, GIF, and WebP images.".to_string());
    }

    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("img")
        .to_ascii_lowercase();
    let original_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("image")
        .to_string();
    let id = Uuid::new_v4().to_string();
    let assets_dir = app_data_dir(&app)?
        .join("assets")
        .join(sanitize_segment(&note_id));
    fs::create_dir_all(&assets_dir)
        .map_err(|error| format!("Could not create image asset directory: {error}"))?;
    let stored_path = assets_dir.join(format!("{id}.{extension}"));
    fs::copy(&source, &stored_path)
        .map_err(|error| format!("Could not copy image into KitNote data: {error}"))?;

    Ok(CopiedImage {
        id,
        original_path: source.to_string_lossy().to_string(),
        stored_path: stored_path.to_string_lossy().to_string(),
        file_name: original_name,
    })
}

#[tauri::command]
fn open_link_target(target: String, kind: LinkKind) -> Result<(), String> {
    match kind {
        LinkKind::Web => link_policy::open_web_target(&target),
        LinkKind::File => link_policy::open_file_target(&target),
    }
}

fn sanitize_segment(value: &str) -> String {
    value
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || *character == '-' || *character == '_'
        })
        .collect::<String>()
}

fn is_allowed_image_extension(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref(),
        Some("png" | "jpg" | "jpeg" | "gif" | "webp")
    )
}

pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let window = app
                .get_webview_window("main")
                .or_else(|| app.webview_windows().into_values().next());
            if let Some(window) = window {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(AppState {
            data_lock: Mutex::new(()),
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_app_data,
            save_note,
            create_note_window,
            copy_image_to_note,
            open_link_target
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("error while running KitNote: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::{
        default_note_settings, empty_note, is_allowed_image_extension, note_from_template,
        Hyperlink, InsertedImage, LinkKind,
    };
    use std::path::Path;

    #[test]
    fn allows_expected_image_extensions() {
        assert!(is_allowed_image_extension(Path::new("note.PNG")));
        assert!(is_allowed_image_extension(Path::new("note.webp")));
        assert!(!is_allowed_image_extension(Path::new("note.svg")));
    }

    #[test]
    fn fresh_notes_use_sticky_note_yellow() {
        let note = empty_note(default_note_settings());

        assert_eq!(note.settings.background_color, "#FFF4A8");
        assert_eq!(note.title, "Untitled note");
    }

    #[test]
    fn note_template_copies_settings_and_window_but_not_content() {
        let mut source = empty_note(default_note_settings());
        source.title = "Source note title".to_string();
        source.content = "do not copy this text".to_string();
        source.settings.background_color = "#ff0000".to_string();
        source.settings.opacity = 0.75;
        source.window.x = Some(120);
        source.window.y = Some(160);
        source.window.width = 480.0;
        source.window.height = 320.0;
        source.images.push(InsertedImage {
            id: "image-1".to_string(),
            original_path: "C:\\source.png".to_string(),
            stored_path: "C:\\stored.png".to_string(),
            width: Some(64),
            height: Some(64),
        });
        source.links.push(Hyperlink {
            id: "link-1".to_string(),
            text: "docs".to_string(),
            target: "https://example.com".to_string(),
            kind: LinkKind::Web,
        });

        let note = note_from_template(source);

        assert_eq!(note.title, "Untitled note");
        assert_eq!(note.content, "");
        assert!(note.images.is_empty());
        assert!(note.links.is_empty());
        assert_eq!(note.settings.background_color, "#ff0000");
        assert_eq!(note.settings.opacity, 0.75);
        assert_eq!(note.window.x, Some(120));
        assert_eq!(note.window.y, Some(160));
        assert_eq!(note.window.width, 480.0);
        assert_eq!(note.window.height, 320.0);
    }
}
