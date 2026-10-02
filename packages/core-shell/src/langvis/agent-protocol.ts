/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// langvis 的 AgentProtocol 实现：SSE run_events 增量 → AgentEvent 翻译。
// 导出名 LegacyAgentProtocol（AppContainer.tsx 以此名消费，零改动）。

import { randomUUID } from 'node:crypto';
import { debugLogger } from '../utils/debugLogger.js';
import type {
  AgentEvent,
  AgentProtocol,
  AgentSend,
  Unsubscribe,
} from '../agent/types.js';
import { LangvisClient } from './client.js';
import { getLangvisConversationRecord } from './models.js';
import { LangvisSSE } from './sse.js';
import type { EnrichedEvent, StreamFrame } from './types.js';

export const langvisClient = new LangvisClient();

// ─── conversation 绑定（装配层在登录后设置） ───

let conversationId: string | undefined;

export function setLangvisConversation(id: string): void {
  if (conversationId === id) return;
  conversationId = id;
  session?.dispose();
  session = undefined;
}

export function getLangvisConversationId(): string | undefined {
  return conversationId;
}

// ─── 会话：单 conversation 的 SSE 长连 + 事件分发 ───

type Listener = (event: AgentEvent) => void;

class LangvisSession {
  private readonly listeners = new Set<Listener>();
  private readonly trajectory: AgentEvent[] = [];
  private sse: LangvisSSE | undefined;
  private eventSeq = 0;
  private disposed = false;
  private readyPromise: Promise<void> | undefined;
  // response_user 不作为工具展示（正文已由 text_chunk 流出）——按 callId 静默其全部事件
  private readonly silencedCalls = new Set<string>();
  // bash 流式输出的尾部窗口（callId → 最近输出），tool_update 经 progressMessage 喂 UI
  private readonly liveOutput = new Map<string, string>();
  private readonly announcedChildren = new Set<string>();
  private subagentParent: string | undefined;
  // 子 agent 聚合：childRunId → {parentCallId, brief, activities[], state, result}
  // 展示走虚拟 callId（父#child）+ _meta.subagentProgress 对象（SubagentGroupDisplay 现成渲染）
  private readonly children = new Map<
    string,
    {
      parentCallId: string;
      brief: string;
      activities: Array<{
        id: string;
        type: 'thought' | 'tool_call';
        content: string;
        displayName?: string;
        status: string;
      }>;
      state?: 'running' | 'completed' | 'error' | 'cancelled';
      result?: string;
    }
  >();

  constructor(private readonly conversationId: string) {}

  /** 幂等启动；connected 帧到达即 resolve。 */
  ensureStarted(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    const p = new Promise<void>((resolve, reject) => {
      if (!this.conversationId) {
        reject(new Error('langvis: conversation not bound'));
        return;
      }
      let opened = false;
      this.sse = new LangvisSSE(langvisClient, this.conversationId, {
        onOpen: () => {
          if (opened) return; // 重连不再重复 initialize
          opened = true;
          this.emit({
            id: this.nextId(),
            streamId: 'session',
            timestamp: new Date().toISOString(),
            type: 'initialize',
            sessionId: this.conversationId,
            workspace: process.cwd(),
            agentId: 'langvis',
          });
          resolve();
        },
        onFrame: (frame) => this.handleFrame(frame),
        onClose: (err) => {
          if (!opened) {
            reject(err ?? new Error('langvis sse closed before connect'));
            return;
          }
          if (this.disposed) return;
          this.emit({
            id: this.nextId(),
            streamId: 'session',
            timestamp: new Date().toISOString(),
            type: 'error',
            status: 'UNAVAILABLE',
            message: `langvis stream lost: ${err?.message ?? 'closed'} (auto-reconnecting)`,
            fatal: false,
          });
        },
      });
      this.sse.start();
    });
    // 防 unhandled rejection：订阅早于 send 的场景下 readyPromise 可能无人 await
    p.catch(() => {});
    this.readyPromise = p;
    return p;
  }

  subscribe(cb: Listener): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  get events(): readonly AgentEvent[] {
    return this.trajectory;
  }

