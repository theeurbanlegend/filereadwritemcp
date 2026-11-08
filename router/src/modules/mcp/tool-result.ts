import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDescriptor } from '../../common/agent-protocol';
import { ToolTypeEnum } from '../../common/types';

const GET_FILE_INFO: string = ToolTypeEnum.GetFileInfo;
const READ_FILE: string = ToolTypeEnum.ReadFile;

const NEWER_TOOLS = new Set<string>([
  ToolTypeEnum.GetFileInfo,
  ToolTypeEnum.EditFile,
  ToolTypeEnum.MoveFile,
  ToolTypeEnum.CopyFile,
]);

export const VIEWABLE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export function unsupportedFeature(
  tool: string,
  args: Record<string, unknown>,
  tools: ToolDescriptor[],
): string | null {
  const names = new Set(tools.map((t) => t.name));
  if (!names.has(tool) && (names.size > 0 || NEWER_TOOLS.has(tool))) {
    return tool;
  }
  if (args.encoding === 'base64' && !names.has(GET_FILE_INFO)) {
    return 'binary files';
  }
  return null;
}

interface BinaryRead {
  encoding: 'base64';
  content: string;
  mimeType: string;
  [key: string]: unknown;
}

function isBinaryRead(result: unknown): result is BinaryRead {
  if (typeof result !== 'object' || result === null) return false;
  const r = result as Record<string, unknown>;
  return (
    r.encoding === 'base64' &&
    typeof r.content === 'string' &&
    typeof r.mimeType === 'string'
  );
}

export function toCallToolResult(
  tool: string,
  args: Record<string, unknown>,
  result: unknown,
): CallToolResult {
  const showAsImage =
    tool === READ_FILE &&
    args.encoding !== 'base64' &&
    isBinaryRead(result) &&
    VIEWABLE_IMAGE_TYPES.has(result.mimeType);
  if (showAsImage) {
    const { content, ...details } = result;
    return {
      content: [
        { type: 'image', data: content, mimeType: result.mimeType },
        { type: 'text', text: JSON.stringify(details) },
      ],
    };
  }
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
