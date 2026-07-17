import { useEffect, useRef } from "react";
import * as echarts from "echarts";

import type { ChartSeries, SeriesPoint } from "../types";

interface TimeseriesChartProps {
  topic: string;
  points?: SeriesPoint[];
  series?: ChartSeries[];
}

const SERIES_COLORS = ["#0e7490", "#7c3aed", "#dc2626", "#2563eb", "#ca8a04", "#16a34a"];

export function TimeseriesChart({ topic, points = [], series }: TimeseriesChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartSeries = series ?? [{ key: topic, label: topic, points }];

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    const chart = echarts.init(chartRef.current);
    const units = Array.from(new Set(chartSeries.map((item) => item.unit || "valor")));
    const yAxes = units.map((unit, index) => ({
      type: "value",
      name: unit === "valor" ? "" : unit,
      position: index === 0 ? "left" : "right",
      offset: index > 1 ? (index - 1) * 54 : 0,
      min: unit === "%" ? 0 : undefined,
      max: unit === "%" ? 100 : undefined,
      axisLine: { lineStyle: { color: "#94a3b8" } },
      splitLine: { show: index === 0, lineStyle: { color: "#e2e8f0" } },
      axisLabel: {
        color: "#64748b",
        formatter: unit === "%" ? "{value}%" : "{value}",
        margin: 10,
      },
      nameTextStyle: {
        color: "#64748b",
      },
    }));

    chart.setOption({
      backgroundColor: "transparent",
      animation: true,
      tooltip: {
        trigger: "axis",
      },
      legend: {
        top: 12,
        right: 18,
        type: "scroll",
        textStyle: {
          color: "#334155",
        },
      },
      grid: {
        left: 12,
        right: Math.max(16, (units.length - 1) * 58 + 18),
        top: 72,
        bottom: 72,
        containLabel: true,
      },
      title: {
        text: topic,
        left: 18,
        top: 12,
        textStyle: {
          color: "#172033",
          fontSize: 16,
          fontWeight: 600,
        },
      },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: "#94a3b8" } },
        axisLabel: {
          color: "#64748b",
          hideOverlap: true,
          margin: 12,
        },
      },
      dataZoom: [
        { type: "inside" },
        { type: "slider", height: 22, bottom: 12 },
      ],
      series: chartSeries.map((item, index) => {
        const color = SERIES_COLORS[index % SERIES_COLORS.length];
        return {
          name: item.label,
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: {
            width: 2,
            color,
          },
          yAxisIndex: units.indexOf(item.unit || "valor"),
          data: item.points.map((point) => [point.ts, point.value]),
        };
      }),
      yAxis: yAxes,
    });

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [chartSeries, topic]);

  return <div className="chart" ref={chartRef} />;
}
