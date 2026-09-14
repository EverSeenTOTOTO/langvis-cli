/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/telemetry/billingEvents.ts，langvis 关闭此能力：
// 计费遥测事件类型与上游同形；OTel 方法退化为空实现，事件不外发。

import type { Config } from '../config/config.js';
import type { OverageStrategy } from '../billing/billing.js';

type LogAttributes = Record<string, unknown>;

interface BaseTelemetryEvent {
  'event.name': string;
  'event.timestamp': string;
}

export type OverageOption =
  | 'use_credits'
  | 'use_fallback'
  | 'manage'
  | 'stop'
  | 'get_credits';

export const EVENT_OVERAGE_MENU_SHOWN = 'gemini_cli.overage_menu_shown';
export class OverageMenuShownEvent implements BaseTelemetryEvent {
  'event.name': 'overage_menu_shown';
  'event.timestamp': string;
  model: string;
  credit_balance: number;
  overage_strategy: OverageStrategy;

  constructor(
    model: string,
    creditBalance: number,
    overageStrategy: OverageStrategy,
  ) {
    this['event.name'] = 'overage_menu_shown';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
    this.credit_balance = creditBalance;
    this.overage_strategy = overageStrategy;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return 'Overage menu shown.';
  }
}

export const EVENT_OVERAGE_OPTION_SELECTED =
  'gemini_cli.overage_option_selected';
export class OverageOptionSelectedEvent implements BaseTelemetryEvent {
  'event.name': 'overage_option_selected';
  'event.timestamp': string;
  model: string;
  selected_option: OverageOption;
  credit_balance: number;

  constructor(
    model: string,
    selectedOption: OverageOption,
    creditBalance: number,
  ) {
    this['event.name'] = 'overage_option_selected';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
    this.selected_option = selectedOption;
    this.credit_balance = creditBalance;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return 'Overage option selected.';
  }
}

export const EVENT_EMPTY_WALLET_MENU_SHOWN =
  'gemini_cli.empty_wallet_menu_shown';
export class EmptyWalletMenuShownEvent implements BaseTelemetryEvent {
  'event.name': 'empty_wallet_menu_shown';
  'event.timestamp': string;
  model: string;

  constructor(model: string) {
    this['event.name'] = 'empty_wallet_menu_shown';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return 'Empty wallet menu shown.';
  }
}

export const EVENT_CREDIT_PURCHASE_CLICK = 'gemini_cli.credit_purchase_click';
export class CreditPurchaseClickEvent implements BaseTelemetryEvent {
  'event.name': 'credit_purchase_click';
  'event.timestamp': string;
  source: 'overage_menu' | 'empty_wallet_menu' | 'manage';
  model: string;

  constructor(
    source: 'overage_menu' | 'empty_wallet_menu' | 'manage',
    model: string,
  ) {
    this['event.name'] = 'credit_purchase_click';
    this['event.timestamp'] = new Date().toISOString();
    this.source = source;
    this.model = model;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return 'Credit purchase click.';
  }
}

export const EVENT_CREDITS_USED = 'gemini_cli.credits_used';
export class CreditsUsedEvent implements BaseTelemetryEvent {
  'event.name': 'credits_used';
  'event.timestamp': string;
  model: string;
  credits_consumed: number;
  credits_remaining: number;

  constructor(
    model: string,
    creditsConsumed: number,
    creditsRemaining: number,
  ) {
    this['event.name'] = 'credits_used';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
    this.credits_consumed = creditsConsumed;
    this.credits_remaining = creditsRemaining;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return 'Credits used.';
  }
}

export const EVENT_API_KEY_UPDATED = 'gemini_cli.api_key_updated';
export class ApiKeyUpdatedEvent implements BaseTelemetryEvent {
  'event.name': 'api_key_updated';
  'event.timestamp': string;
  previous_auth_type: string;
  new_auth_type: string;

  constructor(previousAuthType: string, newAuthType: string) {
    this['event.name'] = 'api_key_updated';
    this['event.timestamp'] = new Date().toISOString();
    this.previous_auth_type = previousAuthType;
    this.new_auth_type = newAuthType;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return 'API key updated.';
  }
}

export type BillingTelemetryEvent =
  | OverageMenuShownEvent
  | OverageOptionSelectedEvent
  | EmptyWalletMenuShownEvent
  | CreditPurchaseClickEvent
  | CreditsUsedEvent;
