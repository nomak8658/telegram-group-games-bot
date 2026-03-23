import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type StopwatchState, type StopwatchPlayer,
} from "../state.js";
import { generateStopwatchResultCard } from "../stopwatchCard.js";
import { logger } from "../../lib/logger.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dnS(p: StopwatchPlayer): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return full || (p.username ? `@${p.username}` : String(p.id));
}

function toP(p: StopwatchPlayer) {
  return { id: p.id, username: p.username, name: dnS(p) };
}

function fmtMs(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(2) + " ث";
}

function makeBar(remainingMs: number, totalMs: number, len = 14): string {
  const ratio  = Math.max(0, remainingMs / totalMs);
  const filled = Math.round(ratio * len);
  return "▓".repeat(filled) + "░".repeat(len - filled);
}

function fmtDisplay(remainingMs: number): string {
  const s = Math.max(0, remainingMs / 1000);
  const int = Math.floor(s);
  const dec = Math.floor((s - int) * 10);
  return `${String(int).padStart(2, "0")}.${dec}`;
}

function buildPlayerList(s: StopwatchState): string {
  return [...s.players.values()].map(p => `• ${esc(dnS(p))}`).join("\n") || "—";
}

const GAME_DURATION_MS = 20_000; // 20 seconds
const UPDATE_MS        = 700;    // edit countdown message every 700ms
const MIN_PLAYERS      = 2;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startStopwatch(
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

  const s: StopwatchState = {
    type: "stopwatch",
    phase: "joining",
    hostId,
    players: new Map(),
    startTime: 0,
    durationMs: GAME_DURATION_MS,
  };

  s.players.set(hostId, {
    id: hostId, username: hostUsername,
    firstName: hostFirst, lastName: hostLast,
  });
  gameStates.set(chatId, s);

  const msg = await bot.telegram.sendMessage(
    chatId,
    `⏰ <b>سلك الموت الموقوت</b>\n\n` +
    `عداد تنازلي من 20 ثانية — اضغط أقرب ما تقدر من الصفر!\n` +
    `💀 من يصل للصفر تنفجر عليه القنبلة!\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${buildPlayerList(s)}\n\n` +
    `<i>اضغط ▶️ ابدأ عندما يكون الكل جاهز</i>`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕  انضم للعبة",   `sw:join:${chatId}`)],
        [Markup.button.callback("▶️  ابدأ الآن",    `sw:start:${chatId}`)],
      ]),
    }
  ).catch(() => null);

  if (msg) s.joinMsgId = msg.message_id;
}

