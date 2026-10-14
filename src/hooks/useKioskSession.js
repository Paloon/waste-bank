import { useCallback, useEffect, useRef, useState } from "react";
import { policy } from "../../shared/policy.js";

export const sessionRetryMessage =
  "เชื่อมต่อไม่ได้ ข้อมูลที่กรอกยังอยู่ กรุณาลองอีกครั้งก่อนหมดเวลาใช้งาน";

export default function useKioskSession({
  active,
  accountKey,
  epoch,
  api,
  clear,
  home,
  setError,
  setNotice,
}) {
  const [idleRemaining, setIdleRemaining] = useState(null);
  const lastActivity = useRef(Date.now());
  const current = useRef(null);
  const pending = useRef(null);
  const mounted = useRef(true);
  current.current = {
    active,
    accountKey,
    epoch,
    api,
    clear,
    home,
    setError,
    setNotice,
  };
  const renewSession = useCallback(async () => {
    const state = current.current;
    if (!state.accountKey) return;
    const version = state.epoch.current;
    if (pending.current?.version === version) return pending.current.promise;
    const promise = (async () => {
      try {
        await state.api("session", {});
        if (mounted.current && version === state.epoch.current)
          state.setError((value) =>
            value === sessionRetryMessage ? "" : value,
          );
      } catch (error) {
        if (
          mounted.current &&
          !error.cancelled &&
          version === state.epoch.current
        )
          state.setError(error.retryable ? sessionRetryMessage : error.message);
      } finally {
        if (pending.current?.version === version) pending.current = null;
      }
    })();
    pending.current = { version, promise };
    return promise;
  }, []);
  useEffect(() => {
    mounted.current = true;
    const activity = () => {
      lastActivity.current = Date.now();
    };
    const expired = () => {
      current.current.home();
      current.current.setNotice("หมดเวลาใช้งาน กรุณาระบุตัวตนใหม่");
    };
    const replaced = () => {
      current.current.clear();
      current.current.setNotice("บัญชีถูกเปลี่ยนจากอีกแท็บ กรุณาใช้แท็บล่าสุด");
    };
    const hide = () => {
      // Clear memory before the browser may freeze this document into BFCache.
      current.current.clear();
      navigator.sendBeacon(
        "/api/logout",
        new Blob(["{}"], { type: "application/json" }),
      );
    };
    const show = (event) => {
      if (event.persisted) expired();
    };
    const visible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastActivity.current >= policy.idleMs
      )
        expired();
    };
    const back = () => {
      if (current.current.active) current.current.home();
    };
    const timer = setInterval(() => {
      const remaining = policy.idleMs - (Date.now() - lastActivity.current);
      setIdleRemaining(
        current.current.active && remaining <= policy.warningMs
          ? Math.max(0, Math.ceil(remaining / 1000))
          : null,
      );
      if (current.current.active && remaining <= 0) {
        current.current.home();
        current.current.setNotice(
          "กลับหน้าหลักและล้างข้อมูลแล้ว เนื่องจากไม่มีการใช้งาน",
        );
      }
    }, 1000);
    const events = {
      pointerdown: activity,
      keydown: activity,
      input: activity,
      "session-expired": expired,
      "session-replaced": replaced,
      pagehide: hide,
      pageshow: show,
      popstate: back,
    };
    Object.entries(events).forEach(([name, handler]) =>
      window.addEventListener(name, handler),
    );
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      Object.entries(events).forEach(([name, handler]) =>
        window.removeEventListener(name, handler),
      );
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  useEffect(() => {
    if (!accountKey) return;
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current < policy.heartbeatMs + 1000)
        renewSession();
    }, policy.heartbeatMs);
    return () => clearInterval(timer);
  }, [accountKey, renewSession]);
  return { idleRemaining, setIdleRemaining, lastActivity, renewSession };
}
