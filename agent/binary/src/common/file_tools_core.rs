use crate::common::{
    constants::{
        CMD_OUTPUT_CAP, CMD_TIMEOUT_MS, MAX_BINARY_BYTES, MAX_INFO_HASH_BYTES, MAX_SEARCH_RESULTS,
        READ_PREVIEW_MAX_LINES, SNIFF_BYTES,
    },
    lib::{default_ignore_set, unix_secs_to_iso},
    types::{
        BinaryReadResult, CopyResult, DirEntry, DirEntryEnum, EditResult, FileEntry, FileInfo,
        ReadFileResult, RunResult, SearchContentResult, SearchNamesResult, WriteFileResult,
    },
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use rand;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{BufRead, BufReader, Read},
    path::Path,
};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileToolsCore {
    allowed_dirs: Vec<String>,
    allowed_executables: Vec<String>,
}

impl FileToolsCore {
    pub fn new(allowed_dirs: Vec<String>, allowed_executables: Vec<String>) -> Self {
        Self {
            allowed_dirs,
            allowed_executables,
        }
    }

    pub fn roots(&self) -> &[String] {
        &self.allowed_dirs
    }

    pub fn executables(&self) -> &[String] {
        &self.allowed_executables
    }

    pub fn is_allowed_executable(&self, exe: &str) -> bool {
        self.allowed_executables.contains(&exe.to_string())
    }

    pub fn list_allowed(&self) -> FileToolsCore {
        self.clone()
    }

    // ---- public methods ----

    pub fn read_file(
        &self,
        target_path: &str,
        from_line: Option<usize>,
        to_line: Option<usize>,
    ) -> Result<ReadFileResult, std::io::Error> {
        let safe = self.assert_allowed(target_path)?;
        let metadata = fs::metadata(&safe)?;
        let bytes = metadata.len();
        let explicit_range = from_line.is_some() || to_line.is_some();
        let cap = READ_PREVIEW_MAX_LINES;

        let (mut lines, trailing_newline) = Self::read_file_range(
            &safe,
            from_line.unwrap_or(1),
            if explicit_range {
                to_line.unwrap_or(usize::MAX)
            } else {
                cap + 1
            },
        )?;

        let mut truncated = false;
        if !explicit_range && lines.len() > cap {
            lines.truncate(cap);
            truncated = true;
        }

        let mut content = lines.join("\n");
        if trailing_newline {
            content.push('\n');
        }

        Ok(ReadFileResult {
            content,
            hash: Self::get_file_hash(&safe)?,
            bytes: bytes as usize,
            line_count: lines.len(),
            truncated,
        })
    }

