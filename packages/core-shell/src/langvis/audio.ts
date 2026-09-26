/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// langvis TTS 音频消费：下载到临时文件后用系统播放器（detached）播放。

import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { debugLogger } from '../utils/debugLogger.js';
import { langvisClient } from './agent-protocol.js';

const PLAYERS = ['mpv', 'ffplay', 'paplay', 'aplay', 'afplay'];

function detectPlayer(): string | undefined {
  return PLAYERS.find((p) => {
    try {
      return spawnSync('which', [p], { stdio: 'ignore' }).status === 0;
    } catch {
      return false;
    }
  });
}

/** 下载并播放一段 TTS 音频；无可用播放器时静默跳过（fire-and-forget 使用）。 */
export async function playLangvisAudio(filePath: string): Promise<void> {
  const player = detectPlayer();
  if (!player) {
    debugLogger.warn('langvis audio: no system player found (mpv/ffplay/…)');
    return;
  }
  const resp = await langvisClient.authedFetch(filePath);
  if (!resp.ok) {
    debugLogger.warn(`langvis audio: download failed ${resp.status}`);
    return;
  }
  const ext = filePath.includes('.') ? filePath.split('.').pop() : 'bin';
  const tmp = join(
    tmpdir(),
    `langvis-audio-${Date.now()}.${ext?.replace(/[^a-z0-9]/gi, '') ?? 'bin'}`,
  );
  await writeFile(tmp, Buffer.from(await resp.arrayBuffer()));
  const child = spawn(player, [tmp], { detached: true, stdio: 'ignore' });
  child.unref();
  child.on('close', () => {
    unlink(tmp).catch(() => {});
  });
}
