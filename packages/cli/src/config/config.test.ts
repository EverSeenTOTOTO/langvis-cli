/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DEFAULT_FILE_FILTERING_OPTIONS,
  OutputFormat,
  ASK_USER_TOOL_NAME,
  debugLogger,
  ApprovalMode,
} from '@google/gemini-cli-core';
import {
  loadCliConfig,
  parseArguments,
  mergeExcludeTools,
  type CliArgs,
} from './config.js';
import {
  type Settings,
  type MergedSettings,
  createTestMergedSettings,
} from './settings.js';
import * as ServerConfig from '@google/gemini-cli-core';

import { isWorkspaceTrusted } from './trustedFolders.js';
import { RESUME_LATEST } from '../utils/sessionUtils.js';

vi.mock('./trustedFolders.js', () => ({
  isWorkspaceTrusted: vi.fn(() => ({ isTrusted: true, source: 'file' })), // Default to trusted
}));

vi.mock('./sandboxConfig.js', () => ({
  loadSandboxConfig: vi.fn(async () => undefined),
}));

vi.mock('../commands/utils.js', () => ({
  exitCli: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('fs')>();
  const pathMod = await import('node:path');
  const mockHome = pathMod.resolve(pathMod.sep, 'mock', 'home', 'user');
  const MOCK_CWD1 = process.cwd();
  const MOCK_CWD2 = pathMod.resolve(pathMod.sep, 'home', 'user', 'project');

  const mockPaths = new Set([
    MOCK_CWD1,
    MOCK_CWD2,
    pathMod.resolve(pathMod.sep, 'cli', 'path1'),
    pathMod.resolve(pathMod.sep, 'settings', 'path1'),
    pathMod.join(mockHome, 'settings', 'path2'),
    pathMod.join(MOCK_CWD2, 'cli', 'path2'),
    pathMod.join(MOCK_CWD2, 'settings', 'path3'),
  ]);

  const mockedRealpath = vi.fn((p) => p);
  Object.defineProperty(mockedRealpath, 'native', {
    value: (p: Parameters<typeof actualFs.realpathSync>[0]) =>
      mockedRealpath(p),
    writable: true,
  });

  return {
    ...actualFs,
    mkdirSync: vi.fn((p) => {
      mockPaths.add(p.toString());
    }),
    writeFileSync: vi.fn(),
    existsSync: vi.fn((p) => mockPaths.has(p.toString())),
    statSync: vi.fn((p) => {
      if (mockPaths.has(p.toString())) {
        return { isDirectory: () => true } as unknown as import('fs').Stats;
      }
      return actualFs.statSync(p as unknown as string);
    }),
    realpathSync: mockedRealpath,
  };
});

vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    homedir: vi.fn(() => path.resolve(path.sep, 'mock', 'home', 'user')),
  };
});

vi.mock('open', () => ({
  default: vi.fn(),
}));

vi.mock('read-package-up', () => ({
  readPackageUp: vi.fn(() =>
    Promise.resolve({ packageJson: { version: 'test-version' } }),
  ),
}));

vi.mock('@google/gemini-cli-core', async () => {
  const actualServer = await vi.importActual<typeof ServerConfig>(
    '@google/gemini-cli-core',
  );
  return {
    ...actualServer,
    IdeClient: {
      getInstance: vi.fn().mockResolvedValue({
        getConnectionStatus: vi.fn(),
        initialize: vi.fn(),
        shutdown: vi.fn(),
      }),
    },
    loadEnvironment: vi.fn(),
    DEFAULT_MEMORY_FILE_FILTERING_OPTIONS: {
      respectGitIgnore: false,
      respectGeminiIgnore: true,
      customIgnoreFilePaths: [],
    },
    DEFAULT_FILE_FILTERING_OPTIONS: {
      respectGitIgnore: true,
      respectGeminiIgnore: true,
      customIgnoreFilePaths: [],
    },
    createPolicyEngineConfig: vi.fn(
      async (_settings, approvalMode, _workspacePoliciesDir, interactive) => ({
        rules: [],
        checkers: [],
        defaultDecision: interactive
          ? ServerConfig.PolicyDecision.ASK_USER
          : ServerConfig.PolicyDecision.DENY,
        approvalMode: approvalMode ?? ServerConfig.ApprovalMode.DEFAULT,
        nonInteractive: !interactive,
      }),
    ),
    getAdminErrorMessage: vi.fn(
      (_feature) =>
        `YOLO mode is disabled by your administrator. To enable it, please request an update to the settings at: https://goo.gle/manage-gemini-cli`,
    ),
    isHeadlessMode: vi.fn((opts) => {
      if (process.env['VITEST'] === 'true') {
        return (
          !!opts?.prompt ||
          (!!process.stdin && !process.stdin.isTTY) ||
          (!!process.stdout && !process.stdout.isTTY)
        );
      }
      return (
        !!opts?.prompt ||
        process.env['CI'] === 'true' ||
        process.env['GITHUB_ACTIONS'] === 'true' ||
        (!!process.stdin && !process.stdin.isTTY) ||
        (!!process.stdout && !process.stdout.isTTY)
      );
    }),
  };
});

vi.mock('./extension-manager.js', () => {
  const ExtensionManager = vi.fn();
  ExtensionManager.prototype.loadExtensions = vi.fn();
  ExtensionManager.prototype.getExtensions = vi.fn().mockReturnValue([]);
  return { ExtensionManager };
});

// Global setup to ensure clean environment for all tests in this file
const originalArgv = process.argv;
const originalGeminiModel = process.env['GEMINI_MODEL'];
const originalStdoutIsTTY = process.stdout.isTTY;
const originalStdinIsTTY = process.stdin.isTTY;

/** ExtensionManager 已随体系裁剪——测试内的旧 mock 面用空 stub 顶替。 */
class ExtensionManager {
  getExtensions(): unknown[] {
    return [];
  }
  async loadExtensions(): Promise<void> {}
  setRequestConsent(): void {}
  setRequestSetting(): void {}
}

