import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type CircleState, type CirclePlayer, type CircleChallenge,
} from "../state.js";
import { generateCircleEliminatedCard, generateCircleWinnerCard } from "../circleCard.js";
import { logger } from "../../lib/logger.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dnC(p: CirclePlayer): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return full || (p.username ? `@${p.username}` : String(p.id));
}

function toP(p: CirclePlayer) {
  return { id: p.id, username: p.username, name: dnC(p) };
}

function playerList(s: CircleState): string {
  return [...s.players.values()].map(p => `• ${esc(dnC(p))}`).join("\n") || "—";
}

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text.trim());
}

function validateAnswer(challenge: CircleChallenge, answer: string): boolean {
  const t = answer.trim();
  if (!t) return false;
  switch (challenge.kind) {
    case "math": {
      const n = parseInt(t.replace(/[^\d]/g, ""), 10);
      return !isNaN(n) && n === challenge.expectedNum;
    }
    case "starts": {
      if (!isArabic(t) || !challenge.letter) return false;
      return t[0] === challenge.letter || t[0] === challenge.letter;
    }
    case "no_letter": {
      if (!isArabic(t) || !challenge.letter) return false;
      return !t.includes(challenge.letter);
    }
    case "race": {
      return t.length >= 2 && isArabic(t);
    }
    default: return false;
  }
}

// ─── Challenge bank ───────────────────────────────────────────────────────────

const MATH: CircleChallenge[] = [
  { kind: "math", text: "📐 احسب: 7 × 8 = ؟",     expectedNum: 56,  timerSec: 12 },
  { kind: "math", text: "📐 احسب: 6 × 9 = ؟",     expectedNum: 54,  timerSec: 12 },
  { kind: "math", text: "📐 احسب: 15 + 27 = ؟",   expectedNum: 42,  timerSec: 12 },
  { kind: "math", text: "📐 احسب: 100 - 38 = ؟",  expectedNum: 62,  timerSec: 12 },
  { kind: "math", text: "📐 احسب: 48 ÷ 6 = ؟",   expectedNum: 8,   timerSec: 12 },
  { kind: "math", text: "📐 احسب: 13 × 4 = ؟",   expectedNum: 52,  timerSec: 12 },
  { kind: "math", text: "📐 احسب: 200 - 76 = ؟",  expectedNum: 124, timerSec: 15 },
  { kind: "math", text: "📐 احسب: 9 × 9 = ؟",     expectedNum: 81,  timerSec: 10 },
  { kind: "math", text: "📐 احسب: 144 ÷ 12 = ؟", expectedNum: 12,  timerSec: 12 },
  { kind: "math", text: "📐 احسب: 17 × 6 = ؟",   expectedNum: 102, timerSec: 15 },
  { kind: "math", text: "📐 احسب: 88 + 44 = ؟",  expectedNum: 132, timerSec: 15 },
  { kind: "math", text: "📐 احسب: 250 ÷ 5 = ؟",  expectedNum: 50,  timerSec: 12 },
  { kind: "math", text: "📐 احسب: 19 × 3 = ؟",   expectedNum: 57,  timerSec: 12 },
  { kind: "math", text: "📐 احسب: 300 - 127 = ؟", expectedNum: 173, timerSec: 15 },
];

const STARTS: CircleChallenge[] = [
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "م" ✍️',  letter: "م", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "س" ✍️',  letter: "س", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "ب" ✍️',  letter: "ب", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "ح" ✍️',  letter: "ح", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "ك" ✍️',  letter: "ك", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "د" ✍️',  letter: "د", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "ج" ✍️',  letter: "ج", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "ف" ✍️',  letter: "ف", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "ن" ✍️',  letter: "ن", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "ل" ✍️',  letter: "ل", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "ر" ✍️',  letter: "ر", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "ز" ✍️',  letter: "ز", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "خ" ✍️',  letter: "خ", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "ع" ✍️',  letter: "ع", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "ق" ✍️',  letter: "ق", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "ش" ✍️',  letter: "ش", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "ت" ✍️',  letter: "ت", timerSec: 10 },
  { kind: "starts", text: 'اكتب أسرع كلمة عربية تبدأ بحرف "ه" ✍️',  letter: "ه", timerSec: 10 },
];

