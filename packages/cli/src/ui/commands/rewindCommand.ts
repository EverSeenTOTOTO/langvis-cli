/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createElement } from 'react';
import {
  getLangvisConversationId,
  langvisClient,
} from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type OpenCustomDialogActionReturn,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';
import { RewindDialog } from '../components/RewindDialog.js';

export const rewindCommand: SlashCommand = {
  name: 'rewind',
  description: 'Restore workspace files to a checkpoint from a previous turn',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    context: CommandContext,
  ): Promise<OpenCustomDialogActionReturn | undefined> => {
    const conversationId = getLangvisConversationId();
    if (!conversationId) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'No conversation bound — start a chat first.',
      });
      return;
    }

    let checkpoints;
    try {
      checkpoints = await langvisClient.listCheckpoints(conversationId);
    } catch (error) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `Failed to list checkpoints: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
    if (checkpoints.length === 0) {
      context.ui.addItem({
        type: MessageType.INFO,
        text: 'No workspace checkpoints yet — one is taken at the start of each turn in a git workspace.',
      });
      return;
    }

    return {
      type: 'custom_dialog',
      component: createElement(RewindDialog, {
        conversationId,
        checkpoints,
        onClose: () => context.ui.removeComponent(),
      }),
    };
  },
};
