/**
 * App-wide constants and enums.
 */

export const ASSET_TYPE_LISTED = [
  'stock',
  'etf',
  'crypto',
  'metal',
] as const;

export const ASSET_TYPE_NON_LISTED = [
  'fixed_income',
  'real_estate',
  'cash',
  'other',
] as const;

export const ASSET_TYPES = [...ASSET_TYPE_LISTED, ...ASSET_TYPE_NON_LISTED] as const;

export type AssetTypeListed = (typeof ASSET_TYPE_LISTED)[number];
export type AssetTypeNonListed = (typeof ASSET_TYPE_NON_LISTED)[number];
export type AssetType = (typeof ASSET_TYPES)[number];

export const EVENT_KINDS = [
  'maturity',
  'coupon',
  'amortization',
  'valuation_reminder',
  'custom',
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export const FREE_HOLDINGS_LIMIT = 15;
export const FREE_REMINDER_SCHEDULES_LIMIT = 1;
export const DEFAULT_REMIND_DAYS_BEFORE = 3;
export const STAX_SCORE_TOP_HOLDING_THRESHOLD = 25;
export const STAX_SCORE_TOP3_THRESHOLD = 60;
export const STAX_SCORE_COUNTRY_THRESHOLD = 70;
export const STAX_SCORE_SECTOR_THRESHOLD = 40;
export const STAX_SCORE_CRYPTO_PENALTY_THRESHOLD = 30;
export const STAX_SCORE_TOP_HOLDING_PENALTY = 15;
export const STAX_SCORE_TOP3_PENALTY = 15;
export const STAX_SCORE_COUNTRY_PENALTY = 15;
export const STAX_SCORE_SECTOR_PENALTY = 10;
export const STAX_SCORE_CRYPTO_PENALTY = 10;
