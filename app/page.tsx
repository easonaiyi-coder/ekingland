"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// API returns slim rows: date + close only (the chart plots close).
type Row = {
  date: string;
  close: number | null;
};

type Series = {
  key: string;
  symbol: string;
  name: string;
  currency: string;
  rows: Row[];
};

type MarketEvent = {
  date: string;
  category: string;
  title: string;
  note: string;
  source: string;
};

type MarketData = {
  series: Record<string, Series>;
  events: MarketEvent[];
  updatedAt: string;
  stale: string[];
};

const OVERLAY: { key: string; color: string }[] = [
  { key: "sp500", color: "#2563eb" },
  { key: "nasdaq", color: "#7c3aed" },
  { key: "dow", color: "#0891b2" },
  { key: "nikkei", color: "#db2777" },
  { key: "hsi", color: "#ea580c" },
  { key: "sse", color: "#16a34a" },
  { key: "csi300", color: "#65a30d" },
  { key: "gold", color: "#ca8a04" },
  { key: "dxy", color: "#dc2626" },
  { key: "usdcny", color: "#0d9488" },
  { key: "usdjpy", color: "#4f46e5" },
  { key: "cnyjpy", color: "#9333ea" },
  { key: "eurusd", color: "#f59e0b" },
  { key: "gbpusd", color: "#0ea5e9" },
  { key: "usdhkd", color: "#a3e635" },
  { key: "gdp_usa", color: "#0e7490" },
  { key: "gdp_chn", color: "#b91c1c" },
  { key: "gdp_jpn", color: "#a16207" },
  { key: "gdp_deu", color: "#4d7c0f" },
  { key: "gdp_ind", color: "#9d174d" },
  { key: "gdp_gbr", color: "#1e40af" },
  { key: "gdp_fra", color: "#6d28d9" },
  { key: "gdp_ita", color: "#0f766e" },
  { key: "gdp_can", color: "#b45309" },
  { key: "gdp_bra", color: "#15803d" },
  { key: "gdp_wld", color: "#111827" },
];

const CATEGORIES: { id: string; label: string; keys: string[] }[] = [
  {
    id: "stocks",
    label: "股市",
    keys: ["sp500", "nasdaq", "dow", "nikkei", "hsi", "sse", "csi300"],
  },
  {
    id: "fx",
    label: "外汇",
    keys: ["usdcny", "usdjpy", "cnyjpy", "eurusd", "gbpusd", "usdhkd", "dxy"],
  },
  { id: "metals", label: "贵金属", keys: ["gold"] },
  {
    id: "gdp",
    label: "GDP",
    keys: [
      "gdp_usa",
      "gdp_chn",
      "gdp_jpn",
      "gdp_deu",
      "gdp_ind",
      "gdp_gbr",
      "gdp_fra",
      "gdp_ita",
      "gdp_can",
      "gdp_bra",
      "gdp_wld",
    ],
  },
];

// auto-categorize: anything not listed above falls into 其他
function categoryOf(key: string): string {
  const c = CATEGORIES.find((c) => c.keys.includes(key));
  return c ? c.id : "other";
}

const GRANULARITIES = [
  { id: "day", label: "日" },
  { id: "week", label: "周" },
  { id: "month", label: "月" },
  { id: "quarter", label: "季" },
  { id: "year", label: "年" },
] as const;
type Granularity = (typeof GRANULARITIES)[number]["id"];

