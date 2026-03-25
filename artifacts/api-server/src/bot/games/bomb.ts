import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type BombState, type BombPlayer,
} from "../state.js";
import {
  generateBombHoldCard,
  generateBombExplosionCard,
  generateBombWinnerCard,
} from "../bombCard.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_PLAYERS = 3;

// Timer: starts at ~16s, shrinks 400ms per pass, min ~5s. Plus ±2s random.
function randomTimer(passCount: number): number {
  const base   = Math.max(16_000 - passCount * 400, 5_000);
  const spread = Math.min(base * 0.40, 3_000);
  return Math.floor(Math.random() * spread * 2) + (base - spread);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dnB(p: BombPlayer): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return full || (p.username ? `@${p.username}` : String(p.id));
}
function toP(p: BombPlayer) {
  return { id: p.id, username: p.username, name: dnB(p) };
}
function playerLine(players: Map<number, BombPlayer>): string {
  return [...players.values()].map(p => `• ${esc(dnB(p))}`).join("\n") || "—";
}
function buildPassKeyboard(chatId: number, s: BombState) {
  const rows = [...s.players.values()]
    .filter(p => p.id !== s.holderId)
    .map(p => {
      const blocked = s.players.size > 2 && p.id === s.prevHolderId;
      const label   = blocked ? `${dnB(p)}  ↩` : dnB(p);
      return [Markup.button.callback(label, `bomb:pass:${chatId}:${p.id}`)];
    });
  return Markup.inlineKeyboard(rows);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startBomb(
  bot: Telegraf, chatId: number,
  hostId: number, hostUsername: string | undefined,
  hostFirst: string, hostLast: string,
): Promise<void> {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId,
      "⚠️ في لعبة شغالة! أوقفوها أولاً بـ /stop",
      { parse_mode: "HTML" }
    ).catch(() => {});
    return;
  }

  const s: BombState = {
    type: "bomb", phase: "joining",
    players: new Map(), eliminated: [],
    hostId, round: 0,
    holderId: hostId, prevHolderId: null, frozenId: null,
    bombSeq: 0, passing: false,
  };
  s.players.set(hostId, { id: hostId, username: hostUsername, firstName: hostFirst, lastName: hostLast });
  gameStates.set(chatId, s);

  const msg = await bot.telegram.sendMessage(chatId,
    `💣 <b>القنبلة المتنقلة</b>\n\n` +
    `القنبلة تنتقل بين اللاعبين — اللي تنفجر عليه يطلع!\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerLine(s.players)}\n\n` +
    `<i>اضغط ▶️ ابدأ عندما يكون الكل جاهز (3 على الأقل)</i>`,
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

export async function handleBombJoin(
  bot: Telegraf, ctx: Context, chatId: number,
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "bomb" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ التسجيل مو متاح الحين").catch(() => {}); return;
  }
  if (s.players.has(from.id)) {
    await ctx.answerCbQuery("✅ أنت مسجل مسبقاً!").catch(() => {}); return;
  }

  s.players.set(from.id, {
    id: from.id, username: from.username,
    firstName: from.first_name ?? "", lastName: from.last_name ?? "",
  });
  await ctx.answerCbQuery("✅ انضممت!").catch(() => {});

  if (s.joinMsgId) {
    bot.telegram.editMessageText(chatId, s.joinMsgId, undefined,
      `💣 <b>القنبلة المتنقلة</b>\n\n` +
      `القنبلة تنتقل بين اللاعبين — اللي تنفجر عليه يطلع!\n\n` +
      `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerLine(s.players)}\n\n` +
      `<i>اضغط ▶️ ابدأ عندما يكون الكل جاهز</i>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("➕  انضم للعبة", `bomb:join:${chatId}`)],
          [Markup.button.callback("▶️  ابدأ الآن",  `bomb:fstart:${chatId}`)],
        ]),
      }
    ).catch(() => {});
  }
}

export async function handleBombForceStart(
  bot: Telegraf, ctx: Context, chatId: number,
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "bomb" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ ما في تسجيل نشط").catch(() => {}); return;
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
  bot: Telegraf, ctx: Context, chatId: number, targetId: number,
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "bomb" || s.phase !== "playing") {
    await ctx.answerCbQuery("❌ اللعبة مو شغالة").catch(() => {}); return;
  }
  if (from.id !== s.holderId) {
    await ctx.answerCbQuery("🚫 مو عندك القنبلة!").catch(() => {}); return;
  }
  if (!s.players.has(targetId)) {
    await ctx.answerCbQuery("⚠️ هذا اللاعب خرج من اللعبة").catch(() => {}); return;
  }
  if (targetId === s.prevHolderId && s.players.size > 2) {
    await ctx.answerCbQuery("🔄 ما تقدر ترجعها لنفس الشخص مباشرة!").catch(() => {}); return;
  }

  // ── Guard: block concurrent passes ────────────────────────────────────
  if (s.passing) {
    await ctx.answerCbQuery("⏳").catch(() => {}); return;
  }
  s.passing = true;

  // ── Cancel current bomb timer (invalidate via bombSeq) ─────────────────
  if (s.bombTimer) { clearTimeout(s.bombTimer); s.bombTimer = undefined; }
  s.bombSeq++; // any queued callback that captured the OLD seq will be ignored

  const passer = s.players.get(from.id)!;
  const target = s.players.get(targetId)!;

  await ctx.answerCbQuery("💣 رميتها!").catch(() => {});

  // Remove buttons from current bomb card
  if (s.bombMsgId) {
    bot.telegram.editMessageReplyMarkup(
      chatId, s.bombMsgId, undefined, { inline_keyboard: [] }
    ).catch(() => {});
    s.bombMsgId = undefined;
  }

  // Update state
  s.prevHolderId = s.holderId;
  s.holderId     = targetId;
  s.round++;

  // Quick pass announcement
  await bot.telegram.sendMessage(chatId,
    `🎯 <b>${esc(dnB(passer))}</b>  →  <b>${esc(dnB(target))}</b>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  // Assign bomb to new holder (s.passing cleared inside assignBomb)
  setTimeout(() => assignBomb(bot, chatId), 600);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function launchBomb(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "bomb" || s.phase !== "joining") return;

  if (s.players.size < MIN_PLAYERS) {
    bot.telegram.sendMessage(chatId,
      `❌ ما كفت لاعبين (${s.players.size}/${MIN_PLAYERS}) — اللعبة ملغاة.`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    clearGame(chatId); return;
  }

  // Remove join buttons
  if (s.joinMsgId) {
    bot.telegram.editMessageReplyMarkup(
      chatId, s.joinMsgId, undefined, { inline_keyboard: [] }
    ).catch(() => {});
  }

  s.phase   = "playing";
  s.round   = 0;
  s.passing = false;

  // Pick random starting holder
  const ids  = [...s.players.keys()];
  s.holderId     = ids[Math.floor(Math.random() * ids.length)];
  s.prevHolderId = null;

  await bot.telegram.sendMessage(chatId,
    `💣 <b>القنبلة المتنقلة — انطلقت!</b>\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerLine(s.players)}\n\n` +
    `• مرّر القنبلة بضغط اسم لاعب\n` +
    `• ما تقدر ترجعها لنفس اللي أرسلها مباشرة\n` +
    `• وقت الانفجار سري وعشوائي 🎲\n` +
    `• الوقت يقصر مع كل تمريرة!\n` +
    `• آخر واحد يبقى = الفائز 🏆`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => assignBomb(bot, chatId), 1_500);
}

async function assignBomb(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "bomb" || s.phase !== "playing") return;

  // Clear passing flag — new pass is now allowed
  s.passing = false;

  // Safety: ensure holderId is a valid active player
  if (!s.players.has(s.holderId)) {
    const ids = [...s.players.keys()];
    if (!ids.length) { clearGame(chatId); return; }
    s.holderId = ids[Math.floor(Math.random() * ids.length)];
  }

  const holder  = s.players.get(s.holderId)!;
  const timerMs = randomTimer(s.round);

  // Generate bomb card photo
  const allNames = [...s.players.values()].map(p => dnB(p));
  let buf: Buffer | null = null;
  try {
    buf = await generateBombHoldCard(dnB(holder), allNames, s.round);
  } catch { /* text fallback */ }

  const caption =
    `💣 <b>${esc(dnB(holder))}</b>  ‹ القنبلة عندك! ›\n` +
    `<i>مرّرها بسرعة قبل ما تنفجر...</i>`;

  let sent: { message_id: number } | null = null;
  if (buf) {
    sent = await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption, parse_mode: "HTML",
      ...buildPassKeyboard(chatId, s),
    }).catch(() => null);
  }
  // Fallback to text if photo fails
  if (!sent) {
    sent = await bot.telegram.sendMessage(chatId, caption, {
      parse_mode: "HTML",
      ...buildPassKeyboard(chatId, s),
    }).catch(() => null);
  }

  if (sent) s.bombMsgId = sent.message_id;

  // ── Schedule explosion with sequence guard ────────────────────────────
  s.bombSeq++;
  const mySeq = s.bombSeq;

  s.bombTimer = setTimeout(async () => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "bomb" || ss.phase !== "playing") return;
    if (ss.bombSeq !== mySeq) return; // stale — a pass already happened
    await explodeBomb(bot, chatId);
  }, timerMs);
}

