import { Router } from "express";

const router = Router();

router.get("/academy/search", async (req, res) => {
  const q = req.query.q as string;
  if (!q?.trim()) { res.status(400).json({ error: "q is required" }); return; }
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1&t=digit_killer`;
    const resp = await fetch(url, { headers: { "User-Agent": "DigitKiller/1.0 (educational)" }, signal: AbortSignal.timeout(8000) });
    const data = await resp.json() as Record<string, unknown>;
    const results: { title: string; snippet: string; url: string; type: string }[] = [];

    if (data.AbstractText) {
      results.push({ title: (data.Heading as string) || q, snippet: data.AbstractText as string, url: (data.AbstractURL as string) || "", type: "abstract" });
    }
    const topics = (data.RelatedTopics as Array<Record<string, unknown>>) ?? [];
    for (const t of topics.slice(0, 8)) {
      if (t.Text) results.push({ title: ((t.FirstURL as string) ?? "").split("/").pop()?.replace(/_/g, " ") ?? "", snippet: t.Text as string, url: (t.FirstURL as string) ?? "", type: "topic" });
    }
    const defs = (data.Definitions as Array<Record<string, unknown>>) ?? [];
    for (const d of defs.slice(0, 2)) {
      if (d.Definition) results.push({ title: "Definition", snippet: d.Definition as string, url: (d.DefinitionURL as string) ?? "", type: "definition" });
    }
    if (results.length === 0 && data.Answer) {
      results.push({ title: "Quick Answer", snippet: data.Answer as string, url: "", type: "answer" });
    }
    res.json({ query: q, results, answer: data.Answer ?? null });
  } catch (err) {
    req.log.warn({ err, q }, "Academy search failed");
    res.status(500).json({ error: "Search service unavailable. Try a different query." });
  }
});

router.post("/academy/analyse", (req, res) => {
  const { content, type = "text", filename = "file" } = req.body as { content?: string; type?: string; filename?: string };
  if (!content?.trim()) { res.status(400).json({ error: "content is required" }); return; }

  const text = content.toLowerCase();
  const analysis: string[] = [];

  const contracts: Record<string, RegExp> = {
    "Rise (CALL)": /\b(rise|call|bullish|buy|long|uptrend)\b/g,
    "Fall (PUT)":  /\b(fall|put|bearish|sell|short|downtrend)\b/g,
    "Even Digit":  /\b(even|even digit|even number)\b/g,
    "Odd Digit":   /\b(odd|odd digit|odd number)\b/g,
    "Over":        /\b(over|above|higher than|greater than)\b/g,
    "Under":       /\b(under|below|lower than|less than)\b/g,
    "Match":       /\b(match|same|repeat|identical)\b/g,
    "Differ":      /\b(differ|different|change|varied)\b/g,
  };
  const detected: string[] = [];
  for (const [name, rx] of Object.entries(contracts)) {
    const m = text.match(rx);
    if (m && m.length > 0) detected.push(`${name}×${m.length}`);
  }

  const pcts    = content.match(/\d+(\.\d+)?%/g) ?? [];
  const prices  = content.match(/\$?\d{1,6}(\.\d{1,5})?/g)?.slice(0, 8) ?? [];
  const tradingKw = ["volatility","confidence","signal","entry","exit","resistance","support","trend","momentum","divergence","overbought","oversold","breakout","reversal","martingale","stake","payout","barrier","digit"];
  const found = tradingKw.filter(w => text.includes(w));

  if (detected.length > 0)  analysis.push(`📊 Contract signals: ${detected.join(" · ")}`);
  if (pcts.length > 0)      analysis.push(`📈 % values: ${pcts.slice(0, 6).join(", ")}`);
  if (prices.length > 0)    analysis.push(`💵 Key values: ${prices.slice(0, 6).join(", ")}`);
  if (found.length > 0)     analysis.push(`🔍 Trading keywords: ${found.join(", ")}`);
  analysis.push(`📄 ${content.split(/\s+/).length} words · ${content.length} chars · ${type.toUpperCase()}`);

  const recommendation = detected.length > 0
    ? `Strongest signal: **${detected[0]}**. Verify with live market data before placing a trade.`
    : "No direct contract signals found. Use as supporting research — always confirm with live analysis.";

  const score = Math.min(100, detected.length * 15 + found.length * 5 + (pcts.length > 0 ? 10 : 0));

  res.json({ filename, type, analysis: detected.length > 0 ? ["✅ Trading content detected", ...analysis] : ["⚠️ General content — limited trading signals", ...analysis], recommendation, detected, score });
});

export default router;
