import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type ButtonState, type ButtonPlayer,
} from "../state.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_PLAYERS  = 3;
const LIVES        = 3;
const JOIN_MS      = 60_000;
const JOIN_WARN_MS = 50_000;
const PRESS_MS     = 10_000;   // press-round window
const TRAP_MS      = 5_000;    // trap-round window
const RESULT_DELAY = 3_500;    // delay before next round
const PREP_MIN_MS  = 2_000;    // min suspense before round
const PREP_MAX_MS  = 4_000;    // max suspense before round

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dnB(p: ButtonPlayer): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return full || (p.username ? `@${p.username}` : String(p.id));
}

function livesBar(n: number): string {
  return "❤️".repeat(Math.max(0, n)) + "🖤".repeat(Math.max(0, LIVES - n));
}

function active(s: ButtonState): ButtonPlayer[] {
  return [...s.players.values()].filter(p => p.lives > 0);
}

function board(s: ButtonState): string {
  return active(s)
    .sort((a, b) => b.lives - a.lives)
    .map(p => `${livesBar(p.lives)} ${esc(dnB(p))}`)
    .join("\n");
}

function toP(p: ButtonPlayer) {
  return { id: p.id, username: p.username, name: dnB(p) };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startButton(
  bot: Telegraf, chatId: number,
  hostId: number, hostUsername: string | undefined,
  hostFirst: string, hostLast: string,
): Promise<void> {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId, "⚠️ في لعبة شغالة! أوقفوها أولاً بـ /stop").catch(() => {});
    return;
  }

  const s: ButtonState = {
    type: "button", phase: "joining",
    players: new Map(),
    hostId, round: 0, roundSeq: 0,
    pressedAt: new Map(),
  };
  s.players.set(hostId, {
    id: hostId, username: hostUsername,
    firstName: hostFirst, lastName: hostLast,
    lives: LIVES,
  });
  gameStates.set(chatId, s);

  const msg = await bot.telegram.sendMessage(chatId,
    `⚡ <b>الزر الأخير</b>\n\n` +
    `📖 <b>القواعد:</b>\n` +
    `• كل جولة البوت يقول <b>"اضغط الآن!"</b>\n` +
    `• آخر واحد يضغط = يخسر ❤️\n` +
    `• أحياناً البوت يخدع: <b>"لا تضغط!"</b> 😈\n` +
    `  اللي يضغط وقتها = يخسر ❤️\n` +
    `• كل لاعب عنده <b>${LIVES} قلوب</b> — من تنتهي يطلع 💀\n` +
    `• آخر واحد يبقى يفوز 🏆\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${board(s)}\n\n` +
    `<i>اضغط انضم — الحد الأدنى ${MIN_PLAYERS} لاعبين</i>`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕  انضم للعبة", `btn:join:${chatId}`)],
        [Markup.button.callback("▶️  ابدأ اللعبة", `btn:start:${chatId}`)],
      ]),
    }
  ).catch(() => null);
  if (msg) s.joinMsgId = msg.message_id;

  s.joinWarnTimer = setTimeout(() => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "button" || ss.phase !== "joining") return;
    bot.telegram.sendMessage(chatId,
      `⏰ <b>10 ثواني وتغلق التسجيل!</b>  ${active(ss).length} لاعبين الحين`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }, JOIN_WARN_MS);

  s.joinTimer = setTimeout(() => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "button" || ss.phase !== "joining") return;
    if (active(ss).length < MIN_PLAYERS) {
      bot.telegram.sendMessage(chatId, `❌ ما كفت لاعبين — اللعبة ملغاة.`).catch(() => {});
      clearGame(chatId);
      return;
    }
    launchButton(bot, chatId);
  }, JOIN_MS);
}

