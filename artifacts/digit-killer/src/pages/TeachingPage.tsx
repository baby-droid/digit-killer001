import { useState, useMemo, useRef, useCallback } from "react";
import { GraduationCap, BookOpen, Target, Zap, CheckCircle, XCircle, ChevronRight, Download, Star, Trophy, Lock, Play, Search, X, Plus, Camera, FileText, Globe, Loader2, ChevronDown, ChevronUp, UploadCloud, Trash2 } from "lucide-react";

type Level = "beginner" | "intermediate" | "pro";

interface Lesson {
  id: string;
  title: string;
  duration: string;
  description: string;
  content: string[];
  keyPoints: string[];
  strategy?: string;
  example?: string;
  difficulty: number;
}

interface QuizQuestion {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

interface Challenge {
  title: string;
  description: string;
  target: string;
  timeframe: string;
  rules: string[];
  difficulty: number;
  reward: string;
}

const LESSONS: Record<Level, Lesson[]> = {
  beginner: [
    {
      id: "b1", title: "What Are Digit Contracts?", duration: "5 min", difficulty: 1,
      description: "Learn the fundamentals of digit-based contracts on the Deriv platform.",
      content: [
        "Digit contracts are based on the last digit (0–9) of a market's price at contract expiry.",
        "The price is taken at a fixed number of ticks (1–5 ticks) after you buy the contract.",
        "Volatility Index markets (R_10, R_50, R_100, etc.) are the best for digit trading because they are pure noise — no fundamental bias.",
        "Your job as a digit trader is to identify statistical patterns in the digit frequency distribution.",
      ],
      keyPoints: [
        "Last digit = the final number after the decimal (e.g., price 1234.567 → digit 7)",
        "Each digit (0–9) should appear ~10% of the time in a random market",
        "Anomalies (digit above 11% or below 9%) create trading opportunities",
        "Contract types: Even/Odd, Over/Under, Match/Differ",
      ],
      strategy: "Start with Even/Odd contracts — they win roughly 50% of the time with a balanced distribution.",
      example: "If the last 100 ticks show digit '5' appeared only 6 times (6%), but historically it should be ~10%, consider a MATCH contract on digit 5 — statistical mean reversion suggests it may appear more frequently.",
    },
    {
      id: "b2", title: "Even / Odd Contracts", duration: "7 min", difficulty: 1,
      description: "Understand how to read the Even/Odd signal and when to enter a trade.",
      content: [
        "Even digits: 0, 2, 4, 6, 8 — Odd digits: 1, 3, 5, 7, 9",
        "In a perfectly random market, even and odd outcomes each appear 50% of the time.",
        "The Even/Odd strategy looks for a specific pattern: one digit group dominating while the other is suppressed.",
        "BUY EVEN signal: When watching ODD digits, exactly ONE odd digit rises above 10.2% while all others stay below — and the preceding tick was an ODD digit.",
        "BUY ODD signal: Mirror image — one EVEN digit elevated above 10.2%, all others below, preceding tick was EVEN.",
        "Streak pattern: 2–4 consecutive outcomes of one parity followed by 2 of the other parity creates a reversal signal.",
      ],
      keyPoints: [
        "Threshold: 10.2% means a digit is 'elevated' above random expectation",
        "Exactly ONE elevated digit = the anomaly is concentrated, not spread",
        "Preceding digit confirms the current market bias direction",
        "Streak: mean reversion after a run of same-parity outcomes",
      ],
      strategy: "Always use 1000 ticks for analysis — this gives a statistically meaningful sample size.",
      example: "Odd digits: 1→9.8%, 3→9.5%, 5→10.45%, 7→9.3%, 9→10.1%. Digit 5 is the only one above 10.2%. If the preceding tick was also odd → BUY EVEN signal triggered.",
    },
    {
      id: "b3", title: "Over / Under Contracts", duration: "5 min", difficulty: 1,
      description: "Master the Over/Under barrier strategy using digit frequency analysis.",
      content: [
        "Over/Under contracts pay if the final digit is strictly over (or under) a barrier digit.",
        "Over 4 means: win if last digit is 5, 6, 7, 8, or 9 (5 digits out of 10) → 50% win rate base",
        "Over 6 means: win if last digit is 7, 8, or 9 (30% base probability) — higher payout but lower win rate",
        "The signal: if digits 0–4 are over-represented recently, an 'Under 5' trade may be contrarian",
        "Or: if high digits (6–9) are dominant, 'Over 4' has strong historical backing in current momentum",
      ],
      keyPoints: [
        "Barrier 4 (Over/Under): 50/50 split — safest entry",
        "Barrier 3 (Under): 40% win rate but 2.5× payout",
        "Look at the current digit distribution — which half dominates?",
        "Combine with momentum: 3+ consecutive high/low digits = signal",
      ],
      strategy: "Start with Over/Under 4 (the 50/50 barrier) until you understand the digit flow, then move to higher-edge barriers.",
      example: "If recent 20 ticks: 7,8,6,9,5,8,7,6,8,9,7,5,8,6,7 — all high digits. Consider 'Over 4' contract for continuation momentum.",
    },
  ],
  intermediate: [
    {
      id: "i1", title: "Match / Differ Strategy — Fundamentals", duration: "8 min", difficulty: 2,
      description: "Use Markov chain analysis and digit frequency to predict exact digit matches.",
      content: [
        "Match contracts: win if the EXACT target digit appears as the last digit on expiry",
        "Differ contracts: win if the last digit is NOT your target — 9 out of 10 outcomes win",
        "The key insight: digit frequency never stays perfectly flat. Some digits get 'hot' or 'cold'.",
        "A digit that has appeared only 6–7% over 200 ticks is 'cold' — mean reversion suggests a MATCH opportunity.",
        "A digit that has appeared 13–14% is 'hot' — a DIFFER on that digit (betting it won't appear) can be profitable.",
        "Markov chains: look at what digit tends to follow the current digit. Some digit pairs have non-random transition probabilities.",
      ],
      keyPoints: [
        "Cold digit (<8%): high probability MATCH candidate",
        "Hot digit (>13%): DIFFER target — bet it won't repeat",
        "MATCH pays ~9× stake — use small stakes",
        "Markov: from current digit X, find the digit most likely to follow",
      ],
      strategy: "For MATCH: identify the 2 least-frequent digits over 500 ticks. Bet one tick MATCH on one of them. Rotate if not hit in 10 attempts.",
      example: "500-tick distribution: digit 3 → 6.2%, digit 8 → 7.1%. Both cold. MATCH digit 3 for 1 tick, small stake. Expected payout: ~9×. Win rate in this scenario: ~12% but adjusted expected value is positive when payout ratio exceeds the implied probability.",
    },
    {
      id: "i4", title: "Match Contracts — 5 AI Strategies (PDF Guide)", duration: "12 min", difficulty: 2,
      description: "Master the 5 PDF-based strategies the AI uses to recommend Match contracts with high confidence.",
      content: [
        "Strategy 1 — Delayed Digit Exhaustion: If a digit has not appeared in 15–25 ticks, statistical pressure builds for it to return. Entry: 1 tick MATCH on the absent digit. Works best on Vol 10 and Vol 25 (faster tick rate).",
        "Strategy 2 — Double Echo Return: When the same digit appears twice within the last 5 ticks, it is in a 'cluster mode'. There is an elevated probability it appears a third time shortly. Entry: 1 tick MATCH on the repeated digit.",
        "Strategy 3 — Compression Release: If only 3–4 unique digits appear in the last 15 ticks, the market is 'compressed'. The missing digits are overdue. Entry: 1 tick MATCH on the digit absent from the compressed window.",
        "Strategy 4 — Triple Repetition Continuation (high risk): Same digit 3× in a row creates a very rare continuation. Small stake only. 1-tick MATCH on that digit.",
        "Strategy 5 — Fractal Mirror Pattern: An alternating ABAB pattern in the last 4 ticks (e.g., 3,7,3,7) suggests the sequence will continue. Entry: 1 tick MATCH on whichever digit was last 2 positions ago.",
        "All Match strategies should use 1-tick duration — faster settlement means quicker feedback and less price movement risk.",
        "The AI Signal Config in Speed Lab uses these strategies automatically when you select AI Match (auto digit).",
      ],
      keyPoints: [
        "Exhaustion: digit absent 15–25 ticks = high-confidence MATCH signal",
        "Double Echo: same digit ×2 in last 5 = echo return likely",
        "Compression: ≤4 unique digits in 15 ticks = breakout of missing digit",
        "Always use 1 tick for Match contracts — minimize settlement time",
        "Confidence hierarchy: Exhaustion > Echo > Compression > Fractal > Fallback",
      ],
      strategy: "Check the Match/Differ page for live AI signal. If confidence ≥ 65% and strategy is Delayed Exhaustion or Double Echo, enter with 1-tick MATCH. Use small stake (0.35–0.5) since Match pays ~9×.",
      example: "Digit 4 absent for 18 ticks on Vol 50 (1s). AI fires: Delayed Digit Exhaustion, confidence 72%. Enter 1-tick MATCH digit 4 at $0.35. Win = ~$3.15. Expected value positive if P(win) > 11%.",
    },
    {
      id: "i5", title: "Differ Contracts — 5 AI Strategies (PDF Guide)", duration: "12 min", difficulty: 2,
      description: "Master the 5 PDF-based strategies the AI uses for high-confidence Differ recommendations.",
      content: [
        "Differ contracts win 9/10 times if market is perfectly random. The edge comes from finding the 1 digit most LIKELY to appear — then DIFFER it, betting it won't appear.",
        "Strategy 1 — Triple Exhaustion Reversal: Same digit appears 3× consecutively. The probability of it appearing a 4th time is very low (~1%). DIFFER that digit immediately after the 3rd hit. Confidence: 84%.",
        "Strategy 2 — Double Repetition Reversal: Same digit 2× in a row. Repeating a 3rd time has only ~10% probability in random markets. DIFFER the repeated digit. Confidence: 72%.",
        "Strategy 3 — Burst Domination: One digit appears 4 or more times in the last 10 ticks (40%+). This is well above its expected 10% rate — a reversal/exhaustion is likely. DIFFER the bursting digit.",
        "Strategy 4 — Cluster Rejection: A digit appears 3+ times in the last 5 ticks. Heavy clustering almost always leads to a gap period. DIFFER the clustered digit.",
        "Strategy 5 — Fast Rotation: When 8+ unique digits appear in the last 10 ticks, the market is in fast rotation mode. The current digit is unlikely to immediately repeat. DIFFER current digit.",
        "Differs have a base win rate of 90% — the AI strategies push this further by targeting digits with elevated exhaustion probability.",
      ],
      keyPoints: [
        "Triple Exhaustion: 3× same → DIFFER (84% AI confidence)",
        "Double Repeat: 2× same → DIFFER (72% AI confidence)",
        "Burst: digit 4+/10 ticks → DIFFER (70–80% confidence)",
        "Cluster: digit 3+/5 ticks → DIFFER (68% confidence)",
        "Rotation: 8+/10 unique digits → DIFFER current (55% confidence)",
      ],
      strategy: "In Speed Lab, select AI Differ (auto digit) from the AI Picks category. Set confidence threshold to 65%. The AI will apply all 5 strategies and fire only when there is a confirmed pattern.",
      example: "Vol 50: last 3 ticks = 7, 7, 7. Triple Exhaustion triggers. AI recommends DIFFER 7 at 84% confidence. 1-tick DIFFER at $1 stake. Win = ~$0.95 profit (9/10 base probability, pushed higher by strategy).",
    },
    {
      id: "i6", title: "Speed Lab — AI Execution Guide", duration: "10 min", difficulty: 2,
      description: "Use the Speed Lab with AI mode to execute trades across multiple markets simultaneously.",
      content: [
        "Speed Lab fires trades in parallel across all selected markets — this is the fastest execution method on the platform.",
        "AI Mode: for each selected market, the AI fetches signals, picks the highest-confidence contract from your allowed list, then executes — all in one batch.",
        "AI Picks category (Speed Lab contract selection): AI Match, AI Differ, AI Over, AI Under — these tell the AI to pick the best digit/barrier for each market automatically.",
        "The Stop & Reset button: when you stop auto trading, ALL settings reset to defaults (stake, martingale, TP/SL, session stats). This is a clean slate for the next session.",
        "Clear & Reset button in the trade log does the same — wipe history and return all settings to default values.",
        "Auto Lab interval: set to 10–30 seconds for AI mode (allows signal refresh between batches). Lower intervals mean more trades but less time for patterns to develop.",
        "3-win cool-off: after 3 consecutive winning batches, the lab pauses 2 seconds before the next entry — prevents overtrading on a hot streak.",
        "Confidence threshold: 65% filters noise while allowing good signals through. Increase to 75%+ for more conservative trading.",
      ],
      keyPoints: [
        "AI Picks category: AI selects digit/barrier automatically per market",
        "Parallel execution: all markets fire simultaneously in one batch",
        "Stop & Reset / Clear & Reset: always returns to clean default state",
        "Auto interval: 10–30s recommended for AI mode",
        "3-win cool-off: built-in discipline after winning streaks",
        "Confidence threshold 65% = balanced signal quality vs frequency",
      ],
      strategy: "AI Speed Lab best practice: Select 3–5 Volatility markets. Enable AI Match + AI Differ + AI Over + AI Under (all AI Picks). Set confidence to 70%. Use $1 base stake. Set Auto interval to 15s. Set SL to $20, TP to $50. Press Auto Lab.",
      example: "3 markets: Vol 50, Vol 25, V50(1s). AI scans all 3. Vol 50: AI Differ 7 at 84% → execute. Vol 25: AI Match 3 at 72% → execute. V50(1s): no signal above 70% → skip. 2 contracts fired in parallel.",
    },
    {
      id: "i2", title: "Risk Management: Martingale", duration: "10 min", difficulty: 2,
      description: "Learn the Martingale system, its mathematics, and its dangers.",
      content: [
        "Martingale: double (or multiply) your stake after each loss, return to base stake on win.",
        "The mathematics: if you have a 50% win rate and double on loss, the sequence 1→2→4→8→16 guarantees a full recovery on the next win — in theory.",
        "The danger: a losing streak of 7+ trades at 2× multiplier means staking 128× your base amount.",
        "Modified Martingale: use 1.5×–2× multiplier instead of 2×, with a cap of 4–8× base stake.",
        "Stop conditions: always set a maximum number of Martingale steps (typically 4–6) before resetting.",
        "With a 55%+ win rate (achievable on strong signals), Martingale dramatically improves session profitability.",
      ],
      keyPoints: [
        "Base stake × multiplier^lossStreak = next stake",
        "Cap: never let stake exceed 8× your base",
        "Only use Martingale when signal confidence >80%",
        "Daily session bank: 20× base stake minimum",
        "Reset lossStreak after every win",
      ],
      strategy: "Set base=1, multiplier=2, cap=8×. Sequence: 1, 2, 4, 8 then STOP and reset. Maximum loss on one cycle: 15 units. One win at step 3 covers all prior losses.",
      example: "Base stake $1. Signal fires → lose $1. Second signal → stake $2, lose. Third signal → stake $4, WIN. Net: -1-2+4 = +$1 profit. Reset to $1.",
    },
    {
      id: "i3", title: "Reading the D-Circle", duration: "7 min", difficulty: 2,
      description: "Use the Digit Circle visualization to identify patterns and signals.",
      content: [
        "The D-Circle shows ALL 10 digits in a ring, with arc length proportional to their frequency.",
        "Green arc = most frequent digit. Red arc = least frequent digit.",
        "The pink cursor shows the CURRENT live digit — watch it move in real time.",
        "Key signal: when arcs are highly unequal (one digit at 14%+, another at 6%−), a mean reversion trade is forming.",
        "The sum of all arcs = 100% — in a random market, each arc should be exactly 10%.",
        "Use 1000 ticks for the most reliable picture. 200 ticks shows short-term spikes.",
      ],
      keyPoints: [
        "Perfect random: all arcs equal at 10%",
        "Extreme deviation (one digit ≥13%): strong anomaly signal",
        "Watch for the cursor bouncing near the red (least frequent) arc — upcoming MATCH opportunity",
        "The arc distribution self-corrects over thousands of ticks",
      ],
      strategy: "Open Wide Eye page. Look at the 1000-tick D-circle. If ANY digit arc is ≥13% or ≤7%, open a trade targeting mean reversion.",
      example: "1000-tick circle shows: digit 4 at 13.8% (green, most frequent), digit 7 at 6.9% (red, least). Trade: DIFFER on digit 4 (bet it won't appear). Or: MATCH digit 7 for high-payout reversal.",
    },
  ],
  pro: [
    {
      id: "p4", title: "Manual Market Analysis Workflow", duration: "15 min", difficulty: 3,
      description: "Step-by-step process for reading digit markets manually before placing any trade.",
      content: [
        "Step 1 — Open the Dashboard. Check current digit, live price, and last 20 digits displayed in the stream. Note the most recent 5 digits.",
        "Step 2 — Check the distribution bars. Is any digit above 13% or below 7%? If not, wait. Good signals only come from extreme distributions.",
        "Step 3 — Open Wide Eye View. Check the 1000-tick D-Circle. This gives you the statistically reliable full picture. Identify the green arc (hottest digit) and red arc (coldest digit).",
        "Step 4 — Look at the short-term (200-tick or custom) D-Circle. Compare to the 1000-tick. If a digit is hot in both timeframes, the signal is stronger. If they diverge, be cautious.",
        "Step 5 — Check the Over/Under page. What does the AI recommend? What is the bar chart showing for high vs low digit dominance?",
        "Step 6 — Check Match/Differ page. The AI now uses 5 pattern-recognition strategies. Trust the signal if confidence ≥ 65% and strategy is Delayed Exhaustion or Double Echo.",
        "Step 7 — Decide contract type and stake. Small stake for Match (high payout, lower hit rate). Larger for Even/Odd or Over/Under (near 50% base).",
        "Step 8 — Enter the trade. Record it mentally or in a journal: market, contract type, signal confidence, stake, outcome.",
        "Step 9 — After 10 trades, calculate win rate. If below 40%, stop and re-evaluate your signal quality.",
      ],
      keyPoints: [
        "Always check 1000-tick distribution before entering",
        "Extreme deviation required: ≥13% or ≤7% before entry",
        "Cross-timeframe confirmation: both 1000-tick and 200-tick agree",
        "Never trade when distribution is flat (all digits near 10%)",
        "Record outcomes: 10-trade win rate below 40% = stop and review",
        "Stop loss: fixed dollar amount per session, not per trade",
      ],
      strategy: "Manual analysis checklist: (1) 1000-tick D-circle deviation ≥12%, (2) AI signal confidence ≥60%, (3) Short-term trend confirms. All 3 must be true before entry.",
      example: "Dashboard: digit 3 at 14.2% (1000 ticks), also elevated in 200-tick circle. AI signals: DIFFER 3, confidence 79% (Burst Domination). All 3 boxes checked. Enter DIFFER 3, 1 tick, $1 stake.",
    },
    {
      id: "p5", title: "Capital Management & Account Recovery", duration: "12 min", difficulty: 3,
      description: "Protect your trading account and recover from drawdowns systematically.",
      content: [
        "The cardinal rule of capital management: Never risk more than 1–2% of your account balance on a single trade. On a $100 account, maximum stake per trade = $2.",
        "Session sizing: set aside a fixed 'session bankroll' — the amount you are willing to lose in one session. Never exceed it. Typical session bankroll = 10–15% of total account.",
        "Drawdown recovery: If you lose 3 trades in a row, reduce base stake by 50%. Trade at smaller size until you recover 50% of the loss, then restore full stake.",
        "The Martingale trap: Martingale ONLY works when you have a true statistical edge (signal confidence consistently above 60%) AND you cap the sequence at 4 steps. Unlimited Martingale destroys accounts.",
        "Recovery plan: After a -30% session loss, stop for the day. The next day, halve your base stake for the first 20 trades. Only return to full size after recovering the loss.",
        "Diversification: never put all trades in one market. Run Speed Lab across 3–5 markets to spread risk.",
        "Win rate target: aim for 55–65% win rate on Even/Odd and Over/Under contracts. For Match contracts, even a 15% hit rate is profitable given the 9× payout.",
        "Monthly tracking: sum all trade P&L monthly. If net negative for 2 consecutive months, pause and change your strategy or markets.",
      ],
      keyPoints: [
        "Max stake per trade: 1–2% of account balance",
        "Session bankroll: 10–15% of total balance",
        "3 consecutive losses: halve base stake immediately",
        "Martingale cap: max 4 steps, then reset",
        "Daily stop: -30% of session bankroll = close everything",
        "Match target win rate: 12–15% (profitable at 9× payout)",
        "Monthly negative 2× in a row: change strategy",
      ],
      strategy: "Capital formula: Account $200. Session bank = $30. Base stake = $1. Martingale: 1→2→4→8 (cap 4). Session target = +$6 (20%). Session stop = -$9 (30%). Always set TP/SL in the trading pages.",
      example: "Account $200. Session bank $30, base $1. Win 2 (+$2). Then lose 3 (streak). Reduce to $0.50. Win next 2 at $0.50 (+$1). Return to $1 base. Track: wins 4, losses 3, net: +$1.50. On target.",
    },
    {
      id: "p1", title: "Markov Chain Signal Trading", duration: "12 min", difficulty: 3,
      description: "Use transition probability matrices to predict the next digit with statistical edge.",
      content: [
        "A Markov chain models each digit as a state, with a transition matrix showing P(next=j | current=i).",
        "In a perfectly random market, all transition probabilities = 10%. Deviations create edge.",
        "If you observe P(8|7) = 18% consistently over 1000 ticks, then after digit 7 appears, betting on digit 8 has a 180% expected value ratio vs random.",
        "The ML Reports page shows the full 10×10 transition matrix — look for cells highlighted in green (high probability).",
        "Steady-state distribution: where the Markov chain converges in the long run. If digit 4 has a steady state >12%, it will be over-represented.",
        "Combine Markov signals with frequency analysis for highest confidence trades.",
      ],
      keyPoints: [
        "Look for P(j|i) > 14% — this is a 40% edge over random",
        "Back-test: how many times did digit j actually follow i in the last 200 ticks?",
        "Steady state > 11% → digit is structurally overrepresented",
        "Use MATCH for underrepresented steady-state digits (mean reversion)",
        "Use DIFFER on overrepresented steady-state digits",
      ],
      strategy: "Use the ML Reports page. Find transition matrix cells with P ≥ 14%. For the current digit, identify the highest-probability 'next digit'. Place a 1-tick MATCH on that digit.",
      example: "Markov report: current digit = 3, P(5|3) = 17.2%. Steady state of digit 5 = 11.4%. Trade: 1-tick MATCH on digit 5 with confidence 65%+. This is a systematic edge.",
    },
    {
      id: "p2", title: "Statistical Arbitrage: Multi-Symbol", duration: "15 min", difficulty: 3,
      description: "Monitor multiple symbols simultaneously to find the highest edge trades at any moment.",
      content: [
        "Volatility indices are independent markets. Their digit distributions evolve separately.",
        "At any given moment, one symbol will have more extreme digit anomalies than others.",
        "Multi-symbol strategy: monitor R_10, R_25, R_50, R_75, R_100 simultaneously.",
        "Rank them by 'anomaly score' = max(abs(digitPct - 10)) across all 10 digits.",
        "Trade only the symbol with the highest anomaly score when that anomaly exceeds 12.5%.",
        "Risk management: never hold more than 2 open contracts across all symbols simultaneously.",
        "The Deriv Trader page shows all symbols live — use it to scan for the best entry.",
      ],
      keyPoints: [
        "Anomaly score = how far any digit deviates from 10%",
        "Threshold: only trade when anomaly > 12.5%",
        "Diversification: different symbols reduce correlated losses",
        "Maximum 2 open contracts at once — prevents runaway losses",
        "Refresh interval: scan every 30 seconds for new opportunities",
      ],
      strategy: "Open Deriv Trader. Switch between all Volatility symbols. Identify which has the most extreme D-circle (one digit ≥13%). Trade mean reversion on that symbol. Move to the next symbol after the trade settles.",
      example: "Scan results: R_10 (max anomaly: 11.1%), R_25 (12.3%), R_50 (14.7% — digit 9 hot), R_75 (10.8%), R_100 (11.2%). Trade R_50: DIFFER digit 9 at 14.7%. Strongest anomaly = highest edge.",
    },
    {
      id: "p3", title: "Session Management: Pro Discipline", duration: "10 min", difficulty: 3,
      description: "Build and enforce a trading plan that preserves capital and compounds returns.",
      content: [
        "The difference between profitable and unprofitable traders is almost entirely discipline.",
        "Set a daily target: 10–20% of session bankroll. Stop when hit — don't get greedy.",
        "Set a daily stop-loss: 30% of session bankroll. Stop when hit — live to trade tomorrow.",
        "Use Take Profit + Stop Loss in the AI Trading page — let the system enforce your limits.",
        "Daily reset: start each day fresh. Don't carry emotional baggage from the prior session.",
        "Win rate tracking: if your win rate drops below 45% over 20 trades, STOP and review your signals.",
        "Log every trade: what signal, what confidence, outcome. Review weekly to find patterns.",
      ],
      keyPoints: [
        "Daily target: +10–20% of bankroll then STOP",
        "Daily stop-loss: -30% of bankroll then STOP",
        "Never increase base stake to 'chase losses'",
        "Only auto-trade signals with ≥85% confidence",
        "Kill switch: one click to close ALL open contracts",
        "Weekly review: identify best/worst performing signal types",
      ],
      strategy: "Session bankroll = $20. Target = +$4 (20%). Stop-loss = -$6 (30%). Base stake = $1. Martingale max = $4 (4 steps). At target/stop, close everything and log the session.",
      example: "Session: bankroll $20, base stake $1. Win 3 → +$3. Martingale loss sequence: -1-2+4 = +$1. Running total: +$4. Target hit! Close auto-trade, log results, done for the day.",
    },
  ],
};

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    question: "In the Even/Odd strategy, which digit group should be elevated to trigger a BUY EVEN signal?",
    options: ["Even digits (0,2,4,6,8)", "Odd digits (1,3,5,7,9)", "All digits equally", "The most frequent digit"],
    answer: 1,
    explanation: "BUY EVEN watches ODD digits. When exactly one ODD digit is elevated (≥10.2%), the market is showing odd-side pressure — the statistical response is to buy EVEN.",
  },
  {
    question: "What is the ideal minimum tick count for Even/Odd analysis?",
    options: ["100 ticks", "200 ticks", "500 ticks", "1000 ticks"],
    answer: 3,
    explanation: "1000 ticks provides a statistically meaningful sample. With fewer ticks, random fluctuations can create false signals.",
  },
  {
    question: "In a Martingale sequence with base=$1 and multiplier=2, what is the 4th stake?",
    options: ["$4", "$6", "$8", "$16"],
    answer: 2,
    explanation: "Sequence: $1 (L), $2 (L), $4 (L), $8. The 4th stake is $8 (2^3 × base).",
  },
  {
    question: "If digit 7 has appeared 6.1% over 1000 ticks, what is the best trading strategy?",
    options: ["DIFFER on digit 7", "MATCH on digit 7 (mean reversion)", "OVER 6 contract", "Skip — no signal present"],
    answer: 1,
    explanation: "Digit 7 at 6.1% is far below the expected 10%. Statistical mean reversion suggests it will appear more frequently soon — MATCH digit 7 is the correct play.",
  },
  {
    question: "When should auto-trade execute in the AI Trading page?",
    options: ["Any time a signal is present", "When signal confidence ≥ 85%", "Only during market hours", "When win rate > 50%"],
    answer: 1,
    explanation: "The 85% confidence gate filters low-quality signals. Only signals with very high confidence should trigger automatic trades to protect capital.",
  },
  {
    question: "What does the pink cursor represent in the digit circle visualization?",
    options: ["The most frequent digit", "The target digit for a trade", "The current live digit from the latest tick", "The predicted next digit"],
    answer: 2,
    explanation: "The pink moving cursor (triangle arrowhead) shows the current live digit — the last digit from the most recent tick price received from Deriv.",
  },
];

