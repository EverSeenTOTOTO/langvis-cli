/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// langvis 后端 HTTP 客户端：cookie-jar fetch + ~/.langvis/cookies.json 持久化登录。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CookieJar } from 'tough-cookie';
import { dirname, join } from 'node:path';
import { GEMINI_DIR, homedir } from '../utils/paths.js';
import { debugLogger } from '../utils/debugLogger.js';
import type {
  LangvisConversation,
  LangvisMessage,
  LangvisModel,
  LangvisSkill,
} from './types.js';

const serverBase = (process.env['LANGVIS_SERVER_URL'] ?? 'http://localhost:3000')
  .replace(/\/+$/, '');

const cookieStorePath = join(homedir(), GEMINI_DIR, 'cookies.json');

type CookieFetchLike = {
  (url: string, init?: RequestInit): Promise<Response>;
  // fetch-cookie 附带的 tough-cookie jar（声明源与本地依赖不同，按 unknown 收）
  cookieJar: unknown;
};

// JSON 边界解析：宽进严出的唯一收口。
function parseJson<T>(raw: string): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return JSON.parse(raw) as T;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null
    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      (v as Record<string, unknown>)
    : undefined;
}

export class LangvisNotLoggedInError extends Error {
  constructor() {
    super(
      'langvis: not logged in. Run `langvis login` or POST /api/auth/sign-in/email first.',
    );
    this.name = 'LangvisNotLoggedInError';
  }
}

export class LangvisClient {
  private fetchFn: CookieFetchLike | undefined;

  private fromEnvCookie = false;

  private async ensureFetch(): Promise<CookieFetchLike> {
    if (this.fetchFn) return this.fetchFn;
    const fetchCookie = (await import('fetch-cookie')).default;
    let jar: CookieJar | undefined;
    // 宿主注入的会话（服务端 PTY 场景）优先——浏览器会话不落盘覆写本地 cookies.json
    const envCookie = process.env['LANGVIS_SESSION_COOKIE'];
    if (envCookie && envCookie.includes('=')) {
      jar = new CookieJar();
      jar.setCookieSync(envCookie, serverBase);
      this.fromEnvCookie = true;
    }
    if (!jar && existsSync(cookieStorePath)) {
      try {
        jar = CookieJar.deserializeSync(readFileSync(cookieStorePath, 'utf-8'));
      } catch (e) {
        debugLogger.warn('cookie store corrupt, starting fresh', e);
      }
    }
    this.fetchFn = fetchCookie(fetch, jar);
    return this.fetchFn;
  }