beforeEach(() => {
  delete process.env['GEMINI_MODEL'];
  // Restore ExtensionManager mocks by re-assigning them
  ExtensionManager.prototype.getExtensions = vi.fn().mockReturnValue([]);
  ExtensionManager.prototype.loadExtensions = vi
    .fn()
    .mockResolvedValue(undefined);

  // Default to interactive mode for tests unless otherwise specified
  Object.defineProperty(process.stdout, 'isTTY', {
    value: true,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(process.stdin, 'isTTY', {
    value: true,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  process.argv = originalArgv;
  if (originalGeminiModel !== undefined) {
    process.env['GEMINI_MODEL'] = originalGeminiModel;
  } else {
    delete process.env['GEMINI_MODEL'];
  }
  Object.defineProperty(process.stdout, 'isTTY', {
    value: originalStdoutIsTTY,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(process.stdin, 'isTTY', {
    value: originalStdinIsTTY,
    configurable: true,
    writable: true,
  });
});

describe('parseArguments', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('should fail if multiple session flags are provided', async () => {
    process.argv = [
      'node',
      'script.js',
      '--resume',
      '--session-id',
      'test-uuid-1234',
    ];
    const mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    await expect(parseArguments(createTestMergedSettings())).rejects.toThrow(
      'process.exit called',
    );

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        'The flags --resume, --session-id, and --session-file are mutually exclusive. Please provide only one.',
      ),
    );
  });

  it('should parse --session-id option correctly', async () => {
    process.argv = ['node', 'script.js', '--session-id', 'test-uuid-1234'];
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const parsedArgs = await parseArguments(createTestMergedSettings());
    expect(parsedArgs.sessionId).toBe('test-uuid-1234');
  });

  it.each([
    {
      description: 'long flags',
      argv: [
        'node',
        'script.js',
        '--prompt',
        'test prompt',
        '--prompt-interactive',
        'interactive prompt',
      ],
    },
    {
      description: 'short flags',
      argv: [
        'node',
        'script.js',
        '-p',
        'test prompt',
        '-i',
        'interactive prompt',
      ],
    },
  ])(
    'should throw an error when using conflicting prompt flags ($description)',
    async ({ argv }) => {
      process.argv = argv;

      vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(parseArguments(createTestMergedSettings())).rejects.toThrow(
        'process.exit called',
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining(
          'Cannot use both --prompt (-p) and --prompt-interactive (-i) together',
        ),
      );
    },
  );

  it.each([
    {
      description: 'should allow --prompt without --prompt-interactive',
      argv: ['node', 'script.js', '--prompt', 'test prompt'],
      expected: { prompt: 'test prompt', promptInteractive: undefined },
    },
    {
      description: 'should allow --prompt-interactive without --prompt',
      argv: ['node', 'script.js', '--prompt-interactive', 'interactive prompt'],
      expected: { prompt: undefined, promptInteractive: 'interactive prompt' },
    },
    {
      description: 'should allow -i flag as alias for --prompt-interactive',
      argv: ['node', 'script.js', '-i', 'interactive prompt'],
      expected: { prompt: undefined, promptInteractive: 'interactive prompt' },
    },
  ])('$description', async ({ argv, expected }) => {
    process.argv = argv;
    const parsedArgs = await parseArguments(createTestMergedSettings());
    expect(parsedArgs.prompt).toBe(expected.prompt);
    expect(parsedArgs.promptInteractive).toBe(expected.promptInteractive);
  });

  describe('positional arguments and @commands', () => {
    beforeEach(() => {
      // Default to headless mode for these tests as they mostly expect one-shot behavior
      process.stdin.isTTY = false;
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
        writable: true,
      });
    });

    it.each([
      {
        description:
          'should convert positional query argument to prompt by default',
        argv: ['node', 'script.js', 'Hi Gemini'],
        expectedQuery: 'Hi Gemini',
        expectedModel: undefined,
        debug: false,
      },
      {
        description:
          'should map @path to prompt (one-shot) when it starts with @',
        argv: ['node', 'script.js', '@path ./file.md'],
        expectedQuery: '@path ./file.md',
        expectedModel: undefined,
        debug: false,
      },
      {
        description:
          'should map @path to prompt even when config flags are present',
        argv: [
          'node',
          'script.js',
          '@path',
          './file.md',
          '--model',
          'gemini-2.5-pro',
        ],
        expectedQuery: '@path ./file.md',
        expectedModel: 'gemini-2.5-pro',
        debug: false,
      },
      {
        description:
          'maps unquoted positional @path + arg to prompt (one-shot)',
        argv: ['node', 'script.js', '@path', './file.md'],
        expectedQuery: '@path ./file.md',
        expectedModel: undefined,
        debug: false,
      },
      {
        description:
          'should handle multiple @path arguments in a single command (one-shot)',
        argv: [
          'node',
          'script.js',
          '@path',
          './file1.md',
          '@path',
          './file2.md',
        ],
        expectedQuery: '@path ./file1.md @path ./file2.md',
        expectedModel: undefined,
        debug: false,
      },
      {
        description:
          'should handle mixed quoted and unquoted @path arguments (one-shot)',
        argv: [
          'node',
          'script.js',
          '@path ./file1.md',
          '@path',
          './file2.md',
          'additional text',
        ],
        expectedQuery: '@path ./file1.md @path ./file2.md additional text',
        expectedModel: undefined,
        debug: false,
      },
      {
        description: 'should map @path to prompt with ambient flags (debug)',
        argv: ['node', 'script.js', '@path', './file.md', '--debug'],
        expectedQuery: '@path ./file.md',
        expectedModel: undefined,
        debug: true,
      },
      {
        description: 'should map @include to prompt (one-shot)',
        argv: ['node', 'script.js', '@include src/'],
        expectedQuery: '@include src/',
        expectedModel: undefined,
        debug: false,
      },
      {
        description: 'should map @search to prompt (one-shot)',
        argv: ['node', 'script.js', '@search pattern'],
        expectedQuery: '@search pattern',
        expectedModel: undefined,
        debug: false,
      },
      {
        description: 'should map @web to prompt (one-shot)',
        argv: ['node', 'script.js', '@web query'],
        expectedQuery: '@web query',
        expectedModel: undefined,
        debug: false,
      },
      {
        description: 'should map @git to prompt (one-shot)',
        argv: ['node', 'script.js', '@git status'],
        expectedQuery: '@git status',
        expectedModel: undefined,
        debug: false,
      },
      {
        description: 'should handle @command with leading whitespace',
        argv: ['node', 'script.js', '  @path ./file.md'],
        expectedQuery: '  @path ./file.md',
        expectedModel: undefined,
        debug: false,
      },
    ])(
      '$description',
      async ({ argv, expectedQuery, expectedModel, debug }) => {
        process.argv = argv;
        const parsedArgs = await parseArguments(createTestMergedSettings());
        expect(parsedArgs.query).toBe(expectedQuery);
        expect(parsedArgs.prompt).toBe(expectedQuery);
        expect(parsedArgs.promptInteractive).toBeUndefined();
        if (expectedModel) {
          expect(parsedArgs.model).toBe(expectedModel);
        }
        if (debug) {
          expect(parsedArgs.debug).toBe(true);
        }
      },
    );

    it('should include a startup message when converting positional query to interactive prompt', async () => {
      process.stdin.isTTY = true;
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
        writable: true,
      });
      process.argv = ['node', 'script.js', 'hello'];

      try {
        const argv = await parseArguments(createTestMergedSettings());
        expect(argv.startupMessages).toContain(
          'Positional arguments now default to interactive mode. To run in non-interactive mode, use the --prompt (-p) flag.',
        );
      } finally {
        // beforeEach handles resetting
      }
    });
  });

  it.each([
    {
      description: 'long flags',
      argv: ['node', 'script.js', '--yolo', '--approval-mode', 'default'],
    },
    {
      description: 'short flags',
      argv: ['node', 'script.js', '-y', '--approval-mode', 'yolo'],
    },
  ])(
    'should throw an error when using conflicting yolo/approval-mode flags ($description)',
    async ({ argv }) => {
      process.argv = argv;

      vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(parseArguments(createTestMergedSettings())).rejects.toThrow(
        'process.exit called',
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining(
          'Cannot use both --yolo (-y) and --approval-mode together. Use --approval-mode=yolo instead.',
        ),
      );
    },
  );

  it.each([
    {
      description: 'should allow --approval-mode without --yolo',
      argv: ['node', 'script.js', '--approval-mode', 'auto_edit'],
      expected: { approvalMode: 'auto_edit', yolo: false },
    },
    {
      description: 'should allow --yolo without --approval-mode',
      argv: ['node', 'script.js', '--yolo'],
      expected: { approvalMode: undefined, yolo: true },
    },
  ])('$description', async ({ argv, expected }) => {
    process.argv = argv;
    const parsedArgs = await parseArguments(createTestMergedSettings());
    expect(parsedArgs.approvalMode).toBe(expected.approvalMode);
    expect(parsedArgs.yolo).toBe(expected.yolo);
  });

  it('should reject invalid --approval-mode values', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'invalid'];

    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const debugErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});

    await expect(parseArguments(createTestMergedSettings())).rejects.toThrow(
      'process.exit called',
    );

    expect(debugErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid values:'),
    );
    expect(mockConsoleError).toHaveBeenCalled();
  });

  it('should allow resuming a session without prompt argument in non-interactive mode (expecting stdin)', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    process.argv = ['node', 'script.js', '--resume', 'session-id'];

    try {
      const argv = await parseArguments(createTestMergedSettings());
      expect(argv.resume).toBe('session-id');
    } finally {
      process.stdin.isTTY = originalIsTTY;
    }
  });

  it('should return RESUME_LATEST constant when --resume is passed without a value', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true; // Make it interactive to avoid validation error
    process.argv = ['node', 'script.js', '--resume'];

    try {
      const argv = await parseArguments(createTestMergedSettings());
      expect(argv.resume).toBe(RESUME_LATEST);
      expect(argv.resume).toBe('latest');
    } finally {
      process.stdin.isTTY = originalIsTTY;
    }
  });

  it('should support comma-separated values for --allowed-tools', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-tools',
      'read_file,ShellTool(git status)',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    expect(argv.allowedTools).toEqual(['read_file', 'ShellTool(git status)']);
  });

  it('should support comma-separated values for --allowed-mcp-server-names', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-mcp-server-names',
      'server1,server2',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    expect(argv.allowedMcpServerNames).toEqual(['server1', 'server2']);
  });

  it('should support comma-separated values for --extensions', async () => {
    process.argv = ['node', 'script.js', '--extensions', 'ext1,ext2'];
    const argv = await parseArguments(createTestMergedSettings());
    expect(argv.extensions).toEqual(['ext1', 'ext2']);
  });

  it('should correctly parse positional arguments when flags with arguments are present', async () => {
    process.argv = [
      'node',
      'script.js',
      '--model',
      'test-model-string',
      'my-positional-arg',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    expect(argv.model).toBe('test-model-string');
    expect(argv.query).toBe('my-positional-arg');
  });

  it('should handle long positional prompts with multiple flags', async () => {
    process.argv = [
      'node',
      'script.js',
      '-e',
      'none',
      '--approval-mode=auto_edit',
      '--allowed-tools=ShellTool',
      '--allowed-tools=ShellTool(whoami)',
      '--allowed-tools=ShellTool(wc)',
      'Use whoami to write a poem in file poem.md about my username in pig latin and use wc to tell me how many lines are in the poem you wrote.',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    expect(argv.extensions).toEqual(['none']);
    expect(argv.approvalMode).toBe('auto_edit');
    expect(argv.allowedTools).toEqual([
      'ShellTool',
      'ShellTool(whoami)',
      'ShellTool(wc)',
    ]);
    expect(argv.query).toBe(
      'Use whoami to write a poem in file poem.md about my username in pig latin and use wc to tell me how many lines are in the poem you wrote.',
    );
  });
});

