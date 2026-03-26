## Plan: Timesheets MVP Implementation

Build a local-first desktop timesheet app using Tauri + React 19 + TypeScript + SQLite/Drizzle, with a phased MVP-first delivery path. MVP will include task CRUD, optional timer with quick switching, date-range reporting, CSV export (decimal-hour durations), and minimal crash recovery (restore open tasks as paused).

**Steps**
1. Phase 1: Project Foundation
1. Initialize Tauri 2 + React 19 + TypeScript app scaffold with strict TS and lint setup.
2. Add core dependencies: Drizzle ORM, SQLite driver, state management, date utilities, CSV generation (exclude automated test frameworks for MVP).
3. Define app-level architecture boundaries: frontend UI/state, backend IPC commands, persistence layer.
4. Create migration workflow and seed flow for predefined projects. This blocks all downstream data-dependent phases.

2. Phase 2: Data Model and Persistence (*depends on Phase 1*)
1. Implement schema for projects, tasks, timers, and crash-recovery snapshots.
2. Seed predefined projects with fixed ticket requirements and allow user-defined additions.
3. Implement repository/query layer for task CRUD, timer state transitions, recent-task retrieval, range reporting, and export source queries.
4. Add business-rule validation: conditional ticket requirement by project, one-date-per-task invariant, non-negative duration.
5. Add migration and seed verification checklist for manual user validation on a local SQLite DB.

3. Phase 3: Core Task UX (*depends on Phase 2*)
1. Build task list and task form UX for create/edit/delete with confirmation dialog.
2. Implement project selector with ticket-field conditional behavior.
3. Implement date editing on task edit while preserving one-date-per-task behavior.
4. Add recency tracking for quick list (2-3 most recently used tasks).
5. Add client-side and IPC error handling with user-friendly feedback.

4. Phase 4: Timer and Task Switching (*depends on Phase 3*)
1. Implement optional timer start/pause/resume per task.
2. Implement seamless task switching behavior: active timer auto-pauses, selected recent task resumes.
3. Support retroactive interruption handling: pause running task later, adjust elapsed time, log interruption into new or existing task.
4. Ensure app-close flow warns user, finalizes running timers, persists open state safely.
5. Add timer-focused user validation scenarios for switching accuracy and elapsed-time correctness.

5. Phase 5: Reporting and CSV Export (*depends on Phase 3; parallel with Phase 4 after shared query layer is stable*)
1. Build date-range reporting screen grouped by project with totals.
2. Implement CSV export with detailed task rows and per-project summary rows.
3. Use decimal-hour duration formatting for MVP export.
4. Add consistency checks so report totals and CSV summary rows match.

6. Phase 6: Crash Recovery MVP (*depends on Phases 2 and 4*)
1. Persist open-task/timer recovery snapshot on lifecycle events.
2. On startup, detect recoverable state and prompt user.
3. Restore recoverable tasks as paused (not auto-running), then clear recovery snapshot once acknowledged.
4. Add recovery path user validation scenarios for accept/decline prompt branches.

7. Phase 7: Hardening and Packaging (*depends on Phases 3-6*)
1. Validate core user journeys manually: task CRUD, switching timers, reporting, export, recovery.
2. Validate data persistence across app restarts through user-driven checks.
3. Build desktop bundles for target OSes and perform manual smoke checks.
4. Document operational conventions (local DB file path, backup guidance, migration commands).

**Relevant files**
- /home/dlars99/workspace/timesheets/outline.md - source requirements and business rules to trace during implementation.
- /home/dlars99/workspace/timesheets/src-tauri/src/main.rs - Tauri command registration, app lifecycle hooks, close/recovery handling.
- /home/dlars99/workspace/timesheets/src-tauri/Cargo.toml - Rust-side dependencies for Tauri/runtime integration.
- /home/dlars99/workspace/timesheets/src/db/schema.ts - Drizzle table/schema definitions and constraints.
- /home/dlars99/workspace/timesheets/src/db/migrations/ - SQL migrations including initial schema and seed migrations.
- /home/dlars99/workspace/timesheets/src/db/queries.ts - typed query/repository functions for CRUD, timers, reporting, export.
- /home/dlars99/workspace/timesheets/src/stores/useTasksStore.ts - task/timer state orchestration and recency behavior.
- /home/dlars99/workspace/timesheets/src/components/TaskForm.tsx - create/edit UI with conditional ticket input.
- /home/dlars99/workspace/timesheets/src/components/TaskList.tsx - task listing, edit/delete actions, recent-task entry points.
- /home/dlars99/workspace/timesheets/src/components/TimerControls.tsx - timer controls and switch/resume interactions.
- /home/dlars99/workspace/timesheets/src/components/ReportView.tsx - date-range totals by project.
- /home/dlars99/workspace/timesheets/src/services/exportCsv.ts - CSV shaping for detail and summary rows (decimal-hour durations).
- /home/dlars99/workspace/timesheets/src/App.tsx - top-level route/layout composition.
- /home/dlars99/workspace/timesheets/tauri.conf.json - app packaging/lifecycle config.
- /home/dlars99/workspace/timesheets/package.json - scripts and build/toolchain commands (no automated test runners in MVP).

**Verification (User Testing Only)**
1. Run guided manual checks for task CRUD, timer start/pause/resume, and task switching behavior.
2. Run manual date-range reporting and CSV export checks, then compare project totals and summary rows.
3. Run manual interruption and retroactive adjustment scenarios to confirm final totals are correct.
4. Run manual app-close and restart checks to confirm warnings, persistence, and paused recovery prompt behavior.
5. Run manual packaged-app smoke checks on target OSes.

**Decisions**
- Included in MVP:
Task CRUD, timer with quick recent switching, date-range totals by project, CSV export with detail + summary rows, decimal-hour export formatting, minimal crash recovery restoring paused state.
- Excluded from MVP:
Keyboard shortcuts (post-MVP), full session-level timer history/audit trail, editable/renamable existing projects, automated unit/integration/E2E test suites.
- Constraints:
Fixed ticket-required rules for specified predefined projects; users may add projects but not edit existing ones.

**Further Considerations**
1. Backups: Option A manual export-only; Option B periodic DB snapshot file. Recommendation: Option B after MVP.
2. Soft delete for tasks: Option A hard delete; Option B soft delete with restore. Recommendation: Option A for MVP simplicity.
3. Multi-profile support: Option A single-user local DB; Option B profile-based separation. Recommendation: Option A unless team usage emerges.
