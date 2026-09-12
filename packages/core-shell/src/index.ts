/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// core-shell：以 langvis 后端为心脏顶替 @google/gemini-cli-core 的 UI 契约。
// 纯类型/纯函数直接拷自上游；有状态服务为薄壳；按 cli 消费面 tsc 驱动增长。

// ─── 事件总线 ───
export * from './utils/events.js';

// ─── 路径/环境原语 ───
export * from './utils/paths.js';
export * from './utils/headless.js';
export * from './utils/editor.js';

// ─── 错误/退出码 ───
export * from './utils/errors.js';
export * from './utils/googleErrors.js';

// ─── 日志 ───
export * from './utils/debugLogger.js';

// ─── 工具类别 ───
export * from './tools/tools.js';

// ─── 子 agent ───
export * from './agents/types.js';

// ─── 确认总线 ───
export * from './confirmation-bus/types.js';
export * from './confirmation-bus/message-bus.js';

// ─── 策略（类型层） ───
export * from './policy/types.js';
export * from './policy/policy-engine.js';

// ─── 终端序列化类型 ───
export * from './utils/terminalSerializer.js';

// ─── 工作区上下文 ───
export * from './utils/workspaceContext.js';

// ─── 工具函数 ───
export * from './utils/safeJsonStringify.js';
