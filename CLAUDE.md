# thaidhamma_calendar

A static single-page Thai Buddhist Dhamma calendar for 2026 (Buddhist year 2569). Displays Thai public holidays, bank holidays, bridge days, and retreat/course schedules at major Thai meditation centers. Hosted on GitHub Pages.

## Project Structure

```
index.html             — app shell: inline CSS + vanilla JS (no embedded data)
dhamma_events.json     — retreat/course schedule (loaded via fetch)
holidays_bot.json      — bank (BOT) holidays, date-keyed map (loaded via fetch)
holidays_general.json  — general public holidays, date-keyed map (loaded via fetch)
dhamma_data.json       — reference notes data (unused by UI)
README.md
```

**No build step.** Open `index.html` directly in a browser, or serve with any static HTTP server.

## Architecture

`index.html` is the app shell (CSS + JS). All data is fetched from JSON files at runtime:

- **Data loading** — `Promise.all` fetches `dhamma_events.json`, `holidays_bot.json`,
  `holidays_general.json`. `initData()` builds `RETREATS`; `mergeHolidays()` combines the two
  holiday maps into `HOLIDAYS` (a date in both → `type:'both'`, bank-only → `'bot'`,
  public-only → `'pub'`). `BRIDGES` stays hardcoded in the `<script>` tag.
- **CSS** — CSS custom properties for color theming; responsive grid (4 → 3 → 2 → 1 cols)
- **Rendering** — `render()` shows months from the **current month** through the **latest month
  present in the data** (events + holidays + bridges), spanning year boundaries (e.g. 2026→2027).
  If opened after all data has passed, it falls back to the full data range. The header title/range
  (`#calTitle`/`#calSub`) is set dynamically.
- **Filtering** — venue + course dropdowns and a `showBridges` toggle. The course filter groups by
  **category**: `courseCategory()` strips the leading course code (`DSN260008 `) so ~11 categories
  show instead of one-per-course. The day popover still displays the full course string (with code).
- **Popover** — interactive `#tooltip`: hover-open and reachable on desktop, tap-to-open on
  mobile; each course row is an `<a href>` to its registration page (`r.url`)
- **Local run** — must be served over HTTP (fetch is blocked on `file://`)

## Data Editing

- **Courses** — edit `dhamma_events.json`. Each entry: `start`, `end`, `location` (shown as
  venue), `course`, `url` (registration link), plus `type`/`gender`/`age` (not used by the UI).
  Registration URLs follow `...&task=coursedetail&id=<ID>&Itemid=39` on thaidhamma.net.
- **Holidays** — edit `holidays_bot.json` (bank) and/or `holidays_general.json` (public). Each is
  a `"YYYY-MM-DD": { "th": ..., "en": ... }` map. Put a date in both files if it's both a bank and
  public holiday.
- **Bridge days** — still the `BRIDGES` object in `index.html` (`"YYYY-MM-DD"` → Thai string).

`RETREATS`, `allVenues`, `allCourses` are derived from the events at load. Venue colors are
auto-assigned by index from the `palette` array into `venueColor` — no manual color map.

## Language

UI is bilingual Thai/English. Thai text uses Sarabun / Noto Sans Thai fonts loaded from Google Fonts.

## Deployment

Push to `main` → GitHub Pages auto-deploys. No CI pipeline.

## Conventions

- Keep all CSS/JS inline in `index.html`; data lives in the JSON files (don't inline data back in)
- The data files must be served over HTTP (GitHub Pages, or a local static server) — `fetch` fails on `file://`
- Buddhist calendar year = Gregorian year + 543 (2026 = 2569)
- Date keys are always `"YYYY-MM-DD"` (Gregorian)
- Venue colors are auto-assigned from the `palette` array — add to `palette` only if venues outnumber the 9 existing colors
