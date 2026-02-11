/**
 * FIFO (First In, First Out) cost-basis matching for sell transactions.
 * Pure function — no DB access. Lots must be sorted oldest-first (timestamp ASC).
 */
import type { Lot } from '../../data/schemas';

export interface ConsumedLot {
  lotId: string;
  qtyConsumed: number;
  costConsumed: number;
}

export interface FifoResult {
  realizedGainLoss: number;
  totalCostConsumed: number;
  consumedLots: ConsumedLot[];
}

/**
 * Compute realized gain/loss from selling `sellQty` units at `sellPricePerUnit`.
 * Walks lots oldest-first (FIFO), consuming units until sellQty is fulfilled.
 *
 * If lots lack cost basis data, realizedGainLoss will only reflect lots with known cost.
 * Returns the total cost consumed (for adjusting holding.costBasis).
 */
export function computeFifoSell(
  lots: Lot[],
  sellQty: number,
  sellPricePerUnit: number,
): FifoResult {
  let remaining = sellQty;
  let totalCostConsumed = 0;
  let totalProceeds = 0;
  const consumedLots: ConsumedLot[] = [];

  for (const lot of lots) {
    if (remaining <= 0) break;

    const available = lot.qtyIn;
    const consume = Math.min(remaining, available);

    let costForConsume = 0;
    if (lot.costBasisUsdTotal != null && lot.costBasisUsdTotal > 0) {
      const costPerUnit = lot.costBasisUsdTotal / lot.qtyIn;
      costForConsume = costPerUnit * consume;
    }

    totalCostConsumed += costForConsume;
    totalProceeds += consume * sellPricePerUnit;

    consumedLots.push({
      lotId: lot.id,
      qtyConsumed: consume,
      costConsumed: costForConsume,
    });

    remaining -= consume;
  }

  return {
    realizedGainLoss: totalProceeds - totalCostConsumed,
    totalCostConsumed,
    consumedLots,
  };
}
