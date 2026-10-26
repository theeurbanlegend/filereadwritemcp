use crate::common::{
    constants::{CMD_OUTPUT_CAP, CMD_TIMEOUT_MS, MAX_SEARCH_RESULTS, READ_PREVIEW_MAX_LINES},
    lib::{default_ignore_set, unix_secs_to_iso},
    types::{
        DirEntry, DirEntryEnum, FileEntry, ReadFileResult, RunResult, SearchContentResult,
        SearchNamesResult, WriteFileResult,
    },
};
use rand;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{BufRead, BufReader},
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
        let exists = Path::new(&safe).exists();

        if exists {
            let expected_hash = hash.ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "This file already exists — provide its current hash (from ReadFile or a prior WriteFile) to overwrite it",
                )
            })?;
            let current_hash = Self::get_file_hash(&safe)?;
            if current_hash != expected_hash {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "Hash mismatch. This file has changed since the last write — re-read the file and retry with its latest hash",
                ));
            }
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
        fs::remove_dir_all(&safe)
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
        let re = self.build_regex(query_regex, case_insensitive);
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
        let re = self.build_regex(query_regex, case_insensitive);
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

    fn atomic_write(file_path: &str, data: &str) -> std::io::Result<()> {
        let rand_hex: String = (0..12)
            .map(|_| format!("{:x}", rand::random::<u8>() % 16))
            .collect();
        let tmp = format!("{}.{}.tmp", file_path, rand_hex);
        fs::write(&tmp, data)?;
        fs::rename(&tmp, file_path)?;
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
        let content = fs::read(file_path)?;
        let mut hasher = Sha256::new();
        hasher.update(content);
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
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
                lines.push(line);
            }
        }

        Ok((lines, false))
    }

    fn build_regex(&self, pattern: &str, case_insensitive: bool) -> Regex {
        let pattern = if case_insensitive && !pattern.starts_with("(?i)") {
            format!("(?i){}", pattern)
        } else {
            pattern.to_string()
        };
        Regex::new(&pattern).expect("Invalid regex pattern")
    }
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
}