    pub fn write_file(
        &self,
        target_path: &str,
        content: &str,
        from_line: Option<usize>,
        to_line: Option<usize>,
        hash: Option<&str>,
    ) -> Result<WriteFileResult, std::io::Error> {
        let safe = self.assert_allowed(target_path)?;
        if let (Some(from), Some(to)) = (from_line, to_line)
            && from > to
        {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("fromLine ({from}) must not be greater than toLine ({to})"),
            ));
        }
        let exists = Path::new(&safe).exists();

        if exists {
            Self::check_overwrite(&safe, hash)?;
            let before = fs::read_to_string(&safe)?;
            let after = self.compute_new_content(
                &before,
                content,
                from_line.unwrap_or(0),
                to_line.unwrap_or(usize::MAX),
            );
            Self::atomic_write(&safe, &after)?;
        } else {
            fs::write(&safe, content)?;
        }

        Ok(WriteFileResult {
            hash: Self::get_file_hash(&safe)?,
        })
    }

    pub fn is_binary_file(&self, target_path: &str) -> Result<bool, std::io::Error> {
        let safe = self.assert_allowed(target_path)?;
        Ok(looks_binary(&Self::sniff(&safe)?))
    }

    pub fn read_binary(&self, target_path: &str) -> Result<BinaryReadResult, std::io::Error> {
        let safe = self.assert_allowed(target_path)?;
        let size = fs::metadata(&safe)?.len();
        if size > MAX_BINARY_BYTES {
            return Err(too_large("read", size));
        }
        let data = fs::read(&safe)?;
        if data.len() as u64 > MAX_BINARY_BYTES {
            return Err(too_large("read", data.len() as u64));
        }
        Ok(BinaryReadResult {
            content_base64: BASE64.encode(&data),
            hash: hex::encode(Sha256::digest(&data)),
            bytes: data.len(),
            mime_type: mime_type(&safe, &data, false),
        })
    }

    pub fn write_binary(
        &self,
        target_path: &str,
        content_base64: &str,
        hash: Option<&str>,
    ) -> Result<WriteFileResult, std::io::Error> {
        let safe = self.assert_allowed(target_path)?;
        let compact: String = content_base64.split_ascii_whitespace().collect();
        let data = BASE64.decode(compact.as_bytes()).map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("content is not valid base64: {e}"),
            )
        })?;
        if data.len() as u64 > MAX_BINARY_BYTES {
            return Err(too_large("write", data.len() as u64));
        }
        if Path::new(&safe).exists() {
            Self::check_overwrite(&safe, hash)?;
            Self::atomic_write(&safe, &data)?;
        } else {
            fs::write(&safe, &data)?;
        }
        Ok(WriteFileResult {
            hash: hex::encode(Sha256::digest(&data)),
        })
    }

    pub fn file_info(&self, target_path: &str) -> Result<FileInfo, std::io::Error> {
        let safe = self.assert_allowed(target_path)?;
        let metadata = fs::metadata(&safe)?;
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| unix_secs_to_iso(d.as_secs()));
        if metadata.is_dir() {
            return Ok(FileInfo {
                path: safe,
                kind: "directory".to_string(),
                bytes: 0,
                modified,
                mime_type: None,
                is_text: None,
                hash: None,
            });
        }
        let sample = Self::sniff(&safe)?;
        let is_text = !looks_binary(&sample);
        let hash = if metadata.len() <= MAX_INFO_HASH_BYTES {
            Some(Self::get_file_hash(&safe)?)
        } else {
            None
        };
        Ok(FileInfo {
            mime_type: Some(mime_type(&safe, &sample.bytes, is_text)),
            path: safe,
            kind: "file".to_string(),
            bytes: metadata.len(),
            modified,
            is_text: Some(is_text),
            hash,
        })
    }

    pub fn delete_file(&self, target_path: &str) -> Result<(), std::io::Error> {
        let safe = self.assert_allowed(target_path)?;
        fs::remove_file(&safe)
    }

    pub fn create_folder(&self, target_path: &str) -> Result<(), std::io::Error> {
        let safe = self.assert_allowed(target_path)?;
        fs::create_dir_all(&safe)
    }

    pub fn delete_folder(&self, target_path: &str) -> Result<(), std::io::Error> {
        let safe = self.assert_allowed(target_path)?;
        if self.allowed_dirs.contains(&safe) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "Refusing to delete an allowed root folder. Delete the files inside it instead.",
            ));
        }
        fs::remove_dir_all(&safe)
    }

    pub fn edit_file(
        &self,
        target_path: &str,
        old_string: &str,
        new_string: &str,
        replace_all: bool,
        hash: Option<&str>,
    ) -> Result<EditResult, std::io::Error> {
        let safe = self.assert_allowed(target_path)?;
        if old_string.is_empty() {
            return Err(invalid_input(
                "oldString must not be empty. To create or replace a whole file, use writeFile.",
            ));
        }
        if old_string == new_string {
            return Err(invalid_input(
                "oldString and newString are the same, so there is nothing to change.",
            ));
        }
        let current = String::from_utf8(fs::read(&safe)?).map_err(|_| {
            invalid_input("editFile only works on text files, and this one is binary.")
        })?;
        if let Some(expected) = hash
            && hex::encode(Sha256::digest(current.as_bytes())) != expected
        {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Hash mismatch. This file has changed since you read it — re-read it and retry with its latest hash",
            ));
        }
        let (old_string, new_string) = match_line_endings(&current, old_string, new_string);
        let count = current.matches(old_string.as_str()).count();
        if count == 0 {
            return Err(invalid_input(
                "oldString was not found in the file. Re-read the file and copy the text exactly, including whitespace and indentation.",
            ));
        }
        if count > 1 && !replace_all {
            return Err(invalid_input(&format!(
                "oldString appears {count} times. Include more surrounding text so it matches exactly once, or set replaceAll to true."
            )));
        }
        let updated = if replace_all {
            current.replace(old_string.as_str(), &new_string)
        } else {
            current.replacen(old_string.as_str(), &new_string, 1)
        };
        Self::atomic_write(&safe, &updated)?;
        Ok(EditResult {
            hash: hex::encode(Sha256::digest(updated.as_bytes())),
            replacements: if replace_all { count } else { 1 },
        })
    }

    pub fn move_path(
        &self,
        from: &str,
        to: &str,
        hash: Option<&str>,
    ) -> Result<(), std::io::Error> {
        let src = self.assert_allowed(from)?;
        if self.allowed_dirs.contains(&src) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "Refusing to move an allowed root folder.",
            ));
        }
        let dst = self.assert_allowed(to)?;
        let src_meta = fs::metadata(&src)?;

        if same_file(&src, &dst) {
            let requested = Path::new(to).file_name();
            let target = match (Path::new(&dst).parent(), requested) {
                (Some(parent), Some(name)) => parent.join(name),
                _ => return Err(invalid_input("from and to are the same path.")),
            };
            if Path::new(&src).file_name() == target.file_name() {
                return Err(invalid_input("from and to are the same path."));
            }
            return fs::rename(&src, &target);
        }

        Self::require_parent(&dst)?;
        if Path::new(&dst).exists() {
            if src_meta.is_dir() || fs::metadata(&dst)?.is_dir() {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::AlreadyExists,
                    format!(
                        "{to} already exists. Folders are never overwritten, so move to a path that doesn't exist yet."
                    ),
                ));
            }
            Self::check_overwrite(&dst, hash)?;
        }
        if src_meta.is_dir() && Path::new(&dst).starts_with(&src) {
            return Err(invalid_input("A folder can't be moved into itself."));
        }

        match fs::rename(&src, &dst) {
            Err(e) if src_meta.is_file() && e.kind() == std::io::ErrorKind::CrossesDevices => {
                fs::copy(&src, &dst)?;
                fs::remove_file(&src)
            }
            other => other,
        }
    }

    pub fn copy_file(
        &self,
        from: &str,
        to: &str,
        hash: Option<&str>,
    ) -> Result<CopyResult, std::io::Error> {
        let src = self.assert_allowed(from)?;
        let dst = self.assert_allowed(to)?;
        let src_meta = fs::metadata(&src)?;
        if src_meta.is_dir() {
            return Err(invalid_input(
                "copyFile copies files only. Create the new folder with createFolder and copy the files into it.",
            ));
        }
        if same_file(&src, &dst) {
            return Err(invalid_input("from and to are the same file."));
        }
        Self::require_parent(&dst)?;
        if Path::new(&dst).exists() {
            if fs::metadata(&dst)?.is_dir() {
                return Err(invalid_input(&format!(
                    "{to} is a folder. Give the full path of the new file, including its name."
                )));
            }
            Self::check_overwrite(&dst, hash)?;
        }
        fs::copy(&src, &dst)?;
        Ok(CopyResult {
            hash: Self::get_file_hash(&dst)?,
            bytes: src_meta.len(),
        })
    }

    pub fn get_folder_contents(&self, target_path: &str) -> Result<Vec<DirEntry>, std::io::Error> {
        let safe = self.assert_allowed(target_path)?;
        let entries = fs::read_dir(&safe)?;

        let mut result = Vec::new();
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let ft = entry.file_type()?;
            let is_dir = ft.is_dir();
            let metadata = entry.metadata().ok();
            let parent = path
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

            result.push(DirEntry {
                name,
                entry_type: if is_dir {
                    DirEntryEnum::Directory
                } else {
                    DirEntryEnum::File
                },
                parent,
                size: metadata.as_ref().map(|m| m.len() as usize).unwrap_or(0),
                modified: metadata.and_then(|m| m.modified().ok()).map(|t| {
                    let secs = t
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    unix_secs_to_iso(secs)
                }),
            });
        }

        result.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(result)
    }

    pub fn search_names(
        &self,
        target_path: &str,
        query_regex: &str,
        case_insensitive: bool,
    ) -> Result<SearchNamesResult, std::io::Error> {
        let safe = self.assert_allowed(target_path)?;
        let re = self.build_regex(query_regex, case_insensitive)?;
        let ignore = default_ignore_set();

        let mut files = Vec::new();
        let mut truncated = false;

        for (path, is_dir) in self.walk_entries(&safe, &ignore) {
            if files.len() >= MAX_SEARCH_RESULTS {
                truncated = true;
                break;
            }
            let name = Path::new(&path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            if re.is_match(&name) {
                let parent = Path::new(&path)
                    .parent()
                    .unwrap_or(Path::new(""))
                    .to_string_lossy()
                    .to_string();
                files.push(FileEntry {
                    name,
                    entry_type: if is_dir { "directory" } else { "file" }.to_string(),
                    parent,
                });
            }
        }

        Ok(SearchNamesResult { files, truncated })
    }

    pub fn search_content(
        &self,
        target_path: &str,
        query_regex: &str,
        case_insensitive: bool,
    ) -> Result<SearchContentResult, std::io::Error> {
        let safe = self.assert_allowed(target_path)?;
        let re = self.build_regex(query_regex, case_insensitive)?;
        let (files, truncated) = self.search_file_contents(&safe, &re);
        Ok(SearchContentResult { files, truncated })
    }

    pub fn assert_allowed_path(&self, target_path: &str) -> Result<String, std::io::Error> {
        self.assert_allowed(target_path)
    }

    pub fn run_confined(
        &self,
        exe: &str,
        args: &[String],
        cwd: &str,
        timeout_ms: Option<usize>,
    ) -> Result<RunResult, std::io::Error> {
        use std::process::{Command, Stdio};
        use std::time::Duration;

        let mut cmd = Command::new(Self::resolve_program(exe));
        cmd.args(args)
            .current_dir(cwd)
            .env_clear()
            .envs(Self::safe_env())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let timeout = timeout_ms.unwrap_or(CMD_TIMEOUT_MS);
        let mut child = cmd.spawn()?;

        // Read stdout/stderr in a non-blocking way via threads
        let stdout_handle = {
            let stdout = child.stdout.take().unwrap();
            std::thread::spawn(move || {
                let mut output = String::new();
                use std::io::Read;
                let mut reader = stdout.take(CMD_OUTPUT_CAP as u64);
                reader.read_to_string(&mut output).ok();
                let truncated = output.len() >= CMD_OUTPUT_CAP;
                output.truncate(CMD_OUTPUT_CAP);
                (output, truncated)
            })
        };
        let stderr_handle = {
            let stderr = child.stderr.take().unwrap();
            std::thread::spawn(move || {
                let mut output = String::new();
                use std::io::Read;
                let mut reader = stderr.take(CMD_OUTPUT_CAP as u64);
                reader.read_to_string(&mut output).ok();
                let truncated = output.len() >= CMD_OUTPUT_CAP;
                output.truncate(CMD_OUTPUT_CAP);
                (output, truncated)
            })
        };

        // Wait with timeout
        let start = std::time::Instant::now();
        let status = loop {
            if start.elapsed() > Duration::from_millis(timeout as u64) {
                let _ = child.kill();
                let _ = child.wait();
                let (stdout, stdout_truncated) =
                    stdout_handle.join().unwrap_or((String::new(), false));
                let (stderr, stderr_truncated) =
                    stderr_handle.join().unwrap_or((String::new(), false));
                return Ok(RunResult {
                    success: false,
                    exit_code: None,
                    stdout,
                    stderr: format!("{}\n[killed by SIGKILL — likely timeout]", stderr.trim()),
                    truncated: stdout_truncated || stderr_truncated,
                });
            }
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => std::thread::sleep(Duration::from_millis(50)),
                Err(e) => {
                    let (stdout, _) = stdout_handle.join().unwrap_or((String::new(), false));
                    let (stderr, _) = stderr_handle.join().unwrap_or((String::new(), false));
                    return Ok(RunResult {
                        success: false,
                        exit_code: None,
                        stdout,
                        stderr: format!("{}\n{}\n", stderr.trim(), Self::msg(&e)),
                        truncated: false,
                    });
                }
            }
        };

        let (stdout, stdout_truncated) = stdout_handle.join().unwrap_or((String::new(), false));
        let (stderr, stderr_truncated) = stderr_handle.join().unwrap_or((String::new(), false));

        Ok(RunResult {
            success: status.success(),
            exit_code: status.code(),
            stdout,
            stderr,
            truncated: stdout_truncated || stderr_truncated,
        })
    }

    fn msg(error: &dyn std::error::Error) -> String {
        error.to_string()
    }

    fn check_overwrite(safe: &str, hash: Option<&str>) -> std::io::Result<()> {
        let expected_hash = hash.ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "This file already exists — provide its current hash (from ReadFile or a prior WriteFile) to overwrite it",
            )
        })?;
        if Self::get_file_hash(safe)? != expected_hash {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Hash mismatch. This file has changed since the last write — re-read the file and retry with its latest hash",
            ));
        }
        Ok(())
    }

    fn sniff(safe: &str) -> std::io::Result<Sample> {
        let mut bytes = Vec::new();
        File::open(safe)?
            .take(SNIFF_BYTES)
            .read_to_end(&mut bytes)?;
        let complete = (bytes.len() as u64) < SNIFF_BYTES
            || fs::metadata(safe)
                .map(|m| m.len() <= SNIFF_BYTES)
                .unwrap_or(false);
        Ok(Sample { bytes, complete })
    }

    fn require_parent(safe: &str) -> std::io::Result<()> {
        match Path::new(safe).parent() {
            Some(parent) if !parent.is_dir() => Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!(
                    "The folder {} doesn't exist. Create it with createFolder first.",
                    parent.display()
                ),
            )),
            _ => Ok(()),
        }
    }

    fn atomic_write(file_path: &str, data: impl AsRef<[u8]>) -> std::io::Result<()> {
        let rand_hex: String = (0..12)
            .map(|_| format!("{:x}", rand::random::<u8>() % 16))
            .collect();
        let tmp = format!("{}.{}.tmp", file_path, rand_hex);
        fs::write(&tmp, data)?;
        if let Ok(existing) = fs::metadata(file_path) {
            let _ = fs::set_permissions(&tmp, existing.permissions());
        }
        if let Err(e) = fs::rename(&tmp, file_path) {
            let _ = fs::remove_file(&tmp);
            return Err(e);
        }
        Ok(())
    }

    fn assert_allowed(&self, target: &str) -> Result<String, std::io::Error> {
        if target.is_empty() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "A path is required",
            ));
        }
        let abs = std::path::absolute(target)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e.to_string()))?;
        let canonical = Self::resolve_path(&abs)?;
        let canonical_str = canonical.to_string_lossy().to_string();

        let allowed = self.allowed_dirs.iter().any(|root| {
            canonical_str == *root
                || canonical_str.starts_with(&format!("{}{}", root, std::path::MAIN_SEPARATOR))
        });

        if !allowed {
            return Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "Access denied: path is outside the allowed roots. Ask the user to add it with `frw-agent config`.",
            ));
        }

        Ok(canonical_str)
    }

    #[cfg(windows)]
    fn resolve_program(exe: &str) -> std::path::PathBuf {
        let given = std::path::Path::new(exe);
        if given.components().count() > 1 || given.extension().is_some() {
            return given.to_path_buf();
        }
        let exts = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
        let path = std::env::var_os("PATH").unwrap_or_default();
        for dir in std::env::split_paths(&path) {
            for ext in exts.split(';').filter(|e| !e.is_empty()) {
                let candidate = dir.join(format!("{exe}{ext}"));
                if candidate.is_file() {
                    return candidate;
                }
            }
        }
        given.to_path_buf()
    }

    #[cfg(not(windows))]
    fn resolve_program(exe: &str) -> std::path::PathBuf {
        std::path::PathBuf::from(exe)
    }

    fn resolve_path(abs: &std::path::Path) -> Result<std::path::PathBuf, std::io::Error> {
        if let Ok(path) = dunce::canonicalize(abs) {
            return Ok(path);
        }
        let mut existing = abs.to_path_buf();
        let mut missing = Vec::new();
        while !existing.exists() {
            match (existing.file_name(), existing.parent()) {
                (Some(name), Some(parent)) => {
                    missing.push(name.to_os_string());
                    existing = parent.to_path_buf();
                }
                _ => {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "Invalid path",
                    ));
                }
            }
        }
        let mut resolved = dunce::canonicalize(&existing)?;
        for part in missing.iter().rev() {
            resolved.push(part);
        }
        Ok(resolved)
    }

    fn safe_env() -> std::collections::HashMap<String, String> {
        let sensitive_re = Regex::new(
            r"(?i)(SECRET|TOKEN|KEY|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|SESSION|AWS_|GCP_|AZURE_|OPENAI|ANTHROPIC|STRIPE|SUPABASE|DATABASE_URL|CONNECTION_STRING)"
        ).unwrap();

        std::env::vars()
            .filter(|(k, _)| !sensitive_re.is_match(k))
            .collect()
    }

    fn get_file_hash(file_path: &str) -> Result<String, std::io::Error> {
        let mut file = File::open(file_path)?;
        let mut hasher = Sha256::new();
        let mut buf = vec![0u8; 64 * 1024];
        loop {
            let n = file.read(&mut buf)?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
        }
        Ok(hex::encode(hasher.finalize()))
    }

    fn file_contains_regex(&self, file_path: &str, regex: &regex::Regex) -> std::io::Result<bool> {
        let file = File::open(file_path)?;
        let reader = BufReader::new(file);

        for line in reader.lines() {
            match line {
                Ok(line) => {
                    if regex.is_match(&line) {
                        return Ok(true);
                    }
                }
                Err(_) => continue,
            }
        }

        Ok(false)
    }

    fn walk_entries(
        &self,
        dir: &str,
        ignore: &std::collections::HashSet<&str>,
    ) -> impl Iterator<Item = (String, bool)> {
        WalkDir::new(dir)
            .into_iter()
            .filter_entry(|e| !ignore.contains(e.file_name().to_str().unwrap_or("")))
            .filter_map(|e| {
                match e {
                    Ok(entry) => {
                        let is_dir = entry.file_type().is_dir();
                        Some((entry.path().to_string_lossy().to_string(), is_dir))
                    }
                    Err(_) => None, // skip unreadable dirs
                }
            })
    }

    fn walk_files(&self, dir: &str, ignore: HashSet<&str>) -> Vec<String> {
        self.walk_entries(dir, &ignore)
            .filter(|(_, is_dir)| !*is_dir)
            .map(|(path, _)| path)
            .collect()
    }

    fn search_file_contents(
        &self,
        folder_path: &str,
        content_regex: &Regex,
    ) -> (Vec<String>, bool) {
        let mut files: Vec<String> = Vec::new();
        let mut truncated = false;
        let ignore_set = default_ignore_set();

        for file in self.walk_files(folder_path, ignore_set) {
            if files.len() >= MAX_SEARCH_RESULTS {
                truncated = true;
                break;
            }
            if let Ok(true) = self.file_contains_regex(&file, content_regex) {
                files.push(file);
            }
        }

        (files, truncated)
    }

    fn compute_new_content(
        &self,
        current: &str,
        new_content: &str,
        start_line: usize,
        end_line: usize,
    ) -> String {
        let mut lines: Vec<&str> = Vec::new();
        let mut out: Vec<&str> = Vec::new();
        let mut written: bool = false;

        if !current.is_empty() {
            lines = current.split('\n').collect();
        }

        for (i, line) in lines.iter().enumerate() {
            let n = i + 1;
            if n >= start_line && n <= end_line {
                if !written {
                    out.push(new_content);
                    written = true;
                }
            } else {
                out.push(line)
            }
        }

        if !written {
            out.push(new_content)
        };
        out.join("\n")
    }

    fn read_file_range(
        file_path: &str,
        from_line: usize,
        to_line: usize,
    ) -> std::io::Result<(Vec<String>, bool)> {
        let mut reader = BufReader::new(File::open(file_path)?);
        let mut lines = Vec::new();
        let mut buf = Vec::new();
        let mut n = 0; // 1-based
        let mut ended_with_newline = false;

        while n < to_line {
            buf.clear();
            if reader.read_until(b'\n', &mut buf)? == 0 {
                let trailing_newline = ended_with_newline && !lines.is_empty();
                return Ok((lines, trailing_newline));
            }
            n += 1;
            ended_with_newline = buf.last() == Some(&b'\n');
            if ended_with_newline {
                buf.pop();
            }
            if n >= from_line {
                let line = String::from_utf8(std::mem::take(&mut buf))
                    .map_err(|_| {
                        std::io::Error::new(
                            std::io::ErrorKind::InvalidData,
                            format!(
                                "Line {n} is not UTF-8 text, so this looks like a binary file. Read it with encoding \"base64\" instead."
                            ),
                        )
                    })?;
                lines.push(line);
            }
        }

        Ok((lines, false))
    }

    fn build_regex(&self, pattern: &str, case_insensitive: bool) -> Result<Regex, std::io::Error> {
        let full = if case_insensitive && !pattern.starts_with("(?i)") {
            format!("(?i){}", pattern)
        } else {
            pattern.to_string()
        };
        Regex::new(&full).map_err(|e| {
            let detail = match e {
                regex::Error::Syntax(s) => s
                    .lines()
                    .rev()
                    .find(|l| l.starts_with("error:"))
                    .map(|l| l.trim_start_matches("error:").trim().to_string())
                    .unwrap_or(s),
                other => other.to_string(),
            };
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("Invalid regex \"{pattern}\": {detail}"),
            )
        })
    }
}