  async send(payload: AgentSend): Promise<{ streamId: string | null }> {
    await this.ensureStarted();
    if (payload.elicitations) {
      // AskUser 回复：requestId 是 callId，runId 在 _meta 里
      for (const e of payload.elicitations) {
        const meta =
          typeof e._meta === 'object' && e._meta !== null
            ? e._meta
            : typeof payload._meta === 'object' && payload._meta !== null
              ? payload._meta
              : undefined;
        const runId = (meta as { runId?: unknown } | undefined)?.['runId'];
        if (typeof runId !== 'string') {
          debugLogger.warn('elicitation missing runId', e.requestId);
          continue;
        }
        await langvisClient.submitHumanInput(
          runId,
          e.action === 'accept' ? e.content : {},
        );
      }
      return { streamId: null };
    }
    if (payload.message) {
      const text = payload.message.content
        .filter((p) => p.type === 'text')
        .map((p) => (p as { text: string }).text)
        .join('\n');
      const { messageId } = await langvisClient.startChat(
        this.conversationId,
        text,
      );
      this.maybeRenameConversation(text);
      return { streamId: messageId };
    }
    if (payload.action) {
      debugLogger.warn('langvis action send not supported', payload.action);
      return { streamId: null };
    }
    // update（模型/配置切换）暂不下发——Phase 2 接 config 端点
    return { streamId: null };
  }

  async abort(): Promise<void> {
    await langvisClient.cancel(this.conversationId);
  }

  /** 占位名会话在首条消息后改为消息摘要（fire-and-forget，失败静默）。 */
  private maybeRenameConversation(text: string): void {
    const conversation = getLangvisConversationRecord();
    if (!conversation || conversation.name !== 'New chat') return;
    const name = text.trim().slice(0, 50) || 'New chat';
    conversation.name = name;
    void langvisClient
      .updateConversation(conversation)
      .catch((e: unknown) =>
        debugLogger.warn('failed renaming conversation', e),
      );
  }

  dispose(): void {
    this.disposed = true;
    this.sse?.stop();
    this.listeners.clear();
  }

  // ─── 帧翻译 ───

  private handleFrame(frame: StreamFrame): void {
    if (frame.type === 'run_events') {
      for (const ev of frame.events) {
        for (const agentEvent of this.translate(ev, frame.messageId)) {
          this.emit(agentEvent);
        }
      }
      return;
    }
    if (frame.type === 'loop_usage') {
      this.emit({
        id: this.nextId(),
        streamId: frame.runId,
        timestamp: new Date().toISOString(),
        type: 'usage',
        model: 'langvis',
        inputTokens: frame.used,
        outputTokens: frame.total,
      });
    }
    if (frame.type === 'conversation_usage') {
      // 会话级上下文用量——custom 事件下发（used/total，UI 状态栏消费）
      this.emit({
        id: this.nextId(),
        streamId: 'session',
        timestamp: new Date().toISOString(),
        type: 'custom',
        kind: 'conversation_usage',
        data: { used: frame.used, total: frame.total },
      });
    }
    if (frame.type === 'queued') {
      // steering：活跃 run 期间到达的消息已持久化排队——UI 加 queued 条目
      this.emit({
        id: this.nextId(),
        streamId: 'session',
        timestamp: new Date().toISOString(),
        type: 'custom',
        kind: 'queued',
        data: { content: frame.content },
      });
    }
    // run_view：CLI 是增量消费者，忽略
  }

