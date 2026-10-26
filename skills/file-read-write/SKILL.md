---
name: file-read-write-mcp
description: >
  Use when connected to the "FileReadWrite" MCP server to read, write or search files,
  or run commands, on the user's own machines. Covers picking a machine, the allow-list
  and path rules, the hash-based edit protocol, and the approval-gated command runner.
---

# FileReadWrite MCP: usage guide

FileReadWrite connects you to agents running on the user's machines. Each agent exposes
sandboxed file tools and an approval-gated command runner, limited to an allow-list of
directories and executables that the user controls on that machine.

## 1. Pick a machine
- **`getAgents`** lists the user's online machines (`agentId`, `name`, `lastSeenAt`).
- Every other tool takes an optional **`agentId`**. Leave it out when only one machine is
  online. When several are online you must pass it; ask the user which one if it's unclear.

## 2. Learn where you can operate
Call **`listAllowedResources`** first. It returns the allowed roots and executables on that
machine. Use **absolute paths inside an allowed root**; anything outside fails with
`Access denied`. Roots differ per machine and can change between sessions, so check them
instead of assuming.

## 3. Reading and exploring
- **`readFile(path, fromLine?, toLine?)`**: line numbers are 1-based. Without a range, large files
  are **truncated**. Check `truncated` / `bytes` / `lineCount`, then re-read with a range.
- **`getFolderContents(path)`** returns entries with `size` and `modified`. Use `size` to decide
  whether to read a big file in ranges.
- **`searchForFilesWithNamesMatchingRegex(path, queryRegex, caseInsensitive?)`** searches file and
  folder names recursively.
- **`searchForFilesWithContentMatchingRegex(path, queryRegex, caseInsensitive?)`** searches file
  contents line by line.
- Both searches are case-insensitive by default and skip `node_modules`, `.git`, `dist`, `build`,
  `.next` and similar folders. Results are capped, so check `truncated`.

## 4. Editing: the hash protocol
- **New file:** `writeFile(path, content)` needs no hash.
- **Overwriting an existing file:** pass its **current `hash`**, from `readFile` or a prior
  `writeFile`. If the file changed since then, you get **`Hash mismatch`**. Re-read it and retry.
  Always read, then edit, then write.
- `fromLine`/`toLine` replace a line range. Omit both to replace the whole file.
- `writeFile` is text only. Don't use it for binary data.
- `deleteFile` and `deleteFolder` cannot be undone. Confirm with the user first when in doubt.

## 5. Running commands: `runCommand({ exe, args?, cwd? })`
- `exe` must be in the allow-list. `args` is an **array** and no shell is involved, so `;`, `|`
  and `$()` do nothing. `cwd` must be inside an allowed root; it defaults to the first one.
- **Every call needs the user's approval on that machine**, through a dialog or terminal prompt
  showing the command. Expect a delay while they decide. `Command not approved by user. Nothing was run`
  means they declined or didn't answer within 90 s, so **don't blindly retry**.
- It returns `stdout`, `stderr` and `exitCode`. Commands time out after 120 s and output is capped.
  Read `stderr` and `exitCode` yourself to diagnose failures instead of asking the user to paste logs.

## 6. Errors you may see
- `No agent is connected for your account`: the user's agent isn't running.
- `You have N agents online — pass the "agentId" argument`: call `getAgents` and pass one.
- `Access denied: path is outside the allowed roots`: ask the user to add it with `frw-agent config`.

## Found a problem with these tools?
Say so plainly to the user: what you ran, what you expected, and what actually happened.
The server is actively maintained, and that feedback is how it improves.
