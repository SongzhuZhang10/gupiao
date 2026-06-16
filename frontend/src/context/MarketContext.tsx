import React, { createContext, useContext, useMemo, useState } from 'react';

export type MarketRegion = 'cn' | 'us';

const STORAGE_KEY = 'preferredMarket';

interface MarketContextValue {
  market: MarketRegion;
  setMarket: (market: MarketRegion) => void;
  marketLabel: string;
}

const MarketContext = createContext<MarketContextValue | undefined>(undefined);

function readStoredMarket(): MarketRegion {
  if (typeof window === 'undefined') return 'cn';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'us' ? 'us' : 'cn';
}

export const MarketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [market, setMarketState] = useState<MarketRegion>(readStoredMarket);

  const setMarket = (nextMarket: MarketRegion) => {
    setMarketState(nextMarket);
    window.localStorage.setItem(STORAGE_KEY, nextMarket);
  };

  const value = useMemo<MarketContextValue>(() => ({
    market,
    setMarket,
    marketLabel: market === 'us' ? '美股' : 'A股',
  }), [market]);

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
};

export function useMarket(): MarketContextValue {
  const context = useContext(MarketContext);
  if (!context) {
    throw new Error('useMarket must be used within MarketProvider');
  }
  return context;
}
