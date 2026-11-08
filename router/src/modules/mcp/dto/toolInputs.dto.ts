import z from 'zod';

export const ReadFileInputSchema = z.object({
  path: z.string().describe('Path to the file'),
  fromLine: z
    .number()
    .optional()
    .describe('Starting line for the read operation (1-based)'),
  toLine: z
    .number()
    .optional()
    .describe('Ending line for the read operation (1-based)'),
  encoding: z
    .enum(['auto', 'utf8', 'base64'])
    .optional()
    .describe(
      'auto (default): text files come back as text, images as viewable images, other binary files as base64. base64: always return the raw bytes as base64 text, e.g. to copy a file exactly. utf8: always read as text.',
    ),
});

export const GetFileInfoInputSchema = z.object({
  path: z.string().describe('Path to the file or folder'),
});

export const WriteFileInputSchema = z.object({
  path: z.string().describe('Path to the file'),
  content: z
    .string()
    .describe(
      'Content to write: plain text, or base64 bytes when encoding is "base64"',
    ),
  encoding: z
    .enum(['utf8', 'base64'])
    .optional()
    .describe(
      'utf8 (default) writes content as text. base64 decodes content and writes the bytes, for images and other binary files (up to 5 MB; no fromLine/toLine).',
    ),
  fromLine: z
    .number()
    .optional()
    .describe('Starting line for the write operation'),
  toLine: z.number().optional().describe('Ending line for the write operation'),
  hash: z
    .string()
    .optional()
    .describe(
      'Required when overwriting an existing file: the current hash from ReadFile or a prior WriteFile. Re-read and resend if you get a Hash mismatch. Omit for brand-new files.',
    ),
});

export const EditFileInputSchema = z.object({
  path: z.string().describe('Path to the text file to edit'),
  oldString: z
    .string()
    .describe(
      'Exact text to replace, including whitespace and indentation. Must match exactly once unless replaceAll is true; include enough surrounding lines to make it unique.',
    ),
  newString: z.string().describe('Text to put in its place'),
  replaceAll: z
    .boolean()
    .optional()
    .describe('Replace every match instead of requiring exactly one'),
  hash: z
    .string()
    .optional()
    .describe(
      'Optional: the hash from your last read or write. When given, the edit fails if the file changed since.',
    ),
});

export const MoveFileInputSchema = z.object({
  from: z.string().describe('Current path of the file or folder'),
  to: z
    .string()
    .describe(
      'New path, including the name. Its parent folder must already exist.',
    ),
  hash: z
    .string()
    .optional()
    .describe(
      'Required only to replace an existing file at "to": that file\'s current hash. Folders are never overwritten.',
    ),
});

export const CopyFileInputSchema = z.object({
  from: z.string().describe('Path of the file to copy'),
  to: z
    .string()
    .describe(
      'Path of the new copy, including the name. Its parent folder must already exist.',
    ),
  hash: z
    .string()
    .optional()
    .describe(
      'Required only to replace an existing file at "to": that file\'s current hash.',
    ),
});

export const RunCommandInputSchema = z.object({
  exe: z
    .string()
    .describe(
      'Executable to run; must be in the server allow-list (e.g. "npm", "tsc", "git").',
    ),
  args: z
    .array(z.string())
    .optional()
    .describe(
      'Arguments/flags, each as its own array element (no shell). e.g. ["run","build"] or ["log","--oneline","-n","20"].',
    ),
  cwd: z
    .string()
    .optional()
    .describe(
      'Working directory; must be inside an allowed root. Defaults to the first allowed root.',
    ),
});

export const DeleteFileInputSchema = z.object({
  path: z.string().describe('Path to the file to delete'),
});

export const CreateFolderInputSchema = z.object({
  path: z.string().describe('Path to the folder to create'),
});

export const DeleteFolderInputSchema = z.object({
  path: z.string().describe('Path to the folder to delete'),
});

export const GetFolderContentsInputSchema = z.object({
  path: z.string().describe('Path to the folder to get contents from'),
});

export const SearchForFilesWithNamesMatchingRegexInputSchema = z.object({
  path: z
    .string()
    .describe('Path to the folder to search in (searched recursively)'),
  queryRegex: z
    .string()
    .describe(
      'JavaScript RegExp matched against each file/folder name, e.g. "\\.ts$" for TypeScript files or "config" for names containing "config". Case-insensitive by default.',
    ),
  caseInsensitive: z
    .boolean()
    .optional()
    .describe(
      'Match case-insensitively. Defaults to true; pass false for exact-case matching.',
    ),
});

export const SearchForFilesWithContentMatchingRegexInputSchema = z.object({
  path: z
    .string()
    .describe('Path to the folder to search in (searched recursively)'),
  queryRegex: z
    .string()
    .describe(
      'JavaScript RegExp matched against each line of file content, e.g. "myFunction" or "TODO|FIXME". Case-insensitive by default.',
    ),
  caseInsensitive: z
    .boolean()
    .optional()
    .describe(
      'Match case-insensitively. Defaults to true; pass false for exact-case matching.',
    ),
});

export type ReadFileInputSchemaType = z.infer<typeof ReadFileInputSchema>;
export type WriteFileInputSchemaType = z.infer<typeof WriteFileInputSchema>;
export type DeleteFileInputSchemaType = z.infer<typeof DeleteFileInputSchema>;
export type CreateFolderInputSchemaType = z.infer<
  typeof CreateFolderInputSchema
>;
export type DeleteFolderInputSchemaType = z.infer<
  typeof DeleteFolderInputSchema
>;
export type RunCommandInputSchemaType = z.infer<typeof RunCommandInputSchema>;
export type GetFolderContentsInputSchemaType = z.infer<
  typeof GetFolderContentsInputSchema
>;
export type SearchForFilesWithNamesMatchingRegexInputSchemaType = z.infer<
  typeof SearchForFilesWithNamesMatchingRegexInputSchema
>;
export type SearchForFilesWithContentMatchingRegexInputSchemaType = z.infer<
  typeof SearchForFilesWithContentMatchingRegexInputSchema
>;