  private translate(ev: EnrichedEvent, streamId: string): AgentEvent[] {
    const ts = new Date(ev.at).toISOString();
    const base = { streamId, timestamp: ts };
    const id = () => this.nextId();

    switch (ev.type) {
      case 'start':
        return [{ ...base, id: id(), type: 'agent_start' }];

      case 'text_chunk':
        return [
          {
            ...base,
            id: id(),
            type: 'message',
            role: 'agent',
            content: [{ type: 'text', text: ev.content }],
          },
        ];

      case 'thought':
        return [
          {
            ...base,
            id: id(),
            type: 'message',
            role: 'agent',
            content: [{ type: 'thought', thought: ev.content }],
          },
        ];

      case 'tool_call':
        if (ev.toolName === 'response_user') {
          this.silencedCalls.add(ev.callId);
          return [];
        }
        if (ev.toolName === 'call_subagents') {
          // 父调用静默——展示由子代理虚拟 callId 承载（childEvents）
          this.silencedCalls.add(ev.callId);
          this.subagentParent = ev.callId;
          return [];
        }
        return [
          {
            ...base,
            id: id(),
            type: 'tool_request',
            requestId: ev.callId,
            name: ev.toolName,
            args: ev.toolArgs,
            display: { name: ev.toolName },
            _meta: {
              legacyState: {
                displayName: ev.toolName,
                description: describeArgs(ev.toolName, ev.toolArgs),
                kind: inferKindFromToolName(ev.toolName),
              },
            },
          },
        ];

      case 'tool_progress': {
        if (this.silencedCalls.has(ev.callId)) return [];
        const d: Record<string, unknown> | undefined =
          typeof ev.data === 'object' && ev.data !== null
            ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              (ev.data as Record<string, unknown>)
            : undefined;
        // bash 流式输出：{type:'stdout'|'stderr', text} → progressMessage（尾部窗口）
        const streamType = strOf(d?.['type']);
        const streamText = strOf(d?.['text']);
        if (
          (streamType === 'stdout' || streamType === 'stderr') &&
          streamText !== undefined
        ) {
          const text = streamText;
          const prev = this.liveOutput.get(ev.callId) ?? '';
          const merged = (prev + text).slice(-240);
          this.liveOutput.set(ev.callId, merged);
          const lastLine = merged.split('\n').filter(Boolean).pop() ?? merged;
          return [
            {
              ...base,
              id: id(),
              type: 'tool_update',
              requestId: ev.callId,
              _meta: {
                legacyState: {
                  status: 'executing',
                  progressMessage: lastLine,
                },
              },
            },
          ];
        }
        // 子代理负载：启动通报 {childRunId, brief, query} / 事件转发 {childRunId, event}
        const childRunId = (d as { childRunId?: unknown } | undefined)?.[
          'childRunId'
        ];
        if (typeof childRunId === 'string' && this.subagentParent) {
          const forwarded = (d as { event?: unknown } | undefined)?.['event'];
          const child = this.children.get(childRunId);
          const brief = strOf(d?.['brief']);
          if (!child && brief !== undefined) {
            this.children.set(childRunId, {
              parentCallId: this.subagentParent,
              brief: brief.slice(0, 60),
              activities: [],
            });
            return this.childEvents(childRunId, base);
          }
          if (child && forwarded && typeof forwarded === 'object') {
            const fe = forwarded as {
              type?: string;
              content?: string;
              toolName?: string;
              callId?: string;
              toolArgs?: Record<string, unknown>;
              output?: unknown;
              error?: string;
            };
            if (fe.type === 'thought' && typeof fe.content === 'string') {
              child.activities.push({
                id: `${childRunId}:t${child.activities.length}`,
                type: 'thought',
                content: fe.content.slice(0, 160),
                status: 'running',
              });
            } else if (
              fe.type === 'tool_call' &&
              typeof fe.toolName === 'string'
            ) {
              child.activities.push({
                id: fe.callId ?? `${childRunId}:c${child.activities.length}`,
                type: 'tool_call',
                content: JSON.stringify(fe.toolArgs ?? {}).slice(0, 160),
                displayName: fe.toolName,
                status: 'running',
              });
            } else if (
              (fe.type === 'tool_result' || fe.type === 'tool_error') &&
              typeof fe.callId === 'string'
            ) {
              const act = child.activities.find((a) => a.id === fe.callId);
              if (act)
                act.status = fe.type === 'tool_error' ? 'error' : 'completed';
            } else if (
              fe.type === 'text_chunk' &&
              typeof fe.content === 'string'
            ) {
              child.result = (child.result ?? '') + fe.content;
            } else if (fe.type === 'final') {
              child.state = 'completed';
            } else if (fe.type === 'cancelled') {
              child.state = 'cancelled';
            } else if (fe.type === 'error') {
              child.state = 'error';
              child.result = fe.error ?? child.result;
            }
            return this.childEvents(childRunId, base);
          }
          if (child) return this.childEvents(childRunId, base);
          return [];
        }

        const out: AgentEvent[] = [
          {
            ...base,
            id: id(),
            type: 'tool_update',
            requestId: ev.callId,
            _meta: { legacyState: { status: 'executing' } },
          },
        ];
        const status = (d as { status?: unknown } | undefined)?.['status'];
        const message = (d as { message?: unknown } | undefined)?.['message'];
        const schema = (d as { schema?: unknown } | undefined)?.['schema'];
        const schemaRecord =
          typeof schema === 'object' && schema !== null
            ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              (schema as Record<string, unknown>)
            : undefined;
        if (status === 'awaiting_input' && typeof message === 'string') {
          out.push({
            ...base,
            id: id(),
            type: 'elicitation_request',
            display: 'inline',
            requestId: ev.callId,
            message,
            requestedSchema: schemaRecord ?? { type: 'object' },
            _meta: { runId: ev.runId },
          });
        }
        return out;
      }

      case 'tool_result':
        if (ev.toolName === 'call_subagents') {
          this.subagentParent = undefined;
          return [];
        }
        if (ev.toolName === 'file_edit') {
          // diff 渲染：observation 带 old/new → DisplayDiff（渲染器现成）
          const o = asRecordish(ev.output);
          const path = typeof o?.['path'] === 'string' ? o['path'] : undefined;
          const before =
            typeof o?.['oldString'] === 'string' ? o['oldString'] : undefined;
          const after =
            typeof o?.['newString'] === 'string' ? o['newString'] : undefined;
          if (path && before !== undefined && after !== undefined) {
            return [
              {
                ...base,
                id: id(),
                type: 'tool_response',
                requestId: ev.callId,
                name: ev.toolName,
                content: [{ type: 'text', text: `edited ${path}` }],
                display: {
                  name: ev.toolName,
                  result: {
                    type: 'diff',
                    path,
                    beforeText: before,
                    afterText: after,
                  },
                },
              },
            ];
          }
        }
        if (
          ev.toolName === 'response_user' ||
          this.silencedCalls.has(ev.callId)
        ) {
          return [];
        }
        return [
          {
            ...base,
            id: id(),
            type: 'tool_response',
            requestId: ev.callId,
            name: ev.toolName,
            content: [{ type: 'text', text: summarizeOutput(ev.output) }],
            display: { resultSummary: summarizeOutput(ev.output) },
          },
        ];

      case 'tool_error':
        if (
          ev.toolName === 'response_user' ||
          this.silencedCalls.has(ev.callId)
        ) {
          return [];
        }
        return [
          {
            ...base,
            id: id(),
            type: 'tool_response',
            requestId: ev.callId,
            name: ev.toolName,
            isError: true,
            content: [{ type: 'text', text: ev.error }],
            display: { resultSummary: ev.error },
          },
        ];

      case 'final':
        return [{ ...base, id: id(), type: 'agent_end', reason: 'completed' }];

      case 'cancelled':
        return [{ ...base, id: id(), type: 'agent_end', reason: 'aborted' }];

      case 'error':
        // error 即终态（后端 fail 后不补发 final）——必须跟 agent_end，
        // 否则 UI 的 streamingState 吊死在 Thinking
        return [
          {
            ...base,
            id: id(),
            type: 'error',
            status: rpcStatusOf(ev.code),
            message: ev.error,
            fatal: true,
          },
          { ...base, id: id(), type: 'agent_end', reason: 'failed' },
        ];

      case 'audio':
        return [
          {
            ...base,
            id: id(),
            type: 'custom',
            kind: 'audio',
            data: { filePath: ev.filePath, voice: ev.voice },
          },
        ];

      case 'hook':
        return [
          {
            ...base,
            id: id(),
            type: 'custom',
            kind: 'hook',
            data: { hookId: ev.hookId, summary: ev.summary, data: ev.data },
          },
        ];

      default:
        return [];
    }
  }

