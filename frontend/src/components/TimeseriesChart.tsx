import { useEffect, useRef } from "react";
import * as echarts from "echarts";

import type { SeriesPoint } from "../types";

interface TimeseriesChartProps {
  topic: string;
  title?: string;
  points: SeriesPoint[];
}

export function TimeseriesChart({ topic, title, points }: TimeseriesChartProps) {
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
        text: title ?? topic,
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
        axisLine: { lineStyle: { color: "#c9d1dc" } },
        axisLabel: { color: "#596273" },
      },
      yAxis: {
        type: "value",
        axisLine: { lineStyle: { color: "#c9d1dc" } },
        splitLine: { lineStyle: { color: "#e7ebf0" } },
        axisLabel: { color: "#596273" },
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
            color: "#0f766e",
          },
          areaStyle: {
            color: "rgba(15, 118, 110, 0.14)",
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
  }, [points, title, topic]);

  return <div className="chart" ref={chartRef} />;
}
