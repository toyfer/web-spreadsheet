(() => {
  "use strict";

  const COLS0 = 40;
  const ROWS0 = 200;
  const MAX_COLS = 256;
  const MAX_ROWS = 2000;
  const DEF_CW = 84;
  const DEF_RH = 21;
  const LS_KEY = "wss.autosave.v1";
  const MAGIC = "WSS1";

  const $ = (id) => document.getElementById(id);
  const els = {
    bookName: $("book-name"),
    dirty: $("dirty-dot"),
    menuFile: $("menu-file"),
    ribbon: $("ribbon"),
    nameBox: $("name-box"),
    formula: $("formula-input"),
    editBtns: $("edit-btns"),
    editor: $("editor"),
    grid: $("grid"),
    corner: $("corner"),
    colH: $("col-headers"),
    rowH: $("row-headers"),
    scroll: $("sheet-scroll"),
    sizer: $("sheet-sizer"),
    cells: $("cells-layer"),
    sel: $("sel-layer"),
    tabs: $("sheet-tabs"),
    status: $("status-mode"),
    agg: $("status-agg"),
    file: $("file-open"),
    ctx: $("ctx"),
    modal: $("modal"),
    modalTitle: $("modal-title"),
    modalBody: $("modal-body"),
    modalOk: $("modal-ok"),
    modalCancel: $("modal-cancel"),
    zoom: $("zoom-label"),
    fontFamily: $("font-family"),
    fontSize: $("font-size"),
    fontColor: $("font-color"),
    fillColor: $("fill-color"),
    numFmt: $("num-format"),
  };

  function colName(c) {
    let n = c + 1, s = "";
    while (n > 0) {
      n--;
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return s;
  }
  function colIndex(name) {
    let n = 0;
    const u = name.toUpperCase();
    for (let i = 0; i < u.length; i++) n = n * 26 + (u.charCodeAt(i) - 64);
    return n - 1;
  }
  function a1(r, c, rAbs, cAbs) {
    return (cAbs ? "$" : "") + colName(c) + (rAbs ? "$" : "") + (r + 1);
  }
  function parseA1(s) {
    const m = String(s).trim().match(/^(\$?)([A-Za-z]+)(\$?)(\d+)$/);
    if (!m) return null;
    return { c: colIndex(m[2]), r: +m[4] - 1, cAbs: !!m[1], rAbs: !!m[3] };
  }
  function parseRange(s) {
    const t = String(s).replace(/^.*!/, "").replace(/\$/g, "");
    if (t.includes(":")) {
      const [a, b] = t.split(":");
      const p = parseA1(a), q = parseA1(b);
      if (!p || !q) return null;
      return {
        r0: Math.min(p.r, q.r), c0: Math.min(p.c, q.c),
        r1: Math.max(p.r, q.r), c1: Math.max(p.c, q.c),
      };
    }
    const p = parseA1(t);
    return p ? { r0: p.r, c0: p.c, r1: p.r, c1: p.c } : null;
  }
  function key(r, c) { return r + "," + c; }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function looksFormula(v) { return typeof v === "string" && v.charCodeAt(0) === 61; }

  function flatten(args) {
    const out = [];
    (function walk(x) {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x != null && x !== "") out.push(x);
    })(args);
    return out;
  }
  function nums(args) { return flatten(args).filter(isNum); }

  const FN = {
    SUM(...a) { return nums(a).reduce((x, y) => x + y, 0); },
    AVERAGE(...a) { const n = nums(a); return n.length ? FN.SUM(n) / n.length : 0; },
    AVG(...a) { return FN.AVERAGE(...a); },
    COUNT(...a) { return nums(a).length; },
    COUNTA(...a) { return flatten(a).length; },
    MIN(...a) { const n = nums(a); return n.length ? Math.min(...n) : 0; },
    MAX(...a) { const n = nums(a); return n.length ? Math.max(...n) : 0; },
    PRODUCT(...a) { return nums(a).reduce((x, y) => x * y, 1); },
    ABS: Math.abs,
    SIGN: Math.sign,
    SQRT: Math.sqrt,
    POWER: Math.pow,
    POW: Math.pow,
    EXP: Math.exp,
    LN: Math.log,
    LOG(n, b) { return b == null ? Math.log10(n) : Math.log(n) / Math.log(b); },
    LOG10: Math.log10,
    MOD(n, d) { return n - d * Math.floor(n / d); },
    INT(n) { return Math.floor(n); },
    ROUND(n, d = 0) { const p = 10 ** d; return Math.round(n * p) / p; },
    ROUNDUP(n, d = 0) { const p = 10 ** d; return (n >= 0 ? Math.ceil(n * p) : Math.floor(n * p)) / p; },
    ROUNDDOWN(n, d = 0) { const p = 10 ** d; return (n >= 0 ? Math.floor(n * p) : Math.ceil(n * p)) / p; },
    FLOOR(n, s = 1) { return Math.floor(n / s) * s; },
    CEILING(n, s = 1) { return Math.ceil(n / s) * s; },
    TRUNC(n, d = 0) { const p = 10 ** d; return Math.trunc(n * p) / p; },
    PI() { return Math.PI; },
    RAND() { return Math.random(); },
    RANDBETWEEN(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; },
    SIN: Math.sin, COS: Math.cos, TAN: Math.tan,
    ASIN: Math.asin, ACOS: Math.acos, ATAN: Math.atan,
    DEGREES(x) { return x * 180 / Math.PI; },
    RADIANS(x) { return x * Math.PI / 180; },
    IF(c, t, f) { return c ? t : f; },
    IFS(...a) { for (let i = 0; i < a.length; i += 2) if (a[i]) return a[i + 1]; return null; },
    IFERROR(v, d) { return (v && v.__err) ? d : (v === "#ERROR!" || (typeof v === "string" && v.startsWith("#")) ? d : v); },
    AND(...a) { return flatten(a).every(Boolean); },
    OR(...a) { return flatten(a).some(Boolean); },
    NOT(x) { return !x; },
    XOR(...a) { return flatten(a).reduce((x, y) => x !== !!y, false); },
    TRUE() { return true; },
    FALSE() { return false; },
    ISBLANK(v) { return v == null || v === ""; },
    ISNUMBER: isNum,
    ISTEXT(v) { return typeof v === "string"; },
    ISERROR(v) { return typeof v === "string" && v.startsWith("#"); },
    N(v) { return isNum(v) ? v : 0; },
    LEN(s) { return String(s ?? "").length; },
    LEFT(s, n = 1) { return String(s ?? "").slice(0, n); },
    RIGHT(s, n = 1) { return String(s ?? "").slice(-n); },
    MID(s, p, n) { return String(s ?? "").substr(p - 1, n); },
    TRIM(s) { return String(s ?? "").trim(); },
    UPPER(s) { return String(s ?? "").toUpperCase(); },
    LOWER(s) { return String(s ?? "").toLowerCase(); },
    PROPER(s) { return String(s ?? "").replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase()); },
    CONCAT(...a) { return flatten(a).map(x => x == null ? "" : String(x)).join(""); },
    CONCATENATE(...a) { return FN.CONCAT(...a); },
    TEXTJOIN(sep, ignore, ...a) {
      const xs = flatten(a).filter(x => !ignore || (x != null && x !== ""));
      return xs.join(sep);
    },
    SUBSTITUTE(s, old, neu, n) {
      s = String(s ?? "");
      if (n == null) return s.split(old).join(neu);
      let i = 0;
      return s.replaceAll ? s.replace(new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), m => (++i === n ? neu : m)) : s;
    },
    FIND(f, s, st = 1) { const i = String(s).indexOf(f, st - 1); if (i < 0) throw "#VALUE!"; return i + 1; },
    SEARCH(f, s, st = 1) { const i = String(s).toLowerCase().indexOf(String(f).toLowerCase(), st - 1); if (i < 0) throw "#VALUE!"; return i + 1; },
    VALUE(s) { const n = parseLocale(s); if (!isNum(n)) throw "#VALUE!"; return n; },
    TEXT(v, fmt) { return formatNumber(v, fmt || "general"); },
    REPT(s, n) { return String(s).repeat(Math.max(0, n | 0)); },
    CHAR(n) { return String.fromCharCode(n); },
    CODE(s) { return String(s).charCodeAt(0); },
    TODAY() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; },
    NOW() { return new Date(); },
    YEAR(d) { return asDate(d).getFullYear(); },
    MONTH(d) { return asDate(d).getMonth() + 1; },
    DAY(d) { return asDate(d).getDate(); },
    HOUR(d) { return asDate(d).getHours(); },
    MINUTE(d) { return asDate(d).getMinutes(); },
    SECOND(d) { return asDate(d).getSeconds(); },
    DATE(y, m, d) { return new Date(y, m - 1, d); },
    WEEKDAY(d, t = 1) { const w = asDate(d).getDay(); return t === 2 ? (w === 0 ? 7 : w) : w + 1; },
    IFNA(v, d) { return v === "#N/A" ? d : v; },
    NA() { return "#N/A"; },
    ROW(r) { return r == null ? state.sel.r + 1 : (parseA1(String(r)) || { r: r }).r + 1; },
    COLUMN(c) { return c == null ? state.sel.c + 1 : (parseA1(String(c)) || { c }).c + 1; },
    MEDIAN(...a) {
      const n = nums(a).sort((x, y) => x - y);
      if (!n.length) return 0;
      const m = Math.floor(n.length / 2);
      return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2;
    },
    STDEV(...a) {
      const n = nums(a); if (n.length < 2) return 0;
      const m = FN.AVERAGE(n);
      return Math.sqrt(n.reduce((s, x) => s + (x - m) ** 2, 0) / (n.length - 1));
    },
    VAR(...a) { const s = FN.STDEV(...a); return s * s; },
    SUMPRODUCT(...arrs) {
      const lists = arrs.map(x => Array.isArray(x) ? flatten(x) : [x]);
      const len = Math.min(...lists.map(x => x.length));
      let s = 0;
      for (let i = 0; i < len; i++) s += lists.reduce((p, l) => p * (Number(l[i]) || 0), 1);
      return s;
    },
    UNIQUE(...a) { return [...new Set(flatten(a))]; },
    SORT(a, d = 1) { return flatten(a).slice().sort((x, y) => (x > y ? 1 : x < y ? -1 : 0) * d); },
    FILTER(a, pred) {
      const xs = flatten(a);
      if (typeof pred === "function") return xs.filter(pred);
      const p = flatten(pred);
      return xs.filter((_, i) => p[i]);
    },
    LARGE(a, k) { return nums(a).sort((x, y) => y - x)[k - 1]; },
    SMALL(a, k) { return nums(a).sort((x, y) => x - y)[k - 1]; },
    RANK(v, a, o = 0) {
      const n = nums(a).sort((x, y) => o ? x - y : y - x);
      return n.indexOf(v) + 1;
    },
    COUNTIF(rng, crit) { return flatten(rng).filter(v => matchCrit(v, crit)).length; },
    SUMIF(rng, crit, sumr) {
      const a = flatten(rng), s = flatten(sumr || rng);
      return a.reduce((t, v, i) => t + (matchCrit(v, crit) ? Number(s[i]) || 0 : 0), 0);
    },
    AVERAGEIF(rng, crit, avg) {
      const a = flatten(rng), s = flatten(avg || rng);
      let t = 0, c = 0;
      a.forEach((v, i) => { if (matchCrit(v, crit) && isNum(+s[i])) { t += +s[i]; c++; } });
      return c ? t / c : 0;
    },
    VLOOKUP(q, table, col, approx = true) {
      const rows = toRows(table);
      if (!rows.length) return "#N/A";
      if (!approx) {
        const hit = rows.find(r => r[0] == q);
        return hit ? hit[col - 1] ?? "#N/A" : "#N/A";
      }
      let best = null;
      for (const r of rows) if (r[0] <= q && (best == null || r[0] > best[0])) best = r;
      return best ? best[col - 1] ?? "#N/A" : "#N/A";
    },
    HLOOKUP(q, table, row, approx = true) {
      const rows = toRows(table);
      const cols = rows[0] ? rows[0].map((_, i) => rows.map(r => r[i])) : [];
      return FN.VLOOKUP(q, cols, row, approx);
    },
    INDEX(table, r, c) {
      const rows = toRows(table);
      if (c == null) return flatten(table)[r - 1];
      return rows[r - 1] && rows[r - 1][c - 1];
    },
    MATCH(q, rng, t = 1) {
      const a = flatten(rng);
      if (t === 0) { const i = a.findIndex(x => x == q); return i < 0 ? "#N/A" : i + 1; }
      let b = "#N/A";
      a.forEach((x, i) => { if (t === 1 && x <= q) b = i + 1; if (t === -1 && x >= q && b === "#N/A") b = i + 1; });
      return b;
    },
    CHOOSE(i, ...a) { return a[i - 1]; },
    SWITCH(v, ...a) {
      for (let i = 0; i < a.length - 1; i += 2) if (a[i] == v) return a[i + 1];
      return a.length % 2 ? a[a.length - 1] : "#N/A";
    },
  };
  FN.SUMIFS = function (sumr, ...rest) {
    const s = flatten(sumr);
    let t = 0;
    const n = flatten(rest[0] || []).length;
    for (let i = 0; i < n; i++) {
      let ok = true;
      for (let k = 0; k < rest.length; k += 2) {
        if (!matchCrit(flatten(rest[k])[i], rest[k + 1])) { ok = false; break; }
      }
      if (ok) t += Number(s[i]) || 0;
    }
    return t;
  };

  function toRows(table) {
    if (!Array.isArray(table)) return [[table]];
    if (table.length && !Array.isArray(table[0])) return [table];
    return table;
  }
  function matchCrit(v, crit) {
    if (crit == null) return v == null || v === "";
    if (typeof crit === "number") return +v === crit;
    const s = String(crit);
    const m = s.match(/^(<=|>=|<>|<|>|=)(.*)$/);
    if (m) {
      const op = m[1], rhs = parseLocale(m[2]);
      const lhs = isNum(rhs) ? +v : String(v);
      const r = isNum(rhs) ? rhs : m[2];
      if (op === "=") return lhs == r;
      if (op === "<>") return lhs != r;
      if (op === "<") return lhs < r;
      if (op === ">") return lhs > r;
      if (op === "<=") return lhs <= r;
      if (op === ">=") return lhs >= r;
    }
    if (s.includes("*") || s.includes("?")) {
      const re = new RegExp("^" + s.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
      return re.test(String(v));
    }
    return String(v) === s || v == crit;
  }
  function asDate(d) {
    if (d instanceof Date) return d;
    if (isNum(d)) return new Date(Math.round((d - 25569) * 86400 * 1000));
    return new Date(d);
  }
  function parseLocale(s) {
    if (typeof s === "number") return s;
    if (s instanceof Date) return s;
    if (typeof s !== "string") return s;
    const t = s.trim();
    if (!t) return "";
    if (t === "TRUE" || t === "true") return true;
    if (t === "FALSE" || t === "false") return false;
    if (/^-?\d+(\.\d+)?%$/.test(t)) return parseFloat(t) / 100;
    if (/^-?[\d,]+(\.\d+)?$/.test(t)) return parseFloat(t.replace(/,/g, ""));
    const d = Date.parse(t);
    if (!Number.isNaN(d) && /[-/]/.test(t) && /\d/.test(t)) return new Date(d);
    return t;
  }

  const REF_RE = /(^|[^A-Z0-9_$.])((?:[A-Za-z_][\w.]*!)?\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?)/g;

  function splitStrings(src) {
    const parts = [];
    let i = 0, cur = "";
    while (i < src.length) {
      const ch = src[i];
      if (ch === '"' || ch === "'") {
        if (cur) parts.push({ s: false, t: cur });
        cur = "";
        const q = ch;
        let j = i + 1, buf = q;
        while (j < src.length) {
          buf += src[j];
          if (src[j] === q) { if (src[j + 1] === q) { buf += src[++j]; j++; continue; } j++; break; }
          j++;
        }
        parts.push({ s: true, t: buf });
        i = j;
      } else { cur += ch; i++; }
    }
    if (cur) parts.push({ s: false, t: cur });
    return parts;
  }

  function isJsMode(body) {
    return /=>|Math\.|\.filter\s*\(|\.map\s*\(|\.reduce\s*\(|\.length|function\s*\(|new |const |let |=>/.test(body);
  }

  function excelify(body) {
    return body
      .replace(/<>/g, "!=")
      .replace(/&(?!&)/g, "+''+")
      .replace(/(?<![!<>=])=(?![=>])/g, "==");
  }

  function transform(body) {
    return splitStrings(body).map(p => {
      if (p.s) return p.t;
      return p.t.replace(REF_RE, (m, pre, ref) => pre + (ref.includes(":") ? `__rng("${ref}")` : `__cell("${ref}")`));
    }).join("");
  }

  function newCell(v, style) {
    const c = {};
    if (v != null && v !== "") c.v = v;
    if (style && Object.keys(style).length) c.s = style;
    return c;
  }

  function emptySheet(name, rows = ROWS0, cols = COLS0) {
    return {
      name, rows, cols,
      cells: {},
      colW: {},
      rowH: {},
      merges: [],
      freeze: [0, 0],
    };
  }

  function sampleBook() {
    const s = emptySheet("売上");
    const put = (r, c, v, st) => { s.cells[key(r, c)] = newCell(v, st); };
    const h = { b: true, bg: "#217346", color: "#ffffff", align: "center" };
    put(0, 0, "商品", h); put(0, 1, "単価", h); put(0, 2, "数量", h); put(0, 3, "金額", h); put(0, 4, "構成比", h);
    [["りんご", 120, 30], ["みかん", 80, 45], ["バナナ", 100, 20], ["ぶどう", 350, 12]].forEach((row, i) => {
      put(i + 1, 0, row[0]);
      put(i + 1, 1, row[1], { fmt: "currency" });
      put(i + 1, 2, row[2]);
      put(i + 1, 3, `=B${i + 2}*C${i + 2}`, { fmt: "currency" });
      put(i + 1, 4, `=IF(D$7=0,0,D${i + 2}/D$7)`, { fmt: "percent" });
    });
    put(6, 0, "合計", { b: true });
    put(6, 3, "=SUM(D2:D5)", { b: true, fmt: "currency", bg: "#e8f5ee" });
    put(6, 4, "=SUM(E2:E5)", { b: true, fmt: "percent", bg: "#e8f5ee" });
    put(8, 0, "平均単価", { b: true });
    put(8, 1, "=AVERAGE(B2:B5)", { fmt: "currency" });
    put(9, 0, "最大売上");
    put(9, 1, "=MAX(D2:D5)", { fmt: "currency" });
    put(10, 0, "JS例: 税込合計");
    put(10, 1, "=Math.round(D7*1.1)", { fmt: "currency", bg: "#fff3cd" });
    put(11, 0, "JS例: 正の数量件数");
    put(11, 1, "=C2:C5.filter(x=>x>0).length", { bg: "#fff3cd" });
    put(13, 0, "使い方");
    put(14, 0, "1. セルを選んで入力。= で数式。F2 で編集。");
    put(15, 0, "2. Excel 関数 (SUM, IF, VLOOKUP…) と JavaScript 式が使えます。");
    put(16, 0, "3. Ctrl+S で .wss.json 保存。このブラウザ内だけで動作します。");
    s.colW[0] = 200; s.colW[1] = 110; s.colW[3] = 110;
    const s2 = emptySheet("計算");
    s2.cells[key(0, 0)] = newCell("x");
    s2.cells[key(0, 1)] = newCell("x^2");
    for (let i = 1; i <= 10; i++) {
      s2.cells[key(i, 0)] = newCell(i);
      s2.cells[key(i, 1)] = newCell(`=A${i + 1}*A${i + 1}`);
    }
    s2.cells[key(12, 0)] = newCell("合計");
    s2.cells[key(12, 1)] = newCell("=SUM(B2:B11)");
    return { magic: MAGIC, name: "サンプル", active: 0, zoom: 1, grid: true, sheets: [s, s2] };
  }

  function blankBook() {
    return { magic: MAGIC, name: "Book1", active: 0, zoom: 1, grid: true, sheets: [emptySheet("Sheet1")] };
  }

  const state = {
    book: blankBook(),
    sel: { r: 0, c: 0, r1: 0, c1: 0 },
    anchor: { r: 0, c: 0 },
    editing: false,
    overwrite: false,
    showFx: false,
    dirty: false,
    undo: [],
    redo: [],
    clip: null,
    filling: null,
    selecting: false,
    evalCache: new Map(),
    visiting: new Set(),
    colPos: [],
    rowPos: [],
    pool: [],
    headerPoolC: [],
    headerPoolR: [],
  };

  function sheet() { return state.book.sheets[state.book.active]; }
  function cw(c) { return sheet().colW[c] || DEF_CW; }
  function rh(r) { return sheet().rowH[r] || DEF_RH; }
  function getCell(r, c, sh = sheet()) { return sh.cells[key(r, c)]; }
  function raw(r, c, sh = sheet()) { const x = getCell(r, c, sh); return x && x.v != null ? x.v : ""; }
  function styleOf(r, c, sh = sheet()) { const x = getCell(r, c, sh); return (x && x.s) || {}; }

  function rebuildPos() {
    const sh = sheet();
    const cp = [0], rp = [0];
    for (let c = 0; c < sh.cols; c++) cp.push(cp[c] + cw(c));
    for (let r = 0; r < sh.rows; r++) rp.push(rp[r] + rh(r));
    state.colPos = cp; state.rowPos = rp;
    els.sizer.style.width = cp[sh.cols] + "px";
    els.sizer.style.height = rp[sh.rows] + "px";
  }

  function upper(arr, x) {
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (arr[m] <= x) lo = m + 1; else hi = m;
    }
    return Math.max(0, lo - 1);
  }

  function mergeCovering(r, c, sh = sheet()) {
    return sh.merges.find(m => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs) || null;
  }
  function isMaster(r, c) {
    const m = mergeCovering(r, c);
    return !m || (m.r === r && m.c === c);
  }

  function evalCell(r, c, sh = sheet()) {
    const k = sh.name + "!" + key(r, c);
    if (state.evalCache.has(k)) return state.evalCache.get(k);
    if (state.visiting.has(k)) return "#CIRC!";
    const cell = getCell(r, c, sh);
    if (!cell || cell.v == null || cell.v === "") { state.evalCache.set(k, ""); return ""; }
    const v = cell.v;
    if (!looksFormula(v)) {
      const parsed = parseLocale(v);
      state.evalCache.set(k, parsed);
      return parsed;
    }
    state.visiting.add(k);
    let out;
    try { out = evalFormula(v, sh, r, c); }
    catch (e) { out = typeof e === "string" && e.startsWith("#") ? e : "#ERROR!"; }
    state.visiting.delete(k);
    state.evalCache.set(k, out);
    return out;
  }

  function refValue(ref, sh) {
    const bang = ref.indexOf("!");
    let target = sh, token = ref;
    if (bang >= 0) {
      const nm = ref.slice(0, bang).replace(/^'|'$/g, "");
      target = state.book.sheets.find(x => x.name === nm) || sh;
      token = ref.slice(bang + 1);
    }
    const rng = parseRange(token);
    if (!rng) return "#REF!";
    if (rng.r0 === rng.r1 && rng.c0 === rng.c1) {
      const v = evalCell(rng.r0, rng.c0, target);
      return v === "" ? 0 : v;
    }
    const arr = [];
    for (let r = rng.r0; r <= rng.r1; r++) {
      const row = [];
      for (let col = rng.c0; col <= rng.c1; col++) {
        const v = evalCell(r, col, target);
        row.push(v === "" ? 0 : v);
      }
      arr.push(row.length === 1 ? row[0] : row);
    }
    return arr.length === 1 && !Array.isArray(arr[0]) ? arr : arr;
  }

  function evalFormula(src, sh, r, c) {
    const body0 = src.slice(1);
    const js = isJsMode(body0);
    let body = transform(js ? body0 : excelify(body0));
    const names = Object.keys(FN);
    const fn = Function(...names, "__cell", "__rng", "Math", "Date", "r", "c", `"use strict"; return (${body});`);
    const __cell = (ref) => {
      const v = refValue(ref, sh);
      return Array.isArray(v) ? v : (v === "" ? 0 : v);
    };
    const __rng = (ref) => {
      const v = refValue(ref, sh);
      return Array.isArray(v) ? flatten(v) : [v];
    };
    const out = fn(...names.map(n => FN[n]), __cell, __rng, Math, Date, r, c);
    if (out === Infinity || out === -Infinity) return "#DIV/0!";
    if (typeof out === "number" && Number.isNaN(out)) return "#VALUE!";
    return out;
  }

  function formatNumber(v, fmt, decimals) {
    if (v instanceof Date) {
      const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
      return `${y}/${m}/${d}`;
    }
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "string" && v.startsWith("#")) return v;
    if (v == null || v === "") return "";
    if (Array.isArray(v)) return flatten(v).join(", ");
    const n = typeof v === "number" ? v : +v;
    const d = decimals != null ? decimals : 2;
    switch (fmt) {
      case "number": return isNum(n) ? n.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d }) : String(v);
      case "currency": return isNum(n) ? n.toLocaleString("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }) : String(v);
      case "percent": return isNum(n) ? (n * 100).toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%" : String(v);
      case "date": return formatNumber(isNum(n) ? asDate(n) : (v instanceof Date ? v : v), "general");
      case "text": return String(v);
      default:
        if (isNum(n)) {
          if (Number.isInteger(n)) return String(n);
          return String(+n.toPrecision(10));
        }
        return String(v);
    }
  }

  function display(r, c) {
    if (state.showFx) return String(raw(r, c));
    const v = evalCell(r, c);
    const st = styleOf(r, c);
    return formatNumber(v, st.fmt || "general", st.d);
  }

  function invalidate() { state.evalCache.clear(); }

  function markDirty(on = true) {
    state.dirty = on;
    els.dirty.hidden = !on;
  }

  function pushUndo(entry) {
    state.undo.push(entry);
    if (state.undo.length > 100) state.undo.shift();
    state.redo.length = 0;
    markDirty(true);
  }

  function applyCells(map, rec) {
    const sh = sheet();
    const before = {};
    Object.keys(map).forEach(k => { before[k] = clone(sh.cells[k] || null); });
    Object.entries(map).forEach(([k, cell]) => {
      if (!cell || (cell.v == null || cell.v === "") && (!cell.s || !Object.keys(cell.s).length)) delete sh.cells[k];
      else sh.cells[k] = cell;
    });
    if (rec !== false) pushUndo({ type: "cells", before, after: clone(map) });
    invalidate();
  }

  function setRaw(r, c, v, rec) {
    const sh = sheet();
    const k = key(r, c);
    const prev = clone(sh.cells[k] || null);
    const cur = clone(prev) || {};
    if (v == null || v === "") {
      if (cur.s && Object.keys(cur.s).length) { delete cur.v; sh.cells[k] = cur; }
      else delete sh.cells[k];
    } else {
      cur.v = v;
      sh.cells[k] = cur;
    }
    if (rec !== false) pushUndo({ type: "cells", before: { [k]: prev }, after: { [k]: clone(sh.cells[k] || null) } });
    invalidate();
  }

  function patchStyle(r0, c0, r1, c1, patch) {
    const sh = sheet();
    const before = {}, after = {};
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = key(r, c);
      before[k] = clone(sh.cells[k] || null);
      const cell = clone(sh.cells[k] || {});
      cell.s = Object.assign({}, cell.s || {}, patch);
      Object.keys(cell.s).forEach(p => { if (cell.s[p] == null || cell.s[p] === false) delete cell.s[p]; });
      if (!Object.keys(cell.s).length) delete cell.s;
      if (cell.v == null && !cell.s) { delete sh.cells[k]; after[k] = null; }
      else { sh.cells[k] = cell; after[k] = clone(cell); }
    }
    pushUndo({ type: "cells", before, after });
  }

  function selNorm() {
    const { r, c, r1, c1 } = state.sel;
    return { r0: Math.min(r, r1), c0: Math.min(c, c1), r1: Math.max(r, r1), c1: Math.max(c, c1) };
  }
  function setSel(r, c, r1, c1) {
    const sh = sheet();
    r = clamp(r, 0, sh.rows - 1); c = clamp(c, 0, sh.cols - 1);
    r1 = r1 == null ? r : clamp(r1, 0, sh.rows - 1);
    c1 = c1 == null ? c : clamp(c1, 0, sh.cols - 1);
    const m = mergeCovering(r, c);
    if (m && r1 === r && c1 === c) { r = m.r; c = m.c; r1 = m.r + m.rs - 1; c1 = m.c + m.cs - 1; }
    state.sel = { r, c, r1, c1 };
    syncFormulaBar();
    syncRibbon();
    renderSel();
    renderHeaders();
    updateStatus();
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function activeCorner() { return { r: state.sel.r, c: state.sel.c }; }

  function ensureVisible(r, c) {
    const sc = els.scroll;
    const x = state.colPos[c], y = state.rowPos[r];
    const w = cw(c), h = rh(r);
    if (x < sc.scrollLeft) sc.scrollLeft = x;
    else if (x + w > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = x + w - sc.clientWidth;
    if (y < sc.scrollTop) sc.scrollTop = y;
    else if (y + h > sc.scrollTop + sc.clientHeight) sc.scrollTop = y + h - sc.clientHeight;
  }

  function edge(r, c, dr, dc) {
    const sh = sheet();
    const start = raw(r, c) !== "";
    let nr = r, nc = c;
    while (true) {
      const tr = nr + dr, tc = nc + dc;
      if (tr < 0 || tc < 0 || tr >= sh.rows || tc >= sh.cols) break;
      const filled = raw(tr, tc) !== "";
      if (start) { if (!filled) break; }
      else { if (filled) { nr = tr; nc = tc; break; } }
      nr = tr; nc = tc;
      if (start && raw(tr + dr, tc + dc) === "" && filled) break;
    }
    return { r: nr, c: nc };
  }

  /* ---------- render ---------- */
  function renderAll() {
    rebuildPos();
    renderHeaders();
    renderCells();
    renderSel();
    renderTabs();
    syncFormulaBar();
    syncRibbon();
    updateStatus();
    els.zoom.textContent = Math.round((state.book.zoom || 1) * 100) + "%";
    els.grid.classList.toggle("no-lines", state.book.grid === false);
    els.bookName.value = state.book.name || "Book1";
    applyZoom();
  }

  function applyZoom() {
    const z = state.book.zoom || 1;
    els.cells.style.zoom = z;
    els.sel.style.zoom = z;
    els.sizer.style.zoom = z;
  }

  function visRange() {
    const sc = els.scroll, z = state.book.zoom || 1;
    const sl = sc.scrollLeft / z, st = sc.scrollTop / z;
    const vw = sc.clientWidth / z, vh = sc.clientHeight / z;
    const sh = sheet();
    const c0 = Math.max(0, upper(state.colPos, sl) - 1);
    const r0 = Math.max(0, upper(state.rowPos, st) - 1);
    const c1 = Math.min(sh.cols - 1, upper(state.colPos, sl + vw) + 2);
    const r1 = Math.min(sh.rows - 1, upper(state.rowPos, st + vh) + 2);
    return { r0, c0, r1, c1, sl, st };
  }

  function take(pool, parent, cls) {
    let el = pool.pop();
    if (!el) { el = document.createElement("div"); el.className = cls; parent.appendChild(el); }
    el.hidden = false;
    return el;
  }

  function renderHeaders() {
    const { r0, c0, r1, c1 } = visRange();
    const usedC = [], usedR = [];
    const ac = selNorm();
    for (let c = c0; c <= c1; c++) {
      const el = take(state.headerPoolC, els.colH, "ch");
      el.style.left = (state.colPos[c] - els.scroll.scrollLeft / (state.book.zoom || 1)) + "px";
      el.style.top = "0";
      el.style.width = cw(c) + "px";
      el.style.height = "24px";
      el.textContent = colName(c);
      el.classList.toggle("active", c >= ac.c0 && c <= ac.c1);
      el.dataset.c = c;
      if (!el._res) {
        const rz = document.createElement("div");
        rz.className = "resizer";
        el.appendChild(rz);
        el._res = true;
      }
      usedC.push(el);
    }
    for (let r = r0; r <= r1; r++) {
      const el = take(state.headerPoolR, els.rowH, "rh");
      el.style.top = (state.rowPos[r] - els.scroll.scrollTop / (state.book.zoom || 1)) + "px";
      el.style.left = "0";
      el.style.height = rh(r) + "px";
      el.textContent = r + 1;
      el.classList.toggle("active", r >= ac.r0 && r <= ac.r1);
      el.dataset.r = r;
      if (!el._res) {
        const rz = document.createElement("div");
        rz.className = "resizer";
        el.appendChild(rz);
        el._res = true;
      }
      usedR.push(el);
    }
    [...els.colH.querySelectorAll(".ch")].forEach(el => {
      if (!usedC.includes(el)) { el.hidden = true; state.headerPoolC.push(el); }
    });
    [...els.rowH.querySelectorAll(".rh")].forEach(el => {
      if (!usedR.includes(el)) { el.hidden = true; state.headerPoolR.push(el); }
    });
  }

  function renderCells() {
    const { r0, c0, r1, c1 } = visRange();
    const used = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const m = mergeCovering(r, c);
        if (m && (m.r !== r || m.c !== c)) continue;
        const el = take(state.pool, els.cells, "cell");
        const w = m ? rangeWidth(m.c, m.c + m.cs - 1) : cw(c);
        const h = m ? rangeHeight(m.r, m.r + m.rs - 1) : rh(r);
        el.style.left = state.colPos[c] + "px";
        el.style.top = state.rowPos[r] + "px";
        el.style.width = w + "px";
        el.style.height = h + "px";
        const st = styleOf(r, c);
        const val = evalCell(r, c);
        const text = display(r, c);
        el.textContent = text;
        el.className = "cell";
        if (st.wrap) el.classList.add("wrap");
        if (typeof val === "number" && !(typeof text === "string" && text.startsWith("#"))) el.classList.add("num");
        if (typeof val === "boolean") el.classList.add("bool");
        if (typeof val === "string" && val.startsWith("#")) el.classList.add("err");
        el.style.fontWeight = st.b ? "700" : "";
        el.style.fontStyle = st.i ? "italic" : "";
        el.style.textDecoration = st.u ? "underline" : "";
        el.style.color = st.color || "";
        el.style.background = st.bg || "";
        el.style.fontFamily = st.font || "";
        el.style.fontSize = st.size ? st.size + "px" : "";
        el.style.justifyContent = st.align === "center" ? "center" : st.align === "right" ? "flex-end" : (el.classList.contains("num") ? "flex-end" : "flex-start");
        el.dataset.r = r; el.dataset.c = c;
        used.push(el);
      }
    }
    [...els.cells.querySelectorAll(".cell")].forEach(el => {
      if (!used.includes(el)) { el.hidden = true; state.pool.push(el); }
    });
  }

  function rangeWidth(c0, c1) { return state.colPos[c1 + 1] - state.colPos[c0]; }
  function rangeHeight(r0, r1) { return state.rowPos[r1 + 1] - state.rowPos[r0]; }

  function renderSel() {
    const n = selNorm();
    els.sel.innerHTML = "";
    const rect = document.createElement("div");
    rect.className = "sel-rect";
    rect.style.left = state.colPos[n.c0] + "px";
    rect.style.top = state.rowPos[n.r0] + "px";
    rect.style.width = rangeWidth(n.c0, n.c1) + "px";
    rect.style.height = rangeHeight(n.r0, n.r1) + "px";
    els.sel.appendChild(rect);
    const h = document.createElement("div");
    h.className = "fill-handle";
    h.style.left = (state.colPos[n.c1 + 1] - 5) + "px";
    h.style.top = (state.rowPos[n.r1 + 1] - 5) + "px";
    h.addEventListener("mousedown", onFillDown);
    els.sel.appendChild(h);
    if (state.editing) placeEditor();
  }

  function renderTabs() {
    els.tabs.innerHTML = "";
    state.book.sheets.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tab" + (i === state.book.active ? " active" : "");
      b.textContent = s.name;
      b.addEventListener("click", () => { commitEdit(); state.book.active = i; setSel(0, 0); renderAll(); });
      b.addEventListener("dblclick", () => renameSheet(i));
      b.addEventListener("contextmenu", (e) => { e.preventDefault(); sheetTabMenu(e, i); });
      els.tabs.appendChild(b);
    });
  }

  function syncFormulaBar() {
    const { r, c } = state.sel;
    if (!state.editing) {
      els.nameBox.value = a1(r, c);
      els.formula.textContent = String(raw(r, c));
    }
  }

  function syncRibbon() {
    const st = styleOf(state.sel.r, state.sel.c);
    document.querySelectorAll("[data-cmd=bold]").forEach(b => b.classList.toggle("on", !!st.b));
    document.querySelectorAll("[data-cmd=italic]").forEach(b => b.classList.toggle("on", !!st.i));
    document.querySelectorAll("[data-cmd=underline]").forEach(b => b.classList.toggle("on", !!st.u));
    els.numFmt.value = st.fmt || "general";
    els.fontFamily.value = st.font || "";
    els.fontSize.value = st.size || "";
  }

  function updateStatus() {
    const n = selNorm();
    const vals = [];
    for (let r = n.r0; r <= n.r1; r++) for (let c = n.c0; c <= n.c1; c++) {
      const v = evalCell(r, c);
      if (isNum(v)) vals.push(v);
    }
    const cells = (n.r1 - n.r0 + 1) * (n.c1 - n.c0 + 1);
    els.status.textContent = state.editing ? "編集" : "準備完了";
    if (vals.length) {
      const sum = vals.reduce((a, b) => a + b, 0);
      els.agg.textContent = `平均 ${formatNumber(sum / vals.length, "number", 3)}  個数 ${vals.length}  合計 ${formatNumber(sum, "number", 2)}`;
    } else els.agg.textContent = cells > 1 ? `個数 ${cells}` : "";
  }

  /* ---------- editing ---------- */
  function startEdit(overwrite, seed) {
    if (state.editing && !overwrite) return;
    commitEdit();
    state.editing = true;
    state.overwrite = !!overwrite;
    els.editBtns.hidden = false;
    const { r, c } = state.sel;
    const v = overwrite ? (seed ?? "") : String(raw(r, c));
    els.editor.hidden = false;
    els.editor.value = v;
    placeEditor();
    els.editor.focus();
    if (!overwrite) els.editor.selectionStart = els.editor.value.length;
    else els.editor.selectionStart = els.editor.value.length;
    els.formula.textContent = v;
    els.status.textContent = "編集";
  }

  function placeEditor() {
    const { r, c } = state.sel;
    const m = mergeCovering(r, c);
    const cc = m ? m.c : c, rr = m ? m.r : r;
    els.editor.style.left = state.colPos[cc] + "px";
    els.editor.style.top = state.rowPos[rr] + "px";
    els.editor.style.width = (m ? rangeWidth(m.c, m.c + m.cs - 1) : cw(c)) + "px";
    els.editor.style.height = Math.max(m ? rangeHeight(m.r, m.r + m.rs - 1) : rh(r), els.editor.scrollHeight) + "px";
  }

  function commitEdit(move) {
    if (!state.editing) return;
    const v = els.editor.hidden ? els.formula.textContent : els.editor.value;
    state.editing = false;
    els.editor.hidden = true;
    els.editBtns.hidden = true;
    setRaw(state.sel.r, state.sel.c, v);
    autosave();
    renderCells();
    renderSel();
    syncFormulaBar();
    updateStatus();
    if (move === "down") moveSel(1, 0);
    if (move === "right") moveSel(0, 1);
    if (move === "up") moveSel(-1, 0);
    if (move === "left") moveSel(0, -1);
  }

  function cancelEdit() {
    if (!state.editing) return;
    state.editing = false;
    els.editor.hidden = true;
    els.editBtns.hidden = true;
    syncFormulaBar();
    updateStatus();
  }

  function moveSel(dr, dc, extend) {
    const sh = sheet();
    if (extend) {
      setSel(state.sel.r, state.sel.c, clamp(state.sel.r1 + dr, 0, sh.rows - 1), clamp(state.sel.c1 + dc, 0, sh.cols - 1));
    } else {
      const r = clamp(state.sel.r + dr, 0, sh.rows - 1);
      const c = clamp(state.sel.c + dc, 0, sh.cols - 1);
      state.anchor = { r, c };
      setSel(r, c);
    }
    ensureVisible(extend ? state.sel.r1 : state.sel.r, extend ? state.sel.c1 : state.sel.c);
    renderHeaders();
  }

  /* ---------- fill / copy ---------- */
  function shiftFormula(f, dr, dc) {
    if (!looksFormula(f)) return f;
    return splitStrings(f).map(p => {
      if (p.s) return p.t;
      return p.t.replace(REF_RE, (m, pre, ref) => {
        const bang = ref.includes("!") ? ref.slice(0, ref.indexOf("!") + 1) : "";
        const token = bang ? ref.slice(bang.length) : ref;
        const parts = token.split(":");
        const shf = (t) => {
          const p = parseA1(t);
          if (!p) return t;
          const r = p.rAbs ? p.r : p.r + dr;
          const c = p.cAbs ? p.c : p.c + dc;
          if (r < 0 || c < 0) return t;
          return a1(r, c, p.rAbs, p.cAbs);
        };
        return pre + bang + parts.map(shf).join(":");
      });
    }).join("");
  }

  function fillRange(src, r0, c0, r1, c1) {
    const sr0 = Math.min(src.r0, src.r1), sc0 = Math.min(src.c0, src.c1);
    const sr1 = Math.max(src.r0, src.r1), sc1 = Math.max(src.c0, src.c1);
    const sh = Math.max(1, sr1 - sr0 + 1), sw = Math.max(1, sc1 - sc0 + 1);
    const map = {};
    const numeric = [];
    for (let r = sr0; r <= sr1; r++) for (let c = sc0; c <= sc1; c++) {
      const v = evalCell(r, c);
      if (isNum(v) && !looksFormula(raw(r, c))) numeric.push(v);
    }
    const series = numeric.length >= 2 && sw === 1;
    const step = series ? (numeric[numeric.length - 1] - numeric[0]) / (numeric.length - 1) : 0;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (r >= sr0 && r <= sr1 && c >= sc0 && c <= sc1) continue;
      const or_ = ((r - sr0) % sh + sh) % sh + sr0;
      const oc = ((c - sc0) % sw + sw) % sw + sc0;
      const srcCell = clone(getCell(or_, oc) || { v: "" });
      const dr = r - or_, dc = c - oc;
      if (srcCell && looksFormula(srcCell.v)) srcCell.v = shiftFormula(srcCell.v, dr, dc);
      else if (series && sw === 1) {
        const base = evalCell(sr0, sc0);
        srcCell.v = base + step * (r - sr0);
      }
      map[key(r, c)] = srcCell;
    }
    applyCells(map);
  }

  function onFillDown(e) {
    e.preventDefault(); e.stopPropagation();
    const src = selNorm();
    state.filling = { src, r: src.r1, c: src.c1 };
    const move = (ev) => {
      const hit = hitCell(ev);
      if (!hit) return;
      state.filling.r = hit.r; state.filling.c = hit.c;
      const r0 = Math.min(src.r0, hit.r), r1 = Math.max(src.r1, hit.r);
      const c0 = Math.min(src.c0, hit.c), c1 = Math.max(src.c1, hit.c);
      const preview = els.sel.querySelector(".sel-rect");
      if (preview) {
        preview.style.left = state.colPos[c0] + "px";
        preview.style.top = state.rowPos[r0] + "px";
        preview.style.width = rangeWidth(c0, c1) + "px";
        preview.style.height = rangeHeight(r0, r1) + "px";
      }
    };
    const up = (ev) => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      const f = state.filling; state.filling = null;
      if (!f) return;
      const r0 = Math.min(src.r0, f.r), r1 = Math.max(src.r1, f.r);
      const c0 = Math.min(src.c0, f.c), c1 = Math.max(src.c1, f.c);
      fillRange(src, r0, c0, r1, c1);
      setSel(src.r0, src.c0, r1 === src.r1 && c1 === src.c1 ? src.r1 : r1, c1 === src.c1 && r1 === src.r1 ? src.c1 : c1);
      renderAll();
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  function hitCell(ev) {
    const z = state.book.zoom || 1;
    const rec = els.scroll.getBoundingClientRect();
    const x = (ev.clientX - rec.left + els.scroll.scrollLeft) / z;
    const y = (ev.clientY - rec.top + els.scroll.scrollTop) / z;
    const c = Math.min(sheet().cols - 1, upper(state.colPos, x));
    const r = Math.min(sheet().rows - 1, upper(state.rowPos, y));
    if (r < 0 || c < 0) return null;
    return { r, c };
  }

  function copy(cut) {
    const n = selNorm();
    const rows = [];
    const cells = {};
    for (let r = n.r0; r <= n.r1; r++) {
      const row = [];
      for (let c = n.c0; c <= n.c1; c++) {
        row.push(String(display(r, c)));
        cells[key(r - n.r0, c - n.c0)] = clone(getCell(r, c) || null);
      }
      rows.push(row.join("\t"));
    }
    const tsv = rows.join("\n");
    state.clip = { tsv, cells, h: n.r1 - n.r0 + 1, w: n.c1 - n.c0 + 1, cut: !!cut, origin: { r: n.r0, c: n.c0, sheet: sheet().name } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tsv).catch(() => {});
    if (cut) {
      const map = {};
      for (let r = n.r0; r <= n.r1; r++) for (let c = n.c0; c <= n.c1; c++) {
        const prev = getCell(r, c);
        map[key(r, c)] = prev && prev.s ? { s: clone(prev.s) } : null;
      }
      applyCells(map);
      renderCells();
    }
    flashStatus(cut ? "切り取りました" : "コピーしました");
  }

  function paste(tsv) {
    let grid;
    if (tsv != null) {
      grid = String(tsv).replace(/\r/g, "").split("\n").map(l => l.split("\t"));
      if (grid.length && grid[grid.length - 1].length === 1 && grid[grid.length - 1][0] === "") grid.pop();
    } else if (state.clip) {
      grid = null;
    } else return;
    const { r, c } = state.sel;
    const map = {};
    if (state.clip && tsv == null) {
      const { h, w, cells, origin } = state.clip;
      for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
        const src = clone(cells[key(i, j)] || { v: "" });
        if (src && looksFormula(src.v)) src.v = shiftFormula(src.v, r - origin.r, c - origin.c);
        map[key(r + i, c + j)] = src;
        grow(r + i, c + j);
      }
    } else {
      grid.forEach((row, i) => row.forEach((val, j) => {
        map[key(r + i, c + j)] = newCell(val);
        grow(r + i, c + j);
      }));
    }
    applyCells(map);
    renderAll();
  }

  function grow(r, c) {
    const sh = sheet();
    if (r >= sh.rows) sh.rows = Math.min(MAX_ROWS, r + 20);
    if (c >= sh.cols) sh.cols = Math.min(MAX_COLS, c + 5);
  }

  /* ---------- commands ---------- */
  function undo() {
    const e = state.undo.pop();
    if (!e) return;
    if (e.type === "cells") {
      Object.entries(e.before).forEach(([k, v]) => {
        if (!v) delete sheet().cells[k]; else sheet().cells[k] = clone(v);
      });
    } else if (e.type === "book") {
      const cur = clone(state.book);
      state.book = e.before;
      e.before = cur;
    }
    state.redo.push(e);
    invalidate(); renderAll(); markDirty(true);
  }
  function redo() {
    const e = state.redo.pop();
    if (!e) return;
    if (e.type === "cells") {
      Object.entries(e.after).forEach(([k, v]) => {
        if (!v) delete sheet().cells[k]; else sheet().cells[k] = clone(v);
      });
    } else if (e.type === "book") {
      const cur = clone(state.book);
      state.book = e.after || e.before;
      e.after = cur;
    }
    state.undo.push(e);
    invalidate(); renderAll(); markDirty(true);
  }

  function clearContents() {
    const n = selNorm();
    const map = {};
    for (let r = n.r0; r <= n.r1; r++) for (let c = n.c0; c <= n.c1; c++) {
      const prev = getCell(r, c);
      map[key(r, c)] = prev && prev.s ? { s: clone(prev.s) } : null;
    }
    applyCells(map); renderCells(); syncFormulaBar();
  }

  function insertRow(delta) {
    const n = selNorm();
    const sh = sheet();
    const at = n.r0;
    const cells = {};
    Object.entries(sh.cells).forEach(([k, v]) => {
      const [r, c] = k.split(",").map(Number);
      if (r >= at) cells[key(r + delta, c)] = shiftCell(v, delta, 0);
      else cells[k] = v;
    });
    sh.cells = cells;
    sh.rows = Math.min(MAX_ROWS, sh.rows + delta);
    sh.merges.forEach(m => { if (m.r >= at) m.r += delta; else if (m.r + m.rs > at) m.rs += delta; });
    pushUndo({ type: "book", before: null });
    invalidate(); renderAll(); markDirty(true);
  }

  function insertCol(delta) {
    const n = selNorm();
    const sh = sheet();
    const at = n.c0;
    const cells = {};
    Object.entries(sh.cells).forEach(([k, v]) => {
      const [r, c] = k.split(",").map(Number);
      if (c >= at) cells[key(r, c + delta)] = shiftCell(v, 0, delta);
      else cells[k] = v;
    });
    sh.cells = cells;
    sh.cols = Math.min(MAX_COLS, sh.cols + delta);
    sh.merges.forEach(m => { if (m.c >= at) m.c += delta; else if (m.c + m.cs > at) m.cs += delta; });
    invalidate(); renderAll(); markDirty(true);
  }

  function shiftCell(cell, dr, dc) {
    const x = clone(cell);
    if (x && looksFormula(x.v) && (dr || dc)) x.v = shiftFormula(x.v, dr, dc);
    return x;
  }

  function deleteRows() {
    const n = selNorm();
    const sh = sheet();
    const cnt = n.r1 - n.r0 + 1;
    const cells = {};
    Object.entries(sh.cells).forEach(([k, v]) => {
      const [r, c] = k.split(",").map(Number);
      if (r < n.r0) cells[k] = v;
      else if (r > n.r1) cells[key(r - cnt, c)] = shiftCell(v, -cnt, 0);
    });
    sh.cells = cells;
    sh.rows = Math.max(1, sh.rows - cnt);
    invalidate(); renderAll(); markDirty(true);
  }
  function deleteCols() {
    const n = selNorm();
    const sh = sheet();
    const cnt = n.c1 - n.c0 + 1;
    const cells = {};
    Object.entries(sh.cells).forEach(([k, v]) => {
      const [r, c] = k.split(",").map(Number);
      if (c < n.c0) cells[k] = v;
      else if (c > n.c1) cells[key(r, c - cnt)] = shiftCell(v, 0, -cnt);
    });
    sh.cells = cells;
    sh.cols = Math.max(1, sh.cols - cnt);
    invalidate(); renderAll(); markDirty(true);
  }

  function mergeSel() {
    const n = selNorm();
    if (n.r0 === n.r1 && n.c0 === n.c1) return;
    sheet().merges = sheet().merges.filter(m => m.r + m.rs - 1 < n.r0 || m.r > n.r1 || m.c + m.cs - 1 < n.c0 || m.c > n.c1);
    sheet().merges.push({ r: n.r0, c: n.c0, rs: n.r1 - n.r0 + 1, cs: n.c1 - n.c0 + 1 });
    markDirty(true); renderAll();
  }
  function unmergeSel() {
    const n = selNorm();
    sheet().merges = sheet().merges.filter(m => m.r + m.rs - 1 < n.r0 || m.r > n.r1 || m.c + m.cs - 1 < n.c0 || m.c > n.c1);
    markDirty(true); renderAll();
  }

  function autoSum() {
    const n = selNorm();
    let targetR = n.r1, targetC = n.c1, rng;
    if (n.r0 === n.r1 && n.c0 === n.c1) {
      let r = n.r0 - 1;
      while (r >= 0 && isNum(evalCell(r, n.c0))) r--;
      r++;
      if (r < n.r0) rng = `${a1(r, n.c0)}:${a1(n.r0 - 1, n.c0)}`;
      else {
        let c = n.c0 - 1;
        while (c >= 0 && isNum(evalCell(n.r0, c))) c--;
        c++;
        rng = `${a1(n.r0, c)}:${a1(n.r0, n.c0 - 1)}`;
      }
    } else {
      rng = `${a1(n.r0, n.c0)}:${a1(n.r1, n.c1)}`;
      targetR = n.r1 + 1; targetC = n.c0;
      grow(targetR, targetC);
    }
    setRaw(targetR, targetC, `=SUM(${rng})`);
    setSel(targetR, targetC);
    renderAll();
  }

  function sortSel(dir) {
    const n = selNorm();
    const rows = [];
    for (let r = n.r0; r <= n.r1; r++) {
      const row = [];
      for (let c = n.c0; c <= n.c1; c++) row.push(clone(getCell(r, c) || null));
      rows.push(row);
    }
    const col = 0;
    rows.sort((a, b) => {
      const va = a[col] ? parseLocale(a[col].v) : "";
      const vb = b[col] ? parseLocale(b[col].v) : "";
      if (va == vb) return 0;
      return (va > vb ? 1 : -1) * dir;
    });
    const map = {};
    rows.forEach((row, i) => row.forEach((cell, j) => { map[key(n.r0 + i, n.c0 + j)] = cell; }));
    applyCells(map); renderAll();
  }

  function freezeHere() {
    sheet().freeze = [state.sel.r, state.sel.c];
    flashStatus(`枠を ${a1(state.sel.r, state.sel.c)} で固定（スクロール時はヘッダーが目安）`);
  }

  function cmd(name, extra) {
    commitEdit();
    switch (name) {
      case "undo": return undo();
      case "redo": return redo();
      case "cut": return copy(true);
      case "copy": return copy(false);
      case "paste": return pasteFromClip();
      case "bold": return patchStyleSel({ b: !styleOf(state.sel.r, state.sel.c).b });
      case "italic": return patchStyleSel({ i: !styleOf(state.sel.r, state.sel.c).i });
      case "underline": return patchStyleSel({ u: !styleOf(state.sel.r, state.sel.c).u });
      case "alignL": return patchStyleSel({ align: "left" });
      case "alignC": return patchStyleSel({ align: "center" });
      case "alignR": return patchStyleSel({ align: "right" });
      case "wrap": return patchStyleSel({ wrap: !styleOf(state.sel.r, state.sel.c).wrap });
      case "merge": return mergeSel();
      case "unmerge": return unmergeSel();
      case "fmtPercent": return patchStyleSel({ fmt: "percent" });
      case "fmtComma": return patchStyleSel({ fmt: "number" });
      case "decInc": return patchStyleSel({ d: (styleOf(state.sel.r, state.sel.c).d || 2) + 1 });
      case "decDec": return patchStyleSel({ d: Math.max(0, (styleOf(state.sel.r, state.sel.c).d || 2) - 1) });
      case "insertRow": return insertRow(1);
      case "insertCol": return insertCol(1);
      case "deleteRow": return deleteRows();
      case "deleteCol": return deleteCols();
      case "clear": return clearContents();
      case "sortAsc": return sortSel(1);
      case "sortDesc": return sortSel(-1);
      case "find": return openFind();
      case "autoSum": return autoSum();
      case "insertFx": return openFx();
      case "recalc": invalidate(); renderCells(); updateStatus(); return;
      case "toggleFormulas": state.showFx = !state.showFx; renderCells(); return;
      case "freeze": return freezeHere();
      case "unfreeze": sheet().freeze = [0, 0]; flashStatus("固定を解除"); return;
      case "gridlines": state.book.grid = state.book.grid === false; renderAll(); return;
      case "zoomIn": state.book.zoom = Math.min(2, (state.book.zoom || 1) + 0.1); renderAll(); return;
      case "zoomOut": state.book.zoom = Math.max(0.5, (state.book.zoom || 1) - 0.1); renderAll(); return;
      case "zoomReset": state.book.zoom = 1; renderAll(); return;
      case "new": return newBook();
      case "open": els.file.click(); return;
      case "save": return saveFile();
      case "saveAs": return saveFile(true);
      case "sample": loadBook(sampleBook()); return;
      case "exportJson": {
        navigator.clipboard.writeText(JSON.stringify(serialize(), null, 2));
        flashStatus("JSON をコピーしました");
        return;
      }
      default: break;
    }
  }

  function patchStyleSel(patch) {
    const n = selNorm();
    patchStyle(n.r0, n.c0, n.r1, n.c1, patch);
    renderCells(); syncRibbon();
  }

  async function pasteFromClip() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { paste(t); return; }
    } catch (_) {}
    paste(null);
  }

  function newBook() {
    if (state.dirty && !confirm("未保存の変更があります。新規作成しますか？")) return;
    loadBook(blankBook());
  }

  function serialize() {
    return {
      magic: MAGIC,
      name: state.book.name,
      active: state.book.active,
      zoom: state.book.zoom,
      grid: state.book.grid,
      sheets: state.book.sheets,
    };
  }

  function loadBook(b) {
    state.book = b;
    state.book.zoom = b.zoom || 1;
    state.undo = []; state.redo = [];
    state.sel = { r: 0, c: 0, r1: 0, c1: 0 };
    invalidate();
    markDirty(false);
    renderAll();
  }

  function saveFile() {
    const data = JSON.stringify(serialize(), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (state.book.name || "Book") + ".wss.json";
    a.click();
    URL.revokeObjectURL(a.href);
    markDirty(false);
    flashStatus("保存しました");
  }

  function autosave() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(serialize())); } catch (_) {}
  }

  function flashStatus(t) {
    els.status.textContent = t;
    setTimeout(() => { if (!state.editing) els.status.textContent = "準備完了"; }, 1600);
  }

  /* ---------- ui dialogs ---------- */
  let modalCb = null;
  function openModal(title, html, onOk) {
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = html;
    els.modal.hidden = false;
    modalCb = onOk;
    const inp = els.modalBody.querySelector("input,textarea");
    if (inp) setTimeout(() => inp.focus(), 0);
  }
  function closeModal(ok) {
    els.modal.hidden = true;
    if (ok && modalCb) modalCb();
    modalCb = null;
  }

  function openFind() {
    openModal("検索と置換",
      `<label>検索<input id="q-find" /></label><label>置換<input id="q-repl" /></label>`,
      () => {
        const q = document.getElementById("q-find").value;
        const repl = document.getElementById("q-repl").value;
        if (!q) return;
        const sh = sheet();
        const map = {};
        let found = null;
        Object.entries(sh.cells).forEach(([k, cell]) => {
          const s = String(cell.v ?? "");
          if (s.includes(q)) {
            if (repl) { const n = clone(cell); n.v = s.split(q).join(repl); map[k] = n; }
            if (!found) { const [r, c] = k.split(",").map(Number); found = { r, c }; }
          }
        });
        if (repl) applyCells(map);
        if (found) { setSel(found.r, found.c); ensureVisible(found.r, found.c); }
        renderAll();
      });
  }

  function openFx() {
    const list = Object.keys(FN).sort().map(n => `<button type="button" data-fx="${n}"><b>${n}</b><small>関数</small></button>`).join("");
    openModal("関数の挿入", `<div class="fx-list">${list}</div><p class="hint">JavaScript も使えます。例: Math.sqrt(A1) や A1:A10.filter(x=&gt;x&gt;0)</p>`, () => {});
    els.modalBody.querySelectorAll("[data-fx]").forEach(b => b.addEventListener("click", () => {
      closeModal(false);
      startEdit(true, `=${b.dataset.fx}()`);
    }));
  }

  function openHelp() {
    openModal("ショートカット", `<div class="kbd">
      <b>矢印</b><code>移動</code>
      <b>Shift+矢印</b><code>選択拡張</code>
      <b>Ctrl+矢印</b><code>データの端へ</code>
      <b>Tab / Enter</b><code>確定して移動</code>
      <b>F2</b><code>編集</code>
      <b>Esc</b><code>取消</code>
      <b>Delete</b><code>クリア</code>
      <b>Ctrl+C / X / V</b><code>コピー / 切取 / 貼付</code>
      <b>Ctrl+Z / Y</b><code>元に戻す / やり直し</code>
      <b>Ctrl+B I U</b><code>太字 斜体 下線</code>
      <b>Ctrl+D / R</b><code>下へ / 右へフィル</code>
      <b>Ctrl+Enter</b><code>選択範囲に同じ値</code>
      <b>Alt+=</b><code>SUM</code>
      <b>Ctrl+S / O / N</b><code>保存 / 開く / 新規</code>
      <b>Ctrl+F</b><code>検索</code>
      <b>Ctrl+Home / End</b><code>A1 / 使用範囲末</code>
      <b>Ctrl+Space / Shift+Space</b><code>列 / 行選択</code>
      <b>Ctrl+;</b><code>今日の日付</code>
      <b>F9</b><code>再計算</code>
      <b>Ctrl+\`</b><code>数式表示</code>
    </div>`, () => {});
  }

  function renameSheet(i) {
    const s = state.book.sheets[i];
    openModal("シート名", `<input id="q-name" value="${s.name.replace(/"/g, "&quot;")}" />`, () => {
      const n = document.getElementById("q-name").value.trim() || s.name;
      s.name = n; renderTabs(); markDirty(true);
    });
  }

  /* ---------- events ---------- */
  function onKey(e) {
    const meta = e.ctrlKey || e.metaKey;
    if (els.modal.hidden === false) {
      if (e.key === "Escape") { closeModal(false); e.preventDefault(); }
      if (e.key === "Enter") { closeModal(true); e.preventDefault(); }
      return;
    }
    if (e.target === els.bookName || e.target === els.nameBox) {
      if (e.key === "Enter") {
        if (e.target === els.nameBox) goName(els.nameBox.value);
        else { state.book.name = els.bookName.value; markDirty(true); }
        e.target.blur(); e.preventDefault();
      }
      return;
    }
    if (e.target === els.formula || e.target === els.editor) {
      if (e.key === "Enter" && !e.altKey) { e.preventDefault(); commitEdit(e.shiftKey ? "up" : "down"); return; }
      if (e.key === "Tab") { e.preventDefault(); commitEdit(e.shiftKey ? "left" : "right"); return; }
      if (e.key === "Escape") { e.preventDefault(); cancelEdit(); return; }
      if (e.key === "F2") { e.preventDefault(); return; }
      return;
    }
    if (state.editing) return;

    if (e.key === "F1") { e.preventDefault(); openHelp(); return; }
    if (e.key === "F2") { e.preventDefault(); startEdit(false); return; }
    if (e.key === "F9") { e.preventDefault(); cmd("recalc"); return; }
    if (e.key === "Escape") { hideMenus(); return; }

    if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (meta && e.key.toLowerCase() === "c") { e.preventDefault(); copy(false); return; }
    if (meta && e.key.toLowerCase() === "x") { e.preventDefault(); copy(true); return; }
    if (meta && e.key.toLowerCase() === "v") { e.preventDefault(); pasteFromClip(); return; }
    if (meta && e.key.toLowerCase() === "b") { e.preventDefault(); cmd("bold"); return; }
    if (meta && e.key.toLowerCase() === "i") { e.preventDefault(); cmd("italic"); return; }
    if (meta && e.key.toLowerCase() === "u") { e.preventDefault(); cmd("underline"); return; }
    if (meta && e.key.toLowerCase() === "s") { e.preventDefault(); saveFile(); return; }
    if (meta && e.key.toLowerCase() === "o") { e.preventDefault(); els.file.click(); return; }
    if (meta && e.key.toLowerCase() === "n") { e.preventDefault(); newBook(); return; }
    if (meta && e.key.toLowerCase() === "f") { e.preventDefault(); openFind(); return; }
    if (meta && e.key.toLowerCase() === "d") { e.preventDefault(); fillDown(); return; }
    if (meta && e.key.toLowerCase() === "r" && !e.shiftKey) { e.preventDefault(); fillRight(); return; }
    if (meta && e.key === "`") { e.preventDefault(); cmd("toggleFormulas"); return; }
    if (meta && e.key === ";") { e.preventDefault(); insertNow(e.shiftKey); return; }
    if (meta && e.key === "Home") { e.preventDefault(); setSel(0, 0); ensureVisible(0, 0); return; }
    if (meta && e.key === "End") { e.preventDefault(); gotoUsedEnd(); return; }
    if (meta && e.key === " ") { e.preventDefault(); selectCol(); return; }
    if (e.shiftKey && e.key === " " && !meta) { e.preventDefault(); selectRow(); return; }
    if (meta && e.key === "Enter") { e.preventDefault(); fillAll(); return; }
    if (e.altKey && e.key === "=") { e.preventDefault(); autoSum(); return; }
    if (e.altKey && e.key === "Enter") { startEdit(false); return; }

    const extend = e.shiftKey;
    if (e.key === "ArrowUp") { e.preventDefault(); meta ? jump(-1, 0, extend) : moveSel(-1, 0, extend); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); meta ? jump(1, 0, extend) : moveSel(1, 0, extend); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); meta ? jump(0, -1, extend) : moveSel(0, -1, extend); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); meta ? jump(0, 1, extend) : moveSel(0, 1, extend); return; }
    if (e.key === "Tab") { e.preventDefault(); moveSel(0, e.shiftKey ? -1 : 1); return; }
    if (e.key === "Enter") { e.preventDefault(); moveSel(e.shiftKey ? -1 : 1, 0); return; }
    if (e.key === "Home") { e.preventDefault(); setSel(state.sel.r, 0); return; }
    if (e.key === "PageDown") { e.preventDefault(); moveSel(20, 0, extend); return; }
    if (e.key === "PageUp") { e.preventDefault(); moveSel(-20, 0, extend); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); if (e.key === "Backspace" && raw(state.sel.r, state.sel.c) !== "") startEdit(true, ""); else clearContents(); return; }

    if (!meta && !e.altKey && e.key.length === 1 && !e.isComposing) {
      e.preventDefault();
      startEdit(true, e.key);
    }
  }

  function jump(dr, dc, extend) {
    const e = edge(state.sel.r, state.sel.c, dr, dc);
    if (extend) setSel(state.sel.r, state.sel.c, e.r, e.c);
    else setSel(e.r, e.c);
    ensureVisible(e.r, e.c);
  }
  function fillDown() {
    const n = selNorm();
    fillRange({ r0: n.r0, c0: n.c0, r1: n.r0, c1: n.c1 }, n.r0, n.c0, n.r1, n.c1);
    renderAll();
  }
  function fillRight() {
    const n = selNorm();
    fillRange({ r0: n.r0, c0: n.c0, r1: n.r1, c1: n.c0 }, n.r0, n.c0, n.r1, n.c1);
    renderAll();
  }
  function fillAll() {
    const n = selNorm();
    const v = raw(state.sel.r, state.sel.c);
    const map = {};
    for (let r = n.r0; r <= n.r1; r++) for (let c = n.c0; c <= n.c1; c++) map[key(r, c)] = newCell(v, styleOf(r, c));
    applyCells(map); renderAll();
  }
  function insertNow(time) {
    const d = new Date();
    const v = time
      ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
      : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    setRaw(state.sel.r, state.sel.c, v); renderCells(); syncFormulaBar();
  }
  function selectCol() {
    const sh = sheet();
    const n = selNorm();
    setSel(0, n.c0, sh.rows - 1, n.c1);
  }
  function selectRow() {
    const sh = sheet();
    const n = selNorm();
    setSel(n.r0, 0, n.r1, sh.cols - 1);
  }
  function gotoUsedEnd() {
    const sh = sheet();
    let mr = 0, mc = 0;
    Object.keys(sh.cells).forEach(k => {
      const [r, c] = k.split(",").map(Number);
      if (r > mr) mr = r; if (c > mc) mc = c;
    });
    setSel(mr, mc); ensureVisible(mr, mc);
  }
  function goName(v) {
    const p = parseA1(v) || parseRange(v);
    if (!p) return;
    if (p.r != null) setSel(p.r, p.c);
    else setSel(p.r0, p.c0, p.r1, p.c1);
    ensureVisible(state.sel.r, state.sel.c);
  }

  function hideMenus() {
    els.menuFile.hidden = true;
    els.ctx.hidden = true;
    document.querySelectorAll(".menu-top").forEach(b => b.classList.remove("active"));
  }

  els.scroll.addEventListener("scroll", () => { renderHeaders(); renderCells(); }, { passive: true });
  els.scroll.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.classList.contains("fill-handle")) return;
    commitEdit();
    const hit = hitCell(e);
    if (!hit) return;
    hideMenus();
    if (e.shiftKey) setSel(state.anchor.r, state.anchor.c, hit.r, hit.c);
    else { state.anchor = hit; setSel(hit.r, hit.c); }
    state.selecting = true;
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!state.selecting) return;
    const hit = hitCell(e);
    if (hit) setSel(state.anchor.r, state.anchor.c, hit.r, hit.c);
  });
  document.addEventListener("mouseup", () => { state.selecting = false; });
  els.scroll.addEventListener("dblclick", (e) => {
    const hit = hitCell(e);
    if (hit) { setSel(hit.r, hit.c); startEdit(false); }
  });
  els.scroll.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const hit = hitCell(e);
    if (hit) {
      const n = selNorm();
      if (hit.r < n.r0 || hit.r > n.r1 || hit.c < n.c0 || hit.c > n.c1) setSel(hit.r, hit.c);
    }
    showCtx(e.clientX, e.clientY, [
      ["切り取り", "cut", "Ctrl+X"], ["コピー", "copy", "Ctrl+C"], ["貼り付け", "paste", "Ctrl+V"],
      null,
      ["行を挿入", "insertRow", ""], ["列を挿入", "insertCol", ""],
      ["行を削除", "deleteRow", ""], ["列を削除", "deleteCol", ""],
      null,
      ["結合", "merge", ""], ["結合解除", "unmerge", ""], ["クリア", "clear", "Del"],
    ]);
  });

  els.colH.addEventListener("mousedown", (e) => {
    const ch = e.target.closest(".ch");
    if (!ch) return;
    const c = +ch.dataset.c;
    if (e.target.classList.contains("resizer")) return startResizeCol(c, e);
    commitEdit();
    if (e.shiftKey) setSel(0, Math.min(state.anchor.c, c), sheet().rows - 1, Math.max(state.anchor.c, c));
    else { state.anchor = { r: 0, c }; setSel(0, c, sheet().rows - 1, c); }
  });
  els.rowH.addEventListener("mousedown", (e) => {
    const rhEl = e.target.closest(".rh");
    if (!rhEl) return;
    const r = +rhEl.dataset.r;
    if (e.target.classList.contains("resizer")) return startResizeRow(r, e);
    commitEdit();
    if (e.shiftKey) setSel(Math.min(state.anchor.r, r), 0, Math.max(state.anchor.r, r), sheet().cols - 1);
    else { state.anchor = { r, c: 0 }; setSel(r, 0, r, sheet().cols - 1); }
  });
  els.corner.addEventListener("click", () => setSel(0, 0, sheet().rows - 1, sheet().cols - 1));

  function startResizeCol(c, e) {
    const x0 = e.clientX, w0 = cw(c);
    const move = (ev) => { sheet().colW[c] = Math.max(24, w0 + ev.clientX - x0); rebuildPos(); renderAll(); };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); markDirty(true); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  }
  function startResizeRow(r, e) {
    const y0 = e.clientY, h0 = rh(r);
    const move = (ev) => { sheet().rowH[r] = Math.max(14, h0 + ev.clientY - y0); rebuildPos(); renderAll(); };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); markDirty(true); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  }

  function showCtx(x, y, items) {
    const m = els.ctx;
    m.innerHTML = "";
    items.forEach(it => {
      if (!it) { m.appendChild(document.createElement("hr")); return; }
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = `${it[0]}<span>${it[2] || ""}</span>`;
      b.addEventListener("click", () => { hideMenus(); cmd(it[1]); });
      m.appendChild(b);
    });
    m.hidden = false;
    m.style.left = Math.min(x, innerWidth - 220) + "px";
    m.style.top = Math.min(y, innerHeight - 280) + "px";
  }
  function sheetTabMenu(e, i) {
    showCtx(e.clientX, e.clientY, [
      ["名前の変更", "_rename", ""],
      ["シートの挿入", "_add", ""],
      ["シートの削除", "_del", ""],
    ]);
    els.ctx.querySelectorAll("button")[0].onclick = () => { hideMenus(); renameSheet(i); };
    els.ctx.querySelectorAll("button")[1].onclick = () => { hideMenus(); addSheet(i + 1); };
    els.ctx.querySelectorAll("button")[2].onclick = () => { hideMenus(); delSheet(i); };
  }

  function addSheet(at) {
    const n = state.book.sheets.length + 1;
    const s = emptySheet("Sheet" + n);
    if (at == null) state.book.sheets.push(s);
    else state.book.sheets.splice(at, 0, s);
    state.book.active = at == null ? state.book.sheets.length - 1 : at;
    markDirty(true); renderAll();
  }
  function delSheet(i) {
    if (state.book.sheets.length === 1) return;
    if (!confirm("シートを削除しますか？")) return;
    state.book.sheets.splice(i, 1);
    state.book.active = Math.min(state.book.active, state.book.sheets.length - 1);
    markDirty(true); renderAll();
  }

  document.addEventListener("keydown", onKey);
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown") && !e.target.closest("[data-menu]")) els.menuFile.hidden = true;
    if (!e.target.closest(".context-menu")) els.ctx.hidden = true;
  });

  document.querySelectorAll("[data-cmd]").forEach(b => b.addEventListener("click", () => cmd(b.dataset.cmd)));
  document.querySelectorAll("[data-ribbon]").forEach(b => b.addEventListener("click", () => {
    const tab = b.dataset.ribbon;
    document.querySelectorAll(".ribbon-tab").forEach(t => { t.hidden = t.dataset.tab !== tab; });
    document.querySelectorAll("[data-ribbon]").forEach(x => x.classList.toggle("active", x === b));
    hideMenus();
  }));
  document.querySelector("[data-menu=file]").addEventListener("click", (e) => {
    e.stopPropagation();
    els.menuFile.hidden = !els.menuFile.hidden;
  });
  els.menuFile.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cmd]");
    if (b) { hideMenus(); cmd(b.dataset.cmd); }
  });

  $("btn-help").addEventListener("click", openHelp);
  $("btn-fx").addEventListener("click", openFx);
  $("btn-cancel").addEventListener("click", cancelEdit);
  $("btn-commit").addEventListener("click", () => commitEdit());
  $("btn-add-sheet").addEventListener("click", () => addSheet());

  els.formula.addEventListener("focus", () => { if (!state.editing) startEdit(false); els.formula.textContent = els.editor.value; });
  els.formula.addEventListener("input", () => { if (state.editing) els.editor.value = els.formula.textContent; });
  els.editor.addEventListener("input", () => { els.formula.textContent = els.editor.value; placeEditor(); });

  els.nameBox.addEventListener("keydown", (e) => { if (e.key === "Enter") { goName(els.nameBox.value); e.preventDefault(); } });
  els.bookName.addEventListener("change", () => { state.book.name = els.bookName.value; markDirty(true); });

  els.fontFamily.addEventListener("change", () => patchStyleSel({ font: els.fontFamily.value || null }));
  els.fontSize.addEventListener("change", () => patchStyleSel({ size: +els.fontSize.value || null }));
  els.fontColor.addEventListener("input", () => patchStyleSel({ color: els.fontColor.value }));
  els.fillColor.addEventListener("input", () => patchStyleSel({ bg: els.fillColor.value }));
  els.numFmt.addEventListener("change", () => patchStyleSel({ fmt: els.numFmt.value }));

  els.file.addEventListener("change", () => {
    const f = els.file.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const b = JSON.parse(rd.result);
        if (b.magic !== MAGIC && !b.sheets) throw new Error("format");
        loadBook(b);
      } catch { alert("ファイルを開けませんでした。独自形式 .wss.json のみ対応です。"); }
    };
    rd.readAsText(f);
    els.file.value = "";
  });

  els.modalCancel.addEventListener("click", () => closeModal(false));
  els.modalOk.addEventListener("click", () => closeModal(true));
  els.modal.addEventListener("click", (e) => { if (e.target === els.modal) closeModal(false); });

  window.addEventListener("beforeunload", (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });
  window.addEventListener("resize", () => { renderHeaders(); renderCells(); renderSel(); });

  document.querySelector("[data-ribbon=home]").classList.add("active");

  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const b = JSON.parse(saved);
      if (b && b.sheets) loadBook(b);
      else loadBook(sampleBook());
    } else loadBook(sampleBook());
  } catch { loadBook(sampleBook()); }

  setInterval(autosave, 8000);
})();
