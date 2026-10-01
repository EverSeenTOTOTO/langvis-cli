/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { MessageType, type HistoryItemWithoutId } from '../types.js';
import {
  coreEvents,
  langvisClient,
  setLangvisConversation,
  setLangvisConversationRecord,
} from '@google/gemini-cli-core';
import type {
  HistoryTurn,
  Config,
  ResumedSessionData,
} from '@google/gemini-cli-core';
import {
  convertSessionToHistoryFormats,
  type SessionInfo,
} from '../../utils/sessionUtils.js';

export { convertSessionToHistoryFormats };

import type { Part } from '@google/genai';

export const useSessionBrowser = (
  config: Config,
  onLoadHistory: (
    uiHistory: HistoryItemWithoutId[],
    clientHistory: Array<
      { role: 'user' | 'model'; parts: Part[] } | HistoryTurn
    >,
    resumedSessionData: ResumedSessionData,
  ) => Promise<void>,
) => {
  const [isSessionBrowserOpen, setIsSessionBrowserOpen] = useState(false);

  return {
    isSessionBrowserOpen,

    openSessionBrowser: useCallback(() => {
      setIsSessionBrowserOpen(true);
    }, []),

    closeSessionBrowser: useCallback(() => {
      setIsSessionBrowserOpen(false);
    }, []),

    /**
     * Loads a conversation by ID, and reinitializes the chat recording service with it.
     */
    handleResumeSession: useCallback(
      async (session: SessionInfo) => {
        if (session.isCurrentSession) {
          coreEvents.emitFeedback(
            'info',
            'Already in this session (CLI auto-resumes the latest on start).',
          );
          setIsSessionBrowserOpen(false);
          return;
        }
        try {
          // langvis：会话在后端——重绑 conversation + 拉取消息重放 UI 历史。
          const [conversationRecord, { messages }] = await Promise.all([
            langvisClient.getConversation(session.id),
            langvisClient.getMessages(session.id),
          ]);
          setLangvisConversation(session.id);
          setLangvisConversationRecord(conversationRecord);
          config.setSessionId(session.id);

          const uiHistory: HistoryItemWithoutId[] = messages
            .filter((m) => m.content.trim().length > 0)
            .map((m) => ({
              type:
                m.role === 'user' ? MessageType.USER : MessageType.GEMINI,
              text: m.content,
            }));

          const resumedSessionData = {
            conversation: {
              sessionId: session.id,
              messages: [],
            },
            filePath: session.id,
          };

          setIsSessionBrowserOpen(false);
          await onLoadHistory(
            uiHistory,
            [],
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            resumedSessionData as unknown as ResumedSessionData,
          );
        } catch (error) {
          coreEvents.emitFeedback('error', 'Error resuming session:', error);
          setIsSessionBrowserOpen(false);
        }
      },
      [config, onLoadHistory],
    ),

    /**
     * Deletes a session by ID using the ChatRecordingService.
     */
    handleDeleteSession: useCallback(
      async (session: SessionInfo) => {
        try {
          await langvisClient.deleteConversation(session.id);
        } catch (error) {
          coreEvents.emitFeedback('error', 'Error deleting session:', error);
          throw error;
        }
      },
      [],
    ),
  };
};
