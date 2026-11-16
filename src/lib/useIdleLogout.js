import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

/**
 * HIPAA-style automatic logoff. After `idleMs` without activity the user is signed out.
 * During the last `warnMs` a warning is shown; only an explicit "stay signed in" extends the session.
 */
export function useIdleLogout({ enabled, idleMs, warnMs, onTimeout }) {
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const lastActivity = useRef(Date.now());
  const warningRef = useRef(false);
  const timeoutRef = useRef(onTimeout);
  timeoutRef.current = onTimeout;

  const stay = useCallback(() => {
    lastActivity.current = Date.now();
    warningRef.current = false;
    setWarning(false);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    lastActivity.current = Date.now();
    warningRef.current = false;
    setWarning(false);

    const onActivity = () => {
      if (!warningRef.current) lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));

    const timer = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= idleMs) {
        clearInterval(timer);
        warningRef.current = false;
        setWarning(false);
        timeoutRef.current();
      } else if (idle >= idleMs - warnMs) {
        warningRef.current = true;
        setWarning(true);
        setSecondsLeft(Math.max(0, Math.ceil((idleMs - idle) / 1000)));
      }
    }, 1000);

    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
    };
  }, [enabled, idleMs, warnMs]);

  return { warning, secondsLeft, stay };
}
