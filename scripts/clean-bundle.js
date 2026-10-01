/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// esbuild 不清旧 chunk——hash 变化的历史产物会在 bundle/ 里堆积并被误当现役代码。
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

rmSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bundle'), {
  recursive: true,
  force: true,
});
