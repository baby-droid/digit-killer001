# Digit Killer

Real-time Deriv trading analysis platform built by Ahmed Syntrader. Provides AI-powered digit analysis, live D-circles, Over/Under signals, Even/Odd analysis, Match/Differ signals, Tick contract analysis, AI trading signals, and admin user management.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/digit-killer run dev` — run the frontend (port 19514)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required secret: `DERIV_API_TOKEN` — Deriv API token (set in Replit Secrets)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080, routes at `/api/...`)
- DB: PostgreSQL + Drizzle ORM (users table)
- Frontend: React + Vite (port 19514, base `/`)
- Styling: Tailwind CSS, Orbitron + Space Grotesk + Rajdhani fonts
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod schemas
- `lib/db/src/schema/users.ts` — users table schema
- `artifacts/api-server/src/lib/deriv.ts` — Deriv WebSocket integration
- `artifacts/api-server/src/lib/analysis.ts` — digit analysis engine
- `artifacts/api-server/src/lib/auth.ts` — admin/user auth (token-based)
- `artifacts/api-server/src/routes/` — all API route handlers
- `artifacts/digit-killer/src/pages/` — all frontend pages
- `artifacts/digit-killer/src/components/` — DCircle SVG, Layout/Sidebar

## Architecture decisions

- Deriv `ticks_history` and `active_symbols` are called WITHOUT authorization (public endpoints). The `DERIV_API_TOKEN` is available but not needed for read-only tick data.
- Tick history is cached per symbol+count with a 5-second TTL to reduce WebSocket connections.
- Admin auth uses in-memory token store (24h expiry). User passwords are SHA-256 hashed with a salt.
- Admin password is hardcoded as `AHMED2005`. Token stored in `localStorage`.
- DCircle component uses HTML5 Canvas with requestAnimationFrame for smooth animated pointer.

## Product

- **Splash** (`/`) — animated loading screen with logo and progress
- **Dashboard** (`/dashboard`) — live price, digit stream, distribution bars
- **Wide Eye View** (`/wide-eye`) — dual D-Circle SVG rings (1000 + custom ticks)
- **Over/Under** (`/over-under`) — entry signals for Over/Under contracts
- **Even/Odd** (`/even-odd`) — parity analysis with entry recommendation
- **Match/Differ** (`/match-differ`) — best digit to match/differ with confidence
- **Tick Analyser** (`/tick-analyser`) — Rise/Fall, Only Up/Down, High/Low Tick signals
- **AI Signals** (`/ai-signals`) — AI-generated signals with downloadable PNG flyers
- **Admin** (`/settings`) — password: AHMED2005 · user generation and management

## User preferences

- Dark mode only, futuristic cyber aesthetic
- Font stack: Orbitron (brand/titles), Space Grotesk (body), Rajdhani (labels)
- Neon cyan (#00e5ff) as primary accent, deep space black (#050a0f) background
- Digit colors consistent throughout: 0=teal 1=blue 2=purple 3=green 4=orange 5=cyan 6=lime 7=red 8=pink 9=yellow

## Gotchas

- Do NOT add `authorize` to public Deriv API calls — token is for trading/account endpoints only.
- Backend uses pino logger — `req.log` in routes, `logger` elsewhere. Never `console.log`.
- Frontend polling: `refetchInterval: 2000` for analysis endpoints, 3000 for signals.
- html2canvas is installed in `@workspace/digit-killer` for AI signal flyer downloads.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
