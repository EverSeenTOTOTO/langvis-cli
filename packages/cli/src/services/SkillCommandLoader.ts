/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config } from '@google/gemini-cli-core';
import { CommandKind, type SlashCommand } from '../ui/commands/types.js';
import { type ICommandLoader } from './types.js';

/**
 * Loads Agent Skills as slash commands.
 */
export class SkillCommandLoader implements ICommandLoader {
  constructor(private config: Config | null) {}

  /**
   * Discovers all available skills from the SkillManager and converts
   * them into executable slash commands.
   *
   * @param _signal An AbortSignal (unused for this synchronous loader).
   * @returns A promise that resolves to an array of `SlashCommand` objects.
   */
  async loadCommands(_signal: AbortSignal): Promise<SlashCommand[]> {
    if (!this.config || !this.config.isSkillsSupportEnabled()) {
      return [];
    }

    const skillManager = this.config.getSkillManager();
    if (!skillManager || !skillManager.isAdminEnabled()) {
      return [];
    }

    // Convert all displayable skills into slash commands.
    const skills = skillManager.getDisplayableSkills();

    return skills.map((skill) => {
      const commandName = skill.name.trim().replace(/\s+/g, '-');
      return {
        name: commandName,
        description: skill.description || `Activate the ${skill.name} skill`,
        kind: CommandKind.SKILL,
        autoExecute: true,
        extensionName: skill.extensionName,
        // langvis: skill 执行在后端。slash 还原为 `/<skill-id> <args>` 文本上送，
        // 由后端 prompt 约定解释为显式 skill_call 意图（正文由后端读取注入）。
        action: async (_context, args) => {
          const invocation =
            args.trim().length > 0
              ? `/${skill.name} ${args.trim()}`
              : `/${skill.name}`;
          return {
            type: 'submit_prompt' as const,
            content: [{ text: invocation }],
          };
        },
      };
    });
  }
}
