export const INSTRUCTIONS = `
  # FileReadWrite MCP — usage notes for the calling agent

  This server exposes local **file tools**. These are cross-tool nuances the per-tool descriptions don't cover — read them before calling.

  ## Picking a machine
  - Call 'getAgents' to list the user's online machines. Pass an 'agentId' to the other tools when more than one is online.

  ## Where you can read/write
  - All file operations are confined to an allow-list of directories. Call 'listAllowedResources' first to see them, and use absolute paths inside one of those roots. Anything outside is rejected ("Access denied").

  ## Changing existing files ('editFile')
  - Prefer 'editFile' for changes to existing text files: pass the exact 'oldString' (copied from a read, whitespace included) and its 'newString'. No line numbers or hash needed.
  - 'oldString' must match exactly once. If it appears more than once, include more surrounding lines, or pass 'replaceAll: true' to change every match.
  - It returns the file's new 'hash', which you can pass to a later 'writeFile' or 'editFile'.

  ## Writing whole files ('writeFile')
  - **New file:** pass 'path' + 'content' — no hash needed.
  - **Overwriting an existing file:** you MUST pass its current 'hash', from a fresh 'readFile' (it returns 'hash') or from the previous 'writeFile' result.
  - If the file changed since you read it, the write fails with **"Hash mismatch"** — re-read to get the latest hash, then retry. This is intentional optimistic-concurrency protection: always read → edit → write against a fresh hash.
  - 'fromLine'/'toLine' are 1-based and replace that line range; omit both to overwrite the whole file.

  ## Binary files (images, PDFs, archives)
  - 'readFile' detects binary files. Images (png, jpeg, gif, webp) come back as images you can look at; other binary files come back as base64 with a 'mimeType'.
  - To write a binary file, pass the bytes as base64 in 'content' with 'encoding: "base64"'. The hash rule for overwriting is the same as for text.
  - To duplicate, rename or move any file, binary or not, use 'copyFile' or 'moveFile' instead of reading and writing it: they have no size limit.
  - Binary reads and writes are limited to 5 MB, and 'fromLine'/'toLine' don't apply to them. Call 'getFileInfo' first to check a file's size and type without reading it.


  ## Moving and copying
  - 'moveFile' renames or moves a file or folder; 'copyFile' copies a file. The parent folder of 'to' must exist (create it with 'createFolder').
  - Replacing an existing file at 'to' needs that file's current 'hash'. Existing folders are never replaced, and the allowed roots themselves can't be moved.

  ## Destructive operations
  - 'deleteFile', 'deleteFolder' are **irreversible**. Confirm intent (or preview) before calling.

  ## Suggested flow
  1. 'listAllowedResources' — know where you can operate.
  2. 'readFile' → 'editFile' for targeted changes, or 'writeFile' with the current hash to replace the whole file.

`;
