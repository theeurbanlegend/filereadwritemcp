import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import z from 'zod';
import { ToolTypeEnum } from 'src/common/types';
import {
  CreateFolderInputSchema,
  DeleteFileInputSchema,
  DeleteFolderInputSchema,
  GetFolderContentsInputSchema,
  ReadFileInputSchema,
  RunCommandInputSchema,
  SearchForFilesWithContentMatchingRegexInputSchema,
  SearchForFilesWithNamesMatchingRegexInputSchema,
  WriteFileInputSchema,
} from './dto/toolInputs.dto';
import { INSTRUCTIONS } from 'src/common/constants/instructions';
import { AgentRegistry } from '../routing/agent-registry';
import { EnrollmentService } from '../identity/enrollment.service';
import type { AgentConnection } from 'src/common/agent-protocol';

// Optional routing param mixed into every forwarded tool: which enrolled machine
// to run on. Optional when exactly one of the user's agents is online; required
// to disambiguate when several are connected (see forwardToAgent).
const agentIdShape = {
  agentId: z
    .string()
    .optional()
    .describe(
      'Which enrolled machine to run this on — an agentId from the getAgents tool. Optional when only one of your agents is online; required to choose when several are connected.',
    ),
};

@Injectable()
export class McpService {
  private readonly callWindows = new Map<
    string,
    { start: number; count: number }
  >();

  constructor(
    private readonly registry: AgentRegistry,
    private readonly enrollment: EnrollmentService,
    private readonly config: ConfigService,
  ) {}

  createServer(userId: string): McpServer {
    const server = new McpServer(
      { name: 'FileReadWrite', version: '1.0.0' },
      {
        instructions: INSTRUCTIONS,
        capabilities: { tools: { listChanged: true } },
      },
    );

    // Every handler forwards to the user's agent. args typed as any so one
    // helper satisfies registerTool's per-schema handler signature. An optional
    // timeout covers tools whose agent-side work is slow (e.g. RunCommand needs
    // an approval prompt + the command run).
    const forward =
      (toolName: string, timeoutMs?: number) =>
      (args: any): Promise<CallToolResult> =>
        this.forwardToAgent(
          userId,
          toolName,
          (args ?? {}) as Record<string, unknown>,
          timeoutMs,
        );

    // Router-answered (NOT forwarded): list the caller's machines so the model
    // can discover agentIds for the tools below.
    server.registerTool(
      'getAgents',
      {
        title: 'Get Agents',
        description:
          'List your enrolled machines (agents): name, id, and whether each is currently online. Pass an id as the `agentId` argument of the other tools to target a specific machine.',
        annotations: { readOnlyHint: true },
      },
      (): Promise<CallToolResult> => this.getAgents(userId),
    );

    server.registerTool(
      ToolTypeEnum.ListAllowedResources,
      {
        title: 'List Allowed Resources',
        description:
          'List the allowed roots and executables on the connected machine.',
        inputSchema: z.object(agentIdShape),
        annotations: { readOnlyHint: true },
      },
      forward(ToolTypeEnum.ListAllowedResources),
    );

    server.registerTool(
      ToolTypeEnum.ReadFile,
      {
        title: 'Read File',
        description:
          'Read the contents of a file. Pass fromLine/toLine (1-based) to read a specific range. Large files are truncated unless a range is given — check the `truncated`/`bytes`/`lineCount` fields.',
        inputSchema: ReadFileInputSchema.extend(agentIdShape),
        annotations: { readOnlyHint: true },
      },
      forward(ToolTypeEnum.ReadFile),
    );

    server.registerTool(
      ToolTypeEnum.WriteFile,
      {
        title: 'Write File',
        description:
          'Create a file, or overwrite an existing one. Overwriting requires the current hash (from ReadFile/a prior WriteFile).',
        inputSchema: WriteFileInputSchema.extend(agentIdShape),
        annotations: { readOnlyHint: false, destructiveHint: true },
      },
      forward(ToolTypeEnum.WriteFile),
    );

    server.registerTool(
      ToolTypeEnum.DeleteFile,
      {
        title: 'Delete File',
        description: 'Delete a file from disk.',
        inputSchema: DeleteFileInputSchema.extend(agentIdShape),
        annotations: { readOnlyHint: false, destructiveHint: true },
      },
      forward(ToolTypeEnum.DeleteFile),
    );

    server.registerTool(
      ToolTypeEnum.CreateFolder,
      {
        title: 'Create Folder',
        description: 'Create a folder on disk.',
        inputSchema: CreateFolderInputSchema.extend(agentIdShape),
        annotations: { readOnlyHint: false, destructiveHint: true },
      },
      forward(ToolTypeEnum.CreateFolder),
    );

    server.registerTool(
      ToolTypeEnum.DeleteFolder,
      {
        title: 'Delete Folder',
        description: 'Delete a folder from disk.',
        inputSchema: DeleteFolderInputSchema.extend(agentIdShape),
        annotations: { readOnlyHint: false, destructiveHint: true },
      },
      forward(ToolTypeEnum.DeleteFolder),
    );

    server.registerTool(
      ToolTypeEnum.GetFolderContents,
      {
        title: 'Get Folder Contents',
        description:
          'Get the contents of a folder, including each file size (bytes) and last-modified time.',
        inputSchema: GetFolderContentsInputSchema.extend(agentIdShape),
        annotations: { readOnlyHint: true },
      },
      forward(ToolTypeEnum.GetFolderContents),
    );

    server.registerTool(
      ToolTypeEnum.SearchForFilesWithNamesMatchingRegex,
      {
        title: 'Search for Files with Names Matching Regex',
        description:
          'Recursively search a folder for files/folders whose names match a regex (case-insensitive by default; ignored dirs like node_modules are skipped).',
        inputSchema:
          SearchForFilesWithNamesMatchingRegexInputSchema.extend(agentIdShape),
        annotations: { readOnlyHint: true },
      },
      forward(ToolTypeEnum.SearchForFilesWithNamesMatchingRegex),
    );

    server.registerTool(
      ToolTypeEnum.SearchForFilesWithContentMatchingRegex,
      {
        title: 'Search for Files with Content Matching Regex',
        description:
          'Recursively search a folder for files whose content matches a regex (case-insensitive by default; ignored dirs like node_modules are skipped).',
        inputSchema:
          SearchForFilesWithContentMatchingRegexInputSchema.extend(
            agentIdShape,
          ),
        annotations: { readOnlyHint: true },
      },
      forward(ToolTypeEnum.SearchForFilesWithContentMatchingRegex),
    );

    server.registerTool(
      ToolTypeEnum.RunCommand,
      {
        title: 'Run Command',
        description:
          'Run an allow-listed executable on the connected machine, after explicit user approval there. Returns stdout, stderr, and exit code.',
        inputSchema: RunCommandInputSchema.extend(agentIdShape),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          openWorldHint: true,
        },
      },
      // Longer timeout: the agent shows an approval prompt, then runs the command.
      forward(ToolTypeEnum.RunCommand, 240_000),
    );

