import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { choosePlatform } from "../video.js";

registerMainMenuItem({ label: "TikTok", data: "platform:tiktok", order: 20 });
const composer = new Composer<Ctx>();
composer.callbackQuery("platform:tiktok", (ctx) => choosePlatform(ctx, "tiktok"));
export default composer;
