import { useEffect, useState } from "react";
import { api } from "../api.js";

export function useLeaderboard({ active, period, grade, room }) {
  const [result, setResult] = useState({
    key: "",
    rows: [],
    loading: false,
    error: "",
  });
  const key = new URLSearchParams({ period, grade, room }).toString();
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setResult({ key, rows: [], loading: true, error: "" });
    api("leaderboard?" + key, undefined, { signal: controller.signal })
      .then((rows) => setResult({ key, rows, loading: false, error: "" }))
      .catch((error) => {
        if (!error.cancelled)
          setResult({ key, rows: [], loading: false, error: error.message });
      });
    return () => controller.abort();
  }, [active, key]);
  return result.key === key ? result : { rows: [], loading: true, error: "" };
}
