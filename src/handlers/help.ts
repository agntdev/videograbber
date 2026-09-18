import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { deleteUserRequests } from "../video-store.js";

// /help — plain-language explanation for non-technical users. This bot is
// button-driven: tell the user to tap /start to open the menu rather than listing
// slash commands. The same text is shown when the user taps the Help button on the
// main menu (`menu:help`). Enhance the copy for your specific bot; keep it short.
const composer = new Composer<Ctx>();

const HELP =
  "Send a video link from YouTube, TikTok, Instagram, or Facebook and I’ll find the best available download link.\n\n" +
  "I only keep minimal request details for 30 days. Your video is never uploaded or stored by this bot.";

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

composer.command("help", async (ctx) => {
  await ctx.reply(HELP);
});

composer.callbackQuery("menu:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(HELP, { reply_markup: inlineKeyboard([[inlineButton("Delete my logs", "privacy:delete")], [inlineButton("⬅️ Back to menu", "menu:main")]]) });
});

composer.callbackQuery("privacy:delete", async (ctx) => {
  await ctx.answerCallbackQuery();
  await deleteUserRequests(ctx, ctx.from?.id ?? 0);
  await ctx.editMessageText("Your request logs have been deleted.", { reply_markup: backToMenu });
});

export default composer;