const CHALLENGES: Challenge[] = [
  {
    title: "The First Steps",
    description: "Complete your first Even/Odd trade with a real signal",
    target: "Execute 1 trade with a confirmed signal",
    timeframe: "Anytime",
    rules: [
      "Use the Even/Odd page to find a signal",
      "Wait for ALL 3 conditions to be green",
      "Use stake ≤ $1",
      "Take a screenshot of the signal before entering",
    ],
    difficulty: 1,
    reward: "Beginner Badge",
  },
  {
    title: "The Grinder",
    description: "Build $2 to $5 using small consistent trades",
    target: "Turn $2 into $5 (150% return)",
    timeframe: "One session (max 2 hours)",
    rules: [
      "Start with exactly $2 demo balance",
      "Base stake: $0.35",
      "Only Even/Odd or Over/Under trades",
      "Signal confidence must be ≥70%",
      "Stop at $5 OR if balance drops to $1",
      "Maximum 30 trades",
    ],
    difficulty: 2,
    reward: "The Grinder Badge",
  },
  {
    title: "AI Trader",
    description: "Run the AI auto-trader for 30 minutes with profit",
    target: "Net positive P/L after 30 minutes of auto-trading",
    timeframe: "30 minutes",
    rules: [
      "Connect real API token",
      "Set confidence gate to ≥85%",
      "Base stake: $1",
      "Enable Take Profit at +$5",
      "Enable Stop Loss at -$3",
      "Let it run — do NOT interfere",
    ],
    difficulty: 2,
    reward: "AI Trader Badge",
  },
  {
    title: "The Analyst",
    description: "Use the ML Reports to predict and win 3 consecutive trades",
    target: "Win 3 trades in a row using ML report signals",
    timeframe: "One session",
    rules: [
      "Open ML Reports page for your symbol",
      "Identify a Markov or ensemble ML signal with ≥70% confidence",
      "Execute that trade manually",
      "Win 3 consecutive — not 3 out of 5, exactly 3 IN A ROW",
      "Use Match/Differ contract type",
    ],
    difficulty: 3,
    reward: "The Analyst Badge",
  },
  {
    title: "The Pro",
    description: "Achieve 60% win rate over 20+ trades in a single session",
    target: "12+ wins out of 20 trades",
    timeframe: "One session (max 3 hours)",
    rules: [
      "Must execute minimum 20 trades",
      "All signals must score ≥75% confidence",
      "Any contract type allowed",
      "Use multi-symbol scanning (rotate between 3+ symbols)",
      "Log every trade with signal, confidence, and outcome",
    ],
    difficulty: 3,
    reward: "Pro Trader Badge 🏆",
  },
];

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3].map((i) => (
        <Star key={i} size={11} fill={i <= count ? "#facc15" : "none"} style={{ color: i <= count ? "#facc15" : "rgba(255,255,255,0.2)" }} />
      ))}
    </div>
  );
}

