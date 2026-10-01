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
import { MessageType, type HistoryItem } from '../types.js';
import { RewindDialog } from '../components/RewindDialog.js';
import type { LangvisTurn } from '@google/gemini-cli-core';

async function rewindAndReplay(
  context: CommandContext,
  conversationId: string,
  turn: LangvisTurn,
): Promise<void> {
  // 先取被回退消息全文（rewind 后即删）——回填输入区供编辑重发
  const { messages: before } = await langvisClient.getMessages(conversationId);
  const original = before.find((m) => m.id === turn.messageId)?.content;
  const result = await langvisClient.rewind(conversationId, turn.messageId);
  // 服务端已截断——重拉剩余历史重放，被回退的消息回填输入区
  const { messages } = await langvisClient.getMessages(conversationId);
  const items: HistoryItem[] = messages
    .filter((m) => m.content.trim())
    .map((m, index) => ({
      id: index + 1,
      type: m.role === 'user' ? MessageType.USER : MessageType.GEMINI,
      text: m.content,
    }));
  context.ui.loadHistory(items, original ?? turn.userPreview);
  coreEvents.emitFeedback(
    'info',
    `Rewound to before: ${turn.userPreview || turn.messageId}` +
      (result?.deletedMessages
        ? ` (${result.deletedMessages} message(s) deleted)`
        : ''),
  );
}

export const rewindCommand: SlashCommand = {
  name: 'rewind',
  description: 'Rewind the conversation to a previous turn (files untouched)',
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

    let turns;
    try {
      turns = await langvisClient.listTurns(conversationId);
    } catch (error) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `Failed to list turns: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
    if (turns.length === 0) {
      context.ui.addItem({
        type: MessageType.INFO,
        text: 'No turns to rewind yet.',
      });
      return;
    }

    return {
      type: 'custom_dialog',
      component: createElement(RewindDialog, {
        turns,
        onRewind: (turn) => rewindAndReplay(context, conversationId, turn),
        onClose: () => context.ui.removeComponent(),
      }),
    };
  },
};
