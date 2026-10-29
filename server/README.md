# Second Feature backend

Native Node HTTP server. Run `npm run server`, default port 3001. Vite proxies `/api` to that port during development. After `npm run build`, the server serves `dist` with an SPA fallback.

## Configuration

- `QLOO_API_KEY`: server-only secret. Never included in browser responses or logs.
- `QLOO_BASE_URL`: optional. Only `https://hackathon.api.qloo.com` is accepted, optionally with a trailing slash.
- `PORT`: integer 1 to 65535, default 3001.

## Routes

- `GET /api/status` returns `{configured:boolean}`.
- `GET /api/search?query=...` returns `{candidates:[{id,name,types,year?,address?}],warnings:string[]}`. Query length 1 to 180. No type filter is sent to Qloo. Returned candidates are for human confirmation, not automatic fuzzy substitution.
- `POST /api/plan` takes `{brief, films?}` and returns the shared `Plan` contract in live mode. Optional films defaults to the local catalog. JSON only, at most 200 KB. Up to 40 unique catalog films and six seeds per audience. Runtime, year, time format and all string lengths are validated with Zod. No sample fallback occurs on errors.

Errors use `{error:string,code:string,issues?:{path,message}[]}`. Validation is HTTP 400, unresolved identity is 422, unconfigured live is 503, upstream timeout is 504 and upstream errors are 502 or 429. Partner failure is explicitly reported as a partial live plan with warnings and an empty partner list.

## Evidence policy

Each seed is resolved independently by a unique exact normalised name and an explicit category when supplied as type:name. Ambiguous or unresolved seeds fail the plan and require human confirmation. Catalog movies additionally require `urn:entity:movie` and an explicitly returned matching year. No different title or year is substituted. The exact resolved anchor ID is included in both audience signals, while core and reach seeds remain independent.

Two independent movie Insights requests use `filter.type=urn:entity:movie`, `signal.interests.entities` as comma-separated IDs and `take=50`. Only exactly resolved catalog IDs are matched to those lists. Missing films retain null ranks. Returned list positions are never compressed after local filtering.

Core utility is reciprocal core rank. Bridge utility is the geometric mean of reciprocal core and reach rank. Discovery utility combines reciprocal reach rank with a positive core-to-reach ordinal gap. Both bridge and discovery require observations in both lists. These utilities are neither probabilities nor attendance estimates.

The bounded deterministic workflow plans the initial three by observed utility, checks hard constraints then expands once to all observed catalog candidates if necessary. Rights marked unavailable, exclusions, anchor self-pairing and runtime including the anchor and interval are hard filters. It never relaxes constraints to fill three slots. Unverified rights remain a human booking action.

Partner discovery uses `filter.type=urn:entity:place`, the union of audience signal IDs and `filter.location.query` set to the city. Names and available addresses are actual returned fields. No willingness to partner is inferred. City locality boundaries and suitability require verification.

Requests send `X-Api-Key` only to the validated host with redirects disabled. Each fetch has an 8 second timeout and at most one 429 retry, honouring a numeric Retry-After up to 15 seconds and failing explicitly for longer cooldowns. A private per-client TTL cache keeps sanitised entities for five minutes, at most 256 queries. Raw upstream payloads and error bodies are never returned or logged. Catalog lookups are bounded to three concurrent tasks and shared requests are paced at 650 ms to avoid bursting the upstream quota. A full uncached plan can therefore take several network round trips.

## Sample and test

`generateSamplePlan(brief, catalog?)` is browser-safe and deterministic except for its timestamp. It uses explicitly synthetic seed-and-anchor-dependent ordinal fixtures. Sample partners are fictional NYC prospects and are not shown for other cities. No sample rank is presented as Qloo evidence.

`npm test` runs mocked adapter, engine and native HTTP tests. `npx tsx server/probe.ts` runs safe live status, seed search, movie Insights and place Insights summaries using the environment key. Add `--plan` to exercise a full live plan. The probe never prints the key or raw responses.

## Verified public parameter references

- https://docs.qloo.com/reference/parameters documents `take` with maximum 50 and comma-separated `signal.interests.entities` for GET.
- https://github.com/qloo/docs-public/blob/main/recipes/recipes.md shows place Insights with `filter.location.query=New%20York` and `signal.interests.entities`.
- https://docs.qloo.com/reference/insights-api explains ordinal result ranking.

## Deliberate limitations

There is no LLM. Programming interpretations and the tool workflow are deterministic rules. Top-50 movie lists may have few or no exact catalog overlaps. Missing release-year metadata is not guessed. Identity ambiguity cannot be bypassed through the current Brief contract, which contains seed names rather than confirmed entity IDs. Place failures do not invalidate successful movie evidence but are always visible in warnings. This backend does not book rights, contact partners or predict turnout.
