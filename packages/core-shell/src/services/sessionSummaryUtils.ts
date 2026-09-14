/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/services/sessionSummaryUtils.ts，langvis 关闭此能力：
// 会话总结由后端生成。getPreviousSession 保留本地读取，generateSummary no-op。

import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config/config.js';
import { SESSION_FILE_PREFIX } from './chatRecordingService.js';
export async function getPreviousSession(
  config: Config,
): Promise<string | null> {
  try {
    const chatsDir = path.join(config.storage.getProjectTempDir(), 'chats');
    const files = await fs.readdir(chatsDir);
    const sessionFiles = files
      .filter((f) => f.startsWith(SESSION_FILE_PREFIX) && f.endsWith('.json'))
      .sort();
    const last = sessionFiles.at(-1);
    return last ? path.join(chatsDir, last) : null;
  } catch {
    return null;
  }
}

export async function generateSummary(_config: Config): Promise<void> {}
