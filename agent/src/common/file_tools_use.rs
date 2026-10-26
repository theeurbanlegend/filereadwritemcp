use serde_json::{Value, json};

use crate::common::{
    file_tools_core::FileToolsCore,
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
            description: "Read a file (optional line range).".to_string(),
            input_schema: None,
        },
        ToolDescriptor {
            name: ToolTypeEnum::WriteFile,
            description: "Create or overwrite a file (hash-guarded).".to_string(),
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
            let result = core
                .read_file(path, from_line, to_line)
                .map_err(|e| e.to_string())?;
            Ok(json!({
                "success": true,
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

            let result = core
                .write_file(path, content, from_line, to_line, hash)
                .map_err(|e| e.to_string())?;

            Ok(json!({
                "success": true,
                "hash": result.hash
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

            let preview = format!("{} {} \ncwd: {}", exe, joined_args, dir);
            let approved = request_approval(&preview, 90);

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