function LessonCard({ lesson, isOpen, onToggle }: { lesson: Lesson; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="cyber-card overflow-hidden transition-all">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left">
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-orbitron text-sm font-black"
          style={{ background: isOpen ? "#00e5ff20" : "rgba(255,255,255,0.06)", border: `1.5px solid ${isOpen ? "#00e5ff" : "rgba(255,255,255,0.15)"}`, color: isOpen ? "#00e5ff" : "#888" }}>
          {isOpen ? <Play size={12} /> : <BookOpen size={12} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-orbitron text-sm font-bold text-foreground">{lesson.title}</span>
            <StarRating count={lesson.difficulty} />
          </div>
          <div className="font-rajdhani text-xs text-muted-foreground mt-0.5">{lesson.description} · {lesson.duration}</div>
        </div>
        <ChevronRight size={14} className={`flex-shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
      </button>

      {isOpen && (
        <div className="border-t border-border/50 p-4 space-y-4">
          {/* Main content */}
          <div className="space-y-2">
            {lesson.content.map((para, i) => (
              <div key={i} className="flex gap-2">
                <div className="w-1 h-1 rounded-full bg-primary mt-2 flex-shrink-0" />
                <p className="font-rajdhani text-sm text-foreground/90">{para}</p>
              </div>
            ))}
          </div>

          {/* Key points */}
          <div className="rounded-xl p-3" style={{ background: "rgba(0,229,255,0.06)", border: "1px solid rgba(0,229,255,0.15)" }}>
            <div className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-primary mb-2">Key Points</div>
            <div className="space-y-1">
              {lesson.keyPoints.map((pt, i) => (
                <div key={i} className="flex gap-2">
                  <CheckCircle size={11} className="text-primary flex-shrink-0 mt-0.5" />
                  <span className="font-rajdhani text-xs text-foreground/80">{pt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Strategy box */}
          {lesson.strategy && (
            <div className="rounded-xl p-3" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
              <div className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-green-400 mb-1.5">Strategy</div>
              <p className="font-rajdhani text-xs text-foreground/80">{lesson.strategy}</p>
            </div>
          )}

          {/* Example */}
          {lesson.example && (
            <div className="rounded-xl p-3" style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.2)" }}>
              <div className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-yellow-400 mb-1.5">Live Example</div>
              <p className="font-rajdhani text-xs text-foreground/80">{lesson.example}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuizSection() {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState<boolean[]>(Array(QUIZ_QUESTIONS.length).fill(false));
  const [results, setResults] = useState<boolean[]>(Array(QUIZ_QUESTIONS.length).fill(false));
  const [done, setDone] = useState(false);

  const q = QUIZ_QUESTIONS[current];
  const isAnswered = answered[current];
  const isCorrect  = results[current];

  const handleAnswer = (idx: number) => {
    if (isAnswered) return;
    setSelected(idx);
    const correct = idx === q.answer;
    const newAnswered = [...answered]; newAnswered[current] = true; setAnswered(newAnswered);
    const newResults  = [...results];  newResults[current] = correct; setResults(newResults);
  };

  const next = () => {
    if (current < QUIZ_QUESTIONS.length - 1) { setCurrent((p) => p + 1); setSelected(null); }
    else setDone(true);
  };

  const restart = () => { setCurrent(0); setSelected(null); setAnswered(Array(QUIZ_QUESTIONS.length).fill(false)); setResults(Array(QUIZ_QUESTIONS.length).fill(false)); setDone(false); };

  const score = results.filter(Boolean).length;

  if (done) {
    return (
      <div className="cyber-card p-6 text-center space-y-4">
        <Trophy size={40} className="mx-auto" style={{ color: score >= 5 ? "#facc15" : score >= 3 ? "#22c55e" : "#ef4444" }} />
        <div className="font-orbitron text-2xl font-black" style={{ color: score >= 5 ? "#facc15" : score >= 3 ? "#22c55e" : "#ef4444" }}>
          {score}/{QUIZ_QUESTIONS.length} Correct
        </div>
        <div className="font-rajdhani text-sm text-muted-foreground">
          {score === QUIZ_QUESTIONS.length ? "Perfect score! You are ready to trade professionally." :
           score >= 4 ? "Great knowledge! Review the incorrect answers and retry." :
           "Keep studying — read the lessons again then take the quiz."}
        </div>
        <button onClick={restart} className="px-6 py-2.5 rounded-xl font-orbitron text-sm font-bold"
          style={{ background: "#00e5ff", color: "#050a0f" }}>Retry Quiz</button>
      </div>
    );
  }

  return (
    <div className="cyber-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
          Question {current + 1} of {QUIZ_QUESTIONS.length}
        </div>
        <div className="flex gap-1">
          {QUIZ_QUESTIONS.map((_,i) => (
            <div key={i} className="w-2 h-2 rounded-full"
              style={{ background: i < current ? (results[i] ? "#22c55e" : "#ef4444") : i === current ? "#00e5ff" : "rgba(255,255,255,0.15)" }} />
          ))}
        </div>
      </div>

      <div className="font-rajdhani text-base font-bold text-foreground">{q.question}</div>

      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const isSelected = selected === i;
          const isRight = isAnswered && i === q.answer;
          const isWrong = isAnswered && isSelected && i !== q.answer;
          return (
            <button key={i} onClick={() => handleAnswer(i)} disabled={isAnswered}
              className="w-full text-left px-4 py-3 rounded-xl font-rajdhani text-sm font-semibold transition-all"
              style={isRight
                ? { background: "rgba(34,197,94,0.15)", border: "1.5px solid #22c55e", color: "#22c55e" }
                : isWrong
                ? { background: "rgba(239,68,68,0.12)", border: "1.5px solid #ef4444", color: "#ef4444" }
                : isSelected
                ? { background: "rgba(0,229,255,0.12)", border: "1.5px solid #00e5ff", color: "#00e5ff" }
                : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)" }}>
              <div className="flex items-center gap-2">
                {isRight && <CheckCircle size={13} />}
                {isWrong && <XCircle    size={13} />}
                {!isAnswered && <div className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px] font-bold">{["A","B","C","D"][i]}</div>}
                {opt}
              </div>
            </button>
          );
        })}
      </div>

      {isAnswered && (
        <div className="rounded-xl p-3 flex gap-2" style={{ background: isCorrect ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${isCorrect ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}` }}>
          {isCorrect ? <CheckCircle size={13} className="text-green-400 flex-shrink-0 mt-0.5" /> : <XCircle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />}
          <p className="font-rajdhani text-xs text-foreground/80">{q.explanation}</p>
        </div>
      )}

      {isAnswered && (
        <button onClick={next} className="w-full py-2.5 rounded-xl font-orbitron text-sm font-bold"
          style={{ background: "#00e5ff", color: "#050a0f" }}>
          {current < QUIZ_QUESTIONS.length - 1 ? "Next Question →" : "View Results"}
        </button>
      )}
    </div>
  );
}

