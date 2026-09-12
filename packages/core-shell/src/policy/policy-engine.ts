/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 策略引擎关闭——langvis 工具决策在后端。 保留类型让 MessageBus/Config 签名成立。
import type { PolicyDecision } from './types.js';

export interface CheckResult {
  decision: PolicyDecision;
  rule?: unknown;
}

export class PolicyEngine {
  async check(): Promise<CheckResult> {
    return { decision: PolicyDecision.ASK_USER };
  }
}
