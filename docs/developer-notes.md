# Developer Notes

This document records how `DataSense Channel Intelligence` was built, where it diverged from the tutorial starting point, which issues showed up during development, and what was learned while shipping the project in Codex desktop.

## Build context

- Built completely in the Codex desktop app
- Started from Nate Herk's [Master 97% of Codex in 1 Hour](https://www.youtube.com/watch?v=3TdD8Qv5Tk8) tutorial as the initial workflow reference
- Extended beyond the tutorial into a real deployed app with persistence, operator workflows, deployment handling, and operational documentation
- Developer observation: the Codex daily usage limit on the `$20` plan was hit twice during the broader build process

## What changed from the tutorial

The tutorial was a useful accelerator, but this project moved beyond the tutorial shape in several important ways:

- Added Supabase-backed persistence instead of staying in a local-only flow
- Added two operator modes:
  - `public_only`
  - `owner_connected`
- Added Google OAuth owner-connect flow and token handling
- Added a persisted YouTube sync history model
- Added a JSON snapshot export path for a stable Vercel-ready dashboard data source
- Added a troubleshooting runbook to capture repeated deployment and environment failures
- Added production-oriented deployment handling instead of treating the app as a local demo only

## Major features and estimated build time

These are **time estimates**, reconstructed from workspace file timestamps on `May 11-12, 2026`. They are useful for documenting sequencing and effort, but they are not the same as a time-tracker export.

| Feature area | Evidence window | Estimated build time | Notes |
| --- | --- | ---: | --- |
| Base YouTube integration and local store | `11:47 AM` to `3:29 PM` on `May 11, 2026` | ~3.5 to 4 hours | Included env setup, typed YouTube utilities, local JSON store, OAuth routes, status route, and early data flow |
| Supabase persistence layer | `4:02 PM` to `4:51 PM` on `May 11, 2026` | ~45 to 60 minutes | Included `src/lib/youtube/supabase-store.ts`, schema creation, and setup docs |
| Sync pipeline and insight API shaping | `9:16 PM` to `9:53 PM` on `May 11, 2026` | ~40 minutes | Included data route, sync route, sync orchestration, and comment-insight generation logic |
| Dashboard snapshot data layer | `10:28 PM` to `10:56 PM` on `May 11, 2026` | ~30 minutes | Included snapshot types, loader, derived metrics, and snapshot-backed page wiring |
| Dashboard UI and branding pass | `10:29 PM` to `11:26 PM` on `May 11, 2026` | ~55 to 60 minutes | Included tabbed dashboard UI, CSS system, branded assets, and operator controls |
| Export scripts and snapshot generation | `11:27 PM` to `11:28 PM` on `May 11, 2026` | ~10 to 15 minutes | Included snapshot export and workbook export scripts, plus generated JSON |
| Documentation and recovery/runbook work | `10:23 PM` on `May 11` to `9:52 AM` on `May 12` | ~1 to 2 hours spread across the build | Included design/plan docs, runbook capture, README polish, and cleanup |

## Token usage notes

Exact **per-feature** token counts were not recoverable from the repository itself. Codex session logs do expose session-level token telemetry, but they do not map cleanly to each feature block above without a dedicated tracking workflow.

What can be stated confidently from the local session logs:

- One recorded Codex rollout for this workspace reached at least **~7.1 million total tokens**
- Mid-to-late turns in that rollout were commonly in the **~60k to ~125k total tokens per turn** range
- The recorded plan type in that session was `plus`
- The broader build was heavy enough that the developer hit daily usage limits twice on the `$20` plan

If exact per-feature token accounting matters in future projects, the right move is to log milestones during the build and pair them with exported session telemetry instead of trying to reconstruct them later.

## Codex capabilities that were most useful

The parts of Codex desktop that mattered most in this build were practical, not flashy:

- repo-aware multi-file editing
- patch-based code changes across API routes, UI, scripts, and docs
- terminal-driven verification for `build`, `typecheck`, and local debugging
- environment and deployment troubleshooting
- iterative refactoring while preserving a working app shape
- operational documentation and runbook capture
- rapid context switching between product work, infra work, and developer docs

## Main issues encountered

- Windows OneDrive lock issues around `.next\\trace`
- stale generated TypeScript artifacts under `.next/types` and `tsconfig.tsbuildinfo`
- Supabase `service_role` permission gaps
- wrong `SUPABASE_URL` shape when `/rest/v1` was appended
- local JSON storage not being suitable for deployed persistence
- OAuth state and owner/public mode behavior needing to be made explicit
- comment availability varying per video and needing warning-based handling instead of hard failure
- Codex daily usage limits becoming a real delivery constraint on the `$20` plan

The operational fixes for these issues live in [docs/troubleshooting-runbook.md](/C:/Users/roopm/OneDrive/Documents/New%20project/docs/troubleshooting-runbook.md).

## What worked well

- Starting from a tutorial reduced the blank-page cost
- Codex was strong at moving quickly once the app shape was clear
- Converting to a snapshot-backed dashboard made Vercel deployment simpler
- Adding Supabase early made the app feel more production-ready
- Separating operator sync concerns from dashboard presentation was the right architecture move

## What I would do differently next time

- track feature milestones and token counts as the build progresses
- move off a OneDrive-backed project path earlier for Next.js-heavy work
- decide the persistence model earlier instead of evolving from local storage to hosted storage mid-stream
- add scheduled operational automations earlier once the deploy is stable
- define a stronger naming and product-language pass earlier in the build so public docs need less cleanup later

## Next build step

The next practical extension is not more UI. It is operations:

- scheduled dashboard refreshes with Codex automations
- scheduled website performance checks with Codex automations
- continued expansion of analytics once refresh and monitoring are automated
