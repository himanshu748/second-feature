# Second Feature

Choose a film you are screening. Live Qloo rankings help find a second film that connects two audience reference sets and fits your catalog and evening. Inspect the evidence, choose a pairing and export a screening brief.

## What is implemented

- A concrete product landing page explaining the input, Qloo request and resulting film shortlist. It leads directly into the live planner, not a simulated recommendation demo.
- Hash-based landing/workspace navigation with back-button support and preserved in-session workspace state.
- A touch-friendly expandable settings brief on small screens, clearer onboarding, larger controls and plain-language strategy explanations.

- React 19 and TypeScript interface with Motion for React shared-layout transitions, reduced-motion support and responsive layouts.
- Programming desk with a locked anchor, two explicitly typed audience reference sets, Core / Bridge / Discovery strategies and hard duration constraints.
- Editable catalog of 20 films, film additions up to 40 titles, rights statuses and exclusions.
- Live server-side Qloo entity resolution, separate movie Insights calls and city-filtered place discovery.
- Evidence inspector with ordinal ranks, entity IDs, tool traces and honest partial-result warnings.
- Bounded plan/check/replan workflow. Excluding an unavailable film preserves the anchor and rebuilds from the remaining observed candidates.
- Event brief editing, local workspace persistence, partner prospect selection, draft-only outreach copy and Markdown export.
- A real MCP tool, plan_cinema_program, allowing an external AI agent to invoke the Qloo-grounded planner.
- Native Node HTTP server with validation, private in-memory caching, request pacing, rate limits and a concurrency cap.

## Important scope boundaries

This build does not include an internal LLM. The planner is deterministic and programming rationales use catalog-based editorial rules. The MCP interface makes it usable as an agentic tool by an external agent without misrepresenting fixed rules as model reasoning.

Production defaults to live Qloo and has no user-facing sample switch. Without a configured backend, recommendations are blocked with a clear message. Live errors never fall back to generated rankings. Synthetic fixtures exist only for tests and an explicit Vite development route at /#/workspace?mode=sample. That query cannot enable fixtures in the production build. Static HTML cannot host the backend and therefore cannot provide live recommendations.

Affinity is not attendance probability. A film in the illustrative catalog is not a rights clearance. Place results are prospects, not confirmed partners. Names, addresses, opening hours, runtimes and availability require human verification.

## Run the app

Requires Node.js 24 and npm.

1. Install dependencies with npm ci.
2. Run npm run build.
3. Configure QLOO_API_KEY in your server or hosting provider's secret manager. Set QLOO_BASE_URL to https://hackathon.api.qloo.com. Never use a VITE_ environment variable for a secret.
4. Run npm start. The server serves the application and API on PORT, default 3001.
5. Open the app, choose Find my second film on the landing page and select Get Qloo recommendations after setting the brief. The workspace can also be opened directly at /#/workspace.

Without a key, the app explains the missing connection and does not produce film recommendations. To develop the frontend, run npm run dev alongside npm run server; Vite proxies /api to localhost:3001.

The included .env.example is a template only. Node does not load .env automatically. If developing on your own machine, a locally created .env can be loaded with:

    node --env-file=.env node_modules/tsx/dist/cli.mjs server/index.ts

Do not commit .env. The build never writes credentials to disk. The app's /api/status response exposes only whether a key is configured, not its value.

## Deploy

A Dockerfile and render.yaml are included. Create a new service from your own repository and enter the Qloo key through the hosting provider's secure environment settings. The Render blueprint uses the Docker runtime. It does not create a service until you explicitly deploy it.

Build command: npm ci && npm run build
Start command: npm start

The Node server binds to 0.0.0.0 and honours PORT. This is a persistent Node service, not a serverless function. Both frontend and API must share the same origin.

This repository contains the application source. An external live deployment with server-side Qloo credentials is still required. Do not submit the backend-free artifact as if it were the hosted Qloo application.

## Agent integration through MCP

Run npm run mcp in an MCP host with QLOO_API_KEY and QLOO_BASE_URL configured securely. The stdio server must not be run with a key embedded in command-line arguments or a public config file.

Tool: plan_cinema_program

Input: { brief, films? }. Brief contains anchorId, coreSeeds, reachSeeds, maxMinutes, intervalMinutes, excludedIds, strategy, city and startsAt. The optional film catalog uses the same shape as src/lib/catalog.ts. Re-call the tool with updated constraints or exclusions to replan.

Explicit seed examples:

- person:Wong Kar-wai
- movie:In the Mood for Love (2000)
- artist:Nujabes
- book:Kafka on the Shore

Untyped, uniquely exact names are accepted. Ambiguous names are rejected with an actionable error rather than silently matched to a different entity. No outreach, booking or other outward-facing action is performed by the tool.

## How the ranking works

Each audience gets an independent top-50 Qloo movie list with the resolved anchor included in both. Catalog movies are matched by exact normalized title, movie type and returned year. Missing or ambiguous identities do not receive invented ranks.

Only eligible movies fit the total duration including the anchor and interval. Unavailable films, excluded IDs and self-pairings are removed before ranking. Unverified rights remain a human approval task.

