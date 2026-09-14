/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/code_assist/codeAssist.ts，langvis 关闭此能力：
// Code Assist 服务器不落地，恒 undefined。

import type { Config } from '../config/config.js';
import type { CodeAssistServer } from './server.js';

export function getCodeAssistServer(
  _config: Config,
): CodeAssistServer | undefined {
  return undefined;
}
