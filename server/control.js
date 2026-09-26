// The same deterministic state machine backs SQLite and the PostgreSQL RPC tests.
export function controlValue(op, current, args, now = Date.now()) {
  if (op === "get") return { value: current?.expires > now ? current : null };
  if (op === "put") return { save: args.value, value: args.value };
  if (op === "delete") return { remove: true, value: null };
  if (op === "consume")
    return { remove: true, value: current?.expires > now ? current : null };
  if (op === "rate") {
    const value =
      current?.expires > now
        ? { ...current }
        : { count: 0, expires: now + args.window };
    value.count++;
    return {
      save: value,
      value: {
        allowed: value.count <= args.limit,
        retryAfter: Math.max(1, Math.ceil((value.expires - now) / 1000)),
      },
    };
  }
  if (op === "touch") {
    if (!current || current.expires <= now || current.absolute <= now)
      return { remove: true, value: null };
    const value = {
      ...current,
      expires: Math.min(current.absolute, now + args.idle),
    };
    return { save: value, value };
  }
  throw new Error("Unknown control operation");
}
