import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { choosePlatform } from "../video.js";

registerMainMenuItem({ label: "Facebook", data: "platform:facebook", order: 40 });
const composer = new Composer<Ctx>();
composer.callbackQuery("platform:facebook", (ctx) => choosePlatform(ctx, "facebook"));
export default composer;
