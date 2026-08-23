# tools — yearly schedule PDF importer

Imports the official yearly course-schedule PDF
("กำหนดการอบรมวิปัสสนากรรมฐาน ณ ศูนย์วิปัสสนาฯ ต่าง ๆ ปี พ.ศ. 25NN") into `dhamma_events.json`.

Node only, **no dependencies, no build step** — nothing here runs on the site. The published
calendar is still just `index.html` plus the JSON files.

## Usage

```bash
node tools/import-schedule.js path/to/vp_schedule71.pdf
```

That is a **dry run**: it parses, validates and prints a report without touching anything. Review
it, then append:

```bash
node tools/import-schedule.js path/to/vp_schedule71.pdf --merge
```

| flag | effect |
|---|---|
| `--merge` | append the parsed events to `dhamma_events.json` (CRLF + 2-space indent preserved) |
| `--json out.json` | write the parsed events to a file instead of/as well as merging |
| `--year 2027` | override the Gregorian year (normally read from the "พ.ศ. 25NN" title) |
| `--force` | merge despite warnings, validation failures, or apparent duplicates |

`--merge` refuses to run if there are warnings, unparsed cells, validation failures, or if the
events already look present. That is deliberate — override only for known source errors.

## Files

| file | role |
|---|---|
| `pdf.js` | dependency-free PDF reader: objects, Flate streams, object streams, positioned text runs, path segments |
| `schedule.js` | grid detection, cell parsing, event building, validation |
| `import-schedule.js` | CLI: report, then optionally merge |

## Why it reads the PDF directly

`pdftotext` is not usable for this table:

- It **mangles Thai combining marks** — `ศูนย์ธรรมอาภา` comes out as `ศนู ย์ธรรมอาภา`,
  `สติปัฏฐาน` as `สตปิ ฏั ฐาน`. Text in that state must never reach the JSON: venue names would
  stop matching the existing ones, breaking `venueColor` and adding duplicate filter entries.
- Its whitespace columns **cannot be trusted** for 13 columns, and a month row's content lines
  appear both above and below the month label, so naive row-splitting mis-bins cells.
- The bundled build (xpdf 4.00) has **no `-bbox` flag**, so there are no coordinates to fall back on.

Instead, `pdf.js` inflates the page content stream and reads it directly. Text decodes cleanly
through each font's **ToUnicode CMap** (each subset font has its own CID space — merging CMaps
gives garbage, they conflict on ~96% of shared CIDs). The table's **ruled lines** give exact
column x-boundaries and month-row y-bands, so every cell lands in the right venue and month.
Venue names and the year are read from the sheet itself, so a later year's layout still works.

## Validation

Rendering cannot confirm correctness — a wrong date renders perfectly happily, and per CLAUDE.md
an `end < start` row silently *vanishes*. So the importer checks structure instead:

- **Day-count checksum** — `end - start` is fixed per course type (1 วัน → 0, 3 วัน → 3,
  10 วัน incl. พิเศษ → 11, 20 → 21, 30 → 31, 45 → 46, 60 → 61, สติปัฏฐาน → 9). Verified against all
  258 existing 2026 events. A mismatch means a mis-binned cell or a misread digit.
- **`end > start`**, and every venue must already exist in `dhamma_events.json` (new ones are
  reported, not silently accepted).
- **Run/event reconciliation** — every text run containing `":"` is exactly one course, so the
  count must equal the number of events built. This catches dropped or double-counted cells.

Note that **courses at one venue may legitimately overlap** (large centres run parallel courses),
so overlap is *not* an error signal — the existing 2026 data already contains 10 such pairs.

## Reading the source sheet

- A trailing `71` means **พ.ศ. 2571 = 2028** (e.g. `10 วัน : 29 ธ.ค. - 9 ม.ค. 71`).
- `*` marks courses monks/novices may join → `type` gains `พระ`.
- `ยังไม่กำหนดตารางอบรม` ("schedule not yet determined") and `ระหว่างคอร์ส N วัน` ("during the
  N-day course") are status notes, not courses — they are reported and skipped.
- The PDF has **no course codes and no registration URLs**, so imported events get `url: ""` and a
  code-less `course` string. `courseCategory()` in `index.html` strips a code only when present, so
  these group with the coded entries instead of creating new filter categories. Backfill codes and
  URLs from thaidhamma.net once that year's registration opens.
