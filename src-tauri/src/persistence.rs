use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use uuid::Uuid;

use super::{default_app_data, empty_app_data, note_from_template, AppData, Note};

#[derive(Debug)]
enum DataReadError {
    Io(String),
    Malformed(String),
}

pub(super) struct LoadOutcome {
    pub data: AppData,
    pub warning: Option<String>,
}

pub(super) fn load_or_initialize(path: &Path) -> Result<LoadOutcome, String> {
    match read_data(path) {
        Ok(Some(mut data)) => {
            if data.notes.is_empty() {
                data.notes = default_app_data().notes;
                write_data(path, &data, true)?;
            }
            Ok(LoadOutcome {
                data,
                warning: None,
            })
        }
        Ok(None) => {
            let data = default_app_data();
            write_data(path, &data, false)?;
            Ok(LoadOutcome {
                data,
                warning: None,
            })
        }
        Err(DataReadError::Malformed(details)) => {
            let backup = move_corrupt_file(path)?;
            let data = default_app_data();
            write_data(path, &data, false)?;
            Ok(LoadOutcome {
                data,
                warning: Some(format!(
                    "KitNote found malformed note data. The original file was preserved at {} and a clean note file was created. Details: {details}",
                    backup.display()
                )),
            })
        }
        Err(DataReadError::Io(error)) => Err(format!(
            "KitNote could not read existing note data and did not overwrite it: {error}"
        )),
    }
}

pub(super) fn save_note(
    path: &Path,
    note: Note,
    expected_updated_at: Option<&str>,
) -> Result<AppData, String> {
    let mut data = read_for_update(path)?;
    match data.notes.iter_mut().find(|item| item.id == note.id) {
        Some(existing) => {
            let expected = expected_updated_at.ok_or_else(|| {
                "KitNote refused to overwrite an existing note without a version check.".to_string()
            })?;
            if existing.updated_at != expected {
                return Err(
                    "This note changed after this window loaded it. KitNote kept the newer saved copy and did not overwrite it."
                        .to_string(),
                );
            }
            *existing = note;
        }
        None => {
            if expected_updated_at.is_some() {
                return Err(
                    "This note no longer exists in the saved data. KitNote did not recreate it over newer data."
                        .to_string(),
                );
            }
            data.notes.push(note);
        }
    }
    write_data(path, &data, true)?;
    Ok(data)
}

pub(super) fn create_note(path: &Path, source: Note) -> Result<Note, String> {
    let note = note_from_template(source);
    let mut data = read_for_update(path)?;
    data.notes.push(note.clone());
    write_data(path, &data, true)?;
    Ok(note)
}

fn read_for_update(path: &Path) -> Result<AppData, String> {
    match read_data(path) {
        Ok(Some(data)) => Ok(data),
        Ok(None) => Ok(empty_app_data()),
        Err(DataReadError::Malformed(details)) => {
            let backup = copy_corrupt_file(path).map_err(|backup_error| {
                format!(
                    "KitNote found malformed note data and could not preserve a recovery copy. No data was written. Parse error: {details}. Backup error: {backup_error}"
                )
            })?;
            Err(format!(
                "KitNote found malformed note data and refused to overwrite it. A recovery copy was preserved at {}. Details: {details}",
                backup.display()
            ))
        }
        Err(DataReadError::Io(error)) => Err(format!(
            "KitNote could not read existing note data and refused to overwrite it: {error}"
        )),
    }
}

fn read_data(path: &Path) -> Result<Option<AppData>, DataReadError> {
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(DataReadError::Io(format!("{}: {error}", path.display()))),
    };
    serde_json::from_str::<AppData>(&raw)
        .map(Some)
        .map_err(|error| DataReadError::Malformed(error.to_string()))
}

fn write_data(path: &Path, data: &AppData, backup_existing: bool) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Could not create KitNote data directory {}: {error}",
                parent.display()
            )
        })?;
    }

    let encoded = serde_json::to_vec_pretty(data)
        .map_err(|error| format!("Could not encode notes: {error}"))?;
    let temp_path = unique_sibling(path, "tmp");
    let write_result = (|| -> Result<(), String> {
        let mut temp = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|error| format!("Could not create notes temp file: {error}"))?;
        temp.write_all(&encoded)
            .map_err(|error| format!("Could not write notes temp file: {error}"))?;
        temp.sync_all()
            .map_err(|error| format!("Could not flush notes temp file: {error}"))?;
        drop(temp);

        if backup_existing && path.is_file() {
            write_last_known_good_backup(path)?;
        }
        fs::rename(&temp_path, path)
            .map_err(|error| format!("Could not atomically replace notes.json: {error}"))?;
        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    write_result
}

fn write_last_known_good_backup(path: &Path) -> Result<(), String> {
    let backup_path = path.with_file_name("notes.backup.json");
    let temp_backup = unique_sibling(path, "backup.tmp");
    let backup_result = (|| -> Result<(), String> {
        fs::copy(path, &temp_backup)
            .map_err(|error| format!("Could not create last-known-good backup: {error}"))?;
        OpenOptions::new()
            .read(true)
            .write(true)
            .open(&temp_backup)
            .and_then(|file| file.sync_all())
            .map_err(|error| format!("Could not flush last-known-good backup: {error}"))?;
        fs::rename(&temp_backup, &backup_path)
            .map_err(|error| format!("Could not replace last-known-good backup: {error}"))?;
        Ok(())
    })();
    if backup_result.is_err() {
        let _ = fs::remove_file(&temp_backup);
    }
    backup_result
}

