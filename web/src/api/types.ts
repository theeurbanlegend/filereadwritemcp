export interface Me {
  id: string;
  email: string;
  hasPassword: boolean;
  githubLinked: boolean;
  createdAt: string;
}

export interface Agent {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface AgentList {
  agents: Agent[];
  limit: number;
}

export interface McpClient {
  clientId: string;
  clientName: string | null;
  lastUsedAt: string | null;
  expiresAt: string;
}

export interface EnrollmentCode {
  code: string;
  expiresAt: string;
}

export interface AuthConfig {
  github: boolean;
}

export interface Credentials {
  email: string;
  password: string;
}
