import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type BombState, type BombPlayer,
} from "../state.js";
import { generateBombExplosionCard, generateBombWinnerCard } from "../bombCard.js";
import { logger } from "../../lib/logger.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dnB(p: BombPlayer): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return full || (p.username ? `@${p.username}` : String(p.id));
}

function toP(p: BombPlayer) {
  return { id: p.id, username: p.username, name: dnB(p) };
}

function playerList(s: BombState): string {
  return [...s.players.values()].map(p => `• ${esc(dnB(p))}`).join("\n") || "—";
}

function randomTimer(round: number): number {
  const min = Math.max(3_000, 6_000 - round * 200);
  const max = Math.max(6_000, 14_000 - round * 400);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildPassKeyboard(chatId: number, s: BombState) {
  const rows = [...s.players.values()]
    .filter(p => p.id !== s.holderId)
    .map(p => {
      const isFrozen = p.id === s.frozenId;
      const isLastReceiver = p.id === s.prevHolderId && s.players.size > 3;
      let label = dnB(p);
      if (isFrozen)       label = `❄️ ${label}`;
      if (isLastReceiver) label = `↩️ ${label}`;
      return [Markup.button.callback(label, `bomb:pass:${chatId}:${p.id}`)];
    });
  return Markup.inlineKeyboard(rows);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const JOIN_MS      = 60_000;
const JOIN_WARN_MS = 40_000;
const MIN_PLAYERS  = 3;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startBomb(
  bot: Telegraf,
  chatId: number,
  hostId: number,
  hostUsername: string | undefined,
  hostFirst: string,
  hostLast: string,
): Promise<void> {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId, "⚠️ في لعبة شغالة! أوقفوها أولاً بـ /stop").catch(() => {});
    return;
  }

  const s: BombState = {
    type: "bomb",
    phase: "joining",
    players: new Map(),
    eliminated: [],
    hostId,
    round: 0,
    holderId: hostId,
    prevHolderId: null,
    frozenId: null,
  };

  s.players.set(hostId, { id: hostId, username: hostUsername, firstName: hostFirst, lastName: hostLast });
  gameStates.set(chatId, s);

  const msg = await bot.telegram.sendMessage(
    chatId,
    `💣 <b>القنبلة المتنقلة</b>\n\n` +
    `القنبلة تنتقل بين اللاعبين... واللي تنفجر عليه يطلع! 😈\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerList(s)}\n\n` +
    `اضغط <b>➕ انضم</b> للمشاركة!\n<i>اضغط ▶️ ابدأ الآن عندما يكون الكل جاهز</i>`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕  انضم للعبة", `bomb:join:${chatId}`)],
        [Markup.button.callback("▶️  ابدأ الآن",  `bomb:fstart:${chatId}`)],
      ]),
    }
  ).catch(() => null);

  if (msg) s.joinMsgId = msg.message_id;
}

export async function handleBombJoin(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s = gameStates.get(chatId);

  if (!s || s.type !== "bomb" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ التسجيل مو متاح الحين").catch(() => {}); return;
  }
  if (s.players.has(from.id)) {
    await ctx.answerCbQuery("✅ أنت مسجل مسبقاً!").catch(() => {}); return;
  }

  const p: BombPlayer = {
    id: from.id,
    username: from.username,
    firstName: from.first_name ?? "",
    lastName: from.last_name ?? "",
  };
  s.players.set(from.id, p);

  await ctx.answerCbQuery("✅ انضممت!").catch(() => {});
  bot.telegram.sendMessage(
    chatId,
    `✅ <b>${esc(dnB(p))}</b> انضم للعبة! 💣\n👥 اللاعبون (${s.players.size}):\n${playerList(s)}`,
    { parse_mode: "HTML" }
  ).catch(() => {});
}

