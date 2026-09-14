/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// langvis：上游通过深路径再导出根 node_modules 里的代理实现（core 删除后
// 已不可解析）。CLI 不走 HTTP 代理，改为空实现。
export class HttpProxyAgent {
  constructor(_uri: string) {
    throw new Error('langvis: http proxy agents are disabled');
  }
}