// period key for aggregation: day = the date itself, week = ISO week,
// month = YYYY-MM, quarter = YYYY-Qn, year = YYYY.
function periodKey(date: string, g: Granularity): string {
  const [y, m, d] = date.split("-").map(Number);
  if (g === "month") return `${y}-${String(m).padStart(2, "0")}`;
  if (g === "quarter") return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  if (g === "year") return `${y}`;
  if (g === "week") {
    const dt = new Date(Date.UTC(y, m - 1, d));
    const day = (dt.getUTCDay() + 6) % 7; // Mon=0
    dt.setUTCDate(dt.getUTCDate() - day + 3); // Thursday of this week
    const thuYear = dt.getUTCFullYear();
    const jan1 = new Date(Date.UTC(thuYear, 0, 1));
    const week = Math.ceil(((dt.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
    return `${thuYear}-W${String(week).padStart(2, "0")}`;
  }
  return date;
}

// Aggregate daily rows to period-end rows (last close of each period).
// Rows must be sorted ascending by date.
function resampleRows<T extends { date: string }>(rows: T[], g: Granularity): T[] {
  if (g === "day") return rows;
  const out: T[] = [];
  let curKey = "";
  for (const r of rows) {
    const k = periodKey(r.date, g);
    if (k !== curKey) {
      out.push(r);
      curKey = k;
    } else {
      out[out.length - 1] = r;
    }
  }
  return out;
}

const RANGES = [
  { label: "1个月", days: 22 },
  { label: "3个月", days: 66 },
  { label: "6个月", days: 132 },
  { label: "1年", days: 252 },
  { label: "3年", days: 756 },
  { label: "10年", days: 2520 },
  { label: "30年", days: 7560 },
];

const DOT_CATEGORIES = new Set(["election", "fed", "war", "policy"]);

const CATEGORY_LABEL: Record<string, string> = {
  election: "选举",
  fed: "美联储",
  cpi: "CPI",
  nfp: "非农",
  war: "战争",
  policy: "政策",
  pandemic: "疫情",
};

const CATEGORY_COLOR: Record<string, string> = {
  election: "#dc2626",
  fed: "#2563eb",
  cpi: "#64748b",
  nfp: "#64748b",
  war: "#ea580c",
  policy: "#7c3aed",
  pandemic: "#0891b2",
};

function buildNormalized(
  data: MarketData,
  keys: { key: string; color: string }[],
  days: number,
  granularity: Granularity
) {
  const sliced: Record<string, { date: string; value: number }[]> = {};
  const dates = new Set<string>();
  // The window is defined by the daily series: their last `days` rows.
  // Annual series (GDP: 30 rows) must NOT be sliced by row count — that
  // would keep their whole 30-year history inside a 1-year view and blow
  // up the y-axis. Filter every series by the window's calendar start
  // date instead, and normalize to the first value inside the window.
  const DAILY_MIN_ROWS = 252; // GDP has 30 rows; every daily series has 4700+
  let windowStart = "";
  for (const { key } of keys) {
    const s = data.series[key];
    if (!s) continue;
    const rows = s.rows.filter((r) => r.close != null);
    if (rows.length <= DAILY_MIN_ROWS) continue;
    const first = rows.slice(-days)[0]?.date;
    if (first && (!windowStart || first < windowStart)) windowStart = first;
  }
  for (const { key } of keys) {
    const s = data.series[key];
    if (!s) continue;
    const inWindow = s.rows.filter(
      (r) => r.close != null && (!windowStart || r.date >= windowStart)
    );
    const rows = resampleRows(inWindow, granularity);
    if (!rows.length) continue;
    const base = rows[0].close as number;
    sliced[key] = rows.map((r) => ({
      date: r.date,
      value: ((r.close as number) / base) * 100,
    }));
    rows.forEach((r) => dates.add(r.date));
  }
  const sortedDates = [...dates].sort();
  const byDate: Record<string, Record<string, number>> = {};
  for (const [key, pts] of Object.entries(sliced)) {
    for (const p of pts) {
      (byDate[p.date] ||= {})[key] = p.value;
    }
  }
  const merged = sortedDates.map((date) => ({ date, ...byDate[date] }));
  return {
    merged,
    firstDate: sortedDates[0],
    lastDate: sortedDates[sortedDates.length - 1],
  };
}

function OverlayTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-slate-700">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.stroke }}
          />
          <span className="w-20 text-slate-500">{p.name}</span>
          <span className="ml-auto font-mono font-medium text-slate-800">
            {p.value != null ? p.value.toFixed(1) : "--"}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Page() {
  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Log scale by default; the toggle also shows the normal linear axis.
  const [logScale, setLogScale] = useState(true);
  const [progress, setProgress] = useState<{
    loaded: number;
    total: number | null;
    phase: string;
  } | null>(null);
  const [rangeIdx, setRangeIdx] = useState(6);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [selectedEvent, setSelectedEvent] = useState<MarketEvent | null>(null);
  const [showEvents, setShowEvents] = useState(true);
  // recharts measures its container in the browser; rendering the chart
  // on the server produces different markup and a hydration mismatch,
  // so the chart section only renders after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [visibleCats, setVisibleCats] = useState<Set<string>>(
    new Set(["stocks", "fx", "metals", "gdp", "other"])
  );

  // categories actually present (其他 only shows when something is uncategorized)
  const presentCats = useMemo(() => {
    const ids = new Set(OVERLAY.map((o) => categoryOf(o.key)));
    const list = CATEGORIES.filter((c) => ids.has(c.id));
    if (ids.has("other")) list.push({ id: "other", label: "其他", keys: [] });
    return list;
  }, []);

  const visibleKeys = useMemo(
    () => OVERLAY.filter((o) => visibleCats.has(categoryOf(o.key))),
    [visibleCats]
  );

  function toggleCat(id: string) {
    setVisibleCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Streaming fetch with real progress (bytes received vs content-length
  // when the server sends one), a 90s timeout, and a retry on failure.
  async function loadData() {
    setError(null);
    setProgress({ loaded: 0, total: null, phase: "正在下载数据" });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
      const r = await fetch("/api/market", { signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const total = Number(r.headers.get("content-length")) || null;
      const reader = r.body?.getReader();
      if (!reader) {
        const d = (await r.json()) as MarketData;
        setData(d);
        setProgress(null);
        return;
      }
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.length;
          setProgress({ loaded, total, phase: "正在下载数据" });
        }
      }
      setProgress({ loaded, total, phase: "正在解析数据" });
      const buf = new Uint8Array(loaded);
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.length;
      }
      const d = JSON.parse(new TextDecoder().decode(buf)) as MarketData;
      setData(d);
      setProgress(null);
    } catch (e: any) {
      if (e?.name === "AbortError") setError("加载超时（90秒），请重试。");
      else setError(String(e?.message || e));
      setProgress(null);
    } finally {
      clearTimeout(timer);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const days = RANGES[rangeIdx].days;

  const overlay = useMemo(
    () => (data ? buildNormalized(data, OVERLAY, days, granularity) : null),
    [data, days, granularity]
  );

  const visibleEvents = useMemo(() => {
    if (!data || !overlay) return [];
    return data.events.filter(
      (e) => e.date >= overlay.firstDate && e.date <= overlay.lastDate
    );
  }, [data, overlay]);

  const dotEvents = useMemo(
    () => visibleEvents.filter((e) => DOT_CATEGORIES.has(e.category)),
    [visibleEvents]
  );

  // dot y position: highest normalized value on the nearest trading day
  const dotY = useMemo(() => {
    if (!overlay) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const e of dotEvents) {
      let row = overlay.merged.find((r) => r.date >= e.date);
      if (!row) row = overlay.merged[overlay.merged.length - 1];
      if (!row) continue;
      let max = -Infinity;
      for (const { key } of visibleKeys) {
        const v = (row as any)[key];
        if (typeof v === "number") max = Math.max(max, v);
      }
      if (max !== -Infinity) m.set(e.date, max);
    }
    return m;
  }, [overlay, dotEvents, visibleKeys]);

  const lastDate = overlay?.lastDate ?? "";

  return (
    <main className="min-h-screen bg-[#f3f5f8] text-slate-900">
      <div className="mx-auto max-w-[1400px] px-4 py-5">
        {/* header */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div>
            <h1 className="text-xl font-bold tracking-tight">全球市场看板</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {GRANULARITIES.find((g) => g.id === granularity)?.label}线 · 每日更新
              {lastDate ? ` · 数据截至 ${lastDate}` : ""}
              {data?.stale?.length
                ? ` · 部分品种为缓存数据（${data.stale.join(", ")}）`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">粒度</span>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {GRANULARITIES.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGranularity(g.id)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      g.id === granularity
                        ? "bg-slate-900 text-white shadow"
                        : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">纵轴</span>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  onClick={() => setLogScale(true)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    logScale
                      ? "bg-slate-900 text-white shadow"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  对数
                </button>
                <button
                  onClick={() => setLogScale(false)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    !logScale
                      ? "bg-slate-900 text-white shadow"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  线性
                </button>
              </div>
            </div>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {RANGES.map((r, i) => (
                <button
                  key={r.label}
                  onClick={() => setRangeIdx(i)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    i === rangeIdx
                      ? "bg-slate-900 text-white shadow"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
            数据加载失败：{error}
            <button
              onClick={loadData}
              className="ml-2 rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              重试
            </button>
          </div>
        )}
        {!data && !error && (
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-16 text-center text-sm text-slate-500">
            <div className="mx-auto max-w-sm">
              <div className="mb-2 font-medium text-slate-700">
                {progress ? progress.phase : "正在加载数据…"}
                {progress?.total
                  ? ` ${Math.round((progress.loaded / progress.total) * 100)}%`
                  : ""}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-slate-900 transition-all ${
                    progress?.total ? "" : "animate-pulse"
                  }`}
                  style={{
                    width: progress?.total
                      ? `${Math.min(100, (progress.loaded / progress.total) * 100)}%`
                      : "100%",
                  }}
                />
              </div>
              <div className="mt-2 text-xs text-slate-400">
                {progress
                  ? `已下载 ${(progress.loaded / 1048576).toFixed(1)} MB${
                      progress.total
                        ? ` / ${(progress.total / 1048576).toFixed(1)} MB`
                        : ""
                    }`
                  : "正在连接…"}
              </div>
            </div>
          </div>
        )}

        {mounted && data && overlay && (
          <>
            {/* overlay chart */}
            <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  全球市场全品种走势叠加对比（归一化，起点=100）
                </h2>
                <button
                  onClick={() => setShowEvents((v) => !v)}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  {showEvents ? "隐藏事件" : "事件列表"}
                </button>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                <span className="text-slate-500">显示：</span>
                {presentCats.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-1.5 text-slate-600"
                  >
                    <input
                      type="checkbox"
                      checked={visibleCats.has(c.id)}
                      onChange={() => toggleCat(c.id)}
                      className="h-3.5 w-3.5 accent-slate-900"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {visibleKeys
                  .filter(({ key }) =>
                    overlay.merged.some((r) => typeof (r as any)[key] === "number")
                  )
                  .map(({ key, color }) => (
                    <span key={key} className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: color }}
                      />
                      {data.series[key]?.name ?? key}
                    </span>
                  ))}
              </div>
              <div className="h-[380px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={overlay.merged} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#e8ecf1" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickFormatter={(d: string) =>
                        granularity === "day" || granularity === "week"
                          ? d.slice(5)
                          : d.slice(0, 7)
                      }
                      minTickGap={40}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      domain={["auto", "auto"]}
                      scale={logScale ? "log" : "linear"}
                      width={52}
                    />
                    <Tooltip content={<OverlayTooltip />} />
                    {visibleKeys.map(({ key, color }) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={data.series[key]?.name ?? key}
                        stroke={color}
                        strokeWidth={1.6}
                        dot={false}
                        connectNulls
                      />
                    ))}
                    {showEvents &&
                      dotEvents.map((e) => {
                        const y = dotY.get(e.date);
                        if (y == null) return null;
                        const row = overlay.merged.find((r) => r.date >= e.date);
                        if (!row) return null;
                        return (
                          <ReferenceDot
                            key={e.date + e.title}
                            x={row.date}
                            y={y}
                            r={4}
                            fill="#f59e0b"
                            stroke="#fff"
                            strokeWidth={1.5}
                          />
                        );
                      })}
                    {selectedEvent && (
                      <ReferenceLine
                        x={
                          overlay.merged.find((r) => r.date >= selectedEvent.date)?.date ??
                          selectedEvent.date
                        }
                        stroke="#f59e0b"
                        strokeDasharray="5 4"
                        strokeWidth={2}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* selected event detail */}
              {selectedEvent && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                      style={{ background: CATEGORY_COLOR[selectedEvent.category] ?? "#64748b" }}
                    >
                      {CATEGORY_LABEL[selectedEvent.category] ?? selectedEvent.category}
                    </span>
                    <span className="font-mono text-xs text-slate-500">{selectedEvent.date}</span>
                    <span className="font-semibold">{selectedEvent.title}</span>
                    <button
                      onClick={() => setSelectedEvent(null)}
                      className="ml-auto text-xs text-slate-400 hover:text-slate-600"
                    >
                      关闭
                    </button>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{selectedEvent.note}</p>
                </div>
              )}

              {/* event strip */}
              {showEvents && visibleEvents.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <div className="mb-2 text-xs font-medium text-slate-500">
                    区间重大事件轴（{visibleEvents.length} 件）
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {visibleEvents.map((e) => (
                      <button
                        key={e.date + e.title}
                        onClick={() => setSelectedEvent(e)}
                        className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${
                          selectedEvent?.date === e.date && selectedEvent?.title === e.title
                            ? "border-amber-400 bg-amber-50 font-semibold text-amber-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-amber-300"
                        }`}
                      >
                        {e.date.slice(5)} {e.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <p className="mt-4 text-center text-xs text-slate-400">
              行情来自公开接口（Yahoo Finance / 东财），日线，每日收盘后更新；GDP 为世界银行年度名义美元值（1996–2025）。图表可按日/周/月/季/年聚合显示。仅供参考，不构成投资建议。
            </p>
          </>
        )}
      </div>
    </main>
  );
}
