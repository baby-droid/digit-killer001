---
name: PDF Match/Differ AI Strategies
description: 5 PDF-based strategies added to computeMatchAiConfirmation and computeDifferAiConfirmation in analysis.ts
---

# Match AI Strategies (priority order)
1. Delayed Digit Exhaustion — digit absent 15–25 ticks → conf = 50 + (absence-15)*2.5, max 86
2. Double Echo — same digit ×2 in last 5 → conf 62
3. Compression Release — ≤4 unique digits in last 15, missing digit → conf 56
4. Triple Repetition Continuation — same digit ×3 consecutive → conf 48 (high risk)
5. Fractal Mirror — alternating ABAB in last 4 ticks → conf 50

**Why:** PDF-based strategies outperform simple frequency scoring by detecting temporal patterns.

# Differ AI Strategies (priority order)
1. Triple Exhaustion — same digit ×3 consecutive → DIFFER, conf 84
2. Double Repetition Reversal — same digit ×2 in a row → DIFFER, conf 72
3. Burst Domination — digit 4+/10 ticks → DIFFER, conf 50 + (burst-4)*8
4. Cluster Rejection — digit 3+/5 ticks → DIFFER, conf 68
5. Fast Rotation — ≥8 unique in last 10 → DIFFER current, conf 55

**How to apply:** Both functions take `(digits: number[], currentDigit: number)` and return `{digit, confidence, ticks, strategy, reason, fire, strategies_triggered}`.
