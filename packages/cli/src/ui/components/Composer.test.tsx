/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render } from '../../test-utils/render.js';
import { act, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Composer } from './Composer.js';
import { UIStateContext, type UIState } from '../contexts/UIStateContext.js';
import {
  UIActionsContext,
  type UIActions,
} from '../contexts/UIActionsContext.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { SettingsContext } from '../contexts/SettingsContext.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { ApprovalMode, CoreToolCallStatus } from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';
import { StreamingState } from '../types.js';
import type { LoadedSettings } from '../../config/settings.js';
import type { TextBuffer } from './shared/text-buffer.js';

// Mock VimModeContext hook
vi.mock('../contexts/VimModeContext.js', () => ({
  useVimMode: vi.fn(() => ({
    vimEnabled: false,
    vimMode: 'INSERT',
  })),
}));

vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: vi.fn(() => ({
    columns: 100,
    rows: 24,
  })),
}));

const composerTestControls = vi.hoisted(() => ({
  suggestionsVisible: false,
  isAlternateBuffer: false,
}));

// Mock child components
vi.mock('./LoadingIndicator.js', () => ({
  LoadingIndicator: ({
    thought,
    thoughtLabel,
  }: {
    thought?: { subject?: string } | string;
    thoughtLabel?: string;
  }) => {
    const fallbackText =
      typeof thought === 'string' ? thought : thought?.subject;
    const text = thoughtLabel ?? fallbackText;
    return <Text>LoadingIndicator{text ? `: ${text}` : ''}</Text>;
  },
}));

vi.mock('./StatusDisplay.js', () => ({
  StatusDisplay: ({ hideContextSummary }: { hideContextSummary: boolean }) => (
    <Text>StatusDisplay{hideContextSummary ? ' (hidden summary)' : ''}</Text>
  ),
}));

vi.mock('./ContextSummaryDisplay.js', () => ({
  ContextSummaryDisplay: () => <Text>ContextSummaryDisplay</Text>,
}));

vi.mock('./HookStatusDisplay.js', () => ({
  HookStatusDisplay: () => <Text>HookStatusDisplay</Text>,
}));

vi.mock('./ApprovalModeIndicator.js', () => ({
  ApprovalModeIndicator: ({ approvalMode }: { approvalMode: ApprovalMode }) => (
    <Text>ApprovalModeIndicator: {approvalMode}</Text>
  ),
}));

vi.mock('./ShellModeIndicator.js', () => ({
  ShellModeIndicator: () => <Text>ShellModeIndicator</Text>,
}));

vi.mock('./ShortcutsHelp.js', () => ({
  ShortcutsHelp: () => <Text>ShortcutsHelp</Text>,
}));

vi.mock('./DetailedMessagesDisplay.js', () => ({
  DetailedMessagesDisplay: () => <Text>DetailedMessagesDisplay</Text>,
}));

vi.mock('./InputPrompt.js', () => ({
  InputPrompt: ({
    placeholder,
    onSuggestionsVisibilityChange,
  }: {
    placeholder?: string;
    onSuggestionsVisibilityChange?: (visible: boolean) => void;
  }) => {
    useEffect(() => {
      onSuggestionsVisibilityChange?.(composerTestControls.suggestionsVisible);
    }, [onSuggestionsVisibilityChange]);

    return <Text>InputPrompt: {placeholder}</Text>;
  },
  calculatePromptWidths: vi.fn(() => ({
    inputWidth: 80,
    suggestionsWidth: 40,
    containerWidth: 84,
  })),
}));

vi.mock('../hooks/useAlternateBuffer.js', () => ({
  useAlternateBuffer: () => composerTestControls.isAlternateBuffer,
}));

vi.mock('./Footer.js', () => ({
  Footer: () => <Text>Footer</Text>,
}));

vi.mock('./ShowMoreLines.js', () => ({
  ShowMoreLines: () => <Text>ShowMoreLines</Text>,
}));

vi.mock('./QueuedMessageDisplay.js', () => ({
  QueuedMessageDisplay: ({ messageQueue }: { messageQueue: string[] }) => {
    if (messageQueue.length === 0) {
      return null;
    }
    return (
      <>
        {messageQueue.map((message, index) => (
          <Text key={index}>{message}</Text>
        ))}
      </>
    );
  },
}));

