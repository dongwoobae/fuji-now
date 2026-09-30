"use client";

import { useEffect, useState } from "react";
import { formatJstTime, isStale } from "@/lib/view";

export function Freshness({ at, partial }: { at: string | null; partial: boolean }) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  if (partial || at === null) {
    const stale = nowMs !== null && at !== null && isStale(at, nowMs);
    return <span className="freshness warn">일부 확인 전{stale ? " · 확인 지연" : ""}</span>;
  }
  if (nowMs === null) return <span className="freshness">{formatJstTime(at)} 확인</span>;
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(at)) / 60_000));
  const stale = isStale(at, nowMs);
  return (
    <span className={stale ? "freshness warn" : "freshness"}>
      {minutes}분 전 확인{stale ? " · 확인 지연" : ""}
    </span>
  );
}
