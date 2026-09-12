/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 子 agent 进度类型（UI 渲染 SubagentHistory 用）。

export enum AgentTerminateMode {
  ERROR = 'error',
  TIMEOUT = 'timeout',
  GOAL = 'goal',
  MAX_TURNS = 'max_turns',
  ABORTED = 'aborted',
  ERROR_NO_COMPLETE_TASK_CALL = 'error_no_complete_task_call',
}

export enum SubagentState {
  RUNNING = 'running',
  COMPLETED = 'completed',
  ERROR = 'error',
  CANCELLED = 'cancelled',
}

export enum SubagentActivityErrorType {
  UNEXPECTED_ERROR = 'unexpected_error',
  ABORTED = 'aborted',
}

export interface SubagentActivityItem {
  id: string;
  type: 'thought' | 'tool_call';
  content: string;
  displayName?: string;
  description?: string;
  args?: string;
  status: SubagentState;
}

export interface SubagentProgress {
  isSubagentProgress: true;
  agentName: string;
  recentActivity: SubagentActivityItem[];
  state?: SubagentState;
  result?: string;
  terminateReason?: AgentTerminateMode;
}

export function isSubagentProgress(obj: unknown): obj is SubagentProgress {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'isSubagentProgress' in obj &&
    obj.isSubagentProgress === true
  );
}

export function isToolActivityError(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'string'
  );
}

// Agent 定义最小形状（/agents 列表渲染所需字段子集）。
export interface BaseAgentDefinition {
  name: string;
  displayName?: string;
  description: string;
  experimental?: boolean;
  metadata?: {
    hash?: string;
    filePath?: string;
  };
}

export interface LocalAgentDefinition extends BaseAgentDefinition {
  kind: 'local';
}

export interface RemoteAgentDefinition extends BaseAgentDefinition {
  kind: 'remote';
}

export type AgentDefinition = LocalAgentDefinition | RemoteAgentDefinition;
