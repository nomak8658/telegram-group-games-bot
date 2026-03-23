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

function menuMsg() {
  return (
    `🎮 <b>اختار لعبتك</b>\n\n` +
    `🥊 <b>مين ضد مين</b>\n<i>موضوع عشوائي — شخصان يتجادلان والقروب يصوت</i>\n\n` +
    `💀 <b>كسر الثقة</b>\n<i>الكل يكتب رأيه الصريح سراً، والضحية تخمن كاتب الأقسى</i>\n\n` +
    `🎭 <b>المافيا</b>\n<i>نقاش مفتوح، أدوار سرية، تصويت — من يكشف المافيا أولاً؟</i>`
  );
}

function menuKeyboard(chatId: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🥊  مين ضد مين",  `menu:mvs:${chatId}`)],
    [Markup.button.callback("💀  كسر الثقة",   `menu:tb:${chatId}`)],
    [Markup.button.callback("🎭  المافيا",      `menu:mafia:${chatId}`)],
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
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) { logger.error("TELEGRAM_BOT_TOKEN not set"); return; }

  // Load persisted leaderboard from disk (safe no-op if file missing)
  loadLeaderboard();
  logger.info("Leaderboard loaded");

  const bot = new Telegraf(token);
  let botUsername = "bot";

  try {
    const me = await bot.telegram.getMe();
    botUsername = me.username ?? "bot";
    logger.info({ username: botUsername }, "Bot connected");
  } catch (e) {
    logger.error({ err: e }, "Failed to get bot info");
    return;
  }

  // /start — deep links
  bot.start((ctx) => {
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

  bot.command("mafia", (ctx) => {
    if (ctx.chat.type === "private") { ctx.reply("🚫 للقروبات فقط!").catch(() => {}); return; }
    startMafia(bot, ctx.chat.id, ctx.from.id, botUsername);
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

      await ctx.answerCbQuery().catch(() => {});
    } catch (e) {
      logger.error({ err: e }, "callback error");
      await ctx.answerCbQuery("⚠️ حصل خطأ").catch(() => {});
    }
  });

  // ─── Text messages ───────────────────────────────────────────────────────────

  bot.on(message("text"), (ctx) => {
    const uid = ctx.from.id;
    const uname = ctx.from.username;
    const text = ctx.message.text ?? "";

    // Private chat
    if (ctx.chat.type === "private") {
      // Check if this user is in a mafia game (just needs DM channel open — no text action needed)
      const chatId = privateUserToGame.get(uid);
      if (chatId) {
        const gs = gameStates.get(chatId);
        if (gs?.type === "mafia") {
          ctx.reply("🎭 المافيا — الطبيب والمحقق يتصرفون عبر الأزرار في بداية كل جولة.\nالتصويت في القروب! 🗳️").catch(() => {});
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

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
