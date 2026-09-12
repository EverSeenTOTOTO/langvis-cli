/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 扩展体系关闭——保留事件签名让 coreEvents 形状成立。
export interface ExtensionsStartingEvent {
  total: number;
  completed: number;
}

export interface ExtensionsStoppingEvent {
  total: number;
  completed: number;
}

export interface ExtensionEvents {
  extensionsStarting: ExtensionsStartingEvent[];
  extensionsStopping: ExtensionsStoppingEvent[];
}

export interface GeminiCLIExtension {
  id: string;
  name: string;
  version: string;
  isActive: boolean;
  path: string;
}
