// A redemption whose reply never arrived may already be charged. Keeping its request key
// in this tab's sessionStorage lets a refresh retry the same request, so the server
// replays the earlier receipt instead of charging a second time.
const NAME = "waste-bank:pending-redeem";
// Short on purpose: a key left behind must not turn a later, deliberate redemption of the
// same reward into a replay of an old one.
const MAX_AGE_MS = 30 * 60 * 1000;

const storage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export function loadPendingKey(signature, now = Date.now(), store = storage()) {
  try {
    const saved = JSON.parse(store?.getItem(NAME) || "null");
    if (
      saved?.signature === signature &&
      typeof saved.key === "string" &&
      now - saved.at >= 0 &&
      now - saved.at < MAX_AGE_MS
    )
      return saved.key;
  } catch {
    /* unreadable storage means no pending request */
  }
  return null;
}

export function savePendingKey(
  signature,
  key,
  now = Date.now(),
  store = storage(),
) {
  try {
    store?.setItem(NAME, JSON.stringify({ signature, key, at: now }));
  } catch {
    /* private mode: fall back to the in-memory key */
  }
}

export function clearPendingKey(store = storage()) {
  try {
    store?.removeItem(NAME);
  } catch {
    /* nothing to clear */
  }
}
