import { LOCATION_TIMER_MS, type LocationTimer } from '../types';

export function startTimer(now: number, durationMs = LOCATION_TIMER_MS): LocationTimer {
  return { mode: 'running', deadline: now + durationMs };
}

export function remainingMs(timer: LocationTimer, now: number): number {
  const value = timer.mode === 'running' ? timer.deadline - now : timer.remainingMs;
  return Math.max(0, Math.min(LOCATION_TIMER_MS, value));
}

export function pauseTimer(timer: LocationTimer, now: number): LocationTimer {
  if (timer.mode === 'paused') return timer;
  return { mode: 'paused', remainingMs: remainingMs(timer, now), pausedAt: now };
}

export function resumeTimer(timer: LocationTimer, now: number): LocationTimer {
  if (timer.mode === 'running') return timer;
  return { mode: 'running', deadline: now + timer.remainingMs };
}

/**
 * 재실행 복원용. 정지 상태로 저장됐어도 앱이 꺼져 있던 시간은 경과로 반영한다.
 */
export function restoreTimer(timer: LocationTimer, now: number): LocationTimer {
  if (timer.mode === 'running') return timer;
  const elapsed = Math.max(0, now - timer.pausedAt);
  return { mode: 'running', deadline: now + Math.max(0, timer.remainingMs - elapsed) };
}
