import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Yahoo Finance chart API (no key) for everything except CSI 300,
// which Yahoo has no history for — Eastmoney kline instead — and GDP,
// which comes from the World Bank API (annual, nominal US$).
// Falls back per-symbol to the bundled JSON in public/data when the
// live fetch fails, so the page always renders something.
const SERIES: {
  key: string;
  symbol: string;
  name: string;
  currency: string;
  source: "yahoo" | "eastmoney" | "worldbank";
}[] = [
  { key: "sp500", symbol: "^GSPC", name: "标普500", currency: "USD", source: "yahoo" },
  { key: "nasdaq", symbol: "^IXIC", name: "纳斯达克", currency: "USD", source: "yahoo" },
  { key: "dow", symbol: "^DJI", name: "道琼斯", currency: "USD", source: "yahoo" },
  { key: "nikkei", symbol: "^N225", name: "日经225", currency: "JPY", source: "yahoo" },
  { key: "hsi", symbol: "^HSI", name: "恒生指数", currency: "HKD", source: "yahoo" },
  { key: "sse", symbol: "000001.SS", name: "上证指数", currency: "CNY", source: "yahoo" },
  { key: "csi300", symbol: "000300", name: "沪深300", currency: "CNY", source: "eastmoney" },
  { key: "gold", symbol: "GC=F", name: "黄金期货", currency: "USD", source: "yahoo" },
  { key: "silver", symbol: "SI=F", name: "白银期货", currency: "USD", source: "yahoo" },
  { key: "copper", symbol: "HG=F", name: "铜期货", currency: "USD", source: "yahoo" },
  { key: "dxy", symbol: "DX-Y.NYB", name: "美元指数", currency: "USD", source: "yahoo" },
  { key: "usdcny", symbol: "CNY=X", name: "美元/人民币", currency: "CNY", source: "yahoo" },
  { key: "usdjpy", symbol: "JPY=X", name: "美元/日元", currency: "JPY", source: "yahoo" },
  { key: "cnyjpy", symbol: "CNYJPY=X", name: "人民币/日元", currency: "JPY", source: "yahoo" },
  { key: "eurusd", symbol: "EURUSD=X", name: "欧元/美元", currency: "USD", source: "yahoo" },
  { key: "gbpusd", symbol: "GBPUSD=X", name: "英镑/美元", currency: "USD", source: "yahoo" },
  { key: "usdhkd", symbol: "HKD=X", name: "美元/港币", currency: "HKD", source: "yahoo" },
  // annual nominal GDP, World Bank NY.GDP.MKTP.CD, current US$
  { key: "gdp_usa", symbol: "USA", name: "美国GDP", currency: "USD", source: "worldbank" },
  { key: "gdp_chn", symbol: "CHN", name: "中国GDP", currency: "USD", source: "worldbank" },
  { key: "gdp_jpn", symbol: "JPN", name: "日本GDP", currency: "USD", source: "worldbank" },
  { key: "gdp_deu", symbol: "DEU", name: "德国GDP", currency: "USD", source: "worldbank" },
  { key: "gdp_ind", symbol: "IND", name: "印度GDP", currency: "USD", source: "worldbank" },
  { key: "gdp_gbr", symbol: "GBR", name: "英国GDP", currency: "USD", source: "worldbank" },
  { key: "gdp_fra", symbol: "FRA", name: "法国GDP", currency: "USD", source: "worldbank" },
  { key: "gdp_ita", symbol: "ITA", name: "意大利GDP", currency: "USD", source: "worldbank" },
  { key: "gdp_can", symbol: "CAN", name: "加拿大GDP", currency: "USD", source: "worldbank" },
  { key: "gdp_bra", symbol: "BRA", name: "巴西GDP", currency: "USD", source: "worldbank" },
  { key: "gdp_wld", symbol: "WLD", name: "全球GDP", currency: "USD", source: "worldbank" },
];

