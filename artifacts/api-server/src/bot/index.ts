import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import { logger } from "../lib/logger.js";
import {
  gameStates, clearGame, privateUserToGame, victimUserToGame,
  pendingSetup, chatLeaderboard, loadLeaderboard, dn, esc, isVictim, resolveVictimId,
  type Player,
} from "./state.js";
import { startMenVsMen, handleVote, handleReact } from "./games/menvsmen.js";
import {
  startTrustBreak, handleJoin, handleCloseJoin,
  handlePrivateOpinion, handleGuess, handleOpinionVote,
} from "./games/trustbreak.js";
import {
  startMafia, handleMafiaJoin, handleMafiaForceStart,
  handleMafiaKill, handleMafiaProtect, handleMafiaInvestigate,
  handleMafiaReady, handleMafiaVote,
} from "./games/mafia.js";
import {
  startOutsider, handleOutsiderJoin, handleOutsiderForceStart,
  handleOutsiderVote, handleOutsiderGuess, handleOutsiderWordPick,
  handleOutsiderCatToggle, handleOutsiderCatAll, handleOutsiderCatDone,
  handleOutsiderSkipVote,
} from "./games/outsider.js";
import {
  startCircle, handleCircleJoin, handleCircleForceStart,
  handleCircleSetRounds, handleCircleText,
} from "./games/circle.js";
import {
  startBomb, handleBombJoin, handleBombForceStart, handleBombPass,
} from "./games/bomb.js";
import {
  startStopwatch, handleStopwatchJoin, handleStopwatchForceStart, handleStopwatchPress,
} from "./games/stopwatch.js";
import {
  startUno, handleUnoJoin, handleUnoStart, handleUnoPlay,
  handleUnoDraw, handleUnoPass, handleUnoColor, handleUnoUno,
  registerUnoDM,
} from "./games/uno.js";
import {
  startRps, handleRpsSetRounds, handleRpsJoin, handleRpsMove,
} from "./games/rps.js";
import {
  startCouch, handleCouchSetRounds, handleCouchJoin, handleCouchStart,
  handleCouchText, handleCouchChoose,
} from "./games/couch.js";
import {
  startXo, handleXoJoin, handleXoMove, handleXoNoop,
} from "./games/xo.js";

import type { UnoCard, RpsMove } from "./state.js";
import { generateTopCard }    from "./topCard.js";
import { handleMusicSearch, preWarmYtDlp }  from "./music.js";

function menuMsg() {
  return (
    `🎮 <b>اختار لعبتك</b>\n\n` +
    `🥊 <b>مين ضد مين</b>\n<i>موضوع عشوائي — شخصان يتجادلان والقروب يصوت</i>\n\n` +
    `💀 <b>كسر الثقة</b>\n<i>الكل يكتب رأيه الصريح سراً، والضحية تخمن كاتب الأقسى</i>\n\n` +
    `🎭 <b>المافيا</b>\n<i>نقاش مفتوح، أدوار سرية، تصويت — من يكشف المافيا أولاً؟</i>\n\n` +
    `🫥 <b>برا السالفة</b>\n<i>شخص ما يعرف الموضوع — الكل يلمّح وأنت تكتشف!</i>\n\n` +
    `🔴 <b>الدائرة القاتلة</b>\n<i>تحديات سريعة — الأبطأ والغلطان يطلع، آخر واحد يبقى يفوز!</i>\n\n` +
    `💣 <b>القنبلة المتنقلة</b>\n<i>قنبلة تنتقل بين اللاعبين — واللي تنفجر عليه يطلع!</i>\n\n` +
    `⏰ <b>سلك الموت الموقوت</b>\n<i>عداد تنازلي — اضغط أقرب ما تقدر من الصفر دون أن تصله!</i>\n\n` +
    `🃏 <b>أونو</b>\n<i>تخلص من أوراقك أول — لكن قُل UNO قبل الورقة الأخيرة!</i>\n\n` +
    `🪨 <b>حجر ورقة مقص</b>\n<i>تحدي مباشر بين لاعبين — الأسرع والأذكى يفوز!</i>\n\n` +
    `🛋️ <b>تحدي الكنبة</b>\n<i>فريقان عشوائيان — اجلس على الكنبة وزميلك يجاوب — أول فريق يكمل يفوز!</i>\n\n` +
    `✕ <b>أكس أو</b>\n<i>تحدي كلاسيكي بين اثنين — أكمل صفاً أو قطراً وتفوز!</i>`
  );
}

function menuKeyboard(chatId: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🥊  مين ضد مين",              `menu:mvs:${chatId}`)],
    [Markup.button.callback("💀  كسر الثقة",               `menu:tb:${chatId}`)],
    [Markup.button.callback("🎭  المافيا",                  `menu:mafia:${chatId}`)],
    [Markup.button.callback("🫥  برا السالفة",             `menu:outsider:${chatId}`)],
    [Markup.button.callback("🔴  الدائرة القاتلة",        `menu:circle:${chatId}`)],
    [Markup.button.callback("💣  القنبلة المتنقلة",       `menu:bomb:${chatId}`)],
    [Markup.button.callback("⏰  سلك الموت الموقوت",       `menu:sw:${chatId}`)],
    [Markup.button.callback("🃏  أونو",                    `menu:uno:${chatId}`)],
    [Markup.button.callback("🪨  حجر ورقة مقص",           `menu:rps:${chatId}`)],
    [Markup.button.callback("🛋️  تحدي الكنبة",            `menu:couch:${chatId}`)],
    [Markup.button.callback("✕  أكس أو",                  `menu:xo:${chatId}`)],
  ]);
}

function extractPlayers(
  text: string,
  entities: {
    type: string; offset: number; length: number;
    user?: { id: number; first_name: string; last_name?: string; username?: string };
  }[]
): Player[] {
  return entities
    .filter((e) => e.type === "mention" || e.type === "text_mention")
    .map((e) => {
      if (e.type === "text_mention" && e.user) {
        return {
          id: e.user.id,
          name: [e.user.first_name, e.user.last_name].filter(Boolean).join(" "),
          username: e.user.username,
        };
      }
      const username = text.slice(e.offset + 1, e.offset + e.length);
      return { id: 0, name: `@${username}`, username };
    });
}

