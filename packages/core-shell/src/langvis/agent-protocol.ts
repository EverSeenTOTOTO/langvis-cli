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
    // run_view / conversation_usage：CLI 是增量消费者，忽略
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
        const out: AgentEvent[] = [
          {
            ...base,
            id: id(),
            type: 'tool_update',
            requestId: ev.callId,
            _meta: { legacyState: { status: 'executing' } },
          },
        ];
        const d =
          typeof ev.data === 'object' && ev.data !== null ? ev.data : undefined;
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
        return [
          { ...base, id: id(), type: 'agent_end', reason: 'completed' },
        ];

      case 'cancelled':
        return [
          { ...base, id: id(), type: 'agent_end', reason: 'aborted' },
        ];

      case 'error':
        return [
          {
            ...base,
            id: id(),
            type: 'error',
            status: 'INTERNAL',
            message: ev.error,
            fatal: true,
          },
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
    throw new Error('langvis: conversation not bound (call setLangvisConversation first)');
  }
  session ??= new LangvisSession(conversationId);
  return session;
}

export class LegacyAgentProtocol implements AgentProtocol {
  constructor(
    _opts?: { config?: unknown; getPreferredEditor?: unknown },
  ) {
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

function summarizeOutput(output: unknown): string {
  if (typeof output === 'string') return output;
  try {
    const s = JSON.stringify(output);
    return s.length > 500 ? `${s.slice(0, 500)}…` : (s ?? '');
  } catch {
    return String(output);
  }
}

function describeArgs(
  name: string,
  args: Record<string, unknown>,
): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return name;
  const first = args[keys[0]];
  const preview =
    typeof first === 'string' ? first : JSON.stringify(first) ?? '';
  return `${name} ${preview}`.slice(0, 120);
}
