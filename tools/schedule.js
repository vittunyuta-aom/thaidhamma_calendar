// Turn a "กำหนดการอบรมวิปัสสนากรรมฐาน … ปี พ.ศ. 25NN" schedule PDF into dhamma_events.json records.
//
// Table geometry (column x-boundaries, month-row y-bands) and the venue names are DETECTED
// from the PDF itself, so a later year's sheet keeps working even if columns move or a
// centre is added/removed. Only the course-name wording below is hardcoded, because it must
// match the existing filter categories exactly.
"use strict";
const { readObjects, pageNumbers, decodePage } = require("./pdf.js");

const TH_MON = { "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6,
                 "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12 };
const MONRE = "ม\\.ค\\.?|ก\\.พ\\.?|มี\\.ค\\.?|เม\\.ย\\.?|พ\\.ค\\.?|มิ\\.ย\\.?|ก\\.ค\\.?|ส\\.ค\\.?|ก\\.ย\\.?|ต\\.ค\\.?|พ\\.ย\\.?|ธ\\.ค\\.?";
const normMon = s => TH_MON[s.trim().endsWith(".") ? s.trim() : s.trim() + "."];

// Canonical course strings. `courseCategory()` in index.html strips a leading code if present,
// so these code-less strings group with the coded 2026 entries. Reuse verbatim - any new
// wording silently creates a new หลักสูตร filter entry.
const COURSE = {
  d10:   "หลักสูตรวิปัสสนา (10วัน)",
  d3:    "หลักสูตร 3 วัน (เฉพาะศิษย์เก่า)",
  d1:    "หลักสูตร 1 วัน (เฉพาะศิษย์เก่า)",
  sati:  "หลักสูตรสติปัฏฐาน (เฉพาะศิษย์เก่าที่มีคุณสมบัติครบตามข้อกำหนด*)",
  spec:  "หลักสูตรวิปัสสนา 10วัน พิเศษ (สำหรับศิษย์เก่า ใช้ใบสมัครสำหรับหลักสูตรระยะยาว)",
  nepal: "หลักสูตรวิปัสสนา (10 วัน) (ภาษาอังกฤษ/ภาษาเนปาล ศิษย์เก่าไทยที่สามารถพูดภาษาอังกฤษ เท่านั้น)",
  long: n => `หลักสูตรวิปัสสนา (${n}วัน) (สำหรับศิษย์เก่า ใช้ใบสมัครสำหรับหลักสูตรระยะยาว)`,
};

// end-start in days, per course type. Verified against all 258 existing 2026 events;
// a mismatch means a mis-binned cell or a misread digit - see tools/README.md.
const EXPECT = { "1": 0, "3": 3, "10": 11, "20": 21, "30": 31, "45": 46, "60": 61, sati: 9 };

// Cell text that is a status note, not a course.
const NOT_A_COURSE = /ยังไม่กำหนด|ตารางอบรม|ระหว่างคอร์ส/;

const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const dayDiff = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const cluster = (vals, tol) => {
  const out = [];
  vals.slice().sort((a, b) => a - b).forEach(v => {
    const last = out[out.length - 1];
    if (last && Math.abs(last.sum / last.n - v) <= tol) { last.sum += v; last.n++; }
    else out.push({ sum: v, n: 1 });
  });
  return out.map(o => o.sum / o.n);
};

/** Detect column x-boundaries and month-row y-boundaries from the table's ruled lines. */
function detectGrid(lines) {
  const MINLEN = 20;
  const vx = lines.filter(l => Math.abs(l.x1 - l.x2) < 0.6 && Math.abs(l.y1 - l.y2) > MINLEN).map(l => (l.x1 + l.x2) / 2);
  const hy = lines.filter(l => Math.abs(l.y1 - l.y2) < 0.6 && Math.abs(l.x1 - l.x2) > MINLEN).map(l => (l.y1 + l.y2) / 2);
  return { xs: cluster(vx, 1.0), ys: cluster(hy, 1.0).sort((a, b) => b - a) };
}

const tidy = s => s.replace(/\s+/g, " ").replace(/\s+\)/g, ")").replace(/\(\s+/g, "(").trim();

/** Read venue names from the header band: "ศูนย์ธรรมกมลา" + "(ปราจีนบุรี)". */
function detectVenues(runs, xs, ys) {
  const band = runs.filter(r => r.y > ys[1] + 0.5 && r.y < ys[0]);
  const venues = [];
  for (let c = 1; c < xs.length - 1; c++) {
    const inCol = band
      .filter(r => r.x >= xs[c] - 1.5 && r.x < xs[c + 1] - 1.5)
      .filter(r => !/หลักสูตร|วันที่|เดือน/.test(r.t))
      .sort((a, b) => b.y - a.y);
    venues.push(tidy(inCol.map(r => r.t).join(" ")));
  }
  return venues;
}

/** Group decoded runs into (month-row, venue-column) cells. */
function buildCells(runs, xs, ys) {
  const grid = runs.filter(r => r.y < ys[1] + 0.5 && r.y > ys[ys.length - 1] - 0.5 && r.x >= xs[1] - 1.5);
  const lines = [];
  grid.sort((a, b) => b.y - a.y).forEach(r => {
    const ln = lines.find(l => Math.abs(l.y - r.y) < 1.2);
    if (ln) ln.runs.push(r); else lines.push({ y: r.y, runs: [r] });
  });

  const cells = [];
  lines.forEach(ln => {
    let monthIdx = -1;
    for (let i = 1; i < ys.length - 1; i++) if (ln.y <= ys[i] && ln.y > ys[i + 1]) { monthIdx = i - 1; break; }
    if (monthIdx < 0) return;
    for (let c = 1; c < xs.length - 1; c++) {
      const inCol = ln.runs.filter(r => r.x >= xs[c] - 1.5 && r.x < xs[c + 1] - 1.5).sort((a, b) => a.x - b.x);
      if (!inCol.length) continue;
      const text = tidy(inCol.map(r => r.t).join(""));
      if (text) cells.push({ monthIdx, colIdx: c - 1, text, y: ln.y });
    }
  });
  return cells;
}

/** Parse one cell, e.g. "10 วัน : 27 ม.ค. - 7 ก.พ.*" or "สติปัฏฐาน : 19 - 28*". */
function parseCell(text, rowMonth, baseYear) {
  let t = text.trim();
  if (NOT_A_COURSE.test(t)) return { note: t };

  const nepal = /\(เนปาล\)/.test(t);
  t = t.replace(/\(เนปาล\)/g, "").trim();
  const monks = t.includes("*");            // (*) = monks/novices may apply
  t = t.replace(/\*/g, "").trim();

  const ci = t.indexOf(":");
  if (ci < 0) return { bad: "no ':' in " + JSON.stringify(text) };
  const left = t.slice(0, ci).trim(), right = t.slice(ci + 1).trim();

  let kind, course;
  if (/สติปัฏฐาน/.test(left)) { kind = "sati"; course = COURSE.sati; }
  else if (/พิเศษ/.test(left)) { kind = "10"; course = COURSE.spec; }
  else {
    const n = (left.match(/(\d+)/) || [])[1];
    if (!n) return { bad: "no duration in " + JSON.stringify(text) };
    kind = n;
    course = nepal ? COURSE.nepal
      : n === "10" ? COURSE.d10
      : n === "3" ? COURSE.d3
      : n === "1" ? COURSE.d1
      : COURSE.long(n);
  }

  const m = right.match(new RegExp(`^(\\d+)\\s*(${MONRE})?\\s*-\\s*(\\d+)\\s*(${MONRE})?\\s*(\\d+)?$`));
  if (!m) return { bad: "unparsed range " + JSON.stringify(right) + " in " + JSON.stringify(text) };

  const sMon = m[2] ? normMon(m[2]) : rowMonth;
  const eMon = m[4] ? normMon(m[4]) : sMon;
  const beSuffix = m[5];                     // trailing "71" => BE 2571 => CE 2028
  let eYear = beSuffix ? 2500 + Number(beSuffix) - 543 : baseYear;
  if (!beSuffix && eMon < sMon) eYear = baseYear + 1;

  return { kind, course, monks, start: iso(baseYear, sMon, +m[1]), end: iso(eYear, eMon, +m[3]) };
}

/** Parse the whole schedule PDF. */
function parseSchedule(pdfPath, opts = {}) {
  const objs = readObjects(pdfPath);
  const page = pageNumbers(objs)[0];
  const { runs, lines } = decodePage(objs, page);
  const { xs, ys } = detectGrid(lines);
  const warnings = [];

  const nCols = xs.length - 2, nRows = ys.length - 2;
  if (nCols < 1 || nRows !== 12) {
    warnings.push(`unexpected grid: ${nCols} venue columns, ${nRows} month rows (expected 12 rows)`);
  }

  // Buddhist year from the title, e.g. "… ปี พ.ศ. 2570" -> 2027
  let baseYear = opts.baseYear;
  if (!baseYear) {
    const title = runs.filter(r => r.y >= ys[0]).map(r => r.t).join(" ");
    const be = title.match(/พ\.ศ\.\s*(\d{4})/);
    if (!be) throw new Error("could not detect พ.ศ. year from title; pass --year");
    baseYear = Number(be[1]) - 543;
  }

  const venues = detectVenues(runs, xs, ys);
  const cells = buildCells(runs, xs, ys);
  const events = [], notes = [], problems = [];

  cells.forEach(cell => {
    const p = parseCell(cell.text, cell.monthIdx + 1, baseYear);
    if (p.note) { notes.push({ venue: venues[cell.colIdx], text: p.note }); return; }
    if (p.bad) { problems.push({ venue: venues[cell.colIdx], month: cell.monthIdx + 1, why: p.bad }); return; }
    events.push({
      start: p.start, end: p.end,
      location: venues[cell.colIdx],
      course: p.course,
      url: "",                                 // no coursedetail id exists until registration opens
      type: p.monks ? "ฆราวาส,แม่ชี,ภิกษุณี,พระ" : "ฆราวาส,แม่ชี,ภิกษุณี",
      gender: "ทั้งหมด",
      age: "18 ปีขึ้นไป",
      _kind: p.kind, _raw: cell.text, _month: cell.monthIdx + 1,
    });
  });

  // A run holding ":" is exactly one course, so this must reconcile.
  const colonRuns = runs.filter(r => r.y < ys[1] + 0.5 && r.y > ys[ys.length - 1] - 0.5 && r.x >= xs[1] - 1.5 && r.t.includes(":")).length;
  if (colonRuns !== events.length) {
    warnings.push(`run/event mismatch: ${colonRuns} runs contain ':' but ${events.length} events were built`);
  }
  return { events, notes, problems, warnings, venues, baseYear, grid: { xs, ys }, cells: cells.length };
}

/** Structural checks that rendering cannot surface (a wrong date still renders happily). */
function validate(events, knownVenues) {
  const fail = [];
  events.forEach(e => {
    const d = dayDiff(e.start, e.end), exp = EXPECT[e._kind];
    if (exp === undefined) fail.push(`unknown course type "${e._kind}": ${e._raw}`);
    else if (d !== exp) fail.push(`day-count: ${e.location} m${e._month} "${e._raw}" -> ${e.start}..${e.end} = ${d}d, expected ${exp}d`);
    if (!(e.end > e.start)) fail.push(`end <= start: ${e.location} "${e._raw}" ${e.start}..${e.end}`);
    if (knownVenues && knownVenues.length && !knownVenues.includes(e.location)) {
      fail.push(`venue not in existing data: ${JSON.stringify(e.location)}`);
    }
  });
  return fail;
}

module.exports = { parseSchedule, validate, COURSE, EXPECT, dayDiff };