- Core: reciprocal core rank.
- Bridge: geometric mean of reciprocal core and reach ranks, requiring observation in both lists.
- Discovery: reciprocal reach rank weighted by a positive gap from the core rank, requiring both lists.

These utilities are not calibrated scores or audience percentages. The tool evaluates an initial three candidates, checks hard constraints then makes at most one evidence-preserving expansion across the observed catalog if needed. It does not relax constraints to manufacture three results.

Qloo may return fewer than three eligible pairings. This is an honest outcome, not a reason to fabricate data. The tested default live programme returned two feasible pairings before an exclusion and one after it. Catalog coverage can vary over time. The strict identity resolver could not verify the default Aftersun entry during testing and excluded it from live ranking.

## Evidence and data policy

The official hackathon host is https://hackathon.api.qloo.com. Authentication is X-Api-Key on GET requests, never a browser key or a URL query key. The server rejects alternate hosts and redirects. Private cache lifetime is five minutes, at most 256 requests per client.

The public code contains no stored Qloo responses. Sample rankings are deterministic hash-derived fixtures, explicitly not empirical data. Live Qloo evidence stays in server memory and the active browser response. The app persists only user-entered brief/catalog/notes/title state in localStorage, not live result sets or keys.

Place Insights can return a generic urn:entity type. Results from the explicit place-filtered request are accepted when types are generic, absent or explicitly place, but not when a contradictory specific entity type is present. Every place result remains subject to independent location and suitability verification.

Basic in-memory limits are six planning requests and 40 search requests per minute per direct peer IP, plus two simultaneous planning runs. Qloo requests are paced at 650 ms and have bounded timeouts and one rate-limit retry. A Retry-After above 15 seconds fails explicitly instead of holding a request indefinitely. These are prototype safeguards, not a replacement for production authentication, a shared rate-limit store or provider-level budget controls. Behind a reverse proxy, direct-peer limits can be shared by users.

## Tests

- npm test: 25 engine, API, validation and MCP tests.
- npm run build: strict TypeScript checking and optimized Vite build.
- npm run test:landing: exercises the concrete landing page, live-default empty state, mobile settings, library, event brief navigation, modals and back navigation at nine widths from 320 to 1920 pixels. Automated axe checks on the landing and workspace views at 390 and 1440 pixels currently report zero WCAG A/AA violations. This is not a complete accessibility certification.
- npm run test:production: starts a local production server without a key and verifies that recommendations stay disabled, no sample switch appears and resets or sample query flags cannot enable fake results. Run npm run build first.
- npm run test:ui: requires the Vite dev server; checks replanning, strategy selection, modal interactions, event export, catalog edits, local persistence, feasibility empty states and 1440/1024/768/390 px layouts.
- npm run test:live: requires a securely configured backend on port 3001 and the Vite server on 5173. It consumes Qloo quota. Checks live mode, real movie and place data, entity provenance, exclusion replanning and event brief output.
- npx tsx server/probe.ts --plan-only: safe live smoke probe; prints summaries, never a key or raw response body.

Browser tests use Playwright. Install its browser with npx playwright install chromium if needed. Test outputs belong in test-results, which is ignored. Real API results must never be checked in as fixtures.

## Preview

Build a standalone layout-only HTML preview:

    VITE_STATIC_PREVIEW=true npm run build -- --outDir preview-dist
    node scripts/make-preview.mjs

The generated second-feature-preview.html has no live API access or credentials. It displays the landing page and blocked planner without fabricated film results. Deploy the full Node app for live recommendations.

## Files

- src/Root.tsx: landing/workspace routing and preserved workspace state.
- src/Landing.tsx and src/landing.css: concrete product explanation and Qloo request illustration.
- src/App.tsx: complete product interface.
- src/Poster.tsx: original typographic SVG film studies, not official posters.
- src/lib/catalog.ts: illustrative metadata and default brief.
- src/lib/engine.ts: browser-safe constraint and ordinal ranking logic.
- server/qloo.ts: authenticated Qloo adapter and live bounded workflow.
- server/index.ts: HTTP service and static app hosting.
- server/mcp.ts: agent-facing MCP tool.
- server/schema.ts: validated input contract.
- tests: synthetic unit fixtures and browser workflows.

## Sources and credits

Qloo: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
Qloo parameters: https://docs.qloo.com/reference/parameters
Hackathon: https://qloo.devpost.com/
Motion: https://motion.dev/docs/react-layout-animations

All film artwork in this application is original geometric and typographic SVG work, not a reproduction of official promotional posters. Film titles identify the works being considered; no affiliation or screening rights are claimed. Metadata is a hand-entered illustrative catalog and should be checked against the booked version. Space Grotesk and DM Sans are loaded through Google Fonts under their respective open font licenses. Icons use Lucide. Dependency license notices remain in their upstream packages.

## Hackathon readiness

Implemented and tested: product workflow, live Qloo calls, evidence separation, real MCP tool, source package and MIT license.

Still required before submission: external live deployment with server secrets, deployment smoke testing and final submission text. No prize outcome is guaranteed.
