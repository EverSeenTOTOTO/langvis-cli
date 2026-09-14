/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/services/memoryService.ts，langvis 关闭此能力：
// 自动记忆抽取在后端。类型与查询函数保留，抽取服务 no-op。

import * as fs from 'node:fs/promises';
import { debugLogger } from '../utils/debugLogger.js';
import type { Config } from '../config/config.js';

export interface ExtractionRun {
  runAt: string;
  sessionIds: string[];
  candidateSessions?: unknown[];
  processedSessions?: unknown[];
  memoryCandidatesCreated?: string[];
  memoryFilesUpdated?: string[];
  skillsCreated: string[];
  turnCount?: number;
  durationMs?: number;
  terminateReason?: string;
}

export interface ExtractionState {
  runs: ExtractionRun[];
}

export function getProcessedSessionIds(state: ExtractionState): Set<string> {
  const ids = new Set<string>();
  for (const run of state.runs) {
    for (const id of run.sessionIds) {
      ids.add(id);
    }
  }
  return ids;
}

export async function tryAcquireLock(_lockPath: string): Promise<boolean> {
  return false;
}

export async function isLockStale(_lockPath: string): Promise<boolean> {
  return false;
}

export async function releaseLock(_lockPath: string): Promise<void> {}

function isExtractionState(value: unknown): value is ExtractionState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'runs' in value &&
    Array.isArray(value.runs)
  );
}

export async function readExtractionState(
  statePath: string,
): Promise<ExtractionState> {
  try {
    const content = await fs.readFile(statePath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (!isExtractionState(parsed)) {
      return { runs: [] };
    }
    return parsed;
  } catch (error) {
    debugLogger.debug(
      '[MemoryService] Failed to read extraction state:',
      error,
    );
    return { runs: [] };
  }
}

export async function writeExtractionState(
  _statePath: string,
  _state: ExtractionState,
): Promise<void> {}

export async function buildSessionIndex(
  _chatsDir: string,
  _state: ExtractionState,
): Promise<{
  sessionIndex: string;
  newSessionIds: string[];
  candidateSessions: unknown[];
}> {
  return { sessionIndex: '', newSessionIds: [], candidateSessions: [] };
}

export async function validatePatches(
  _skillsDir: string,
  _config: Config,
): Promise<string[]> {
  return [];
}

export async function startMemoryService(_config: Config): Promise<void> {}
