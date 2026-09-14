/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/agent/legacy-agent-session.ts，langvis 关闭此能力：
// LegacyAgentProtocol 占位——满足 AgentProtocol 接口与 AppContainer 装配；
// 真正的 langvis 协议实现（SSE/HTTP 到 langvis 后端）在下一阶段接入。

import type {
  AgentEvent,
  AgentProtocol,
  AgentSend,
  ContentPart,
  Unsubscribe,
} from './types.js';
import type { Config } from '../config/config.js';

export class LegacyAgentProtocol implements AgentProtocol {
  readonly events: readonly AgentEvent[] = [];

  constructor(
    private readonly opts: {
      config: Config;
      getPreferredEditor?: unknown;
    },
  ) {}

  async send(_payload: AgentSend): Promise<{ streamId: string | null }> {
    throw new Error('langvis protocol not wired yet');
  }

  subscribe(_callback: (event: AgentEvent) => void): Unsubscribe {
    return () => {};
  }

  async abort(): Promise<void> {
    void this.opts;
  }

  async requestElicitation(
    _id: string,
    _options: unknown,
  ): Promise<Record<string, unknown>> {
    throw new Error('langvis protocol not wired yet');
  }
}

export class LegacyAgentSession {
  constructor(..._args: unknown[]) {}

  async sendMessageStream(
    _prompt: ContentPart[],
    _abortSignal: AbortSignal,
  ): Promise<void> {
    throw new Error('langvis protocol not wired yet');
  }

  async setHistory(..._args: unknown[]): Promise<void> {
    throw new Error('langvis protocol not wired yet');
  }
}
