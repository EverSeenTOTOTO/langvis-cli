/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { ThoughtSummary } from '@google/gemini-cli-core';
import { theme } from '../../semantic-colors.js';
import { normalizeEscapedNewlines } from '../../utils/textUtils.js';

interface ThinkingMessageProps {
  thought: ThoughtSummary;
  terminalWidth: number;
  isFirstThinking?: boolean;
  /** 直播中的 pending 项：只渲染最新 N 行（防超出屏高后 Ink 活动区整块重绘闪烁）。 */
  isPending?: boolean;
}

const THINKING_LEFT_PADDING = 1;

/** 直播 thinking 的滚动窗口行数（提交进 <Static> 历史后仍全文渲染）。 */
const MAX_LIVE_LINES = 12;

function normalizeThoughtLines(thought: ThoughtSummary): string[] {
  const subject = normalizeEscapedNewlines(thought.subject).trim();
  const description = normalizeEscapedNewlines(thought.description).trim();

  const isNoise = (text: string) => {
    const trimmed = text.trim();
    return !trimmed || /^\.+$/.test(trimmed);
  };

  const lines: string[] = [];

  if (subject && !isNoise(subject)) {
    lines.push(subject);
  }

  if (description) {
    const descriptionLines = description
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !isNoise(line));
    lines.push(...descriptionLines);
  }

  return lines;
}

/**
 * Renders a model's thought as a distinct bubble.
 * Leverages Ink layout for wrapping and borders.
 */
export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({
  thought,
  terminalWidth,
  isFirstThinking,
  isPending,
}) => {
  const fullLines = useMemo(() => normalizeThoughtLines(thought), [thought]);

  if (fullLines.length === 0) {
    return null;
  }

  // 直播窗口：只留最新 N 行，顶部以省略行示意截断（首行加粗只对未截断的完整渲染生效）
  const clipped = isPending && fullLines.length > MAX_LIVE_LINES;
  const hiddenCount = clipped ? fullLines.length - MAX_LIVE_LINES : 0;
  const lines = clipped ? fullLines.slice(-MAX_LIVE_LINES) : fullLines;

  return (
    <Box width={terminalWidth} flexDirection="column">
      {isFirstThinking && (
        <Text color={theme.text.primary} italic>
          {' '}
          Thinking...{' '}
        </Text>
      )}

      <Box
        marginLeft={THINKING_LEFT_PADDING}
        paddingLeft={1}
        borderStyle="single"
        borderLeft={true}
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderColor={theme.text.secondary}
        flexDirection="column"
      >
        <Text> </Text>
        {clipped && (
          <Text color={theme.ui.comment} italic>
            … +{hiddenCount} earlier lines (full text in history)
          </Text>
        )}
        {!clipped && lines.length > 0 && (
          <Text color={theme.text.primary} bold italic>
            {lines[0]}
          </Text>
        )}
        {(clipped ? lines : lines.slice(1)).map((line, index) => (
          <Text key={`body-line-${index}`} color={theme.text.secondary} italic>
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
