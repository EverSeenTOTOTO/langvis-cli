/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// langvis 模型面：/api/models 拉取 → ModelDefinition 集（ModelDialog 动态路径消费）。

import { debugLogger } from '../utils/debugLogger.js';
import type { ModelDefinition } from '../services/modelConfigService.js';
import type { SkillDefinition } from '../skills/skillLoader.js';
import { langvisClient } from './agent-protocol.js';
import type { LangvisConversation } from './types.js';

let modelDefinitions: Record<string, ModelDefinition> = {};

/** 启动时预热：拉模型列表转 ModelDefinition（全 visible，tier=auto 进主列表）。 */
export async function fetchAndCacheLangvisModels(): Promise<void> {
  try {
    const models = await langvisClient.models();
    const defs: Record<string, ModelDefinition> = {};
    for (const m of models) {
      defs[m.id] = {
        displayName: m.name ?? m.id,
        tier: 'auto',
        isVisible: true,
        dialogDescription: m.provider ? `via ${m.provider}` : 'langvis',
        features: {},
      };
    }
    modelDefinitions = defs;
    debugLogger.log(`langvis models cached: ${Object.keys(defs).length}`);
  } catch (e) {
    debugLogger.warn('langvis model fetch failed', e);
  }
}

export function getLangvisModelDefinitions(): Record<string, ModelDefinition> {
  return modelDefinitions;
}

// ─── 当前 conversation 缓存（setModel 全量 PUT 的 merge 基底） ───

let currentConversation: LangvisConversation | undefined;

// 会话记录监听：绑定/切换会话时回调（AppContainer 据此播种本地 UI 状态，如审批档位）
let recordListener: ((conversation: LangvisConversation) => void) | undefined;

export function bindLangvisRecordListener(
  listener: (conversation: LangvisConversation) => void,
): void {
  recordListener = listener;
}

export function setLangvisConversationRecord(
  conversation: LangvisConversation,
): void {
  currentConversation = conversation;
  recordListener?.(conversation);
}

export function getLangvisConversationRecord():
  | LangvisConversation
  | undefined {
  return currentConversation;
}

/** 会话初始模型：conversation config.model.modelId（无则 undefined 走后端默认）。 */
export function getLangvisCurrentModelId(): string | undefined {
  const model = (
    currentConversation?.config as { model?: { modelId?: string } } | undefined
  )?.model?.modelId;
  return typeof model === 'string' ? model : undefined;
}

// ─── skills 预热（/skills 列表数据源） ───

let skillDefinitions: SkillDefinition[] = [];

export async function fetchAndCacheLangvisSkills(): Promise<void> {
  try {
    const skills = await langvisClient.skills();
    skillDefinitions = skills.map((s) => ({
      name: s.id,
      description: `${s.name} — ${s.description}`,
      location: 'langvis',
      body: '',
    }));
    debugLogger.log(`langvis skills cached: ${skillDefinitions.length}`);
  } catch (e) {
    debugLogger.warn('langvis skill fetch failed', e);
  }
}

export function getLangvisSkills(): SkillDefinition[] {
  return skillDefinitions;
}
