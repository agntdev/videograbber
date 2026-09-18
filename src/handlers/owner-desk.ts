import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem, requireOwner } from "../toolkit/index.js";
import { clearRequests, recentRequests, setSetting, setting, pruneRequests } from "../video-store.js";
import { clock } from "../video-store.js";

registerMainMenuItem({ label: "Owner desk", data: "owner:open", order: 90 });
const composer = new Composer<Ctx>();
const ownerContext = (ctx: Ctx) => ctx as unknown as Parameters<typeof requireOwner>[0];

composer.callbackQuery("owner:open", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ownerContext(ctx)))) return;
  await ctx.editMessageText("You can review recent requests or manage the platform menu.", {
    reply_markup: inlineKeyboard([
      [inlineButton("Recent requests", "owner:logs"), inlineButton("Platform settings", "owner:platforms")],
      [inlineButton("Clear logs", "owner:clear")],
      [inlineButton("Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery("owner:logs", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ownerContext(ctx)))) return;
  const rows = await recentRequests(ctx);
  if (!adminChatId(ownerContext(ctx))) {
    await ctx.reply("Owner access isn't set up yet.");
    return;
  }
  if (rows.length === 0) {
    await ctx.reply("No requests have been logged yet.");
    return;
  }
  const text = rows.map((row) => `${row.platform} · ${row.status} · ${new Date(row.timestamp).toISOString()}`).join("\n");
  await ctx.reply(`Recent requests:\n${text}`, { reply_markup: inlineKeyboard([[inlineButton("Back to owner desk", "owner:open")]]) });
});

composer.callbackQuery("owner:platforms", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ownerContext(ctx)))) return;
  const states = await Promise.all(["youtube", "tiktok", "instagram", "facebook"].map(async (name) => `${name}: ${((await setting(ctx, `enabled:${name}`)) ?? "on") === "on" ? "on" : "off"}`));
  await ctx.editMessageText(`Platform buttons are currently ${states.join(", ")}.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("Toggle YouTube", "owner:toggle:youtube"), inlineButton("Toggle TikTok", "owner:toggle:tiktok")],
      [inlineButton("Toggle Instagram", "owner:toggle:instagram"), inlineButton("Toggle Facebook", "owner:toggle:facebook")],
      [inlineButton("Back to owner desk", "owner:open")],
    ]),
  });
});

composer.callbackQuery(/^owner:toggle:(youtube|tiktok|instagram|facebook)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ownerContext(ctx)))) return;
  const name = ctx.callbackQuery.data.split(":")[2];
  const current = (await setting(ctx, `enabled:${name}`)) ?? "on";
  await setSetting(ctx, `enabled:${name}`, current === "on" ? "off" : "on");
  await ctx.reply(`${name} is now ${current === "on" ? "off" : "on"}.`, { reply_markup: inlineKeyboard([[inlineButton("Back to platforms", "owner:platforms")]]) });
});

composer.callbackQuery("owner:clear", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ownerContext(ctx)))) return;
  await clearRequests(ctx);
  await ctx.reply("Request logs are clear.", { reply_markup: inlineKeyboard([[inlineButton("Back to owner desk", "owner:open")]]) });
});

composer.callbackQuery("owner:prune", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ownerContext(ctx)))) return;
  await pruneRequests(ctx, 30 * 24 * 60 * 60 * 1000);
  await ctx.reply("Request logs older than 30 days are pruned.");
});

// Keep the registration explicit and useful in runtimes where a callback is
// delivered without a message (and avoid an accidental open admin surface).
export default composer;
