// Minimal dependency-free PDF reader: objects, streams, positioned text runs, path ops.
//
// Why this exists: `pdftotext` mangles Thai combining marks (ศูนย์ธรรมอาภา -> "ศนู ย์ธรรมอาภา")
// and its whitespace columns cannot be trusted for a 13-column table. Reading the content
// stream directly gives clean text (via each font's ToUnicode CMap) plus exact coordinates.
"use strict";
const fs = require("fs");
const zlib = require("zlib");

// ---------------------------------------------------------------- objects ----
function readObjects(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const s = buf.toString("latin1");
  const objs = {};

  const starts = [];
  const re = /(\d+)\s+0\s+obj\b/g;
  let m;
  while ((m = re.exec(s))) starts.push({ num: +m[1], at: m.index, bodyAt: m.index + m[0].length });

  starts.forEach((o, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].at : s.length;
    const body = s.slice(o.bodyAt, end);
    const sm = body.indexOf("stream");
    const dict = sm >= 0 ? body.slice(0, sm) : body;
    let stream = null;
    if (sm >= 0) {
      let st = o.bodyAt + sm + 6;
      if (buf[st] === 13) st++;
      if (buf[st] === 10) st++;
      const raw = buf.slice(st, s.indexOf("endstream", st));
      if (/\/FlateDecode/.test(dict)) { try { stream = zlib.inflateSync(raw); } catch (e) { stream = null; } }
      else stream = raw;
    }
    objs[o.num] = { dict, stream };
  });

  // expand compressed object streams (/Type /ObjStm), where dictionaries usually live
  for (const num of Object.keys(objs)) {
    const o = objs[num];
    if (!o.stream || !/\/Type\s*\/ObjStm/.test(o.dict)) continue;
    const N = +(o.dict.match(/\/N\s+(\d+)/) || [])[1];
    const first = +(o.dict.match(/\/First\s+(\d+)/) || [])[1];
    const t = o.stream.toString("latin1");
    const hdr = t.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < N; i++) {
      const on = hdr[2 * i], off = hdr[2 * i + 1];
      const nxt = i + 1 < N ? first + hdr[2 * i + 3] : t.length;
      if (!(on in objs)) objs[on] = { dict: t.slice(first + off, nxt), stream: null };
    }
  }
  return objs;
}

const pageNumbers = objs =>
  Object.keys(objs).filter(n => /\/Type\s*\/Page[^s]/.test(objs[n].dict)).map(Number).sort((a, b) => a - b);

// ------------------------------------------------------------------ cmaps ----
function cmapFor(objs, toUniObj) {
  const t = objs[toUniObj].stream.toString("latin1");
  const m = {};
  (t.match(/beginbfchar([\s\S]*?)endbfchar/g) || []).forEach(blk => {
    const re = /<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4,16})>/g;
    let y;
    while ((y = re.exec(blk))) m[parseInt(y[1], 16)] = String.fromCodePoint(parseInt(y[2].slice(0, 4), 16));
  });
  (t.match(/beginbfrange([\s\S]*?)endbfrange/g) || []).forEach(blk => {
    const re = /<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>/g;
    let y;
    while ((y = re.exec(blk))) {
      const a = parseInt(y[1], 16), b = parseInt(y[2], 16), c = parseInt(y[3], 16);
      for (let i = a; i <= b; i++) m[i] = String.fromCodePoint(c + i - a);
    }
  });
  return m;
}

