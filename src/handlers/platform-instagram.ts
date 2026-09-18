import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { choosePlatform } from "../video.js";

registerMainMenuItem({ label: "Instagram", data: "platform:instagram", order: 30 });
const composer = new Composer<Ctx>();
composer.callbackQuery("platform:instagram", (ctx) => choosePlatform(ctx, "instagram"));
export default composer;
