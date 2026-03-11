# Deployment And UI Hardening Design

**Date:** 2026-03-11

**Status:** Approved in conversation, pending written-spec review

## Summary

This design hardens the Garage Admin Console monorepo so the two existing applications can
continue to operate independently while also supporting a reliable combined deployment.

The work is intentionally constrained. No new product features will be added. The goal is to make
the current feature set dependable, visually consistent after the UI migration, and operationally
coherent across all supported deployment modes.

## Problem Statement

The repository models two related but distinct applications:

- `apps/admin/*` provides the Garage administration experience.
- `apps/s3-browser/*` provides the S3 object browsing experience.

The product concept is simple:

- each application should work on its own;
- both applications should also be able to cooperate through Module Federation;
- the combined deployment should expose a single Admin Console product surface while using S3
  Browser only as an embedded capability.

The current implementation does not fully satisfy that model:

- standalone behavior needs verification after UI component migration;
- combined deployment serves S3 Browser remote assets but does not fully behave like a unified,
  internally wired runtime;
- operational boundaries between host, remote, bridge, proxy, and deployment configuration are not
  sufficiently tight;
- visible migration inconsistencies remain in UI states and component usage.

## Goals

- Make `admin` standalone deployment reliable for its existing flows and pages.
- Make `s3-browser` standalone deployment reliable for its existing flows and pages.
- Make `combined` deployment behave as a single Admin Console product shell with embedded S3 object
  browsing capability.
- Tighten the runtime contract between:
  - Admin host frontend
  - S3 Browser remote frontend
  - Admin API bridge/proxy routes
  - S3 Browser API runtime
  - Docker packaging and startup
- Remove obvious UI migration artifacts and inconsistent states without redesigning the product.
- Validate the result with a deployment-aware verification matrix.
- Deliver changes in small, conventional commits instead of a single large commit.

## Non-Goals

- No new business features.
- No new pages, workflows, or product scope expansion.
- No redesign of the Module Federation strategy.
- No full convergence of the two apps into one codebase-level application model.
- No broad shared-package refactor unless required to stabilize existing behavior.
- No visual redesign beyond cleaning up obvious inconsistency and regression.

## Deployment Model

### 1. Admin Standalone

**Runtime shape**

- Runs only Admin API and Admin Web.
- Provides the Garage cluster management experience.
- S3 Browser related features are optional integrations, not hard requirements.

**Expected behavior**

- Login works.
- Dashboard and cluster detail routes work.
- Core Garage-backed pages render and behave correctly.
- If S3 Browser integration is not configured, the relevant UI degrades clearly and safely.

### 2. S3 Browser Standalone

**Runtime shape**

- Runs only S3 Browser API and S3 Browser Web.
- Provides connection management and object browsing for S3-compatible storage.
- Still exposes MF remote assets for host usage.

**Expected behavior**

- Login works.
- Connection CRUD works.
- Bucket listing and object browsing work.
- Upload, download, delete, and folder creation work.
- Embedded components remain consumable by the Admin host.

### 3. Combined Deployment

**Runtime shape**

- Exposes one external product entry point: the Admin Console.
- Does not expose an independent S3 Browser product entry point.
- Internally runs the S3 Browser backend capability required by the bridge and embedded object
  browsing flow.
- Serves S3 Browser remote frontend assets for MF consumption by the Admin host.

**Product rule**

Combined deployment is **not** “two apps exposed together”.
It is “one Admin product shell with embedded S3 capability”.

**Expected behavior**

- Admin Console is the only user-facing application shell.
- Bucket detail object browsing works through the existing embedded S3 flow.
- Users are not expected to know about or navigate into an independent S3 Browser SPA.
- Direct combined-mode requests for S3 Browser SPA entrypoints or SPA-style routes must not expose a
  second product shell. Combined mode may serve remote assets under `/s3-browser/*` for MF loading,
  but it must not serve a standalone S3 Browser application route tree.

## Recommended Technical Approach

### Keep codebase boundaries, fix runtime composition

The two applications should remain separate code units. The fix is not to collapse them into one
process model or one frontend. The fix is to make the deployment/runtime composition match the
intended product model.

### Combined should use dual backend runtimes and a single frontend shell

The recommended combined implementation is:

- Admin API process exposed externally
- S3 Browser API process running internally for embedded S3 capability
- Admin Web served as the only product SPA
- S3 Browser remote static assets served for Module Federation embedding only

This is preferred over merging the S3 Browser API into the Admin API process because:

- it preserves clear system boundaries;
- it minimizes regression risk;
- it reuses the existing bridge and proxy model;
- it avoids entangling distinct env vars, databases, and route domains into one server surface.

## Runtime Contracts To Harden

### Admin Host Contract

- Admin host must reliably load the S3 Browser remote in supported embedded scenarios.
- Embedded object browser access from Admin pages must always use the Admin-side same-origin proxy
  contract rather than ad hoc direct access from the browser.
- Standalone Admin mode must surface unavailability as a clean degraded state.

### S3 Remote Contract

- S3 Browser remote assets must remain MF-consumable in both standalone and combined scenarios.
- Embedded components must continue to function using externally supplied embed config.
- Embedded mode must not accidentally depend on the standalone S3 Browser SPA shell.

### Bridge Contract

- Admin API bridge remains responsible for:
  - retrieving Garage key material;
  - authenticating to S3 Browser API;
  - creating or reusing S3 Browser connections;
  - returning the data needed for embedded object browsing.
- Bridge behavior must be deterministic across standalone-admin-plus-external-s3 and combined mode.

### Same-Origin Proxy Contract

