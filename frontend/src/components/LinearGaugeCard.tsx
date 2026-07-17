import { useEffect, useRef } from "react";
import * as echarts from "echarts";

interface LinearGaugeCardProps {
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  theme?: "light" | "dark";
}

function numericValue(value: LinearGaugeCardProps["value"]) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatLabel(value: number | null, unit: string) {
  if (value === null) {
    return "Sin dato";
  }
  return `${value.toFixed(Math.abs(value) >= 10 ? 0 : 1)}${unit}`;
}

function outputColor(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("heater")) return "#dc2626";
  if (normalized.includes("cooler")) return "#2563eb";
  if (normalized.includes("humidifier")) return "#0e7490";
  if (normalized.includes("extractor")) return "#7c3aed";
  if (normalized.includes("light")) return "#ca8a04";
  if (normalized.includes("co2")) return "#16a34a";
  return "#0f766e";
}

export function LinearGaugeCard({ label, value, unit = "%", theme = "light" }: LinearGaugeCardProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const numeric = numericValue(value);
  const boundedValue = numeric === null ? 0 : Math.max(0, Math.min(100, numeric));
  const color = outputColor(label);
  const textColor = theme === "dark" ? "#f8fafc" : "#111827";
  const trackColor = theme === "dark" ? "#334155" : "#e2e8f0";

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    const chart = echarts.init(chartRef.current);
    chart.setOption({
      backgroundColor: "transparent",
      grid: {
        left: 0,
        right: 42,
        top: 2,
        bottom: 2,
        containLabel: false,
      },
      xAxis: {
        type: "value",
        min: 0,
        max: 100,
        show: false,
      },
      yAxis: {
        type: "category",
        data: [label],
        show: false,
      },
      series: [
        {
          type: "bar",
          data: [100],
          barWidth: 14,
          barGap: "-100%",
          silent: true,
          itemStyle: {
            color: trackColor,
            borderRadius: 8,
          },
          z: 1,
        },
        {
          type: "bar",
          data: [boundedValue],
          barWidth: 14,
          itemStyle: {
            color,
            borderRadius: 8,
          },
          label: {
            show: true,
            position: "right",
            color: textColor,
            fontWeight: 800,
            formatter: () => formatLabel(numeric, unit),
          },
          z: 2,
        },
      ],
    });

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [boundedValue, color, label, numeric, textColor, trackColor, unit]);

  return (
    <article className="linear-gauge-card">
      <span>{label}</span>
      <div className="linear-gauge-chart" ref={chartRef} />
    </article>
  );
}