// -------------------------------------------------------------- tokenizer ----
// Each font subsets its own CID space, so CIDs must be decoded with that font's own
// CMap - merging CMaps produces garbage (they conflict on ~96% of shared CIDs).
function tokenize(t) {
  const out = [];
  const isWS = c => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";
  const isDelim = c => "()<>[]{}/%".includes(c);
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    if (isWS(c)) { i++; continue; }
    if (c === "%") { while (i < t.length && t[i] !== "\n" && t[i] !== "\r") i++; continue; }
    if (c === "(") {
      let depth = 1; const bytes = []; i++;
      while (i < t.length && depth > 0) {
        const ch = t[i];
        if (ch === "\\") {
          const n = t[i + 1]; i += 2;
          if (n === "n") bytes.push(10);
          else if (n === "r") bytes.push(13);
          else if (n === "t") bytes.push(9);
          else if (n === "b") bytes.push(8);
          else if (n === "f") bytes.push(12);
          else if (n >= "0" && n <= "7") {
            let o = n;
            while (o.length < 3 && t[i] >= "0" && t[i] <= "7") o += t[i++];
            bytes.push(parseInt(o, 8) & 0xff);
          } else if (n === "\n") { /* line continuation */ }
          else if (n === "\r") { if (t[i] === "\n") i++; }
          else bytes.push(n.charCodeAt(0));
        } else if (ch === "(") { depth++; bytes.push(40); i++; }
        else if (ch === ")") { depth--; if (depth > 0) bytes.push(41); i++; }
        else { bytes.push(ch.charCodeAt(0) & 0xff); i++; }
      }
      out.push({ k: "str", v: bytes });
      continue;
    }
    if (c === "<" && t[i + 1] !== "<") {
      const e = t.indexOf(">", i);
      const h = t.slice(i + 1, e).replace(/[^0-9A-Fa-f]/g, "");
      const bytes = [];
      for (let j = 0; j < h.length; j += 2) bytes.push(parseInt((h.substr(j, 2) + "0").slice(0, 2), 16));
      out.push({ k: "str", v: bytes });
      i = e + 1;
      continue;
    }
    if (c === "<") { out.push({ k: "op", v: "<<" }); i += 2; continue; }
    if (c === ">") { out.push({ k: "op", v: ">>" }); i += 2; continue; }
    if ("[]{}".includes(c)) { out.push({ k: "op", v: c }); i++; continue; }
    if (c === "/") {
      let j = i + 1;
      while (j < t.length && !isWS(t[j]) && !isDelim(t[j])) j++;
      out.push({ k: "name", v: t.slice(i + 1, j) });
      i = j;
      continue;
    }
    let j = i;
    while (j < t.length && !isWS(t[j]) && !isDelim(t[j])) j++;
    const w = t.slice(i, j);
    i = j === i ? i + 1 : j;
    if (/^[-+.\d]/.test(w) && !isNaN(parseFloat(w))) out.push({ k: "num", v: parseFloat(w) });
    else out.push({ k: "op", v: w });
  }
  return out;
}

const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];

/**
 * Decode one page.
 * @returns {{runs: {x,y,t}[], lines: {x1,y1,x2,y2}[]}}
 *   runs  - text with absolute device coordinates
 *   lines - straight path segments (used to find table gridlines)
 */
