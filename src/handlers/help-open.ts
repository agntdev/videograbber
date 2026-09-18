import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Help", data: "help:open", order: 50 });

const composer = new Composer<Ctx>();

composer.callbackQuery("help:open", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "Send a video link from YouTube, TikTok, Instagram, or Facebook and I’ll find the best available download link.\n\nI only keep minimal request details for 30 days. Your video is never uploaded or stored by this bot.",
    { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) },
  );
});

export default composer;