export async function handleStopwatchJoin(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "stopwatch" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ التسجيل مو متاح الحين").catch(() => {}); return;
  }
  if (s.players.has(from.id)) {
    await ctx.answerCbQuery("✅ أنت مسجل مسبقاً!").catch(() => {}); return;
  }

  const p: StopwatchPlayer = {
    id: from.id, username: from.username,
    firstName: from.first_name ?? "", lastName: from.last_name ?? "",
  };
  s.players.set(from.id, p);
  await ctx.answerCbQuery("✅ انضممت!").catch(() => {});

  if (s.joinMsgId) {
    bot.telegram.editMessageText(
      chatId, s.joinMsgId, undefined,
      `⏰ <b>سلك الموت الموقوت</b>\n\n` +
      `عداد تنازلي من 20 ثانية — اضغط أقرب ما تقدر من الصفر!\n` +
      `💀 من يصل للصفر تنفجر عليه القنبلة!\n\n` +
      `👥 <b>اللاعبون (${s.players.size}):</b>\n${buildPlayerList(s)}\n\n` +
      `<i>اضغط ▶️ ابدأ عندما يكون الكل جاهز</i>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("➕  انضم للعبة",   `sw:join:${chatId}`)],
          [Markup.button.callback("▶️  ابدأ الآن",    `sw:start:${chatId}`)],
        ]),
      }
    ).catch(() => {});
  }
}

export async function handleStopwatchForceStart(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "stopwatch" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ ما في تسجيل").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط من أنشأ اللعبة يقدر يبدأها!").catch(() => {}); return;
  }
  if (s.players.size < MIN_PLAYERS) {
    await ctx.answerCbQuery(`⚠️ ما يكفي لاعبين! (${s.players.size}/${MIN_PLAYERS})`).catch(() => {}); return;
  }

  await ctx.answerCbQuery("⏰ الآن!").catch(() => {});
  ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});

  launchStopwatch(bot, chatId);
}

export async function handleStopwatchPress(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const pressedAt = Date.now(); // record immediately
  const from      = ctx.from!;
  const s         = gameStates.get(chatId);

  if (!s || s.type !== "stopwatch" || s.phase !== "countdown") {
    await ctx.answerCbQuery("❌ اللعبة مو شغالة").catch(() => {}); return;
  }
  if (!s.players.has(from.id)) {
    await ctx.answerCbQuery("⛔ أنت مو في اللعبة").catch(() => {}); return;
  }

  const p = s.players.get(from.id)!;
  if (p.pressedAt !== undefined) {
    await ctx.answerCbQuery("✅ ضغطت مسبقاً!").catch(() => {}); return;
  }

  const remaining = s.startTime + s.durationMs - pressedAt;
  p.pressedAt = pressedAt;
  p.remaining = remaining;

  if (remaining <= 0) {
    await ctx.answerCbQuery("💥 انفجرت عليك!").catch(() => {});
  } else {
    await ctx.answerCbQuery(`⏱ ${fmtMs(remaining)} — حفظت توقيتك!`).catch(() => {});
  }

  // Update status message
  updateStatusMessage(bot, chatId, s);

  // Check if all pressed
  const all = [...s.players.values()];
  if (all.every(p => p.pressedAt !== undefined)) {
    // All pressed — end early
    if (s.countdownInterval) { clearInterval(s.countdownInterval); s.countdownInterval = undefined; }
    if (s.bombTimer)          { clearTimeout(s.bombTimer);          s.bombTimer          = undefined; }
    await new Promise(r => setTimeout(r, 1_200));
    endStopwatch(bot, chatId);
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function launchStopwatch(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "stopwatch") return;

  s.phase = "countdown";

  const players = [...s.players.values()];

  // Send countdown message (will be edited by interval)
  const cMsg = await bot.telegram.sendMessage(
    chatId,
    buildCountdownText(GAME_DURATION_MS, GAME_DURATION_MS),
    { parse_mode: "HTML" }
  ).catch(() => null);

  if (cMsg) s.countdownMsgId = cMsg.message_id;

  // Send status + button message
  const sMsg = await bot.telegram.sendMessage(
    chatId,
    buildStatusText(s),
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([[
        Markup.button.callback("💥  أوقف القنبلة!", `sw:press:${chatId}`),
      ]]),
    }
  ).catch(() => null);

  if (sMsg) s.statusMsgId = sMsg.message_id;

  // Record start time AFTER messages sent (to be fair)
  s.startTime = Date.now();

  // Countdown update interval
  s.countdownInterval = setInterval(() => tickCountdown(bot, chatId), UPDATE_MS);

  // Bomb explosion timer
  s.bombTimer = setTimeout(() => explodeAll(bot, chatId), GAME_DURATION_MS);
}

function buildCountdownText(remainingMs: number, totalMs: number): string {
  const display = fmtDisplay(remainingMs);
  const bar     = makeBar(remainingMs, totalMs);
  const sec     = remainingMs / 1000;

  const urgency = sec <= 3  ? `\n🔴 <b>اضغط الآن قبل فوات الأوان!</b>`
    : sec <= 7  ? `\n⚡ وقت قصير!`
    : "";

  return (
    `💣 <b>سلك الموت الموقوت</b>\n\n` +
    `<b>${bar}</b>\n` +
    `<b>⏱  ${display}</b>\n\n` +
    `اضغط أقرب ما تقدر من الصفر دون أن تصله!${urgency}`
  );
}

function buildStatusText(s: StopwatchState): string {
  const all     = [...s.players.values()];
  const pressed = all.filter(p => p.pressedAt !== undefined);
  const waiting = all.filter(p => p.pressedAt === undefined);

  let txt = `🎯 <b>اضغط في أقرب لحظة من الصفر!</b>\n💀 الصفر = انفجار فوري!\n\n`;

  if (pressed.length > 0) {
    txt += `✅ <b>ضغطوا (${pressed.length}/${all.length}):</b>\n`;
    for (const p of pressed) {
      const rem = p.remaining!;
      if (rem <= 0) {
        txt += `• ${esc(dnS(p))} — 💥 انفجرت!\n`;
      } else {
        txt += `• ${esc(dnS(p))} — ${fmtMs(rem)}\n`;
      }
    }
    txt += "\n";
  }

  if (waiting.length > 0) {
    txt += `⏳ <b>ينتظرون:</b> ${waiting.map(p => esc(dnS(p))).join("، ")}`;
  }

  return txt;
}

async function tickCountdown(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "stopwatch" || s.phase !== "countdown" || !s.countdownMsgId) return;

  const elapsed   = Date.now() - s.startTime;
  const remaining = Math.max(0, s.durationMs - elapsed);

  await bot.telegram.editMessageText(
    chatId, s.countdownMsgId, undefined,
    buildCountdownText(remaining, s.durationMs),
    { parse_mode: "HTML" }
  ).catch(() => {}); // silent — Telegram may rate-limit edits
}

async function updateStatusMessage(bot: Telegraf, chatId: number, s: StopwatchState): Promise<void> {
  if (!s.statusMsgId) return;
  await bot.telegram.editMessageText(
    chatId, s.statusMsgId, undefined,
    buildStatusText(s),
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([[
        Markup.button.callback("💥  أوقف القنبلة!", `sw:press:${chatId}`),
      ]]),
    }
  ).catch(() => {});
}

async function explodeAll(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "stopwatch" || s.phase !== "countdown") return;

  if (s.countdownInterval) { clearInterval(s.countdownInterval); s.countdownInterval = undefined; }

  // Anyone who hasn't pressed yet is marked as exploded (remaining = -1)
  for (const p of s.players.values()) {
    if (p.pressedAt === undefined) {
      p.pressedAt = s.startTime + s.durationMs;
      p.remaining = -1;
    }
  }

  endStopwatch(bot, chatId);
}

async function endStopwatch(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "stopwatch") return;

  s.phase = "done";
  if (s.countdownInterval) { clearInterval(s.countdownInterval); s.countdownInterval = undefined; }
  if (s.bombTimer)          { clearTimeout(s.bombTimer);          s.bombTimer          = undefined; }

  // Remove button from status message
  if (s.statusMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.statusMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
  }

  // Build final countdown message
  if (s.countdownMsgId) {
    bot.telegram.editMessageText(
      chatId, s.countdownMsgId, undefined,
      `💣 <b>سلك الموت الموقوت</b>\n\n` +
      `<b>░░░░░░░░░░░░░░</b>\n` +
      `<b>⏱  00.0</b>\n\n` +
      `💥 <b>انتهى الوقت!</b>`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  const all = [...s.players.values()];

  // Sort: safe (remaining > 0) ascending, then exploded
  const safe     = all.filter(p => p.remaining != null && p.remaining > 0)
                      .sort((a, b) => a.remaining! - b.remaining!);
  const exploded = all.filter(p => p.remaining == null || p.remaining <= 0);

  const winner = safe[0] ?? null;

  // Record stats
  for (const p of all) {
    if (p === winner) recordWin(chatId, toP(p));
    else recordGame(chatId, [toP(p)]);
  }

  // Build result text
  let resultText = `📊 <b>النتيجة:</b>\n\n`;
  safe.forEach((p, i) => {
    const medal = i === 0 ? "🏆" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    resultText += `${medal} ${esc(dnS(p))} — <b>${fmtMs(p.remaining!)}</b>${i === 0 ? "  ← الفائز!" : ""}\n`;
  });
  if (exploded.length > 0) {
    resultText += `\n💥 <b>انفجرت عليهم القنبلة:</b>\n`;
    for (const p of exploded) resultText += `• ${esc(dnS(p))}\n`;
  }

  if (!winner) {
    resultText += "\n💀 <b>الكل انفجر — لا فائز!</b>";
  }

  await bot.telegram.sendMessage(chatId, resultText, { parse_mode: "HTML" }).catch(() => {});

  // Generate and send result card
  try {
    const cardPlayers = [...safe, ...exploded].map(p => ({
      name:      dnS(p),
      remaining: p.remaining ?? null,
      exploded:  !p.remaining || p.remaining <= 0,
    }));
    const buf = await generateStopwatchResultCard(cardPlayers);
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption:    winner
        ? `🏆 <b>الفائز:</b> ${esc(dnS(winner))} — توقف على ${fmtMs(winner.remaining!)} من الصفر!`
        : `💥 <b>الكل انفجر — لا فائز!</b>`,
      parse_mode: "HTML",
    }).catch(() => {});
  } catch (e) {
    logger.warn({ err: e }, "stopwatch result card failed");
  }

  clearGame(chatId);
}
