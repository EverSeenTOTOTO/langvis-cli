/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

vi.mock('../ui/commands/profileCommand.js', async () => {
  const { CommandKind } = await import('../ui/commands/types.js');
  return {
    profileCommand: {
      name: 'profile',
      description: 'Profile command',
      kind: CommandKind.BUILT_IN,
    },
  };
});

vi.mock('../ui/commands/aboutCommand.js', async () => {
  const { CommandKind } = await import('../ui/commands/types.js');
  return {
    aboutCommand: {
      name: 'about',
      description: 'About the CLI',
      kind: CommandKind.BUILT_IN,
    },
  };
});

vi.mock('../ui/commands/ideCommand.js', async () => {
  const { CommandKind } = await import('../ui/commands/types.js');
  return {
    ideCommand: vi.fn().mockResolvedValue({
      name: 'ide',
      description: 'IDE command',
      kind: CommandKind.BUILT_IN,
    }),
  };
});
vi.mock('../ui/commands/permissionsCommand.js', async () => {
  const { CommandKind } = await import('../ui/commands/types.js');
  return {
    permissionsCommand: {
      name: 'permissions',
      description: 'Permissions command',
      kind: CommandKind.BUILT_IN,
    },
  };
});

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { BuiltinCommandLoader } from './BuiltinCommandLoader.js';
import { isNightly, type Config } from '@google/gemini-cli-core';


vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    isNightly: vi.fn().mockResolvedValue(false),
  };
});

vi.mock('../ui/commands/agentsCommand.js', () => ({
  agentsCommand: { name: 'agents' },
}));
vi.mock('../ui/commands/chatCommand.js', () => ({
  chatCommand: {
    name: 'chat',
    subCommands: [
      { name: 'list' },
      { name: 'save' },
      { name: 'resume' },
      { name: 'delete' },
      { name: 'share' },
      { name: 'checkpoints', hidden: true, subCommands: [{ name: 'list' }] },
    ],
  },
  debugCommand: { name: 'debug' },
}));
vi.mock('../ui/commands/clearCommand.js', () => ({ clearCommand: {} }));
vi.mock('../ui/commands/editorCommand.js', () => ({ editorCommand: {} }));
vi.mock('../ui/commands/extensionsCommand.js', () => ({
  extensionsCommand: () => ({}),
}));
vi.mock('../ui/commands/helpCommand.js', () => ({ helpCommand: {} }));
vi.mock('../ui/commands/shortcutsCommand.js', () => ({
  shortcutsCommand: {},
}));
vi.mock('../ui/commands/memoryCommand.js', () => ({
  memoryCommand: () => ({}),
}));
vi.mock('../ui/commands/modelCommand.js', () => ({
  modelCommand: { name: 'model' },
}));
vi.mock('../ui/commands/quitCommand.js', () => ({ quitCommand: {} }));
vi.mock('../ui/commands/resumeCommand.js', () => ({
  resumeCommand: {
    name: 'resume',
    subCommands: [
      { name: 'list' },
      { name: 'save' },
      { name: 'resume' },
      { name: 'delete' },
      { name: 'share' },
      { name: 'checkpoints', hidden: true, subCommands: [{ name: 'list' }] },
    ],
  },
}));
vi.mock('../ui/commands/themeCommand.js', () => ({ themeCommand: {} }));
vi.mock('../ui/commands/skillsCommand.js', () => ({
  skillsCommand: { name: 'skills' },
}));
vi.mock('../ui/commands/planCommand.js', async () => {
  const { CommandKind } = await import('../ui/commands/types.js');
  return {
    planCommand: {
      name: 'plan',
      description: 'Plan command',
      kind: CommandKind.BUILT_IN,
    },
  };
});



