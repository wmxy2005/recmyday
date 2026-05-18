# Rec My Day Architecture

## Business Rules

- `day_key` follows the natural calendar date. The configured start time never moves a record to a different day.
- Start time only changes the computed `minutes_since_start`.
- If the current time is before the configured start time, `minutes_since_start` is clamped to `0`.
- Single-record mode (`separate_record_enabled = true`, shown as `单独记录=是`) updates the latest record for the natural day and does not show the type picker; it uses the configured default record type.
- Separate-record mode (`separate_record_enabled = false`, shown as `单独记录=否`) appends duration records. Starting a timer opens the record type picker first; after a type is selected, the timer starts and the floating button label shows the selected type. Ending the timer saves the duration with that selected type.
- Every record has a record type. Built-in types are seeded by migration and cannot be edited, deleted or reordered.

## Data Flow

- Expo Router owns navigation and tab routing under `app/`.
- `SQLiteProvider` initializes the local database and runs migrations in `src/data/database.ts`.
- Shared setting reads go through `readRecordSettings` / `useRecordSettings` in `src/hooks/useRecordSettings.ts`.
- Pages keep local UI state for expanded panels, sheets, dialogs and draft editor values. No global state library is required for the current app size.

## Import And Export

- Export files include `app`, `schemaVersion`, `exportedAt`, `recordCount`, `recordTypes`, `records` and `checksum`; schema v3 includes record type icons.
- Import keeps the existing user-facing behavior while validating app id, schema version, record count, checksum, record shape, file size and maximum record count. Legacy exports without record types are mapped to the default built-in type.
- Import replaces all records only after the user confirms.

## UI Organization

- Shared primitives live in `src/components`, including animated press feedback, confirmation dialogs, time wheels, record buttons and sheet modals.
- Theme values live in `src/theme.ts`. Prefer adding semantic tokens there before introducing new hard-coded colors or sizes.
- Page-level components should preserve existing layout and behavior when extracted.

## Development Checklist

- Run `pnpm typecheck`, `pnpm lint` and `pnpm test` before handoff.
- Do not commit credentials, certificates, keystores or `.env*.local` files.
- Keep database migrations append-only. Never rewrite historical migrations without a deliberate data migration plan.
- Preserve export schema compatibility unless `schemaVersion` is intentionally bumped.
