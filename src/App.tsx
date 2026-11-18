import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiEndpointConfig, DeskState, ScreenId } from './types/command';
import {
  DEFAULT_API_CONFIG,
  EQUITY_SERIES,
  INITIAL_DESK_STATE,
  SEED_DIAGNOSTICS,
} from './data/seedData';
import {
  applyMarketTick,
  calculatePortfolioMetrics,
  cancelOpenOrder,
  executeOrder,
  reduceOrClosePosition,
  type OrderRequest,
} from './utils/tradingEngine';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { OverviewScreen } from './components/OverviewScreen';
import { MarketsScreen } from './components/MarketsScreen';
import { PitchArenaScreen } from './components/PitchArenaScreen';
import { RiskTelemetryScreen } from './components/RiskTelemetryScreen';
import { ApiBridgeScreen } from './components/ApiBridgeScreen';
import { CommandPalette } from './components/CommandPalette';
import { NewOrderModal } from './components/NewOrderModal';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('overview');
  const [deskState, setDeskState] = useState<DeskState>(INITIAL_DESK_STATE);
  const [apiConfig, setApiConfig] = useState<ApiEndpointConfig>(DEFAULT_API_CONFIG);
  const [tickStep, setTickStep] = useState(1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);

  // Simulated deterministic live tick stream (pausable from Sidebar or Cmd+K)
  useEffect(() => {
    if (!deskState.isStreaming) return;
    const timer = window.setInterval(() => {
      setTickStep((s) => s + 1);
      setDeskState((prev) => ({
        ...prev,
        tickers: applyMarketTick(prev.tickers, tickStep),
      }));
    }, 2400);
    return () => window.clearInterval(timer);
  }, [deskState.isStreaming, tickStep]);

  // Global keyboard shortcuts: Cmd/Ctrl+K for Command Palette, 1-5 for screens
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
        setNewOrderOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const metrics = useMemo(
    () =>
      calculatePortfolioMetrics(
        deskState.cash,
        deskState.initialCapital,
        deskState.positions,
        deskState.tickers,
      ),
    [deskState.cash, deskState.initialCapital, deskState.positions, deskState.tickers],
  );

  const handleSelectSymbol = useCallback((symbol: string) => {
    setDeskState((prev) => ({ ...prev, selectedSymbol: symbol }));
  }, []);

  const handleSubmitOrder = useCallback((req: OrderRequest) => {
    let outcome: { ok: boolean; error?: string } = { ok: false, error: 'Order failed.' };
    setDeskState((prev) => {
      const res = executeOrder(prev, req);
      outcome = { ok: res.ok, error: res.error };
      return res.nextState;
    });
    return outcome;
  }, []);

  const handleCancelOrder = useCallback((orderId: string) => {
    setDeskState((prev) => cancelOpenOrder(prev, orderId));
  }, []);

  const handleReducePosition = useCallback((symbol: string, fraction: number) => {
    setDeskState((prev) => reduceOrClosePosition(prev, symbol, fraction).nextState);
  }, []);

  const handleBackTeam = useCallback((teamId: string, amountUsd: number) => {
    setDeskState((prev) => {
      const target = prev.pitchTeams.find((t) => t.id === teamId);
      if (!target || amountUsd <= 0 || amountUsd > prev.cash) return prev;
      return {
        ...prev,
        cash: prev.cash - amountUsd,
        pitchTeams: prev.pitchTeams.map((t) =>
          t.id === teamId
            ? {
                ...t,
                backingTotal: t.backingTotal + amountUsd,
                impliedValuationM: Number((t.impliedValuationM + amountUsd / 125000).toFixed(1)),
                changePct: Number((t.changePct + 0.4).toFixed(2)),
              }
            : t,
        ),
      };
    });
  }, []);

  const handleToggleStreaming = useCallback(() => {
    setDeskState((prev) => ({ ...prev, isStreaming: !prev.isStreaming }));
  }, []);

  const openOrdersCount = deskState.orders.filter((o) => o.status === 'OPEN').length;

  return (
    <div className="min-h-screen bg-[#070909] text-[#F2F5F3] flex overflow-hidden">
      <Sidebar
        activeScreen={activeScreen}
        onSelectScreen={setActiveScreen}
        isStreaming={deskState.isStreaming}
        onToggleStreaming={handleToggleStreaming}
        openOrdersCount={openOrdersCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar
          activeScreen={activeScreen}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenCommandPalette={() => setPaletteOpen(true)}
          onOpenNewOrder={() => setNewOrderOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-[1440px] mx-auto">
            {activeScreen === 'overview' && (
              <OverviewScreen
                state={deskState}
                metrics={metrics}
                equitySeries={EQUITY_SERIES}
                onSelectSymbol={handleSelectSymbol}
                onSubmitOrder={handleSubmitOrder}
                onNavigateMarkets={() => setActiveScreen('markets')}
              />
            )}

            {activeScreen === 'markets' && (
              <MarketsScreen
                state={deskState}
                metrics={metrics}
                onSelectSymbol={handleSelectSymbol}
                onSubmitOrder={handleSubmitOrder}
                onCancelOrder={handleCancelOrder}
              />
            )}

            {activeScreen === 'arena' && (
              <PitchArenaScreen
                teams={deskState.pitchTeams}
                cashAvailable={deskState.cash}
                onBackTeam={handleBackTeam}
              />
            )}

            {activeScreen === 'risk' && (
              <RiskTelemetryScreen
                state={deskState}
                metrics={metrics}
                diagnostics={SEED_DIAGNOSTICS}
                onReducePosition={handleReducePosition}
              />
            )}

            {activeScreen === 'config' && (
              <ApiBridgeScreen
                config={apiConfig}
                state={deskState}
                onUpdateConfig={setApiConfig}
              />
            )}
          </div>
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        tickers={deskState.tickers}
        onNavigate={setActiveScreen}
        onSelectSymbol={handleSelectSymbol}
        onToggleStream={handleToggleStreaming}
        isStreaming={deskState.isStreaming}
      />

      <NewOrderModal
        open={newOrderOpen}
        onClose={() => setNewOrderOpen(false)}
        tickers={deskState.tickers}
        selectedSymbol={deskState.selectedSymbol}
        buyingPower={metrics.buyingPower}
        onSelectSymbol={handleSelectSymbol}
        onSubmitOrder={handleSubmitOrder}
      />
    </div>
  );
}
