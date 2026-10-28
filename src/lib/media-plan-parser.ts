import * as XLSX from "xlsx";

/**
 * Parses a distribution media plan workbook into line items.
 *
 * Shaped around how BCC plans are actually built (see the Alpino indicative
 * plan): one tab per category, an OVERVIEW tab holding the campaign summary,
 * a "PAGE LINK" profile column, and "No. Of Deliverables" per page. Costs are
 * often absent from indicative plans, so every money field is optional.
 */

export const FIELDS = [
  { key: "handle_name", label: "Page / Creator", required: true },
  { key: "page_link", label: "Page Link" },
  { key: "platform", label: "Platform" },
  { key: "category", label: "Category" },
  { key: "followers", label: "Followers" },
  { key: "deliverable_type", label: "Deliverable Type" },
  { key: "quantity", label: "No. of Deliverables" },
  { key: "rate", label: "Rate (per deliverable)" },
  { key: "total_cost", label: "Total Cost" },
  { key: "deliverable_date", label: "Date" },
  { key: "live_link", label: "Live Link" },
  { key: "notes", label: "Notes" },
] as const;
export type FieldKey = typeof FIELDS[number]["key"];

// Header text → field. Order matters: specific patterns first, and each column
// is claimed once — so "PAGE LINK" becomes page_link before "Page Name" is
// considered for handle_name, and "Total Cost" is never also taken as Rate.
const MATCHERS: [FieldKey, RegExp][] = [
  // Must name a link: "No. Of Deliverables" contains "live", and "Go Live
  // Date" is a date — both were wrongly claimed by a looser pattern.
  ["live_link", /\blive\s*(post\s*)?(link|url)|post\s*(link|url)|content\s*(link|url)|published\s*(link|url)/i],
  ["page_link", /page\s*link|profile|handle\s*link|account\s*link|^link$|^url$|channel\s*link/i],
  ["rate", /rate|unit\s*cost|cost\s*per|price\s*per|per\s*(post|unit|deliverable)/i],
  ["total_cost", /total\s*cost|amount|net\s*cost|^cost|^price|budget|gross|payout/i],
  ["quantity", /\bqty\b|quantity|no\.?\s*of|#\s*of|count|units|\bnos\b/i],
  ["followers", /follower|subscriber|\bsubs\b|audience|fans?\b|connections/i],
  ["deliverable_type", /deliverable|format|content\s*type|^type$|asset|post\s*type/i],
  ["platform", /platform|medium|network/i],
  ["category", /categor|genre|niche|vertical/i],
  ["deliverable_date", /date|go[\s-]*live|schedule|publish/i],
  ["notes", /note|remark|comment/i],
  ["handle_name", /page|handle|creator|influencer|account|name|channel/i],
];

const OVERVIEW_SHEET = /overview|summary|cover|index|instructions?/i;
const SUMMARY_LABEL = /total|expected|reach|engagement|impression|budget|deliverable|pages|creators|views/i;

export interface ParsedItem {
  handle_name: string;
  page_link?: string;
  platform?: string;
  category?: string;
  followers?: number;
  deliverable_type?: string;
  quantity: number;
  rate?: number;
  total_cost?: number;
  deliverable_date?: string;
  live_link?: string;
  notes?: string;
  /** Tab the row came from */
  sheet: string;
  /** Set when an earlier row already has this page */
  duplicateOf?: number;
}

export interface ParsedSheet {
  name: string;
  /** Headers as written, in column order */
  headers: string[];
  rows: unknown[][];
  isItems: boolean;
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
  /** Label → value pairs pulled from an overview tab, e.g. "Expected Reach" → "8M+" */
  summary: Record<string, string>;
  /** Every distinct header across line-item tabs, for the mapping UI */
  headerUnion: string[];
}

export const norm = (h: unknown) => String(h ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** "₹1,50,000", "1.5L", "2 Cr", "45K", "13.7K", "1.2M" → number */
export function parseAmount(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const raw = String(v).trim().toLowerCase().replace(/[₹,\s+]|rs\.?|inr/g, "");
  if (!raw) return undefined;
  const m = raw.match(/^(-?\d*\.?\d+)(cr|crore|crores|l|lac|lacs|lakh|lakhs|k|m|mn)?$/);
  if (!m) {
    const n = parseFloat(raw.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  const n = parseFloat(m[1]);
  const unit = m[2];
  if (!unit) return n;
  if (unit.startsWith("c")) return n * 1_00_00_000;
  if (unit.startsWith("l")) return n * 1_00_000;
  if (unit === "k") return n * 1_000;
  return n * 1_000_000;
}

function parseDate(v: unknown): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/**
 * Plans sometimes have two URLs pasted into one cell. Prefer the one whose
 * handle best matches the page name; otherwise the last one.
 */
export function cleanLink(v: unknown, pageName: string): string | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  const urls = s.match(/https?:\/\/.*?(?=https?:\/\/|\s|$)/gi);
  if (!urls || urls.length === 0) return /^[\w.-]+\.[a-z]{2,}\//i.test(s) ? `https://${s}` : undefined;
  if (urls.length === 1) return urls[0];
  const want = pageName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const handle = (u: string) => (u.split("?")[0].replace(/\/+$/, "").split("/").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const scored = urls.map(u => {
    const h = handle(u);
    let score = 0;
    for (let i = 0; i < Math.min(h.length, want.length); i++) if (h[i] === want[i]) score++; else break;
    return { u, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].u : urls[urls.length - 1];
}

/** Identity for duplicate detection: the profile path, else the name */
function pageKey(link: string | undefined, name: string): string {
  if (link) {
    try {
      const u = new URL(link);
      return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "")).toLowerCase();
    } catch { /* fall through */ }
  }
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function platformFrom(link: string | undefined, sheet: string, explicit?: string): string | undefined {
  if (explicit) return explicit.trim().toLowerCase();
  const host = (() => { try { return link ? new URL(link).hostname : ""; } catch { return ""; } })();
  const probe = `${host} ${sheet}`.toLowerCase();
  if (/instagram|instagr\.am/.test(probe)) return "instagram";
  if (/linkedin/.test(probe)) return "linkedin";
  if (/youtube|youtu\.be/.test(probe)) return "youtube";
  if (/twitter|x\.com/.test(probe)) return "x";
  if (/reddit/.test(probe)) return "reddit";
  if (/facebook|fb\.com/.test(probe)) return "facebook";
  if (/substack|newsletter/.test(probe)) return "newsletter";
  return undefined;
}

export function autoMap(headers: string[]): Partial<Record<FieldKey, string>> {
  const map: Partial<Record<FieldKey, string>> = {};
  const taken = new Set<string>();
  for (const [field, re] of MATCHERS) {
    if (map[field]) continue;
    const h = headers.find(x => x && !taken.has(norm(x)) && re.test(x.trim()));
    if (h) { map[field] = norm(h); taken.add(norm(h)); }
  }
  return map;
}

function findHeaderRow(rows: unknown[][]): number {
  let best = 0, bestScore = -1;
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const cells = (rows[r] || []).map(c => String(c ?? "").trim());
    const score = cells.filter(c => c && MATCHERS.some(([, re]) => re.test(c))).length;
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

export function readWorkbook(data: ArrayBuffer): ParsedWorkbook {
  const wb = XLSX.read(data, { type: "array" });
  const sheets: ParsedSheet[] = [];
  const summary: Record<string, string> = {};
  const union: string[] = [];

  for (const name of wb.SheetNames) {
    const all = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false, defval: "" });
    if (all.length === 0) continue;
    const h = findHeaderRow(all);
    const headers = (all[h] || []).map(c => String(c ?? "").trim());
    const hasNameColumn = Boolean(autoMap(headers).handle_name);
    const isItems = hasNameColumn && !OVERVIEW_SHEET.test(name);

    if (!isItems) {
      // Pull "label … value" pairs out of overview tabs
      for (const row of all) {
        const label = String(row[0] ?? "").trim();
        if (!label || !SUMMARY_LABEL.test(label)) continue;
        const value = row.slice(1).map(c => String(c ?? "").trim()).find(Boolean);
        if (value) summary[label.replace(/\s+/g, " ")] = value;
      }
    } else {
      for (const hd of headers) if (hd && !union.some(u => norm(u) === norm(hd))) union.push(hd);
    }
    sheets.push({ name: name.trim(), headers, rows: all.slice(h + 1), isItems });
  }
  return { sheets, summary, headerUnion: union };
}

/**
 * Turn the selected tabs into line items using a header-text mapping, so one
 * correction applies to every tab that uses the same column name.
 */
export function buildItems(
  wb: ParsedWorkbook,
  mapping: Partial<Record<FieldKey, string>>,
  includeSheets: Set<string>,
): ParsedItem[] {
  const out: ParsedItem[] = [];
  const seen = new Map<string, number>();

  for (const sheet of wb.sheets) {
    if (!sheet.isItems || !includeSheets.has(sheet.name)) continue;
    const idx: Partial<Record<FieldKey, number>> = {};
    for (const f of FIELDS) {
      const want = mapping[f.key];
      if (!want) continue;
      const i = sheet.headers.findIndex(h => norm(h) === want);
      if (i >= 0) idx[f.key] = i;
    }
    if (idx.handle_name === undefined) continue;

    const col = (row: unknown[], f: FieldKey) => idx[f] === undefined ? undefined : row[idx[f]!];
    const text = (row: unknown[], f: FieldKey) => {
      const v = String(col(row, f) ?? "").trim();
      return v || undefined;
    };

    for (const row of sheet.rows) {
      const name = String(col(row, "handle_name") ?? "").trim();
      // Blank rows, and the totals/summary lines plans tend to end with
      if (!name || /^(grand\s*)?total|^sub\s*total|^summary/i.test(name)) continue;

      const qty = parseAmount(col(row, "quantity")) || 1;
      let rate = parseAmount(col(row, "rate"));
      let total = parseAmount(col(row, "total_cost"));
      if (total === undefined && rate !== undefined) total = rate * qty;
      if (rate === undefined && total !== undefined) rate = total / qty;

      const page_link = cleanLink(col(row, "page_link"), name);
      const item: ParsedItem = {
        handle_name: name,
        page_link,
        platform: platformFrom(page_link, sheet.name, text(row, "platform")),
        // A category column wins; otherwise the tab is the category
        category: text(row, "category") || sheet.name,
        followers: parseAmount(col(row, "followers")),
        deliverable_type: text(row, "deliverable_type"),
        quantity: Math.max(1, Math.round(qty)),
        rate, total_cost: total,
        deliverable_date: parseDate(col(row, "deliverable_date")),
        live_link: cleanLink(col(row, "live_link"), name),
        notes: text(row, "notes"),
        sheet: sheet.name,
      };

      const key = pageKey(page_link, name);
      if (seen.has(key)) item.duplicateOf = seen.get(key);
      else seen.set(key, out.length);
      out.push(item);
    }
  }
  return out;
}
