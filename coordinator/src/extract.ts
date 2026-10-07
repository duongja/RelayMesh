import type { PriceValue } from "@relaymesh/shared";

/** Pilot merchants (§16.2). Public product pages only. */
export const PILOT_MERCHANTS = new Set([
  "jumia.co.ke",
  "kilimall.co.ke",
  "jiji.co.ke",
  "masoko.co.ke",
]);

export function normalizeHost(host: string): string {
  const h = host.toLowerCase();
  return h.startsWith("www.") ? h.slice(4) : h;
}

function toNum(s: string): number | null {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function availabilityOf(html: string): boolean | null {
  const t = html.toLowerCase();
  if (/out[-\s]?of[-\s]?stock|sold\s?out|unavailable/.test(t)) return false;
  if (/in[-\s]?stock|available|add\s?to\s?cart|buy\s?now/.test(t)) return true;
  return null;
}

/** Adapter 1: schema.org JSON-LD offers — most merchants embed it. */
function fromJsonLd(html: string): PriceValue | null {
  const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const b of blocks) {
    const inner = b.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const docs = JSON.parse(inner);
      const list = Array.isArray(docs) ? docs : [docs];
      for (const d of list) {
        const offers = d?.offers ? (Array.isArray(d.offers) ? d.offers : [d.offers]) : [];
        for (const o of offers) {
          const p = toNum(String(o?.price ?? ""));
          if (p !== null) {
            return { kind: "price", priceKes: p, currency: "KES", availability: availabilityOf(html), range: false, adapter: "json-ld" };
          }
        }
      }
    } catch { /* next block */ }
  }
  return null;
}

/** Adapter 2 (fallback): most frequent KES-denominated figure on the page. */
function generic(html: string): PriceValue | null {
  const re = /(?:KES|KSh|Ksh|KSH|Kshs)\s*([\d][\d,]*)(?:\.00)?/g;
  const counts = new Map<number, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const p = toNum(m[1]);
    if (p !== null && p > 0) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let best = 0, bestN = 0;
  for (const [p, n] of counts) {
    if (n > bestN || (n === bestN && p < best)) { best = p; bestN = n; }
  }
  const range = new RegExp(`(?:KES|KSh)\\s*[\\d,]+\\s*[-–—]\\s*[\\d,]+`).test(html);
  return { kind: "price", priceKes: best, currency: "KES", availability: availabilityOf(html), range, adapter: "generic" };
}

export function extractPrice(html: string, _host: string): PriceValue | null {
  if (!html || html.length < 200) return null;
  return fromJsonLd(html) ?? generic(html);
}
