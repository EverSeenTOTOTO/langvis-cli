/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// langvis 裁剪：只保留存活面的测试（未处理拒绝、输出 flush、内存参数、
// 会话 ID 解析）。main 的沙箱/auth/非交互路径已随功能删除。
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import os from 'node:os';
import v8 from 'node:v8';

import {
  coreEvents,
  debugLogger,
  ExitCodes,
  type ConversationRecord,
} from '@google/gemini-cli-core';
import {
  setupUnhandledRejectionHandler,
  initializeOutputListenersAndFlush,
  getNodeMemoryArgs,
  resolveSessionId,
} from './gemini.js';
import { appEvents, AppEvent } from './utils/events.js';
import { SessionSelector, SessionError } from './utils/sessionUtils.js';

vi.mock('./utils/events.js', () => ({
  appEvents: { emit: vi.fn() },
  AppEvent: { OpenDebugConsole: 'open-debug-console' },
}));

vi.mock('./utils/sessionUtils.js', () => ({
  RESUME_LATEST: '@latest',
  SessionSelector: vi.fn(),
  SessionError: class SessionError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
    static noSessionsFound() {
      return new SessionError('No sessions found', 'NO_SESSIONS_FOUND');
    }
  },
}));

class MockProcessExitError extends Error {
  constructor(readonly code?: string | number | null | undefined) {
    super('PROCESS_EXIT_MOCKED');
    this.name = 'MockProcessExitError';
  }
}

describe('gemini.tsx unhandled rejection handler', () => {
  it('should suppress AbortError and not open debug console', async () => {
    const debugLoggerErrorSpy = vi.spyOn(debugLogger, 'error');
    const debugLoggerLogSpy = vi.spyOn(debugLogger, 'log');
    const abortError = new DOMException(
      'The operation was aborted.',
      'AbortError',
    );

    setupUnhandledRejectionHandler();
    process.emit('unhandledRejection', abortError, Promise.resolve());

    await new Promise(process.nextTick);

    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Suppressed unhandled AbortError'),
    );
  });

  it('should log unhandled promise rejections and open debug console on first error', async () => {
    process.removeAllListeners('unhandledRejection');
    const appEventsMock = vi.mocked(appEvents);
    const debugLoggerErrorSpy = vi.spyOn(debugLogger, 'error');
    const rejectionError = new Error('Test unhandled rejection');

    setupUnhandledRejectionHandler();
    process.emit('unhandledRejection', rejectionError, Promise.resolve());
    await new Promise(process.nextTick);

    expect(appEventsMock.emit).toHaveBeenCalledWith(AppEvent.OpenDebugConsole);
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unhandled Promise Rejection'),
    );

    const secondRejectionError = new Error('Second test unhandled rejection');
    process.emit('unhandledRejection', secondRejectionError, Promise.resolve());
    await new Promise(process.nextTick);

    const openDebugConsoleCalls = appEventsMock.emit.mock.calls.filter(
      (call) => call[0] === AppEvent.OpenDebugConsole,
    );
    expect(openDebugConsoleCalls.length).toBe(1);
  });
});

describe('initializeOutputListenersAndFlush', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should flush backlogs and setup listeners if no listeners exist', () => {
    vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(0);
    const drainSpy = vi.spyOn(coreEvents, 'drainBacklogs');

    initializeOutputListenersAndFlush();

    expect(drainSpy).toHaveBeenCalled();
  });
});

describe('getNodeMemoryArgs', () => {
  let osTotalMemSpy: MockInstance;
  let v8GetHeapStatisticsSpy: MockInstance;

  beforeEach(() => {
    vi.stubEnv('GEMINI_CLI_NO_RELAUNCH', '');
    delete process.env['GEMINI_CLI_NO_RELAUNCH'];
    osTotalMemSpy = vi.spyOn(os, 'totalmem');
    v8GetHeapStatisticsSpy = vi.spyOn(v8, 'getHeapStatistics');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should return empty array if GEMINI_CLI_NO_RELAUNCH is set', () => {
    process.env['GEMINI_CLI_NO_RELAUNCH'] = 'true';
    expect(getNodeMemoryArgs(false)).toEqual([]);
  });

  it('should return empty array if current heap limit is sufficient', () => {
    const totalMemoryMB = 1024;
    osTotalMemSpy.mockReturnValue(totalMemoryMB * 1024 * 1024);
    v8GetHeapStatisticsSpy.mockReturnValue({
      heap_size_limit: 2 * totalMemoryMB * 1024 * 1024,
    });
    expect(getNodeMemoryArgs(false)).toEqual([]);
  });

  it('should return memory args if current heap limit is insufficient', () => {
    const totalMemoryMB = 1024;
    osTotalMemSpy.mockReturnValue(totalMemoryMB * 1024 * 1024);
    v8GetHeapStatisticsSpy.mockReturnValue({
      heap_size_limit: 0.25 * totalMemoryMB * 1024 * 1024,
    });
    const args = getNodeMemoryArgs(false);
    expect(args.some((arg) => arg.startsWith('--max-old-space-size='))).toBe(
      true,
    );
  });
});