struct Sample {
    bytes: Vec<u8>,
    complete: bool,
}

fn invalid_input(message: &str) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidInput, message.to_string())
}

fn match_line_endings(current: &str, old: &str, new: &str) -> (String, String) {
    if !current.contains(old) && current.contains("\r\n") && old.contains('\n') {
        let crlf = |s: &str| s.replace("\r\n", "\n").replace('\n', "\r\n");
        let converted = crlf(old);
        if current.contains(&converted) {
            return (converted, crlf(new));
        }
    }
    (old.to_string(), new.to_string())
}

#[cfg(unix)]
fn same_file(a: &str, b: &str) -> bool {
    use std::os::unix::fs::MetadataExt;
    match (fs::metadata(a), fs::metadata(b)) {
        (Ok(x), Ok(y)) => x.dev() == y.dev() && x.ino() == y.ino(),
        _ => false,
    }
}

#[cfg(not(unix))]
fn same_file(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b) && Path::new(b).exists()
}

fn looks_binary(sample: &Sample) -> bool {
    if sample.bytes.contains(&0) {
        return true;
    }
    match std::str::from_utf8(&sample.bytes) {
        Ok(_) => false,
        Err(e) => sample.complete || e.error_len().is_some(),
    }
}

fn too_large(action: &str, bytes: u64) -> std::io::Error {
    std::io::Error::new(
        std::io::ErrorKind::InvalidInput,
        format!(
            "File is {} bytes; binary files can only {action} up to {} bytes (5 MB)",
            bytes, MAX_BINARY_BYTES
        ),
    )
}

