/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
const { listConversationsMock } = vi.hoisted(() => ({
  listConversationsMock: vi.fn(async () => ({
    conversations: [
      {
        id: 'conv-old',
        name: 'Old',
        config: {},
        createdAt: '2026-08-01T00:00:00Z',
      },
      {
        id: 'conv-mid',
        name: 'Mid',
        config: {},
        createdAt: '2026-08-15T00:00:00Z',
      },
      {
        id: 'conv-new',
        name: 'New',
        config: {},
        createdAt: '2026-09-01T00:00:00Z',
      },
    ],
  })),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    langvisClient: {
      listConversationsByWorkspace: listConversationsMock,
      getConversation: vi.fn(async (id: string) => ({
        id,
        name: id,
        config: {},
        createdAt: '2026-09-01T00:00:00Z',
      })),
      getMessages: vi.fn(async () => ({
        messages: [
          {
            id: 'm1',
            role: 'user',
            content: 'hello',
            createdAt: '2026-09-01T00:00:01Z',
          },
        ],
      })),
    },
  };
});

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  SessionSelector,
  RESUME_LATEST,
  extractFirstUserMessage,
  formatRelativeTime,
  convertSessionToHistoryFormats,
} from './sessionUtils.js';
import {
  type Storage,
  type MessageRecord,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';

describe('SessionSelector', () => {
  // langvis 化后 getSessionFiles 走后端 workspace 列表——mock 固定三会话验证解析逻辑
  const selector = () =>
    new SessionSelector({
      getProjectTempDir: () => '/tmp',
    } as Partial<Storage> as Storage);

  it('resolves session by full UUID', async () => {
    const session = await selector().findSession('conv-mid');
    expect(session.id).toBe('conv-mid');
  });

  it('trims whitespace in the identifier', async () => {
    const session = await selector().findSession('  conv-mid  ');
    expect(session.id).toBe('conv-mid');
  });

  it('resolves latest session with the special latest token', async () => {
    const result = await selector().resolveSession(RESUME_LATEST);
    expect(result.sessionData.sessionId).toBe('conv-new');
  });

  it('resolves by 1-based index (oldest first)', async () => {
    const session = await selector().findSession('2');
    expect(session.id).toBe('conv-mid');
  });

  it('sessionExists is true for a known id', async () => {
    await expect(selector().sessionExists('conv-new')).resolves.toBe(true);
  });

  it('sessionExists is false for an unknown id', async () => {
    await expect(selector().sessionExists('conv-gone')).resolves.toBe(false);
  });

  it('throws when no sessions exist', async () => {
    listConversationsMock.mockResolvedValueOnce({ conversations: [] });
    await expect(selector().findSession('conv-mid')).rejects.toThrow();
  });
});

describe('extractFirstUserMessage', () => {
  it('should extract first non-resume user message', () => {
    const messages = [
      {
        type: 'user',
        content: '/resume',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
      {
        type: 'user',
        content: 'Hello world',
        id: 'msg2',
        timestamp: '2024-01-01T10:01:00.000Z',
      },
    ] as MessageRecord[];

    expect(extractFirstUserMessage(messages)).toBe('Hello world');
  });

  it('should not truncate long messages', () => {
    const longMessage = 'a'.repeat(150);
    const messages = [
      {
        type: 'user',
        content: longMessage,
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    const result = extractFirstUserMessage(messages);
    expect(result).toBe(longMessage);
  });

  it('should return "Empty conversation" for no user messages', () => {
    const messages = [
      {
        type: 'gemini',
        content: 'Hello',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    expect(extractFirstUserMessage(messages)).toBe('Empty conversation');
  });
});

describe('formatRelativeTime', () => {
  it('should format time correctly', () => {
    const now = new Date();

    // 5 minutes ago
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinutesAgo.toISOString())).toBe(
      '5 minutes ago',
    );

    // 1 minute ago
    const oneMinuteAgo = new Date(now.getTime() - 1 * 60 * 1000);
    expect(formatRelativeTime(oneMinuteAgo.toISOString())).toBe('1 minute ago');

    // 2 hours ago
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoHoursAgo.toISOString())).toBe('2 hours ago');

    // 1 hour ago
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    expect(formatRelativeTime(oneHourAgo.toISOString())).toBe('1 hour ago');

    // 3 days ago
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeDaysAgo.toISOString())).toBe('3 days ago');

    // 1 day ago
    const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(oneDayAgo.toISOString())).toBe('1 day ago');

    // Just now (within 60 seconds)
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
    expect(formatRelativeTime(thirtySecondsAgo.toISOString())).toBe('Just now');
  });
});

