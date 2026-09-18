import type { Context } from "grammy";
import type { Ctx } from "./bot.js";
import { inlineButton, inlineKeyboard, urlButton } from "./toolkit/index.js";
import { adminChatId } from "./toolkit/index.js";
import { clock, saveRequest, setting } from "./video-store.js";

export type Platform = "youtube" | "tiktok" | "instagram" | "facebook";
const labels: Record<Platform, string> = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook" };
const hosts: Record<Platform, RegExp> = {
  youtube: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i,
  tiktok: /(^|\.)tiktok\.com$/i,
  instagram: /(^|\.)instagram\.com$/i,
  facebook: /(^|\.)facebook\.com$|(^|\.)fb\.watch$/i,
};
const paths: Record<Platform, RegExp> = {
  youtube: /\/watch(?:$|\/)|\/shorts\//i,
  tiktok: /\/(@[^/]+\/)?video\//i,
  instagram: /\/(reel|p|tv)\//i,
  facebook: /\/(watch|reel|videos)\//i,
};
const platformPrompt = (platform: Platform) => `أرسل رابط الفيديو من ${labels[platform]}`;
const retryKeyboard = (platform: Platform) => inlineKeyboard([[inlineButton("Retry", `platform:${platform}`), inlineButton("Change platform", "menu:main")]]);

export async function choosePlatform(ctx: Ctx, platform: Platform): Promise<void> {
  await ctx.answerCallbackQuery();
  if ((await setting(ctx, `enabled:${platform}`)) === "off") {
    await ctx.reply(`${labels[platform]} is temporarily unavailable. Try another platform.`);
    return;
  }
  ctx.session.platform = platform;
  ctx.session.selectedAt = clock.now();
  ctx.session.failureCount = 0;
  await ctx.reply(platformPrompt(platform), { reply_markup: { force_reply: true, input_field_placeholder: "Paste the video link…" } });
}

function validUrl(platform: Platform, raw: string): URL | undefined {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || !hosts[platform].test(url.hostname)) return undefined;
    if (platform === "youtube" && url.hostname.endsWith("youtu.be")) return url.pathname.length > 1 ? url : undefined;
    if (platform === "facebook" && url.hostname.endsWith("fb.watch")) return url.pathname.length > 1 ? url : undefined;
    if (platform === "tiktok" && url.hostname.startsWith("vm.")) return url.pathname.length > 1 ? url : undefined;
    return paths[platform].test(url.pathname) ? url : undefined;
  } catch { return undefined; }
}

function directMedia(raw: string): boolean { return /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(raw); }

async function extract(url: URL): Promise<string> {
  if (directMedia(url.toString())) return url.toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { accept: "text/html,application/xhtml+xml" } });
    if (!response.ok) throw new Error("source_unavailable");
    const html = (await response.text()).slice(0, 2_000_000);
    const candidates = [...html.matchAll(/<(?:meta|video)[^>]+(?:content|src)=["']([^"']+)["'][^>]*>/gi)]
      .map((m) => m[1]).filter((value) => /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(value));
    if (candidates[0]) return new URL(candidates[0], response.url).toString();
    throw new Error("media_not_found");
  } finally { clearTimeout(timeout); }
}

function requestId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `request-${clock.now()}`;
}

async function notifyOwner(ctx: Ctx, platform: Platform, url: string, error: string): Promise<void> {
  const owner = adminChatId(ctx as unknown as Parameters<typeof adminChatId>[0]);
  if (!owner) return;
  try { await ctx.api.sendMessage(owner, `Video extraction failed for ${labels[platform]} (${error}). Link: ${url.slice(0, 300)}`); } catch { /* owner may have blocked the bot */ }
}

export async function handleVideoText(ctx: Context & { session: Ctx["session"] }, next: () => Promise<void>): Promise<void> {
  const platform = ctx.session.platform;
  const text = ctx.message?.text?.trim() ?? "";
  if (!platform || !text || text.startsWith("/")) {
    await next();
    return;
  }
  const typed = ctx as unknown as Ctx;
  const url = validUrl(platform, text);
  if (!url) {
    ctx.session.failureCount = (ctx.session.failureCount ?? 0) + 1;
    await saveRequest(typed, { requestId: requestId(), userId: ctx.from?.id ?? 0, platform, inputUrl: text.slice(0, 2000), output: "invalid_url", status: "error", timestamp: clock.now(), errorCode: "invalid_url" });
    await ctx.reply(`That doesn't look like a ${labels[platform]} video link. Check it and try again.`, { reply_markup: retryKeyboard(platform) });
    if ((ctx.session.failureCount ?? 0) >= 3) await notifyOwner(typed, platform, text, "repeated_invalid_links");
    return;
  }
  await ctx.reply("I’m checking that link now…");
  try {
    const output = await extract(url);
    await saveRequest(typed, { requestId: requestId(), userId: ctx.from?.id ?? 0, platform, inputUrl: url.toString(), output, status: "success", timestamp: clock.now() });
    await ctx.reply(`Here’s the best download link I found:\n${output}`, { reply_markup: inlineKeyboard([[urlButton("Download", output)], [inlineButton("Start over", "menu:main")]]) });
    ctx.session.platform = undefined;
    ctx.session.failureCount = 0;
  } catch (error) {
    const code = error instanceof Error && error.message === "source_unavailable" ? "source_unavailable" : "media_not_found";
    await saveRequest(typed, { requestId: requestId(), userId: ctx.from?.id ?? 0, platform, inputUrl: url.toString(), output: code, status: "error", timestamp: clock.now(), errorCode: code });
    ctx.session.failureCount = (ctx.session.failureCount ?? 0) + 1;
    await ctx.reply("I couldn’t find a downloadable video there. It may be private, deleted, or temporarily unavailable.", { reply_markup: retryKeyboard(platform) });
    await notifyOwner(typed, platform, url.toString(), code);
    if ((ctx.session.failureCount ?? 0) >= 3) await notifyOwner(typed, platform, url.toString(), "repeated_failures");
  }
}
