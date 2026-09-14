/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// langvis 裁剪：砍沙箱/worktree/acp/devtools/policy updater/hooks/LiteRT/
// 非交互尾部；auth 段替换为 LANGVIS_SERVER_URL 占位（网络层下一阶段接入）。

import {
  type StartupWarning,
  WarningPriority,
  type Config,
  type ResumedSessionData,
  type OutputPayload,
  type ConsoleLogPayload,
  type UserFeedbackPayload,
  type CoreEvents,
  createSessionId,
  patchStdio,
  writeToStdout,
  writeToStderr,
  shouldEnterAlternateScreen,
  startupProfiler,
  ExitCodes,
  coreEvents,
  CoreEvent,
  debugLogger,
  isHeadlessMode,
  Storage,
  getProjectHash,
  loadConversationRecord,
  type MessageRecord,
  getErrorMessage,
} from '@google/gemini-cli-core';

import { loadCliConfig, parseArguments } from './config/config.js';
import * as cliConfig from './config/config.js';
import { createHash } from 'node:crypto';
import v8 from 'node:v8';
import os from 'node:os';
import dns from 'node:dns';
import * as path from 'node:path';
import * as fsPromises from 'node:fs/promises';
import {
  loadSettings,
  type DnsResolutionOrder,
  type LoadedSettings,
} from './config/settings.js';
import {
  loadTrustedFolders,
  type TrustedFoldersError,
} from './config/trustedFolders.js';
import { getStartupWarnings } from './utils/startupWarnings.js';
import { getUserStartupWarnings } from './utils/userStartupWarnings.js';
import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import {
  cleanupCheckpoints,
  registerCleanup,
  registerSyncCleanup,
  runExitCleanup,
  registerTelemetryConfig,
  setupSignalHandlers,
} from './utils/cleanup.js';
import {
  cleanupToolOutputFiles,
  cleanupExpiredSessions,
} from './utils/sessionCleanup.js';
import {
  initializeApp,
  type InitializationResult,
} from './core/initializer.js';
import { initializeLangvis } from './core/auth.js';
import { appEvents, AppEvent } from './utils/events.js';
import {
  RESUME_LATEST,
  SessionError,
  SessionSelector,
} from './utils/sessionUtils.js';
import { deleteSession, listSessions } from './utils/sessions.js';
import { setupTerminalAndTheme } from './utils/terminalTheme.js';
import { runDeferredCommand } from './deferred.js';
import { cleanupBackgroundLogs } from './utils/logCleanup.js';
import { SlashCommandConflictHandler } from './services/SlashCommandConflictHandler.js';

export function validateDnsResolutionOrder(
  order: string | undefined,
): DnsResolutionOrder {
  const defaultValue: DnsResolutionOrder = 'ipv4first';
  if (order === undefined) {
    return defaultValue;
  }
  if (order === 'ipv4first' || order === 'verbatim') {
    return order;
  }
  // We don't want to throw here, just warn and use the default.
  debugLogger.warn(
    `Invalid value for dnsResolutionOrder in settings: "${order}". Using default "${defaultValue}".`,
  );
  return defaultValue;
}

const DEFAULT_EPT_SIZE = (256 * 1024 * 1024).toString();

export function getNodeMemoryArgs(isDebugMode: boolean): string[] {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const heapStats = v8.getHeapStatistics();
  const currentMaxOldSpaceSizeMb = Math.floor(
    heapStats.heap_size_limit / 1024 / 1024,
  );

  // Set target to 50% of total memory
  const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * 0.5);
  if (isDebugMode) {
    debugLogger.debug(
      `Current heap size ${currentMaxOldSpaceSizeMb.toFixed(2)} MB`,
    );
  }

  if (process.env['GEMINI_CLI_NO_RELAUNCH']) {
    return [];
  }

  const args: string[] = [];

  // Automatically expand the V8 External Pointer Table to 256MB to prevent
  // out-of-memory crashes during high native-handle concurrency.
  // Note: Only supported in specific Node.js versions compiled with V8 Sandbox enabled.
  const eptFlag = `--max-external-pointer-table-size=${DEFAULT_EPT_SIZE}`;
  const isV8SandboxEnabled =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
    (process.config?.variables as any)?.v8_enable_sandbox === 1;

  if (
    isV8SandboxEnabled &&
    !process.execArgv.some((arg) =>
      arg.startsWith('--max-external-pointer-table-size'),
    )
  ) {
    args.push(eptFlag);
  }

  if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
    if (isDebugMode) {
      debugLogger.debug(
        `Need to relaunch with more memory: ${targetMaxOldSpaceSizeInMB.toFixed(2)} MB`,
      );
    }
    args.push(`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`);
  }

  return args;
}