- Admin API remains responsible for proxying embedded S3 Browser API traffic under `/s3-api`.
- Embedded frontend components should continue to operate against this stable path from the Admin
  shell.
- Combined mode should not rely on external network topology guesses when a stable internal address
  is available.

### Packaging Contract

- Combined image must package everything required for embedded S3 behavior, not only the remote
  frontend assets.
- Startup behavior must reflect the intended runtime composition.
- Standalone images must remain clean and focused on their respective app responsibilities.

## UI Hardening Scope

UI work is constrained to consistency and reliability.

### In Scope

- Obvious visual inconsistencies introduced by the shared UI migration
- Broken or mismatched empty states
- Broken or mismatched loading/error states
- Inconsistent component usage patterns that visibly degrade the interface
- Rough edges in embedded-vs-standalone UI behavior

### Out of Scope

- Large-scale visual redesign
- New visual system
- New product navigation
- New widgets or feature expansions

## Work Breakdown

### Workstream 1: Standalone Baseline Audit And Repair

Verify and fix standalone `admin` and standalone `s3-browser` behavior after the UI migration.

Focus areas:

- auth screens
- main layouts
- key dashboard/list/detail pages
- loading, error, and empty states required to restore baseline functional correctness
- migrated shared component usage only where it directly causes broken rendering, broken interaction,
  or clear standalone regression

### Workstream 2: Combined Deployment Repair

Make combined deployment satisfy the approved product model.

Focus areas:

- Docker packaging
- startup/runtime orchestration
- internal S3 API reachability
- bridge/proxy assumptions
- remote asset serving contract
- no standalone S3 product entry exposure

### Workstream 3: UI Consistency Pass

Normalize obvious migration scars without changing scope.

Focus areas:

- repeated page-state patterns after baseline functionality is restored
- shared primitives usage where existing pages visibly diverge in spacing, hierarchy, or control
  treatment after migration
- embedded object browser integration surface
- consistency between standalone and embedded presentation where appropriate

For this workstream, an in-scope migration inconsistency means an existing UI that is already
supposed to behave the same as its peers but now visibly differs because of the shared component
migration, layout drift, or incomplete state normalization. It does not include redesigning healthy
pages to make them “nicer”.

### Workstream 4: Verification And Documentation

Record how the supported modes are meant to run and how they were validated.

Focus areas:

- deployment docs
- behavior notes for combined mode
- validation commands
- manual verification checklist where automation is insufficient

## Verification Matrix

### Static Validation

- build succeeds for all workspaces that are part of the changed surface
- lint succeeds for changed areas
- typecheck succeeds for changed areas

### Mode Validation

#### Admin Standalone

- login page loads and authenticates
- dashboard renders
- cluster navigation works
- core cluster pages render without broken migrated UI states
- bucket detail page handles missing S3 integration gracefully

#### S3 Browser Standalone

- login page loads and authenticates
- connections page supports create/update/delete
- bucket list renders
- object browser renders
- upload/download/delete/folder flows behave correctly

#### Combined

- admin shell starts and serves the only user-facing SPA
- remote assets are available under `/s3-browser/*`
- admin-to-s3 proxy path works under `/s3-api/*`
- bucket detail bridge can create/reuse embedded S3 access
- embedded object browser loads and operates under the admin shell
- no independent S3 Browser user-facing shell is presented

### Scenario Validation

- Admin login -> dashboard -> cluster -> bucket detail
- S3 login -> connections -> buckets -> object browser
- Combined admin bucket detail -> bridge connect -> embedded object browser

## Error Handling Requirements

- Missing optional S3 integration in standalone Admin mode must produce an intentional, readable
  degraded state.
- Embedded object browser failures must not take down the containing Admin page.
- Combined mode failures should indicate internal integration faults rather than present ambiguous
  “service missing” behavior.
- UI states should prefer explicit, stable messaging over silent failure or partially rendered
  controls.

## Architecture Boundaries

The implementation should preserve these unit boundaries:

- `apps/admin/api`: Admin-facing BFF, Garage proxying, S3 bridge, same-origin proxy for embedded S3
- `apps/admin/web`: single product shell, host app, embedded S3 entry surface
- `apps/s3-browser/api`: S3 connection management and object operations
- `apps/s3-browser/web`: standalone S3 UI plus MF remote exports
- `packages/ui`: shared primitives only

Each unit should remain understandable without reading through unrelated internals.

## Delivery Strategy

Implementation should proceed in small, verifiable batches.

Expected commit shape:

- standalone stabilization
- combined deployment repair
- UI consistency cleanup
- documentation/verification updates

Each commit must:

- use Conventional Commits format;
- stay scoped to one coherent batch of work;
- be validated before commit rather than deferred to the end.

## Risks

- Combined-mode fixes can accidentally regress standalone assumptions if runtime contracts are not
  made explicit.
- UI consistency work can sprawl into redesign unless it is kept tied to concrete migration defects.
- Embedded flows depend on multiple integration points, so failures can appear in the wrong layer if
  verification is too narrow.

## Risk Mitigations

- Validate each deployment mode independently.
- Keep combined changes focused on runtime composition, not feature changes.
- Prefer tightening documented contracts over adding special-case logic.
- Commit in small batches with targeted verification.

## Open Questions

None. The key product and scope decisions were resolved during design review:

- Combined exposes only the Admin product shell.
- S3 Browser remains an embedded capability in combined mode.
- UI cleanup should accompany functional hardening, but only for obvious migration inconsistencies.

## Planning Readiness

This spec is ready for implementation planning once written-spec review passes and the user confirms
the saved spec document.
