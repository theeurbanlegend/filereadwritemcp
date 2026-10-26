import z from 'zod';

export const ListAllowedResourcesOutputSchema = z.object({
  success: z.boolean(),
  allowedDirs: z.array(z.string()).optional(),
  allowedDownstreamTools: z.array(z.string()).optional(),
  allowedExecutables: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export const ReadFileOutputSchema = z.object({
  success: z.boolean(),
  content: z.string(),
  hash: z.string().optional(),
  bytes: z.number().optional(), // NEW: total file size
  lineCount: z.number().optional(), // NEW: lines returned
  truncated: z.boolean().optional(), // NEW: true if capped (no range given); pass fromLine/toLine for more
  error: z.string().optional(),
});

export const WriteFileOutputSchema = z.object({
  success: z.boolean(),
  hash: z.string().optional(),
  error: z.string().optional(),
});

export const DeleteFileOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

export const CreateFolderOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

export const DeleteFolderOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

export const GetFolderContentsOutputSchema = z.object({
  success: z.boolean(),
  contents: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        parent: z.string(),
        size: z.number().nullable(), // NEW: bytes (null for directories / stat failure)
        modified: z.string().nullable(), // NEW: ISO mtime (null on stat failure)
      }),
    )
    .optional(),
  error: z.string().optional(),
});

export const SearchForFilesWithNamesMatchingRegexOutputSchema = z.object({
  success: z.boolean(),
  files: z
    .array(z.object({ name: z.string(), type: z.string(), parent: z.string() }))
    .optional(),
  truncated: z.boolean().optional(), // NEW: true if result cap hit
  error: z.string().optional(),
});

export const SearchForFilesWithContentMatchingRegexOutputSchema = z.object({
  success: z.boolean(),
  files: z.array(z.string()).optional(),
  truncated: z.boolean().optional(), // NEW: true if result cap hit
  error: z.string().optional(),
});

export const RunCommandOutputSchema = z.object({
  success: z.boolean(),
  exitCode: z.number().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
  error: z.string().optional(),
});
export type RunCommandOutputSchemaType = z.infer<typeof RunCommandOutputSchema>;

export type ListAllowedResourcesOutputSchemaType = z.infer<
  typeof ListAllowedResourcesOutputSchema
>;
export type ReadFileOutputSchemaType = z.infer<typeof ReadFileOutputSchema>;
export type WriteFileOutputSchemaType = z.infer<typeof WriteFileOutputSchema>;
export type DeleteFileOutputSchemaType = z.infer<typeof DeleteFileOutputSchema>;
export type CreateFolderOutputSchemaType = z.infer<
  typeof CreateFolderOutputSchema
>;
export type DeleteFolderOutputSchemaType = z.infer<
  typeof DeleteFolderOutputSchema
>;
export type GetFolderContentsOutputSchemaType = z.infer<
  typeof GetFolderContentsOutputSchema
>;
export type SearchForFilesWithNamesMatchingRegexOutputSchemaType = z.infer<
  typeof SearchForFilesWithNamesMatchingRegexOutputSchema
>;
export type SearchForFilesWithContentMatchingRegexOutputSchemaType = z.infer<
  typeof SearchForFilesWithContentMatchingRegexOutputSchema
>;