// Mock contexts
vi.mock('../contexts/OverflowContext.js', () => ({
  OverflowProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Create mock context providers
const createMockUIState = (overrides: Partial<UIState> = {}): UIState =>
  ({
    streamingState: StreamingState.Idle,
    isConfigInitialized: true,
    contextFileNames: [],
    showApprovalModeIndicator: ApprovalMode.DEFAULT,
    currentModel: '',
    conversationUsage: null,
    pendingHistoryItems: [],
    messageQueue: [],
    showErrorDetails: false,
    constrainHeight: false,
    isInputActive: true,
    buffer: { text: '' },
    inputWidth: 80,
    suggestionsWidth: 40,
    userMessages: [],
    slashCommands: [],
    commandContext: null,
    shellModeActive: false,
    isFocused: true,
    thought: '',
    currentLoadingPhrase: '',
    currentTip: '',
    currentWittyPhrase: '',
    elapsedTime: 0,
    ctrlCPressedOnce: false,
    ctrlDPressedOnce: false,
    showEscapePrompt: false,
    shortcutsHelpVisible: false,
    cleanUiDetailsVisible: true,
    ideContextState: null,
    geminiMdFileCount: 0,
    renderMarkdown: true,
    history: [],
    sessionStats: {
      sessionId: 'test-session',
      sessionStartTime: new Date(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metrics: {} as any,
      lastPromptTokenCount: 0,
      promptCount: 0,
    },
    branchName: 'main',
    debugMessage: '',
    corgiMode: false,
    errorCount: 0,
    nightly: false,
    isTrustedFolder: true,
    activeHooks: [],
    isBackgroundTaskVisible: false,
    embeddedShellFocused: false,
    showIsExpandableHint: false,
    ...overrides,
  }) as UIState;

const createMockUIActions = (): UIActions =>
  ({
    handleFinalSubmit: vi.fn(),
    handleClearScreen: vi.fn(),
    setShellModeActive: vi.fn(),
    setCleanUiDetailsVisible: vi.fn(),
    toggleCleanUiDetailsVisible: vi.fn(),
    revealCleanUiDetailsTemporarily: vi.fn(),
    onEscapePromptChange: vi.fn(),
    vimHandleInput: vi.fn(),
    setShortcutsHelpVisible: vi.fn(),
  }) as Partial<UIActions> as UIActions;

const createMockConfig = (overrides = {}): Config =>
  ({
    getModel: vi.fn(() => 'gemini-1.5-pro'),
    getTargetDir: vi.fn(() => '/test/dir'),
    getDebugMode: vi.fn(() => false),
    getAccessibility: vi.fn(() => ({})),
    getMcpServers: vi.fn(() => ({})),
    isPlanEnabled: vi.fn(() => true),
    getToolRegistry: () => ({
      getTool: vi.fn(),
    }),
    getSkillManager: () => ({
      getSkills: () => [],
      getDisplayableSkills: () => [],
    }),
    getMcpClientManager: () => ({
      getMcpServers: () => ({}),
      getBlockedMcpServers: () => [],
    }),
    ...overrides,
  }) as unknown as Config;

import { QuotaContext, type QuotaState } from '../contexts/QuotaContext.js';
import { InputContext, type InputState } from '../contexts/InputContext.js';

const renderComposer = async (
  uiState: UIState,
  settings = createMockSettings({ ui: {} }),
  config = createMockConfig(),
  uiActions = createMockUIActions(),
  inputStateOverrides: Partial<InputState> = {},
  quotaStateOverrides: Partial<QuotaState> = {},
) => {
  const inputState = {
    buffer: { text: '' } as unknown as TextBuffer,
    userMessages: [],
    shellModeActive: false,
    showEscapePrompt: false,
    copyModeEnabled: false,
    inputWidth: 80,
    suggestionsWidth: 40,
    ...(uiState as unknown as Partial<InputState>),
    ...inputStateOverrides,
  };

  const quotaState: QuotaState = {
    userTier: undefined,
    stats: undefined,
    proQuotaRequest: null,
    validationRequest: null,
    overageMenuRequest: null,
    emptyWalletRequest: null,
    ...quotaStateOverrides,
  };

  const result = await render(
    <ConfigContext.Provider value={config as unknown as Config}>
      <SettingsContext.Provider value={settings as unknown as LoadedSettings}>
        <QuotaContext.Provider value={quotaState}>
          <InputContext.Provider value={inputState}>
            <UIStateContext.Provider value={uiState}>
              <UIActionsContext.Provider value={uiActions}>
                <Composer isFocused={true} />
              </UIActionsContext.Provider>
            </UIStateContext.Provider>
          </InputContext.Provider>
        </QuotaContext.Provider>
      </SettingsContext.Provider>
    </ConfigContext.Provider>,
  );

  // Wait for shortcuts hint debounce if using fake timers
  if (vi.isFakeTimers()) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
  }

  return result;
};

describe('Composer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    composerTestControls.suggestionsVisible = false;
    composerTestControls.isAlternateBuffer = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Loading Indicator', () => {
    it('renders LoadingIndicator with thought when streaming', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        thought: {
          subject: 'Processing',
          description: 'Processing your request...',
        },
        currentLoadingPhrase: 'Analyzing',
        elapsedTime: 1500,
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator: Processing');
    });

    it('renders generic thinking text in loading indicator when full inline thinking is enabled', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        thought: {
          subject: 'Thinking about code',
          description: 'Full text is already in history',
        },
      });
      const settings = createMockSettings({
        ui: { inlineThinkingMode: 'full' },
      });

      const { lastFrame } = await renderComposer(uiState, settings);

      const output = lastFrame();
      // In Refreshed UX, we don't force 'Thinking...' label in renderStatusNode
      // It uses the subject directly
      expect(output).toContain('LoadingIndicator: Thinking about code');
    });

    it('shows shortcuts hint while loading', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        elapsedTime: 1,
        cleanUiDetailsVisible: false,
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator');
    });

    it('renders LoadingIndicator with thought when loadingPhrases is off', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        thought: { subject: 'Hidden', description: 'Should not show' },
      });
      const settings = createMockSettings({
        ui: { loadingPhrases: 'off' },
      });

      const { lastFrame } = await renderComposer(uiState, settings);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator');
      expect(output).toContain('LoadingIndicator: Hidden');
    });

    it('does not render LoadingIndicator when waiting for confirmation', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.WaitingForConfirmation,
        thought: {
          subject: 'Confirmation',
          description: 'Should not show during confirmation',
        },
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).not.toContain('LoadingIndicator');
    });

    it('does not render LoadingIndicator when a tool confirmation is pending', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        pendingHistoryItems: [
          {
            type: 'tool_group',
            tools: [
              {
                callId: 'call-1',
                name: 'edit',
                description: 'edit file',
                status: CoreToolCallStatus.AwaitingApproval,
                resultDisplay: undefined,
                confirmationDetails: undefined,
              },
            ],
          },
        ],
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame({ allowEmpty: true });
      expect(output).toBe('');
    });

    it('renders LoadingIndicator when embedded shell is focused but background shell is visible', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        embeddedShellFocused: true,
        isBackgroundTaskVisible: true,
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator');
    });

    it('renders LoadingIndicator when streaming in full UI mode (审批档位由 LangvisStatusLine 承担)', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        thought: {
          subject: 'Thinking',
          description: '',
        },
        showApprovalModeIndicator: ApprovalMode.PLAN,
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator: Thinking');
      expect(output).toContain('⏸ default');
    });

    it('does NOT render LoadingIndicator when embedded shell is focused and background shell is NOT visible', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        embeddedShellFocused: true,
        isBackgroundTaskVisible: false,
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).not.toContain('LoadingIndicator');
    });
  });

  describe('Message Queue Display', () => {
    it('displays queued messages when present', async () => {
      const uiState = createMockUIState({
        messageQueue: [
          'First queued message',
          'Second queued message',
          'Third queued message',
        ],
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('First queued message');
      expect(output).toContain('Second queued message');
      expect(output).toContain('Third queued message');
    });

    it('renders QueuedMessageDisplay with empty message queue', async () => {
      const uiState = createMockUIState({
        messageQueue: [],
      });

      const { lastFrame } = await renderComposer(uiState);

      // The component should render but return null for empty queue
      // This test verifies that the component receives the correct prop
      const output = lastFrame();
      expect(output).toContain('InputPrompt'); // Verify basic Composer rendering
    });
  });

  describe('Error Details Display', () => {
    it('shows DetailedMessagesDisplay when showErrorDetails is true', async () => {
      const uiState = createMockUIState({
        showErrorDetails: true,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).toContain('DetailedMessagesDisplay');
      expect(lastFrame()).toContain('ShowMoreLines');
    });

    it('does not show error details when showErrorDetails is false', async () => {
      const uiState = createMockUIState({
        showErrorDetails: false,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).not.toContain('DetailedMessagesDisplay');
    });
  });

  describe('Vim Mode Placeholders', () => {
    it('shows correct placeholder in INSERT mode', async () => {
      const uiState = createMockUIState({ isInputActive: true });
      const { useVimMode } = await import('../contexts/VimModeContext.js');
      vi.mocked(useVimMode).mockReturnValue({
        vimEnabled: true,
        vimMode: 'INSERT',
        toggleVimEnabled: vi.fn(),
        setVimMode: vi.fn(),
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).toContain(
        "InputPrompt:   Press 'Esc' for NORMAL mode.",
      );
    });

    it('shows correct placeholder in NORMAL mode', async () => {
      const uiState = createMockUIState({ isInputActive: true });
      const { useVimMode } = await import('../contexts/VimModeContext.js');
      vi.mocked(useVimMode).mockReturnValue({
        vimEnabled: true,
        vimMode: 'NORMAL',
        toggleVimEnabled: vi.fn(),
        setVimMode: vi.fn(),
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).toContain(
        "InputPrompt:   Press 'i' for INSERT mode.",
      );
    });
  });

  describe('Shortcuts Help', () => {
    it('shows shortcuts help in passive state', async () => {
      const uiState = createMockUIState({
        shortcutsHelpVisible: true,
        streamingState: StreamingState.Idle,
      });

      const { lastFrame, unmount } = await renderComposer(uiState);

      expect(lastFrame()).toContain('ShortcutsHelp');
      unmount();
    });

    it('hides shortcuts help while streaming', async () => {
      const uiState = createMockUIState({
        shortcutsHelpVisible: true,
        streamingState: StreamingState.Responding,
      });

      const { lastFrame, unmount } = await renderComposer(uiState);

      expect(lastFrame()).not.toContain('ShortcutsHelp');
      unmount();
    });
    it('hides shortcuts help when action is required', async () => {
      const uiState = createMockUIState({
        shortcutsHelpVisible: true,
        customDialog: (
          <Box>
            <Text>Test Dialog</Text>
          </Box>
        ),
      });

      const { lastFrame, unmount } = await renderComposer(uiState);

      expect(lastFrame({ allowEmpty: true })).toBe('');
      unmount();
    });
  });
  describe('Snapshots', () => {
    it('matches snapshot in idle state', async () => {
      const uiState = createMockUIState();
      const { lastFrame } = await renderComposer(uiState);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('matches snapshot while streaming', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        thought: {
          subject: 'Thinking',
          description: 'Thinking about the meaning of life...',
        },
      });
      const { lastFrame } = await renderComposer(uiState);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('matches snapshot in narrow view', async () => {
      const uiState = createMockUIState({
        terminalWidth: 40,
      });
      const { lastFrame } = await renderComposer(uiState);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('matches snapshot in minimal UI mode', async () => {
      const uiState = createMockUIState({
        cleanUiDetailsVisible: false,
      });
      const { lastFrame } = await renderComposer(uiState);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('matches snapshot in minimal UI mode while loading', async () => {
      const uiState = createMockUIState({
        cleanUiDetailsVisible: false,
        streamingState: StreamingState.Responding,
        elapsedTime: 1000,
      });
      const { lastFrame } = await renderComposer(uiState);
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
