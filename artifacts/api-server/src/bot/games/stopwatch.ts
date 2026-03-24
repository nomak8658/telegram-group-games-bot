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
function makeBar(remainingMs: number, totalMs: number, len = 16): string {
  const ratio  = Math.max(0, remainingMs / totalMs);
  const filled = Math.round(ratio * len);
  return "▓".repeat(filled) + "░".repeat(len - filled);
}
function fmtDisplay(remainingMs: number): string {
  const s   = Math.max(0, remainingMs / 1000);
  const int = Math.floor(s);
  const dec = Math.floor((s - int) * 10);
  return `${String(int).padStart(2, "0")}.${dec}`;
}
function buildPlayerList(s: StopwatchState): string {
  return [...s.players.values()].map(p => `• ${esc(dnS(p))}`).join("\n") || "—";
}

const GAME_DURATION_MS = 20_000;
const UPDATE_MS        = 1_500;  // edit every 1.5s — safe for Telegram rate limits
const MIN_PLAYERS      = 2;

// ─── Build combined message ───────────────────────────────────────────────────

function buildMainMsg(
  s: StopwatchState,
  remainingMs: number,
  active: boolean,
): { text: string; keyboard: ReturnType<typeof Markup.inlineKeyboard> } {
  const all     = [...s.players.values()];
  const pressed = all.filter(p => p.pressedAt !== undefined);
  const waiting = all.filter(p => p.pressedAt === undefined);
  const sec     = remainingMs / 1000;

  const bar = makeBar(remainingMs, GAME_DURATION_MS);
  const display = fmtDisplay(remainingMs);

  // Urgency text
  const urgency = !active          ? `\n\n💥 <b>انتهى الوقت!</b>`
    : sec <= 2  ? `\n\n🔴🔴 <b>اضغط الآن!! الصفر يقترب!</b>`
    : sec <= 5  ? `\n\n⚡ <b>خمس ثوانٍ — راح الوقت!</b>`
    : sec <= 10 ? `\n\n⚠️ نصف الطريق — فكر بسرعة!`
    : `\n\nاضغط في أقرب لحظة من الصفر دون أن تصله!`;

  let text = `💣 <b>سلك الموت الموقوت</b>\n\n`;
  text += `<b>${bar}</b>\n`;
  text += `<b>⏱  ${display}</b>`;
  text += urgency;
  text += `\n\n`;

  // Player status
  if (pressed.length > 0) {
    text += `✅ <b>ضغطوا:</b>\n`;
    for (const p of pressed) {
      const rem = p.remaining!;
      text += rem <= 0
        ? `• ${esc(dnS(p))} — 💥 انفجرت!\n`
        : `• ${esc(dnS(p))} — <b>${fmtMs(rem)}</b>\n`;
    }
    text += "\n";
  }
  if (waiting.length > 0) {
    text += `⏳ <b>ينتظرون:</b> ${waiting.map(p => esc(dnS(p))).join("، ")}`;
  }

  const keyboard = active
    ? Markup.inlineKeyboard([[Markup.button.callback("💥  أوقف القنبلة!", `sw:press:${s.mainMsgId ?? 0}`)]])
    : Markup.inlineKeyboard([]);

  return { text, keyboard };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startStopwatch(
  bot: Telegraf, chatId: number,
  hostId: number, hostUsername: string | undefined,
  hostFirst: string, hostLast: string,
): Promise<void> {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId, "⚠️ في لعبة شغالة! أوقفوها أولاً بـ /stop").catch(() => {});
    return;
  }
  const s: StopwatchState = {
    type: "stopwatch", phase: "joining", hostId,
    players: new Map(), startTime: 0, durationMs: GAME_DURATION_MS,
  };
  s.players.set(hostId, { id: hostId, username: hostUsername, firstName: hostFirst, lastName: hostLast });
  gameStates.set(chatId, s);

  const msg = await bot.telegram.sendMessage(chatId,
    `💣 <b>سلك الموت الموقوت</b>\n\n` +
    `عداد تنازلي 20 ثانية — اضغط أقرب ما تقدر من الصفر!\n` +
    `💀 من يصل الصفر تنفجر عليه القنبلة!\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${buildPlayerList(s)}\n\n` +
    `<i>اضغط ▶️ ابدأ عندما يكون الكل جاهز (2 لاعبين على الأقل)</i>`,
    { parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕  انضم للعبة", `sw:join:${chatId}`)],
        [Markup.button.callback("▶️  ابدأ الآن",  `sw:start:${chatId}`)],
      ]),
    }
  ).catch(() => null);
  if (msg) s.joinMsgId = msg.message_id;
}

