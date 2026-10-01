/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useState } from 'react';
import type React from 'react';
import type { LangvisTurn } from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { formatRelativeTime } from '../../utils/sessionUtils.js';

interface RewindDialogProps {
  turns: LangvisTurn[];
  /** 执行回退（含 UI 重放）；完成或失败后对话框自行关闭。 */
  onRewind: (turn: LangvisTurn) => Promise<void>;
  onClose: () => void;
}

export const RewindDialog: React.FC<RewindDialogProps> = ({
  turns,
  onRewind,
  onClose,
}) => {
  const [busy, setBusy] = useState(false);

  useKeypress(
    (key) => {
      if (key.name === 'escape' && !busy) {
        onClose();
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const items: Array<RadioSelectItem<LangvisTurn>> = turns.map((turn) => ({
    label: turn.userPreview || '(empty)',
    sublabel: turn.createdAt ? formatRelativeTime(turn.createdAt) : undefined,
    value: turn,
    key: turn.messageId,
  }));

  const handleSelect = async (turn: LangvisTurn) => {
    setBusy(true);
    try {
      await onRewind(turn);
    } finally {
      onClose();
    }
  };

  return (
    <Box flexDirection="row" width="100%">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.ui.focus}
        padding={1}
        flexGrow={1}
        marginLeft={1}
        marginRight={1}
      >
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={theme.text.primary}>
            Rewind conversation
          </Text>
          <Text color={theme.text.secondary}>
            Deletes messages from the selected turn on. Workspace files are not
            touched (use git for that).
          </Text>
        </Box>

        <RadioButtonSelect
          items={items}
          onSelect={handleSelect}
          isFocused={!busy}
        />

        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            {busy ? 'Rewinding…' : '(Enter to rewind, Esc to cancel)'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
