import { after } from "next/server";
import { sbInsert } from "../supabase/rest";

export function schedule(task: () => Promise<unknown>) {
  const safe = () => task().catch(() => undefined);

  try {
    after(safe);
  } catch {
    void safe();
  }
}

export function logRequest(deviceId: string, url: string, platform: string) {
  schedule(() =>
    sbInsert("requests", {
      device_id: deviceId,
      url: url.slice(0, 500),
      platform,
    })
  );
}
