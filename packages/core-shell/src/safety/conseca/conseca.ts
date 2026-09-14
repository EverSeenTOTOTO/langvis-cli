/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/safety/conseca/conseca.ts，langvis 关闭此能力：
// Conseca 策略生成/执行不落地，恒返回弃权结果。

import type { InProcessChecker } from '../built-in.js';
import type { SafetyCheckInput, SafetyCheckResult } from '../protocol.js';
import { SafetyCheckDecision } from '../protocol.js';
import type { AgentLoopContext } from '../../config/agent-loop-context.js';

export class ConsecaSafetyChecker implements InProcessChecker {
  private static instance: ConsecaSafetyChecker | undefined;

  private constructor() {}

  static getInstance(): ConsecaSafetyChecker {
    if (!ConsecaSafetyChecker.instance) {
      ConsecaSafetyChecker.instance = new ConsecaSafetyChecker();
    }
    return ConsecaSafetyChecker.instance;
  }

  static resetInstance(): void {
    ConsecaSafetyChecker.instance = undefined;
  }

  setContext(_context: AgentLoopContext): void {}

  async check(_input: SafetyCheckInput): Promise<SafetyCheckResult> {
    return {
      decision: SafetyCheckDecision.ASK_USER,
      reason: 'langvis: conseca disabled',
    };
  }

  getCurrentPolicy(): null {
    return null;
  }

  getActiveUserPrompt(): null {
    return null;
  }
}
