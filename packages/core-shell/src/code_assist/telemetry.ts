/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/code_assist/telemetry.ts，langvis 关闭此能力：交互上报 no-op。

import type { Config } from '../config/config.js';
import type { CompletedToolCall } from '../scheduler/types.js';

export async function recordToolCallInteractions(
  _config: Config,
  _toolCalls: CompletedToolCall[],
): Promise<void> {}
