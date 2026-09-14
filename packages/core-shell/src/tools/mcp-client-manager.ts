/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/tools/mcp-client-manager.ts，langvis 关闭此能力：
// MCP 服务器管理为空壳—— getClient 恒 undefined，生命周期方法 no-op。

import { EventEmitter } from 'node:events';
import type { MCPServerConfig, GeminiCLIExtension } from '../config/config.js';
import {
  MCPDiscoveryState,
  type McpClient,
  type RegistrySet,
} from './mcp-client.js';
import type { MCPResource } from '../resources/resource-registry.js';

export class McpClientManager extends EventEmitter {
  constructor(..._args: unknown[]) {
    super();
  }

  setMainRegistries(_registries: RegistrySet): void {}

  setUserInteractedWithMcp(): void {}

  getLastError(_serverName: string): string | undefined {
    return undefined;
  }

  emitDiagnostic(..._args: unknown[]): void {}

  getBlockedMcpServers(): Array<{ name: string; extensionName: string }> {
    return [];
  }

  getMcpServerCount(): number {
    return 0;
  }

  getClient(_serverName: string): McpClient | undefined {
    return undefined;
  }

  findResourceByUri(_uri: string): MCPResource | undefined {
    return undefined;
  }

  getAllResources(): MCPResource[] {
    return [];
  }

  removeRegistries(_registries: RegistrySet): void {}

  async stopExtension(_extension: GeminiCLIExtension): Promise<void> {}

  async startExtension(_extension: GeminiCLIExtension): Promise<void> {}

  async maybeDiscoverMcpServer(..._args: unknown[]): Promise<void> {}

  async startConfiguredMcpServers(): Promise<void> {}

  async restart(): Promise<void> {}

  async restartServer(_name: string): Promise<void> {}

  async stop(): Promise<void> {}

  getDiscoveryState(): MCPDiscoveryState {
    return MCPDiscoveryState.NOT_STARTED;
  }

  getMcpServers(): Record<string, MCPServerConfig> {
    return {};
  }
}
