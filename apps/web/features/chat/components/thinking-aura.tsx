"use client";

import { useEffect, useState } from "react";

interface ThinkingAuraProps {
  modelName?: string;
  thinkingLevel?: string;
}

export function ThinkingAura({ modelName, thinkingLevel }: ThinkingAuraProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 100) / 10);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full py-5 animate-enter">
      {/* Liquid luminous light beam sliding across */}
      <div className="relative w-full h-[1.5px] bg-white/[0.04] rounded-full overflow-hidden">
        <div className="absolute top-0 left-0 w-2/5 h-full bg-gradient-to-r from-transparent via-indigo-400/90 to-transparent rounded-full animate-liquid-slide shadow-[0_0_10px_rgba(129,140,248,0.5)]" />
      </div>

      <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-neutral-400">
        <span className="text-neutral-300 font-medium">{elapsed.toFixed(1)}s</span>
        {modelName && <span>· {modelName}</span>}
        {thinkingLevel && thinkingLevel !== "none" && <span>· {thinkingLevel} thinking</span>}
      </div>
    </div>
  );
}

