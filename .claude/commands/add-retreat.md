Help the user add one or more retreat entries to the calendar.

Events live in `dhamma_events.json` (an array, loaded via fetch). Each entry:
```json
{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "location": "สถานที่", "course": "รหัส+หลักสูตร",
  "url": "https://www.thaidhamma.net/index.php?option=com_thaidhamma&task=coursedetail&id=...&Itemid=39",
  "type": "...", "gender": "...", "age": "..." }
```

Steps:
1. Ask the user for: start date, end date, location, course name, and the registration URL.
2. Insert the new entry into `dhamma_events.json` (order doesn't matter; the UI derives lists).
3. Show the user the added entry and confirm.

Notes:
- The calendar uses `start`, `end`, `location` (shown as venue), `course`, and `url`. Each course
  row in the day popover links to `url`.
- `allVenues`, `allCourses`, and venue colors are derived automatically. A new location auto-gets a
  color from the `palette` array in index.html (extend `palette` only if locations exceed 9).
