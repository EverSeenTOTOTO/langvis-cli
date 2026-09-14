/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/tools/tool-registry.ts，langvis 关闭此能力：
// 工具集由 langvis 后端持有。ToolRegistry 为空壳（查询返回空，
// 注册为 no-op），仅满足 UI 层类型。

import type { FunctionDeclaration } from '@google/genai';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { AnyDeclarativeTool } from './tools.js';

export class ToolRegistry {
  constructor(..._args: unknown[]) {}

  getMessageBus(): MessageBus | undefined {
    return undefined;
  }

  clone(): ToolRegistry {
    return new ToolRegistry();
  }

  registerTool(_tool: AnyDeclarativeTool): void {}

  unregisterTool(_name: string): void {}

  sortTools(): void {}

  removeMcpToolsByServer(_serverName: string): void {}

  async discoverAllTools(): Promise<void> {}

  getFunctionDeclarations(_modelId?: string): FunctionDeclaration[] {
    return [];
  }

  getFunctionDeclarationsFiltered(..._args: unknown[]): FunctionDeclaration[] {
    return [];
  }

  getAllToolNames(): string[] {
    return [];
  }

  getAllTools(): AnyDeclarativeTool[] {
    return [];
  }

  getToolsByServer(_serverName: string): AnyDeclarativeTool[] {
    return [];
  }

  getTool(_name: string): AnyDeclarativeTool | undefined {
    return undefined;
  }
}
