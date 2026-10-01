/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useState } from 'react';
import type React from 'react';
import { coreEvents, langvisClient } from '@google/gemini-cli-core';
import type { LangvisCheckpoint } from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { formatRelativeTime } from '../../utils/sessionUtils.js';

interface RewindDialogProps {
  conversationId: string;
  checkpoints: LangvisCheckpoint[];
  onClose: () => void;
}

export const RewindDialog: React.FC<RewindDialogProps> = ({
  conversationId,
  checkpoints,
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

  const items: Array<RadioSelectItem<LangvisCheckpoint>> = checkpoints.map(
    (checkpoint) => ({
      label: checkpoint.userPreview || '(no prompt)',
      sublabel: checkpoint.createdAt
        ? formatRelativeTime(checkpoint.createdAt)
        : undefined,
      value: checkpoint,
      key: checkpoint.messageId,
    }),
  );

  const handleSelect = async (checkpoint: LangvisCheckpoint) => {
    setBusy(true);
    try {
      await langvisClient.rewind(conversationId, checkpoint.messageId);
      coreEvents.emitFeedback(
        'info',
        `Workspace restored to before: ${checkpoint.userPreview || checkpoint.messageId}`,
      );
    } catch (error) {
      coreEvents.emitFeedback('error', 'Rewind failed:', error);
    }
    onClose();
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
            Rewind workspace files
          </Text>
          <Text color={theme.text.secondary}>
            Restore files to before a turn (later file changes are discarded).
            Conversation history is kept.
          </Text>
        </Box>

        <RadioButtonSelect
          items={items}
          onSelect={handleSelect}
          isFocused={!busy}
        />

        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            {busy ? 'Restoring…' : '(Enter to restore, Esc to cancel)'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