describe('loadCliConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('Model resolution', () => {
    it('should handle multiple --model flags by taking the last one', async () => {
      const argv = {
        query: undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: ['gemini-1.5-pro', 'gemini-2.0-flash'] as any,
        sandbox: undefined,
        debug: false,
        prompt: undefined,
        promptInteractive: undefined,
        yolo: undefined,
        approvalMode: undefined,
        policy: undefined,
        adminPolicy: undefined,
        allowedMcpServerNames: undefined,
        allowedTools: undefined,
        extensions: undefined,
        listExtensions: false,
        listSessions: false,
        deleteSession: undefined,
        screenReader: undefined,
        isCommand: false,
        rawOutput: false,
        acceptRawOutputRisk: false,
        startupMessages: [],
        resume: undefined,
        includeDirectories: [],
        useWriteTodos: false,
        outputFormat: undefined,
        fakeResponses: undefined,
        recordResponses: undefined,
        skipTrust: false,
      };

      const settings = createTestMergedSettings();
      const config = await loadCliConfig(
        settings,
        'test-session',
        argv as unknown as CliArgs,
        {
          cwd: process.cwd(),
        },
      );

      expect(config.getModel()).toBe('gemini-2.0-flash');
    });

    it('should handle non-string model flags by coercing to string', async () => {
      const argv = {
        query: undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: true as any,
        sandbox: undefined,
        debug: false,
        prompt: undefined,
        promptInteractive: undefined,
        yolo: undefined,
        approvalMode: undefined,
        policy: undefined,
        adminPolicy: undefined,
        allowedMcpServerNames: undefined,
        allowedTools: undefined,
        extensions: undefined,
        listExtensions: false,
        listSessions: false,
        deleteSession: undefined,
        screenReader: undefined,
        isCommand: false,
        rawOutput: false,
        acceptRawOutputRisk: false,
        startupMessages: [],
        resume: undefined,
        includeDirectories: [],
        useWriteTodos: false,
        outputFormat: undefined,
        fakeResponses: undefined,
        recordResponses: undefined,
        skipTrust: false,
      };

      const settings = createTestMergedSettings();
      const config = await loadCliConfig(
        settings,
        'test-session',
        argv as unknown as CliArgs,
        {
          cwd: process.cwd(),
        },
      );

      expect(config.getModel()).toBe('true');
    });
  });

  describe('Proxy configuration', () => {
    const originalProxyEnv: { [key: string]: string | undefined } = {};
    const proxyEnvVars = [
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'http_proxy',
      'https_proxy',
    ];

    beforeEach(() => {
      for (const key of proxyEnvVars) {
        originalProxyEnv[key] = process.env[key];
        delete process.env[key];
      }
    });

    afterEach(() => {
      for (const key of proxyEnvVars) {
        if (originalProxyEnv[key]) {
          process.env[key] = originalProxyEnv[key];
        } else {
          delete process.env[key];
        }
      }
    });

    it(`should leave proxy to empty by default`, async () => {
      process.argv = ['node', 'script.js'];
      const argv = await parseArguments(createTestMergedSettings());
      const settings = createTestMergedSettings();
      const config = await loadCliConfig(settings, 'test-session', argv);
      expect(config.getProxy()).toBeFalsy();
    });

    const proxy_url = 'http://localhost:7890';
    const testCases = [
      {
        input: {
          env_name: 'https_proxy',
          proxy_url,
        },
        expected: proxy_url,
      },
      {
        input: {
          env_name: 'http_proxy',
          proxy_url,
        },
        expected: proxy_url,
      },
      {
        input: {
          env_name: 'HTTPS_PROXY',
          proxy_url,
        },
        expected: proxy_url,
      },
      {
        input: {
          env_name: 'HTTP_PROXY',
          proxy_url,
        },
        expected: proxy_url,
      },
    ];
    testCases.forEach(({ input, expected }) => {
      it(`should set proxy to ${expected} according to environment variable [${input.env_name}]`, async () => {
        vi.stubEnv(input.env_name, input.proxy_url);
        process.argv = ['node', 'script.js'];
        const argv = await parseArguments(createTestMergedSettings());
        const settings = createTestMergedSettings();
        const config = await loadCliConfig(settings, 'test-session', argv);
        expect(config.getProxy()).toBe(expected);
      });
    });
  });

  it('should add IDE workspace folders from GEMINI_CLI_IDE_WORKSPACE_PATH to include directories', async () => {
    vi.stubEnv(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      ['/project/folderA', '/project/folderB'].join(path.delimiter),
    );
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();
    const config = await loadCliConfig(settings, 'test-session', argv);
    const dirs = config.getPendingIncludeDirectories();
    expect(dirs).toContain('/project/folderA');
    expect(dirs).toContain('/project/folderB');
  });

  it('should skip inaccessible workspace folders from GEMINI_CLI_IDE_WORKSPACE_PATH', async () => {
    vi.spyOn(ServerConfig, 'resolveToRealPath').mockImplementation((p) => {
      if (p.toString().includes('restricted')) {
        const err = new Error('EACCES: permission denied');
        (err as NodeJS.ErrnoException).code = 'EACCES';
        throw err;
      }
      return p.toString();
    });
    vi.stubEnv(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      ['/project/folderA', '/nonexistent/restricted/folder'].join(
        path.delimiter,
      ),
    );
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();
    const config = await loadCliConfig(settings, 'test-session', argv);
    const dirs = config.getPendingIncludeDirectories();
    expect(dirs).toContain('/project/folderA');
    expect(dirs).not.toContain('/nonexistent/restricted/folder');
  });

  it('should use default fileFilter options when unconfigured', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getFileFilteringRespectGitIgnore()).toBe(
      DEFAULT_FILE_FILTERING_OPTIONS.respectGitIgnore,
    );
    expect(config.getFileFilteringRespectGeminiIgnore()).toBe(
      DEFAULT_FILE_FILTERING_OPTIONS.respectGeminiIgnore,
    );
    expect(config.getCustomIgnoreFilePaths()).toEqual(
      DEFAULT_FILE_FILTERING_OPTIONS.customIgnoreFilePaths,
    );
    expect(config.getApprovalMode()).toBe(ApprovalMode.DEFAULT);
  });

  describe('isAcpMode', () => {
    it('skipNextSpeakerCheck 恒 true(langvis:多发言人检查不支持)', async () => {
      process.argv = ['node', 'script.js'];
      const argv = await parseArguments(createTestMergedSettings());
      const config = await loadCliConfig(
        createTestMergedSettings(),
        'test-session',
        argv,
      );
      expect(config.getSkipNextSpeakerCheck()).toBe(true);
    });
  });
});