async function explodeBomb(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "bomb" || s.phase !== "playing") return;

  // Snapshot the holder at the TIME of explosion
  const holder = s.players.get(s.holderId);
  if (!holder) {
    // Holder already gone (edge case) — pick a new random and explode them
    const ids = [...s.players.keys()];
    if (!ids.length) { clearGame(chatId); return; }
    s.holderId = ids[Math.floor(Math.random() * ids.length)];
    const fallback = s.players.get(s.holderId)!;
    s.players.delete(s.holderId);
    s.eliminated.push(fallback);
    await checkWinOrContinue(bot, chatId, fallback); return;
  }

  // Remove bomb card buttons
  if (s.bombMsgId) {
    bot.telegram.editMessageReplyMarkup(
      chatId, s.bombMsgId, undefined, { inline_keyboard: [] }
    ).catch(() => {});
    s.bombMsgId = undefined;
  }

  s.players.delete(s.holderId);
  s.eliminated.push(holder);

  // Send explosion card
  const remaining = s.players.size;
  let buf: Buffer | null = null;
  try { buf = await generateBombExplosionCard(dnB(holder), remaining); } catch { /* fallback */ }

  const caption = `💥 <b>BOOM!</b>  —  <b>${esc(dnB(holder))}</b> يطلع من اللعبة!`;
  if (buf) {
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption, parse_mode: "HTML",
    }).catch(() => {
      bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
    });
  } else {
    await bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
  }

  await checkWinOrContinue(bot, chatId, holder);
}

