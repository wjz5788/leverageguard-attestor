import { useEffect, useState } from "react";

type PolicyOrder = {
  txHash?: string | null;
  coverageStart?: string;
  coverageEnd?: string;
};

type StatusInfo = {
  label: string;
  countdown?: string;
  tone: "pending" | "active" | "expired";
};

function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return "00:00:00";

  const totalSec = Math.floor(msLeft / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function computeStatus(order: PolicyOrder): StatusInfo {
  if (!order.txHash) {
    return { label: "待上链", tone: "pending" };
  }

  const now = Date.now();
  const startMs = order.coverageStart ? new Date(order.coverageStart).getTime() : NaN;
  const endMs = order.coverageEnd ? new Date(order.coverageEnd).getTime() : NaN;

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { label: "已承保", tone: "active" };
  }

  if (now >= endMs) {
    return { label: "已到期", tone: "expired" };
  }

  if (now < startMs) {
    return {
      label: "待生效",
      tone: "pending",
      countdown: formatCountdown(startMs - now),
    };
  }

  return {
    label: "生效中",
    tone: "active",
    countdown: formatCountdown(endMs - now),
  };
}

export function PolicyStatusTag({ order }: { order: PolicyOrder }) {
  const [status, setStatus] = useState<StatusInfo>(() => computeStatus(order));

  useEffect(() => {
    const tick = () => setStatus(computeStatus(order));
    tick();

    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [order.txHash, order.coverageStart, order.coverageEnd]);

  const baseClass =
    "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium";

  const toneClass =
    status.tone === "pending"
      ? "bg-yellow-100 text-yellow-800"
      : status.tone === "active"
      ? "bg-green-100 text-green-800"
      : "bg-gray-100 text-gray-500";

  return (
    <span className={`${baseClass} ${toneClass}`}>
      {status.label}
      {status.countdown ? ` · T-${status.countdown}` : null}
    </span>
  );
}

