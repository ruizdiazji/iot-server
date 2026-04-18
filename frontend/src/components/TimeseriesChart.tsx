import { useEffect, useRef } from "react";
import * as echarts from "echarts";

import type { SeriesPoint } from "../types";

interface TimeseriesChartProps {
  topic: string;
  points: SeriesPoint[];
}

export function TimeseriesChart({ topic, points }: TimeseriesChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    const chart = echarts.init(chartRef.current);
    chart.setOption({
      backgroundColor: "transparent",
      animation: true,
      tooltip: {
        trigger: "axis",
      },
      grid: {
        left: 24,
        right: 24,
        top: 50,
        bottom: 42,
      },
      title: {
        text: topic,
        left: 18,
        top: 12,
        textStyle: {
          color: "#eef2ff",
          fontSize: 16,
          fontWeight: 600,
        },
      },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: "#64748b" } },
        axisLabel: { color: "#94a3b8" },
      },
      yAxis: {
        type: "value",
        axisLine: { lineStyle: { color: "#64748b" } },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } },
        axisLabel: { color: "#94a3b8" },
      },
      dataZoom: [
        { type: "inside" },
        { type: "slider", height: 18, bottom: 8 },
      ],
      series: [
        {
          name: topic,
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: {
            width: 2,
            color: "#38bdf8",
          },
          areaStyle: {
            color: "rgba(56, 189, 248, 0.15)",
          },
          data: points.map((point) => [point.ts, point.value]),
        },
      ],
    });

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [points, topic]);

  return <div className="chart" ref={chartRef} />;
}

