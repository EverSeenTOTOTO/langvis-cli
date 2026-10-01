/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createElement } from 'react';
import {
  coreEvents,
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
import type { LangvisCheckpoint } from '@google/gemini-cli-core';

async function restoreAndReplay(
  context: CommandContext,
  conversationId: string,
  checkpoint: LangvisCheckpoint,
): Promise<void> {
  const result = await langvisClient.rewind(
    conversationId,
    checkpoint.messageId,
  );
  // 服务端已截断——重拉剩余历史并重放，屏幕与会话状态一致
  const { messages } = await langvisClient.getMessages(conversationId);
  context.ui.clear();
  for (const [index, m] of messages.entries()) {
    if (!m.content.trim()) continue;
    context.ui.addItem(
      {
        type: m.role === 'user' ? MessageType.USER : MessageType.GEMINI,
        text: m.content,
      },
      index,
    );
  }
  coreEvents.emitFeedback(
    'info',
    `Rewound to before: ${checkpoint.userPreview || checkpoint.messageId}` +
      (result?.deletedMessages
        ? ` (${result.deletedMessages} message(s) deleted, files restored)`
        : ''),
  );
}

export const rewindCommand: SlashCommand = {
  name: 'rewind',
  description:
    'Restore workspace files and conversation to a checkpoint from a previous turn',
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
        checkpoints,
        onRestore: (checkpoint) =>
          restoreAndReplay(context, conversationId, checkpoint),
        onClose: () => context.ui.removeComponent(),
      }),
    };
  },
};
