import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface ThemeDef {
  id: string; name: string; description: string; preview: string;
  vars: Record<string, string>;
}

export interface FontDef { id: string; name: string; googleUrl: string; bodyFamily: string; brandFamily: string; labelFamily: string; }
export interface SizeDef  { id: string; name: string; scale: number; }

export const THEMES: ThemeDef[] = [
  {
    id: "cyber-neon", name: "Cyber Neon", description: "Default neon cyan on deep black", preview: "#00e5ff",
    vars: { "--background":"214 55% 3%","--foreground":"190 100% 92%","--card":"214 55% 5%","--card-foreground":"190 100% 92%","--popover":"214 50% 4%","--popover-foreground":"190 100% 92%","--primary":"187 100% 50%","--primary-foreground":"214 55% 3%","--secondary":"214 40% 10%","--secondary-foreground":"190 100% 80%","--muted":"214 40% 8%","--muted-foreground":"214 20% 50%","--accent":"140 100% 50%","--accent-foreground":"214 55% 3%","--border":"214 30% 14%","--ring":"187 100% 50%","--sidebar-background":"214 60% 4%","--sidebar-border":"214 30% 10%","--sidebar-accent":"187 100% 50%" },
  },
  {
    id: "matrix", name: "Matrix", description: "Classic hacker green on black", preview: "#00ff41",
    vars: { "--background":"120 100% 1.5%","--foreground":"120 80% 90%","--card":"120 100% 2.5%","--card-foreground":"120 80% 88%","--popover":"120 100% 2%","--popover-foreground":"120 80% 88%","--primary":"130 100% 50%","--primary-foreground":"120 100% 2%","--secondary":"120 50% 7%","--secondary-foreground":"120 80% 75%","--muted":"120 50% 5%","--muted-foreground":"120 30% 42%","--accent":"100 100% 50%","--accent-foreground":"120 100% 2%","--border":"120 50% 10%","--ring":"130 100% 50%","--sidebar-background":"120 100% 2%","--sidebar-border":"120 50% 8%","--sidebar-accent":"130 100% 50%" },
  },
  {
    id: "synthwave", name: "Synthwave", description: "Purple & pink retro wave", preview: "#e040fb",
    vars: { "--background":"275 100% 4%","--foreground":"280 80% 92%","--card":"275 100% 6%","--card-foreground":"280 80% 90%","--popover":"275 100% 5%","--popover-foreground":"280 80% 90%","--primary":"292 95% 62%","--primary-foreground":"275 100% 4%","--secondary":"275 60% 12%","--secondary-foreground":"280 80% 78%","--muted":"275 60% 8%","--muted-foreground":"275 30% 48%","--accent":"320 100% 70%","--accent-foreground":"275 100% 4%","--border":"275 50% 16%","--ring":"292 95% 62%","--sidebar-background":"275 100% 5%","--sidebar-border":"275 50% 12%","--sidebar-accent":"292 95% 62%" },
  },
  {
    id: "deep-space", name: "Deep Space", description: "Electric blue on deep navy", preview: "#4fc3f7",
    vars: { "--background":"215 80% 3%","--foreground":"205 90% 92%","--card":"215 80% 5%","--card-foreground":"205 90% 90%","--popover":"215 80% 4%","--popover-foreground":"205 90% 90%","--primary":"205 90% 67%","--primary-foreground":"215 80% 3%","--secondary":"215 60% 10%","--secondary-foreground":"205 90% 78%","--muted":"215 60% 7%","--muted-foreground":"215 25% 46%","--accent":"195 100% 60%","--accent-foreground":"215 80% 3%","--border":"215 40% 13%","--ring":"205 90% 67%","--sidebar-background":"215 80% 4%","--sidebar-border":"215 40% 10%","--sidebar-accent":"205 90% 67%" },
  },
  {
    id: "terminal", name: "Terminal", description: "Old-school amber terminal", preview: "#ffb300",
    vars: { "--background":"0 0% 3%","--foreground":"45 100% 88%","--card":"0 0% 5%","--card-foreground":"45 100% 85%","--popover":"0 0% 4%","--popover-foreground":"45 100% 85%","--primary":"45 100% 50%","--primary-foreground":"0 0% 3%","--secondary":"0 0% 9%","--secondary-foreground":"45 100% 75%","--muted":"0 0% 7%","--muted-foreground":"0 0% 42%","--accent":"38 100% 55%","--accent-foreground":"0 0% 3%","--border":"0 0% 14%","--ring":"45 100% 50%","--sidebar-background":"0 0% 4%","--sidebar-border":"0 0% 11%","--sidebar-accent":"45 100% 50%" },
  },
  {
    id: "crimson", name: "Crimson", description: "Bold red on near-black", preview: "#ff1744",
    vars: { "--background":"340 80% 2.5%","--foreground":"0 80% 92%","--card":"340 80% 4.5%","--card-foreground":"0 80% 90%","--popover":"340 80% 3.5%","--popover-foreground":"0 80% 90%","--primary":"351 100% 54%","--primary-foreground":"340 80% 2.5%","--secondary":"340 50% 9%","--secondary-foreground":"0 80% 78%","--muted":"340 50% 6%","--muted-foreground":"340 20% 44%","--accent":"325 100% 65%","--accent-foreground":"340 80% 2.5%","--border":"340 40% 13%","--ring":"351 100% 54%","--sidebar-background":"340 80% 3.5%","--sidebar-border":"340 40% 10%","--sidebar-accent":"351 100% 54%" },
  },
  {
    id: "gold-rush", name: "Gold Rush", description: "Rich gold & amber on dark", preview: "#ffd600",
    vars: { "--background":"40 80% 3%","--foreground":"45 100% 90%","--card":"40 80% 5%","--card-foreground":"45 100% 88%","--popover":"40 80% 4%","--popover-foreground":"45 100% 88%","--primary":"52 100% 50%","--primary-foreground":"40 80% 3%","--secondary":"40 60% 9%","--secondary-foreground":"45 100% 78%","--muted":"40 60% 7%","--muted-foreground":"40 20% 44%","--accent":"30 100% 55%","--accent-foreground":"40 80% 3%","--border":"40 40% 13%","--ring":"52 100% 50%","--sidebar-background":"40 80% 4%","--sidebar-border":"40 40% 10%","--sidebar-accent":"52 100% 50%" },
  },
  {
    id: "ocean-depths", name: "Ocean Depths", description: "Deep teal & aqua on dark ocean", preview: "#00bcd4",
    vars: { "--background":"195 80% 3%","--foreground":"188 90% 90%","--card":"195 80% 5%","--card-foreground":"188 90% 88%","--popover":"195 80% 4%","--popover-foreground":"188 90% 88%","--primary":"188 100% 43%","--primary-foreground":"195 80% 3%","--secondary":"195 60% 9%","--secondary-foreground":"188 90% 77%","--muted":"195 60% 6%","--muted-foreground":"195 25% 43%","--accent":"170 100% 48%","--accent-foreground":"195 80% 3%","--border":"195 40% 12%","--ring":"188 100% 43%","--sidebar-background":"195 80% 4%","--sidebar-border":"195 40% 9%","--sidebar-accent":"188 100% 43%" },
  },
  {
    id: "midnight-purple", name: "Midnight Purple", description: "Lavender glow on deep purple", preview: "#b388ff",
    vars: { "--background":"260 75% 3%","--foreground":"270 80% 92%","--card":"260 75% 5%","--card-foreground":"270 80% 90%","--popover":"260 75% 4%","--popover-foreground":"270 80% 90%","--primary":"270 100% 77%","--primary-foreground":"260 75% 3%","--secondary":"260 60% 10%","--secondary-foreground":"270 80% 78%","--muted":"260 60% 7%","--muted-foreground":"260 25% 46%","--accent":"290 100% 72%","--accent-foreground":"260 75% 3%","--border":"260 40% 14%","--ring":"270 100% 77%","--sidebar-background":"260 75% 4%","--sidebar-border":"260 40% 11%","--sidebar-accent":"270 100% 77%" },
  },
  {
    id: "solar-flare", name: "Solar Flare", description: "Blazing orange on dark void", preview: "#ff6d00",
    vars: { "--background":"20 100% 3%","--foreground":"35 100% 90%","--card":"20 100% 5%","--card-foreground":"35 100% 88%","--popover":"20 100% 4%","--popover-foreground":"35 100% 88%","--primary":"26 100% 50%","--primary-foreground":"20 100% 3%","--secondary":"20 70% 9%","--secondary-foreground":"35 100% 77%","--muted":"20 70% 6%","--muted-foreground":"20 25% 43%","--accent":"45 100% 55%","--accent-foreground":"20 100% 3%","--border":"20 45% 13%","--ring":"26 100% 50%","--sidebar-background":"20 100% 4%","--sidebar-border":"20 45% 10%","--sidebar-accent":"26 100% 50%" },
  },
  {
    id: "arctic-ice", name: "Arctic Ice", description: "Cool ice blue on dark navy", preview: "#82b1ff",
    vars: { "--background":"220 80% 3%","--foreground":"215 90% 92%","--card":"220 80% 5%","--card-foreground":"215 90% 90%","--popover":"220 80% 4%","--popover-foreground":"215 90% 90%","--primary":"226 100% 75%","--primary-foreground":"220 80% 3%","--secondary":"220 60% 10%","--secondary-foreground":"215 90% 78%","--muted":"220 60% 7%","--muted-foreground":"220 25% 45%","--accent":"200 100% 70%","--accent-foreground":"220 80% 3%","--border":"220 40% 13%","--ring":"226 100% 75%","--sidebar-background":"220 80% 4%","--sidebar-border":"220 40% 10%","--sidebar-accent":"226 100% 75%" },
  },
  {
    id: "rose-neon", name: "Rose Neon", description: "Hot pink neon on pure black", preview: "#ff4081",
    vars: { "--background":"330 80% 2.5%","--foreground":"330 80% 92%","--card":"330 80% 4.5%","--card-foreground":"330 80% 90%","--popover":"330 80% 3.5%","--popover-foreground":"330 80% 90%","--primary":"338 100% 63%","--primary-foreground":"330 80% 2.5%","--secondary":"330 60% 9%","--secondary-foreground":"330 80% 77%","--muted":"330 60% 6%","--muted-foreground":"330 20% 44%","--accent":"308 100% 68%","--accent-foreground":"330 80% 2.5%","--border":"330 40% 13%","--ring":"338 100% 63%","--sidebar-background":"330 80% 3.5%","--sidebar-border":"330 40% 10%","--sidebar-accent":"338 100% 63%" },
  },
];

