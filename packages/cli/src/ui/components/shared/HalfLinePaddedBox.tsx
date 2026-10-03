/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import { useUIState } from '../../contexts/UIStateContext.js';
import { theme } from '../../semantic-colors.js';
import { interpolateColor, resolveColor } from '../../themes/color-utils.js';
import { supportsTrueColor } from '@google/gemini-cli-core';

export interface HalfLinePaddedBoxProps {
  /**
   * The base color to blend with the terminal background.
   */
  backgroundBaseColor: string;

  /**
   * The opacity (0-1) for blending the backgroundBaseColor onto the terminal background.
   */
  backgroundOpacity: number;

  /**
   * Whether to render the solid background color.
   */
  useBackgroundColor?: boolean;

  children: React.ReactNode;
}

/**
 * A container component that renders a solid background with half-line padding
 * at the top and bottom using block characters (▀/▄).
 */
export const HalfLinePaddedBox: React.FC<HalfLinePaddedBoxProps> = (props) => {
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  if (props.useBackgroundColor === false || isScreenReaderEnabled) {
    return <>{props.children}</>;
  }

  return <HalfLinePaddedBoxInternal {...props} />;
};

const HalfLinePaddedBoxInternal: React.FC<HalfLinePaddedBoxProps> = ({
  backgroundBaseColor,
  backgroundOpacity,
  children,
}) => {
  const { terminalWidth } = useUIState();
  const terminalBg = theme.background.primary || 'black';

  const backgroundColor = useMemo(() => {
    const resolvedBase =
      resolveColor(backgroundBaseColor) || backgroundBaseColor;
    const resolvedTerminalBg = resolveColor(terminalBg) || terminalBg;

    return interpolateColor(
      resolvedTerminalBg,
      resolvedBase,
      backgroundOpacity,
    );
  }, [backgroundBaseColor, backgroundOpacity, terminalBg]);

  if (!backgroundColor) {
    return <>{children}</>;
  }

  // 混色插值只有 opacity<1 才真正需要 truecolor;纯色帽(opacity=1 时插值是恒等,
  // 帽色=气泡色)chalk 会自动向 256 色降档——COLORTERM 不随 SSH 转发,不能作硬门槛,
  // 否则无 truecolor 标志的会话整块退化为 paddingY=1(1 行消息撑成 3 行高)。
  const needsTrueColor = backgroundOpacity < 1 && !supportsTrueColor();

  if (needsTrueColor) {
    return (
      <Box width={terminalWidth} backgroundColor={backgroundColor} paddingY={1}>
        {children}
      </Box>
    );
  }

  return (
    <Box
      width={terminalWidth}
      flexDirection="column"
      alignItems="stretch"
      minHeight={1}
      flexShrink={0}
    >
      <Box width={terminalWidth} flexDirection="row">
        <Text color={backgroundColor}>{'▄'.repeat(terminalWidth)}</Text>
      </Box>
      <Box
        width={terminalWidth}
        flexDirection="column"
        alignItems="stretch"
        backgroundColor={backgroundColor}
      >
        {children}
      </Box>
      <Box width={terminalWidth} flexDirection="row">
        <Text color={backgroundColor}>{'▀'.repeat(terminalWidth)}</Text>
      </Box>
    </Box>
  );
};