const NO_LETTER: CircleChallenge[] = [
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ا" ⚠️',  letter: "ا", timerSec: 13 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ل" ⚠️',  letter: "ل", timerSec: 13 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "م" ⚠️',  letter: "م", timerSec: 13 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ن" ⚠️',  letter: "ن", timerSec: 13 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ي" ⚠️',  letter: "ي", timerSec: 13 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "و" ⚠️',  letter: "و", timerSec: 13 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ب" ⚠️',  letter: "ب", timerSec: 13 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ر" ⚠️',  letter: "ر", timerSec: 13 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ع" ⚠️',  letter: "ع", timerSec: 13 },
];

const RACE: CircleChallenge[] = [
  { kind: "race", text: "⚡ سباق! اكتب أي كلمة عربية أسرع ما تقدر!",     timerSec: 8 },
  { kind: "race", text: "⚡ اكتب اسم أي دولة عربية أسرع ما تقدر!",       timerSec: 8 },
  { kind: "race", text: "⚡ اكتب اسم أي حيوان الآن!",                      timerSec: 8 },
  { kind: "race", text: "⚡ اكتب اسم أي لون أسرع ما تقدر!",               timerSec: 8 },
  { kind: "race", text: "⚡ اكتب اسم أي فاكهة الآن!",                      timerSec: 8 },
  { kind: "race", text: "⚡ اكتب اسم أي مدينة سعودية أسرع ما تقدر!",     timerSec: 8 },
  { kind: "race", text: "⚡ اكتب اسم أكلة شعبية الآن!",                    timerSec: 8 },
  { kind: "race", text: "⚡ اكتب اسم أي نهر في العالم الآن!",              timerSec: 8 },
];

function pickChallenge(round: number, used: Set<string>): CircleChallenge {
  let pool: CircleChallenge[];
  if (round <= 3)      pool = [...RACE, ...STARTS.slice(0, 8)];
  else if (round <= 6) pool = [...MATH.slice(0, 8), ...STARTS, ...NO_LETTER.slice(0, 4)];
  else                 pool = [...MATH, ...NO_LETTER, ...STARTS];

  const fresh = pool.filter(c => !used.has(c.text));
  const choices = fresh.length > 0 ? fresh : pool;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  used.add(pick.text);
  return pick;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const JOIN_MS      = 60_000;
const JOIN_WARN_MS = 40_000;
const MIN_PLAYERS  = 3;
const BETWEEN_ROUNDS_MS = 3_500;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startCircle(
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

  const s: CircleState = {
    type: "circle",
    phase: "joining",
    players: new Map(),
    eliminated: [],
    hostId,
    round: 0,
    challenge: null,
    responses: new Map(),
    usedChallenges: new Set(),
    doubleElim: false,
  };

  s.players.set(hostId, { id: hostId, username: hostUsername, firstName: hostFirst, lastName: hostLast });
  gameStates.set(chatId, s);

  const msg = await bot.telegram.sendMessage(
    chatId,
    `🔴 <b>الدائرة القاتلة</b>\n\n` +
    `كل جولة تحدي — الأبطأ أو الغلطان يطلع! 🎯\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerList(s)}\n\n` +
    `اضغط <b>➕ انضم</b> للمشاركة!\n<i>60 ثانية للانضمام...</i>`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕  انضم للدائرة", `circle:join:${chatId}`)],
        [Markup.button.callback("▶️  ابدأ الآن",    `circle:fstart:${chatId}`)],
      ]),
    }
  ).catch(() => null);

  if (msg) s.joinMsgId = msg.message_id;

  s.joinWarnTimer = setTimeout(() => {
    const gs = gameStates.get(chatId);
    if (!gs || gs.type !== "circle" || gs.phase !== "joining") return;
    bot.telegram.sendMessage(
      chatId,
      `⏳ <b>تبقى 20 ثانية!</b> ${gs.players.size} لاعب الآن 🔴`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }, JOIN_WARN_MS);

  s.joinTimer = setTimeout(() => launchCircle(bot, chatId), JOIN_MS);
}

