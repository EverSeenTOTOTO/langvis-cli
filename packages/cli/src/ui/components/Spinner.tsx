/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { Text } from 'ink';
import { theme } from '../semantic-colors.js';

const FRAMES = ['⠋', '⠙', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Braille 帧动画 spinner——后端交互进行中的轻量指示(label 可选)。 */
export const Spinner: React.FC<{ label?: string }> = ({ label }) => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setFrame((v) => (v + 1) % FRAMES.length),
      100,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <Text color={theme.status.warning}>
      {FRAMES[frame]}
      {label ? ` ${label}` : ''}
    </Text>
  );
};
