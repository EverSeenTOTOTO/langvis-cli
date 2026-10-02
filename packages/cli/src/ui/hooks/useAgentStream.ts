/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  getErrorMessage,
  MessageSenderType,
  debugLogger,
  ApprovalMode,
  getLangvisConversationRecord,
  langvisClient,
  setLangvisConversationRecord,
  geminiPartsToContentParts,
  displayContentToString,
  parseThought,
  CoreToolCallStatus,
  Kind,
  type Config,
  type ThoughtSummary,
  type RetryAttemptPayload,
  type AgentEvent,
  type AgentProtocol,
  type Logger,
  type Part,
  playLangvisAudio,
  langvisBaseUrl,
} from '@google/gemini-cli-core';
import type { PartListUnion } from '@google/genai';
import type {
  HistoryItemWithoutId,
  LoopDetectionConfirmationRequest,
  IndividualToolCallDisplay,
  HistoryItemToolDisplayGroup,
  SlashCommandProcessorResult,
} from '../types.js';
import { isSlashCommand } from '../utils/commandUtils.js';
import { isSubagentProgress } from '@google/gemini-cli-core';
import { StreamingState, MessageType } from '../types.js';
import { findLastSafeSplitPoint } from '../utils/markdownUtilities.js';
import { getToolGroupBorderAppearance } from '../utils/borderStyles.js';
import { type BackgroundTask } from './useExecutionLifecycle.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { useStateAndRef } from './useStateAndRef.js';
import { type MinimalTrackedToolCall } from './useTurnActivityMonitor.js';
import { useKeypress } from './useKeypress.js';

export interface UseAgentStreamOptions {
  agent?: AgentProtocol;
  config?: Config;
  addItem: UseHistoryManagerReturn['addItem'];
  onCancelSubmit: (
    shouldRestorePrompt?: boolean,
    clearBuffer?: boolean,
  ) => void;
  isShellFocused?: boolean;
  logger?: Logger | null;
  handleSlashCommand?: (
    query: string,
  ) => Promise<SlashCommandProcessorResult | false>;
}

/** 后端 elicitation（AskUser）的待答事实——事件整体保留（提交需 _meta.runId）。 */
export interface PendingElicitation {
  event: AgentEvent<'elicitation_request'>;
}

/**
 * useAgentStream implements the interactive agent loop using an AgentProtocol.
 * It is completely agnostic to the specific agent implementation.
 */