describe('mergeMcpServers', () => {
  it('should not modify the original settings object', async () => {
    const settings = createTestMergedSettings({
      mcpServers: {
        'test-server': {
          url: 'http://localhost:8080',
        },
      },
    });

    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([
      {
        path: '/path/to/ext1',
        name: 'ext1',
        id: 'ext1-id',

        version: '1.0.0',
        mcpServers: {
          'ext1-server': {
            url: 'http://localhost:8081',
          },
        },
        contextFiles: [],
        isActive: true,
      },
    ]);
    const originalSettings = JSON.parse(JSON.stringify(settings));
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    await loadCliConfig(settings, 'test-session', argv);
    expect(settings).toEqual(originalSettings);
  });
});

describe('mergeExcludeTools', () => {
  it('merges settings excludeTools with extra excludes', () => {
    const result = mergeExcludeTools(
      { tools: { exclude: ['tool1', 'tool2'] } } as unknown as MergedSettings,
      ['tool3'],
    );
    expect(new Set(result)).toEqual(new Set(['tool1', 'tool2', 'tool3']));
  });

  it('returns empty array when nothing specified', () => {
    const result = mergeExcludeTools({
      tools: {},
    } as unknown as MergedSettings);
    expect(result).toEqual([]);
  });
});

describe('loadCliConfig model selection', () => {
  beforeEach(() => {
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('selects a model from settings.json if provided', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({
        model: {
          name: 'gemini-2.5-pro',
        },
      }),
      'test-session',
      argv,
    );

    expect(config.getModel()).toBe('gemini-2.5-pro');
  });

  it('uses the default gemini model if nothing is set', async () => {
    process.argv = ['node', 'script.js']; // No model set.
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({
        // No model set.
      }),
      'test-session',
      argv,
    );

    expect(config.getModel()).toBe('auto');
  });

  it('always prefers model from argv', async () => {
    process.argv = ['node', 'script.js', '--model', 'gemini-2.5-flash-preview'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({
        model: {
          name: 'gemini-2.5-pro',
        },
      }),
      'test-session',
      argv,
    );

    expect(config.getModel()).toBe('gemini-2.5-flash-preview');
  });

  it('selects the model from argv if provided', async () => {
    process.argv = ['node', 'script.js', '--model', 'gemini-2.5-flash-preview'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({
        // No model provided via settings.
      }),
      'test-session',
      argv,
    );

    expect(config.getModel()).toBe('gemini-2.5-flash-preview');
  });

  it('selects the default auto model if provided via auto alias', async () => {
    process.argv = ['node', 'script.js', '--model', 'auto'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({
        // No model provided via settings.
      }),
      'test-session',
      argv,
    );

    expect(config.getModel()).toBe('auto');
  });
});

