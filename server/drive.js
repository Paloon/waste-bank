import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/drive";
const validId = (value) => /^[A-Za-z0-9_-]{10,}$/.test(value || "");

export function createDrive(
  directory,
  {
    secretStore = null,
    controlStore = null,
    stateSecret = process.env.SESSION_SECRET,
  } = {},
) {
  const FOLDERS = {
    evidence: process.env.DRIVE_EVIDENCE_FOLDER_ID,
    waste: process.env.DRIVE_WASTE_FOLDER_ID,
    rewards: process.env.DRIVE_REWARDS_FOLDER_ID,
  };
  const file = join(directory, "drive-oauth.json");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const configured = Boolean(
    clientId && clientSecret && Object.values(FOLDERS).every(validId),
  );
  let token =
    !secretStore && existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : null;
  const redirectUri = `${(process.env.PUBLIC_BASE_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/$/, "")}/api/drive/callback`;
  const sign = (value) =>
    createHmac("sha256", stateSecret || "local-drive")
      .update(value)
      .digest("base64url");
  async function loadToken() {
    if (secretStore) token = await secretStore.getSecret("drive_oauth");
    return token;
  }
  async function saveToken() {
    if (secretStore) await secretStore.setSecret("drive_oauth", token);
    else {
      writeFileSync(file, JSON.stringify(token), { mode: 0o600 });
      chmodSync(file, 0o600);
    }
  }

  async function authUrl(staffId, sessionKey) {
    if (!configured) throw new Error("ยังไม่ได้ตั้งค่า Google Drive ใน .env");
    const payload = Buffer.from(
      JSON.stringify({
        staffId,
        expires: Date.now() + 10 * 60_000,
        nonce: randomBytes(16).toString("hex"),
      }),
    ).toString("base64url");
    const state = payload + "." + sign(payload);
    if (controlStore) {
      const account = (await controlStore.read({ staff: { ids: [staffId] } }))
        .staff[0];
      if (!account || account.enabled === false)
        throw new Error("บัญชีเจ้าหน้าที่ไม่พร้อมใช้งาน");
      await controlStore.control("put", {
        id: "oauth:" + state,
        value: {
          staffId,
          sessionKey,
          authVersion: account.authVersion || 0,
          expires: Date.now() + 10 * 60_000,
        },
      });
    }
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();
    return url.toString();
  }

  async function exchange(code, state, sessionKey) {
    const [payload, signature] = state.split(".");
    const expected = payload && sign(payload);
    if (
      !expected ||
      !signature ||
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ||
      !code
    )
      throw new Error("คำขอเชื่อมต่อหมดอายุหรือไม่ถูกต้อง");
    const attempt = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (attempt.expires < Date.now())
      throw new Error("คำขอเชื่อมต่อหมดอายุหรือไม่ถูกต้อง");
    if (controlStore) {
      const saved = await controlStore.control("consume", {
        id: "oauth:" + state,
      });
      if (!saved || saved.sessionKey !== sessionKey)
        throw new Error(
          "กรุณาเริ่มเชื่อม Google Drive ใหม่จากบัญชีเจ้าหน้าที่",
        );
      const staff = (
        await controlStore.read({ staff: { ids: [saved.staffId] } })
      ).staff[0];
      if (
        !staff ||
        staff.enabled === false ||
        (staff.authVersion || 0) !== saved.authVersion
      )
        throw new Error("บัญชีเจ้าหน้าที่ไม่พร้อมใช้งาน");
    }
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const body = await response.json();
    if (!response.ok || !body.refresh_token)
      throw new Error(
        "Google ไม่ส่ง refresh token กรุณายกเลิกสิทธิ์แอปเดิมแล้วเชื่อมใหม่",
      );
    const nextToken = {
      refresh_token: body.refresh_token,
      access_token: body.access_token,
      expires_at: Date.now() + body.expires_in * 1000,
    };
    // Validate the new account before publishing credentials to other instances.
    await verifyFolders(nextToken.access_token);
    token = nextToken;
    await saveToken();
    return attempt.staffId;
  }

  async function accessToken() {
    const current = await loadToken();
    if (!configured || !current?.refresh_token)
      throw new Error("ยังไม่ได้เชื่อมบัญชี Google Drive");
    if (current.access_token && current.expires_at > Date.now() + 60_000)
      return current.access_token;
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: current.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error("สิทธิ์ Google Drive ใช้ไม่ได้ กรุณาเชื่อมบัญชีใหม่");
    const refreshed = {
      ...current,
      access_token: body.access_token,
      expires_at: Date.now() + body.expires_in * 1000,
    };
    if (secretStore) {
      await secretStore.refreshDriveToken(current.refresh_token, refreshed);
    } else if (token?.refresh_token === current.refresh_token) {
      token = refreshed;
      await saveToken();
    }
    return refreshed.access_token;
  }

  async function driveFetch(url, options = {}, accessOverride) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessOverride || (await accessToken())}`,
      },
    });
    if (!response.ok)
      throw new Error(`Google Drive ตอบกลับ ${response.status}`);
    return response;
  }

  async function verifyFolders(accessOverride) {
    for (const [kind, id] of Object.entries(FOLDERS)) {
      const response = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,parents,permissions(type,role)&supportsAllDrives=true`,
        {},
        accessOverride,
      );
      const folder = await response.json();
      if (folder.mimeType !== "application/vnd.google-apps.folder")
        throw new Error(`${kind} ไม่ใช่โฟลเดอร์ Google Drive`);
      if (
        folder.permissions?.some(
          (p) => p.type === "anyone" || p.type === "domain",
        )
      )
        throw new Error("โฟลเดอร์รูปต้องไม่แชร์สาธารณะหรือทั้งโดเมน");
    }
  }

  async function allocateId() {
    const response = await driveFetch(
      "https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files",
    );
    const body = await response.json();
    if (!validId(body.ids?.[0])) throw new Error("สร้างรหัสรูปไม่สำเร็จ");
    return body.ids[0];
  }
  async function upload(kind, dataUri, filename, reservedId) {
    const match =
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
        dataUri || "",
      );
    if (!match) throw new Error("รูปภาพไม่ถูกต้อง");
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 400 * 1024) throw new Error("รูปภาพต้องไม่เกิน 400 KiB");
    const boundary = "wb" + randomBytes(12).toString("hex");
    const metadata = {
      name: filename,
      mimeType: match[1],
      parents: [FOLDERS[kind]],
      appProperties: { application: "waste-bank" },
      ...(reservedId ? { id: reservedId } : {}),
    };
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${match[1]}\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const response = await driveFetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true",
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    const result = await response.json();
    if (!validId(result.id)) throw new Error("Google Drive ไม่ส่งรหัสรูปภาพ");
    return result.id;
  }

  async function download(id) {
    if (!validId(id)) throw new Error("รหัสรูปภาพไม่ถูกต้อง");
    return driveFetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
    );
  }

  async function moveToWaste(id) {
    if (!validId(id)) throw new Error("รหัสรูปภาพไม่ถูกต้อง");
    const response = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${id}?fields=parents&supportsAllDrives=true`,
    );
    const file = await response.json();
    if (!file.parents?.includes(FOLDERS.evidence)) return;
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${id}`);
    url.search = new URLSearchParams({
      addParents: FOLDERS.waste,
      removeParents: FOLDERS.evidence,
      fields: "id,parents",
      supportsAllDrives: "true",
    }).toString();
    await driveFetch(url, { method: "PATCH" });
  }

  async function remove(id) {
    if (!validId(id)) return;
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true`,
      {
        method: "DELETE",
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${await accessToken()}` },
      },
    );
    if (!response.ok && response.status !== 404)
      throw new Error(`Google Drive ตอบกลับ ${response.status}`);
  }

  return {
    storageInfo: async () => {
      const r = await driveFetch(
        "https://www.googleapis.com/drive/v3/about?fields=storageQuota",
      );
      return (await r.json()).storageQuota;
    },
    configured,
    connected: async () =>
      configured && Boolean((await loadToken())?.refresh_token),
    authUrl,
    exchange,
    verifyFolders,
    allocateId,
    upload,
    download,
    moveToWaste,
    remove,
  };
}
