/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/telemetry/sdk.ts，langvis 关闭此能力：
// OTel SDK 不初始化；initialize/flush/shutdown 均 no-op。

import type { Config } from '../config/config.js';

export function isTelemetrySdkInitialized(): boolean {
  return false;
}

export async function initializeTelemetry(_config: Config): Promise<boolean> {
  return false;
}

export async function flushTelemetry(_config: Config): Promise<void> {}

export async function shutdownTelemetry(
  _config: Config,
  _fromProcessExit = true,
): Promise<void> {}