async function checkWinOrContinue(
  bot: Telegraf, chatId: number, _eliminated: BombPlayer,
): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "bomb") return;

  if (s.players.size === 0) {
    await bot.telegram.sendMessage(chatId,
      `💣 اللعبة انتهت — انفجرت على الجميع!`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    clearGame(chatId); return;
  }

  if (s.players.size === 1) {
    await endBomb(bot, chatId, [...s.players.values()][0]); return;
  }

  // Show remaining players
  const names = [...s.players.values()].map(p => `<b>${esc(dnB(p))}</b>`).join("  •  ");
  await bot.telegram.sendMessage(chatId,
    `👥 <b>المتبقون (${s.players.size}):</b>  ${names}`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  // Pick a new random holder (avoid same eliminated player obviously)
  const ids = [...s.players.keys()];
  s.holderId     = ids[Math.floor(Math.random() * ids.length)];
  s.prevHolderId = null;
  s.frozenId     = null;
  s.passing      = false;

  setTimeout(() => assignBomb(bot, chatId), 1_400);
}

async function endBomb(
  bot: Telegraf, chatId: number, winner: BombPlayer,
): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "bomb") return;
  s.phase = "done";

  // Record scores
  recordWin(chatId, toP(winner));
  for (const p of s.eliminated) recordGame(chatId, [toP(p)]);

  // Send winner card
  let buf: Buffer | null = null;
  try { buf = await generateBombWinnerCard(dnB(winner)); } catch { /* fallback */ }

  const caption =
    `🏆 <b>${esc(dnB(winner))}</b> هو الناجي الوحيد!\n` +
    `لم تنفجر عليه القنبلة — مبروك! 🎉\n\n` +
    `<i>جولة أخرى؟  /bomb</i>`;

  if (buf) {
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption, parse_mode: "HTML",
    }).catch(() => {
      bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
    });
  } else {
    await bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
  }

  clearGame(chatId);
}