export async function handleCircleJoin(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s = gameStates.get(chatId);

  if (!s || s.type !== "circle" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ التسجيل مو متاح الحين").catch(() => {});
    return;
  }
  if (s.players.has(from.id)) {
    await ctx.answerCbQuery("✅ أنت مسجل مسبقاً!").catch(() => {});
    return;
  }

  const p: CirclePlayer = {
    id: from.id,
    username: from.username,
    firstName: from.first_name ?? "",
    lastName: from.last_name ?? "",
  };
  s.players.set(from.id, p);

  await ctx.answerCbQuery(`✅ دخلت الدائرة!`).catch(() => {});
  bot.telegram.sendMessage(
    chatId,
    `✅ <b>${esc(dnC(p))}</b> دخل الدائرة! 🔴\n👥 اللاعبون (${s.players.size}):\n${playerList(s)}`,
    { parse_mode: "HTML" }
  ).catch(() => {});
}

export async function handleCircleForceStart(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s = gameStates.get(chatId);

  if (!s || s.type !== "circle" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ ما في تسجيل").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط من بدأ اللعبة يقدر يبدأها!").catch(() => {}); return;
  }
  if (s.players.size < MIN_PLAYERS) {
    await ctx.answerCbQuery(`⚠️ ما يكفي لاعبين! (${s.players.size}/${MIN_PLAYERS})`).catch(() => {}); return;
  }

  await ctx.answerCbQuery("🔴 تبدأ!").catch(() => {});
  launchCircle(bot, chatId);
}

export function handleCircleText(
  bot: Telegraf,
  chatId: number,
  uid: number,
  text: string,
  timestamp: number,
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "circle" || s.phase !== "playing" || !s.challenge) return;
  if (!s.players.has(uid)) return;
  if (s.responses.has(uid)) return; // one answer per round
  s.responses.set(uid, { text: text.trim(), timestamp });
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function launchCircle(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "circle" || s.phase !== "joining") return;

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

  await bot.telegram.sendMessage(
    chatId,
    `🔴 <b>الدائرة القاتلة — انطلقت!</b>\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerList(s)}\n\n` +
    `🎯 كل جولة تحدي — الأبطأ أو الغلطان يطلع!\n` +
    `آخر واحد يبقى = الفائز 👑\n\n` +
    `<i>الجولة الأولى خلال 3 ثواني...</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => sendChallenge(bot, chatId), BETWEEN_ROUNDS_MS);
}

async function sendChallenge(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "circle" || s.phase !== "playing") return;

  s.round++;
  s.responses = new Map();

  const doubleElim = s.round % 3 === 0 && s.players.size > 3;
  s.doubleElim = doubleElim;

  const challenge = pickChallenge(s.round, s.usedChallenges);
  s.challenge = challenge;

  const remaining = [...s.players.values()].map(p => `• ${esc(dnC(p))}`).join("\n");

  let header = `🔴 <b>الجولة ${s.round}</b>`;
  if (doubleElim)   header += `  ╴ 💀 إقصاء مزدوج!`;
  if (s.round >= 7) header += `  🔥 حرارة!`;

  const msg = await bot.telegram.sendMessage(
    chatId,
    `${header}\n\n` +
    `👥 <b>المتبقون (${s.players.size}):</b>\n${remaining}\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🎯 <b>التحدي:</b>\n<b>${challenge.text}</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `⏱ عندكم <b>${challenge.timerSec} ثانية</b> — اكتبوا الآن! 📨` +
    (doubleElim ? `\n⚠️ <b>شخصان سيطلعان هذه الجولة!</b>` : ""),
    { parse_mode: "HTML" }
  ).catch(() => null);

  if (msg) s.challengeMsgId = msg.message_id;

  s.challengeTimer = setTimeout(
    () => resolveChallenge(bot, chatId),
    challenge.timerSec * 1_000
  );
}

