"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { lockVaultAction } from "../actions/lock-vault.action";

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

export function AutoLockGuard({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const lastActivityRef = useRef<number>(0);
  const isLockingRef = useRef<boolean>(false);

  useEffect(() => {
    lastActivityRef.current = Date.now();
    const triggerLock = async () => {
      if (isLockingRef.current) return;
      isLockingRef.current = true;
      try {
        await lockVaultAction();
      } catch {
        router.replace("/");
      }
    };

    const recordActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const checkInactivity = () => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        triggerLock();
      }
    };

    // User interaction events that reset inactivity timer
    const activityEvents = ["pointerdown", "keydown", "touchstart", "wheel", "scroll"];
    activityEvents.forEach((event) => {
      window.addEventListener(event, recordActivity, { passive: true });
    });

    // Check periodically every 15 seconds
    const intervalId = setInterval(checkInactivity, 15000);

    // Also check when tab/window regains focus or visibility
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkInactivity();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, recordActivity);
      });
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [router]);

  return <>{children}</>;
}
