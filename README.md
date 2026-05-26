# thaidhamma_calendar

A simplified, single-page **Thai Dhamma retreat calendar for 2026 (พ.ศ. 2569)**. It overlays
meditation retreat courses on a 12-month calendar together with Thai public/bank holidays and
"bridge days" (take 1 day of leave for a long weekend).

Data is a simplified view of the schedule at
[thaidhamma.net](https://www.thaidhamma.net/index.php?option=com_thaidhamma&Itemid=39&filter_locationid=0&lang=th).

## Features

- 12-month 2026 calendar, Buddhist year labels (BE = CE + 543)
- Thai public holidays + bank-only holidays, color-coded
- Bridge-day suggestions, with a **toggle to show/hide them**
- Retreat courses loaded from `dhamma_events.json`, color-coded by venue
- Filter by venue (สถานที่) and by course (หลักสูตร)
- Hover (desktop) or tap a day (mobile) to open a popover of that day's courses —
  **click a course to jump to its registration page** on thaidhamma.net
- Print / Save-as-PDF friendly

## Data files

All data is loaded at runtime via `fetch` from three JSON files next to `index.html`:

### `dhamma_events.json` — retreat/course schedule

An array of objects:

```json
{
  "start": "2026-04-22",
  "end": "2026-05-03",
  "location": "ศูนย์ธรรมอาภา (พิษณุโลก)",
  "course": "DAB260016 หลักสูตรวิปัสสนา (10วัน)",
  "url": "https://www.thaidhamma.net/index.php?option=com_thaidhamma&task=coursedetail&id=...&Itemid=39",
  "type": "ฆราวาส,แม่ชี,ภิกษุณี",
  "gender": "ทั้งหมด",
  "age": "18 ปีขึ้นไป"
}
```

The calendar uses `start`, `end`, `location` (shown as venue), `course`, and `url` (the
registration link). To change the displayed courses, edit `dhamma_events.json` — no code changes
needed.

### `holidays_bot.json` and `holidays_general.json` — holidays

Two separate files, each a date-keyed map:

```json
{ "2026-01-01": { "th": "วันขึ้นปีใหม่", "en": "New Year Day" } }
```

- `holidays_bot.json` — **bank (BOT) holidays** (days banks are closed)
- `holidays_general.json` — **general public holidays**

A date that appears in **both** files is rendered as a combined holiday (bank + public). The app
merges the two maps at load time. Bridge days remain defined in the `BRIDGES` object inside
`index.html`.

## Running locally

Because the page fetches `dhamma_events.json`, it must be served over HTTP (opening the file
directly with `file://` will be blocked by the browser). From the project folder:

```bash
python -m http.server 8080
```

Then open <http://localhost:8080>.

## Deployment

Static site — push to `main` and GitHub Pages serves `index.html` (and `dhamma_events.json`)
as-is. No build step.
