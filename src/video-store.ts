import type { Ctx } from "./bot.js";

type EnvContext = Ctx & { env?: { DB?: D1DatabaseLike } };
export interface D1Result { results?: unknown[] }
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}
export interface D1DatabaseLike { prepare(sql: string): D1Statement }

export interface RequestRecord {
  requestId: string;
  userId: number;
  platform: string;
  inputUrl: string;
  output: string;
  status: "success" | "error";
  timestamp: number;
  errorCode?: string;
}

// One clock seam makes retention and abuse windows deterministic in tests.
export const clock = { now: () => Date.now() };

function db(ctx: Ctx): D1DatabaseLike | undefined {
  return (ctx as EnvContext).env?.DB;
}

export async function saveRequest(ctx: Ctx, record: RequestRecord): Promise<void> {
  const database = db(ctx);
  if (!database) return;
  try {
    await database.prepare(
      "CREATE TABLE IF NOT EXISTS video_requests (request_id TEXT PRIMARY KEY, telegram_id INTEGER NOT NULL, platform TEXT NOT NULL, input_url TEXT NOT NULL, output TEXT NOT NULL, status TEXT NOT NULL, timestamp INTEGER NOT NULL, error_code TEXT)",
    ).run();
    await database.prepare(
      "INSERT INTO video_requests (request_id, telegram_id, platform, input_url, output, status, timestamp, error_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(record.requestId, record.userId, record.platform, record.inputUrl, record.output, record.status, record.timestamp, record.errorCode ?? null).run();
    await pruneRequests(ctx, 30 * 24 * 60 * 60 * 1000);
  } catch {
    // A logging outage must never prevent the user from receiving the result.
  }
}

export async function pruneRequests(ctx: Ctx, retentionMs: number): Promise<void> {
  const database = db(ctx);
  if (!database) return;
  try {
    await database.prepare("DELETE FROM video_requests WHERE timestamp < ?").bind(clock.now() - retentionMs).run();
  } catch {
    // The table may not exist yet; its first write creates it.
  }
}

export async function recentRequests(ctx: Ctx, limit = 10): Promise<RequestRecord[]> {
  const database = db(ctx);
  if (!database) return [];
  try {
    const result = await database.prepare(
      "SELECT request_id as requestId, telegram_id as userId, platform, input_url as inputUrl, output, status, timestamp, error_code as errorCode FROM video_requests ORDER BY timestamp DESC LIMIT ?",
    ).bind(Math.max(1, Math.min(50, limit))).all<RequestRecord>();
    return result.results;
  } catch {
    return [];
  }
}

export async function clearRequests(ctx: Ctx): Promise<void> {
  const database = db(ctx);
  if (!database) return;
  try { await database.prepare("DELETE FROM video_requests").run(); } catch { /* absent table */ }
}

export async function deleteUserRequests(ctx: Ctx, userId: number): Promise<void> {
  const database = db(ctx);
  if (!database) return;
  try { await database.prepare("DELETE FROM video_requests WHERE telegram_id = ?").bind(userId).run(); } catch { /* absent table */ }
}

export async function setting(ctx: Ctx, key: string): Promise<string | undefined> {
  const database = db(ctx);
  if (!database) return undefined;
  try {
    const result = await database.prepare("SELECT value FROM video_settings WHERE key = ?").bind(key).all<{ value: string }>();
    return result.results[0]?.value;
  } catch { return undefined; }
}

export async function setSetting(ctx: Ctx, key: string, value: string): Promise<void> {
  const database = db(ctx);
  if (!database) return;
  try {
    await database.prepare("CREATE TABLE IF NOT EXISTS video_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)").run();
    await database.prepare("INSERT INTO video_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value).run();
  } catch { /* best effort settings */ }
}
