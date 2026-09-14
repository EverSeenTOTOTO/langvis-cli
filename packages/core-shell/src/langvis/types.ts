/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// langvis 后端的传输契约（镜像主仓 src/shared/types/{events,entities}.ts 子集）。

export type RunEvent =
  | { type: 'start' }
  | { type: 'text_chunk'; content: string }
  | { type: 'thought'; content: string }
  | {
      type: 'tool_call';
      callId: string;
      toolName: string;
      toolArgs: Record<string, unknown>;
    }
  | { type: 'tool_progress'; callId: string; data: unknown }
  | { type: 'tool_result'; callId: string; toolName: string; output: unknown }
  | {
      type: 'tool_error';
      callId: string;
      toolName: string;
      error: string;
    }
  | { type: 'final' }
  | { type: 'cancelled'; reason: string }
  | { type: 'error'; error: string }
  | { type: 'audio'; filePath: string; voice?: string }
  | { type: 'loop_usage'; used: number; total: number }
  | { type: 'hook'; hookId: string; summary: string; data?: unknown };

export type EnrichedEvent = RunEvent & { runId: string; at: number };

export type StreamFrame =
  | { type: 'connected' }
  | { type: 'session_replaced' }
  | {
      type: 'run_events';
      messageId: string;
      runId: string;
      events: EnrichedEvent[];
    }
  | { type: 'run_view'; messageId: string; runId: string; [k: string]: unknown }
  | { type: 'conversation_usage'; used: number; total: number }
  | { type: 'loop_usage'; runId: string; used: number; total: number };

export interface LangvisConversation {
  id: string;
  name: string;
  config: Record<string, unknown>;
  workspacePath?: string | null;
  createdAt: string;
}

export interface LangvisMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface LangvisSkill {
  id: string;
  name: string;
  description: string;
}

export interface LangvisModel {
  id: string;
  name?: string;
  provider?: string;
}
