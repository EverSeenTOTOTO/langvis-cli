/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// UI 装配契约：AppContainer 以 LegacyAgentProtocol 之名实例化协议。
// 真身在 langvis/（SSE run_events → AgentEvent 翻译），此处仅转发导出。

export {
  LegacyAgentProtocol,
  langvisClient,
  setLangvisConversation,
  getLangvisConversationId,
} from '../langvis/agent-protocol.js';

import type { AgentEvent, ContentPart } from './types.js';

// 非 agent 路径的旧会话接口——langvis 下不可用，保留类型占位。
export class LegacyAgentSession {
  constructor(..._args: unknown[]) {}

  async sendMessageStream(
    _prompt: ContentPart[],
    _abortSignal: AbortSignal,
  ): Promise<void> {
    throw new Error('legacy session is backend-owned in langvis');
  }

  async setHistory(..._args: unknown[]): Promise<void> {
    throw new Error('legacy session is backend-owned in langvis');
  }
}

export type { AgentEvent };