export const useAgentStream = ({
  agent,
  config,
  addItem,
  onCancelSubmit,
  isShellFocused,
  logger,
  handleSlashCommand,
}: UseAgentStreamOptions) => {
  const [initError] = useState<string | null>(null);
  const [pendingElicitation, setPendingElicitation] =
    useState<PendingElicitation | null>(null);
  const [retryStatus] = useState<RetryAttemptPayload | null>(null);
  const [streamingState, setStreamingState] = useState<StreamingState>(
    StreamingState.Idle,
  );
  const [thought, setThought] = useState<ThoughtSummary | null>(null);
  const [lastOutputTime, setLastOutputTime] = useState<number>(Date.now());
  const [conversationUsage, setConversationUsage] = useState<{
    used: number;
    total: number;
  } | null>(null);
  const [loopUsage, setLoopUsage] = useState<{
    used: number;
    total: number;
  } | null>(null);

  const currentStreamIdRef = useRef<string | null>(null);
  const userMessageTimestampRef = useRef<number>(0);
  const geminiMessageBufferRef = useRef<string>('');
  // 原生思维链缓冲：一串 reasoning 分片合并成一个 thinking 历史项（正文到达或 flush 时提交）
  const thoughtBufferRef = useRef<string>('');
  const [pendingHistoryItem, pendingHistoryItemRef, setPendingHistoryItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);

  const [trackedTools, , setTrackedTools] = useStateAndRef<
    IndividualToolCallDisplay[]
  >([]);
  const [pushedToolCallIds, pushedToolCallIdsRef, setPushedToolCallIds] =
    useStateAndRef<Set<string>>(new Set());
  const [_isFirstToolInGroup, isFirstToolInGroupRef, setIsFirstToolInGroup] =
    useStateAndRef<boolean>(true);
  const [_hasEmittedBoxInTurn, hasEmittedBoxInTurnRef, setHasEmittedBoxInTurn] =
    useStateAndRef<boolean>(false);

  const { startNewPrompt } = useSessionStats();

  // TODO: Implement dynamic shell-related state derivation from trackedTools or dedicated refs.
  // This includes activePtyId, backgroundTasks, and related visibility states to restore
  // parity with legacy terminal focus detection and background task tracking.
  // Note: Avoid checking ITERM_SESSION_ID for terminal detection and ensure context is sanitized.
  const activePtyId = undefined;
  const backgroundTaskCount = 0;
  const isBackgroundTaskVisible = false;
  const toggleBackgroundTasks = useCallback(() => {}, []);
  const backgroundCurrentExecution = undefined;
  const backgroundTasks = useMemo(() => new Map<number, BackgroundTask>(), []);
  const dismissBackgroundTask = useCallback(async (_pid: number) => {}, []);

  // Use the trackedTools to mock pendingToolCalls for inactivity monitors
  const pendingToolCalls = useMemo(
    (): MinimalTrackedToolCall[] =>
      trackedTools.map((t) => ({
        request: {
          name: t.originalRequestName || t.name,
          args: { command: t.description },
          callId: t.callId,
          isClientInitiated: t.isClientInitiated ?? false,
          prompt_id: '',
        },
        status: t.status,
      })),
    [trackedTools],
  );

  // TODO: Support LoopDetection confirmation requests
  const [loopDetectionConfirmationRequest] =
    useState<LoopDetectionConfirmationRequest | null>(null);

  const flushPendingText = useCallback(() => {
    if (pendingHistoryItemRef.current) {
      addItem(pendingHistoryItemRef.current, userMessageTimestampRef.current);
      setPendingHistoryItem(null);
      geminiMessageBufferRef.current = '';
    }
    thoughtBufferRef.current = '';
  }, [addItem, pendingHistoryItemRef, setPendingHistoryItem]);

  const cancelOngoingRequest = useCallback(
    async (clearBuffer: boolean = true) => {
      if (agent) {
        await agent.abort();
        setStreamingState(StreamingState.Idle);
        onCancelSubmit(false, clearBuffer);
      }
    },
    [agent, onCancelSubmit],
  );

  // langvis：审批档位落 conversation config(approval.mode)，下一 run 生效。
  // PUT 串行化：快速连按时按序落库，最终态=最后一次按键；每次执行时现读 record 做 merge 基底。
  const approvalPutChainRef = useRef<Promise<void>>(Promise.resolve());
  const handleApprovalModeChange = useCallback(
    (newApprovalMode: ApprovalMode) => {
      approvalPutChainRef.current = approvalPutChainRef.current
        .catch(() => {})
        .then(async () => {
          const langvisMode =
            newApprovalMode === ApprovalMode.YOLO
              ? 'yolo'
              : newApprovalMode === ApprovalMode.AUTO_EDIT
                ? 'auto'
                : newApprovalMode === ApprovalMode.DEFAULT
                  ? 'default'
                  : undefined;
          const record = getLangvisConversationRecord();
          if (!langvisMode || !record) return;
          // disableYoloMode/secureMode 加固:UI 入口拦了,写入侧也拦
          if (
            langvisMode === 'yolo' &&
            config?.isYoloModeDisabled() &&
            record.config &&
            (record.config as { approval?: { mode?: string } }).approval
              ?.mode !== 'yolo'
          ) {
            addItem(
              {
                type: MessageType.ERROR,
                text: 'YOLO mode is disabled by settings — cannot enable.',
              },
              Date.now(),
            );
            return;
          }
          const updated = {
            ...record,
            config: {
              ...record.config,
              approval: {
                ...(record.config as { approval?: object } | undefined)
                  ?.approval,
                mode: langvisMode,
              },
            },
          };
          try {
            await langvisClient.updateConversation(updated);
            setLangvisConversationRecord(updated);
          } catch (err) {
            addItem(
              {
                type: MessageType.ERROR,
                text: `Failed to persist approval mode: ${getErrorMessage(err)}`,
              },
              Date.now(),
            );
          }
        });
    },
    [addItem, config],
  );

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      setLastOutputTime(Date.now());
      switch (event.type) {
        case 'agent_start':
          setStreamingState(StreamingState.Responding);
          break;
        case 'agent_end':
          setStreamingState(StreamingState.Idle);
          flushPendingText();
          setPendingElicitation(null);
          break;
        case 'message':
          if (event.role === 'agent') {
            for (const part of event.content) {
              if (part.type === 'text') {
                // 思考项让位：正文到达即提交挂起的 thinking 项（一段思考一个历史项）
                if (pendingHistoryItemRef.current?.type === 'thinking') {
                  addItem(
                    pendingHistoryItemRef.current,
                    userMessageTimestampRef.current,
                  );
                  setPendingHistoryItem(null);
                  thoughtBufferRef.current = '';
                }
                geminiMessageBufferRef.current += part.text;
                // Update pending history item with incremental text
                const splitPoint = findLastSafeSplitPoint(
                  geminiMessageBufferRef.current,
                );
                if (splitPoint === geminiMessageBufferRef.current.length) {
                  setPendingHistoryItem({
                    type: 'gemini',
                    text: geminiMessageBufferRef.current,
                  });
                } else {
                  const before = geminiMessageBufferRef.current.substring(
                    0,
                    splitPoint,
                  );
                  const after =
                    geminiMessageBufferRef.current.substring(splitPoint);
                  addItem(
                    { type: 'gemini', text: before },
                    userMessageTimestampRef.current,
                  );
                  geminiMessageBufferRef.current = after;
                  setPendingHistoryItem({
                    type: 'gemini_content',
                    text: after,
                  });
                }
              } else if (part.type === 'thought') {
                // 原生思维链：分片累计成单项挂起（渲染由 HistoryItemDisplay 的
                // inlineThinkingMode 门控，与 useGeminiStream 语义一致）
                thoughtBufferRef.current += part.thought;
                const parsed = parseThought(thoughtBufferRef.current);
                setThought(parsed);
                setPendingHistoryItem({ type: 'thinking', thought: parsed });
              }
            }
          }
          break;
        case 'tool_request': {
          flushPendingText();
          const legacyState = event._meta?.legacyState;
          const displayName = legacyState?.displayName ?? event.name;
          const isOutputMarkdown = legacyState?.isOutputMarkdown ?? false;
          const desc = legacyState?.description ?? '';

          const fallbackKind = Kind.Other;

          const newCall: IndividualToolCallDisplay = {
            callId: event.requestId,
            name: displayName,
            originalRequestName: event.name,
            description: desc,
            display: event.display,
            status: CoreToolCallStatus.Scheduled,
            isClientInitiated: false,
            renderOutputAsMarkdown: isOutputMarkdown,
            kind: legacyState?.kind ?? fallbackKind,
            confirmationDetails: undefined,
            resultDisplay: undefined,
          };
          setTrackedTools((prev) => [...prev, newCall]);
          break;
        }
        case 'tool_update': {
          setTrackedTools((prev) =>
            prev.map((tc): IndividualToolCallDisplay => {
              if (tc.callId !== event.requestId) return tc;

              const legacyState = event._meta?.legacyState;
              const evtStatus = legacyState?.status;

              let status = tc.status;
              if (evtStatus === 'executing')
                status = CoreToolCallStatus.Executing;
              else if (evtStatus === 'error') status = CoreToolCallStatus.Error;
              else if (evtStatus === 'success')
                status = CoreToolCallStatus.Success;

              const display = event.display?.result;
              // 子代理进度是对象（SubagentProgress），不经字符串化直通 resultDisplay
              const rawSubagent = (
                event._meta as Record<string, unknown> | undefined
              )?.['subagentProgress'];
              const subagent = isSubagentProgress(rawSubagent)
                ? rawSubagent
                : undefined;
              const liveOutput =
                subagent ?? displayContentToString(display) ?? tc.resultDisplay;
              const progressMessage =
                legacyState?.progressMessage ?? tc.progressMessage;
              const progress = legacyState?.progress ?? tc.progress;
              const progressTotal =
                legacyState?.progressTotal ?? tc.progressTotal;
              const ptyId = legacyState?.pid ?? tc.ptyId;
              const description = legacyState?.description ?? tc.description;

              return {
                ...tc,
                status,
                display: event.display
                  ? { ...tc.display, ...event.display }
                  : tc.display,
                resultDisplay: liveOutput,
                progressMessage,
                progress,
                progressTotal,
                ptyId,
                description,
              };
            }),
          );
          break;
        }
        case 'tool_response': {
          setTrackedTools((prev) =>
            prev.map((tc): IndividualToolCallDisplay => {
              if (tc.callId !== event.requestId) return tc;

              const legacyState = event._meta?.legacyState;
              const outputFile = legacyState?.outputFile;
              const display = event.display?.result;
              const resultDisplay =
                displayContentToString(display) ?? tc.resultDisplay;

              return {
                ...tc,
                status: event.isError
                  ? CoreToolCallStatus.Error
                  : CoreToolCallStatus.Success,
                display: event.display
                  ? { ...tc.display, ...event.display }
                  : tc.display,
                resultDisplay,
                outputFile,
              };
            }),
          );
          break;
        }

        case 'error': {
          const message =
            event._meta?.['code'] === 'AGENT_EXECUTION_BLOCKED'
              ? `Agent execution blocked: ${event.message}`
              : event.message;
          addItem(
            { type: MessageType.ERROR, text: message },
            userMessageTimestampRef.current,
          );
          break;
        }

        case 'elicitation_request':
          setPendingElicitation({ event });
          break;
        case 'custom':
          if (
            event.kind === 'conversation_usage' &&
            typeof event.data?.['used'] === 'number' &&
            typeof event.data?.['total'] === 'number'
          ) {
            setConversationUsage({
              used: event.data['used'],
              total: event.data['total'],
            });
          }
          // langvis TTS：PTY 宿主场景打可点击链接，本地手跑走系统播放器
          if (event.kind === 'audio') {
            const data = event.data as
              | { filePath?: unknown; hosted?: unknown }
              | undefined;
            if (typeof data?.filePath === 'string') {
              if (data.hosted === true) {
                const base = langvisBaseUrl().replace(/\/+$/, '');
                const path = data.filePath.replace(/^\/+/, '');
                const url = `${base}/upload/${path}`;
                addItem(
                  {
                    type: MessageType.INFO,
                    text: `\u001b]8;;${url}\u001b\\🔊 播放语音\u001b]8;;\u001b\\ ${url}`,
                  },
                  Date.now(),
                );
              } else {
                void playLangvisAudio(data.filePath).catch((e: unknown) =>
                  debugLogger.warn('langvis audio playback failed', e),
                );
              }
            }
          }
          break;
        case 'usage':
          setLoopUsage({
            used: event.inputTokens ?? 0,
            total: event.outputTokens ?? 0,
          });
          break;
        case 'initialize':
        case 'session_update':
        case 'elicitation_response':
          // These events are currently not handled in the UI
          break;

        default:
          debugLogger.error('Unknown agent event type:', event);
          event satisfies never;
          break;
      }
    },
    [
      addItem,
      flushPendingText,
      pendingHistoryItemRef,
      setPendingHistoryItem,
      setTrackedTools,
      setStreamingState,
      setThought,
      setLastOutputTime,
    ],
  );

  useEffect(() => {
    const unsubscribe = agent?.subscribe(handleEvent);
    return () => unsubscribe?.();
  }, [agent, handleEvent]);

  useKeypress(
    (key) => {
      if (key.name === 'escape' && !isShellFocused) {
        void cancelOngoingRequest(false);
        return true;
      }
      return false;
    },
    {
      isActive:
        streamingState === StreamingState.Responding ||
        streamingState === StreamingState.WaitingForConfirmation,
    },
  );

  const submitQuery = useCallback(
    async (
      query: Part[] | string,
      options?: { isContinuation: boolean },
      _prompt_id?: string,
    ) => {
      if (!agent) return;

      // Slash commands are handled before anything is sent to the agent.
      if (!options?.isContinuation && typeof query === 'string') {
        const trimmed = query.trim();
        if (isSlashCommand(trimmed) && handleSlashCommand) {
          const result = await handleSlashCommand(trimmed);
          if (result) {
            if (result.type === 'submit_prompt') {
              const c: PartListUnion = result.content;
              const next: Part[] | string =
                typeof c === 'string'
                  ? c
                  : [c]
                      .flat()
                      .filter(
                        (p): p is Part => typeof p === 'object' && p !== null,
                      );
              return submitQuery(next, options);
            }
            // 'handled' / 'schedule_tool'（客户端工具调度不适用于后端执行模型）
            return;
          }
          // 未识别命令：run 进行中不允许排队——直接报错；空闲时原样发送
          // （路径类输入如 /home/user/file.txt 走模型解读，与 legacy 一致）
          if (streamingState !== StreamingState.Idle) {
            addItem(
              {
                type: MessageType.ERROR,
                text: `${trimmed} is not a command, and input can't be queued while a run is active. Wait for the turn to finish (Esc to cancel) or rephrase.`,
              },
              Date.now(),
            );
            return;
          }
        }
      }

      const timestamp = Date.now();
      setLastOutputTime(timestamp);
      userMessageTimestampRef.current = timestamp;

      geminiMessageBufferRef.current = '';

      if (!options?.isContinuation) {
        if (typeof query === 'string') {
          addItem({ type: MessageType.USER, text: query }, timestamp);
          void logger?.logMessage(MessageSenderType.USER, query);
        }
        startNewPrompt();
      }

      const parts = geminiPartsToContentParts(
        typeof query === 'string' ? [{ text: query }] : query,
      );

      try {
        const { streamId } = await agent.send({
          message: { content: parts },
        });
        currentStreamIdRef.current = streamId;
      } catch (err) {
        addItem(
          { type: MessageType.ERROR, text: getErrorMessage(err) },
          timestamp,
        );
      }
    },
    [
      agent,
      addItem,
      logger,
      startNewPrompt,
      handleSlashCommand,
      streamingState,
    ],
  );

  useEffect(() => {
    if (trackedTools.length > 0) {
      const isNewBatch = !trackedTools.some((tc) =>
        pushedToolCallIdsRef.current.has(tc.callId),
      );
      if (isNewBatch) {
        setPushedToolCallIds(new Set());
        setIsFirstToolInGroup(true);
      }
    } else if (streamingState === StreamingState.Idle) {
      setPushedToolCallIds(new Set());
      setIsFirstToolInGroup(true);
    }
  }, [
    trackedTools,
    pushedToolCallIdsRef,
    setPushedToolCallIds,
    setIsFirstToolInGroup,
    streamingState,
  ]);

  // Push completed tools to history
  useEffect(() => {
    if (trackedTools.length === 0) return;

    // We only push to history once all currently known tools in the turn are terminal.
    // This allows ToolGroupDisplay to correctly hoist ALL notices (topics) for the turn.
    const allTerminal = trackedTools.every(
      (tc) =>
        tc.status === 'success' ||
        tc.status === 'error' ||
        tc.status === 'cancelled',
    );

    const toolsToPush = trackedTools.filter(
      (tc) => !pushedToolCallIdsRef.current.has(tc.callId),
    );

    if (allTerminal && toolsToPush.length > 0) {
      const newPushed = new Set(pushedToolCallIdsRef.current);
      for (const tc of toolsToPush) {
        newPushed.add(tc.callId);
      }

      const appearance = getToolGroupBorderAppearance(
        { type: 'tool_group', tools: trackedTools },
        activePtyId,
        !!isShellFocused,
        [],
        backgroundTasks,
      );

      const hasBoxInBatch = toolsToPush.some(
        (tc) => tc.display?.format !== 'notice',
      );
      const shouldStartNewBlock =
        isFirstToolInGroupRef.current ||
        (!hasEmittedBoxInTurnRef.current && hasBoxInBatch);

      const historyItem: HistoryItemToolDisplayGroup = {
        type: 'tool_display_group',
        tools: toolsToPush.map((tc) => ({
          name: tc.name,
          description: tc.description,
          ...tc.display,
          status: tc.status,
          originalRequestName: tc.originalRequestName,
        })),
        borderTop: shouldStartNewBlock,
        borderBottom: true,
        ...appearance,
      };

      addItem(historyItem);
      setPushedToolCallIds(newPushed);

      if (hasBoxInBatch) {
        setHasEmittedBoxInTurn(true);
      }
      setIsFirstToolInGroup(false);
    }
  }, [
    trackedTools,
    pushedToolCallIdsRef,
    isFirstToolInGroupRef,
    hasEmittedBoxInTurnRef,
    setPushedToolCallIds,
    setIsFirstToolInGroup,
    setHasEmittedBoxInTurn,
    addItem,
    activePtyId,
    isShellFocused,
    backgroundTasks,
  ]);

  const pendingToolGroupItems = useMemo((): HistoryItemWithoutId[] => {
    const remainingTools = trackedTools.filter(
      (tc) => !pushedToolCallIdsRef.current.has(tc.callId),
    );

    const items: HistoryItemWithoutId[] = [];

    const appearance = getToolGroupBorderAppearance(
      { type: 'tool_group', tools: trackedTools },
      activePtyId,
      !!isShellFocused,
      [],
      backgroundTasks,
    );

    if (remainingTools.length > 0) {
      const hasBoxInPending = remainingTools.some(
        (tc) => tc.display?.format !== 'notice',
      );
      const shouldStartNewBlock =
        pushedToolCallIds.size === 0 ||
        (!hasEmittedBoxInTurnRef.current && hasBoxInPending);

      items.push({
        type: 'tool_display_group',
        tools: remainingTools.map((tc) => ({
          name: tc.name,
          description: tc.description,
          ...tc.display,
          status: tc.status,
          originalRequestName: tc.originalRequestName,
        })),
        borderTop: shouldStartNewBlock,
        borderBottom: false,
        ...appearance,
      });
    }

    const allTerminal =
      trackedTools.length > 0 &&
      trackedTools.every(
        (tc) =>
          tc.status === 'success' ||
          tc.status === 'error' ||
          tc.status === 'cancelled',
      );

    const allPushed =
      trackedTools.length > 0 &&
      trackedTools.every((tc) => pushedToolCallIds.has(tc.callId));

    const anyVisibleInHistory = pushedToolCallIds.size > 0;
    const anyVisibleInPending = remainingTools.length > 0;

    if (
      trackedTools.length > 0 &&
      !(allTerminal && allPushed) &&
      (anyVisibleInHistory || anyVisibleInPending)
    ) {
      items.push({
        type: 'tool_display_group',
        tools: [],
        borderTop: false,
        borderBottom: true,
        ...appearance,
      });
    }

    return items;
  }, [
    trackedTools,
    pushedToolCallIds,
    pushedToolCallIdsRef,
    hasEmittedBoxInTurnRef,
    activePtyId,
    isShellFocused,
    backgroundTasks,
  ]);

  const pendingHistoryItems = useMemo(
    () =>
      [pendingHistoryItem, ...pendingToolGroupItems].filter(
        (i): i is HistoryItemWithoutId => i !== undefined && i !== null,
      ),
    [pendingHistoryItem, pendingToolGroupItems],
  );

  const submitElicitation = useCallback(
    (content: Record<string, unknown>) => {
      if (!pendingElicitation || !agent) return;
      const e = pendingElicitation.event;
      setPendingElicitation(null);
      void agent
        .send({
          elicitations: [
            {
              requestId: e.requestId,
              action: 'accept',
              content,
              _meta: e._meta,
            },
          ],
        })
        .catch((err: unknown) => {
          addItem(
            {
              type: MessageType.ERROR,
              text: `Failed to submit answer: ${getErrorMessage(err)}`,
            },
            Date.now(),
          );
        });
    },
    [agent, addItem, pendingElicitation],
  );

  const cancelElicitation = useCallback(() => {
    if (!pendingElicitation || !agent) return;
    const e = pendingElicitation.event;
    setPendingElicitation(null);
    void agent
      .send({
        elicitations: [
          {
            requestId: e.requestId,
            action: 'cancel',
            content: {},
            _meta: e._meta,
          },
        ],
      })
      .catch(() => {
        // 取消失败不打扰——后端超时自兜底
      });
  }, [agent, pendingElicitation]);

  return {
    streamingState,
    submitQuery,
    pendingElicitation,
    submitElicitation,
    cancelElicitation,
    conversationUsage,
    loopUsage,
    initError,
    pendingHistoryItems,
    thought,
    cancelOngoingRequest,
    pendingToolCalls,
    handleApprovalModeChange,
    activePtyId,
    loopDetectionConfirmationRequest,
    lastOutputTime,
    backgroundTaskCount,
    isBackgroundTaskVisible,
    toggleBackgroundTasks,
    backgroundCurrentExecution,
    backgroundTasks,
    retryStatus,
    dismissBackgroundTask,
  };
};