async function resolveChallenge(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "circle" || s.phase !== "playing" || !s.challenge) return;

  if (s.challengeTimer) { clearTimeout(s.challengeTimer); s.challengeTimer = undefined; }

  const challenge = s.challenge;
  s.challenge = null;

  const allUids = [...s.players.keys()];
  const correct:     { uid: number; ts: number }[] = [];
  const wrong:       number[] = [];
  const noResponse:  number[] = [];

  for (const uid of allUids) {
    const r = s.responses.get(uid);
    if (!r) {
      noResponse.push(uid);
    } else if (validateAnswer(challenge, r.text)) {
      correct.push({ uid, ts: r.ts });
    } else {
      wrong.push(uid);
    }
  }

  correct.sort((a, b) => a.ts - b.ts);

  // Determine elimination candidates
  let elimCandidates: number[];
  if (challenge.kind === "race") {
    // no / wrong answers eliminated; if all valid, slowest eliminated
    elimCandidates = [...noResponse, ...wrong];
    if (elimCandidates.length === 0 && correct.length > 0) {
      elimCandidates = [correct[correct.length - 1].uid];
    }
  } else {
    // math / starts / no_letter: wrong or no answer → out; else slowest
    elimCandidates = [...wrong, ...noResponse];
    if (elimCandidates.length === 0 && correct.length > 0) {
      elimCandidates = [correct[correct.length - 1].uid];
    }
  }

  // Build result message
  let result = `📊 <b>نتيجة الجولة ${s.round}:</b>\n\n`;
  if (correct.length > 0) {
    result += `✅ <b>صح:</b> ${correct.map(({ uid }) => esc(dnC(s.players.get(uid)!))).join("، ")}\n`;
  }
  if (wrong.length > 0) {
    result += `❌ <b>غلط:</b> ${wrong.map(uid => esc(dnC(s.players.get(uid)!))).join("، ")}\n`;
  }
  if (noResponse.length > 0) {
    result += `💤 <b>ما ردوا:</b> ${noResponse.map(uid => esc(dnC(s.players.get(uid)!))).join("، ")}\n`;
  }

  if (challenge.kind === "math") {
    result += `\n💡 الجواب الصحيح: <b>${challenge.expectedNum}</b>`;
  }

  if (elimCandidates.length === 0) {
    result += `\n\n✨ كلكم أجبتم صح وبسرعة — لا إقصاء هذه الجولة!`;
    await bot.telegram.sendMessage(chatId, result, { parse_mode: "HTML" }).catch(() => {});
    setTimeout(() => sendChallenge(bot, chatId), BETWEEN_ROUNDS_MS);
    return;
  }

  await bot.telegram.sendMessage(chatId, result, { parse_mode: "HTML" }).catch(() => {});

  // Shuffle then pick
  shuffle(elimCandidates);
  const elimCount = s.doubleElim && elimCandidates.length >= 2 ? 2 : 1;
  await eliminatePlayers(bot, chatId, elimCandidates.slice(0, elimCount));
}

async function eliminatePlayers(bot: Telegraf, chatId: number, uids: number[]): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "circle") return;

  for (const uid of uids) {
    const p = s.players.get(uid);
    if (!p) continue;
    s.players.delete(uid);
    s.eliminated.push(p);

    try {
      const buf = await generateCircleEliminatedCard(dnC(p), s.round);
      await bot.telegram.sendPhoto(chatId, { source: buf }, {
        caption: `💀 <b>${esc(dnC(p))}</b> خرج من الدائرة في الجولة ${s.round}! 🔴`,
        parse_mode: "HTML",
      });
    } catch (e) {
      logger.warn({ err: e }, "circle eliminated card failed");
      await bot.telegram.sendMessage(
        chatId,
        `💀 <b>${esc(dnC(p))}</b> خرج من الدائرة! 🔴`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }
  }

  // Check win condition
  if (s.players.size === 1) {
    const winner = [...s.players.values()][0];
    await endCircle(bot, chatId, winner);
    return;
  }

  if (s.players.size === 0) {
    await bot.telegram.sendMessage(
      chatId, `🔴 <b>الكل طلع!</b> ما في فائز 😅`, { parse_mode: "HTML" }
    ).catch(() => {});
    clearGame(chatId);
    return;
  }

  setTimeout(() => sendChallenge(bot, chatId), BETWEEN_ROUNDS_MS);
}

async function endCircle(bot: Telegraf, chatId: number, winner: CirclePlayer): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "circle") return;

  s.phase = "done";

  // Record stats
  const all = [...s.players.values(), ...s.eliminated];
  for (const p of all) {
    if (p.id === winner.id) recordWin(chatId, toP(p));
    else recordGame(chatId, [toP(p)]);
  }

  try {
    const buf = await generateCircleWinnerCard(dnC(winner));
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption: `👑 <b>${esc(dnC(winner))}</b> هو الناجي الوحيد من الدائرة القاتلة!\n🎊 مبروك!`,
      parse_mode: "HTML",
    });
  } catch (e) {
    logger.warn({ err: e }, "circle winner card failed");
    await bot.telegram.sendMessage(
      chatId,
      `🏆 <b>الفائز:</b> ${esc(dnC(winner))} 👑\nناجي من الدائرة القاتلة! 🎊`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  clearGame(chatId);
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
