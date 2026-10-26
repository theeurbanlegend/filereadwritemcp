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
});

export const WriteFileInputSchema = z.object({
  path: z.string().describe('Path to the file'),
  content: z.string().describe('Content to write to the file'),
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
