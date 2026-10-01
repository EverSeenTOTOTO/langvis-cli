/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// langvis SSE 流读取——fetch 流 + \n\n 分帧 + data: 行解析 + 心跳容忍。
// 移植自 langvis 主仓 SSEClientTransport.connectFetch（Node 无 EventSource）。

import { debugLogger } from '../utils/debugLogger.js';
import type { LangvisClient } from './client.js';
import type { StreamFrame } from './types.js';

export interface LangvisSSEHandlers {
  onFrame: (frame: StreamFrame) => void;
  /** 建连成功（收到 connected）。 */
  onOpen: () => void;
  /** 流断开（网络错误/服务端关闭）。 */
  onClose: (err?: Error) => void;
}

const CONNECT_TIMEOUT_MS = 30_000;
const RECONNECT_DELAY_MS = 5_000;

/** 单 conversation 的长连 SSE。 断线自动指数重连（5s→60s 封顶），重连后由服务端补发滞留增量。 */
export class LangvisSSE {
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  private closed = false;
  private reconnectAttempt = 0;

  constructor(
    private readonly client: LangvisClient,
    private readonly conversationId: string,
    private readonly handlers: LangvisSSEHandlers,
  ) {}

  get isClosed(): boolean {
    return this.closed;
  }

  start(): void {
    void this.connect();
  }

  /** 主动关闭，不再重连。 */
  stop(): void {
    this.closed = true;
    this.reader?.cancel().catch(() => {});
    this.reader = undefined;
  }

  private async connect(): Promise<void> {
    if (this.closed) return;
    try {
      // 超时只约束连接建立：拿到响应头即解除，body 流是长连接不受它管
      // （AbortSignal.timeout 挂在 fetch 上会掐断整个流，造成 30s 一断的假死循环）。
      const timeoutController = new AbortController();
      const timeoutTimer = setTimeout(
        () => timeoutController.abort(),
        CONNECT_TIMEOUT_MS,
      );
      let resp: Response;
      try {
        resp = await this.client.authedFetch(
          `/api/chat/activate/${this.conversationId}`,
          {
            headers: { accept: 'text/event-stream' },
            signal: timeoutController.signal,
          },
        );
      } finally {
        clearTimeout(timeoutTimer);
      }
      if (!resp.ok || !resp.body) {
        throw new Error(`SSE HTTP ${resp.status}`);
      }
      this.reconnectAttempt = 0;
      this.reader = resp.body.getReader();
      await this.pump();
      // 流正常结束也按断线处理（服务端 session_replaced 或关停）
      if (!this.closed) this.scheduleReconnect();
    } catch (e) {
      if (this.closed) return;
      debugLogger.warn('langvis sse error', e);
      this.handlers.onClose(e instanceof Error ? e : new Error(String(e)));
      this.scheduleReconnect();
    }
  }

  private async pump(): Promise<void> {
    const reader = this.reader;
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';
    let connected = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue; // 心跳（:）或非 data 事件
        let frame: StreamFrame | undefined;
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          frame = JSON.parse(dataLine.slice(5).trim()) as StreamFrame;
        } catch {
          debugLogger.warn('langvis sse frame parse failed');
          continue;
        }
        if (frame.type === 'connected' && !connected) {
          connected = true;
          this.handlers.onOpen();
        } else if (frame.type === 'session_replaced') {
          this.handlers.onFrame(frame);
          this.stop();
          this.handlers.onClose(new Error('session_replaced'));
          return;
        } else {
          this.handlers.onFrame(frame);
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const delay = Math.min(
      RECONNECT_DELAY_MS * 2 ** this.reconnectAttempt,
      60_000,
    );
    this.reconnectAttempt += 1;
    setTimeout(() => void this.connect(), delay);
  }
}