describe('loadCliConfig folderTrust', () => {
  let originalVitest: string | undefined;
  let originalIntegrationTest: string | undefined;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);

    originalVitest = process.env['VITEST'];
    originalIntegrationTest = process.env['GEMINI_CLI_INTEGRATION_TEST'];
    delete process.env['VITEST'];
    delete process.env['GEMINI_CLI_INTEGRATION_TEST'];
  });

  afterEach(() => {
    if (originalVitest !== undefined) {
      process.env['VITEST'] = originalVitest;
    }
    if (originalIntegrationTest !== undefined) {
      process.env['GEMINI_CLI_INTEGRATION_TEST'] = originalIntegrationTest;
    }

    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should be false when folderTrust is false', async () => {
    process.argv = ['node', 'script.js'];
    const settings = createTestMergedSettings({
      security: {
        folderTrust: {
          enabled: false,
        },
      },
    });
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getFolderTrust()).toBe(false);
  });

  it('should be true when folderTrust is true', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      security: {
        folderTrust: {
          enabled: true,
        },
      },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getFolderTrust()).toBe(true);
  });

  it('should be true by default', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getFolderTrust()).toBe(true);
  });
});

describe('loadCliConfig with includeDirectories', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue(
      path.resolve(path.sep, 'mock', 'home', 'user'),
    );
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(process, 'cwd').mockReturnValue(
      path.resolve(path.sep, 'home', 'user', 'project'),
    );
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.skip('should combine and resolve paths from settings and CLI arguments', async () => {
    const mockCwd = path.resolve(path.sep, 'home', 'user', 'project');
    process.argv = [
      'node',

      'script.js',
      '--include-directories',
      `${path.resolve(path.sep, 'cli', 'path1')},${path.join(mockCwd, 'cli', 'path2')}`,
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      context: {
        includeDirectories: [
          path.resolve(path.sep, 'settings', 'path1'),
          path.join(os.homedir(), 'settings', 'path2'),
          path.join(mockCwd, 'settings', 'path3'),
        ],
      },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    const expected = [
      mockCwd,
      path.resolve(path.sep, 'cli', 'path1'),
      path.join(mockCwd, 'cli', 'path2'),
      path.resolve(path.sep, 'settings', 'path1'),
      path.join(os.homedir(), 'settings', 'path2'),
      path.join(mockCwd, 'settings', 'path3'),
    ];
    const directories = config.getWorkspaceContext().getDirectories();
    expect(directories).toEqual([mockCwd]);
    expect(config.getPendingIncludeDirectories()).toEqual(
      expect.arrayContaining(expected.filter((dir) => dir !== mockCwd)),
    );
    expect(config.getPendingIncludeDirectories()).toHaveLength(
      expected.length - 1,
    );
  });
});

describe('loadCliConfig context management', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should be false by default when generalistProfile / context management is not set in settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getContextManagementConfig()).haveOwnProperty(
      'enabled',
      false,
    );
    expect(config.isContextManagementEnabled()).toBe(false);
  });
});