export const FONTS: FontDef[] = [
  {
    id: "cyber", name: "Cyber (Default)",
    googleUrl: "",
    bodyFamily: "'Space Grotesk', sans-serif",
    brandFamily: "'Orbitron', sans-serif",
    labelFamily: "'Rajdhani', sans-serif",
  },
  {
    id: "mono", name: "Monospace Pro",
    googleUrl: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap",
    bodyFamily: "'JetBrains Mono', monospace",
    brandFamily: "'JetBrains Mono', monospace",
    labelFamily: "'JetBrains Mono', monospace",
  },
  {
    id: "inter", name: "Clean Inter",
    googleUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    bodyFamily: "'Inter', sans-serif",
    brandFamily: "'Inter', sans-serif",
    labelFamily: "'Inter', sans-serif",
  },
  {
    id: "audiowide", name: "Futuristic",
    googleUrl: "https://fonts.googleapis.com/css2?family=Audiowide&display=swap",
    bodyFamily: "'Audiowide', sans-serif",
    brandFamily: "'Audiowide', sans-serif",
    labelFamily: "'Audiowide', sans-serif",
  },
  {
    id: "exo2", name: "Exo Sci-Fi",
    googleUrl: "https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700;800&display=swap",
    bodyFamily: "'Exo 2', sans-serif",
    brandFamily: "'Exo 2', sans-serif",
    labelFamily: "'Exo 2', sans-serif",
  },
];

