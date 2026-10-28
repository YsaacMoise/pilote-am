import { useEffect, useState, useSyncExternalStore } from 'react';
import { getState, nowMinutes, subscribe, todayISO, type AppState } from '../state';

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export interface Clock {
  today: string;
  minutes: number;
}

function readClock(): Clock {
  const d = new Date();
  return { today: todayISO(d), minutes: nowMinutes(d) };
}

/** Heure courante, rafraîchie chaque minute et au retour dans l'app. */
export function useClock(): Clock {
  const [clock, setClock] = useState(readClock);
  useEffect(() => {
    const tick = (): void => {
      const next = readClock();
      setClock((prev) => (prev.today === next.today && prev.minutes === next.minutes ? prev : next));
    };
    const msToNextMinute = 60_000 - (Date.now() % 60_000) + 50;
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      tick();
      interval = setInterval(tick, 60_000);
    }, msToNextMinute);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return clock;
}
