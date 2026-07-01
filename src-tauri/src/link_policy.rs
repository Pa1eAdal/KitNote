use std::{
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

use url::Url;

const RISKY_EXTENSIONS: &[&str] = &[
    "ade",
    "adp",
    "app",
    "application",
    "appref-ms",
    "bas",
    "bat",
    "chm",
    "cmd",
    "com",
    "cpl",
    "exe",
    "gadget",
    "hta",
    "inf",
    "ins",
    "isp",
    "jar",
    "js",
    "jse",
    "lnk",
    "mad",
    "maf",
    "mag",
    "mam",
    "maq",
    "mar",
    "mas",
    "mat",
    "mau",
    "mav",
    "maw",
    "mcf",
    "mda",
    "mdb",
    "mde",
    "mdt",
    "mdw",
    "mdz",
    "msc",
    "msh",
    "msh1",
    "msh1xml",
    "msh2",
    "msh2xml",
    "mshxml",
    "msi",
    "msp",
    "mst",
    "ops",
    "pcd",
    "pif",
    "pl",
    "plg",
    "prf",
    "prg",
    "ps1",
    "ps1xml",
    "ps2",
    "ps2xml",
    "psc1",
    "psc2",
    "py",
    "pyw",
    "reg",
    "scf",
    "scr",
    "sct",
    "shb",
    "shs",
    "url",
    "vb",
    "vbe",
    "vbs",
    "vsmacros",
    "vsw",
    "ws",
    "wsc",
    "wsf",
    "wsh",
    "xnk",
];

const SAFE_FILE_EXTENSIONS: &[&str] = &[
    "bmp", "cfg", "conf", "csv", "doc", "docx", "gif", "ini", "jpeg", "jpg", "json", "log",
    "markdown", "md", "odt", "ods", "odp", "pdf", "png", "ppt", "pptx", "rtf", "tif", "tiff",
    "toml", "txt", "webp", "xls", "xlsx", "xml", "yaml", "yml",
];

pub(super) fn open_web_target(target: &str) -> Result<(), String> {
    let url = Url::parse(target).map_err(|_| "The hyperlink is not a valid URL.".to_string())?;
    match url.scheme() {
        "http" | "https" => open_with_system(OsStr::new(url.as_str())),
        _ => Err("KitNote only opens http and https URLs.".to_string()),
    }
}

pub(super) fn open_file_target(target: &str) -> Result<(), String> {
    let path = local_path_from_target(target)?;
    let canonical = fs::canonicalize(&path)
        .map_err(|error| format!("The local link target does not exist: {error}"))?;
    validate_canonical_local_target(&canonical)?;
    open_with_system(canonical.as_os_str())
}

fn local_path_from_target(target: &str) -> Result<PathBuf, String> {
    let target = target.trim();
    if target.is_empty() {
        return Err("The local link target is empty.".to_string());
    }
    if is_unsafe_raw_network_path(target) {
        return Err("KitNote blocks network and UNC file paths.".to_string());
    }

    let path = if target.to_ascii_lowercase().starts_with("file:") {
        let url = Url::parse(target).map_err(|_| "The file URL is invalid.".to_string())?;
        if url.scheme() != "file" {
            return Err("The local link must use a file URL or an absolute path.".to_string());
        }
        let host = url.host_str().unwrap_or_default();
        if !host.is_empty() && !host.eq_ignore_ascii_case("localhost") {
            return Err("KitNote blocks file URLs with remote hosts.".to_string());
        }
        if !url.username().is_empty() || url.password().is_some() {
            return Err("KitNote blocks file URLs containing credentials.".to_string());
        }
        url.to_file_path()
            .map_err(|_| "The file URL could not be converted to a local path.".to_string())?
    } else {
        PathBuf::from(target)
    };

    if is_network_or_device_path(&path) {
        return Err("KitNote blocks network, UNC, and device paths.".to_string());
    }
    if !path.is_absolute() {
        return Err("KitNote only opens absolute local paths.".to_string());
    }
    if has_alternate_data_stream(&path) {
        return Err("KitNote blocks Windows alternate data stream paths.".to_string());
    }
    Ok(path)
}

fn validate_canonical_local_target(path: &Path) -> Result<(), String> {
    if is_network_or_device_path(path) {
        return Err("KitNote blocks network, UNC, and device paths.".to_string());
    }
    let metadata =
        fs::metadata(path).map_err(|error| format!("Could not inspect local target: {error}"))?;
    if metadata.is_dir() {
        return Ok(());
    }
    if !metadata.is_file() {
        return Err("KitNote only opens ordinary files and folders.".to_string());
    }

    let extension = normalized_extension(path)
        .ok_or_else(|| "KitNote only opens files with a recognized safe extension.".to_string())?;
    if RISKY_EXTENSIONS.contains(&extension.as_str()) {
        return Err(
            "KitNote blocked this local link because it can execute code or change Windows."
                .to_string(),
        );
    }
    if !SAFE_FILE_EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!(
            "KitNote does not open .{extension} files because that file type is not on the safe list."
        ));
    }
    Ok(())
}