  private nextId(): string {
    this.eventSeq += 1;
    return randomUUID();
  }

  /** 子代理进度 → 虚拟 callId 的 tool_request/tool_update（resultDisplay=SubagentProgress 对象）。 */
  private childEvents(
    childRunId: string,
    base: { streamId: string; timestamp: string },
  ): AgentEvent[] {
    const child = this.children.get(childRunId);
    if (!child) return [];
    const id = () => this.nextId();
    const callId = `${child.parentCallId}#${childRunId}`;
    const out: AgentEvent[] = [];
    if (!this.announcedChildren.has(callId)) {
      this.announcedChildren.add(callId);
      out.push({
        ...base,
        id: id(),
        type: 'tool_request',
        requestId: callId,
        name: 'subagent',
        args: { brief: child.brief },
        display: { name: child.brief },
        _meta: {
          legacyState: { displayName: child.brief, kind: Kind.Agent },
        },
      });
    }
    out.push({
      ...base,
      id: id(),
      type: 'tool_update',
      requestId: callId,
      _meta: {
        subagentProgress: {
          isSubagentProgress: true,
          agentName: child.brief,
          recentActivity: child.activities.slice(-8),
          state: child.state ?? 'running',
          ...(child.result !== undefined ? { result: child.result } : {}),
        },
        legacyState: {
          status:
            child.state === 'completed' || child.state === 'cancelled'
              ? 'success'
              : child.state === 'error'
                ? 'error'
                : 'executing',
        },
      },
    });
    return out;
  }

