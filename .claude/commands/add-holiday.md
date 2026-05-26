Help the user add a public holiday, bank holiday, or bridge day to the calendar.

Holidays now live in TWO JSON files (date-keyed maps), loaded via fetch:
- `holidays_bot.json` — bank (BOT) holidays, days banks are closed
- `holidays_general.json` — general public holidays

Each entry: `"YYYY-MM-DD": { "th": "ชื่อไทย", "en": "English name" }`

A date that is BOTH a bank and public holiday must be added to BOTH files (the app merges them
and renders it as a combined holiday).

Bridge days are still the `BRIDGES` object inside `index.html`: `"YYYY-MM-DD"` → Thai description.

Steps:
1. Ask whether this is: bank-only, public-only, both, or a bridge day.
2. Ask for the date and the Thai (+ English) name (or Thai description for a bridge day).
3. Add to the correct file(s), keeping keys in date order.
4. Show the added entry and confirm.