export const SIZES: SizeDef[] = [
  { id: "xs",  name: "Extra Small",    scale: 0.8   },
  { id: "sm",  name: "Small",          scale: 0.875 },
  { id: "md",  name: "Medium (Default)", scale: 1   },
  { id: "lg",  name: "Large",          scale: 1.125 },
  { id: "xl",  name: "Extra Large",    scale: 1.25  },
];

interface ThemeCtx {
  themeId: string; fontId: string; sizeId: string;
  setTheme: (id: string) => void;
  setFont:  (id: string) => void;
  setSize:  (id: string) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  themeId: "cyber-neon", fontId: "cyber", sizeId: "md",
  setTheme: () => {}, setFont: () => {}, setSize: () => {},
});

function applyTheme(t: ThemeDef) {
  const root = document.documentElement;
  for (const [key, val] of Object.entries(t.vars)) root.style.setProperty(key, val);
}

function applyFont(f: FontDef) {
  if (f.googleUrl) {
    const id = `gfont-${f.id}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id; link.rel = "stylesheet"; link.href = f.googleUrl;
      document.head.appendChild(link);
    }
  }
  const root = document.documentElement;
  root.style.setProperty("--font-body", f.bodyFamily);
  root.style.setProperty("--font-brand", f.brandFamily);
  root.style.setProperty("--font-label", f.labelFamily);
  root.setAttribute("data-font", f.id);
}

function applySize(s: SizeDef) {
  document.documentElement.style.setProperty("--ui-scale", String(s.scale));
  document.documentElement.setAttribute("data-size", s.id);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState(() => localStorage.getItem("dk_theme") ?? "cyber-neon");
  const [fontId,  setFontId]  = useState(() => localStorage.getItem("dk_font")  ?? "cyber");
  const [sizeId,  setSizeId]  = useState(() => localStorage.getItem("dk_size")  ?? "md");

  useEffect(() => {
    const t = THEMES.find(x => x.id === themeId) ?? THEMES[0];
    const f = FONTS.find(x => x.id === fontId) ?? FONTS[0];
    const s = SIZES.find(x => x.id === sizeId) ?? SIZES[2];
    applyTheme(t); applyFont(f); applySize(s);
  }, [themeId, fontId, sizeId]);

  const setTheme = (id: string) => { setThemeId(id); localStorage.setItem("dk_theme", id); };
  const setFont  = (id: string) => { setFontId(id);  localStorage.setItem("dk_font",  id); };
  const setSize  = (id: string) => { setSizeId(id);  localStorage.setItem("dk_size",  id); };

  return (
    <ThemeContext.Provider value={{ themeId, fontId, sizeId, setTheme, setFont, setSize }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }
