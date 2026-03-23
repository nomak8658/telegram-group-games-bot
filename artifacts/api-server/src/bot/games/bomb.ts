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

// Timer shortens as pass count grows: starts 6-14s, ends ~3-6s
function randomTimer(passCount: number): number {
  const base = Math.max(13_000 - passCount * 400, 5_000);
  const spread = Math.max(base * 0.4, 2_000);
  return Math.floor(Math.random() * spread) + (base - spread / 2);
}

function buildPassKeyboard(chatId: number, s: BombState) {
  // When 2 players remain: allow passing back to the only other player (ignore prevHolderId)
  const canBlock = s.players.size > 2;
  const rows = [...s.players.values()]
    .filter(p => p.id !== s.holderId)
    .map(p => {
      const isLast = canBlock && p.id === s.prevHolderId;
      const label  = isLast ? `${dnB(p)}  ↩` : dnB(p);
      return [Markup.button.callback(label, `bomb:pass:${chatId}:${p.id}`)];
    });
  return Markup.inlineKeyboard(rows);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_PLAYERS = 3;

// Track passing in-progress to avoid race-condition duplicates (single-threaded but safety net)
const passingNow = new Set<number>();

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

  s.players.set(hostId, {
    id: hostId, username: hostUsername,
    firstName: hostFirst, lastName: hostLast,
  });
  gameStates.set(chatId, s);

  const msg = await bot.telegram.sendMessage(
    chatId,
    `💣 <b>القنبلة المتنقلة</b>\n\n` +
    `القنبلة تنتقل بين اللاعبين — واللي تنفجر عليه يطلع! 😈\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerList(s)}\n\n` +
    `اضغط <b>➕ انضم</b> للمشاركة\n` +
    `<i>اضغط ▶️ ابدأ الآن عندما يكون الكل جاهز</i>`,
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
  const s    = gameStates.get(chatId);

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
    lastName:  from.last_name  ?? "",
  };
  s.players.set(from.id, p);

  await ctx.answerCbQuery("✅ انضممت!").catch(() => {});
  bot.telegram.sendMessage(
    chatId,
    `✅ <b>${esc(dnB(p))}</b> انضم للعبة!\n👥 اللاعبون (${s.players.size}):\n${playerList(s)}`,
    { parse_mode: "HTML" }
  ).catch(() => {});
}

export async function handleBombForceStart(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "bomb" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ ما في تسجيل").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط من أنشأ اللعبة يقدر يبدأها!").catch(() => {}); return;
  }
  if (s.players.size < MIN_PLAYERS) {
    await ctx.answerCbQuery(`⚠️ ما يكفي لاعبين! (${s.players.size}/${MIN_PLAYERS})`).catch(() => {}); return;
  }

  await ctx.answerCbQuery("💣 تبدأ الآن!").catch(() => {});
  launchBomb(bot, chatId);
}

export async function handleBombPass(
  bot: Telegraf,
  ctx: Context,
  chatId: number,
  targetId: number,
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "bomb" || s.phase !== "playing") {
    await ctx.answerCbQuery("❌ اللعبة مو شغالة").catch(() => {}); return;
  }
  if (from.id !== s.holderId) {
    await ctx.answerCbQuery("مو عندك القنبلة!").catch(() => {}); return;
  }
  if (!s.players.has(targetId)) {
    await ctx.answerCbQuery("هذا اللاعب خرج من اللعبة").catch(() => {}); return;
  }
  // Block passing back only when > 2 players remain
  if (targetId === s.prevHolderId && s.players.size > 2) {
    await ctx.answerCbQuery("ما تقدر ترجعها لنفس الشخص مباشرة!").catch(() => {}); return;
  }
  // Guard against simultaneous presses
  if (passingNow.has(chatId)) {
    await ctx.answerCbQuery("...").catch(() => {}); return;
  }

  passingNow.add(chatId);

  // Cancel explosion timer immediately
  if (s.bombTimer) { clearTimeout(s.bombTimer); s.bombTimer = undefined; }

  const prev   = s.players.get(from.id)!;
  const target = s.players.get(targetId)!;

  await ctx.answerCbQuery("💣 رميتها!").catch(() => {});
  ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});

  s.prevHolderId = s.holderId;
  s.holderId     = targetId;
  s.round++;

  passingNow.delete(chatId);

  await bot.telegram.sendMessage(
    chatId,
    `🎯 <b>${esc(dnB(prev))}</b>  ➜  <b>${esc(dnB(target))}</b>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => assignBomb(bot, chatId), 900);
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
    clearGame(chatId); return;
  }

  s.phase = "playing";

  const ids  = [...s.players.keys()];
  s.holderId = ids[Math.floor(Math.random() * ids.length)];
  s.prevHolderId = null;
  s.round = 0;

  await bot.telegram.sendMessage(
    chatId,
    `💣 <b>القنبلة المتنقلة — انطلقت!</b>\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerList(s)}\n\n` +
    `<b>القواعد:</b>\n` +
    `• مرّر القنبلة بضغط اسم أي لاعب\n` +
    `• ما تقدر ترجعها مباشرة لنفس اللي أرسلها\n` +
    `• وقت الانفجار سري وعشوائي\n` +
    `• آخر واحد يبقى = الفائز\n\n` +
    `<i>القنبلة تنطلق...</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => assignBomb(bot, chatId), 1_800);
}

async function assignBomb(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "bomb" || s.phase !== "playing") return;

  // Ensure holder is still active
  if (!s.players.has(s.holderId)) {
    const ids = [...s.players.keys()];
    if (!ids.length) { clearGame(chatId); return; }
    s.holderId = ids[Math.floor(Math.random() * ids.length)];
  }

  const holder  = s.players.get(s.holderId)!;
  const timerMs = randomTimer(s.round);
  const timerSec = Math.round(timerMs / 1000);

  const msg = await bot.telegram.sendMessage(
    chatId,
    `💣 <b>${esc(dnB(holder))}</b> — القنبلة عندك!\n` +
    `<i>مرّرها قبل أن تنفجر... الوقت عشوائي!</i>`,
    {
      parse_mode: "HTML",
      ...buildPassKeyboard(chatId, s),
    }
  ).catch(() => null);

  if (msg) s.bombMsgId = msg.message_id;

  s.bombTimer = setTimeout(() => explodeBomb(bot, chatId), timerMs);
}

async function explodeBomb(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "bomb" || s.phase !== "playing") return;

  // Remove buttons
  if (s.bombMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.bombMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
    s.bombMsgId = undefined;
  }

  const holder = s.players.get(s.holderId);
  if (!holder) { clearGame(chatId); return; }

  s.players.delete(s.holderId);
  s.eliminated.push(holder);

  // Explosion card
  try {
    const buf = await generateBombExplosionCard(dnB(holder));
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption:    `💥 <b>BOOM!</b>  —  انفجرت على <b>${esc(dnB(holder))}</b>!\n\nطلع من اللعبة.`,
      parse_mode: "HTML",
    });
  } catch (e) {
    logger.warn({ err: e }, "bomb explosion card failed");
    await bot.telegram.sendMessage(
      chatId,
      `💥 <b>BOOM!</b>  —  انفجرت على <b>${esc(dnB(holder))}</b>!\nطلع من اللعبة.`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  // Win check
  if (s.players.size === 1) {
    await endBomb(bot, chatId, [...s.players.values()][0]); return;
  }
  if (s.players.size === 0) {
    await bot.telegram.sendMessage(chatId, `💣 انتهت اللعبة — ما في فائز!`, { parse_mode: "HTML" }).catch(() => {});
    clearGame(chatId); return;
  }

  // Next round
  await bot.telegram.sendMessage(
    chatId,
    `👥 <b>المتبقون (${s.players.size}):</b>\n${playerList(s)}`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  const ids  = [...s.players.keys()];
  s.holderId = ids[Math.floor(Math.random() * ids.length)];
  s.prevHolderId = null;
  s.frozenId     = null;

  setTimeout(() => assignBomb(bot, chatId), 2_000);
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
      caption:    `🏆 <b>${esc(dnB(winner))}</b> هو الناجي الوحيد!\nلم تنفجر عليه القنبلة — مبروك!`,
      parse_mode: "HTML",
    });
  } catch (e) {
    logger.warn({ err: e }, "bomb winner card failed");
    await bot.telegram.sendMessage(
      chatId,
      `🏆 <b>الفائز:</b> ${esc(dnB(winner))}\nناجي من القنبلة المتنقلة! مبروك!`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  clearGame(chatId);
}