fn normalized_extension(path: &Path) -> Option<String> {
    let file_name = path.file_name()?.to_string_lossy();
    let normalized = file_name.trim_end_matches([' ', '.']);
    Path::new(normalized)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
}

fn has_alternate_data_stream(path: &Path) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.contains(':'))
}

fn is_unsafe_raw_network_path(value: &str) -> bool {
    let normalized = value.replace('/', "\\");
    normalized.starts_with("\\\\")
}

fn is_network_or_device_path(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('/', "\\");
    if normalized.starts_with("\\\\?\\UNC\\") || normalized.starts_with("\\\\.\\") {
        return true;
    }
    normalized.starts_with("\\\\") && !normalized.starts_with("\\\\?\\")
}

#[cfg(windows)]
fn open_with_system(target: &OsStr) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};

    let operation: Vec<u16> = OsStr::new("open")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let target: Vec<u16> = target.encode_wide().chain(std::iter::once(0)).collect();
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            target.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if result as isize > 32 {
        Ok(())
    } else {
        Err(format!(
            "Windows could not open the selected target (ShellExecute error {}).",
            result as isize
        ))
    }
}

#[cfg(not(windows))]
fn open_with_system(_target: &OsStr) -> Result<(), String> {
    Err("Opening links is currently supported only on Windows.".to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        is_network_or_device_path, is_unsafe_raw_network_path, local_path_from_target,
        normalized_extension, validate_canonical_local_target, RISKY_EXTENSIONS,
        SAFE_FILE_EXTENSIONS,
    };
    use std::{fs, path::Path};

    #[test]
    fn blocks_required_executable_script_shortcut_and_control_extensions() {
        let required = [
            "exe",
            "bat",
            "cmd",
            "com",
            "msi",
            "ps1",
            "vbs",
            "js",
            "jse",
            "wsf",
            "scr",
            "jar",
            "lnk",
            "url",
            "hta",
            "cpl",
            "reg",
            "chm",
            "pif",
            "scf",
            "appref-ms",
            "msc",
            "ws",
            "wsh",
            "vbe",
            "sct",
        ];

        for extension in required {
            assert!(
                RISKY_EXTENSIONS.contains(&extension),
                "missing risky extension: {extension}"
            );
        }
    }

    #[test]
    fn extension_checks_are_case_insensitive_and_handle_trailing_spaces_or_dots() {
        assert_eq!(
            normalized_extension(Path::new("dangerous.LNK")),
            Some("lnk".to_string())
        );
        assert_eq!(
            normalized_extension(Path::new("dangerous.ExE...  ")),
            Some("exe".to_string())
        );
        assert_eq!(
            normalized_extension(Path::new("normal.PDF")),
            Some("pdf".to_string())
        );
    }

    #[test]
    fn rejects_unc_device_and_remote_file_url_targets_before_opening() {
        assert!(is_unsafe_raw_network_path(r"\\server\share\file.txt"));
        assert!(is_unsafe_raw_network_path("//server/share/file.txt"));
        assert!(is_network_or_device_path(Path::new(
            r"\\?\UNC\server\share\file.txt"
        )));
        assert!(is_network_or_device_path(Path::new(r"\\.\PhysicalDrive0")));
        assert!(local_path_from_target("file://server/share/file.txt").is_err());
        assert!(local_path_from_target("file:////server/share/file.txt").is_err());
    }

    #[test]
    fn allows_safe_ordinary_file_extensions() {
        for extension in ["txt", "md", "pdf", "docx", "png", "jpg", "xlsx"] {
            assert!(
                SAFE_FILE_EXTENSIONS.contains(&extension),
                "missing safe extension: {extension}"
            );
        }
        assert!(!SAFE_FILE_EXTENSIONS.contains(&"exe"));
        assert!(!SAFE_FILE_EXTENSIONS.contains(&"html"));
    }

    #[test]
    fn allows_existing_safe_files_and_directories() {
        let temp = tempfile::tempdir().expect("temp dir");
        let safe_file = temp.path().join("note.TXT");
        fs::write(&safe_file, "safe").expect("write safe file");

        let canonical_file = fs::canonicalize(&safe_file).expect("canonical file");
        let canonical_dir = fs::canonicalize(temp.path()).expect("canonical dir");
        assert!(validate_canonical_local_target(&canonical_file).is_ok());
        assert!(validate_canonical_local_target(&canonical_dir).is_ok());
    }
}