  persistCookies(): void {
    if (this.fromEnvCookie) return;
    const jar: unknown = this.fetchFn?.cookieJar;
    if (typeof jar !== 'object' || jar === null) return;
    if (!('serializeSync' in jar)) return;
    const { serializeSync } = jar as { serializeSync?: unknown };
    if (typeof serializeSync !== 'function') return;
    try {
      mkdirSync(dirname(cookieStorePath), { recursive: true });
      writeFileSync(cookieStorePath, JSON.stringify(serializeSync.call(jar)));
    } catch (e) {
      debugLogger.warn('failed persisting cookie store', e);
    }
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { timeoutMs?: number },
  ): Promise<T> {
    const fetchFn = await this.ensureFetch();
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      init?.timeoutMs ?? 30_000,
    );
    const { method, body } = init ?? {};
    let resp: Response;
    try {
      resp = await fetchFn(`${serverBase}${path}`, {
        method,
        body,
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
      });
    } finally {
      clearTimeout(timer);
      this.persistCookies();
    }
    if (resp.status === 401) throw new LangvisNotLoggedInError();
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      throw new Error(`langvis ${resp.status} ${path}: ${errBody.slice(0, 300)}`);
    }
    const text = await resp.text();
    // 空响应体（204/void 端点）落为 null 而非 undefined——保持泛型直通
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return (text ? parseJson<unknown>(text) : null) as T;
  }

  // ── auth ──

  async signIn(email: string, password: string): Promise<void> {
    await this.request('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  /** 未登录抛 LangvisNotLoggedInError。 */
  async requireSession(): Promise<void> {
    const session = await this.request<{ user?: unknown } | null>(
      '/api/auth/get-session',
    );
    if (!asRecord(session?.user)) throw new LangvisNotLoggedInError();
  }

  // ── conversation ──

  async createConversation(
    name: string,
    workspacePath: string,
  ): Promise<LangvisConversation> {
    return this.request('/api/conversation', {
      method: 'POST',
      body: JSON.stringify({ name, config: {}, workspacePath }),
    });
  }

  async listConversationsByWorkspace(
    workspacePath: string,
  ): Promise<{ conversations: LangvisConversation[] }> {
    return this.request(
      `/api/conversation/workspace?workspacePath=${encodeURIComponent(workspacePath)}`,
    );
  }

  async getConversation(
    conversationId: string,
  ): Promise<LangvisConversation> {
    return this.request(`/api/conversation/${conversationId}`);
  }

  async getMessages(
    conversationId: string,
  ): Promise<{ messages: LangvisMessage[] }> {
    return this.request(`/api/conversation/${conversationId}/messages`);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.request(`/api/conversation/${conversationId}`, {
      method: 'DELETE',
    });
  }

  /** 全量更新 conversation（PUT；name+config 必填）。 */
  async updateConversation(
    conversation: LangvisConversation,
  ): Promise<void> {
    await this.request(`/api/conversation/${conversation.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        id: conversation.id,
        name: conversation.name,
        config: conversation.config,
        groupId: conversation.groupId ?? null,
      }),
    });
  }

  // ── chat ──

  /** 发消息启动 run，返回 assistant messageId（即事件流 streamId）。 */
  async startChat(
    conversationId: string,
    content: string,
  ): Promise<{ success: boolean; messageId: string }> {
    return this.request(`/api/chat/start/${conversationId}`, {
      method: 'POST',
      body: JSON.stringify({ conversationId, role: 'user', content }),
    });
  }

  async cancel(conversationId: string): Promise<void> {
    await this.request(`/api/chat/cancel/${conversationId}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // ── human input (AskUser) ──

  async submitHumanInput(
    runId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.request(`/api/human-input/${runId}`, {
      method: 'POST',
      body: JSON.stringify({ runId, data }),
    });
  }

  // ── config surface ──

  async configSchema(): Promise<Record<string, unknown>> {
    return this.request('/api/agent/');
  }

  async skills(): Promise<LangvisSkill[]> {
    return this.request('/api/agent/skills');
  }

  async models(): Promise<LangvisModel[]> {
    const grouped = await this.request<unknown>('/api/models/?type=chat');
    if (!Array.isArray(grouped)) return [];
    const out: LangvisModel[] = [];
    for (const g of grouped) {
      const group = asRecord(g);
      const inner = group?.['models'];
      if (!Array.isArray(inner)) continue;
      // 组名（providerName）在分组外层——下发到每个模型供展示
      const groupName = group?.['providerName'] ?? group?.['providerId'];
      const provider =
        typeof groupName === 'string' ? groupName : undefined;
      for (const m of inner) {
        const rec = asRecord(m);
        const id = rec?.['id'];
        if (typeof id !== 'string') continue;
        const name = rec?.['name'];
        out.push({
          id,
          name: typeof name === 'string' ? name : undefined,
          provider,
        });
      }
    }
    return out;
  }

  get baseUrl(): string {
    return serverBase;
  }

  /** 认证态的裸 fetch（SSE 流用——需要拿到 body stream 而非 JSON）。 */
  async authedFetch(
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    const fetchFn = await this.ensureFetch();
    const resp = await fetchFn(`${serverBase}${path}`, {
      method: init?.method,
      body: init?.body,
      signal: init?.signal,
      headers: { 'content-type': 'application/json' },
    });
    this.persistCookies();
    return resp;
  }
}
