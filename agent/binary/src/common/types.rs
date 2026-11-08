use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DirEntryEnum {
    Directory,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ToolTypeEnum {
    ListAllowedResources,
    ReadFile,
    WriteFile,
    GetFileInfo,
    EditFile,
    MoveFile,
    CopyFile,
    DeleteFile,
    CreateFolder,
    DeleteFolder,
    GetFolderContents,
    SearchForFilesWithNamesMatchingRegex,
    SearchForFilesWithContentMatchingRegex,
    RunCommand,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDescriptor {
    pub name: ToolTypeEnum,
    pub description: String,
    pub input_schema: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub entry_type: DirEntryEnum,
    pub parent: String,
    pub size: usize,
    pub modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunResult {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadFileResult {
    pub content: String,
    pub hash: String,
    pub bytes: usize,
    pub line_count: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteFileResult {
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub entry_type: String,
    pub parent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchNamesResult {
    pub files: Vec<FileEntry>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchContentResult {
    pub files: Vec<String>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryReadResult {
    pub content_base64: String,
    pub hash: String,
    pub bytes: usize,
    pub mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub kind: String,
    pub bytes: u64,
    pub modified: Option<String>,
    pub mime_type: Option<String>,
    pub is_text: Option<bool>,
    pub hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditResult {
    pub hash: String,
    pub replacements: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyResult {
    pub hash: String,
    pub bytes: u64,
}