export async function handleStopwatchJoin(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "stopwatch" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ التسجيل مو متاح").catch(() => {}); return;
  }
  if (s.players.has(from.id)) {
    await ctx.answerCbQuery("✅ أنت مسجل مسبقاً!").catch(() => {}); return;
  }
  s.players.set(from.id, { id: from.id, username: from.username, firstName: from.first_name ?? "", lastName: from.last_name ?? "" });
  await ctx.answerCbQuery("✅ انضممت!").catch(() => {});
  if (s.joinMsgId) {
    bot.telegram.editMessageText(chatId, s.joinMsgId, undefined,
      `💣 <b>سلك الموت الموقوت</b>\n\n` +
      `عداد تنازلي 20 ثانية — اضغط أقرب ما تقدر من الصفر!\n` +
      `💀 من يصل الصفر تنفجر عليه القنبلة!\n\n` +
      `👥 <b>اللاعبون (${s.players.size}):</b>\n${buildPlayerList(s)}\n\n` +
      `<i>اضغط ▶️ ابدأ عندما يكون الكل جاهز</i>`,
      { parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("➕  انضم للعبة", `sw:join:${chatId}`)],
          [Markup.button.callback("▶️  ابدأ الآن",  `sw:start:${chatId}`)],
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
  await ctx.answerCbQuery("⏰ اللعبة تبدأ!").catch(() => {});
  ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
  launchStopwatch(bot, chatId);
}

export async function handleStopwatchPress(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const pressedAt = Date.now();
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

  // Refresh main message with updated player list
  refreshMainMsg(bot, chatId, s);

  // All pressed? End early
  if ([...s.players.values()].every(p => p.pressedAt !== undefined)) {
    if (s.countdownInterval) { clearInterval(s.countdownInterval); s.countdownInterval = undefined; }
    if (s.bombTimer)          { clearTimeout(s.bombTimer);          s.bombTimer = undefined; }
    await new Promise(r => setTimeout(r, 1_200));
    endStopwatch(bot, chatId);
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function launchStopwatch(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "stopwatch") return;
  s.phase = "countdown";

  // Send countdown announcement
  await bot.telegram.sendMessage(chatId,
    `⏳ <b>القنبلة تشتغل! جهزوا أصابعكم...</b>\n<i>العداد ينطلق بعد ثانية!</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  await new Promise(r => setTimeout(r, 1_000));

  // Single main message — will be edited every UPDATE_MS
  s.startTime = Date.now();
  const elapsed   = 0;
  const remaining = GAME_DURATION_MS;
  const { text, keyboard } = buildMainMsg(s, remaining, true);

  const msg = await bot.telegram.sendMessage(chatId, text, {
    parse_mode: "HTML",
    // use chatId in callback so we know which game it is
    ...Markup.inlineKeyboard([[
      Markup.button.callback("💥  أوقف القنبلة!", `sw:press:${chatId}`),
    ]]),
  }).catch(() => null);

  if (msg) s.mainMsgId = msg.message_id;

  // Interval — edits the single main message
  s.countdownInterval = setInterval(async () => {
    const st = gameStates.get(chatId);
    if (!st || st.type !== "stopwatch" || st.phase !== "countdown" || !st.mainMsgId) return;
    const el  = Date.now() - st.startTime;
    const rem = Math.max(0, st.durationMs - el);
    const { text, keyboard } = buildMainMsg(st, rem, true);
    await bot.telegram.editMessageText(chatId, st.mainMsgId, undefined, text, {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([[
        Markup.button.callback("💥  أوقف القنبلة!", `sw:press:${chatId}`),
      ]]),
    }).catch(() => {});
  }, UPDATE_MS);

  s.bombTimer = setTimeout(() => explodeAll(bot, chatId), GAME_DURATION_MS);
}

async function refreshMainMsg(bot: Telegraf, chatId: number, s: StopwatchState): Promise<void> {
  if (!s.mainMsgId) return;
  const el  = Date.now() - s.startTime;
  const rem = Math.max(0, s.durationMs - el);
  const { text } = buildMainMsg(s, rem, true);
  await bot.telegram.editMessageText(chatId, s.mainMsgId, undefined, text, {
    parse_mode: "HTML",
    ...Markup.inlineKeyboard([[
      Markup.button.callback("💥  أوقف القنبلة!", `sw:press:${chatId}`),
    ]]),
  }).catch(() => {});
}

async function explodeAll(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "stopwatch" || s.phase !== "countdown") return;
  if (s.countdownInterval) { clearInterval(s.countdownInterval); s.countdownInterval = undefined; }

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
  if (s.bombTimer)          { clearTimeout(s.bombTimer);          s.bombTimer = undefined; }

  // Final state — hide button
  if (s.mainMsgId) {
    const { text } = buildMainMsg(s, 0, false);
    bot.telegram.editMessageText(chatId, s.mainMsgId, undefined, text, {
      parse_mode: "HTML", ...Markup.inlineKeyboard([]),
    }).catch(() => {});
  }

  const all      = [...s.players.values()];
  const safe     = all.filter(p => p.remaining != null && p.remaining > 0)
                      .sort((a, b) => a.remaining! - b.remaining!);
  const exploded = all.filter(p => !p.remaining || p.remaining <= 0);
  const winner   = safe[0] ?? null;

  for (const p of all) {
    if (p === winner) recordWin(chatId, toP(p));
    else recordGame(chatId, [toP(p)]);
  }

  // Result text
  let txt = `📊 <b>النتيجة النهائية:</b>\n\n`;
  safe.forEach((p, i) => {
    const medal = i === 0 ? "🏆" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    txt += `${medal} ${esc(dnS(p))} — <b>${fmtMs(p.remaining!)}</b>${i === 0 ? " ← الفائز!" : ""}\n`;
  });
  if (exploded.length) {
    txt += `\n💥 <b>انفجرت عليهم:</b>\n`;
    for (const p of exploded) txt += `• ${esc(dnS(p))}\n`;
  }
  if (!winner) txt += `\n💀 <b>الكل انفجر — لا فائز!</b>`;

  await bot.telegram.sendMessage(chatId, txt, { parse_mode: "HTML" }).catch(() => {});

  // Result card
  try {
    const cardPlayers = [...safe, ...exploded].map(p => ({
      name:      dnS(p),
      remaining: p.remaining ?? null,
      exploded:  !p.remaining || p.remaining <= 0,
    }));
    const buf = await generateStopwatchResultCard(cardPlayers);
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption: winner
        ? `🏆 <b>${esc(dnS(winner))}</b> — توقف على <b>${fmtMs(winner.remaining!)}</b> من الصفر!`
        : `💥 الكل انفجر — لا فائز!`,
      parse_mode: "HTML",
    }).catch(() => {});
  } catch (e) { logger.warn({ err: e }, "stopwatch card failed"); }

  clearGame(chatId);
}
