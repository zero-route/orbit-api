import { sbSelect, sbUpsert } from "../supabase/rest";

export type DeviceRecord = {
  id: string;
  blocked: boolean;
  blockedReason?: string;
  plan: string;
};

function toRecord(row: Record<string, unknown>): DeviceRecord {
  return {
    id: String(row.id),
    blocked: row.blocked === true,
    blockedReason:
      typeof row.blocked_reason === "string" ? row.blocked_reason : undefined,
    plan: typeof row.plan === "string" ? row.plan : "free",
  };
}

export async function registerDevice(
  id: string,
  meta: { platform?: string; appVersion?: string }
): Promise<DeviceRecord> {
  const rows = await sbUpsert("devices", "id", {
    id,
    last_seen: new Date().toISOString(),
    ...(meta.platform ? { platform: meta.platform } : {}),
    ...(meta.appVersion ? { app_version: meta.appVersion } : {}),
  });

  if (rows.length === 0) {
    return { id, blocked: false, plan: "free" };
  }

  return toRecord(rows[0]);
}

export async function findDevice(id: string): Promise<DeviceRecord | null> {
  const rows = await sbSelect(
    "devices",
    `?id=eq.${encodeURIComponent(id)}&select=id,blocked,blocked_reason,plan&limit=1`
  );

  return rows.length > 0 ? toRecord(rows[0]) : null;
}
