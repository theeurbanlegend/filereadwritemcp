export const INSTRUCTIONS = `
  # FileReadWrite MCP — usage notes for the calling agent

  This server exposes local **file tools**. These are cross-tool nuances the per-tool descriptions don't cover — read them before calling.

  ## Picking a machine
  - Call 'getAgents' to list the user's online machines. Pass an 'agentId' to the other tools when more than one is online.

  ## Where you can read/write
  - All file operations are confined to an allow-list of directories. Call 'listAllowedResources' first to see them, and use absolute paths inside one of those roots. Anything outside is rejected ("Access denied").

  ## Editing files ('writeFile')
  - **New file:** pass 'path' + 'content' — no hash needed.
  - **Overwriting an existing file:** you MUST pass its current 'hash', from a fresh 'readFile' (it returns 'hash') or from the previous 'writeFile' result.
  - If the file changed since you read it, the write fails with **"Hash mismatch"** — re-read to get the latest hash, then retry. This is intentional optimistic-concurrency protection: always read → edit → write against a fresh hash.
  - 'fromLine'/'toLine' are 1-based and replace that line range; omit both to overwrite the whole file.
  - 'writeFile' is **text only** — do not use it for binary data (images, PDFs). Let the producing tool persist those.


  ## Destructive operations
  - 'deleteFile', 'deleteFolder' are **irreversible**. Confirm intent (or preview) before calling.

  ## Suggested flow
  1. 'listAllowedResources' — know where you can operate.
  2. 'readFile'  → 'writeFile' with the current hash.

`;
