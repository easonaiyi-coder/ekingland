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

type Row = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
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
];

const FX_CARDS = [
  "usdcny",
  "usdjpy",
  "cnyjpy",
  "eurusd",
  "gbpusd",
  "usdhkd",
  "gold",
  "dxy",
];

const DECIMALS: Record<string, number> = {
  sp500: 2,
  nasdaq: 2,
  dow: 2,
  nikkei: 2,
  hsi: 2,
  sse: 2,
  csi300: 2,
  gold: 1,
  dxy: 2,
  usdcny: 4,
  usdjpy: 2,
  cnyjpy: 2,
  eurusd: 4,
  gbpusd: 4,
  usdhkd: 4,
};

const RANGES = [
  { label: "1个月", days: 22 },
  { label: "3个月", days: 66 },
  { label: "6个月", days: 132 },
  { label: "1年", days: 252 },
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

function fmt(n: number | null | undefined, decimals: number) {
  if (n == null || Number.isNaN(n)) return "--";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function changePct(rows: Row[]) {
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1].close;
  const prev = rows[rows.length - 2].close;
  if (last == null || prev == null || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}

function Change({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-slate-400">--</span>;
  const up = pct >= 0;
  return (
    <span className={up ? "text-red-600" : "text-green-600"}>
      {up ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
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
  const [rangeIdx, setRangeIdx] = useState(3);
  const [selectedEvent, setSelectedEvent] = useState<MarketEvent | null>(null);
  const [showEvents, setShowEvents] = useState(true);

  useEffect(() => {
    fetch("/api/market")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e.message || e)));
  }, []);

  const days = RANGES[rangeIdx].days;

  const overlay = useMemo(() => {
    if (!data) return null;
    // slice each overlay series to the selected range, normalize to 100
    const sliced: Record<string, { date: string; value: number }[]> = {};
    const dates = new Set<string>();
    for (const { key } of OVERLAY) {
      const s = data.series[key];
      if (!s) continue;
      const rows = s.rows.filter((r) => r.close != null).slice(-days);
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
    return { merged, firstDate: sortedDates[0], lastDate: sortedDates[sortedDates.length - 1] };
  }, [data, days]);

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
      for (const { key } of OVERLAY) {
        const v = (row as any)[key];
        if (typeof v === "number") max = Math.max(max, v);
      }
      if (max !== -Infinity) m.set(e.date, max);
    }
    return m;
  }, [overlay, dotEvents]);

  const fxData = useMemo(() => {
    if (!data) return [];
    return FX_CARDS.map((key) => {
      const s = data.series[key];
      if (!s) return null;
      const rows = s.rows.filter((r) => r.close != null).slice(-days);
      return { key, series: s, rows, pct: changePct(rows) };
    }).filter(Boolean) as { key: string; series: Series; rows: Row[]; pct: number | null }[];
  }, [data, days]);

  const lastDate = overlay?.lastDate ?? "";

  return (
    <main className="min-h-screen bg-[#f3f5f8] text-slate-900">
      <div className="mx-auto max-w-[1400px] px-4 py-5">
        {/* header */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div>
            <h1 className="text-xl font-bold tracking-tight">全球市场看板</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              日线 · 每日更新
              {lastDate ? ` · 数据截至 ${lastDate}` : ""}
              {data?.stale?.length
                ? ` · 部分品种为缓存数据（${data.stale.join(", ")}）`
                : ""}
            </p>
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

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
            数据加载失败：{error}。请刷新页面重试。
          </div>
        )}
        {!data && !error && (
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-16 text-center text-sm text-slate-500">
            数据加载中…
          </div>
        )}

        {data && overlay && (
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
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {OVERLAY.map(({ key, color }) => (
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
                      tickFormatter={(d: string) => d.slice(5)}
                      minTickGap={40}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      domain={["auto", "auto"]}
                      width={44}
                    />
                    <Tooltip content={<OverlayTooltip />} />
                    {OVERLAY.map(({ key, color }) => (
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

            {/* FX + gold line charts */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold">汇率与黄金</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {fxData.map(({ key, series, rows, pct }) => {
                  const last = rows[rows.length - 1];
                  const dec = DECIMALS[key] ?? 2;
                  return (
                    <div
                      key={key}
                      className="rounded-lg border border-slate-200 bg-white p-4"
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-medium">{series.name}</span>
                        <span className="text-xs">
                          <Change pct={pct} />
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-lg font-semibold tabular-nums">
                        {fmt(last?.close, dec)}
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          {series.currency}
                        </span>
                      </div>
                      <div className="mt-2 h-[110px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={rows.map((r) => ({ date: r.date, close: r.close }))}
                            margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
                          >
                            <XAxis dataKey="date" hide />
                            <YAxis hide domain={["auto", "auto"]} />
                            <Tooltip
                              content={({ active, payload, label }: any) => {
                                if (!active || !payload?.length) return null;
                                return (
                                  <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs shadow">
                                    <span className="text-slate-500">{label} </span>
                                    <span className="font-mono font-medium">
                                      {fmt(payload[0].value, dec)}
                                    </span>
                                  </div>
                                );
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="close"
                              stroke={
                                OVERLAY.find((o) => o.key === key)?.color ?? "#2563eb"
                              }
                              strokeWidth={1.8}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {rows[0]?.date} 至 {last?.date}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <p className="mt-4 text-center text-xs text-slate-400">
              数据来自公开行情接口（Yahoo Finance / 东财），日线，每日收盘后更新；仅供参考，不构成投资建议。
            </p>
          </>
        )}
      </div>
    </main>
  );
}
