import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_DESK_STATE } from '../data/seedData';
import {
  applyMarketTick,
  buildPositionsCsv,
  calculatePortfolioMetrics,
  cancelOpenOrder,
  executeOrder,
  reduceOrClosePosition,
} from './tradingEngine';

test('calculatePortfolioMetrics computes consistent NAV and exposure', () => {
  const metrics = calculatePortfolioMetrics(
    INITIAL_DESK_STATE.cash,
    INITIAL_DESK_STATE.initialCapital,
    INITIAL_DESK_STATE.positions,
    INITIAL_DESK_STATE.tickers,
  );

  assert.ok(metrics.nav > 400000);
  assert.ok(metrics.grossExposure > 0);
  assert.ok(metrics.marginUtilPct > 0 && metrics.marginUtilPct <= 100);
  assert.equal(metrics.buyingPower, INITIAL_DESK_STATE.cash * 2.5);
});

test('executeOrder rejects invalid quantities and excessive buying power', () => {
  const zeroQty = executeOrder(INITIAL_DESK_STATE, {
    symbol: 'NVDA-P',
    side: 'BUY',
    type: 'MARKET',
    qty: 0,
  });
  assert.equal(zeroQty.ok, false);

  const overBudget = executeOrder(INITIAL_DESK_STATE, {
    symbol: 'BTC-PERP',
    side: 'BUY',
    type: 'MARKET',
    qty: 500,
  });
  assert.equal(overBudget.ok, false);
});

test('executeOrder adds filled market order and updates position quantity', () => {
  const beforePos = INITIAL_DESK_STATE.positions.find((p) => p.symbol === 'NVDA-P');
  assert.ok(beforePos);

  const res = executeOrder(INITIAL_DESK_STATE, {
    symbol: 'NVDA-P',
    side: 'BUY',
    type: 'MARKET',
    qty: 50,
  });

  assert.equal(res.ok, true);
  assert.equal(res.createdOrder?.status, 'FILLED');
  assert.equal(res.nextState.orders.length, INITIAL_DESK_STATE.orders.length + 1);

  const afterPos = res.nextState.positions.find((p) => p.symbol === 'NVDA-P');
  assert.equal(afterPos?.qty, beforePos.qty + 50);
});

test('cancelOpenOrder transitions OPEN order to CANCELED', () => {
  const openOrder = INITIAL_DESK_STATE.orders.find((o) => o.status === 'OPEN');
  assert.ok(openOrder);

  const next = cancelOpenOrder(INITIAL_DESK_STATE, openOrder.id);
  const updated = next.orders.find((o) => o.id === openOrder.id);
  assert.equal(updated?.status, 'CANCELED');
});

test('reduceOrClosePosition closes 100% of a position cleanly', () => {
  const res = reduceOrClosePosition(INITIAL_DESK_STATE, 'KRNL-V', 1);
  assert.equal(res.ok, true);
  const remaining = res.nextState.positions.find((p) => p.symbol === 'KRNL-V');
  assert.equal(remaining, undefined);
});

test('applyMarketTick updates prices deterministically and buildPositionsCsv outputs valid CSV', () => {
  const ticked = applyMarketTick(INITIAL_DESK_STATE.tickers, 3);
  assert.equal(ticked.length, INITIAL_DESK_STATE.tickers.length);
  assert.notEqual(ticked[0].price, INITIAL_DESK_STATE.tickers[0].price);

  const csv = buildPositionsCsv(INITIAL_DESK_STATE.positions, INITIAL_DESK_STATE.tickers);
  const lines = csv.split('\n');
  assert.equal(lines.length, INITIAL_DESK_STATE.positions.length + 1);
  assert.ok(lines[0].startsWith('Symbol,Side,Quantity'));
});
