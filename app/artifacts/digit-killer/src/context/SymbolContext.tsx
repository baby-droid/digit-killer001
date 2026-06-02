import { createContext, useContext, useState } from "react";

interface SymbolContextValue {
  symbol: string;
  setSymbol: (s: string) => void;
}

const SymbolContext = createContext<SymbolContextValue>({
  symbol: "R_50",
  setSymbol: () => {},
});

export function SymbolProvider({ children }: { children: React.ReactNode }) {
  const [symbol, setSymbol] = useState("R_50");
  return (
    <SymbolContext.Provider value={{ symbol, setSymbol }}>
      {children}
    </SymbolContext.Provider>
  );
}

export function useSymbol() {
  return useContext(SymbolContext);
}