describe('screenReader configuration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should use screenReader value from settings if CLI flag is not present (settings true)', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      ui: { accessibility: { screenReader: true } },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getScreenReader()).toBe(true);
  });

  it('should use screenReader value from settings if CLI flag is not present (settings false)', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      ui: { accessibility: { screenReader: false } },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getScreenReader()).toBe(false);
  });

  it('should prioritize --screen-reader CLI flag (true) over settings (false)', async () => {
    process.argv = ['node', 'script.js', '--screen-reader'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      ui: { accessibility: { screenReader: false } },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getScreenReader()).toBe(true);
  });

  it('should be false by default when no flag or setting is present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getScreenReader()).toBe(false);
  });
});

describe('loadCliConfig interactive', () => {
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    process.stdin.isTTY = true;
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should be interactive if isTTY and no prompt', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
  });

  it('should be interactive if prompt-interactive is set', async () => {
    process.stdin.isTTY = false;
    process.argv = ['node', 'script.js', '--prompt-interactive', 'test'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
  });

  it('should not be interactive if not isTTY and no prompt', async () => {
    process.stdin.isTTY = false;
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(false);
  });

  it('should not be interactive if prompt is set', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', '--prompt', 'test'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(false);
  });

  it('should be interactive if positional prompt words are provided with other flags', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', '--model', 'gemini-2.5-pro', 'Hello'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
  });

  it('should be interactive if positional prompt words are provided with multiple flags', async () => {
    process.stdin.isTTY = true;
    process.argv = [
      'node',
      'script.js',
      '--model',
      'gemini-2.5-pro',
      '--yolo',
      'Hello world',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
    // Verify the question is preserved for one-shot execution
    expect(argv.prompt).toBeUndefined();
    expect(argv.promptInteractive).toBe('Hello world');
  });

  it('should be interactive if positional prompt words are provided with extensions flag', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', '-e', 'none', 'hello'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
    expect(argv.query).toBe('hello');
    expect(argv.promptInteractive).toBe('hello');
    expect(argv.extensions).toEqual(['none']);
  });

  it('should handle multiple positional words correctly', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', 'hello world how are you'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
    expect(argv.query).toBe('hello world how are you');
    expect(argv.promptInteractive).toBe('hello world how are you');
  });

  it('should handle multiple positional words with flags', async () => {
    process.stdin.isTTY = true;
    process.argv = [
      'node',
      'script.js',
      '--model',
      'gemini-2.5-pro',
      'write',
      'a',
      'function',
      'to',
      'sort',
      'array',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
    expect(argv.query).toBe('write a function to sort array');
    expect(argv.promptInteractive).toBe('write a function to sort array');
    expect(argv.model).toBe('gemini-2.5-pro');
  });

  it('should handle empty positional arguments', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', ''];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
    expect(argv.query).toBeUndefined();
  });

  it('should handle extensions flag with positional arguments correctly', async () => {
    process.stdin.isTTY = true;
    process.argv = [
      'node',
      'script.js',
      '-e',
      'none',
      'hello',
      'world',
      'how',
      'are',
      'you',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
    expect(argv.query).toBe('hello world how are you');
    expect(argv.promptInteractive).toBe('hello world how are you');
    expect(argv.extensions).toEqual(['none']);
  });

  it('should be interactive if no positional prompt words are provided with flags', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', '--model', 'gemini-2.5-pro'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
  });
});

describe('loadCliConfig approval mode', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    process.argv = ['node', 'script.js']; // Reset argv for each test
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: undefined,
    });
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should default to DEFAULT approval mode when no flags are set', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
  });

  it('should set YOLO approval mode when --yolo flag is used', async () => {
    process.argv = ['node', 'script.js', '--yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.YOLO);
  });

  it('should set YOLO approval mode when -y flag is used', async () => {
    process.argv = ['node', 'script.js', '-y'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.YOLO);
  });

  it('should set DEFAULT approval mode when --approval-mode=default', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'default'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
  });

  it('should set AUTO_EDIT approval mode when --approval-mode=auto_edit', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'auto_edit'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.AUTO_EDIT);
  });

  it('should set YOLO approval mode when --approval-mode=yolo', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.YOLO);
  });

  it('should prioritize --approval-mode over --yolo when both would be valid (but validation prevents this)', async () => {
    // Note: This test documents the intended behavior, but in practice the validation
    // prevents both flags from being used together
    process.argv = ['node', 'script.js', '--approval-mode', 'default'];
    const argv = await parseArguments(createTestMergedSettings());
    // Manually set yolo to true to simulate what would happen if validation didn't prevent it
    argv.yolo = true;
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
  });

  it('should fall back to --yolo behavior when --approval-mode is not set', async () => {
    process.argv = ['node', 'script.js', '--yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.YOLO);
  });

  it('should set Plan approval mode when --approval-mode=plan is used and plan is enabled', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'plan'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      general: {
        plan: { enabled: true },
      },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.PLAN);
  });

  it('should ignore "yolo" in settings.tools.approvalMode and fall back to DEFAULT', async () => {
    process.argv = ['node', 'script.js'];
    const settings = createTestMergedSettings({
      tools: {
        // @ts-expect-error: testing invalid value
        approvalMode: 'yolo',
      },
    });
    const argv = await parseArguments(settings);
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
  });

  it('should throw error when --approval-mode=plan is used but plan is disabled', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'plan'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      general: {
        plan: { enabled: false },
      },
    });

    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ApprovalMode.DEFAULT);
  });

  it('should allow plan approval mode by default when --approval-mode=plan is used', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'plan'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({});

    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ApprovalMode.PLAN);
  });

  // --- Untrusted Folder Scenarios ---
  describe('when folder is NOT trusted', () => {
    beforeEach(() => {
      vi.mocked(isWorkspaceTrusted).mockReturnValue({
        isTrusted: false,
        source: 'file',
      });
    });

    it('should override --approval-mode=yolo to DEFAULT', async () => {
      process.argv = ['node', 'script.js', '--approval-mode', 'yolo'];
      const argv = await parseArguments(createTestMergedSettings());
      const config = await loadCliConfig(
        createTestMergedSettings(),
        'test-session',
        argv,
      );
      expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
    });

    it('should override --approval-mode=auto_edit to DEFAULT', async () => {
      process.argv = ['node', 'script.js', '--approval-mode', 'auto_edit'];
      const argv = await parseArguments(createTestMergedSettings());
      const config = await loadCliConfig(
        createTestMergedSettings(),
        'test-session',
        argv,
      );
      expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
    });

    it('should override --yolo flag to DEFAULT', async () => {
      process.argv = ['node', 'script.js', '--yolo'];
      const argv = await parseArguments(createTestMergedSettings());
      const config = await loadCliConfig(
        createTestMergedSettings(),
        'test-session',
        argv,
      );
      expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
    });

    it('should remain DEFAULT when --approval-mode=default', async () => {
      process.argv = ['node', 'script.js', '--approval-mode', 'default'];
      const argv = await parseArguments(createTestMergedSettings());
      const config = await loadCliConfig(
        createTestMergedSettings(),
        'test-session',
        argv,
      );
      expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
    });
  });

  describe('Persistent approvalMode setting', () => {
    it('should use approvalMode from settings when no CLI flags are set', async () => {
      process.argv = ['node', 'script.js'];
      const settings = createTestMergedSettings({
        general: { defaultApprovalMode: 'auto_edit' },
      });
      const argv = await parseArguments(settings);
      const config = await loadCliConfig(settings, 'test-session', argv);
      expect(config.getApprovalMode()).toBe(
        ServerConfig.ApprovalMode.AUTO_EDIT,
      );
    });

    it('should prioritize --approval-mode flag over settings', async () => {
      process.argv = ['node', 'script.js', '--approval-mode', 'auto_edit'];
      const settings = createTestMergedSettings({
        general: { defaultApprovalMode: 'default' },
      });
      const argv = await parseArguments(settings);
      const config = await loadCliConfig(settings, 'test-session', argv);
      expect(config.getApprovalMode()).toBe(
        ServerConfig.ApprovalMode.AUTO_EDIT,
      );
    });

    it('should prioritize --yolo flag over settings', async () => {
      process.argv = ['node', 'script.js', '--yolo'];
      const settings = createTestMergedSettings({
        general: { defaultApprovalMode: 'auto_edit' },
      });
      const argv = await parseArguments(settings);
      const config = await loadCliConfig(settings, 'test-session', argv);
      expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.YOLO);
    });
  });
});

