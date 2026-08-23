#!/usr/bin/env node
// Import a yearly course-schedule PDF into dhamma_events.json.
//
//   node tools/import-schedule.js <schedule.pdf>            # dry run: parse, validate, report
//   node tools/import-schedule.js <schedule.pdf> --merge    # append to dhamma_events.json
//   node tools/import-schedule.js <schedule.pdf> --json out.json
//   node tools/import-schedule.js <schedule.pdf> --year 2027 --force
"use strict";
const fs = require("fs");
const path = require("path");
const { parseSchedule, validate } = require("./schedule.js");

const argv = process.argv.slice(2);
const pdf = argv.find(a => !a.startsWith("--"));
const flag = n => argv.includes("--" + n);
const val = n => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : undefined; };

if (!pdf) {
  console.error("usage: node tools/import-schedule.js <schedule.pdf> [--merge] [--json out.json] [--year YYYY] [--force]");
  process.exit(2);
}

const EVENTS = path.join(__dirname, "..", "dhamma_events.json");
const KEYS = ["start", "end", "location", "course", "url", "type", "gender", "age"];

const existing = JSON.parse(fs.readFileSync(EVENTS, "utf8"));
const knownVenues = [...new Set(existing.map(e => e.location))];

const res = parseSchedule(pdf, { baseYear: val("year") ? Number(val("year")) : undefined });
const fails = validate(res.events, knownVenues);

console.log(`schedule year : ${res.baseYear} (พ.ศ. ${res.baseYear + 543})`);
console.log(`grid detected : ${res.grid.xs.length - 2} venue columns x ${res.grid.ys.length - 2} month rows`);
console.log(`cells / events: ${res.cells} / ${res.events.length}`);

if (res.venues.length) {
  const unknown = res.venues.filter(v => !knownVenues.includes(v));
  console.log(`venues        : ${res.venues.length} detected, ${unknown.length} not already in dhamma_events.json`);
  unknown.forEach(v => console.log(`   NEW VENUE   ${JSON.stringify(v)}`));
}
if (res.notes.length) {
  console.log("\nstatus notes (no course created):");
  res.notes.forEach(n => console.log(`   ${n.venue} — ${n.text}`));
}
if (res.warnings.length) {
  console.log("\nWARNINGS:");
  res.warnings.forEach(w => console.log("   ! " + w));
}
if (res.problems.length) {
  console.log("\nUNPARSED CELLS:");
  res.problems.forEach(p => console.log(`   ? ${p.venue} m${p.month}: ${p.why}`));
}

console.log(`\nvalidation failures: ${fails.length}`);
fails.forEach(f => console.log("   x " + f));

const counts = {};
res.events.forEach(e => counts[e.location] = (counts[e.location] || 0) + 1);
console.log("\nper-venue course counts:");
Object.entries(counts).sort().forEach(([k, v]) => console.log(`   ${String(v).padStart(3)}  ${k}`));

const clean = res.events
  .map(e => { const o = {}; KEYS.forEach(k => o[k] = e[k]); return o; })
  .sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1
    : a.location < b.location ? -1 : a.location > b.location ? 1 : 0);

if (val("json")) {
  fs.writeFileSync(val("json"), JSON.stringify(clean, null, 2));
  console.log(`\nwrote ${clean.length} events to ${val("json")}`);
}

if (!flag("merge")) {
  console.log("\n(dry run — pass --merge to append to dhamma_events.json)");
  process.exit(fails.length || res.problems.length ? 1 : 0);
}

const blocking = fails.length || res.problems.length || res.warnings.length;
if (blocking && !flag("force")) {
  console.error("\nrefusing to merge: resolve the issues above, or re-run with --force if they are known source errors.");
  process.exit(1);
}

const dup = existing.filter(e => clean.some(n => n.start === e.start && n.location === e.location && n.course === e.course));
if (dup.length && !flag("force")) {
  console.error(`\nrefusing to merge: ${dup.length} of these events already exist (re-import?). Use --force to append anyway.`);
  process.exit(1);
}

// dhamma_events.json is CRLF with 2-space indent and no trailing newline — preserve that.
const merged = existing.concat(clean);
fs.writeFileSync(EVENTS, JSON.stringify(merged, null, 2).replace(/\n/g, "\r\n"), "utf8");
console.log(`\nmerged: ${existing.length} + ${clean.length} = ${merged.length} events -> dhamma_events.json`);