export async function launchBot(): Promise<void> {
  const token = process.env["BOT_TOKEN"] || process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) { logger.error("BOT_TOKEN not set"); return; }

  // Load persisted leaderboard from disk (safe no-op if file missing)
  loadLeaderboard();
  logger.info("Leaderboard loaded");

  const bot = new Telegraf(token);
  let botUsername = "bot";

  const musicDisabledChats = new Set<number>();

  async function isAdmin(chatId: number, userId: number): Promise<boolean> {
    try {
      const member = await bot.telegram.getChatMember(chatId, userId);
      return member.status === "administrator" || member.status === "creator";
    } catch { return false; }
  }

  try {
    const me = await bot.telegram.getMe();
    botUsername = me.username ?? "bot";
    logger.info({ username: botUsername }, "Bot connected");
  } catch (e) {
    logger.error({ err: e }, "Failed to get bot info");
    return;
  }

  // /start — deep links
  bot.start(async (ctx) => {
    const payload = ctx.startPayload;
    const uid = ctx.from.id;
    const uname = ctx.from.username;

    if (payload?.startsWith("tb_")) {
      const chatId = parseInt(payload.slice(3), 10);
      if (!isNaN(chatId)) {
        const s = gameStates.get(chatId);
        if (s?.type === "trustbreak") {
          if (isVictim(s.victim, uid, uname)) {
            resolveVictimId(s.victim, uid, uname);
            if (s.victim.id !== 0) victimUserToGame.set(s.victim.id, chatId);
            ctx.reply(
              `🎯 <b>أنت الضحية!</b>\n\nانتظر تكشف الآراء في القروب... 👀\n\n<i>ستُطلب منك تخمين كاتب الرأي الأقسى!</i>`,
              { parse_mode: "HTML" }
            ).catch(() => {});
            return;
          }
          if (s.participants.has(uid)) {
            privateUserToGame.set(uid, chatId);
            if (s.phase === "collecting") {
              ctx.reply(
                `💀 <b>كسر الثقة</b>\n\n🎯 الضحية: <b>${esc(dn(s.victim))}</b>\n\n✍️ اكتب رأيك الصريح:\n<i>أي شيء — عيب، موقف، شيء يزعجك...</i>\n\n🔐 رأيك سري تماماً`,
                { parse_mode: "HTML" }
              ).catch(() => {});
            } else {
              ctx.reply("⚠️ انتهت مرحلة جمع الآراء.").catch(() => {});
            }
            return;
          }
        }
      }
    }

    if (payload?.startsWith("mf_")) {
      const chatId = parseInt(payload.slice(3), 10);
      if (!isNaN(chatId)) {
        const s = gameStates.get(chatId);
        if (s?.type === "mafia") {
          privateUserToGame.set(uid, chatId);
          const player = s.players.get(uid);
          if (player) {
            ctx.reply(
              `🎭 <b>المافيا</b> — مرحباً ${esc(player.name)}!\n\nأنت في اللعبة. ستصلك رسائلك عبر هنا مباشرة.\n\n<i>لا تكشف دورك لأحد! 🤫</i>`,
              { parse_mode: "HTML" }
            ).catch(() => {});
          }
        }
      }
      return;
    }

    if (payload?.startsWith("uno_")) {
      const groupChatId = parseInt(payload.slice(4), 10);
      if (!isNaN(groupChatId)) {
        const s = gameStates.get(groupChatId);
        if (s?.type === "uno") {
          const player = s.players.find(p => p.id === uid);
          if (player) {
            ctx.reply(
              `🃏 <b>أونو</b> — مرحباً ${esc(player.firstName || (uname ? `@${uname}` : String(uid)))}!\n\nتم تفعيل الخاص ✅\nسوف تصلك أوراقك في دورك مباشرة هنا.`,
              { parse_mode: "HTML" }
            ).catch(() => {});
            await registerUnoDM(bot, groupChatId, uid, ctx.chat.id);
          } else {
            ctx.reply("⚠️ أنت مو مسجل في هذه اللعبة!").catch(() => {});
          }
        } else {
          ctx.reply("⚠️ اللعبة انتهت أو لم تبدأ بعد.").catch(() => {});
        }
      }
      return;
    }

    if (ctx.chat.type === "private") {
      if (victimUserToGame.has(uid)) {
        ctx.reply(`🎯 <b>أنت الضحية!</b>\n\nانتظر تكشف الآراء في القروب... 👀`, { parse_mode: "HTML" }).catch(() => {});
        return;
      }
      ctx.reply(
        `👋 <b>أهلاً!</b>\n\nأنا بوت ألعاب جماعية 🎮\n\nأضفني لقروبك واستخدم:\n• /play — اختيار لعبة\n• /help — شرح الألعاب\n• /score — المتصدرون`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }
  });

  // ─── Commands ────────────────────────────────────────────────────────────────

  bot.command("play", (ctx) => {
    if (ctx.chat.type === "private") {
      ctx.reply("🚫 هذا الأمر للقروبات فقط!").catch(() => {}); return;
    }
    ctx.reply(menuMsg(), { parse_mode: "HTML", ...menuKeyboard(ctx.chat.id) }).catch(() => {});
  });

  bot.command("help", (ctx) => {
    ctx.reply(
      `📖 <b>الألعاب المتاحة</b>\n\n` +
      `🥊 <b>مين ضد مين</b>\n/menvsmen @شخص1 @شخص2\n<i>موضوع عشوائي — دقيقتان نقاش + ردود حية + تصويت</i>\n\n` +
      `💀 <b>كسر الثقة</b>\n/trustbreak @الضحية\n<i>آراء سرية تتكشف بمستوى قسوتها، القروب يصوت، الضحية تخمن</i>\n\n` +
      `🎭 <b>المافيا</b>\n/mafia — يبدأ مرحلة الانضمام\n<i>5–15 لاعب — أدوار سرية — نقاش مفتوح + تصويت كل جولة</i>\n<i>الدكتور يحمي، المحقق يكشف، المافيا تخدع</i>\n\n` +
      `🏆 /score — لوحة المتصدرين\n🛑 /stop — إيقاف اللعبة`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  });

  bot.command("score", (ctx) => {
    if (ctx.chat.type === "private") return;
    const board = chatLeaderboard.get(ctx.chat.id);
    if (!board || board.size === 0) {
      ctx.reply("⚠️ ما في إحصائيات بعد — العبوا أولاً! 🎮").catch(() => {}); return;
    }
    const sorted = [...board.entries()].sort((a, b) => b[1].wins - a[1].wins).slice(0, 10);
    const medals = ["🥇", "🥈", "🥉"];
    let text = `🏆 <b>المتصدرون</b>\n\n`;
    sorted.forEach(([, e], i) => {
      const rate = e.games > 0 ? Math.round((e.wins / e.games) * 100) : 0;
      text += `${medals[i] ?? `${i + 1}.`} ${esc(e.name)}  —  ${e.wins} فوز  <i>(${rate}%)</i>\n`;
    });
    ctx.reply(text, { parse_mode: "HTML" }).catch(() => {});
  });

  bot.command("top", async (ctx) => {
    if (ctx.chat.type === "private") return;
    const chatId = ctx.chat.id;
    const board  = chatLeaderboard.get(chatId);
    if (!board || board.size === 0) {
      ctx.reply("⚠️ ما في إحصائيات بعد — العبوا أولاً! 🎮").catch(() => {}); return;
    }
    const sorted = [...board.entries()].sort((a, b) => b[1].wins - a[1].wins);
    const groupName = (ctx.chat as any).title ?? "المجموعة";
    try {
      const buf = await generateTopCard(sorted, groupName);
      await ctx.replyWithPhoto({ source: buf }, {
        caption: `🏆 <b>Top 5 — ${esc(groupName)}</b>\n<i>النقاط = الفوز بالألعاب</i>`,
        parse_mode: "HTML",
      });
    } catch (e) {
      logger.error({ err: e }, "top card error");
      // Fallback to text
      const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
      let text = `🏆 <b>Top 5</b>\n\n`;
      sorted.slice(0, 5).forEach(([, e], i) => {
        const rate = e.games > 0 ? Math.round((e.wins / e.games) * 100) : 0;
        text += `${medals[i]} ${esc(e.name)} — ${e.wins} نقطة (${rate}%)\n`;
      });
      ctx.reply(text, { parse_mode: "HTML" }).catch(() => {});
    }
  });

  bot.command("mafia", (ctx) => {
    if (ctx.chat.type === "private") { ctx.reply("🚫 للقروبات فقط!").catch(() => {}); return; }
    startMafia(bot, ctx.chat.id, ctx.from.id, botUsername);
  });

  bot.command("outsider", (ctx) => {
    if (ctx.chat.type === "private") { ctx.reply("🚫 للقروبات فقط!").catch(() => {}); return; }
    startOutsider(bot, ctx);
  });

  bot.command(["circle", "daire", "داira"], (ctx) => {
    if (ctx.chat.type === "private") { ctx.reply("🚫 للقروبات فقط!").catch(() => {}); return; }
    const f = ctx.from;
    startCircle(bot, ctx.chat.id, f.id, f.username, f.first_name ?? "", f.last_name ?? "");
  });

  bot.command(["bomb", "qunbula", "قنبلة"], (ctx) => {
    if (ctx.chat.type === "private") { ctx.reply("🚫 للقروبات فقط!").catch(() => {}); return; }
    const f = ctx.from;
    startBomb(bot, ctx.chat.id, f.id, f.username, f.first_name ?? "", f.last_name ?? "");
  });

  bot.command(["sw", "timer", "سلك", "death"], (ctx) => {
    if (ctx.chat.type === "private") { ctx.reply("🚫 للقروبات فقط!").catch(() => {}); return; }
    const f = ctx.from;
    startStopwatch(bot, ctx.chat.id, f.id, f.username, f.first_name ?? "", f.last_name ?? "");
  });

  bot.command(["uno", "اونو", "أونو"], (ctx) => {
    if (ctx.chat.type === "private") { ctx.reply("🚫 للقروبات فقط!").catch(() => {}); return; }
    const f = ctx.from;
    startUno(bot, ctx.chat.id, f.id, f.username, f.first_name ?? "", f.last_name ?? "", botUsername);
  });

  bot.command(["rps", "حجر", "حجرورقمقص"], (ctx) => {
    if (ctx.chat.type === "private") { ctx.reply("🚫 للقروبات فقط!").catch(() => {}); return; }
    const f = ctx.from;
    startRps(bot, ctx.chat.id, f.id, f.username, f.first_name ?? "", f.last_name ?? "");
  });

  bot.command(["couch", "كنبة", "كنبه", "sofa"], (ctx) => {
    if (ctx.chat.type === "private") { ctx.reply("🚫 للقروبات فقط!").catch(() => {}); return; }
    const f = ctx.from;
    startCouch(bot, ctx.chat.id, f.id, f.username, f.first_name ?? "", f.last_name ?? "");
  });

  bot.command(["xo", "اكساو", "أكساو", "أكس"], (ctx) => {
    if (ctx.chat.type === "private") { ctx.reply("🚫 للقروبات فقط!").catch(() => {}); return; }
    const f = ctx.from;
    startXo(bot, ctx.chat.id, f.id, f.username, f.first_name ?? "", f.last_name ?? "");
  });


  bot.command(["music_on", "تفعيل_اغاني", "تفعيل_أغاني", "تفعيل_الاغاني"], async (ctx) => {
    if (ctx.chat.type === "private") { ctx.reply("🚫 للقروبات فقط!").catch(() => {}); return; }
    const chatId = ctx.chat.id;
    const uid = ctx.from.id;
    if (!(await isAdmin(chatId, uid))) {
      ctx.reply("🚫 هذا الأمر للأدمنز فقط.").catch(() => {}); return;
    }
    musicDisabledChats.delete(chatId);
    ctx.reply("🎵 تم تفعيل الموسيقى في هذا القروب ✅\nيمكن للأعضاء الآن البحث عن الأغاني بـ <code>يوت اسم الأغنية</code>", { parse_mode: "HTML" }).catch(() => {});
  });

  bot.command(["music_off", "تعطيل_اغاني", "تعطيل_أغاني", "تعطيل_الاغاني"], async (ctx) => {
    if (ctx.chat.type === "private") { ctx.reply("🚫 للقروبات فقط!").catch(() => {}); return; }
    const chatId = ctx.chat.id;
    const uid = ctx.from.id;
    if (!(await isAdmin(chatId, uid))) {
      ctx.reply("🚫 هذا الأمر للأدمنز فقط.").catch(() => {}); return;
    }
    musicDisabledChats.add(chatId);
    ctx.reply("🔇 تم تعطيل الموسيقى في هذا القروب ❌\nلن يتمكن أحد من البحث عن أغاني حتى يُفعّلها الأدمن.", { parse_mode: "HTML" }).catch(() => {});
  });

  bot.command("menvsmen", (ctx) => {
    if (ctx.chat.type === "private") { ctx.reply("🚫 للقروبات فقط!").catch(() => {}); return; }
    const chatId = ctx.chat.id;
    const text = ctx.message.text ?? "";
    const players = extractPlayers(text, ctx.message.entities ?? []);
    if (players.length < 2) {
      ctx.reply(`⚠️ مثال: <code>/menvsmen @أحمد @فهد</code>\n\nأو استخدم /play 👇`, { parse_mode: "HTML" }).catch(() => {}); return;
    }
    if (players[0].id && players[0].id === players[1].id) {
      ctx.reply("🚫 ما تقدر تختار نفس الشخص مرتين!").catch(() => {}); return;
    }
    startMenVsMen(bot, chatId, players[0], players[1], ctx.from.id);
  });

  bot.command("trustbreak", (ctx) => {
    if (ctx.chat.type === "private") { ctx.reply("🚫 للقروبات فقط!").catch(() => {}); return; }
    const chatId = ctx.chat.id;
    const text = ctx.message.text ?? "";
    const players = extractPlayers(text, ctx.message.entities ?? []);
    const victim: Player = players.length > 0 ? players[0] : {
      id: ctx.from.id,
      name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" "),
      username: ctx.from.username,
    };
    startTrustBreak(bot, chatId, victim, ctx.from.id, botUsername);
  });

  bot.command(["stop", "stopgame"], (ctx) => {
    if (ctx.chat.type === "private") return;
    const chatId = ctx.chat.id;
    if (!gameStates.has(chatId)) { ctx.reply("⚠️ ما في لعبة نشطة.").catch(() => {}); return; }
    clearGame(chatId);
    ctx.reply(`🛑 <b>تم إيقاف اللعبة</b>\n\n/play — لبدء لعبة جديدة`, { parse_mode: "HTML" }).catch(() => {});
  });

  // ─── Callbacks ───────────────────────────────────────────────────────────────

  bot.on("callback_query", async (ctx) => {
    const data = (ctx.callbackQuery as { data?: string }).data;
    if (!data) { await ctx.answerCbQuery().catch(() => {}); return; }

    try {

      // ── Menu ──────────────────────────────────────────────────────────────────
      if (data.startsWith("menu:mvs:")) {
        const chatId = parseInt(data.slice("menu:mvs:".length), 10);
        if (isNaN(chatId)) return;
        if (gameStates.has(chatId)) { await ctx.answerCbQuery("⚠️ في لعبة شغالة!").catch(() => {}); return; }
        await ctx.answerCbQuery("🥊").catch(() => {});
        ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        const sent = await bot.telegram.sendMessage(
          chatId,
          `🥊 <b>مين ضد مين</b>\n\n${esc(ctx.from.first_name)} اختار هذه اللعبة!\n\n✍️ <b>رد على هذه الرسالة</b> بذكر اللاعبين:\n<code>@اسم1 @اسم2</code>`,
          { parse_mode: "HTML", reply_markup: { force_reply: true, selective: true } }
        ).catch(() => null);
        if (sent) pendingSetup.set(ctx.from.id, { chatId, game: "menvsmen", promptMsgId: sent.message_id });
        return;
      }

      if (data.startsWith("menu:tb:")) {
        const chatId = parseInt(data.slice("menu:tb:".length), 10);
        if (isNaN(chatId)) return;
        if (gameStates.has(chatId)) { await ctx.answerCbQuery("⚠️ في لعبة شغالة!").catch(() => {}); return; }
        await ctx.answerCbQuery("💀").catch(() => {});
        ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        const sent = await bot.telegram.sendMessage(
          chatId,
          `💀 <b>كسر الثقة</b>\n\n${esc(ctx.from.first_name)} اختار هذه اللعبة!\n\n✍️ <b>رد على هذه الرسالة</b> بذكر الضحية:\n<code>@اسم_الضحية</code>`,
          { parse_mode: "HTML", reply_markup: { force_reply: true, selective: true } }
        ).catch(() => null);
        if (sent) pendingSetup.set(ctx.from.id, { chatId, game: "trustbreak", promptMsgId: sent.message_id });
        return;
      }

      if (data.startsWith("menu:mafia:")) {
        const chatId = parseInt(data.slice("menu:mafia:".length), 10);
        if (isNaN(chatId)) return;
        if (gameStates.has(chatId)) { await ctx.answerCbQuery("⚠️ في لعبة شغالة!").catch(() => {}); return; }
        await ctx.answerCbQuery("🎭").catch(() => {});
        ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        startMafia(bot, chatId, ctx.from.id, botUsername);
        return;
      }

      if (data.startsWith("menu:outsider:")) {
        const chatId = parseInt(data.slice("menu:outsider:".length), 10);
        if (isNaN(chatId)) return;
        if (gameStates.has(chatId)) { await ctx.answerCbQuery("⚠️ في لعبة شغالة!").catch(() => {}); return; }
        await ctx.answerCbQuery("🫥").catch(() => {});
        ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        await startOutsider(bot, ctx);
        return;
      }

      if (data.startsWith("menu:circle:")) {
        const chatId = parseInt(data.slice("menu:circle:".length), 10);
        if (isNaN(chatId)) return;
        if (gameStates.has(chatId)) { await ctx.answerCbQuery("⚠️ في لعبة شغالة!").catch(() => {}); return; }
        await ctx.answerCbQuery("🔴").catch(() => {});
        ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        const f = ctx.from;
        startCircle(bot, chatId, f.id, f.username, f.first_name ?? "", f.last_name ?? "");
        return;
      }

      if (data.startsWith("menu:bomb:")) {
        const chatId = parseInt(data.slice("menu:bomb:".length), 10);
        if (isNaN(chatId)) return;
        if (gameStates.has(chatId)) { await ctx.answerCbQuery("⚠️ في لعبة شغالة!").catch(() => {}); return; }
        await ctx.answerCbQuery("💣").catch(() => {});
        ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        const f = ctx.from;
        startBomb(bot, chatId, f.id, f.username, f.first_name ?? "", f.last_name ?? "");
        return;
      }

      if (data.startsWith("menu:sw:")) {
        const chatId = parseInt(data.slice("menu:sw:".length), 10);
        if (isNaN(chatId)) return;
        if (gameStates.has(chatId)) { await ctx.answerCbQuery("⚠️ في لعبة شغالة!").catch(() => {}); return; }
        await ctx.answerCbQuery("⏰").catch(() => {});
        ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        const f = ctx.from;
        startStopwatch(bot, chatId, f.id, f.username, f.first_name ?? "", f.last_name ?? "");
        return;
      }

      if (data.startsWith("menu:uno:")) {
        const chatId = parseInt(data.slice("menu:uno:".length), 10);
        if (isNaN(chatId)) return;
        if (gameStates.has(chatId)) { await ctx.answerCbQuery("⚠️ في لعبة شغالة!").catch(() => {}); return; }
        await ctx.answerCbQuery("🃏").catch(() => {});
        ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        const fu = ctx.from;
        startUno(bot, chatId, fu.id, fu.username, fu.first_name ?? "", fu.last_name ?? "", botUsername);
        return;
      }

      if (data.startsWith("menu:rps:")) {
        const chatId = parseInt(data.slice("menu:rps:".length), 10);
        if (isNaN(chatId)) return;
        if (gameStates.has(chatId)) { await ctx.answerCbQuery("⚠️ في لعبة شغالة!").catch(() => {}); return; }
        await ctx.answerCbQuery("🪨").catch(() => {});
        ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        const fr = ctx.from;
        startRps(bot, chatId, fr.id, fr.username, fr.first_name ?? "", fr.last_name ?? "");
        return;
      }

      if (data.startsWith("menu:couch:")) {
        const chatId = parseInt(data.slice("menu:couch:".length), 10);
        if (isNaN(chatId)) return;
        if (gameStates.has(chatId)) { await ctx.answerCbQuery("⚠️ في لعبة شغالة!").catch(() => {}); return; }
        await ctx.answerCbQuery("🛋️").catch(() => {});
        ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        const fr = ctx.from;
        startCouch(bot, chatId, fr.id, fr.username, fr.first_name ?? "", fr.last_name ?? "");
        return;
      }

      if (data.startsWith("menu:xo:")) {
        const chatId = parseInt(data.slice("menu:xo:".length), 10);
        if (isNaN(chatId)) return;
        if (gameStates.has(chatId)) { await ctx.answerCbQuery("⚠️ في لعبة شغالة!").catch(() => {}); return; }
        await ctx.answerCbQuery("✕○").catch(() => {});
        ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        const fr = ctx.from;
        startXo(bot, chatId, fr.id, fr.username, fr.first_name ?? "", fr.last_name ?? "");
        return;
      }

      // ── مين ضد مين ────────────────────────────────────────────────────────────
      if (data.startsWith("mvs:react:")) {
        const parts = data.split(":");
        const chatId = parseInt(parts[2], 10);
        const c = parseInt(parts[3], 10) as 1 | 2;
        if (!isNaN(chatId) && (c === 1 || c === 2)) { handleReact(bot, ctx, chatId, c); return; }
      }
      if (data.startsWith("mvs:")) {
        const parts = data.split(":");
        const chatId = parseInt(parts[2], 10);
        const c = parseInt(parts[1], 10) as 1 | 2;
        if (!isNaN(chatId) && (c === 1 || c === 2)) { await handleVote(bot, ctx, chatId, c); return; }
      }

      // ── كسر الثقة ──────────────────────────────────────────────────────────────
      if (data.startsWith("tb:join:")) {
        const chatId = parseInt(data.slice("tb:join:".length), 10);
        if (!isNaN(chatId)) { handleJoin(bot, ctx, chatId, botUsername); return; }
      }
      if (data.startsWith("tb:close:")) {
        const chatId = parseInt(data.slice("tb:close:".length), 10);
        if (!isNaN(chatId)) { handleCloseJoin(bot, ctx, chatId, botUsername); return; }
      }
      if (data.startsWith("tb:voteop:")) {
        const parts = data.split(":");
        const chatId = parseInt(parts[2], 10);
        const idx = parseInt(parts[3], 10);
        if (!isNaN(chatId) && !isNaN(idx)) { handleOpinionVote(bot, ctx, chatId, idx); return; }
      }
      if (data.startsWith("tb:guess:")) {
        const parts = data.split(":");
        const chatId = parseInt(parts[2], 10);
        const uid = parseInt(parts[3], 10);
        if (!isNaN(chatId) && !isNaN(uid)) { handleGuess(bot, ctx, chatId, uid); return; }
      }

      // ── المافيا ────────────────────────────────────────────────────────────────
      if (data.startsWith("mf:join:")) {
        const chatId = parseInt(data.slice("mf:join:".length), 10);
        if (!isNaN(chatId)) { handleMafiaJoin(bot, ctx, chatId, botUsername); return; }
      }
      if (data.startsWith("mf:start:")) {
        const chatId = parseInt(data.slice("mf:start:".length), 10);
        if (!isNaN(chatId)) { handleMafiaForceStart(bot, ctx, chatId, botUsername); return; }
      }
      if (data.startsWith("mf:kill:")) {
        const parts = data.split(":");
        const chatId = parseInt(parts[2], 10);
        const targetUid = parseInt(parts[3], 10);
        if (!isNaN(chatId) && !isNaN(targetUid)) { handleMafiaKill(bot, ctx, chatId, targetUid); return; }
      }
      if (data.startsWith("mf:protect:")) {
        const parts = data.split(":");
        const chatId = parseInt(parts[2], 10);
        const targetUid = parseInt(parts[3], 10);
        if (!isNaN(chatId) && !isNaN(targetUid)) { handleMafiaProtect(bot, ctx, chatId, targetUid); return; }
      }
      if (data.startsWith("mf:invest:")) {
        const parts = data.split(":");
        const chatId = parseInt(parts[2], 10);
        const targetUid = parseInt(parts[3], 10);
        if (!isNaN(chatId) && !isNaN(targetUid)) { handleMafiaInvestigate(bot, ctx, chatId, targetUid); return; }
      }
      if (data.startsWith("mf:ready:")) {
        const chatId = parseInt(data.slice("mf:ready:".length), 10);
        if (!isNaN(chatId)) { handleMafiaReady(bot, ctx, chatId); return; }
      }
      if (data.startsWith("mf:vote:")) {
        const parts = data.split(":");
        const chatId = parseInt(parts[2], 10);
        const targetUid = parseInt(parts[3], 10);
        if (!isNaN(chatId) && !isNaN(targetUid)) { handleMafiaVote(bot, ctx, chatId, targetUid); return; }
      }

      // ── برا السالفة ────────────────────────────────────────────────────────────
      if (data.startsWith("out:cat:")) {
        const parts = data.split(":");
        // format: out:cat:{chatId}:{index}
        const chatId = parseInt(parts[2], 10);
        const catIdx = parseInt(parts[3], 10);
        if (!isNaN(chatId) && !isNaN(catIdx)) { handleOutsiderCatToggle(bot, ctx, chatId, catIdx); return; }
      }
      if (data.startsWith("out:catall:")) {
        const chatId = parseInt(data.slice("out:catall:".length), 10);
        if (!isNaN(chatId)) { handleOutsiderCatAll(bot, ctx, chatId); return; }
      }
      if (data.startsWith("out:catdone:")) {
        const chatId = parseInt(data.slice("out:catdone:".length), 10);
        if (!isNaN(chatId)) { handleOutsiderCatDone(bot, ctx, chatId); return; }
      }
      if (data.startsWith("out:join:")) {
        const chatId = parseInt(data.slice("out:join:".length), 10);
        if (!isNaN(chatId)) { handleOutsiderJoin(bot, ctx, chatId); return; }
      }
      if (data.startsWith("out:fstart:")) {
        const chatId = parseInt(data.slice("out:fstart:".length), 10);
        if (!isNaN(chatId)) { handleOutsiderForceStart(bot, ctx, chatId); return; }
      }
      if (data.startsWith("out:skipvote:")) {
        const chatId = parseInt(data.slice("out:skipvote:".length), 10);
        if (!isNaN(chatId)) { handleOutsiderSkipVote(bot, ctx, chatId); return; }
      }
      if (data.startsWith("out:vote:")) {
        const parts = data.split(":");
        const chatId   = parseInt(parts[2], 10);
        const targetId = parseInt(parts[3], 10);
        if (!isNaN(chatId) && !isNaN(targetId)) { handleOutsiderVote(bot, ctx, chatId, targetId); return; }
      }
      if (data.startsWith("out:guess:")) {
        const parts = data.split(":");
        const chatId = parseInt(parts[2], 10);
        const idx    = parseInt(parts[3], 10);
        if (!isNaN(chatId) && !isNaN(idx)) { handleOutsiderWordPick(bot, ctx, chatId, idx); return; }
      }

      // ── الدائرة القاتلة ────────────────────────────────────────────────────────
      if (data.startsWith("circle:join:")) {
        const chatId = parseInt(data.slice("circle:join:".length), 10);
        if (!isNaN(chatId)) { await handleCircleJoin(bot, ctx, chatId); return; }
      }
      if (data.startsWith("circle:fstart:")) {
        const chatId = parseInt(data.slice("circle:fstart:".length), 10);
        if (!isNaN(chatId)) { await handleCircleForceStart(bot, ctx, chatId); return; }
      }
      if (data.startsWith("circle:setn:")) {
        const parts  = data.split(":");            // ["circle","setn","n","chatId"]
        const n      = parseInt(parts[2], 10);
        const chatId = parseInt(parts[3], 10);
        if (!isNaN(n) && !isNaN(chatId)) { await handleCircleSetRounds(bot, ctx, chatId, n); return; }
      }

      // ── القنبلة المتنقلة ───────────────────────────────────────────────────────
      if (data.startsWith("bomb:join:")) {
        const chatId = parseInt(data.slice("bomb:join:".length), 10);
        if (!isNaN(chatId)) { await handleBombJoin(bot, ctx, chatId); return; }
      }
      if (data.startsWith("bomb:fstart:")) {
        const chatId = parseInt(data.slice("bomb:fstart:".length), 10);
        if (!isNaN(chatId)) { await handleBombForceStart(bot, ctx, chatId); return; }
      }
      if (data.startsWith("bomb:pass:")) {
        const parts    = data.split(":");
        const chatId   = parseInt(parts[2], 10);
        const targetId = parseInt(parts[3], 10);
        if (!isNaN(chatId) && !isNaN(targetId)) { await handleBombPass(bot, ctx, chatId, targetId); return; }
      }

      // ── سلك الموت الموقوت ──────────────────────────────────────────────────────
      if (data.startsWith("sw:join:")) {
        const chatId = parseInt(data.slice("sw:join:".length), 10);
        if (!isNaN(chatId)) { await handleStopwatchJoin(bot, ctx, chatId); return; }
      }
      if (data.startsWith("sw:start:")) {
        const chatId = parseInt(data.slice("sw:start:".length), 10);
        if (!isNaN(chatId)) { await handleStopwatchForceStart(bot, ctx, chatId); return; }
      }
      if (data.startsWith("sw:press:")) {
        const chatId = parseInt(data.slice("sw:press:".length), 10);
        if (!isNaN(chatId)) { await handleStopwatchPress(bot, ctx, chatId); return; }
      }

      // ── أونو ──────────────────────────────────────────────────────────────────
      if (data.startsWith("uno:join:")) {
        const chatId = parseInt(data.slice("uno:join:".length), 10);
        if (!isNaN(chatId)) { await handleUnoJoin(bot, ctx, chatId); return; }
      }
      if (data.startsWith("uno:start:")) {
        const chatId = parseInt(data.slice("uno:start:".length), 10);
        if (!isNaN(chatId)) { await handleUnoStart(bot, ctx, chatId); return; }
      }
      if (data.startsWith("uno:play:")) {
        const parts   = data.split(":");
        const chatId  = parseInt(parts[2], 10);
        const handIdx = parseInt(parts[3], 10);
        if (!isNaN(chatId) && !isNaN(handIdx)) { await handleUnoPlay(bot, ctx, chatId, handIdx); return; }
      }
      if (data.startsWith("uno:draw:")) {
        const chatId = parseInt(data.slice("uno:draw:".length), 10);
        if (!isNaN(chatId)) { await handleUnoDraw(bot, ctx, chatId); return; }
      }
      if (data.startsWith("uno:pass:")) {
        const chatId = parseInt(data.slice("uno:pass:".length), 10);
        if (!isNaN(chatId)) { await handleUnoPass(bot, ctx, chatId); return; }
      }
      if (data.startsWith("uno:color:")) {
        const parts  = data.split(":");
        const chatId = parseInt(parts[2], 10);
        const color  = parts[3] as UnoCard["color"];
        if (!isNaN(chatId) && color) { await handleUnoColor(bot, ctx, chatId, color); return; }
      }
      if (data.startsWith("uno:uno:")) {
        const chatId = parseInt(data.slice("uno:uno:".length), 10);
        if (!isNaN(chatId)) { await handleUnoUno(bot, ctx, chatId); return; }
      }

      // ── حجر ورقة مقص ──────────────────────────────────────────────────────────
      if (data.startsWith("rps:setn:")) {
        const parts  = data.split(":");
        const n      = parseInt(parts[2], 10);
        const chatId = parseInt(parts[3], 10);
        if (!isNaN(chatId) && !isNaN(n)) { await handleRpsSetRounds(bot, ctx, chatId, n); return; }
      }
      if (data.startsWith("rps:join:")) {
        const chatId = parseInt(data.slice("rps:join:".length), 10);
        if (!isNaN(chatId)) { await handleRpsJoin(bot, ctx, chatId); return; }
      }
      if (data.startsWith("rps:move:")) {
        const parts  = data.split(":");
        const move   = parts[2] as RpsMove;
        const chatId = parseInt(parts[3], 10);
        if (!isNaN(chatId) && ["rock", "paper", "scissors"].includes(move)) {
          await handleRpsMove(bot, ctx, chatId, move); return;
        }
      }

      // ── تحدي الكنبة ────────────────────────────────────────────────────────
      if (data.startsWith("couch:rounds:")) {
        const parts   = data.split(":");
        const chatId  = parseInt(parts[2], 10);
        const rounds  = parseInt(parts[3], 10);
        if (!isNaN(chatId) && !isNaN(rounds)) { await handleCouchSetRounds(bot, ctx, chatId, rounds); return; }
      }
      if (data.startsWith("couch:join:")) {
        const parts   = data.split(":");
        const chatId  = parseInt(parts[2], 10);
        if (!isNaN(chatId)) { await handleCouchJoin(bot, ctx, chatId, 0); return; }
      }
      if (data.startsWith("couch:start:")) {
        const chatId = parseInt(data.slice("couch:start:".length), 10);
        if (!isNaN(chatId)) { await handleCouchStart(bot, ctx, chatId); return; }
      }
      if (data.startsWith("couch:choose:")) {
        const parts  = data.split(":");
        const chatId = parseInt(parts[2], 10);
        const action = parts[3] as "kick" | "take";
        if (!isNaN(chatId) && (action === "kick" || action === "take")) {
          await handleCouchChoose(bot, ctx, chatId, action); return;
        }
      }

      // ── أكس أو ────────────────────────────────────────────────────────────────
      if (data.startsWith("xo:join:")) {
        const chatId = parseInt(data.slice("xo:join:".length), 10);
        if (!isNaN(chatId)) { await handleXoJoin(bot, ctx, chatId); return; }
      }
      if (data.startsWith("xo:move:")) {
        const parts  = data.split(":");
        const idx    = parseInt(parts[2], 10);
        const chatId = parseInt(parts[3], 10);
        if (!isNaN(chatId) && !isNaN(idx) && idx >= 0 && idx < 9) {
          await handleXoMove(bot, ctx, chatId, idx); return;
        }
      }
      if (data.startsWith("xo:noop:")) {
        await handleXoNoop(ctx); return;
      }

      await ctx.answerCbQuery().catch(() => {});
    } catch (e) {
      logger.error({ err: e }, "callback error");
      await ctx.answerCbQuery("⚠️ حصل خطأ").catch(() => {});
    }
  });

  // ─── Text messages ───────────────────────────────────────────────────────────

  bot.on(message("text"), async (ctx) => {
    const uid = ctx.from.id;
    const uname = ctx.from.username;
    const text = ctx.message.text ?? "";

    // Private chat
    if (ctx.chat.type === "private") {
      const chatId = privateUserToGame.get(uid);
      if (chatId) {
        const gs = gameStates.get(chatId);
        if (gs?.type === "mafia") {
          ctx.reply("🎭 المافيا — الطبيب والمحقق يتصرفون عبر الأزرار في بداية كل جولة.\nالتصويت في القروب! 🗳️").catch(() => {});
          return;
        }
        if (gs?.type === "outsider" && gs.phase === "guessing" && uid === gs.outsiderId) {
          handleOutsiderGuess(bot, chatId, uid, text);
          return;
        }
      }

      const handled = handlePrivateOpinion(bot, ctx, uid, text, uname);
      if (!handled && victimUserToGame.has(uid)) {
        ctx.reply(`🎯 <b>أنت الضحية!</b>\n\nانتظر الكشف في القروب 👀`, { parse_mode: "HTML" }).catch(() => {});
      }
      return;
    }

    const chatId = ctx.chat.id;

    // ── "توب" trigger (Arabic natural text) ──────────────────────────────────
    const trimmed = text.trim();
    if (trimmed === "توب" || trimmed === "top" || trimmed === "TOP") {
      const board = chatLeaderboard.get(chatId);
      if (!board || board.size === 0) {
        ctx.reply("⚠️ ما في إحصائيات بعد — العبوا أولاً! 🎮").catch(() => {});
      } else {
        const sorted = [...board.entries()].sort((a, b) => b[1].wins - a[1].wins);
        const groupName = (ctx.chat as any).title ?? "المجموعة";
        generateTopCard(sorted, groupName).then((buf) => {
          ctx.replyWithPhoto({ source: buf }, {
            caption: `🏆 <b>Top 5 — ${esc(groupName)}</b>\n<i>النقاط = الفوز بالألعاب</i>`,
            parse_mode: "HTML",
          }).catch(() => {});
        }).catch(() => {
          const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
          let t = `🏆 <b>Top 5</b>\n\n`;
          sorted.slice(0, 5).forEach(([, e], i) => {
            const rate = e.games > 0 ? Math.round((e.wins / e.games) * 100) : 0;
            t += `${medals[i]} ${esc(e.name)} — ${e.wins} نقطة (${rate}%)\n`;
          });
          ctx.reply(t, { parse_mode: "HTML" }).catch(() => {});
        });
      }
      return;
    }

    // ── تفعيل/تعطيل الموسيقى بنص عادي ─────────────────────────────────────────
    if (/^تعطيل\s*[أا]غاني$/u.test(trimmed)) {
      if (ctx.chat.type !== "private") {
        if (await isAdmin(chatId, uid)) {
          musicDisabledChats.add(chatId);
          ctx.reply("🔇 تم تعطيل الموسيقى في هذا القروب ❌").catch(() => {});
        } else {
          ctx.reply("🚫 هذا الأمر للأدمنز فقط.").catch(() => {});
        }
      }
      return;
    }
    if (/^تفعيل\s*[أا]غاني$/u.test(trimmed)) {
      if (ctx.chat.type !== "private") {
        if (await isAdmin(chatId, uid)) {
          musicDisabledChats.delete(chatId);
          ctx.reply("🎵 تم تفعيل الموسيقى في هذا القروب ✅").catch(() => {});
        } else {
          ctx.reply("🚫 هذا الأمر للأدمنز فقط.").catch(() => {});
        }
      }
      return;
    }

    // ── يوت / بحث — YouTube music search ────────────────────────────────────────
    {
      const musicMatch = /^(يوت(?:يوب)?|بحث)(\s+(.+))?$/u.exec(trimmed);
      if (musicMatch) {
        if (musicDisabledChats.has(chatId)) return;
        const q = (musicMatch[3] ?? "").trim();
        if (q.length > 0) {
          void handleMusicSearch(bot, chatId, q, ctx.message.message_id);
        } else {
          ctx.reply(
            `🎵 اكتب اسم الأغنية بعد الكلمة\n<code>يوت love song marcy</code>`,
            { parse_mode: "HTML" },
          ).catch(() => {});
        }
        return;
      }
    }

    // ── الدائرة القاتلة — text handler ──────────────────────────────────────────
    {
      const cs = gameStates.get(chatId);
      if (cs?.type === "circle" && cs.phase === "playing" && cs.players.has(uid)) {
        handleCircleText(bot, chatId, uid, text, Date.now());
        // don't return — still process other handlers (trustbreak victim resolve, etc.)
      }
    }

    // ── تحدي الكنبة — text handler ───────────────────────────────────────────────
    {
      const cs = gameStates.get(chatId);
      if (cs?.type === "couch" && (cs.phase === "playing" || cs.phase === "sofa_active" || cs.phase === "double_sofa")) {
        handleCouchText(bot, chatId, uid, text);
      }
    }

    // Resolve victim ID
    const s = gameStates.get(chatId);
    if (s?.type === "trustbreak") {
      const resolved = resolveVictimId(s.victim, uid, uname);
      if (resolved && s.victim.id !== 0) victimUserToGame.set(s.victim.id, chatId);
    }

    // Force-reply setup
    const pending = pendingSetup.get(uid);
    const isReply =
      pending &&
      pending.chatId === chatId &&
      ctx.message.reply_to_message?.message_id === pending.promptMsgId;

    if (isReply) {
      pendingSetup.delete(uid);
      const players = extractPlayers(text, ctx.message.entities ?? []);

      if (pending.game === "menvsmen") {
        if (players.length < 2) {
          ctx.reply(`⚠️ لازم تذكر شخصين!\nمثال: <code>@أحمد @فهد</code>`, { parse_mode: "HTML" }).catch(() => {}); return;
        }
        if (players[0].id && players[0].id === players[1].id) {
          ctx.reply("🚫 ما تقدر تختار نفس الشخص!").catch(() => {}); return;
        }
        startMenVsMen(bot, chatId, players[0], players[1], uid);
      } else {
        if (players.length === 0) {
          ctx.reply(`⚠️ لازم تذكر الضحية!\nمثال: <code>@أحمد</code>`, { parse_mode: "HTML" }).catch(() => {}); return;
        }
        startTrustBreak(bot, chatId, players[0], uid, botUsername);
      }
    }
  });

  bot.catch((err) => { logger.error({ err }, "bot error"); });
  bot.launch({ dropPendingUpdates: true });
  logger.info("Telegram bot launched");
  preWarmYtDlp(); // warm up yt-dlp binary in background

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
