/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// MCP 关闭——占位类型让事件签名成立，永远没有实例。
export interface McpClient {
  [key: string]: unknown;
}