describe('loadCliConfig fileFiltering', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    process.argv = ['node', 'script.js']; // Reset argv for each test
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  type FileFilteringSettings = NonNullable<
    NonNullable<Settings['context']>['fileFiltering']
  >;
  const testCases: Array<{
    property: keyof FileFilteringSettings;
    getter: (config: ServerConfig.Config) => boolean;
    value: boolean;
  }> = [
    {
      property: 'enableFuzzySearch',
      getter: (c) => c.getFileFilteringEnableFuzzySearch(),
      value: true,
    },
    {
      property: 'enableFuzzySearch',
      getter: (c) => c.getFileFilteringEnableFuzzySearch(),
      value: false,
    },
    {
      property: 'respectGitIgnore',
      getter: (c) => c.getFileFilteringRespectGitIgnore(),
      value: true,
    },
    {
      property: 'respectGitIgnore',
      getter: (c) => c.getFileFilteringRespectGitIgnore(),
      value: false,
    },
    {
      property: 'respectGeminiIgnore',
      getter: (c) => c.getFileFilteringRespectGeminiIgnore(),
      value: true,
    },
    {
      property: 'respectGeminiIgnore',
      getter: (c) => c.getFileFilteringRespectGeminiIgnore(),
      value: false,
    },
    {
      property: 'enableRecursiveFileSearch',
      getter: (c) => c.getEnableRecursiveFileSearch(),
      value: true,
    },
    {
      property: 'enableRecursiveFileSearch',
      getter: (c) => c.getEnableRecursiveFileSearch(),
      value: false,
    },
  ];

  it.each(testCases)(
    'should pass $property from settings to config when $value',
    async ({ property, getter, value }) => {
      const settings = createTestMergedSettings({
        context: {
          fileFiltering: { [property]: value },
        },
      });
      const argv = await parseArguments(settings);
      const config = await loadCliConfig(settings, 'test-session', argv);
      expect(getter(config)).toBe(value);
    },
  );
});

describe('Output format', () => {
  beforeEach(() => {
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should default to TEXT', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getOutputFormat()).toBe(OutputFormat.TEXT);
  });

  it('should use the format from settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({ output: { format: OutputFormat.JSON } }),
      'test-session',
      argv,
    );
    expect(config.getOutputFormat()).toBe(OutputFormat.JSON);
  });

  it('should prioritize the format from argv', async () => {
    process.argv = ['node', 'script.js', '--output-format', 'json'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({ output: { format: OutputFormat.JSON } }),
      'test-session',
      argv,
    );
    expect(config.getOutputFormat()).toBe(OutputFormat.JSON);
  });

  it('should accept stream-json as a valid output format', async () => {
    process.argv = ['node', 'script.js', '--output-format', 'stream-json'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getOutputFormat()).toBe(OutputFormat.STREAM_JSON);
  });

  it('should error on invalid --output-format argument', async () => {
    process.argv = ['node', 'script.js', '--output-format', 'invalid'];

    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const debugErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});

    await expect(parseArguments(createTestMergedSettings())).rejects.toThrow(
      'process.exit called',
    );
    expect(debugErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid values:'),
    );
    expect(mockConsoleError).toHaveBeenCalled();
  });
});

