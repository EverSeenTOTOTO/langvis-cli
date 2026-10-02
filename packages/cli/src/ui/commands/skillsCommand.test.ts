/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '@google/gemini-cli-core';
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { skillsCommand } from './skillsCommand.js';
import { MessageType, type HistoryItemSkillsList } from '../types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { CommandContext } from './types.js';
import { type LoadedSettings } from '../../config/settings.js';

vi.mock('../../config/settings.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../config/settings.js')>();
  return {
    ...actual,
  };
});

describe('skillsCommand', () => {
  let context: CommandContext;

  beforeEach(() => {
    vi.useFakeTimers();
    const skills = [
      {
        name: 'skill1',
        description: 'desc1',
        location: '/loc1',
        body: 'body1',
      },
      {
        name: 'skill2',
        description: 'desc2',
        location: '/loc2',
        body: 'body2',
      },
    ];
    context = createMockCommandContext({
      services: {
        agentContext: {
          getSkillManager: vi.fn().mockReturnValue({
            getAllSkills: vi.fn().mockReturnValue(skills),
            getSkills: vi.fn().mockReturnValue(skills),
            isAdminEnabled: vi.fn().mockReturnValue(true),
            getSkill: vi
              .fn()
              .mockImplementation(
                (name: string) => skills.find((s) => s.name === name) ?? null,
              ),
          }),
          getContentGenerator: vi.fn(),
          get config() {
            return this;
          },
        } as unknown as Config,
        settings: {
          workspace: { path: '/workspace' },
          setValue: vi.fn(),
        } as unknown as LoadedSettings,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should add a SKILLS_LIST item to UI with descriptions by default', async () => {
    await skillsCommand.action!(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.SKILLS_LIST,
        skills: [
          {
            name: 'skill1',
            description: 'desc1',
            disabled: undefined,
            location: '/loc1',
            body: 'body1',
          },
          {
            name: 'skill2',
            description: 'desc2',
            disabled: undefined,
            location: '/loc2',
            body: 'body2',
          },
        ],
        showDescriptions: true,
      }),
    );
  });

  it('should list skills when "list" subcommand is used', async () => {
    const listCmd = skillsCommand;
    await listCmd.action!(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.SKILLS_LIST,
        skills: [
          {
            name: 'skill1',
            description: 'desc1',
            disabled: undefined,
            location: '/loc1',
            body: 'body1',
          },
          {
            name: 'skill2',
            description: 'desc2',
            disabled: undefined,
            location: '/loc2',
            body: 'body2',
          },
        ],
        showDescriptions: true,
      }),
    );
  });

  it('should disable descriptions if "nodesc" arg is provided to list', async () => {
    const listCmd = skillsCommand;
    await listCmd.action!(context, 'nodesc');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        showDescriptions: false,
      }),
    );
  });

  it('should filter built-in skills by default and show them with "all"', async () => {
    const skillManager =
      context.services.agentContext!.config.getSkillManager();
    const mockSkills = [
      {
        name: 'regular',
        description: 'desc1',
        location: '/loc1',
        body: 'body1',
      },
      {
        name: 'builtin',
        description: 'desc2',
        location: '/loc2',
        body: 'body2',
        isBuiltin: true,
      },
    ];
    vi.mocked(skillManager.getAllSkills).mockReturnValue(mockSkills);

    const listCmd = skillsCommand;

    // By default, only regular skills
    await listCmd.action!(context, '');
    let lastCall = vi
      .mocked(context.ui.addItem)
      .mock.calls.at(-1)![0] as HistoryItemSkillsList;
    expect(lastCall.skills).toHaveLength(1);
    expect(lastCall.skills[0].name).toBe('regular');

    // With "all", show both
    await listCmd.action!(context, 'all');
    lastCall = vi
      .mocked(context.ui.addItem)
      .mock.calls.at(-1)![0] as HistoryItemSkillsList;
    expect(lastCall.skills).toHaveLength(2);
    expect(lastCall.skills.map((s) => s.name)).toContain('builtin');

    // With "--all", show both
    await listCmd.action!(context, '--all');
    lastCall = vi
      .mocked(context.ui.addItem)
      .mock.calls.at(-1)![0] as HistoryItemSkillsList;
    expect(lastCall.skills).toHaveLength(2);
  });
});
