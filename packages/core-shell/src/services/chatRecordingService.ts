/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/services/chatRecordingService.ts，langvis 关闭此能力：
// 会话录制/恢复类型与上游同形；服务为空壳——会话状态在 langvis 后端。

import { randomUUID } from 'node:crypto';
import type {
  GenerateContentResponseUsageMetadata,
  PartListUnion,
} from '@google/genai';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type {
  ConversationRecord,
  MessageRecord,
  ToolCallRecord,
  ResumedSessionData,
  LoadConversationOptions,
} from './chatRecordingTypes.js';
import type { HistoryTurn } from '../core/agentChatHistory.js';
import type { ThoughtSummary } from '../utils/thoughtUtils.js';

export {
  SESSION_FILE_PREFIX,
  MAX_HISTORY_MESSAGES,
  MAX_TOOL_OUTPUT_SIZE,
} from './chatRecordingTypes.js';
export type {
  ConversationRecord,
  MessageRecord,
  ToolCallRecord,
  ResumedSessionData,
  TokensSummary,
  MemoryScratchpad,
  RewindRecord,
  MetadataUpdateRecord,
  PartialMetadataRecord,
  LoadConversationOptions,
} from './chatRecordingTypes.js';

export function isResumableMessageRecord(_message: MessageRecord): boolean {
  return false;
}

export function hasResumableConversationContent(
  _record: ConversationRecord,
): boolean {
  return false;
}

export async function loadConversationRecord(
  filePath: string,
  _options?: LoadConversationOptions,
): Promise<
  | (ConversationRecord & {
      messageCount?: number;
      userMessageCount?: number;
      firstUserMessage?: string;
      hasResumableContent?: boolean;
      memoryScratchpadIsStale?: boolean;
    })
  | null
> {
  void filePath;
  return null;
}

export class ChatRecordingService {
  constructor(_context: AgentLoopContext) {}

  async initialize(
    _resumedSessionData?: ResumedSessionData,
    _kind?: 'main' | 'subagent',
  ): Promise<void> {}

  recordMessage(message: {
    model: string | undefined;
    type: MessageRecord['type'];
    content: PartListUnion;
    displayContent?: PartListUnion;
    id?: string;
  }): string {
    return message.id || randomUUID();
  }

  recordSyntheticMessage(
    _type: MessageRecord['type'],
    _content: PartListUnion,
    id?: string,
  ): string {
    return id || randomUUID();
  }

  recordThought(_thought: ThoughtSummary): void {}

  recordMessageTokens(
    _respUsageMetadata: GenerateContentResponseUsageMetadata,
  ): void {}

  recordToolCalls(_model: string, _toolCalls: ToolCallRecord[]): void {}

  saveSummary(_summary: string): void {}

  recordDirectories(_directories: readonly string[]): void {}

  getConversation(): ConversationRecord | null {
    return null;
  }

  getConversationFilePath(): string | null {
    return null;
  }

  async deleteSession(_sessionIdOrBasename: string): Promise<void> {}

  async deleteCurrentSessionAsync(): Promise<void> {}

  async deleteCurrentSessionIfNotResumableAsync(): Promise<void> {}

  rewindTo(_messageId: string): ConversationRecord | null {
    return null;
  }

  updateMessagesFromHistory(_history: readonly HistoryTurn[]): void {}
}
