/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
  CommandKind,
} from './types.js';
import {
  type HistoryItemSkillsList,
  MessageType,
} from '../types.js';

async function listAction(
  context: CommandContext,
  args: string,
): Promise<void | SlashCommandActionReturn> {
  const subArgs = args.trim().split(/\s+/);

  // Default to SHOWING descriptions. The user can hide them with 'nodesc'.
  let useShowDescriptions = true;
  let showAll = false;

  for (const arg of subArgs) {
    if (arg === 'nodesc' || arg === '--nodesc') {
      useShowDescriptions = false;
    } else if (arg === 'all' || arg === '--all') {
      showAll = true;
    }
  }

  const skillManager = context.services.agentContext?.config.getSkillManager();
  if (!skillManager) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: 'Could not retrieve skill manager.',
    });
    return;
  }

  const skills = showAll
    ? skillManager.getAllSkills()
    : skillManager.getAllSkills().filter((s) => !s.isBuiltin);

  const skillsListItem: HistoryItemSkillsList = {
    type: MessageType.SKILLS_LIST,
    skills: skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      disabled: skill.disabled,
      location: skill.location,
      body: skill.body,
      isBuiltin: skill.isBuiltin,
    })),
    showDescriptions: useShowDescriptions,
  };

  context.ui.addItem(skillsListItem);
}


export const skillsCommand: SlashCommand = {
  name: 'skills',
  description: 'List langvis agent skills. Usage: /skills [nodesc]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context, args) => listAction(context, args),
};
