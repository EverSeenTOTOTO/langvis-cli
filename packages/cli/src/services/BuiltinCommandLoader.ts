/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICommandLoader } from './types.js';
import {
  CommandKind,
  type SlashCommand,
  type CommandContext,
} from '../ui/commands/types.js';
import type { MessageActionReturn, Config } from '@google/gemini-cli-core';
import {
  isNightly,
  startupProfiler,
  getAdminErrorMessage,
} from '@google/gemini-cli-core';
import { agentsCommand } from '../ui/commands/agentsCommand.js';
import { chatCommand, debugCommand } from '../ui/commands/chatCommand.js';
import { clearCommand } from '../ui/commands/clearCommand.js';
import { commandsCommand } from '../ui/commands/commandsCommand.js';
import { copyCommand } from '../ui/commands/copyCommand.js';
import { editorCommand } from '../ui/commands/editorCommand.js';
import { footerCommand } from '../ui/commands/footerCommand.js';
import { helpCommand } from '../ui/commands/helpCommand.js';
import { shortcutsCommand } from '../ui/commands/shortcutsCommand.js';
import { mcpCommand } from '../ui/commands/mcpCommand.js';
import { modelCommand } from '../ui/commands/modelCommand.js';
import { quitCommand } from '../ui/commands/quitCommand.js';
import { resumeCommand } from '../ui/commands/resumeCommand.js';
import { themeCommand } from '../ui/commands/themeCommand.js';
import { skillsCommand } from '../ui/commands/skillsCommand.js';
import { settingsCommand } from '../ui/commands/settingsCommand.js';
import { terminalSetupCommand } from '../ui/commands/terminalSetupCommand.js';
import { voiceCommand } from '../ui/commands/voiceCommand.js';

/**
 * Loads the core, hard-coded slash commands that are an integral part
 * of the Gemini CLI application.
 */
export class BuiltinCommandLoader implements ICommandLoader {
  constructor(private config: Config | null) {}

  /**
   * Gathers all raw built-in command definitions, injects dependencies where
   * needed (e.g., config) and filters out any that are not available.
   *
   * @param _signal An AbortSignal (unused for this synchronous loader).
   * @returns A promise that resolves to an array of `SlashCommand` objects.
   */
  async loadCommands(_signal: AbortSignal): Promise<SlashCommand[]> {
    const handle = startupProfiler.start('load_builtin_commands');

    const isNightlyBuild = await isNightly(process.cwd());
    const addDebugToChatResumeSubCommands = (
      subCommands: SlashCommand[] | undefined,
    ): SlashCommand[] | undefined => {
      if (!subCommands) {
        return subCommands;
      }

      const withNestedCompatibility = subCommands.map((subCommand) => {
        if (subCommand.name !== 'checkpoints') {
          return subCommand;
        }

        return {
          ...subCommand,
          subCommands: addDebugToChatResumeSubCommands(subCommand.subCommands),
        };
      });

      if (!isNightlyBuild) {
        return withNestedCompatibility;
      }

      return withNestedCompatibility.some(
        (cmd) => cmd.name === debugCommand.name,
      )
        ? withNestedCompatibility
        : [
            ...withNestedCompatibility,
            { ...debugCommand, suggestionGroup: 'checkpoints' },
          ];
    };

    const chatResumeSubCommands = addDebugToChatResumeSubCommands(
      chatCommand.subCommands,
    );

    const allDefinitions: Array<SlashCommand | null> = [
      ...(this.config?.isAgentsEnabled() ? [agentsCommand] : []),
      {
        ...chatCommand,
        subCommands: chatResumeSubCommands,
      },
      clearCommand,
      commandsCommand,
      copyCommand,
      editorCommand,
      helpCommand,
      footerCommand,
      shortcutsCommand,
      ...(this.config?.getMcpEnabled() === false
        ? [
            {
              name: 'mcp',
              description:
                'Manage configured Model Context Protocol (MCP) servers',
              kind: CommandKind.BUILT_IN,
              autoExecute: false,
              subCommands: [],
              action: async (
                _context: CommandContext,
              ): Promise<MessageActionReturn> => ({
                type: 'message',
                messageType: 'error',
                content: getAdminErrorMessage('MCP', this.config ?? undefined),
              }),
            },
          ]
        : [mcpCommand]),
      modelCommand,
      quitCommand,
      {
        ...resumeCommand,
        subCommands: addDebugToChatResumeSubCommands(resumeCommand.subCommands),
      },
      themeCommand,
      ...(this.config?.isSkillsSupportEnabled()
        ? this.config?.getSkillManager()?.isAdminEnabled() === false
          ? [
              {
                name: 'skills',
                description: 'Manage agent skills',
                kind: CommandKind.BUILT_IN,
                autoExecute: false,
                subCommands: [],
                action: async (
                  _context: CommandContext,
                ): Promise<MessageActionReturn> => ({
                  type: 'message',
                  messageType: 'error',
                  content: getAdminErrorMessage(
                    'Agent skills',
                    this.config ?? undefined,
                  ),
                }),
              },
            ]
          : [skillsCommand]
        : []),
      settingsCommand,
      terminalSetupCommand,
      ...(this.config?.isVoiceModeEnabled() ? [voiceCommand] : []),
    ];
    handle?.end();
    return allDefinitions.filter((cmd): cmd is SlashCommand => cmd !== null);
  }
}
