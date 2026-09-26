import { hash } from "../server/credentials.js";
import { runtime } from "./runtime.mjs";
import { audit } from "../server/monitor.js";
import { emptyState } from "../server/state.js";
// PIN is read from the environment, never a command argument or log output.
const [command, id, name] = process.argv.slice(2);
if (
  !["create", "reset", "disable", "enable"].includes(command) ||
  !/^[a-zA-Z0-9._-]{3,80}$/.test(id || "")
)
  throw Error(
    "Usage: npm run staff -- create|reset|disable|enable ACCOUNT [NAME]",
  );
if (
  ["create", "reset"].includes(command) &&
  (!process.env.STAFF_PIN || !/^\d{8,12}$/.test(process.env.STAFF_PIN))
)
  throw Error("Set STAFF_PIN to 8–12 digits in the environment");
const { store } = runtime();
try {
  if (store.initialize) await store.initialize(emptyState());
  const pin = ["create", "reset"].includes(command)
    ? hash(process.env.STAFF_PIN)
    : undefined;
  await store.transact(
    (s) => {
      let account = s.staff.find((x) => x.id === id);
      if (command === "create") {
        if (account) throw Error("Account already exists");
        if (!name || name.length > 80)
          throw Error("Provide a staff display name");
        account = { id, name, enabled: true, authVersion: 0, pin };
        s.staff.push(account);
      } else {
        if (!account) throw Error("Account not found");
        account.authVersion = (account.authVersion || 0) + 1;
        if (pin) account.pin = pin;
        if (command === "disable") account.enabled = false;
        if (command === "enable") account.enabled = true;
      }
      if (!s.staff.some((x) => x.enabled !== false))
        throw Error("Cannot disable the last active staff account");
    },
    { staff: {} },
  );
  await audit(store, "staff:" + command, { id: "operator" }, id);
  console.log(
    "Staff account updated. Existing sessions for changed accounts are invalidated.",
  );
} finally {
  store.close?.();
}