function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const [open, setOpen] = useState(false);
  const colors = ["#22c55e","#fb8c00","#ef4444"];
  const c = colors[challenge.difficulty - 1];
  return (
    <div className="cyber-card overflow-hidden">
      <button onClick={() => setOpen((p) => !p)} className="w-full flex items-center gap-3 p-4 text-left">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${c}18`, border: `1.5px solid ${c}50` }}>
          <Target size={16} style={{ color: c }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-orbitron text-sm font-bold">{challenge.title}</span>
            <StarRating count={challenge.difficulty} />
          </div>
          <div className="font-rajdhani text-xs text-muted-foreground truncate">{challenge.description}</div>
        </div>
        <div className="text-xs font-rajdhani text-primary font-bold flex-shrink-0">{challenge.timeframe}</div>
      </button>
      {open && (
        <div className="border-t border-border/50 p-4 space-y-3">
          <div className="rounded-xl p-3" style={{ background: `${c}10`, border: `1px solid ${c}30` }}>
            <div className="font-rajdhani text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: c }}>Target</div>
            <div className="font-orbitron text-sm font-bold" style={{ color: c }}>{challenge.target}</div>
          </div>
          <div>
            <div className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-2">Rules</div>
            <div className="space-y-1">
              {challenge.rules.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center font-orbitron text-[9px] font-black flex-shrink-0" style={{ background: `${c}20`, color: c }}>{i+1}</div>
                  <span className="font-rajdhani text-xs text-foreground/80">{r}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)" }}>
            <Trophy size={13} style={{ color: "#facc15" }} />
            <span className="font-rajdhani text-xs font-bold text-yellow-400">{challenge.reward}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function exportLessons(level: Level) {
  const lessons = LESSONS[level];
  const ts = new Date().toLocaleString();
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Digit Killer — ${level.toUpperCase()} Lessons</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:24px;max-width:800px;margin:0 auto}
h1{color:#005fd4;font-size:22px}h2{color:#005fd4;font-size:16px;border-bottom:2px solid #005fd4;padding-bottom:4px;margin-top:24px}
h3{color:#333;font-size:13px;margin:12px 0 4px}.kp{border-left:3px solid #005fd4;padding:4px 12px;margin:4px 0;background:#f0f4ff}
.strat{border:1px solid #22c853;border-radius:6px;padding:8px;background:#f0fff4;margin:8px 0}
.ex{border:1px solid #ffc107;border-radius:6px;padding:8px;background:#fffde7;margin:8px 0}</style></head>
<body><h1>Digit Killer — ${level.charAt(0).toUpperCase()+level.slice(1)} Trading Lessons</h1>
<p style="color:#666">Generated: ${ts} | Total: ${lessons.length} lessons</p>
${lessons.map((l)=>`<h2>${l.title}</h2><p><em>${l.description}</em> · ${l.duration}</p>
${l.content.map((c)=>`<p>• ${c}</p>`).join("")}
<h3>Key Points</h3>${l.keyPoints.map((k)=>`<div class="kp">${k}</div>`).join("")}
${l.strategy?`<div class="strat"><strong>Strategy:</strong> ${l.strategy}</div>`:""}
${l.example?`<div class="ex"><strong>Example:</strong> ${l.example}</div>`:""}`).join("")}
</body></html>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  a.download = `digit-killer-${level}-lessons.html`;
  a.click();
}

// ─── Academy AI Panel types ────────────────────────────────────────────────────
interface AnalysisResult { filename: string; type: string; analysis: string[]; recommendation: string; detected: string[]; score: number; }
interface SearchResult   { title: string; snippet: string; url: string; type: string; }
interface HistoryItem    { id: string; kind: "file" | "search"; label: string; result: AnalysisResult | { query: string; results: SearchResult[] }; ts: string; }

function AcademyAIPanel() {
  const [open, setOpen]           = useState(false);
  const [aiTab, setAiTab]         = useState<"file" | "search" | "history">("file");
  const [busy, setBusy]           = useState(false);
  const [history, setHistory]     = useState<HistoryItem[]>([]);
  const [searchQ, setSearchQ]     = useState("");
  const [lastResult, setLastResult] = useState<HistoryItem | null>(null);
  const fileRef    = useRef<HTMLInputElement>(null);
  const cameraRef  = useRef<HTMLInputElement>(null);
  const dropRef    = useRef<HTMLDivElement>(null);

  const processFile = useCallback(async (file: File) => {
    setBusy(true);
    try {
      let content = "";
      let type = "text";
      if (file.type.startsWith("image/")) {
        type = "image";
        content = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(`[Image file: ${file.name} — ${(file.size / 1024).toFixed(1)} KB]\nType: ${file.type}\nImage uploaded for visual reference (no cloud storage used).`);
          r.readAsDataURL(file);
        });
        content = `[Image: ${file.name}] Size: ${(file.size / 1024).toFixed(1)} KB. Type: ${file.type}.`;
      } else {
        content = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload  = () => res(r.result as string);
          r.onerror = rej;
          r.readAsText(file);
        });
        type = file.name.endsWith(".csv") ? "csv" : file.name.endsWith(".json") ? "json" : "text";
      }
      const resp = await fetch("/api/academy/analyse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.slice(0, 8000), type, filename: file.name }),
      });
      const data = await resp.json() as AnalysisResult;
      const item: HistoryItem = { id: Date.now().toString(), kind: "file", label: file.name, result: data, ts: new Date().toLocaleTimeString() };
      setHistory((h) => [item, ...h.slice(0, 19)]);
      setLastResult(item);
    } catch { /* silent */ } finally { setBusy(false); }
  }, []);

  const doSearch = useCallback(async () => {
    if (!searchQ.trim()) return;
    setBusy(true);
    try {
      const resp = await fetch(`/api/academy/search?q=${encodeURIComponent(searchQ)}`);
      const data = await resp.json() as { query: string; results: SearchResult[] };
      const item: HistoryItem = { id: Date.now().toString(), kind: "search", label: searchQ, result: data, ts: new Date().toLocaleTimeString() };
      setHistory((h) => [item, ...h.slice(0, 19)]);
      setLastResult(item);
    } catch { /* silent */ } finally { setBusy(false); }
  }, [searchQ]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    if (files[0]) void processFile(files[0]);
  }, [processFile]);

  const isSearch = (x: HistoryItem): x is HistoryItem & { result: { query: string; results: SearchResult[] } } => x.kind === "search";
  const isFile   = (x: HistoryItem): x is HistoryItem & { result: AnalysisResult } => x.kind === "file";

  return (
    <>
      {/* Floating "+" button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95"
        style={{ background: "linear-gradient(135deg,#00e5ff,#0288d1)", boxShadow: "0 0 24px rgba(0,229,255,0.5)" }}
        title="Academy AI — analyse files, search, camera"
      >
        <Plus size={24} className="text-black font-black" />
      </button>

      {/* Panel overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative rounded-t-2xl overflow-hidden flex flex-col" style={{ background: "#0a1628", border: "1px solid rgba(0,229,255,0.2)", maxHeight: "85vh" }}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
              <div className="w-10 h-1 rounded-full" style={{ background: "rgba(0,229,255,0.3)" }} />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0 border-b" style={{ borderColor: "rgba(0,229,255,0.12)" }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(0,229,255,0.12)" }}>
                  <GraduationCap size={14} className="text-primary" />
                </div>
                <div>
                  <div className="font-orbitron text-sm font-bold text-primary">ACADEMY AI</div>
                  <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest">Analyse · Search · Camera — No cloud storage</div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground" style={{ background: "rgba(255,255,255,0.05)" }}>
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-4 pt-3 flex-shrink-0">
              {(["file","search","history"] as const).map((t) => (
                <button key={t} onClick={() => setAiTab(t)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-rajdhani text-xs font-bold tracking-wider uppercase transition-all"
                  style={aiTab === t
                    ? { background: "rgba(0,229,255,0.15)", border: "1px solid rgba(0,229,255,0.4)", color: "#00e5ff" }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
                  {t === "file" ? <FileText size={11} /> : t === "search" ? <Globe size={11} /> : <ChevronDown size={11} />}
                  {t === "history" ? `History (${history.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

              {/* FILE TAB */}
              {aiTab === "file" && (
                <div className="space-y-3">
                  {/* Drag & Drop Zone */}
                  <div ref={dropRef} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
                    className="border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer"
                    style={{ borderColor: "rgba(0,229,255,0.25)", background: "rgba(0,229,255,0.03)" }}
                    onClick={() => fileRef.current?.click()}>
                    <UploadCloud size={28} className="text-primary mx-auto mb-2 opacity-70" />
                    <div className="font-rajdhani text-sm text-muted-foreground">Drag & drop any file here, or <span className="text-primary">browse</span></div>
                    <div className="font-rajdhani text-[10px] text-muted-foreground mt-1 opacity-60">PDF · CSV · TXT · JSON · DOCX · Images · Any file — processed locally</div>
                    <input ref={fileRef} type="file" className="hidden"
                      accept="*/*"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void processFile(f); e.target.value = ""; }}
                    />
                  </div>

                  {/* Camera capture */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => cameraRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-rajdhani text-sm font-bold transition-all"
                      style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)", color: "#00e5ff" }}>
                      <Camera size={15} /> Take Photo / Camera
                    </button>
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void processFile(f); e.target.value = ""; }}
                    />
                  </div>

                  {busy && (
                    <div className="flex items-center gap-2 py-3 px-4 rounded-xl" style={{ background: "rgba(0,229,255,0.07)", border: "1px solid rgba(0,229,255,0.15)" }}>
                      <Loader2 size={14} className="text-primary animate-spin" />
                      <span className="font-rajdhani text-sm text-primary">Analysing file locally…</span>
                    </div>
                  )}

                  {/* Last file result */}
                  {lastResult && isFile(lastResult) && !busy && (
                    <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.15)" }}>
                      <div className="flex items-center gap-2">
                        <FileText size={13} className="text-primary" />
                        <span className="font-orbitron text-xs font-bold text-primary">{lastResult.result.filename}</span>
                        <span className="ml-auto font-rajdhani text-[10px] text-muted-foreground">{lastResult.ts}</span>
                      </div>
                      <div className="space-y-1">
                        {lastResult.result.analysis.map((line, i) => (
                          <div key={i} className="font-rajdhani text-xs text-foreground/90">{line}</div>
                        ))}
                      </div>
                      {lastResult.result.recommendation && (
                        <div className="rounded-lg p-3" style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.15)" }}>
                          <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1">Recommendation</div>
                          <div className="font-rajdhani text-xs text-foreground">{lastResult.result.recommendation}</div>
                        </div>
                      )}
                      {lastResult.result.score > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="font-rajdhani text-[10px] text-muted-foreground">Trading Relevance</div>
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                            <div className="h-1.5 rounded-full transition-all" style={{ width: `${lastResult.result.score}%`, background: `linear-gradient(90deg,#00e5ff,${lastResult.result.score > 60 ? "#00c853" : "#ffd600"})` }} />
                          </div>
                          <div className="font-orbitron text-xs font-bold" style={{ color: lastResult.result.score > 60 ? "#00c853" : "#ffd600" }}>{lastResult.result.score}%</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* SEARCH TAB */}
              {aiTab === "search" && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <input
                        type="text" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void doSearch()}
                        placeholder="Search anything — trading, markets, strategies…"
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl font-rajdhani text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                    <button onClick={() => void doSearch()} disabled={busy || !searchQ.trim()}
                      className="px-4 py-2.5 rounded-xl font-rajdhani text-sm font-bold transition-all disabled:opacity-40"
                      style={{ background: "rgba(0,229,255,0.15)", border: "1px solid rgba(0,229,255,0.35)", color: "#00e5ff" }}>
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {["Deriv volatility index","martingale strategy","digit trading","over under signals","binary options"].map((s) => (
                      <button key={s} onClick={() => { setSearchQ(s); setTimeout(() => void doSearch(), 50); }}
                        className="px-2.5 py-1 rounded-full font-rajdhani text-[10px] font-bold transition-all"
                        style={{ background: "rgba(0,229,255,0.06)", border: "1px solid rgba(0,229,255,0.18)", color: "rgba(0,229,255,0.7)" }}>
                        {s}
                      </button>
                    ))}
                  </div>

                  {lastResult && isSearch(lastResult) && !busy && (
                    <div className="space-y-2">
                      <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">
                        Results for "{lastResult.result.query}"
                      </div>
                      {lastResult.result.results.length === 0 && (
                        <div className="font-rajdhani text-sm text-muted-foreground text-center py-6">No results found. Try a different search.</div>
                      )}
                      {lastResult.result.results.map((r, i) => (
                        <div key={i} className="rounded-xl p-3 space-y-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                          {r.title && <div className="font-rajdhani text-xs font-bold text-primary">{r.title}</div>}
                          <div className="font-rajdhani text-xs text-foreground/85 leading-relaxed">{r.snippet}</div>
                          {r.url && (
                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-rajdhani text-[10px] text-muted-foreground hover:text-primary transition-colors truncate block">
                              🔗 {r.url}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* HISTORY TAB */}
              {aiTab === "history" && (
                <div className="space-y-2">
                  {history.length === 0 && (
                    <div className="text-center py-10 font-rajdhani text-sm text-muted-foreground">
                      No history yet. Upload a file or search something.
                    </div>
                  )}
                  {history.map((item) => (
                    <button key={item.id} onClick={() => { setLastResult(item); setAiTab(item.kind === "search" ? "search" : "file"); }}
                      className="w-full text-left rounded-xl p-3 transition-all"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-center gap-2">
                        {item.kind === "file" ? <FileText size={12} className="text-primary flex-shrink-0" /> : <Globe size={12} className="text-primary flex-shrink-0" />}
                        <span className="font-rajdhani text-xs text-foreground truncate flex-1">{item.label}</span>
                        <span className="font-rajdhani text-[10px] text-muted-foreground flex-shrink-0">{item.ts}</span>
                      </div>
                    </button>
                  ))}
                  {history.length > 0 && (
                    <button onClick={() => { setHistory([]); setLastResult(null); }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl font-rajdhani text-xs text-muted-foreground transition-all hover:text-red-400"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <Trash2 size={11} /> Clear History
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function TeachingPage() {
  const [level, setLevel] = useState<Level>("beginner");
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [tab, setTab] = useState<"lessons" | "quiz" | "challenges">("lessons");
  const [search, setSearch] = useState("");

  const levelConfig: Record<Level, { color: string; icon: typeof BookOpen; label: string; desc: string; locked: boolean }> = {
    beginner:     { color: "#22c55e", icon: BookOpen,     label: "Beginner",     desc: "New to digit trading",       locked: false },
    intermediate: { color: "#fb8c00", icon: Zap,          label: "Intermediate", desc: "Understand the basics",       locked: false },
    pro:          { color: "#ef4444", icon: GraduationCap, label: "Pro",         desc: "Ready for advanced signals",  locked: false },
  };

  const cfg = levelConfig[level];

  const q = search.trim().toLowerCase();

  const filteredLessons = useMemo(() => {
    if (!q) return LESSONS[level];
    return LESSONS[level].filter((l) =>
      l.title.toLowerCase().includes(q) ||
      l.description.toLowerCase().includes(q) ||
      l.content.some((c) => c.toLowerCase().includes(q)) ||
      l.keyPoints.some((k) => k.toLowerCase().includes(q))
    );
  }, [q, level]);

  const filteredChallenges = useMemo(() => {
    if (!q) return CHALLENGES;
    return CHALLENGES.filter((c) =>
      c.title.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.target.toLowerCase().includes(q)
    );
  }, [q]);

  return (
    <div className="space-y-4 animate-fade-in-up max-w-3xl" data-testid="page-teaching">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <GraduationCap size={20} className="text-primary" />
          <div>
            <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">TRADING ACADEMY</h2>
            <p className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Learn · Practice · Master · Trade</p>
          </div>
        </div>
        <button onClick={() => exportLessons(level)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-rajdhani text-xs font-bold flex-shrink-0"
          style={{ background: "rgba(0,229,255,0.1)", border: "1px solid rgba(0,229,255,0.3)", color: "#00e5ff" }}>
          <Download size={11} /> Export Lessons
        </button>
      </div>

      {/* Search panel */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search lessons, strategies, challenges…"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl font-rajdhani text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Level selector */}
      <div className="grid grid-cols-3 gap-2">
        {(["beginner","intermediate","pro"] as Level[]).map((lvl) => {
          const lc = levelConfig[lvl];
          const Icon = lc.icon;
          const active = level === lvl;
          return (
            <button key={lvl} onClick={() => { setLevel(lvl); setOpenLesson(null); setSearch(""); }}
              className="rounded-xl p-3 text-left transition-all"
              style={active
                ? { background: `${lc.color}15`, border: `2px solid ${lc.color}`, color: lc.color }
                : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={13} />
                <span className="font-orbitron text-xs font-bold">{lc.label}</span>
                {lc.locked && <Lock size={10} className="text-muted-foreground" />}
              </div>
              <div className="font-rajdhani text-[9px] text-muted-foreground">{lc.desc}</div>
              <div className="font-rajdhani text-[9px] mt-1" style={{ color: active ? lc.color : "rgba(255,255,255,0.25)" }}>
                {LESSONS[lvl].length} lessons
              </div>
            </button>
          );
        })}
      </div>

      {/* Tab selector */}
      <div className="flex border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        {([
          { key: "lessons",    label: "Lessons",    icon: BookOpen },
          { key: "quiz",       label: "Knowledge Quiz", icon: Target },
          { key: "challenges", label: "Challenges", icon: Trophy },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-4 py-2.5 font-rajdhani text-sm font-bold transition-all"
            style={tab === key
              ? { color: cfg.color, borderBottom: `2px solid ${cfg.color}` }
              : { color: "rgba(255,255,255,0.4)" }}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {/* Lessons tab */}
      {tab === "lessons" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-rajdhani text-xs font-bold tracking-widest uppercase" style={{ color: cfg.color }}>
              {q
                ? `${filteredLessons.length} results for "${search}"`
                : `${cfg.label} Track — ${LESSONS[level].length} Lessons`}
            </span>
          </div>
          {filteredLessons.length === 0 && (
            <div className="cyber-card p-6 text-center font-rajdhani text-sm text-muted-foreground">
              No lessons found for "{search}"
            </div>
          )}
          {filteredLessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson}
              isOpen={openLesson === lesson.id}
              onToggle={() => setOpenLesson((p) => p === lesson.id ? null : lesson.id)} />
          ))}
        </div>
      )}

      {/* Quiz tab */}
      {tab === "quiz" && (
        <div className="space-y-3">
          <div className="cyber-card p-3 flex items-center gap-3">
            <Target size={14} className="text-primary" />
            <div className="font-rajdhani text-xs text-muted-foreground">
              Test your knowledge across all levels. {QUIZ_QUESTIONS.length} questions. Aim for 5/6 or higher.
            </div>
          </div>
          <QuizSection />
        </div>
      )}

      {/* Challenges tab */}
      {tab === "challenges" && (
        <div className="space-y-3">
          <div className="cyber-card p-3 flex items-center gap-3">
            <Trophy size={14} className="text-primary" />
            <div className="font-rajdhani text-xs text-muted-foreground">
              Complete challenges to sharpen your skills. Start with difficulty 1 and work up.
              {q && ` · Showing ${filteredChallenges.length} of ${CHALLENGES.length} matches`}
            </div>
          </div>
          {filteredChallenges.length === 0 && (
            <div className="cyber-card p-6 text-center font-rajdhani text-sm text-muted-foreground">
              No challenges found for "{search}"
            </div>
          )}
          {filteredChallenges.map((c, i) => <ChallengeCard key={i} challenge={c} />)}
        </div>
      )}

      {/* Academy AI floating panel */}
      <AcademyAIPanel />
    </div>
  );
}