fn move_corrupt_file(path: &Path) -> Result<PathBuf, String> {
    let backup = corrupt_backup_path(path);
    fs::rename(path, &backup).map_err(|error| {
        format!(
            "KitNote found malformed data but could not preserve it at {}. No replacement was written: {error}",
            backup.display()
        )
    })?;
    Ok(backup)
}

fn copy_corrupt_file(path: &Path) -> Result<PathBuf, String> {
    let backup = corrupt_backup_path(path);
    fs::copy(path, &backup)
        .map_err(|error| format!("Could not copy malformed note data: {error}"))?;
    Ok(backup)
}

fn corrupt_backup_path(path: &Path) -> PathBuf {
    path.with_file_name(format!(
        "notes.corrupt-{}-{}.json",
        super::now_stamp(),
        Uuid::new_v4()
    ))
}

fn unique_sibling(path: &Path, suffix: &str) -> PathBuf {
    path.with_file_name(format!("notes.{}.{}", Uuid::new_v4(), suffix))
}

#[cfg(test)]
mod tests {
    use super::{create_note, load_or_initialize, save_note};
    use crate::{default_note_settings, empty_note};
    use std::fs;

    #[test]
    fn missing_file_is_initialized() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("notes.json");

        let loaded = load_or_initialize(&path).expect("initialize data");

        assert!(path.is_file());
        assert_eq!(loaded.data.notes.len(), 1);
        assert!(loaded.warning.is_none());
    }

    #[test]
    fn malformed_json_is_moved_to_recovery_backup_on_load() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("notes.json");
        fs::write(&path, "{not valid json").expect("write malformed data");

        let loaded = load_or_initialize(&path).expect("recover malformed data");

        assert!(loaded.warning.is_some());
        assert!(path.is_file());
        let backups = fs::read_dir(temp.path())
            .expect("list temp dir")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("notes.corrupt-")
            })
            .collect::<Vec<_>>();
        assert_eq!(backups.len(), 1);
        assert_eq!(
            fs::read_to_string(backups[0].path()).expect("read backup"),
            "{not valid json"
        );
    }

    #[test]
    fn save_refuses_to_replace_unreadable_existing_path() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("notes.json");
        fs::create_dir(&path).expect("create unreadable path shape");
        let note = empty_note(default_note_settings());

        let error = save_note(&path, note, None).expect_err("save must fail");

        assert!(error.contains("refused to overwrite"));
        assert!(path.is_dir());
    }

    #[test]
    fn create_refuses_to_replace_unreadable_existing_path() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("notes.json");
        fs::create_dir(&path).expect("create unreadable path shape");
        let source = empty_note(default_note_settings());

        let error = create_note(&path, source).expect_err("create must fail");

        assert!(error.contains("refused to overwrite"));
        assert!(path.is_dir());
    }

    #[test]
    fn malformed_data_is_preserved_and_not_replaced_during_save() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("notes.json");
        fs::write(&path, "{broken").expect("write malformed data");
        let note = empty_note(default_note_settings());

        let error = save_note(&path, note, None).expect_err("save must fail");

        assert!(error.contains("refused to overwrite"));
        assert_eq!(fs::read_to_string(&path).expect("read original"), "{broken");
        assert!(fs::read_dir(temp.path())
            .expect("list temp dir")
            .filter_map(Result::ok)
            .any(|entry| entry
                .file_name()
                .to_string_lossy()
                .starts_with("notes.corrupt-")));
    }

    #[test]
    fn malformed_data_is_preserved_and_not_replaced_during_create() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("notes.json");
        fs::write(&path, "{broken").expect("write malformed data");
        let source = empty_note(default_note_settings());

        let error = create_note(&path, source).expect_err("create must fail");

        assert!(error.contains("refused to overwrite"));
        assert_eq!(fs::read_to_string(&path).expect("read original"), "{broken");
        assert!(fs::read_dir(temp.path())
            .expect("list temp dir")
            .filter_map(Result::ok)
            .any(|entry| entry
                .file_name()
                .to_string_lossy()
                .starts_with("notes.corrupt-")));
    }

    #[test]
    fn successful_save_keeps_other_notes_and_writes_backup() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("notes.json");
        let loaded = load_or_initialize(&path).expect("initialize");
        let mut first = loaded.data.notes[0].clone();
        let original_updated_at = first.updated_at.clone();
        let second =
            create_note(&path, empty_note(default_note_settings())).expect("create second note");

        first.content = "updated".to_string();
        first.updated_at = "new-version".to_string();
        let saved =
            save_note(&path, first.clone(), Some(&original_updated_at)).expect("save first note");

        assert_eq!(saved.notes.len(), 2);
        assert_eq!(
            saved
                .notes
                .iter()
                .find(|note| note.id == first.id)
                .expect("first note")
                .content,
            "updated"
        );
        assert!(saved.notes.iter().any(|note| note.id == second.id));
        assert!(temp.path().join("notes.backup.json").is_file());
    }

    #[test]
    fn stale_save_is_rejected_without_replacing_newer_data() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("notes.json");
        let loaded = load_or_initialize(&path).expect("initialize");
        let original = loaded.data.notes[0].clone();

        let mut newer = original.clone();
        newer.content = "newer".to_string();
        newer.updated_at = "newer-version".to_string();
        save_note(&path, newer, Some(&original.updated_at)).expect("save newer version");

        let mut stale = original.clone();
        stale.content = "stale".to_string();
        stale.updated_at = "stale-version".to_string();
        let error =
            save_note(&path, stale, Some(&original.updated_at)).expect_err("reject stale save");
        let current = load_or_initialize(&path).expect("reload current");

        assert!(error.contains("newer saved copy"));
        assert_eq!(current.data.notes[0].content, "newer");
    }
}
