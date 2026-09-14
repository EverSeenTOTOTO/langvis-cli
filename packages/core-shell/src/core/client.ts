/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/core/client.ts，langvis 关闭此能力：
// LLM 会话由 langvis 后端持有。GeminiClient/GeminiChat 为空壳，
// 仅满足 UI 层遗留路径的类型检查；调用即抛错。

import type { Content, GenerateContentResponse, Tool } from '@google/genai';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { ChatCompressionInfo } from './turn.js';
import type { HistoryTurn } from './agentChatHistory.js';
import type { ResumedSessionData } from '../services/chatRecordingTypes.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import type { LlmRole } from '../telemetry/llmRole.js';
import type { ChatRecordingService } from '../services/chatRecordingService.js';

function notWiredStream(): AsyncGenerator<never, void, unknown> {
  const error = new Error('langvis: LLM streaming is backend-owned');
  const iterator: AsyncGenerator<never, void, unknown> = {
    [Symbol.asyncIterator]() {
      return iterator;
    },
    next: () => Promise.reject(error),
    return: () => Promise.reject(error),
    throw: () => Promise.reject(error),
  };
  return iterator;
}

export class GeminiChat {
  constructor(..._args: unknown[]) {}

  async initialize(..._args: unknown[]): Promise<void> {}

  setSystemInstruction(_sysInstr: string): void {}

  getSystemInstruction(): string {
    return '';
  }

  async sendMessageStream(..._args: unknown[]): Promise<never> {
    throw new Error('langvis: LLM streaming is backend-owned');
  }

  getHistory(_curated: boolean = false): Content[] {
    return [];
  }

  getHistoryTurns(_curated: boolean = false): HistoryTurn[] {
    return [];
  }

  clearHistory(): void {}

  addHistory(_content: Content | HistoryTurn): void {}

  setHistory(_history: ReadonlyArray<Content | HistoryTurn>): void {}

  stripThoughtsFromHistory(): void {}

  setTools(_tools: Tool[]): void {}

  recordCompletedToolCalls(_model: string, _calls: unknown[]): void {}

  getTools(): Tool[] {
    return [];
  }

  getLastPromptTokenCount(): number {
    return 0;
  }

  getChatRecordingService(): ChatRecordingService | undefined {
    return undefined;
  }
}

export class GeminiClient {
  private initialized = false;

  constructor(private readonly context: AgentLoopContext) {}

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async addHistory(content: Content): Promise<void> {
    void content;
  }

  getChat(): GeminiChat {
    throw new Error('langvis: gemini chat is backend-owned');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getHistory(): readonly Content[] {
    return [];
  }

  stripThoughtsFromHistory(): void {}

  setHistory(_history: ReadonlyArray<Content | HistoryTurn>): void {}

  async setTools(_modelId?: string): Promise<void> {}

  async resetChat(): Promise<void> {}

  dispose(): void {}

  async resumeChat(
    _history: ReadonlyArray<Content | HistoryTurn>,
    _resumedSessionData?: ResumedSessionData,
  ): Promise<void> {
    throw new Error('langvis: session resume is backend-owned');
  }

  getChatRecordingService(): ChatRecordingService | undefined {
    return undefined;
  }

  getCurrentSequenceModel(): string | null {
    return null;
  }

  clearCurrentSequenceModel(): void {}

  async addDirectoryContext(): Promise<void> {}

  updateSystemInstruction(): void {}

  async startChat(
    _extraHistory?: ReadonlyArray<Content | HistoryTurn>,
    _resumedSessionData?: ResumedSessionData,
  ): Promise<GeminiChat> {
    throw new Error('langvis: gemini chat is backend-owned');
  }

  async generateContent(
    _modelConfigKey: ModelConfigKey,
    _contents: Content[],
    _abortSignal: AbortSignal,
    _role: LlmRole,
  ): Promise<GenerateContentResponse> {
    throw new Error('langvis: content generation is backend-owned');
  }

  async tryCompressChat(
    _prompt_id: string,
    _force: boolean = false,
    _abortSignal?: AbortSignal,
  ): Promise<ChatCompressionInfo> {
    throw new Error('langvis: chat compression is backend-owned');
  }

  getContext(): AgentLoopContext {
    return this.context;
  }

  sendMessageStream(..._args: unknown[]): AsyncGenerator<never> {
    return notWiredStream();
  }

  getLoopDetectionService(): {
    isEnabled(): boolean;
    isLoopDetected(): boolean;
    reset(): void;
    disableForSession(): void;
  } {
    return {
      isEnabled: () => false,
      isLoopDetected: () => false,
      reset: () => {},
      disableForSession: () => {},
    };
  }
}