fn mime_type(path: &str, sample: &[u8], is_text: bool) -> String {
    let sniffed = || infer::get(sample).map(|kind| kind.mime_type());
    let by_extension = || extension_mime(path);
    let found = if is_text {
        by_extension().or_else(sniffed)
    } else {
        sniffed().or_else(by_extension)
    };
    found
        .unwrap_or(if is_text {
            "text/plain"
        } else {
            "application/octet-stream"
        })
        .to_string()
}

fn extension_mime(path: &str) -> Option<&'static str> {
    let ext = Path::new(path).extension()?.to_str()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "wasm" => "application/wasm",
        "json" => "application/json",
        "xml" => "application/xml",
        "md" => "text/markdown",
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "js" | "mjs" | "cjs" => "text/javascript",
        "csv" => "text/csv",
        "txt" => "text/plain",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::FileToolsCore;
    use std::fs;
    use std::path::PathBuf;

    fn sandbox(name: &str) -> (PathBuf, FileToolsCore) {
        let base = dunce::canonicalize(std::env::temp_dir())
            .unwrap()
            .join(format!("frw-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("root/sub")).unwrap();
        fs::create_dir_all(base.join("outside")).unwrap();
        let root = dunce::canonicalize(base.join("root")).unwrap();
        let core = FileToolsCore::new(vec![root.to_string_lossy().to_string()], vec![]);
        (base, core)
    }

    fn path(p: PathBuf) -> String {
        p.to_string_lossy().to_string()
    }

    #[test]
    fn allows_existing_and_new_paths_inside_root() {
        let (base, core) = sandbox("inside");
        assert!(
            core.assert_allowed_path(&path(base.join("root/sub")))
                .is_ok()
        );
        assert!(
            core.assert_allowed_path(&path(base.join("root/new/file.txt")))
                .is_ok()
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn rejects_dotdot_escape_on_new_paths() {
        let (base, core) = sandbox("dotdot");
        let escape = base.join("root").join("..").join("outside").join("new.txt");
        assert!(core.assert_allowed_path(&path(escape)).is_err());
        let missing_parent = base.join("root").join("..").join("nope").join("new.txt");
        assert!(core.assert_allowed_path(&path(missing_parent)).is_err());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn rejects_sibling_with_shared_prefix() {
        let (base, core) = sandbox("prefix");
        fs::create_dir_all(base.join("root2")).unwrap();
        assert!(
            core.assert_allowed_path(&path(base.join("root2/file.txt")))
                .is_err()
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let (base, core) = sandbox("symlink");
        std::os::unix::fs::symlink(base.join("outside"), base.join("root/link")).unwrap();
        assert!(
            core.assert_allowed_path(&path(base.join("root/link/new.txt")))
                .is_err()
        );
        fs::remove_dir_all(base).unwrap();
    }

    fn round_trip(core: &FileToolsCore, file: &str, from: Option<usize>, to: Option<usize>) {
        let before = fs::read(file).unwrap();
        let read = core.read_file(file, from, to).unwrap();
        core.write_file(file, &read.content, from, to, Some(&read.hash))
            .unwrap();
        assert_eq!(fs::read(file).unwrap(), before);
    }

    #[test]
    fn read_keeps_trailing_newline() {
        let (base, core) = sandbox("trailing");
        let file = path(base.join("root/a.txt"));
        fs::write(&file, "a\nb\n").unwrap();
        let read = core.read_file(&file, None, None).unwrap();
        assert_eq!(read.content, "a\nb\n");
        assert_eq!(read.line_count, 2);
        round_trip(&core, &file, None, None);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn read_keeps_crlf_line_endings() {
        let (base, core) = sandbox("crlf");
        let file = path(base.join("root/a.txt"));
        fs::write(&file, "a\r\nb\r\n").unwrap();
        let read = core.read_file(&file, None, None).unwrap();
        assert_eq!(read.content, "a\r\nb\r\n");
        assert_eq!(read.line_count, 2);
        round_trip(&core, &file, None, None);
        round_trip(&core, &file, Some(1), Some(1));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn read_without_trailing_newline_is_unchanged() {
        let (base, core) = sandbox("no-trailing");
        let file = path(base.join("root/a.txt"));
        fs::write(&file, "a\nb").unwrap();
        assert_eq!(core.read_file(&file, None, None).unwrap().content, "a\nb");
        round_trip(&core, &file, None, None);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn range_reads_round_trip() {
        let (base, core) = sandbox("range");
        let file = path(base.join("root/a.txt"));
        fs::write(&file, "a\nb\nc\n").unwrap();
        assert_eq!(
            core.read_file(&file, Some(2), Some(2)).unwrap().content,
            "b"
        );
        assert_eq!(
            core.read_file(&file, Some(2), None).unwrap().content,
            "b\nc\n"
        );
        assert_eq!(core.read_file(&file, Some(5), Some(9)).unwrap().content, "");
        round_trip(&core, &file, Some(2), Some(2));
        round_trip(&core, &file, Some(2), Some(3));
        round_trip(&core, &file, Some(2), None);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn long_reads_are_truncated_without_trailing_newline() {
        let (base, core) = sandbox("truncate");
        let file = path(base.join("root/a.txt"));
        let cap = crate::common::constants::READ_PREVIEW_MAX_LINES;
        fs::write(&file, "x\n".repeat(cap + 1)).unwrap();
        let read = core.read_file(&file, None, None).unwrap();
        assert!(read.truncated);
        assert_eq!(read.line_count, cap);
        assert!(!read.content.ends_with('\n'));
        fs::write(&file, "x\n".repeat(cap)).unwrap();
        let read = core.read_file(&file, None, None).unwrap();
        assert!(!read.truncated);
        assert_eq!(read.content, "x\n".repeat(cap));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn read_empty_file() {
        let (base, core) = sandbox("empty");
        let file = path(base.join("root/a.txt"));
        fs::write(&file, "").unwrap();
        let read = core.read_file(&file, None, None).unwrap();
        assert_eq!(read.content, "");
        assert_eq!(read.line_count, 0);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn refuses_to_delete_an_allowed_root() {
        let (base, core) = sandbox("delete-root");
        let err = core.delete_folder(&path(base.join("root"))).unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::PermissionDenied);
        assert!(base.join("root/sub").exists());
        core.delete_folder(&path(base.join("root/sub"))).unwrap();
        assert!(!base.join("root/sub").exists());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn rejects_an_inverted_line_range() {
        let (base, core) = sandbox("inverted");
        let file = path(base.join("root/a.txt"));
        fs::write(&file, "1\n2\n3\n4\n").unwrap();
        let hash = core.read_file(&file, None, None).unwrap().hash;
        let err = core
            .write_file(&file, "x", Some(4), Some(2), Some(&hash))
            .unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput);
        assert_eq!(fs::read_to_string(&file).unwrap(), "1\n2\n3\n4\n");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn an_invalid_regex_is_an_error_not_a_panic() {
        let (base, core) = sandbox("bad-regex");
        let root = path(base.join("root"));
        let err = core.search_content(&root, "line t(wo", true).unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput);
        assert_eq!(
            err.to_string(),
            "Invalid regex \"line t(wo\": unclosed group"
        );
        assert!(core.search_names(&root, "[", false).is_err());
        fs::remove_dir_all(base).unwrap();
    }

    const PNG_BASE64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";

    fn png_bytes() -> Vec<u8> {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD
            .decode(PNG_BASE64)
            .unwrap()
    }

    fn sample(bytes: &[u8], complete: bool) -> super::Sample {
        super::Sample {
            bytes: bytes.to_vec(),
            complete,
        }
    }

    #[test]
    fn binary_detection() {
        use super::looks_binary;
        assert!(!looks_binary(&sample(b"plain text\n", true)));
        assert!(!looks_binary(&sample(
            "caf\u{e9} \u{1F600}".as_bytes(),
            true
        )));
        assert!(!looks_binary(&sample(b"", true)));
        assert!(looks_binary(&sample(b"has\0nul", true)));
        assert!(looks_binary(&sample(&[0xff, 0xfe, 0x41], true)));
        let cut = &"ab\u{1F600}".as_bytes()[..4];
        assert!(!looks_binary(&sample(cut, false)));
        assert!(looks_binary(&sample(cut, true)));
        assert!(looks_binary(&sample(&[b'a', 0xff, b'b', 0xe2], false)));
        assert!(looks_binary(&sample(&png_bytes(), true)));
    }

    #[test]
    fn reads_an_image_as_base64_with_its_type() {
        let (base, core) = sandbox("read-png");
        let file = path(base.join("root/pixel.dat"));
        fs::write(&file, png_bytes()).unwrap();
        assert!(core.is_binary_file(&file).unwrap());
        let read = core.read_binary(&file).unwrap();
        assert_eq!(read.content_base64, PNG_BASE64);
        assert_eq!(read.mime_type, "image/png");
        assert_eq!(read.bytes, png_bytes().len());
        assert_eq!(read.hash, core.file_info(&file).unwrap().hash.unwrap());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn text_reads_of_binary_files_explain_what_to_do() {
        let (base, core) = sandbox("utf8-on-binary");
        let file = path(base.join("root/pixel.png"));
        fs::write(&file, png_bytes()).unwrap();
        let err = core.read_file(&file, None, None).unwrap_err();
        assert!(err.to_string().contains("encoding \"base64\""), "{err}");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn binary_writes_follow_the_hash_rule() {
        let (base, core) = sandbox("write-binary");
        let file = path(base.join("root/out.png"));
        let first = core.write_binary(&file, PNG_BASE64, None).unwrap();
        assert_eq!(fs::read(&file).unwrap(), png_bytes());

        let other = "AAECAwQ=";
        assert!(core.write_binary(&file, other, None).is_err());
        assert!(core.write_binary(&file, other, Some("stale")).is_err());
        assert_eq!(fs::read(&file).unwrap(), png_bytes());

        let second = core.write_binary(&file, other, Some(&first.hash)).unwrap();
        assert_eq!(fs::read(&file).unwrap(), vec![0, 1, 2, 3, 4]);
        assert_eq!(second.hash, core.file_info(&file).unwrap().hash.unwrap());

        let wrapped = "AAEC\nAwQ=\n";
        core.write_binary(&path(base.join("root/wrapped.bin")), wrapped, None)
            .unwrap();
        assert_eq!(
            fs::read(base.join("root/wrapped.bin")).unwrap(),
            vec![0, 1, 2, 3, 4]
        );

        let err = core
            .write_binary(&path(base.join("root/bad.bin")), "not base64!", None)
            .unwrap_err();
        assert!(err.to_string().contains("not valid base64"), "{err}");
        assert!(!base.join("root/bad.bin").exists());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn binary_reads_and_writes_are_capped() {
        use base64::Engine;
        let (base, core) = sandbox("binary-cap");
        let big = path(base.join("root/big.bin"));
        let file = fs::File::create(&big).unwrap();
        file.set_len(super::MAX_BINARY_BYTES + 1).unwrap();
        let err = core.read_binary(&big).unwrap_err();
        assert!(err.to_string().contains("5 MB"), "{err}");

        let payload = base64::engine::general_purpose::STANDARD.encode(vec![
            1u8;
            super::MAX_BINARY_BYTES
                as usize
                + 1
        ]);
        let target = base.join("root/too-big.bin");
        assert!(
            core.write_binary(&path(target.clone()), &payload, None)
                .is_err()
        );
        assert!(!target.exists());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn file_info_describes_files_and_folders() {
        let (base, core) = sandbox("info");
        let text = path(base.join("root/notes.md"));
        fs::write(&text, "# hello\n").unwrap();
        let info = core.file_info(&text).unwrap();
        assert_eq!(info.kind, "file");
        assert_eq!(info.is_text, Some(true));
        assert_eq!(info.mime_type.as_deref(), Some("text/markdown"));
        assert_eq!(info.bytes, 8);
        assert_eq!(
            info.hash,
            Some(core.read_file(&text, None, None).unwrap().hash)
        );
        assert!(info.modified.is_some());

        let image = path(base.join("root/no-extension"));
        fs::write(&image, png_bytes()).unwrap();
        let info = core.file_info(&image).unwrap();
        assert_eq!(info.is_text, Some(false));
        assert_eq!(info.mime_type.as_deref(), Some("image/png"));

        let dir = core.file_info(&path(base.join("root/sub"))).unwrap();
        assert_eq!(dir.kind, "directory");
        assert_eq!(dir.is_text, None);
        assert_eq!(dir.hash, None);

        assert!(core.file_info(&path(base.join("outside"))).is_err());
        fs::remove_dir_all(base).unwrap();
    }

    fn hash_of(file: &str) -> String {
        use sha2::{Digest, Sha256};
        hex::encode(Sha256::digest(fs::read(file).unwrap()))
    }

    #[test]
    fn edit_replaces_exactly_one_match() {
        let (base, core) = sandbox("edit-one");
        let file = path(base.join("root/a.rs"));
        fs::write(&file, "fn a() {}\nfn b() {}\n").unwrap();
        let result = core
            .edit_file(&file, "fn b() {}", "fn b() { todo!() }", false, None)
            .unwrap();
        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            "fn a() {}\nfn b() { todo!() }\n"
        );
        assert_eq!(result.replacements, 1);
        assert_eq!(result.hash, hash_of(&file));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn edit_refuses_ambiguous_missing_and_pointless_changes() {
        let (base, core) = sandbox("edit-errors");
        let file = path(base.join("root/a.txt"));
        fs::write(&file, "x = 1\nx = 1\n").unwrap();
        let err = |old: &str, new: &str| {
            core.edit_file(&file, old, new, false, None)
                .unwrap_err()
                .to_string()
        };
        assert!(err("x = 1", "x = 2").contains("appears 2 times"));
        assert!(err("y = 1", "y = 2").contains("not found"));
        assert!(err("", "z").contains("must not be empty"));
        assert!(err("x = 1", "x = 1").contains("nothing to change"));
        assert_eq!(fs::read_to_string(&file).unwrap(), "x = 1\nx = 1\n");

        let all = core.edit_file(&file, "x = 1", "x = 2", true, None).unwrap();
        assert_eq!(all.replacements, 2);
        assert_eq!(fs::read_to_string(&file).unwrap(), "x = 2\nx = 2\n");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn edit_checks_an_optional_hash_and_rejects_binary_files() {
        let (base, core) = sandbox("edit-hash");
        let file = path(base.join("root/a.txt"));
        fs::write(&file, "hello\n").unwrap();
        assert!(
            core.edit_file(&file, "hello", "bye", false, Some("stale"))
                .unwrap_err()
                .to_string()
                .contains("Hash mismatch")
        );
        core.edit_file(&file, "hello", "bye", false, Some(&hash_of(&file)))
            .unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "bye\n");

        let image = path(base.join("root/p.png"));
        fs::write(&image, png_bytes()).unwrap();
        assert!(
            core.edit_file(&image, "PNG", "JPG", false, None)
                .unwrap_err()
                .to_string()
                .contains("binary")
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn edit_matches_unix_newlines_against_windows_files() {
        let (base, core) = sandbox("edit-crlf");
        let file = path(base.join("root/win.txt"));
        fs::write(&file, "one\r\ntwo\r\nthree\r\n").unwrap();
        core.edit_file(&file, "one\ntwo", "uno\ndos", false, None)
            .unwrap();
        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            "uno\r\ndos\r\nthree\r\n"
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn edits_keep_file_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let (base, core) = sandbox("edit-perms");
        let file = path(base.join("root/run.sh"));
        fs::write(&file, "echo hi\n").unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o755)).unwrap();
        core.edit_file(&file, "hi", "bye", false, None).unwrap();
        let mode = fs::metadata(&file).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o755);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn move_renames_files_and_folders() {
        let (base, core) = sandbox("move");
        let a = path(base.join("root/a.txt"));
        fs::write(&a, "A").unwrap();
        let b = path(base.join("root/sub/b.txt"));
        core.move_path(&a, &b, None).unwrap();
        assert!(!base.join("root/a.txt").exists());
        assert_eq!(fs::read_to_string(&b).unwrap(), "A");

        core.move_path(
            &path(base.join("root/sub")),
            &path(base.join("root/renamed")),
            None,
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(base.join("root/renamed/b.txt")).unwrap(),
            "A"
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn move_follows_the_overwrite_rules() {
        let (base, core) = sandbox("move-rules");
        let a = path(base.join("root/a.txt"));
        let b = path(base.join("root/b.txt"));
        fs::write(&a, "new").unwrap();
        fs::write(&b, "old").unwrap();
        assert!(core.move_path(&a, &b, None).is_err());
        assert!(core.move_path(&a, &b, Some("stale")).is_err());
        assert_eq!(fs::read_to_string(&b).unwrap(), "old");
        core.move_path(&a, &b, Some(&hash_of(&b))).unwrap();
        assert_eq!(fs::read_to_string(&b).unwrap(), "new");

        let root = path(base.join("root"));
        let sub = path(base.join("root/sub"));
        assert!(
            core.move_path(&root, &path(base.join("root2")), None)
                .unwrap_err()
                .to_string()
                .contains("root folder")
        );
        fs::create_dir_all(base.join("root/other")).unwrap();
        assert!(
            core.move_path(&sub, &path(base.join("root/other")), None)
                .unwrap_err()
                .to_string()
                .contains("never overwritten")
        );
        assert!(
            core.move_path(&sub, &path(base.join("root/sub/inner")), None)
                .unwrap_err()
                .to_string()
                .contains("into itself")
        );
        assert!(
            core.move_path(&b, &path(base.join("root/missing/b.txt")), None)
                .unwrap_err()
                .to_string()
                .contains("createFolder")
        );
        assert!(
            core.move_path(&b, &path(base.join("outside/b.txt")), None)
                .is_err()
        );
        assert!(base.join("root/b.txt").exists());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn move_can_change_only_the_case_of_a_name() {
        let (base, core) = sandbox("move-case");
        let lower = path(base.join("root/readme.md"));
        fs::write(&lower, "x").unwrap();
        core.move_path(&lower, &path(base.join("root/README.md")), None)
            .unwrap();
        let names: Vec<String> = fs::read_dir(base.join("root"))
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert!(names.contains(&"README.md".to_string()), "{names:?}");
        assert!(!names.contains(&"readme.md".to_string()), "{names:?}");
        assert!(
            core.move_path(
                &path(base.join("root/README.md")),
                &path(base.join("root/README.md")),
                None
            )
            .is_err()
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn copy_duplicates_files_only() {
        let (base, core) = sandbox("copy");
        let a = path(base.join("root/a.png"));
        fs::write(&a, png_bytes()).unwrap();
        let b = path(base.join("root/sub/b.png"));
        let result = core.copy_file(&a, &b, None).unwrap();
        assert_eq!(fs::read(&b).unwrap(), png_bytes());
        assert_eq!(fs::read(&a).unwrap(), png_bytes());
        assert_eq!(result.hash, hash_of(&a));
        assert_eq!(result.bytes, png_bytes().len() as u64);

        fs::write(&a, "changed").unwrap();
        assert!(core.copy_file(&a, &b, None).is_err());
        core.copy_file(&a, &b, Some(&hash_of(&b))).unwrap();
        assert_eq!(fs::read_to_string(&b).unwrap(), "changed");

        assert!(
            core.copy_file(
                &path(base.join("root/sub")),
                &path(base.join("root/x")),
                None
            )
            .unwrap_err()
            .to_string()
            .contains("files only")
        );
        assert!(
            core.copy_file(&a, &path(base.join("root/sub")), None)
                .unwrap_err()
                .to_string()
                .contains("is a folder")
        );
        assert!(core.copy_file(&a, &a, None).is_err());
        assert!(
            core.copy_file(&a, &path(base.join("outside/a")), None)
                .is_err()
        );
        fs::remove_dir_all(base).unwrap();
    }
}