function decodePage(objs, pnum) {
  const pd = objs[pnum].dict;
  const cRef = +(pd.match(/\/Contents\s+(\d+)/) || [])[1];
  const rRef = (pd.match(/\/Resources\s+(\d+)\s+0\s+R/) || [])[1];
  const rDict = rRef ? objs[+rRef].dict : (pd.match(/\/Resources\s*(<<[\s\S]*?>>)/) || [])[1];

  const fonts = {};
  const fm = rDict && rDict.match(/\/Font\s*<<([^>]*)>>/);
  if (fm) {
    const fr = /\/(F\d+)\s+(\d+)\s+0\s+R/g;
    let y;
    while ((y = fr.exec(fm[1]))) {
      const tu = +(objs[+y[2]].dict.match(/\/ToUnicode\s+(\d+)/) || [])[1];
      fonts[y[1]] = tu ? cmapFor(objs, tu) : {};
    }
  }

  const toks = tokenize(objs[cRef].stream.toString("latin1"));
  let ctm = [1, 0, 0, 1, 0, 0], stack = [], tm = null, tlm = null, cur = null, leading = 0;
  const runs = [], lines = [];
  let nums = [], arr = null, cx = 0, cy = 0, sx = 0, sy = 0;

  const apply = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
  const decode = bytes => {
    const cm = cur || {};
    let o = "";
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const cid = (bytes[i] << 8) | bytes[i + 1];
      o += cid in cm ? cm[cid] : "�";
    }
    return o;
  };
  const emit = txt => {
    if (!tm || !txt) return;
    const p = mul(tm, ctm);
    runs.push({ x: +p[4].toFixed(2), y: +p[5].toFixed(2), t: txt });
  };

  for (const tk of toks) {
    if (tk.k === "num") { nums.push(tk.v); continue; }
    if (tk.k === "str") { (arr || nums).push(tk.v); continue; }
    if (tk.k === "name") { nums.push(tk); continue; }
    const op = tk.v;
    if (op === "[") { arr = []; nums = []; continue; }
    if (op === "]") continue;

    if (op === "q") stack.push([ctm.slice(), cur, leading]);
    else if (op === "Q") { const st = stack.pop(); if (st) { ctm = st[0]; cur = st[1]; leading = st[2]; } }
    else if (op === "cm") ctm = mul(nums.slice(-6), ctm);
    else if (op === "BT") { tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); }
    else if (op === "ET") { tm = null; tlm = null; }
    else if (op === "Tm") { tm = nums.slice(-6); tlm = tm.slice(); }
    else if (op === "Td" || op === "TD") {
      const dy = nums[nums.length - 1], dx = nums[nums.length - 2];
      if (op === "TD") leading = -dy;
      tlm = mul([1, 0, 0, 1, dx, dy], tlm || [1, 0, 0, 1, 0, 0]);
      tm = tlm.slice();
    } else if (op === "Tf") { const nm = nums.filter(n => n && n.k === "name").pop(); if (nm) cur = fonts[nm.v] || {}; }
    else if (op === "TL") leading = nums[nums.length - 1];
    else if (op === "T*") { tlm = mul([1, 0, 0, 1, 0, -leading], tlm || [1, 0, 0, 1, 0, 0]); tm = tlm.slice(); }
    else if (op === "TJ") { emit((arr || []).filter(Array.isArray).map(decode).join("")); arr = null; }
    else if (op === "Tj") { const s2 = nums.filter(Array.isArray).pop(); if (s2) emit(decode(s2)); }
    else if (op === "'" || op === '"') {
      tlm = mul([1, 0, 0, 1, 0, -leading], tlm || [1, 0, 0, 1, 0, 0]); tm = tlm.slice();
      const s2 = nums.filter(Array.isArray).pop(); if (s2) emit(decode(s2));
    }
    // path construction (table gridlines)
    else if (op === "m") { const p = apply(nums[nums.length - 2], nums[nums.length - 1]); cx = sx = p[0]; cy = sy = p[1]; }
    else if (op === "l") {
      const p = apply(nums[nums.length - 2], nums[nums.length - 1]);
      lines.push({ x1: +cx.toFixed(3), y1: +cy.toFixed(3), x2: +p[0].toFixed(3), y2: +p[1].toFixed(3) });
      cx = p[0]; cy = p[1];
    } else if (op === "h") { lines.push({ x1: +cx.toFixed(3), y1: +cy.toFixed(3), x2: +sx.toFixed(3), y2: +sy.toFixed(3) }); cx = sx; cy = sy; }
    else if (op === "re") {
      const [x, y, w, h] = nums.slice(-4);
      const c = [apply(x, y), apply(x + w, y), apply(x + w, y + h), apply(x, y + h)];
      for (let i = 0; i < 4; i++) {
        const a = c[i], b = c[(i + 1) % 4];
        lines.push({ x1: +a[0].toFixed(3), y1: +a[1].toFixed(3), x2: +b[0].toFixed(3), y2: +b[1].toFixed(3) });
      }
    }
    if (op !== "[") nums = [];
  }
  return { runs, lines };
}

module.exports = { readObjects, pageNumbers, decodePage };
