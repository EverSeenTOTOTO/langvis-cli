/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/services/shellExecutionService.ts，langvis 关闭此能力：
// 类型与上游同形（源自 executionLifecycleService）；ShellExecutionService
// 为空壳——工具执行在 langvis 后端，本地无 PTY。

import path from 'node:path';
import { Storage } from '../config/storage.js';
import type { SandboxPermissions, SandboxManager } from './sandboxManager.js';
import type { EnvironmentSanitizationConfig } from './environmentSanitization.js';
import type { SandboxConfig } from '../config/config.js';
import type {
  ExecutionHandle,
  ExecutionResult,
  ExecutionOutputEvent,
} from './executionLifecycleService.js';

export type {
  ExecutionMethod,
  ExecutionResult,
  ExecutionHandle,
  ExecutionOutputEvent,
  ExecutionCompletionOptions,
  ExternalExecutionRegistration,
  FormatInjectionFn,
  CompletionBehavior,
  BackgroundStartInfo,
  BackgroundStartListener,
  BackgroundCompletionInfo,
  BackgroundCompletionListener,
} from './executionLifecycleService.js';

export type ShellExecutionResult = ExecutionResult;
export type ShellExecutionHandle = ExecutionHandle;
export type ShellOutputEvent = ExecutionOutputEvent;

export interface ShellExecutionConfig {
  additionalPermissions?: SandboxPermissions;
  terminalWidth?: number;
  terminalHeight?: number;
  pager?: string;
  showColor?: boolean;
  defaultFg?: string;
  defaultBg?: string;
  sanitizationConfig?: EnvironmentSanitizationConfig;
  sandboxManager?: SandboxManager;
  disableDynamicLineTrimming?: boolean;
  scrollback?: number;
  maxSerializedLines?: number;
  sandboxConfig?: SandboxConfig;
  backgroundCompletionBehavior?: 'inject' | 'notify' | 'silent';
  originalCommand?: string;
  sessionId?: string;
  env?: Record<string, string | undefined>;
}

export class ShellExecutionService {
  static getLogDir(): string {
    return path.join(Storage.getGlobalTempDir(), 'background-processes');
  }

  static getLogFilePath(pid: number): string {
    return path.join(this.getLogDir(), `background-${pid}.log`);
  }

  static async execute(
    commandToExecute: string,
    _cwd: string,
    onOutputEvent: (event: ShellOutputEvent) => void,
    _abortSignal: AbortSignal,
    _shouldUseNodePty: boolean,
    _shellExecutionConfig: ShellExecutionConfig,
  ): Promise<ShellExecutionHandle> {
    const error = new Error(
      `langvis: local shell execution is disabled (refused: ${commandToExecute})`,
    );
    const result: ShellExecutionResult = {
      output: '',
      exitCode: null,
      signal: null,
      error,
      aborted: false,
      pid: undefined,
      executionMethod: 'none',
    };
    onOutputEvent({ type: 'exit', exitCode: null, signal: null });
    return { pid: undefined, result: Promise.resolve(result) };
  }

  static writeToPty(_pid: number, _input: string): void {}

  static async kill(_pid: number): Promise<void> {}

  static background(
    _pid: number,
    _sessionId?: string,
    _command?: string,
  ): void {}

  static subscribe(
    _pid: number,
    _listener: (event: ShellOutputEvent) => void,
  ): () => void {
    return () => {};
  }

  static resizePty(_pid: number, _cols: number, _rows: number): void {}

  static scrollPty(_pid: number, _lines: number): void {}

  static isPtyActive(_pid: number): boolean {
    return false;
  }
}
