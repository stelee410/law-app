import { useEffect, useState } from "react";

export function useSmsCountdown(durationSeconds = 60) {
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (remainingSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [remainingSeconds]);

  return {
    remainingSeconds,
    startCountdown: () => setRemainingSeconds(durationSeconds),
  };
}
