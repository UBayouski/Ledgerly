# Ledgerly

**An AI operations copilot for small businesses that run on PayPal.**
One screen with your live PayPal transactions, invoices, disputes and catalog in a data grid, plus an LLM copilot (Gemini by default, provider switchable) that reads the same data, drives the grid, and takes action in PayPal through the PayPal Agent Toolkit, with every money-moving step gated behind a human approval.

Built for the PayPal AI Hackathon 2026.

## What it does

- **Morning brief.** On load, Ledgerly pulls the last 30 days of transactions, all invoices and open disputes, and the model writes a short brief: who owes you money, which disputes have a deadline, what changed. Each item links to the rows in the grid and to a ready-made prompt for the copilot.
- **Ask the grid.** "Who owes me money?", "Summarize last month", "Which invoices are more than 14 days late?" The copilot answers from live PayPal data and switches, filters, sorts and highlights the AG Grid so you see exactly the rows it means.
- **Act with approval.** "Send reminders to everyone more than 14 days overdue." The copilot proposes each action, the UI shows an approval card with the exact payload, and nothing runs until you click Approve. Sending invoices and reminders, cancelling, refunding, accepting a dispute and changing subscriptions all go through this gate.
- **Read-only tools run freely.** Listing and fetching invoices, transactions, disputes, orders, products and plans do not need approval, so the copilot can investigate before it proposes.

## How it is built

| Layer | Tech |
|---|---|
| UI | Next.js 16, React 19, AG Grid Community (dark Quartz theme) |
| Agent loop | Vercel AI SDK v7 `streamText` with tool approvals, streamed to `useChat` |
| Model | Switchable with `LLM_PROVIDER`: Gemini 3.1 Pro via `@ai-sdk/google` (default), Claude Opus 5.5 via `@ai-sdk/anthropic`, or either through Vertex AI via `@ai-sdk/google-vertex`. `LLM_MODEL` overrides the model id |
| PayPal actions | `@paypal/agent-toolkit` (invoices, transactions, disputes, orders, refunds, catalog, subscriptions, shipment tracking) |
| PayPal data | REST v1/v2 (Transaction Search, Invoicing, Customer Disputes, Catalog, Plans) using the toolkit's OAuth client |
| Brief | `generateObject` with a zod schema over a compact account snapshot |

Key files:

- `src/lib/tools.ts`: adapts the toolkit's AI SDK v4 tools to v7, parses their JSON results, and marks every tool that is not read-only (prefixes `list_`, `get_`, `show_`, `search_`, `generate_`) as `needsApproval`. Also defines the two UI tools (`show_view`, `get_grid_snapshot`) that the browser executes to drive the grid.
- `src/app/api/chat/route.ts`: the agent loop, system prompt, and column guide.
- `src/lib/data.ts`: PayPal REST fetchers normalised into grid rows.
- `src/components/Grid.tsx`: AG Grid wrapper with an imperative API for filters, sorts, highlights and snapshots.
- `scripts/seed.ts`: populates a sandbox with products, a plan, and six invoices in different states.

## Run it locally

Requirements: Node 24+, pnpm 10 (`corepack enable`), a PayPal sandbox REST app with Invoicing and Transaction search enabled, and a model key: a Google AI Studio key (free tier) for the default Gemini provider, or an Anthropic key with `LLM_PROVIDER=anthropic`.

```bash
pnpm install
cp .env.example .env.local      # fill in PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, GOOGLE_GENERATIVE_AI_API_KEY
node --env-file=.env.local scripts/seed.ts   # optional: demo invoices, products, a plan
pnpm dev                        # http://localhost:3000
```

`GET /api/health` reports whether credentials are present and PayPal auth works.

Sandbox notes:

- Transaction Search returns payments made to the sandbox business account. A fresh sandbox has none. The seed script tries two direct card orders, which need "Advanced Credit and Debit Card Payments" enabled on the sandbox app. Any sandbox checkout against the same business account (for example from the companion Errandly project) also shows up after a few minutes.
- Disputes cannot be created through the API. The Disputes view will be empty in a fresh sandbox; the copilot still handles the flow when disputes exist.
- `get_merchant_insights` is not available in sandbox and is disabled.

## Deploy

One click on Render with `render.yaml` (set the three secret env vars), or `docker build -t ledgerly . && docker run -p 3000:3000 --env-file .env.local ledgerly`.

## Demo script (3 minutes)

1. Open the dashboard: the brief loads and names overdue customers and totals.
2. Click "Show in grid" on an urgent item: the Invoices view filters and flashes the rows.
3. Ask "Draft reminders for every invoice more than 14 days overdue." Approve one reminder, deny another, watch the grid refresh.
4. Ask "Summarize the last 30 days and the fees I paid." The copilot reads the transactions snapshot and answers with numbers.
5. Select rows with the checkboxes and click "Ask copilot about selection."

## License

MIT
