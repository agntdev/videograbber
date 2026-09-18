import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { handleVideoText, choosePlatform } from "../video.js";

registerMainMenuItem({ label: "YouTube", data: "platform:youtube", order: 10 });
const composer = new Composer<Ctx>();
composer.callbackQuery("platform:youtube", (ctx) => choosePlatform(ctx, "youtube"));
// One shared text route handles the pending ForceReply for every platform.
composer.on("message:text", handleVideoText);
export default composer;