export async function handleBombForceStart(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s = gameStates.get(chatId);

  if (!s || s.type !== "bomb" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ ما في تسجيل").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط من بدأ اللعبة يقدر يبدأها!").catch(() => {}); return;
  }
  if (s.players.size < MIN_PLAYERS) {
    await ctx.answerCbQuery(`⚠️ ما يكفي لاعبين! (${s.players.size}/${MIN_PLAYERS})`).catch(() => {}); return;
  }

  await ctx.answerCbQuery("💣 تبدأ!").catch(() => {});
  launchBomb(bot, chatId);
}

export async function handleBombPass(
  bot: Telegraf,
  ctx: Context,
  chatId: number,
  targetId: number,
): Promise<void> {
  const from = ctx.from!;
  const s = gameStates.get(chatId);

  if (!s || s.type !== "bomb" || s.phase !== "playing") {
    await ctx.answerCbQuery("❌ اللعبة ما شغالة").catch(() => {}); return;
  }
  if (from.id !== s.holderId) {
    await ctx.answerCbQuery("مو عندك القنبلة! 💣").catch(() => {}); return;
  }
  if (!s.players.has(targetId)) {
    await ctx.answerCbQuery("هذا اللاعب خرج من اللعبة").catch(() => {}); return;
  }
  if (targetId === s.frozenId) {
    await ctx.answerCbQuery("❄️ هذا اللاعب مجمّد! اختر غيره").catch(() => {}); return;
  }
  if (targetId === s.prevHolderId && s.players.size > 3) {
    await ctx.answerCbQuery("↩️ ما تقدر ترجعها لنفس الشخص مباشرة!").catch(() => {}); return;
  }

  // Cancel explosion timer
  if (s.bombTimer) { clearTimeout(s.bombTimer); s.bombTimer = undefined; }

  const prev   = s.players.get(from.id)!;
  const target = s.players.get(targetId)!;

  await ctx.answerCbQuery("💣 رميتها!").catch(() => {});

  // Remove buttons from current message
  ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});

  s.prevHolderId = s.holderId;
  s.holderId     = targetId;
  s.round++;

  await bot.telegram.sendMessage(
    chatId,
    `🎯 <b>${esc(dnB(prev))}</b> رمى القنبلة إلى <b>${esc(dnB(target))}</b>! 💣`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => assignBomb(bot, chatId), 1_200);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function launchBomb(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "bomb" || s.phase !== "joining") return;

  if (s.players.size < MIN_PLAYERS) {
    bot.telegram.sendMessage(
      chatId,
      `❌ ما كفت لاعبين (${s.players.size}/${MIN_PLAYERS}) — اللعبة انتهت.`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    clearGame(chatId);
    return;
  }

  if (s.joinTimer)     clearTimeout(s.joinTimer);
  if (s.joinWarnTimer) clearTimeout(s.joinWarnTimer);

  s.phase = "playing";

  // Random first holder
  const ids    = [...s.players.keys()];
  s.holderId   = ids[Math.floor(Math.random() * ids.length)];
  s.prevHolderId = null;
  s.round      = 1;

  await bot.telegram.sendMessage(
    chatId,
    `💣 <b>القنبلة المتنقلة — انطلقت!</b>\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerList(s)}\n\n` +
    `⚠️ <b>القواعد:</b>\n` +
    `• ما تقدر ترجعها لنفس الشخص مباشرة\n` +
    `• الوقت عشوائي — محد يعرف متى تنفجر! 💥\n` +
    `• التأخير = انفجار عليك! 😈\n` +
    `• آخر واحد يبقى = الفائز 👑\n\n` +
    `<i>القنبلة تنطلق الآن...</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => assignBomb(bot, chatId), 2_000);
}

async function assignBomb(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "bomb" || s.phase !== "playing") return;

  // Make sure holder is still in game
  if (!s.players.has(s.holderId)) {
    const ids = [...s.players.keys()];
    if (ids.length === 0) { clearGame(chatId); return; }
    s.holderId = ids[Math.floor(Math.random() * ids.length)];
  }

  const holder = s.players.get(s.holderId)!;

  // Every 4th pass round: pick a frozen player
  s.frozenId = null;
  const isSpecial = s.round % 4 === 0 && s.players.size > 3;
  if (isSpecial) {
    const others = [...s.players.keys()].filter(id => id !== s.holderId);
    if (others.length > 0) {
      s.frozenId = others[Math.floor(Math.random() * others.length)];
    }
  }

  const frozenP = s.frozenId ? s.players.get(s.frozenId) : null;
  const timer   = randomTimer(s.round);

  let specialLine = "";
  if (isSpecial && frozenP) {
    specialLine = `\n❄️ <b>${esc(dnB(frozenP))}</b> مجمّد — لا يمكن تمرير القنبلة له هذه الجولة!`;
  }

  const msg = await bot.telegram.sendMessage(
    chatId,
    `💣 <b>الجولة ${s.round}:</b>\n\n` +
    `🔥 <b>${esc(dnB(holder))}</b> — القنبلة عندك!\n\n` +
    `⏱ <b>مرّرها الآن قبل أن تنفجر!</b>\n` +
    `<i>الوقت عشوائي — محد يعرف متى... 😱</i>` +
    specialLine,
    {
      parse_mode: "HTML",
      ...buildPassKeyboard(chatId, s),
    }
  ).catch(() => null);

  if (msg) s.bombMsgId = msg.message_id;

  s.bombTimer = setTimeout(() => explodeBomb(bot, chatId), timer);
}

async function explodeBomb(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "bomb" || s.phase !== "playing") return;

  const holder = s.players.get(s.holderId);
  if (!holder) { clearGame(chatId); return; }

  // Remove buttons from last bomb message
  if (s.bombMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.bombMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
    s.bombMsgId = undefined;
  }

  s.players.delete(s.holderId);
  s.eliminated.push(holder);

  // Explosion card
  try {
    const buf = await generateBombExplosionCard(dnB(holder));
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption: `💥 <b>انفجرت على ${esc(dnB(holder))}!</b>\n\nطلع من اللعبة 😈`,
      parse_mode: "HTML",
    });
  } catch (e) {
    logger.warn({ err: e }, "bomb explosion card failed");
    await bot.telegram.sendMessage(
      chatId,
      `💥💥💥\n<b>BOOM!</b>\n\nانفجرت على <b>${esc(dnB(holder))}</b>! 😈\nطلع من اللعبة!`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  // Check win
  if (s.players.size === 1) {
    const winner = [...s.players.values()][0];
    await endBomb(bot, chatId, winner);
    return;
  }

  if (s.players.size === 0) {
    await bot.telegram.sendMessage(chatId, `💣 انتهت اللعبة! ما في فائز 😅`, { parse_mode: "HTML" }).catch(() => {});
    clearGame(chatId);
    return;
  }

  // Remaining players list
  await bot.telegram.sendMessage(
    chatId,
    `👥 <b>المتبقون (${s.players.size}):</b>\n${playerList(s)}\n\n<i>القنبلة تنطلق من جديد...</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  // New random holder for next explosion round
  const ids     = [...s.players.keys()];
  s.holderId    = ids[Math.floor(Math.random() * ids.length)];
  s.prevHolderId = null;
  s.frozenId    = null;
  s.round++;

  setTimeout(() => assignBomb(bot, chatId), 2_500);
}

async function endBomb(bot: Telegraf, chatId: number, winner: BombPlayer): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "bomb") return;

  s.phase = "done";

  const all = [...s.players.values(), ...s.eliminated];
  for (const p of all) {
    if (p.id === winner.id) recordWin(chatId, toP(p));
    else recordGame(chatId, [toP(p)]);
  }

  try {
    const buf = await generateBombWinnerCard(dnB(winner));
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption: `👑 <b>${esc(dnB(winner))}</b> هو الناجي الوحيد!\nلم تنفجر عليه القنبلة أبداً 🏆`,
      parse_mode: "HTML",
    });
  } catch (e) {
    logger.warn({ err: e }, "bomb winner card failed");
    await bot.telegram.sendMessage(
      chatId,
      `🏆 <b>الفائز:</b> ${esc(dnB(winner))} 👑\nناجي من القنبلة المتنقلة! 🎊`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  clearGame(chatId);
}