describe('convertSessionToHistoryFormats', () => {
  it('should preserve tool call arguments', () => {
    const messages: MessageRecord[] = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        type: 'gemini',
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'update_topic',
            args: {
              title: 'Researching bug',
              summary: 'I am looking into the issue.',
            },
            status: CoreToolCallStatus.Success,
            timestamp: new Date().toISOString(),
            displayName: 'Update Topic Context',
            description: 'Updating the topic',
            renderOutputAsMarkdown: true,
            resultDisplay: 'Topic updated',
          },
        ],
      },
    ];

    const result = convertSessionToHistoryFormats(messages);

    expect(result.uiHistory).toHaveLength(1);
    const toolGroup = result.uiHistory[0];
    if (toolGroup.type === 'tool_group') {
      expect(toolGroup.tools).toHaveLength(1);
      const tool = toolGroup.tools[0];
      expect(tool.callId).toBe('call_1');
      expect(tool.name).toBe('Update Topic Context');
      expect(tool.description).toBe('Updating the topic');
      expect(tool.renderOutputAsMarkdown).toBe(true);
      expect(tool.status).toBe(CoreToolCallStatus.Success);
      expect(tool.resultDisplay).toBe('Topic updated');
      expect(tool.args).toEqual({
        title: 'Researching bug',
        summary: 'I am looking into the issue.',
      });
    } else {
      throw new Error('Expected tool_group history item');
    }
  });

  it('should map tool call status correctly when not success', () => {
    const messages: MessageRecord[] = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        type: 'gemini',
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'test_tool',
            status: CoreToolCallStatus.Error,
            timestamp: new Date().toISOString(),
            args: {},
          },
          {
            id: 'call_2',
            name: 'test_tool_2',
            status: CoreToolCallStatus.Cancelled,
            timestamp: new Date().toISOString(),
            args: {},
          },
        ],
      },
    ];

    const result = convertSessionToHistoryFormats(messages);
    expect(result.uiHistory).toHaveLength(1);

    const toolGroup = result.uiHistory[0];
    if (toolGroup.type === 'tool_group') {
      expect(toolGroup.tools).toHaveLength(2);
      expect(toolGroup.tools[0].status).toBe(CoreToolCallStatus.Error);
      expect(toolGroup.tools[1].status).toBe(CoreToolCallStatus.Error); // Cancelled maps to error in this older format projection
    } else {
      throw new Error('Expected tool_group history item');
    }
  });

  it('should convert various message types', () => {
    const messages: MessageRecord[] = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        type: 'user',
        content: 'Hello user',
      },
      {
        id: '2',
        timestamp: new Date().toISOString(),
        type: 'info',
        content: 'System info',
      },
      {
        id: '3',
        timestamp: new Date().toISOString(),
        type: 'error',
        content: 'System error',
      },
      {
        id: '4',
        timestamp: new Date().toISOString(),
        type: 'warning',
        content: 'System warning',
      },
      {
        id: '5',
        timestamp: new Date().toISOString(),
        type: 'gemini',
        content: 'Hello gemini',
        thoughts: [
          {
            subject: 'Thinking',
            description: 'about things',
            timestamp: new Date().toISOString(),
          },
        ],
      },
    ];

    const result = convertSessionToHistoryFormats(messages);

    // thoughts become a separate item
    expect(result.uiHistory).toHaveLength(6);
    expect(result.uiHistory[0]).toEqual({ type: 'user', text: 'Hello user' });
    expect(result.uiHistory[1]).toEqual({ type: 'info', text: 'System info' });
    expect(result.uiHistory[2]).toEqual({
      type: 'error',
      text: 'System error',
    });
    expect(result.uiHistory[3]).toEqual({
      type: 'warning',
      text: 'System warning',
    });
    expect(result.uiHistory[4]).toEqual({
      type: 'thinking',
      thought: { subject: 'Thinking', description: 'about things' },
    });
    expect(result.uiHistory[5]).toEqual({
      type: 'gemini',
      text: 'Hello gemini',
    });
  });

  it('should filter out <session_context> from UI history', () => {
    const messages: MessageRecord[] = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        type: 'user',
        content:
          '<session_context>\nThis is the Gemini CLI\n</session_context>',
      },
      {
        id: '2',
        timestamp: new Date().toISOString(),
        type: 'user',
        content: 'Real message',
      },
    ];

    const result = convertSessionToHistoryFormats(messages);
    expect(result.uiHistory).toHaveLength(1);
    expect(result.uiHistory[0].text).toBe('Real message');
  });

  it('should handle missing tool descriptions and displayNames', () => {
    const messages: MessageRecord[] = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        type: 'gemini',
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'test_tool',
            status: CoreToolCallStatus.Success,
            timestamp: new Date().toISOString(),
            args: {},
          },
        ],
      },
    ];

    const result = convertSessionToHistoryFormats(messages);
    expect(result.uiHistory).toHaveLength(1);

    const toolGroup = result.uiHistory[0];
    if (toolGroup.type === 'tool_group') {
      expect(toolGroup.tools[0].name).toBe('test_tool'); // Fallback to name
      expect(toolGroup.tools[0].description).toBe(''); // Fallback to empty string
    } else {
      throw new Error('Expected tool_group history item');
    }
  });
});
