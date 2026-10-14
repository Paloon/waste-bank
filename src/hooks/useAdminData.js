import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";

const queryKey = (tab, page, query) =>
  "admin?" + new URLSearchParams({ tab, page, q: query });

/** One owner for admin reads. A new tab/search cancels its previous read. */
export function useAdminData({
  enabled,
  tab,
  page,
  query,
  epoch,
  setData,
  setError,
}) {
  const [resolved, setResolved] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);
  const controller = useRef(null);
  const wanted = `${epoch.current}:${queryKey(tab, page, query)}`;
  const refresh = useCallback(
    async (target, offset, search) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      const request = ++latest.current;
      const account = epoch.current;
      const key = queryKey(target, offset, search);
      setLoading(true);
      setFailed(false);
      setError("");
      try {
        const value = await api(key, undefined, { signal: current.signal });
        if (request === latest.current && account === epoch.current) {
          setData(value);
          setResolved(`${account}:${key}`);
        }
        return value;
      } catch (error) {
        if (
          !error.cancelled &&
          request === latest.current &&
          account === epoch.current
        ) {
          setError(error.message);
          setFailed(true);
        }
        throw error;
      } finally {
        if (request === latest.current) {
          setLoading(false);
          controller.current = null;
        }
      }
    },
    [epoch, setData, setError],
  );

  useEffect(() => {
    if (!enabled) {
      controller.current?.abort();
      return;
    }
    if (resolved === wanted) return;
    const timer = setTimeout(() => {
      refresh(tab, page, query).catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.current?.abort();
    };
  }, [enabled, tab, page, query, wanted, resolved, refresh]);

  useEffect(() => () => controller.current?.abort(), []);
  return {
    refresh,
    ready: resolved === wanted,
    loading: enabled && (loading || (!failed && resolved !== wanted)),
    failed,
  };
}