const START = "1996-11-10";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const CACHE_TTL = 6 * 3600 * 1000;
let cache: { at: number; data: unknown } | null = null;
let refreshing = false;

// Slim rows for the wire: the chart only plots date + close.
// Full OHLCV stays in the bundled files and the live fetch; only the
// response is slimmed (13.3MB -> ~4MB).
function slim(rows: { date: string; close: number | null }[]) {
  return rows.map((r) => ({ date: r.date, close: r.close }));
}

async function buildData() {
  const series: Record<string, unknown> = {};
  const stale: string[] = [];
  await Promise.all(
    SERIES.map(async (s) => {
      try {
        const rows =
          s.source === "eastmoney"
            ? await fetchCsi300()
            : s.source === "worldbank"
              ? await fetchWorldBank(s.symbol)
              : await fetchYahoo(s.symbol);
        series[s.key] = {
          key: s.key,
          symbol: s.symbol,
          name: s.name,
          currency: s.currency,
          rows: slim(rows),
        };
      } catch {
        stale.push(s.key);
        const b = bundled(s.key);
        series[s.key] = { ...b, rows: slim(b.rows) };
      }
    })
  );
  let events: unknown[] = [];
  try {
    const p = path.join(process.cwd(), "public", "data", "events.json");
    events = JSON.parse(fs.readFileSync(p, "utf-8")).events;
  } catch {
    events = [];
  }
  return {
    series,
    events,
    updatedAt: new Date().toISOString(),
    stale,
    range: { start: START, end: new Date().toISOString().slice(0, 10) },
  };
}

async function refreshCache() {
  const data = await buildData();
  cache = { at: Date.now(), data };
  return data;
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }
  if (cache) {
    // Stale: answer immediately with the old data and refresh behind it,
    // so no visitor ever waits on a full upstream refresh.
    if (!refreshing) {
      refreshing = true;
      refreshCache()
        .catch(() => {})
        .finally(() => {
          refreshing = false;
        });
    }
    return NextResponse.json(cache.data);
  }
  const data = await refreshCache();
  return NextResponse.json(data);
}

async function fetchJson(url: string, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function bundled(key: string) {
  const p = path.join(process.cwd(), "public", "data", `${key}.json`);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

async function fetchYahoo(symbol: string) {
  const p1 = Math.floor(new Date(`${START}T00:00:00Z`).getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  let lastErr: unknown = null;
  for (const host of hosts) {
    try {
      const d = await fetchJson(
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d`
      );
      const res = d.chart.result[0];
      const ts: number[] = res.timestamp;
      const q = res.indicators.quote[0];
      const rows = [];
      for (let i = 0; i < ts.length; i++) {
        if (q.close[i] == null) continue;
        rows.push({
          date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
          open: q.open[i],
          high: q.high[i],
          low: q.low[i],
          close: q.close[i],
          volume: q.volume[i],
        });
      }
      return rows;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("yahoo fetch failed");
}

async function fetchCsi300() {
  const end = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const d = await fetchJson(
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000300&klt=101&fqt=1&beg=19961110&end=${end}&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56,f57`
  );
  const rows = [];
  for (const k of d.data.klines as string[]) {
    const [dt, o, c, h, l, v] = k.split(",");
    rows.push({
      date: dt,
      open: parseFloat(o),
      high: parseFloat(h),
      low: parseFloat(l),
      close: parseFloat(c),
      volume: parseInt(v, 10),
    });
  }
  return rows;
}

async function fetchWorldBank(code: string) {
  const d = await fetchJson(
    `https://api.worldbank.org/v2/country/${code}/indicator/NY.GDP.MKTP.CD?format=json&date=1996:2025&per_page=100`
  );
  const rows = [];
  for (const item of d[1] || []) {
    if (item?.value == null) continue;
    const v = item.value as number;
    rows.push({
      date: `${item.date}-12-31`,
      open: v,
      high: v,
      low: v,
      close: v,
      volume: null,
    });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return rows;
}
