import { createApiClient } from "./api/client.js";

const channel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("waste-bank-session")
    : null;
const client = createApiClient({
  dispatch: (name) => window.dispatchEvent(new Event(name)),
  onAuthChange: () => channel?.postMessage({ changed: true }),
});
if (channel)
  channel.onmessage = () => {
    client.invalidateRequests();
    window.dispatchEvent(new Event("session-replaced"));
  };

export const api = client.api;
export const invalidateRequests = client.invalidateRequests;