describe('BuiltinCommandLoader', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getFolderTrust: vi.fn().mockReturnValue(true),
      isPlanEnabled: vi.fn().mockReturnValue(true),
      getEnableExtensionReloading: () => false,
      getEnableHooks: () => false,
      getEnableHooksUI: () => false,
      getExtensionsEnabled: vi.fn().mockReturnValue(true),
      isSkillsSupportEnabled: vi.fn().mockReturnValue(true),
      isAgentsEnabled: vi.fn().mockReturnValue(false),
      getMcpEnabled: vi.fn().mockReturnValue(true),
      getSkillManager: vi.fn().mockReturnValue({
        getAllSkills: vi.fn().mockReturnValue([]),
        isAdminEnabled: vi.fn().mockReturnValue(true),
      }),
      isVoiceModeEnabled: vi.fn().mockReturnValue(true),
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: 'other',
      }),
    } as unknown as Config;

  });

  it('should return a list of all loaded commands', async () => {
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);

    const names = commands.map((c) => c.name);
    for (const alive of ['chat', 'model', 'skills']) {
      expect(names).toContain(alive);
    }
    for (const removed of ['about', 'ide', 'mcp', 'auth', 'vim', 'policies']) {
      expect(names).not.toContain(removed);
    }
  });

  it('should include agents command when agents are enabled', async () => {
    mockConfig.isAgentsEnabled = vi.fn().mockReturnValue(true);
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);
    const agentsCmd = commands.find((c) => c.name === 'agents');
    expect(agentsCmd).toBeDefined();
  });

  it('should exclude plan command when plan mode is disabled', async () => {
    (mockConfig.isPlanEnabled as Mock).mockReturnValue(false);
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);
    const planCmd = commands.find((c) => c.name === 'plan');
    expect(planCmd).toBeUndefined();
  });

  it('should exclude agents command when agents are disabled', async () => {
    mockConfig.isAgentsEnabled = vi.fn().mockReturnValue(false);
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);
    const agentsCmd = commands.find((c) => c.name === 'agents');
    expect(agentsCmd).toBeUndefined();
  });

  describe('chat debug command', () => {
    it('should NOT add debug subcommand to chat/resume commands if not a nightly build', async () => {
      vi.mocked(isNightly).mockResolvedValue(false);
      const loader = new BuiltinCommandLoader(mockConfig);
      const commands = await loader.loadCommands(new AbortController().signal);

      const chatCmd = commands.find((c) => c.name === 'chat');
      expect(chatCmd?.subCommands).toBeDefined();
      const hasDebug = chatCmd!.subCommands!.some((c) => c.name === 'debug');
      expect(hasDebug).toBe(false);

      const resumeCmd = commands.find((c) => c.name === 'resume');
      const resumeHasDebug =
        resumeCmd?.subCommands?.some((c) => c.name === 'debug') ?? false;
      expect(resumeHasDebug).toBe(false);

      const chatCheckpointsCmd = chatCmd?.subCommands?.find(
        (c) => c.name === 'checkpoints',
      );
      const chatCheckpointHasDebug =
        chatCheckpointsCmd?.subCommands?.some((c) => c.name === 'debug') ??
        false;
      expect(chatCheckpointHasDebug).toBe(false);

      const resumeCheckpointsCmd = resumeCmd?.subCommands?.find(
        (c) => c.name === 'checkpoints',
      );
      const resumeCheckpointHasDebug =
        resumeCheckpointsCmd?.subCommands?.some((c) => c.name === 'debug') ??
        false;
      expect(resumeCheckpointHasDebug).toBe(false);
    });

    it('should add debug subcommand to chat/resume commands if it is a nightly build', async () => {
      vi.mocked(isNightly).mockResolvedValue(true);
      const loader = new BuiltinCommandLoader(mockConfig);
      const commands = await loader.loadCommands(new AbortController().signal);

      const chatCmd = commands.find((c) => c.name === 'chat');
      expect(chatCmd?.subCommands).toBeDefined();
      const hasDebug = chatCmd!.subCommands!.some((c) => c.name === 'debug');
      expect(hasDebug).toBe(true);

      const resumeCmd = commands.find((c) => c.name === 'resume');
      const resumeHasDebug =
        resumeCmd?.subCommands?.some((c) => c.name === 'debug') ?? false;
      expect(resumeHasDebug).toBe(true);

      const chatCheckpointsCmd = chatCmd?.subCommands?.find(
        (c) => c.name === 'checkpoints',
      );
      const chatCheckpointHasDebug =
        chatCheckpointsCmd?.subCommands?.some((c) => c.name === 'debug') ??
        false;
      expect(chatCheckpointHasDebug).toBe(true);

      const resumeCheckpointsCmd = resumeCmd?.subCommands?.find(
        (c) => c.name === 'checkpoints',
      );
      const resumeCheckpointHasDebug =
        resumeCheckpointsCmd?.subCommands?.some((c) => c.name === 'debug') ??
        false;
      expect(resumeCheckpointHasDebug).toBe(true);
    });
  });
});

