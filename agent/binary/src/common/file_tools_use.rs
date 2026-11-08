use serde_json::{Value, json};

use crate::common::{
    file_tools_core::FileToolsCore,
    launcher,
    lib::request_approval,
    types::{ToolDescriptor, ToolTypeEnum},
};

pub fn get_tools() -> Vec<ToolDescriptor> {
    Vec::from([
        ToolDescriptor {
            name: ToolTypeEnum::ListAllowedResources,
            description: "List the allowed roots and executables.".to_string(),
            input_schema: None,
        },
        ToolDescriptor {
            name: ToolTypeEnum::ReadFile,
            description: "Read a text file (optional line range) or a binary file as base64."
                .to_string(),
            input_schema: None,
        },
        ToolDescriptor {
            name: ToolTypeEnum::WriteFile,
            description: "Create or overwrite a text or base64 binary file (hash-guarded)."
                .to_string(),
            input_schema: None,
        },
        ToolDescriptor {
            name: ToolTypeEnum::GetFileInfo,
            description: "Size, type, text or binary, modified time and hash of a path."
                .to_string(),
            input_schema: None,
        },
        ToolDescriptor {
            name: ToolTypeEnum::EditFile,
            description: "Replace exact text in a text file.".to_string(),
            input_schema: None,
        },
        ToolDescriptor {
            name: ToolTypeEnum::MoveFile,
            description: "Move or rename a file or folder.".to_string(),
            input_schema: None,
        },
        ToolDescriptor {
            name: ToolTypeEnum::CopyFile,
            description: "Copy a file.".to_string(),
            input_schema: None,
        },
        ToolDescriptor {
            name: ToolTypeEnum::DeleteFile,
            description: "Delete a file.".to_string(),
            input_schema: None,
        },
        ToolDescriptor {
            name: ToolTypeEnum::CreateFolder,
            description: "Create a folder.".to_string(),
            input_schema: None,
        },
        ToolDescriptor {
            name: ToolTypeEnum::DeleteFolder,
            description: "Delete a folder.".to_string(),
            input_schema: None,
        },
        ToolDescriptor {
            name: ToolTypeEnum::GetFolderContents,
            description: "List a folder with sizes and modified times.".to_string(),
            input_schema: None,
        },
        ToolDescriptor {
            name: ToolTypeEnum::SearchForFilesWithNamesMatchingRegex,
            description: "Recursively search filenames by regex.".to_string(),
            input_schema: None,
        },
        ToolDescriptor {
            name: ToolTypeEnum::SearchForFilesWithContentMatchingRegex,
            description: "Recursively search file contents by regex.".to_string(),
            input_schema: None,
        },
        ToolDescriptor {
            name: ToolTypeEnum::RunCommand,
            description: "Run an allow-listed executable on this machine, after local approval ."
                .to_string(),
            input_schema: None,
        },
    ])
}

fn str_arg<'a>(args: &'a Value, name: &str) -> Result<&'a str, String> {
    args.get(name)
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("missing {name}"))
}