describe('parseArguments with positional prompt', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    // Default to headless mode for these tests as they mostly expect one-shot behavior
    process.stdin.isTTY = false;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('should throw an error when both a positional prompt and the --prompt flag are used', async () => {
    process.argv = [
      'node',
      'script.js',
      'positional',
      'prompt',
      '--prompt',
      'test prompt',
    ];

    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    vi.spyOn(console, 'error').mockImplementation(() => {});
    const debugErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});

    await expect(parseArguments(createTestMergedSettings())).rejects.toThrow(
      'process.exit called',
    );

    expect(debugErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cannot use both a positional prompt and the --prompt (-p) flag together',
      ),
    );
  });

  it('should correctly parse a positional prompt to query field', async () => {
    process.argv = ['node', 'script.js', 'positional', 'prompt'];
    const argv = await parseArguments(createTestMergedSettings());
    expect(argv.query).toBe('positional prompt');
    // Since no explicit prompt flags are set and query doesn't start with @, should map to prompt (one-shot)
    expect(argv.prompt).toBe('positional prompt');
    expect(argv.promptInteractive).toBeUndefined();
  });

  it('should have correct positional argument description', async () => {
    // Test that the positional argument has the expected description
    const yargsInstance = await import('./config.js');
    // This test verifies that the positional 'query' argument is properly configured
    // with the description: "Positional prompt. Defaults to one-shot; use -i/--prompt-interactive for interactive."
    process.argv = ['node', 'script.js', 'test', 'query'];
    const argv = await yargsInstance.parseArguments(createTestMergedSettings());
    expect(argv.query).toBe('test query');
  });

  it('should correctly parse a prompt from the --prompt flag', async () => {
    process.argv = ['node', 'script.js', '--prompt', 'test prompt'];
    const argv = await parseArguments(createTestMergedSettings());
    expect(argv.prompt).toBe('test prompt');
  });
});

describe('Policy Engine Integration in loadCliConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should pass merged allowed tools from CLI and settings to createPolicyEngineConfig', async () => {
    process.argv = ['node', 'script.js', '--allowed-tools', 'cli-tool'];
    const settings = createTestMergedSettings({
      tools: { allowed: ['settings-tool'] },
    });
    const argv = await parseArguments(createTestMergedSettings());

    await loadCliConfig(settings, 'test-session', argv);

    expect(ServerConfig.createPolicyEngineConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          allowed: expect.arrayContaining(['cli-tool']),
        }),
      }),
      expect.anything(),
      undefined,
      expect.anything(),
    );
  });

  it('should pass merged exclude tools from CLI logic and settings to createPolicyEngineConfig', async () => {
    process.stdin.isTTY = false; // Non-interactive to trigger default excludes
    process.argv = ['node', 'script.js', '-p', 'test'];
    const settings = createTestMergedSettings({
      tools: { exclude: ['settings-exclude'] },
    });
    const argv = await parseArguments(createTestMergedSettings());

    await loadCliConfig(settings, 'test-session', argv);

    // In non-interactive mode, only ask_user is excluded by default
    expect(ServerConfig.createPolicyEngineConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          exclude: expect.arrayContaining([ASK_USER_TOOL_NAME]),
        }),
      }),
      expect.anything(),
      undefined,
      expect.anything(),
    );
  });

  it('should pass user-provided policy paths from --policy flag to createPolicyEngineConfig', async () => {
    process.argv = [
      'node',
      'script.js',
      '--policy',
      '/path/to/policy1.toml,/path/to/policy2.toml',
    ];
    const settings = createTestMergedSettings();
    const argv = await parseArguments(settings);

    await loadCliConfig(settings, 'test-session', argv);

    expect(ServerConfig.createPolicyEngineConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        policyPaths: [
          path.normalize('/path/to/policy1.toml'),
          path.normalize('/path/to/policy2.toml'),
        ],
      }),
      expect.anything(),
      undefined,
      expect.anything(),
    );
  });
});

describe('loadCliConfig disableYoloMode', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should allow auto_edit mode even if yolo mode is disabled', async () => {
    process.argv = ['node', 'script.js', '--approval-mode=auto_edit'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      security: { disableYoloMode: true },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ApprovalMode.AUTO_EDIT);
  });

  it('should throw if YOLO mode is attempted when disableYoloMode is true', async () => {
    process.argv = ['node', 'script.js', '--yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      security: { disableYoloMode: true },
    });
    await expect(loadCliConfig(settings, 'test-session', argv)).rejects.toThrow(
      'YOLO mode is disabled by your administrator. To enable it, please request an update to the settings at: https://goo.gle/manage-gemini-cli',
    );
  });
});

describe('loadCliConfig secureModeEnabled', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should throw an error if YOLO mode is attempted when secureModeEnabled is true', async () => {
    process.argv = ['node', 'script.js', '--yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      admin: {
        secureModeEnabled: true,
      },
    });

    await expect(loadCliConfig(settings, 'test-session', argv)).rejects.toThrow(
      'YOLO mode is disabled by your administrator. To enable it, please request an update to the settings at: https://goo.gle/manage-gemini-cli',
    );
  });

  it('should throw an error if approval-mode=yolo is attempted when secureModeEnabled is true', async () => {
    process.argv = ['node', 'script.js', '--approval-mode=yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      admin: {
        secureModeEnabled: true,
      },
    });

    await expect(loadCliConfig(settings, 'test-session', argv)).rejects.toThrow(
      'YOLO mode is disabled by your administrator. To enable it, please request an update to the settings at: https://goo.gle/manage-gemini-cli',
    );
  });

  it('should set disableYoloMode to true when secureModeEnabled is true', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      admin: {
        secureModeEnabled: true,
      },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.isYoloModeDisabled()).toBe(true);
  });
});

describe('loadCliConfig acpMode and clientName', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should set acpMode to true and detect clientName when --acp flag is used', async () => {
    process.argv = ['node', 'script.js', '--acp'];
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('VSCODE_GIT_ASKPASS_MAIN', '');
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', '');
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getAcpMode()).toBe(true);
    expect(config.getClientName()).toBe('acp-vscode');
  });

  it('should set acpMode to true and set clientName to acp for generic terminals', async () => {
    process.argv = ['node', 'script.js', '--acp'];
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app'); // Generic terminal
    vi.stubEnv('VSCODE_GIT_ASKPASS_MAIN', '');
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', '');
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getAcpMode()).toBe(true);
    expect(config.getClientName()).toBe('acp');
  });

  it('should set acpMode to false and clientName to tui by default', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getAcpMode()).toBe(false);
    expect(config.getClientName()).toBe('tui');
  });
});
