/* Consistent Recharts styling for SeedSathi.
 *
 * Every chart in the app uses these wrappers so axes, tooltips, grids and
 * colours match. Charts are responsive and readable on small screens.
 */
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart, ReferenceArea,
} from "recharts";
import type { TrendPoint } from "../lib/types";
import { categoryLabel, formatDateTime, formatNumber } from "../lib/format";

/* Brand palette shared by all charts. */
export const CHART_COLORS = [
  "#2d6840", // forest
  "#93ad90", // sage
  "#f0b429", // gold
  "#7d705b", // earth
  "#61a071", // forest light
  "#c25f3c", // clay
  "#3d6f96", // info blue
  "#b6c9b2", // sage light
];

const AXIS_STYLE = { fontSize: 11, fill: "#7d705b" } as const;

function TooltipCard({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-earth-200 bg-white px-3 py-2 shadow-lg">
      {label && (
        <p className="mb-1 text-[11px] font-semibold text-earth-700">
          {typeof label === "string" && label.includes("T") ? formatDateTime(label) : label}
        </p>
      )}
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-[11.5px] text-earth-600">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}: <strong>{formatNumber(entry.value, 1)}</strong>
          {unit ?? entry.unit ?? ""}
        </p>
      ))}
    </div>
  );
}

/** Network temperature + humidity trend (dual axis, 24h by default). */
export function TrendChart({
  data, height = 260, showLegend = true,
}: { data: TrendPoint[]; height?: number; showLegend?: boolean }) {
  const formatted = data.map((d) => ({
    ...d,
    label: formatDateTime(d.time),
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c25f3c" stopOpacity={0.16} />
            <stop offset="100%" stopColor="#c25f3c" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradHum" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2d6840" stopOpacity={0.16} />
            <stop offset="100%" stopColor="#2d6840" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e0d2" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: "#ddd6c8" }}
          minTickGap={42} />
        <YAxis yAxisId="temp" tick={AXIS_STYLE} tickLine={false} axisLine={false}
          width={44} label={{ value: "°C", position: "insideTopLeft", offset: 10, style: AXIS_STYLE }} />
        <YAxis yAxisId="hum" orientation="right" tick={AXIS_STYLE} tickLine={false} axisLine={false}
          width={44} domain={[0, 100]} label={{ value: "%RH", position: "insideTopRight", offset: 10, style: AXIS_STYLE }} />
        <Tooltip content={<TooltipCard />} />
        {showLegend && (
          <Legend wrapperStyle={{ fontSize: 11.5, color: "#635744" }} iconType="circle" iconSize={8} />
        )}
        <Area yAxisId="temp" type="monotone" dataKey="temperature_c" name="Temperature (°C)"
          stroke="#c25f3c" strokeWidth={2} fill="url(#gradTemp)" dot={false} />
        <Area yAxisId="hum" type="monotone" dataKey="humidity_pct" name="Humidity (%RH)"
          stroke="#2d6840" strokeWidth={2} fill="url(#gradHum)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Single-metric line chart with an optional threshold band. */
export function ThresholdLineChart({
  data, metric, min, max, height = 220,
}: {
  data: { time: string; value: number }[];
  metric: string;
  min?: number;
  max?: number;
  height?: number;
}) {
  const formatted = data.map((d) => ({ ...d, label: formatDateTime(d.time) }));
  const color = metric === "humidity" ? "#2d6840" : "#c25f3c";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={formatted} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e0d2" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: "#ddd6c8" }}
          minTickGap={40} />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={44}
          domain={["auto", "auto"]} />
        <Tooltip content={<TooltipCard unit={metric === "humidity" ? "%" : "°C"} />} />
        {min !== undefined && max !== undefined && (
          <ReferenceArea
            y1={min}
            y2={max}
            stroke={color}
            strokeOpacity={0.25}
            strokeDasharray="4 4"
            fill={color}
            fillOpacity={0.05}
            label={{ value: "configured range", position: "insideTopRight", style: AXIS_STYLE }}
          />
        )}
        <Line type="monotone" dataKey="value" name={metric === "humidity" ? "Humidity" : "Temperature"}
          stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal/vertical bar chart for categorical comparisons. */
export function SimpleBarChart({
  data, dataKey, nameKey = "category", height = 260, color = "#2d6840", horizontal = false,
  formatter = (v: number) => formatNumber(v, 1),
}: {
  data: any[];
  dataKey: string;
  nameKey?: string;
  height?: number;
  color?: string;
  horizontal?: boolean;
  formatter?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 12, left: horizontal ? 8 : -18, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e0d2" vertical={false} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: "#ddd6c8" }} />
            <YAxis type="category" dataKey={nameKey} tick={AXIS_STYLE} tickLine={false}
              axisLine={false} width={110}
              tickFormatter={(v: string) => categoryLabel(v)} />
          </>
        ) : (
          <>
            <XAxis dataKey={nameKey} tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: "#ddd6c8" }}
              tickFormatter={(v: string) => categoryLabel(v)} interval={0} angle={-18}
              textAnchor="end" height={54} />
            <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={44} />
          </>
        )}
        <Tooltip content={<TooltipCard />} cursor={{ fill: "rgba(147,194,160,0.12)" }} />
        <Bar dataKey={dataKey} name={nameKey === "category" ? "Quantity" : "Value"}
          fill={color} radius={[4, 4, 0, 0]} maxBarSize={52} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut/pie for distributions (categories, statuses). */
export function SimplePieChart({
  data, height = 240, nameKey = "name", valueKey = "value",
}: { data: { name: string; value: number }[]; height?: number; nameKey?: string; valueKey?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius={54}
          outerRadius={86}
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<TooltipCard />} />
        <Legend wrapperStyle={{ fontSize: 11.5, color: "#635744" }} iconType="circle" iconSize={8} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Simple stacked/grouped bar for statuses. */
export function StatusBarChart({
  data, height = 220, color = "#2d6840",
}: { data: { status: string; count: number }[]; height?: number; color?: string }) {
  const shaped = data.map((d) => ({ ...d, label: d.status }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={shaped} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e0d2" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: "#ddd6c8" }}
          tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)} />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
        <Tooltip content={<TooltipCard />} cursor={{ fill: "rgba(147,194,160,0.12)" }} />
        <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {shaped.map((entry, i) => (
            <Cell
              key={i}
              fill={
                entry.status === "received" || entry.status === "resolved"
                  ? "#2d6840"
                  : entry.status === "rejected"
                    ? "#c25f3c"
                    : entry.status === "dispatched"
                      ? "#3d6f96"
                      : entry.status === "approved"
                        ? "#93ad90"
                        : "#f0b429"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Compact sparkline used in summary cards. */
export function Sparkline({
  data, color = "#2d6840", height = 40,
}: { data: number[]; color?: string; height?: number }) {
  const shaped = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={shaped} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export { CartesianGrid, Line, Bar as BarPrimitive, Area as AreaPrimitive };