export async function handleButtonJoin(
  bot: Telegraf, ctx: Context, chatId: number,
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "button" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ التسجيل مغلق").catch(() => {}); return;
  }
  if (s.players.has(from.id)) {
    await ctx.answerCbQuery("✅ أنت مسجل!").catch(() => {}); return;
  }

  s.players.set(from.id, {
    id: from.id, username: from.username,
    firstName: from.first_name ?? "", lastName: from.last_name ?? "",
    lives: LIVES,
  });

  await ctx.answerCbQuery("✅ انضممت!").catch(() => {});
  if (s.joinMsgId) {
    bot.telegram.editMessageText(chatId, s.joinMsgId, undefined,
      `⚡ <b>الزر الأخير</b>\n\n` +
      `👥 <b>اللاعبون (${s.players.size}):</b>\n${board(s)}\n\n` +
      `<i>اضغط ابدأ عندما يكون الكل جاهز</i>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("➕  انضم للعبة", `btn:join:${chatId}`)],
          [Markup.button.callback("▶️  ابدأ اللعبة", `btn:start:${chatId}`)],
        ]),
      }
    ).catch(() => {});
  }
}

export async function handleButtonStart(
  bot: Telegraf, ctx: Context, chatId: number,
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "button" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط المنشئ يبدأ!").catch(() => {}); return;
  }
  if (active(s).length < MIN_PLAYERS) {
    await ctx.answerCbQuery(`⚠️ ما يكفي لاعبين! (${active(s).length}/${MIN_PLAYERS})`).catch(() => {}); return;
  }
  await ctx.answerCbQuery("⚡ تبدأ اللعبة!").catch(() => {});
  launchButton(bot, chatId);
}

export async function handleButtonPress(
  bot: Telegraf, ctx: Context, chatId: number, seq: number,
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "button" || s.phase !== "round") {
    await ctx.answerCbQuery("⏳ انتظر الجولة").catch(() => {}); return;
  }
  if (s.roundSeq !== seq) {
    await ctx.answerCbQuery("⏱ الجولة انتهت!").catch(() => {}); return;
  }

  const p = s.players.get(from.id);
  if (!p || p.lives <= 0) {
    await ctx.answerCbQuery("💀 أنت خرجت من اللعبة").catch(() => {}); return;
  }
  if (s.pressedAt.has(from.id)) {
    await ctx.answerCbQuery("✅ ضغطت بالفعل!").catch(() => {}); return;
  }

  s.pressedAt.set(from.id, Date.now());

  if (s.roundType === "trap") {
    await ctx.answerCbQuery("💀 وقعت في الفخ! 😈").catch(() => {});
  } else {
    await ctx.answerCbQuery("✅ تم! انتظر النتيجة...").catch(() => {});
    // If all active players pressed early, end the round immediately
    const allPressed = active(s).every(pl => s.pressedAt.has(pl.id));
    if (allPressed) {
      if (s.roundTimer) { clearTimeout(s.roundTimer); s.roundTimer = undefined; }
      const captured = s.roundSeq;
      s.roundSeq++;
      void endPressRound(bot, chatId, captured);
    }
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function launchButton(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "button") return;

  if (s.joinTimer)     { clearTimeout(s.joinTimer);     s.joinTimer     = undefined; }
  if (s.joinWarnTimer) { clearTimeout(s.joinWarnTimer); s.joinWarnTimer = undefined; }
  if (s.joinMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.joinMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
  }

  await bot.telegram.sendMessage(chatId,
    `⚡ <b>الزر الأخير — انطلقنا!</b>\n\n` +
    `👥 <b>${active(s).length} لاعبين</b>\n${board(s)}\n\n` +
    `تبدأ أول جولة بعد ثواني... 🔥`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  s.phase = "waiting";
  setTimeout(() => startRound(bot, chatId), 3_000);
}

const PREP_MSGS = [
  "🔥 استعدوا...",
  "👀 تركيز...",
  "😤 الكل جاهز؟",
  "🎯 انتبهوا...",
  "⏳ لحظة...",
  "🫀 قلبك معك؟",
  "🧠 فكّر بسرعة...",
  "😈 من يكون الأخير؟",
];

const PRESS_TITLES = [
  "⚡ <b>اضغط الآن!</b>",
  "🔥 <b>الآن الآن!</b>",
  "💥 <b>اضغط سريع!</b>",
  "🎯 <b>الزر! الزر!</b>",
];

const TRAP_TITLES = [
  "🚫 <b>لا تضغط الزر!</b>",
  "⛔ <b>لا تضغط!</b>",
  "🤫 <b>ابقَ ثابتاً!</b>",
  "🛑 <b>لا تتحرك!</b>",
  "😈 <b>مو هالمرة!</b>",
];

async function startRound(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "button" || s.phase !== "waiting") return;

  const players = active(s);
  if (players.length <= 1) {
    await endButton(bot, chatId, players[0]?.id ?? null);
    return;
  }

  s.phase      = "round";
  s.round++;
  s.roundSeq++;
  s.pressedAt  = new Map();

  const isTrap  = Math.random() < 0.30;
  s.roundType   = isTrap ? "trap" : "press";
  const seq     = s.roundSeq;
  const prepMs  = PREP_MIN_MS + Math.floor(Math.random() * (PREP_MAX_MS - PREP_MIN_MS));
  const prepMsg = PREP_MSGS[Math.floor(Math.random() * PREP_MSGS.length)];

  // Send suspense message
  const prep = await bot.telegram.sendMessage(chatId,
    `<i>${prepMsg}</i>`,
    { parse_mode: "HTML" }
  ).catch(() => null);

  setTimeout(async () => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "button" || ss.roundSeq !== seq) return;

    if (prep) bot.telegram.deleteMessage(chatId, prep.message_id).catch(() => {});

    const title  = isTrap
      ? TRAP_TITLES[Math.floor(Math.random() * TRAP_TITLES.length)]
      : PRESS_TITLES[Math.floor(Math.random() * PRESS_TITLES.length)];
    const btnLbl  = isTrap ? "🔴  لا تلمسه!" : "💥  اضغط!";
    const subtext = isTrap
      ? `<i>⚠️ اللي يضغط يخسر ❤️ — تحمّل الضغط!</i>`
      : `<i>آخر واحد يضغط يخسر ❤️</i>`;

    const timeoutSec = isTrap ? Math.round(TRAP_MS / 1000) : Math.round(PRESS_MS / 1000);

    const msg = await bot.telegram.sendMessage(chatId,
      `${title}\n\n${subtext}\n\n⏱ ${timeoutSec}ث  |  🔢 جولة ${ss.round}`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback(btnLbl, `btn:press:${chatId}:${seq}`)],
        ]),
      }
    ).catch(() => null);
    if (msg) ss.roundMsgId = msg.message_id;

    const windowMs = isTrap ? TRAP_MS : PRESS_MS;
    ss.roundTimer = setTimeout(() => {
      const sss = gameStates.get(chatId);
      if (!sss || sss.type !== "button" || sss.roundSeq !== seq) return;
      sss.roundSeq++;
      if (isTrap) {
        void endTrapRound(bot, chatId);
      } else {
        void endPressRound(bot, chatId, seq);
      }
    }, windowMs);
  }, prepMs);
}

async function endPressRound(
  bot: Telegraf, chatId: number, _capturedSeq?: number,
): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "button") return;

  s.phase = "waiting";

  if (s.roundMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.roundMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
    s.roundMsgId = undefined;
  }

  const players = active(s);
  const now     = Date.now();

  // Build sorted press list; non-pressers treated as last
  const ordered = players
    .map(p => ({ p, t: s.pressedAt.get(p.id) ?? (now + 99_999), pressed: s.pressedAt.has(p.id) }))
    .sort((a, b) => a.t - b.t);

  const loserEntry  = ordered[ordered.length - 1];
  const loser       = s.players.get(loserEntry.p.id)!;
  loser.lives--;

  // Build results text
  const pressedLines = ordered
    .filter(x => x.pressed)
    .map((x, i) => {
      const icon = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      return `${icon} ${esc(dnB(x.p))}`;
    })
    .join("\n");

  const noPressList = ordered.filter(x => !x.pressed).map(x => esc(dnB(x.p))).join("، ");

  let txt = `💥 <b>نتيجة الجولة ${s.round}:</b>\n\n`;
  if (pressedLines) txt += `🕹️ <b>ضغطوا بالترتيب:</b>\n${pressedLines}\n\n`;
  if (noPressList)  txt += `😴 ما ضغطوا: <b>${noPressList}</b>\n\n`;

  if (loser.lives > 0) {
    txt += `💔 <b>${esc(dnB(loser))}</b> كان الأخير! ${livesBar(loser.lives)} بقي ${loser.lives} ${loser.lives === 1 ? "قلب" : "قلوب"}`;
  } else {
    txt += `💀 <b>${esc(dnB(loser))}</b> كان الأخير وطار من اللعبة!`;
  }

  await bot.telegram.sendMessage(chatId, txt, { parse_mode: "HTML" }).catch(() => {});
  await continueOrEnd(bot, chatId);
}

async function endTrapRound(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "button") return;

  s.phase = "waiting";

  if (s.roundMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.roundMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
    s.roundMsgId = undefined;
  }

  const trappers = [...s.pressedAt.keys()]
    .map(id => s.players.get(id))
    .filter((p): p is ButtonPlayer => !!p && p.lives > 0);

  let txt = `😈 <b>الفخ انكشف! جولة ${s.round}</b>\n\n`;

  if (trappers.length === 0) {
    txt += `✅ <b>ما وقع أحد في الفخ!</b>\nكلكم صمدتوا 💪 — ما أحد يخسر هالجولة!`;
  } else {
    txt += `🪤 <b>وقعوا في الفخ:</b>\n`;
    for (const p of trappers) {
      p.lives--;
      if (p.lives > 0) {
        txt += `${livesBar(p.lives)} ${esc(dnB(p))} — بقي ${p.lives} ${p.lives === 1 ? "قلب" : "قلوب"}\n`;
      } else {
        txt += `💀 ${esc(dnB(p))} — طلع من اللعبة!\n`;
      }
    }
  }

  await bot.telegram.sendMessage(chatId, txt, { parse_mode: "HTML" }).catch(() => {});
  await continueOrEnd(bot, chatId);
}

async function continueOrEnd(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "button" || s.phase !== "waiting") return;

  const alive = active(s);
  if (alive.length <= 1) {
    setTimeout(() => endButton(bot, chatId, alive[0]?.id ?? null), 1_200);
    return;
  }

  await bot.telegram.sendMessage(chatId,
    `📊 <b>الحالة:</b>\n${board(s)}\n\n<i>الجولة ${s.round + 1} قادمة...</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => startRound(bot, chatId), RESULT_DELAY);
}

async function endButton(bot: Telegraf, chatId: number, winnerId: number | null): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "button" || s.phase === "done") return;

  s.phase = "done";

  const winner = winnerId !== null ? s.players.get(winnerId) : null;
  const allPlayers = [...s.players.values()];

  if (winner) {
    recordWin(chatId, toP(winner));
    for (const p of allPlayers.filter(p => p.id !== winnerId)) {
      recordGame(chatId, [toP(p)]);
    }
  } else {
    for (const p of allPlayers) recordGame(chatId, [toP(p)]);
  }

  const text = winner
    ? `🏆 <b>${esc(dnB(winner))}</b> فاز بـ الزر الأخير!\n\n` +
      `🔢 إجمالي الجولات: <b>${s.round}</b>\n` +
      `❤️ بقي له: ${livesBar(winner.lives)}\n\n` +
      `<i>جولة أخرى؟  /button</i>`
    : `🤷 انتهت اللعبة بدون فائز!\n\n<i>جولة أخرى؟  /button</i>`;

  await bot.telegram.sendMessage(chatId, text, { parse_mode: "HTML" }).catch(() => {});
  clearGame(chatId);
}
