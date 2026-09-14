/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/agents/registry.ts，langvis 关闭此能力：
// 子 agent 定义由 langvis 后端持有。AgentRegistry 为空壳。

import type { AgentDefinition, AgentReloadSummary } from './types.js';
import type { Config } from '../config/config.js';

export class AgentRegistry {
  constructor(_config: Config) {}

  async initialize(): Promise<void> {}

  async reload(): Promise<AgentReloadSummary> {
    return {
      totalLoaded: 0,
      localCount: 0,
      remoteCount: 0,
      newAgents: [],
      updatedAgents: [],
      deletedAgents: [],
      errors: [],
    };
  }

  async acknowledgeAgent(_agent: AgentDefinition): Promise<void> {}

  dispose(): void {}

  getDefinition(_name: string): AgentDefinition | undefined {
    return undefined;
  }

  getAllDefinitions(): AgentDefinition[] {
    return [];
  }

  getAllAgentNames(): string[] {
    return [];
  }

  getAllDiscoveredAgentNames(): string[] {
    return [];
  }

  getDiscoveredDefinition(_name: string): AgentDefinition | undefined {
    return undefined;
  }
}