export function setupUnhandledRejectionHandler() {
  let unhandledRejectionOccurred = false;
  process.on('unhandledRejection', (reason, _promise) => {
    // AbortError is expected when the user cancels a request (e.g. pressing ESC).
    // It may surface as an unhandled rejection due to async timing in the
    // streaming pipeline, but it is not a bug.
    if (reason instanceof Error && reason.name === 'AbortError') {
      debugLogger.log(`Suppressed unhandled AbortError: ${reason.message}`);
      return;
    }

    const errorMessage = `=========================================
This is an unexpected error. Please file a bug report using the /bug tool.
CRITICAL: Unhandled Promise Rejection!
=========================================
Reason: ${reason}${
      reason instanceof Error && reason.stack
        ? `
Stack trace:
${reason.stack}`
        : ''
    }`;
    debugLogger.error(errorMessage);
    if (!unhandledRejectionOccurred) {
      unhandledRejectionOccurred = true;
      appEvents.emit(AppEvent.OpenDebugConsole);
    }
  });
}

export async function resolveSessionId(
  resumeArg: string | undefined,
  sessionIdArg?: string | undefined,
  sessionFileArg?: string | undefined,
): Promise<{
  sessionId: string;
  resumedSessionData?: ResumedSessionData;
}> {
  if (!resumeArg && !sessionIdArg && !sessionFileArg) {
    return { sessionId: createSessionId() };
  }

  const storage = new Storage(process.cwd());
  await storage.initialize();

  const sessionSelector = new SessionSelector(storage);

  if (sessionFileArg) {
    try {
      const sessionData = await loadConversationRecord(sessionFileArg);
      if (!sessionData) {
        throw new Error(`File not found or invalid format: ${sessionFileArg}`);
      }

      const now = Date.now();
      const isoNow = new Date(now).toISOString();

      // Filter out old system/info messages that are specific to the previous run
      // and only keep actual conversation messages (user/gemini).
      // Best effort parse: ensure message is an object and has required fields.
      sessionData.messages = (sessionData.messages || []).filter(
        (m) =>
          typeof m === 'object' &&
          m !== null &&
          (m.type === 'user' || m.type === 'gemini') &&
          m.content !== undefined,
      );

      // Add a single info message to the history to confirm the import
      sessionData.messages.unshift({
        id: `import-${now}`,
        type: 'info',
        content: `Imported session from ${sessionFileArg}`,
        timestamp: isoNow,
      } as MessageRecord);

      const newSessionId = createSessionId();
      sessionData.sessionId = newSessionId;
      sessionData.projectHash = getProjectHash(storage.getProjectRoot());
      sessionData.startTime = isoNow;
      sessionData.lastUpdated = isoNow;

      const chatsDir = path.join(storage.getProjectTempDir(), 'chats');
      const newSessionPath = path.join(
        chatsDir,
        `session-${now}-${newSessionId.slice(0, 8)}.jsonl`,
      );

      const { messages: _messages, ...initialMetadata } = sessionData;

      const lines = [JSON.stringify(initialMetadata)];
      if (sessionData.messages) {
        for (const msg of sessionData.messages) {
          lines.push(JSON.stringify(msg));
        }
      }

      await fsPromises.mkdir(chatsDir, { recursive: true });
      await fsPromises.writeFile(
        newSessionPath,
        lines.join('\n') + '\n',
        'utf-8',
      );

      return {
        sessionId: newSessionId,
        resumedSessionData: {
          conversation: sessionData,
          filePath: newSessionPath,
        },
      };
    } catch (error) {
      coreEvents.emitFeedback(
        'error',
        `Error importing session from file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      await runExitCleanup();
      process.exit(ExitCodes.FATAL_INPUT_ERROR);
    }
  }

  if (sessionIdArg) {
    if (await sessionSelector.sessionExists(sessionIdArg)) {
      coreEvents.emitFeedback(
        'error',
        `Error starting session: Session ID "${sessionIdArg}" already exists. Use --resume to resume it, or provide a different ID.`,
      );
      await runExitCleanup();
      process.exit(ExitCodes.FATAL_INPUT_ERROR);
    }
    return { sessionId: sessionIdArg };
  }

  try {
    const { sessionData, sessionPath } = await sessionSelector.resolveSession(
      resumeArg!,
    );
    return {
      sessionId: sessionData.sessionId,
      resumedSessionData: { conversation: sessionData, filePath: sessionPath },
    };
  } catch (error) {
    if (error instanceof SessionError && error.code === 'NO_SESSIONS_FOUND') {
      if (resumeArg === RESUME_LATEST) {
        coreEvents.emitFeedback('warning', error.message);
        return { sessionId: createSessionId() };
      }
    }
    coreEvents.emitFeedback(
      'error',
      `Error resuming session: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    await runExitCleanup();
    process.exit(ExitCodes.FATAL_INPUT_ERROR);
  }
}

export async function startInteractiveUI(
  config: Config,
  settings: LoadedSettings,
  startupWarnings: StartupWarning[],
  workspaceRoot: string = process.cwd(),
  resumedSessionData: ResumedSessionData | undefined,
  initializationResult: InitializationResult,
) {
  // Dynamically import the heavy UI module so React/Ink are only parsed when needed
  const { startInteractiveUI: doStartUI } = await import('./interactiveCli.js');
  await doStartUI(
    config,
    settings,
    startupWarnings,
    workspaceRoot,
    resumedSessionData,
    initializationResult,
  );
}

export async function main() {
  let config: Config | undefined;
  const cliStartupHandle = startupProfiler.start('cli_startup');

  // Listen for admin controls from parent process (IPC).
  const adminControlsListner = setupAdminControlsListener();
  registerCleanup(adminControlsListner.cleanup);

  const cleanupStdio = patchStdio();
  registerSyncCleanup(() => {
    // This is needed to ensure we don't lose any buffered output.
    initializeOutputListenersAndFlush(config);
    cleanupStdio();
  });

  setupUnhandledRejectionHandler();

  setupSignalHandlers();

  const slashCommandConflictHandler = new SlashCommandConflictHandler();
  slashCommandConflictHandler.start();
  registerCleanup(() => slashCommandConflictHandler.stop());

  const loadSettingsHandle = startupProfiler.start('load_settings');
  const settings = loadSettings();
  loadSettingsHandle?.end();

  const cleanupOpsHandle = startupProfiler.start('cleanup_ops');
  Promise.all([
    cleanupCheckpoints(),
    cleanupToolOutputFiles(settings.merged),
    cleanupBackgroundLogs(),
  ])
    .catch((e) => {
      debugLogger.error('Early cleanup failed:', e);
    })
    .finally(() => {
      cleanupOpsHandle?.end();
    });

  const parseArgsHandle = startupProfiler.start('parse_arguments');
  const argvPromise = parseArguments(settings.merged).finally(() => {
    parseArgsHandle?.end();
  });

  const rawStartupWarningsPromise = getStartupWarnings();

  // Report settings errors once during startup
  settings.errors.forEach((error) => {
    coreEvents.emitFeedback('warning', error.message);
  });

  const trustedFolders = loadTrustedFolders();
  trustedFolders.errors.forEach((error: TrustedFoldersError) => {
    coreEvents.emitFeedback(
      'warning',
      `Error in ${error.path}: ${error.message}`,
    );
  });

  const argv = await argvPromise;

  const { sessionId, resumedSessionData } = await resolveSessionId(
    argv.resume,
    argv.sessionId,
    argv.sessionFile,
  );

  if (argv.startupMessages) {
    argv.startupMessages.forEach((msg) => {
      coreEvents.emitFeedback('info', msg);
    });
  }

  const isDebugMode = cliConfig.isDebugMode(argv);
  const consolePatcher = new ConsolePatcher({
    stderr: argv.isCommand ? false : true,
    interactive: isHeadlessMode() && !argv.isCommand ? false : true,
    debugMode: isDebugMode,
    onNewMessage: (msg) => {
      coreEvents.emitConsoleLog(msg.type, msg.content);
    },
  });
  consolePatcher.patch();

  dns.setDefaultResultOrder(
    validateDnsResolutionOrder(settings.merged.advanced.dnsResolutionOrder),
  );

  // langvis：后端会话校验 + cwd conversation 绑定（cookies.json 持久登录）。
  let langvisConversationId: string;
  try {
    langvisConversationId = await initializeLangvis();
  } catch (e) {
    writeToStderr(
      `langvis: login required (${getErrorMessage(e)}).\n` +
        `  set LANGVIS_SERVER_URL, and LANGVIS_EMAIL/LANGVIS_PASSWORD for first sign-in.\n`,
    );
    await runExitCleanup();
    process.exit(ExitCodes.FATAL_INPUT_ERROR);
  }

  const partialConfig = await loadCliConfig(settings.merged, sessionId, argv, {
    projectHooks: settings.workspace.settings.hooks,
    skipExtensions: true,
    loadedSettings: settings,
  });

  adminControlsListner.setConfig(partialConfig);

  // Run deferred command now that we have admin settings.
  await runDeferredCommand(settings.merged);

  {
    const loadConfigHandle = startupProfiler.start('load_cli_config');
    config = await loadCliConfig(settings.merged, sessionId, argv, {
      projectHooks: settings.workspace.settings.hooks,
      loadedSettings: settings,
    });
    loadConfigHandle?.end();

    // Initialize storage immediately after loading config to ensure that
    // storage-related operations (like listing or resuming sessions) have
    // access to the project identifier.
    await config.storage.initialize();

    adminControlsListner.setConfig(config);

    // Register config for telemetry shutdown
    registerTelemetryConfig(config);

    // Register ConsolePatcher cleanup last to ensure logs from shutdown hooks
    // are correctly redirected to stderr (especially for non-interactive JSON output).
    registerCleanup(consolePatcher.cleanup);

    // Launch cleanup expired sessions as a background task
    cleanupExpiredSessions(config, settings.merged).catch((e) => {
      debugLogger.error('Failed to cleanup expired sessions:', e);
    });

    if (config.getListExtensions()) {
      debugLogger.log('Installed extensions:');
      for (const extension of config.getExtensions()) {
        debugLogger.log(`- ${extension.name}`);
      }
      await runExitCleanup();
      process.exit(ExitCodes.SUCCESS);
    }

    // Handle --list-sessions flag
    if (config.getListSessions()) {
      await listSessions(config);
      await runExitCleanup();
      process.exit(ExitCodes.SUCCESS);
    }

    // Handle --delete-session flag
    const sessionToDelete = config.getDeleteSession();
    if (sessionToDelete) {
      await deleteSession(config, sessionToDelete);
      await runExitCleanup();
      process.exit(ExitCodes.SUCCESS);
    }

    const wasRaw = process.stdin.isRaw;
    if (config.isInteractive() && !wasRaw && process.stdin.isTTY) {
      // Set this as early as possible to avoid spurious characters from
      // input showing up in the output.
      process.stdin.setRawMode(true);

      // This cleanup isn't strictly needed but may help in certain situations.
      registerSyncCleanup(() => {
        process.stdin.setRawMode(wasRaw);
      });
    }

    const terminalHandle = startupProfiler.start('setup_terminal');
    await setupTerminalAndTheme(config, settings);
    terminalHandle?.end();

    config.setSessionId(langvisConversationId);

    const initAppHandle = startupProfiler.start('initialize_app');
    const initializationResult = await initializeApp(config, settings);
    initAppHandle?.end();

    const input = config.getQuestion();
    const useAlternateBuffer = shouldEnterAlternateScreen(
      config.getUseAlternateBuffer(),
      config.getScreenReader(),
    );
    const rawStartupWarnings = await rawStartupWarningsPromise;
    const startupWarnings: StartupWarning[] = [
      ...rawStartupWarnings.map((message) => ({
        id: `startup-${createHash('sha256').update(message).digest('hex').substring(0, 16)}`,
        message,
        priority: WarningPriority.High,
      })),
      ...(await getUserStartupWarnings(settings.merged, undefined, {
        isAlternateBuffer: useAlternateBuffer,
      })),
    ];

    cliStartupHandle?.end();

    if (!config.isInteractive()) {
      for (const warning of startupWarnings) {
        writeToStderr(warning.message + '\n');
      }
    }

    // Render UI, passing necessary config values. Check that there is no command line question.
    if (config.isInteractive()) {
      // Earlier initialization phases may have added and removed 'data'
      // listeners on process.stdin. When the listener count drops to 0, Node.js
      // implicitly pauses the stream buffer. React Ink's useInput hooks will
      // silently fail to receive keystrokes if the stream remains paused.
      if (process.stdin.isTTY) {
        process.stdin.resume();
      }

      await startInteractiveUI(
        config,
        settings,
        startupWarnings,
        process.cwd(),
        resumedSessionData,
        initializationResult,
      );
      return;
    }

    // langvis 裁剪：非交互执行路径（原 stdin 管道 + runNonInteractive）已移除，
    // 会话将由 AgentProtocol 接入后端；当前仅支持交互式 TTY。
    if (!input && !process.stdin.isTTY) {
      writeToStderr(
        'langvis: non-interactive mode is not wired yet. Run gemini in a TTY.\n',
      );
      await runExitCleanup();
      process.exit(ExitCodes.FATAL_INPUT_ERROR);
    }

    debugLogger.error(
      `No interactive session available. Input can be provided by launching gemini in a TTY.`,
    );
    await runExitCleanup();
    process.exit(ExitCodes.FATAL_INPUT_ERROR);
  }
}

export function initializeOutputListenersAndFlush(config?: Config) {
  // If there are no listeners for output, make sure we flush so output is not
  // lost.
  if (coreEvents.listenerCount(CoreEvent.Output) === 0) {
    // In non-interactive mode, ensure we drain any buffered output or logs to stderr
    coreEvents.on(CoreEvent.Output, (payload: OutputPayload) => {
      if (payload.isStderr) {
        writeToStderr(payload.chunk, payload.encoding);
      } else {
        writeToStdout(payload.chunk, payload.encoding);
      }
    });
  }

  if (coreEvents.listenerCount(CoreEvent.ConsoleLog) === 0) {
    coreEvents.on(CoreEvent.ConsoleLog, (payload: ConsoleLogPayload) => {
      if (payload.type === 'error' || payload.type === 'warn') {
        writeToStderr(payload.content + '\n');
      } else {
        writeToStderr(payload.content + '\n');
      }
    });
  }

  if (coreEvents.listenerCount(CoreEvent.UserFeedback) === 0) {
    coreEvents.on(CoreEvent.UserFeedback, (payload: UserFeedbackPayload) => {
      writeToStderr(payload.message + '\n');
    });
  }

  const outputFormat = config?.getOutputFormat();
  const forceToStderr = outputFormat === 'json';

  coreEvents.drainBacklogs(
    <K extends keyof CoreEvents>(event: K, args: CoreEvents[K]) => {
      if (forceToStderr && event === (CoreEvent.Output as string)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const payload = args[0] as OutputPayload;
        if (!payload.isStderr) {
          return {
            event,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            args: [{ ...payload, isStderr: true }] as unknown as CoreEvents[K],
          };
        }
      }
      return { event, args };
    },
  );
}

function setupAdminControlsListener() {
  let pendingSettings:
    | import('@google/gemini-cli-core').AdminControlsSettings
    | undefined;
  let config: Config | undefined;

  const messageHandler = (msg: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const message = msg as {
      type?: string;
      settings?: import('@google/gemini-cli-core').AdminControlsSettings;
    };
    if (message?.type === 'admin-settings' && message.settings) {
      if (config) {
        config.setRemoteAdminSettings(message.settings);
      } else {
        pendingSettings = message.settings;
      }
    }
  };

  process.on('message', messageHandler);

  return {
    setConfig: (newConfig: Config) => {
      config = newConfig;
      if (pendingSettings) {
        config.setRemoteAdminSettings(pendingSettings);
      }
    },
    cleanup: () => {
      process.off('message', messageHandler);
    },
  };
}
