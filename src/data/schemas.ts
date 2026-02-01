import { z } from 'zod';
import {
  ASSET_TYPES,
  EVENT_KINDS,
  type AssetType,
  type EventKind,
} from '../utils/constants';

/** Portfolio entity schema (strict for production). */
export const portfolioSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    baseCurrency: z.string().length(3),
    createdAt: z.string().datetime(),
  })
  .strict();

export type Portfolio = z.infer<typeof portfolioSchema>;

/** Holding metadata (country, sector, provider ids, token contract data). */
export const holdingMetadataSchema = z
  .object({
    country: z.string().optional(),
    sector: z.string().optional(),
    providerId: z.string().optional(),
    contractAddress: z.string().optional(),
    network: z.string().optional(),
  })
  .strict()
  .optional();

/** Holding entity schema. symbol/quantity null when coming from DB for non-listed assets. */
export const holdingSchema = z
  .object({
    id: z.string().uuid(),
    portfolioId: z.string().uuid(),
    type: z.enum(ASSET_TYPES as unknown as [AssetType, ...AssetType[]]),
    name: z.string().min(1),
    symbol: z.string().nullish(),
    quantity: z.number().nonnegative().nullish(),
    costBasis: z.number().nonnegative().nullish(),
    costBasisCurrency: z.string().length(3).nullish(),
    manualValue: z.number().nonnegative().nullish(),
    currency: z.string().min(1),
    metadata: holdingMetadataSchema,
  })
  .strict();

export type Holding = z.infer<typeof holdingSchema>;

/** PricePoint entity schema. Optional quote fields for stocks (previous close, daily change %). */
export const pricePointSchema = z
  .object({
    symbol: z.string().min(1),
    timestamp: z.string().datetime(),
    price: z.number().positive(),
    currency: z.string().length(3),
    source: z.string().min(1),
    previousClose: z.number().nullish(),
    changePercent: z.number().nullish(),
  })
  .strict();

export type PricePoint = z.infer<typeof pricePointSchema>;

/** Portfolio value snapshot for historical chart (one per refresh). */
export const portfolioValueSnapshotSchema = z
  .object({
    id: z.string().uuid(),
    portfolioId: z.string().uuid(),
    timestamp: z.string().datetime(),
    valueBase: z.number().nonnegative(),
    baseCurrency: z.string().length(3),
  })
  .strict();

export type PortfolioValueSnapshot = z.infer<typeof portfolioValueSnapshotSchema>;

/** Event entity schema. */
export const eventSchema = z
  .object({
    id: z.string().uuid(),
    holdingId: z.string().uuid(),
    kind: z.enum(EVENT_KINDS as unknown as [EventKind, ...EventKind[]]),
    date: z.string().datetime(),
    amount: z.number().optional(),
    currency: z.string().length(3).optional(),
    remindDaysBefore: z.number().int().nonnegative(),
    note: z.string().optional(),
  })
  .strict();

export type Event = z.infer<typeof eventSchema>;

/** Create portfolio DTO. */
export const createPortfolioSchema = portfolioSchema.omit({ id: true, createdAt: true }).extend({
  name: z.string().min(1),
  baseCurrency: z.string().length(3),
});

export type CreatePortfolioInput = z.infer<typeof createPortfolioSchema>;

/** Create holding DTO (listed asset). */
export const createListedHoldingSchema = z
  .object({
    portfolioId: z.string().uuid(),
    type: z.enum(['stock', 'etf', 'crypto', 'metal']),
    name: z.string().min(1),
    symbol: z.string().min(1),
    quantity: z.number().positive(),
    costBasis: z.number().nonnegative().optional(),
    costBasisCurrency: z.string().length(3).optional(),
    currency: z.string().min(1),
    metadata: holdingMetadataSchema,
  })
  .strict();

export type CreateListedHoldingInput = z.infer<typeof createListedHoldingSchema>;

/** Create holding DTO (non-listed asset). */
export const createNonListedHoldingSchema = z
  .object({
    portfolioId: z.string().uuid(),
    type: z.enum(['fixed_income', 'real_estate', 'cash', 'other']),
    name: z.string().min(1),
    manualValue: z.number().nonnegative(),
    currency: z.string().min(1),
    note: z.string().optional(),
  })
  .strict();

export type CreateNonListedHoldingInput = z.infer<typeof createNonListedHoldingSchema>;

/** Create event DTO. */
export const createEventSchema = eventSchema.omit({ id: true });

export type CreateEventInput = z.infer<typeof createEventSchema>;

/** Update holding DTO (partial). */
export const updateHoldingSchema = holdingSchema.partial().omit({ id: true, portfolioId: true });

export type UpdateHoldingInput = z.infer<typeof updateHoldingSchema>;

/** Update event DTO (partial). */
export const updateEventSchema = eventSchema.partial().omit({ id: true, holdingId: true });

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/** Lot source: transfer/airdrop/deposit (no buy on-chain), swap (DEX), or manual. */
export const LOT_SOURCES = ['transfer', 'swap', 'manual'] as const;
export type LotSource = (typeof LOT_SOURCES)[number];

/**
 * Lot schema: one acquisition of an asset (supports average cost, FIFO, performance).
 * assetId = chainId:contractAddress (native uses contractAddress null, stored as "chainId:").
 * costBasisUsdPerUnit is derived as costBasisUsdTotal / qtyIn when costBasisUsdTotal is set.
 */
export const lotSchema = z
  .object({
    id: z.string().uuid(),
    holdingId: z.string().uuid(),
    assetId: z.string().min(1),
    timestamp: z.string().datetime(),
    qtyIn: z.number().positive(),
    costBasisUsdTotal: z.number().nonnegative().nullish(),
    source: z.enum(LOT_SOURCES),
  })
  .strict();

export type Lot = z.infer<typeof lotSchema>;

/** Create lot DTO. */
export const createLotSchema = lotSchema.omit({ id: true });

export type CreateLotInput = z.infer<typeof createLotSchema>;

/** Build assetId from chainId and contract address (null/empty for native). */
export function buildAssetId(chainId: number, contractAddress: string | null | undefined): string {
  const addr = contractAddress?.trim().toLowerCase();
  return addr ? `${chainId}:${addr}` : `${chainId}:`;
}
