# Task calendar — public holidays

## Behavior

- On **Calendar** (`/calendar`), users can turn **Holidays** on or off. The choice is stored **per account** in `user_calendar_preferences.show_holidays` (default `true`).
- When holidays are on, the client loads `GET /api/calendar/public-holidays?country=…&years=…` (authenticated). Data is merged from [Nager.Date](https://date.nager.at) **plus** Western (Gregorian) **Easter Sunday** and **Easter Monday** when those days are missing from the upstream list (the US Nager feed often omits Easter Sunday).
- **Region:** `holiday_country_code` on the same row (nullable). `null` means **Auto**: the client picks a default from `navigator.language` (fallback `US`). The calendar header includes a compact region selector.

## HTTP API

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/calendar/preferences` | Returns `{ userId, showHolidays, holidayCountryCode, createdAt, updatedAt }`. |
| `PATCH` | `/api/calendar/preferences` | Body: optional `showHolidays` (boolean), optional `holidayCountryCode` (two-letter ISO code or `null` for Auto). At least one field required. |
| `GET` | `/api/calendar/public-holidays` | Query: `country` (ISO alpha-2), `years` (comma-separated years, max 10, range 1990–2100). Response: `{ holidays: [{ date, name }], meta: { hadUpstreamData } }`. |

## Schema

- Drizzle: `userCalendarPreferences` in [`shared/schema/core.ts`](../shared/schema/core.ts).
- SQL: [`migrations/0031_user_calendar_preferences.sql`](../migrations/0031_user_calendar_preferences.sql).

## Tests

- [`server/western-easter.test.ts`](../server/western-easter.test.ts) — Easter date fixtures.
- [`server/services/calendar/public-holidays.test.ts`](../server/services/calendar/public-holidays.test.ts) — merge + dedupe with mocked `fetch`.
- [`server/calendar-holidays.contract.test.ts`](../server/calendar-holidays.contract.test.ts) — route + migration presence (included in `npm run test:objective-contracts`).

## Limits / caveats

- **Orthodox Easter** and non-Gregorian calendars are not modeled.
- Holiday accuracy depends on Nager for the chosen country; offline or upstream failures yield sparse or empty lists (Easter rows from computus still apply).
