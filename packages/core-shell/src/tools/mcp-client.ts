/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/tools/mcp-client.ts，langvis 关闭此能力：
// MCP 客户端/传输/状态类型与上游同形；运行时为空壳——工具经由
// langvis 后端统一暴露，MCP 管理器不落地。

import type { CallableTool, FunctionCall, Part, Tool } from '@google/genai';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { MCPServerConfig } from '../config/config.js';
import type { DiscoveredMCPTool } from './mcp-tool.js';
import type { PromptRegistry } from '../prompts/prompt-registry.js';
import type { ResourceRegistry } from '../resources/resource-registry.js';
import type { ToolRegistry } from './tool-registry.js';
import type { EnvironmentSanitizationConfig } from '../services/environmentSanitization.js';

export enum MCPServerStatus {
  DISCONNECTED = 'disconnected',
  DISCONNECTING = 'disconnecting',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  BLOCKED = 'blocked',
  DISABLED = 'disabled',
}

export enum MCPDiscoveryState {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export interface GetPromptResult {
  description?: string;
  messages: Array<{
    role: string;
    content: {
      type: string;
      text?: string;
      [key: string]: unknown;
    };
  }>;
  error?: unknown;
  [key: string]: unknown;
}

export interface DiscoveredMCPPrompt {
  name: string;
  serverName: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  invoke: (params: Record<string, unknown>) => Promise<GetPromptResult>;
}

export interface RegistrySet {
  toolRegistry: ToolRegistry;
  promptRegistry: PromptRegistry;
  resourceRegistry: ResourceRegistry;
}

export interface McpContext {
  readonly sanitizationConfig: EnvironmentSanitizationConfig;
  emitMcpDiagnostic(
    severity: 'info' | 'warning' | 'error',
    message: string,
    error?: unknown,
    serverName?: string,
  ): void;
  setUserInteractedWithMcp?(): void;
  isTrustedFolder(): boolean;
  getPolicyEngine?(): {
    getRules(): ReadonlyArray<{
      toolName: string;
      [key: string]: unknown;
    }>;
  };
}

export interface McpProgressReporter {
  registerProgressToken(token: string | number, callId: string): void;
  unregisterProgressToken(token: string | number): void;
}

const serverStatuses = new Map<string, MCPServerStatus>();
const statusChangeListeners: Set<StatusChangeListener> = new Set();
const mcpDiscoveryState: MCPDiscoveryState = MCPDiscoveryState.NOT_STARTED;

export type StatusChangeListener = (
  serverName: string,
  status: MCPServerStatus,
) => void;

export function addMCPStatusChangeListener(
  listener: StatusChangeListener,
): void {
  statusChangeListeners.add(listener);
}

export function removeMCPStatusChangeListener(
  listener: StatusChangeListener,
): void {
  statusChangeListeners.delete(listener);
}

export function updateMCPServerStatus(
  serverName: string,
  status: MCPServerStatus,
): void {
  serverStatuses.set(serverName, status);
  for (const listener of statusChangeListeners) {
    listener(serverName, status);
  }
}

export function getMCPServerStatus(serverName: string): MCPServerStatus {
  return serverStatuses.get(serverName) || MCPServerStatus.DISCONNECTED;
}

export function getAllMCPServerStatuses(): Map<string, MCPServerStatus> {
  return new Map(serverStatuses);
}

export function getMCPDiscoveryState(): MCPDiscoveryState {
  return mcpDiscoveryState;
}

export const mcpServerRequiresOAuth: Map<string, boolean> = new Map();

export async function createTransport(
  _mcpServerName: string,
  _mcpServerConfig: MCPServerConfig,
  _debugMode: boolean,
  _cliConfig: McpContext,
): Promise<Transport> {
  throw new Error('langvis: MCP transports are disabled');
}

export class McpClient implements McpProgressReporter {
  constructor(
    private readonly serverName: string,
    private readonly serverConfig: MCPServerConfig,
    _debug: boolean,
  ) {
    void _debug;
  }

  getServerName(): string {
    return this.serverName;
  }

  getServerConfig(): MCPServerConfig {
    return this.serverConfig;
  }

  async connect(): Promise<void> {
    updateMCPServerStatus(this.serverName, MCPServerStatus.DISCONNECTED);
  }

  async discoverInto(
    _registries: RegistrySet,
    ..._args: unknown[]
  ): Promise<DiscoveredMCPTool[]> {
    return [];
  }

  removeRegistries(_registries: RegistrySet): void {}

  async disconnect(): Promise<void> {
    serverStatuses.delete(this.serverName);
  }

  getStatus(): MCPServerStatus {
    return getMCPServerStatus(this.serverName);
  }

  async readResource(..._args: unknown[]): Promise<never> {
    throw new Error('langvis: MCP resources are disabled');
  }

  getInstructions(): string | undefined {
    return undefined;
  }

  registerProgressToken(_token: string | number, _callId: string): void {}

  unregisterProgressToken(_token: string | number): void {}
}

export class McpCallableTool {
  constructor(callable: CallableTool) {
    void callable;
  }

  async tool(): Promise<Tool> {
    throw new Error('langvis: MCP tools are disabled');
  }

  async callTool(_functionCalls: FunctionCall[]): Promise<Part[]> {
    return [];
  }
}
