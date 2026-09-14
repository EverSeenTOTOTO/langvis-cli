/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/telemetry/metrics.ts，langvis 关闭此能力：
// OTel metrics 不初始化，全部 record* 为 no-op（签名与上游同形）。

import type { Config } from '../config/config.js';

export enum FileOperation {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
}

export function isMetricsInitialized(): boolean {
  return false;
}

export function recordFlickerFrame(_config: Config): void {}

export function recordExitFail(_config: Config): void {}

export function recordSlowRender(
  _config: Config,
  _renderLatency: number,
): void {}

export function recordOverageOptionSelected(
  _config: Config,
  _attributes: { selected_option: string; model: string },
): void {}

export function recordCreditPurchaseClick(
  _config: Config,
  _attributes: { source: string; model: string },
): void {}

export function recordToolCallMetrics(..._args: unknown[]): void {}

export function recordTokenUsageMetrics(..._args: unknown[]): void {}

export function recordApiResponseMetrics(..._args: unknown[]): void {}

export function recordApiErrorMetrics(..._args: unknown[]): void {}

export function recordFileOperationMetric(..._args: unknown[]): void {}

export function recordInvalidChunk(..._args: unknown[]): void {}

export function recordRetryAttemptMetrics(..._args: unknown[]): void {}

export function recordContentRetry(..._args: unknown[]): void {}

export function recordContentRetryFailure(..._args: unknown[]): void {}

export function recordModelRoutingMetrics(..._args: unknown[]): void {}

export function recordCustomTokenUsageMetrics(..._args: unknown[]): void {}

export function recordCustomApiResponseMetrics(..._args: unknown[]): void {}

export function recordGenAiClientTokenUsage(..._args: unknown[]): void {}

export function recordGenAiClientOperationDuration(..._args: unknown[]): void {}

export function getConventionAttributes(..._args: unknown[]): void {}

export function recordStartupPerformance(..._args: unknown[]): void {}
