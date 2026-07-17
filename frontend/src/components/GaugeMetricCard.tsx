import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";

import type { OverviewMetric } from "../types";

interface GaugeMetricCardProps {
  metric: OverviewMetric;
  title: string;
  theme?: "light" | "dark";
}

const GAUGE_LIMITS: Record<string, { min: number; max: number; decimals: number }> = {
  temperature_c: { min: 0, max: 50, decimals: 1 },
  humidity_pct: { min: 0, max: 100, decimals: 1 },
  co2_ppm: { min: 0, max: 2000, decimals: 0 },
  light_lux: { min: 0, max: 10000, decimals: 0 },
  power_w: { min: 0, max: 2000, decimals: 0 },
  voltage_v: { min: 180, max: 260, decimals: 0 },
  current_a: { min: 0, max: 20, decimals: 2 },
  energy_wh: { min: 0, max: 2000, decimals: 0 },
  energy_kwh: { min: 0, max: 10, decimals: 2 },
  power_factor: { min: 0, max: 1, decimals: 2 },
  frequency_hz: { min: 45, max: 55, decimals: 1 },
};

function numericValue(value: OverviewMetric["value"]) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function gaugeLimits(metricName: string, value: number | null) {
  const configured = GAUGE_LIMITS[metricName];
  if (configured) {
    if (value !== null && value > configured.max) {
      return {
        ...configured,
        max: Math.ceil(value * 1.2),
      };
    }
    return configured;
  }

  const max = value !== null && value > 0 ? Math.ceil(value * 1.2) : 100;
  return { min: 0, max, decimals: 1 };
}

function metricColor(metricName: string) {
  if (metricName.includes("temperature")) return "#dc2626";
  if (metricName.includes("humidity")) return "#2563eb";
  if (metricName.includes("co2")) return "#7c3aed";
  if (metricName.includes("light")) return "#ca8a04";
  if (metricName.includes("voltage")) return "#0e7490";
  if (metricName.includes("current")) return "#ea580c";
  if (metricName.includes("energy") || metricName.includes("power")) return "#16a34a";
  return "#0f766e";
}

function formatValue(value: number | null, unit?: string | null, decimals = 1) {
  if (value === null) {
    return "Sin dato";
  }
  return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
}

export function GaugeMetricCard({ metric, title, theme = "light" }: GaugeMetricCardProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const value = numericValue(metric.value);
  const limits = useMemo(() => gaugeLimits(metric.metric_name, value), [metric.metric_name, value]);
  const color = metricColor(metric.metric_name);
  const textColor = theme === "dark" ? "#f8fafc" : "#111827";
  const axisColor = theme === "dark" ? "#334155" : "#e2e8f0";

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    const chart = echarts.init(chartRef.current);
    chart.setOption({
      backgroundColor: "transparent",
      series: [
        {
          type: "gauge",
          min: limits.min,
          max: limits.max,
          startAngle: 210,
          endAngle: -30,
          radius: "96%",
          progress: {
            show: value !== null,
            width: 10,
            roundCap: true,
            itemStyle: {
              color,
            },
          },
          axisLine: {
            roundCap: true,
            lineStyle: {
              width: 10,
              color: [[1, axisColor]],
            },
          },
          pointer: {
            show: false,
          },
          axisTick: {
            show: false,
          },
          splitLine: {
            show: false,
          },
          axisLabel: {
            show: false,
          },
          anchor: {
            show: false,
          },
          detail: {
            valueAnimation: true,
            offsetCenter: [0, "6%"],
            color: textColor,
            fontSize: 17,
            fontWeight: 700,
            formatter: () => formatValue(value, metric.unit, limits.decimals),
          },
          title: {
            show: false,
          },
          data: [{ value: value ?? limits.min }],
        },
      ],
    });

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [axisColor, color, limits.decimals, limits.max, limits.min, metric.unit, textColor, value]);

  return (
    <article className="gauge-card">
      <div className="gauge-card-header">
        <strong>{title}</strong>
        <span>{metric.source_model ?? "Fuente sin declarar"}</span>
      </div>
      <div className="gauge-chart" ref={chartRef} />
    </article>
  );
}