    server.sendToolListChanged();
    return server;
  }

  // Router-answered: the caller's enrolled machines (online + offline) with a
  // live online flag, so the model can pick an agentId.
  private async getAgents(userId: string): Promise<CallToolResult> {
    const enrolled = await this.enrollment.listAgentsForUser(userId);
    const onlineIds = new Set(this.registry.list(userId).map((c) => c.agentId));
    const agents = enrolled
      .filter((a) => onlineIds.has(a.id))
      .map((a) => ({
        agentId: a.id,
        name: a.name,
        online: onlineIds.has(a.id),
        lastSeenAt: a.lastSeenAt,
      }));
    return { content: [{ type: 'text', text: JSON.stringify({ agents }) }] };
  }

  // Resolve which agent to hit — an explicit agentId, else the sole online
  // agent, else ask the caller to disambiguate — then relay the call. Returns a
  // clean MCP error when no agent is connected or the call times out.
  private async forwardToAgent(
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<CallToolResult> {
    if (!this.allowCall(userId)) {
      return this.errorResult(
        'Rate limit reached: too many tool calls this minute. Wait a moment and retry.',
      );
    }
    const requestedAgentId =
      typeof args.agentId === 'string' ? args.agentId : undefined;
    // Never forward the routing param to the agent.
    const toolArgs: Record<string, unknown> = { ...args };
    delete toolArgs.agentId;

    const online = this.registry.list(userId);
    if (online.length === 0) {
      return this.errorResult(
        'No agent is connected for your account. Enroll a device and start the agent, then retry.',
      );
    }

    let conn: AgentConnection | undefined;
    if (requestedAgentId) {
      conn = this.registry.get(userId, requestedAgentId);
      if (!conn) {
        return this.errorResult(
          `No connected agent with id "${requestedAgentId}". Online now: ${this.describe(online)}. Use the getAgents tool for the full list.`,
        );
      }
    } else if (online.length === 1) {
      conn = online[0];
    } else {
      return this.errorResult(
        `You have ${online.length} agents online — pass the "agentId" argument to choose one. Online now: ${this.describe(online)}.`,
      );
    }

    if (!conn) {
      return this.errorResult('Could not resolve an agent to run on.');
    }

    try {
      const result = await conn.call(toolName, toolArgs, timeoutMs);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e) {
      return this.errorResult(e instanceof Error ? e.message : String(e));
    }
  }

  private allowCall(userId: string): boolean {
    const limit = Number(this.config.get('TOOL_CALLS_PER_MINUTE') ?? 120);
    const now = Date.now();
    const window = this.callWindows.get(userId);
    if (!window || now - window.start >= 60_000) {
      this.callWindows.set(userId, { start: now, count: 1 });
      return true;
    }
    window.count += 1;
    return window.count <= limit;
  }

  private describe(conns: AgentConnection[]): string {
    return conns.map((c) => `${c.name} (${c.agentId})`).join(', ');
  }

  private errorResult(text: string): CallToolResult {
    return { isError: true, content: [{ type: 'text', text }] };
  }
}