pub fn dispatch(core: &FileToolsCore, tool: ToolTypeEnum, args: Value) -> Result<Value, String> {
    let path_arg = args.get("path").and_then(|v| v.as_str());
    match (&tool, path_arg) {
        (t, Some(p)) => log::info!("Called {:?} — path: {}", t, p),
        (t, None) => log::info!("Called {:?}", t),
    }
    match tool {
        ToolTypeEnum::ListAllowedResources => {
            let allowed = core.list_allowed();
            Ok(json!({
                "success": true,
                "allowedDirs": allowed.roots(),
                "allowedExecutables": allowed.executables(),
            }))
        }
        ToolTypeEnum::ReadFile => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("missing path")?;
            let from_line = args
                .get("fromLine")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize);
            let to_line = args
                .get("toLine")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize);
            let encoding = args
                .get("encoding")
                .and_then(|v| v.as_str())
                .unwrap_or("auto");
            let binary = match encoding {
                "base64" => true,
                "utf8" => false,
                "auto" => core.is_binary_file(path).map_err(|e| e.to_string())?,
                other => {
                    return Err(format!(
                        "Unknown encoding \"{other}\". Use \"auto\", \"utf8\" or \"base64\"."
                    ));
                }
            };
            if binary {
                if from_line.is_some() || to_line.is_some() {
                    return Err(
                        "This is a binary file: fromLine/toLine only apply to text. Read the whole file without them."
                            .to_string(),
                    );
                }
                let result = core.read_binary(path).map_err(|e| e.to_string())?;
                return Ok(json!({
                    "success": true,
                    "encoding": "base64",
                    "content": result.content_base64,
                    "mimeType": result.mime_type,
                    "hash": result.hash,
                    "bytes": result.bytes,
                }));
            }
            let result = core
                .read_file(path, from_line, to_line)
                .map_err(|e| e.to_string())?;
            Ok(json!({
                "success": true,
                "encoding": "utf8",
                "content": result.content,
                "hash": result.hash,
                "bytes": result.bytes,
                "lineCount": result.line_count,
                "truncated": result.truncated,
            }))
        }
        ToolTypeEnum::WriteFile => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("missing path")?;
            let content = args
                .get("content")
                .and_then(|v| v.as_str())
                .ok_or("missing content")?;
            let hash = args.get("hash").and_then(|v| v.as_str());
            let from_line = args
                .get("fromLine")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize);
            let to_line = args
                .get("toLine")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize);
            let encoding = args
                .get("encoding")
                .and_then(|v| v.as_str())
                .unwrap_or("utf8");

            let result = match encoding {
                "utf8" => core.write_file(path, content, from_line, to_line, hash),
                "base64" => {
                    if from_line.is_some() || to_line.is_some() {
                        return Err(
                            "fromLine/toLine only apply to text. Send the whole file when using encoding \"base64\"."
                                .to_string(),
                        );
                    }
                    core.write_binary(path, content, hash)
                }
                other => {
                    return Err(format!(
                        "Unknown encoding \"{other}\". Use \"utf8\" or \"base64\"."
                    ));
                }
            }
            .map_err(|e| e.to_string())?;

            Ok(json!({
                "success": true,
                "hash": result.hash
            }))
        }
        ToolTypeEnum::GetFileInfo => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("missing path")?;
            let info = core.file_info(path).map_err(|e| e.to_string())?;
            Ok(json!({
                "success": true,
                "path": info.path,
                "kind": info.kind,
                "bytes": info.bytes,
                "modified": info.modified,
                "mimeType": info.mime_type,
                "isText": info.is_text,
                "hash": info.hash,
            }))
        }
        ToolTypeEnum::EditFile => {
            let path = str_arg(&args, "path")?;
            let old_string = str_arg(&args, "oldString")?;
            let new_string = str_arg(&args, "newString")?;
            let replace_all = args
                .get("replaceAll")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let hash = args.get("hash").and_then(|v| v.as_str());
            let result = core
                .edit_file(path, old_string, new_string, replace_all, hash)
                .map_err(|e| e.to_string())?;
            Ok(json!({
                "success": true,
                "hash": result.hash,
                "replacements": result.replacements,
            }))
        }
        ToolTypeEnum::MoveFile => {
            let from = str_arg(&args, "from")?;
            let to = str_arg(&args, "to")?;
            let hash = args.get("hash").and_then(|v| v.as_str());
            core.move_path(from, to, hash).map_err(|e| e.to_string())?;
            Ok(json!({ "success": true, "from": from, "to": to }))
        }
        ToolTypeEnum::CopyFile => {
            let from = str_arg(&args, "from")?;
            let to = str_arg(&args, "to")?;
            let hash = args.get("hash").and_then(|v| v.as_str());
            let result = core.copy_file(from, to, hash).map_err(|e| e.to_string())?;
            Ok(json!({
                "success": true,
                "to": to,
                "hash": result.hash,
                "bytes": result.bytes,
            }))
        }
        ToolTypeEnum::DeleteFile => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("missing path")?;
            core.delete_file(path).map_err(|e| e.to_string())?;
            Ok(json!({
                "success": true
            }))
        }
        ToolTypeEnum::CreateFolder => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("missing path")?;
            core.create_folder(path).map_err(|e| e.to_string())?;
            Ok(json!({
                "success": true
            }))
        }
        ToolTypeEnum::DeleteFolder => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("missing path")?;
            core.delete_folder(path).map_err(|e| e.to_string())?;
            Ok(json!({
                "success": true
            }))
        }
        ToolTypeEnum::GetFolderContents => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("missing path")?;
            let contents = core.get_folder_contents(path).map_err(|e| e.to_string())?;
            Ok(json!({
                "success": true,
                "contents": contents
            }))
        }
        ToolTypeEnum::SearchForFilesWithNamesMatchingRegex => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("missing path")?;
            let query_regex = args
                .get("queryRegex")
                .and_then(|v| v.as_str())
                .ok_or("missing query_regex")?;
            let case_insensitive = args
                .get("caseInsensitive")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let result = core
                .search_names(path, query_regex, case_insensitive)
                .map_err(|e| e.to_string())?;
            Ok(json!({
                "success": true,
                "files": result.files,
                "truncated": result.truncated
            }))
        }
        ToolTypeEnum::SearchForFilesWithContentMatchingRegex => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("missing path")?;
            let query_regex = args
                .get("queryRegex")
                .and_then(|v| v.as_str())
                .ok_or("missing query_regex")?;
            let case_insensitive = args
                .get("caseInsensitive")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let result = core
                .search_content(path, query_regex, case_insensitive)
                .map_err(|e| e.to_string())?;
            Ok(json!({
                "success": true,
                "files": result.files,
                "truncated": result.truncated
            }))
        }
        ToolTypeEnum::RunCommand => {
            let exe = args
                .get("exe")
                .and_then(|v| v.as_str())
                .ok_or("missing executable")?;
            let argv: Vec<String> = args
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

            if !core.is_allowed_executable(exe) {
                let allowed = core.executables().join(", ");
                return Err(format!(
                    "Executable \"{}\" is not allowed. Allowed: {}",
                    exe, allowed
                ));
            }
            let cwd = match args.get("cwd").and_then(|v| v.as_str()) {
                Some(c) => c,
                None => core
                    .roots()
                    .first()
                    .map(String::as_str)
                    .ok_or("No allowed roots configured")?,
            };

            let dir = match core.assert_allowed_path(cwd) {
                Ok(directory) => directory,
                Err(e) => return Err(e.to_string()),
            };
            let joined_args = argv.join(" ");

            let approved = if launcher::is_active() {
                launcher::request_approval(exe, &argv, &dir, 90)
            } else {
                let preview = format!("{} {} \ncwd: {}", exe, joined_args, dir);
                request_approval(&preview, 90)
            };

            if !approved {
                return Err("Command not approved by user. Nothing was run".to_string());
            }

            let result = core.run_confined(exe, &argv, cwd, None);

            match result {
                Ok(good_result) => Ok(json!({
                    "success": good_result.success,
                    "exitCode": good_result.exit_code,
                    "stdout": good_result.stdout,
                    "stderr": good_result.stderr,
                    "truncated": good_result.truncated
                })),
                Err(e) => Ok(json!({
                    "error": format!("Error: {}", e)
                })),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::dispatch;
    use crate::common::{file_tools_core::FileToolsCore, types::ToolTypeEnum};
    use serde_json::json;
    use std::{fs, path::PathBuf};

    const PNG_BASE64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";

    fn sandbox(name: &str) -> (PathBuf, FileToolsCore) {
        let base = dunce::canonicalize(std::env::temp_dir())
            .unwrap()
            .join(format!("frw-dispatch-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        let core = FileToolsCore::new(vec![base.to_string_lossy().to_string()], vec![]);
        (base, core)
    }

    fn p(base: &std::path::Path, name: &str) -> String {
        base.join(name).to_string_lossy().to_string()
    }

    #[test]
    fn binary_round_trip_through_the_tools() {
        let (base, core) = sandbox("round-trip");
        let file = p(&base, "pixel.png");
        let written = dispatch(
            &core,
            ToolTypeEnum::WriteFile,
            json!({"path": file, "content": PNG_BASE64, "encoding": "base64"}),
        )
        .unwrap();

        let read = dispatch(&core, ToolTypeEnum::ReadFile, json!({"path": file})).unwrap();
        assert_eq!(read["encoding"], "base64");
        assert_eq!(read["content"], PNG_BASE64);
        assert_eq!(read["mimeType"], "image/png");
        assert_eq!(read["hash"], written["hash"]);

        let info = dispatch(&core, ToolTypeEnum::GetFileInfo, json!({"path": file})).unwrap();
        assert_eq!(info["isText"], false);
        assert_eq!(info["hash"], written["hash"]);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn text_files_still_read_as_text() {
        let (base, core) = sandbox("text");
        let file = p(&base, "a.txt");
        fs::write(&file, "one\ntwo\n").unwrap();
        let read = dispatch(&core, ToolTypeEnum::ReadFile, json!({"path": file})).unwrap();
        assert_eq!(read["encoding"], "utf8");
        assert_eq!(read["content"], "one\ntwo\n");

        let forced = dispatch(
            &core,
            ToolTypeEnum::ReadFile,
            json!({"path": file, "encoding": "base64"}),
        )
        .unwrap();
        assert_eq!(forced["content"], "b25lCnR3bwo=");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn binary_specific_errors() {
        let (base, core) = sandbox("errors");
        let file = p(&base, "pixel.png");
        dispatch(
            &core,
            ToolTypeEnum::WriteFile,
            json!({"path": file, "content": PNG_BASE64, "encoding": "base64"}),
        )
        .unwrap();

        let ranged = dispatch(
            &core,
            ToolTypeEnum::ReadFile,
            json!({"path": file, "fromLine": 1, "toLine": 2}),
        )
        .unwrap_err();
        assert!(ranged.contains("binary file"), "{ranged}");

        let ranged_write = dispatch(
            &core,
            ToolTypeEnum::WriteFile,
            json!({"path": p(&base, "x.bin"), "content": "AA==", "encoding": "base64", "fromLine": 1}),
        )
        .unwrap_err();
        assert!(
            ranged_write.contains("only apply to text"),
            "{ranged_write}"
        );

        let unknown = dispatch(
            &core,
            ToolTypeEnum::ReadFile,
            json!({"path": file, "encoding": "hex"}),
        )
        .unwrap_err();
        assert!(unknown.contains("Unknown encoding"), "{unknown}");
        fs::remove_dir_all(base).unwrap();
    }
}
