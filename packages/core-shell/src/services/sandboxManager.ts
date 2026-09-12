/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 沙箱关闭——langvis 的工具执行在服务端。 类型占位。
export interface SandboxManager {
  [key: string]: unknown;
}

export class NoopSandboxManager implements SandboxManager {}
