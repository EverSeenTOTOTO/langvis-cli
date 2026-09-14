/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/scheduler/scheduler.ts，langvis 关闭此能力：
// 工具调度在 langvis 后端执行。Scheduler 为空壳，仅保留类型与生命周期
// 方法（schedule 立即返回空结果），供 UI 层类型检查与遗留路径编译。

import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { EditorType } from '../utils/editor.js';
import type { ToolCallRequestInfo, CompletedToolCall } from './types.js';

export interface SchedulerOptions {
  context: AgentLoopContext;
  messageBus?: MessageBus;
  getPreferredEditor: () => EditorType | undefined;
  schedulerId: string;
  subagent?: string;
  parentCallId?: string;
  onWaitingForConfirmation?: (waiting: boolean) => void;
}

export class Scheduler {
  constructor(_options: SchedulerOptions) {}

  dispose(): void {}

  async schedule(
    _request: ToolCallRequestInfo | ToolCallRequestInfo[],
    _signal: AbortSignal,
  ): Promise<CompletedToolCall[]> {
    return [];
  }

  cancelAll(): void {}

  isWaitingForConfirmation(): boolean {
    return false;
  }
}