describe('resolveSessionId', () => {
  it('should return a new session ID when neither resume nor sessionId is provided', async () => {
    const { sessionId, resumedSessionData } = await resolveSessionId(
      undefined,
      undefined,
    );
    expect(sessionId).toBeDefined();
    expect(resumedSessionData).toBeUndefined();
  });

  it('should import from session file when sessionFile is provided', async () => {
    vi.mocked(SessionSelector).mockImplementation(
      () =>
        ({
          sessionExists: vi.fn().mockResolvedValue(false),
        }) as unknown as InstanceType<typeof SessionSelector>,
    );

    const coreModule = await import('@google/gemini-cli-core');
    vi.spyOn(coreModule, 'loadConversationRecord').mockResolvedValueOnce({
      sessionId: 'old-session-id',
      projectHash: 'hash',
      startTime: 'time',
      lastUpdated: 'time',
      messages: [
        { type: 'info', content: 'Old info', id: '1' },
        { type: 'user', content: 'Hello', id: '2' },
        { type: 'gemini', content: 'Hi', id: '3' },
        { type: 'error', content: 'Old error', id: '4' },
        { type: 'user', id: '5' },
        null,
        { type: 'unknown', content: 'Something', id: '6' },
      ],
    } as unknown as ConversationRecord);

    const emitFeedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new MockProcessExitError(code);
      });

    try {
      const { sessionId, resumedSessionData } = await resolveSessionId(
        undefined,
        undefined,
        'dummy-session.json',
      );

      expect(sessionId).toBeDefined();
      expect(sessionId).not.toBe('old-session-id');
      expect(resumedSessionData).toBeDefined();
      expect(resumedSessionData?.conversation.sessionId).toBe(sessionId);
      expect(resumedSessionData?.conversation.messages).toHaveLength(3);
      expect(resumedSessionData?.conversation.messages![0]).toMatchObject({
        type: 'info',
        content: expect.stringContaining('Imported session from'),
      });
      expect(resumedSessionData?.conversation.messages![1]).toMatchObject({
        type: 'user',
        content: 'Hello',
      });
      expect(resumedSessionData?.conversation.messages![2]).toMatchObject({
        type: 'gemini',
        content: 'Hi',
      });
    } finally {
      emitFeedbackSpy.mockRestore();
      processExitSpy.mockRestore();
    }
  });

  it('should exit with FATAL_INPUT_ERROR when sessionId already exists', async () => {
    vi.mocked(SessionSelector).mockImplementation(
      () =>
        ({
          sessionExists: vi.fn().mockResolvedValue(true),
        }) as unknown as InstanceType<typeof SessionSelector>,
    );

    const emitFeedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new MockProcessExitError(code);
      });

    try {
      await resolveSessionId(undefined, 'existing-id');
    } catch (e) {
      if (!(e instanceof MockProcessExitError)) throw e;
    }

    expect(emitFeedbackSpy).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Session ID "existing-id" already exists'),
    );
    expect(processExitSpy).toHaveBeenCalledWith(ExitCodes.FATAL_INPUT_ERROR);

    emitFeedbackSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should return provided sessionId when it does not exist', async () => {
    vi.mocked(SessionSelector).mockImplementation(
      () =>
        ({
          sessionExists: vi.fn().mockResolvedValue(false),
        }) as unknown as InstanceType<typeof SessionSelector>,
    );
    const { sessionId, resumedSessionData } = await resolveSessionId(
      undefined,
      'new-id',
    );
    expect(sessionId).toBe('new-id');
    expect(resumedSessionData).toBeUndefined();
  });

  it('should exit with FATAL_INPUT_ERROR when explicit resume session is missing', async () => {
    vi.mocked(SessionSelector).mockImplementation(
      () =>
        ({
          resolveSession: vi
            .fn()
            .mockRejectedValue(SessionError.noSessionsFound()),
        }) as unknown as InstanceType<typeof SessionSelector>,
    );

    const emitFeedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new MockProcessExitError(code);
      });

    try {
      await resolveSessionId('explicit-session-id');
    } catch (e) {
      if (!(e instanceof MockProcessExitError)) throw e;
    }

    expect(emitFeedbackSpy).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Error resuming session:'),
    );
    expect(processExitSpy).toHaveBeenCalledWith(ExitCodes.FATAL_INPUT_ERROR);

    emitFeedbackSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});