  private emit(event: AgentEvent): void {
    this.trajectory.push(event);
    for (const cb of this.listeners) {
      try {
        cb(event);
      } catch (e) {
        debugLogger.warn('agent event listener threw', e);
      }
    }
  }
}

// ─── UI 消费的协议壳（AppContainer 每次 mount new 一个，全部委托会话单例） ───

let session: LangvisSession | undefined;

function getSession(): LangvisSession {
  if (!conversationId) {
    throw new Error(
      'langvis: conversation not bound (call setLangvisConversation first)',
    );
  }
  session ??= new LangvisSession(conversationId);
  return session;
}

export class LegacyAgentProtocol implements AgentProtocol {
  constructor(_opts?: { config?: unknown; getPreferredEditor?: unknown }) {
    void _opts;
  }

  send(payload: AgentSend): Promise<{ streamId: string | null }> {
    return getSession().send(payload);
  }

  subscribe(callback: (event: AgentEvent) => void): Unsubscribe {
    return getSession().subscribe(callback);
  }

  abort(): Promise<void> {
    return getSession().abort();
  }

  get events(): readonly AgentEvent[] {
    return getSession().events;
  }
}

// ─── 工具类别推断（不污染上游 tools.ts 的 merge 面） ───

import { Kind } from '../tools/tools.js';

function inferKindFromToolName(name: string): Kind {
  const n = name.toLowerCase();
  if (/read|view|get|list|search|grep|find|glob/.test(n)) return Kind.Read;
  if (/edit|write|patch|apply/.test(n)) return Kind.Edit;
  if (/delete|remove/.test(n)) return Kind.Delete;
  if (/move|rename/.test(n)) return Kind.Move;
  if (/bash|shell|exec|run|spawn/.test(n)) return Kind.Execute;
  if (/agent|subagent|delegate/.test(n)) return Kind.Agent;
  if (/fetch|http|web|request/.test(n)) return Kind.Fetch;
  if (/ask|confirm|dialog|user/.test(n)) return Kind.Communicate;
  if (/think|plan/.test(n)) return Kind.Think;
  return Kind.Other;
}

// ─── 工具输出摘要 ───

/** 后端 RunErrorCode → AgentEvent error.status（rpc 风格，UI 据此映射文案/重试提示）。 */
function rpcStatusOf(code: string | undefined): string {
  switch (code) {
    case 'rate_limited':
      return 'RESOURCE_EXHAUSTED';
    case 'auth':
      return 'UNAUTHENTICATED';
    case 'provider':
    case 'timeout':
      return 'UNAVAILABLE';
    case 'context_overflow':
      return 'OUT_OF_RANGE';
    case 'parse':
      return 'INVALID_ARGUMENT';
    default:
      return 'INTERNAL';
  }
}

function summarizeOutput(output: unknown): string {
  if (typeof output === 'string') return output;
  try {
    const s = JSON.stringify(output);
    return s.length > 500 ? `${s.slice(0, 500)}…` : (s ?? '');
  } catch {
    return String(output);
  }
}

function asRecordish(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null
    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      (v as Record<string, unknown>)
    : undefined;
}

function strOf(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function describeArgs(name: string, args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return name;
  const first = args[keys[0]];
  const preview =
    typeof first === 'string' ? first : (JSON.stringify(first) ?? '');
  return `${name} ${preview}`.slice(0, 120);
}
