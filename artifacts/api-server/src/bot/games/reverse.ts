import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type ReverseState, type ReversePlayer,
} from "../state.js";
import { logger } from "../../lib/logger.js";

// ─── Questions bank ────────────────────────────────────────────────────────────

const QUESTIONS: Array<{ text: string; options: string[] }> = [
  { text: "🔢 اختار رقماً:",             options: ["1️⃣ واحد",       "2️⃣ اثنين",    "3️⃣ ثلاثة",   "4️⃣ أربعة"]    },
  { text: "🎨 اختار لوناً:",             options: ["🔴 أحمر",        "🔵 أزرق",      "🟢 أخضر",     "🟡 أصفر"]      },
  { text: "🦁 اختار حيواناً:",           options: ["🦁 أسد",         "🐺 ذئب",       "🦊 ثعلب",     "🐻 دب"]        },
  { text: "🍎 اختار فاكهة:",             options: ["🍎 تفاح",        "🍌 موز",       "🍇 عنب",      "🍓 فراولة"]    },
  { text: "🧭 اختار اتجاهاً:",           options: ["⬆️ شمال",        "⬇️ جنوب",     "⬅️ غرب",      "➡️ شرق"]       },
  { text: "⏰ اختار وقت اليوم:",         options: ["🌅 صباح",        "☀️ ظهر",       "🌇 مساء",     "🌙 ليل"]       },
  { text: "🌿 اختار بيئة:",              options: ["🏔️ جبل",         "🏖️ شاطئ",     "🌲 غابة",     "🏜️ صحراء"]    },
  { text: "☕ اختار مشروباً:",           options: ["☕ قهوة",        "🍵 شاي",       "🥤 كولا",     "💧 ماء"]       },
  { text: "🍕 اختار أكلاً:",             options: ["🍕 بيتزا",       "🍔 برغر",      "🌮 شاورما",   "🍜 مكرونة"]    },
  { text: "🎵 اختار موسيقى:",            options: ["🎵 بوب",         "🎸 روك",       "🎤 راب",      "🎻 كلاسيك"]    },
  { text: "🏅 اختار رياضة:",             options: ["⚽ كرة قدم",    "🏀 سلة",       "🎾 تنس",      "🏊 سباحة"]     },
  { text: "❄️ اختار فصلاً:",             options: ["🌸 ربيع",        "☀️ صيف",       "🍂 خريف",     "❄️ شتاء"]      },
  { text: "🧠 اختار قوة خارقة:",         options: ["💪 قوة",         "🦅 طيران",     "🔮 قراءة أفكار","⚡ سرعة"]    },
  { text: "🏠 اختار مكان السكن:",        options: ["🏙️ مدينة",       "🏡 ريف",       "🏝️ جزيرة",   "🏔️ جبال"]     },
  { text: "🚗 اختار وسيلة نقل:",        options: ["🚗 سيارة",       "✈️ طيارة",     "🚀 صاروخ",    "🚢 سفينة"]     },
  { text: "🌙 اختار كوكباً:",            options: ["♂️ المريخ",      "♀️ الزهرة",    "♃ المشتري",   "♄ زحل"]        },
  { text: "📱 اختار جهازاً:",            options: ["📱 جوال",        "💻 لابتوب",    "🎮 جيمنق",    "📺 تلفاز"]     },
  { text: "🌈 اختار رقماً سحرياً:",      options: ["7️⃣ سبعة",        "1️⃣3️⃣ ثلاثة عشر","4️⃣2️⃣ اثنين وأربعين","9️⃣9️⃣ تسعة وتسعين"] },
  { text: "🎭 اختار دوراً:",             options: ["👑 ملك",         "🕵️ جاسوس",    "🧙 ساحر",     "🦸 بطل"]       },
  { text: "🌊 اختار عنصراً:",            options: ["🔥 نار",         "💧 ماء",       "🌪️ هواء",     "🌍 تراب"]      },
];

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function dnS(p: ReversePlayer): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return full || (p.username ? `@${p.username}` : String(p.id));
}

function makeBar(ratio: number, len = 12): string {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * len);
  return "▰".repeat(filled) + "▱".repeat(len - filled);
}

const JOIN_TIMEOUT_MS   = 60_000;
const QUESTION_TIME_MS  = 25_000;
const REVEAL_PAUSE_MS   = 6_000;
const MAX_ROUNDS        = 3;
const MIN_PLAYERS       = 3;
const COUNTDOWN_TICK_MS = 2_000;

// Guard: one edit at a time per chat
const editBusy = new Map<number, boolean>();

async function safeEdit(
  bot: Telegraf, chatId: number, msgId: number,
  text: string, keyboard?: ReturnType<typeof Markup.inlineKeyboard>,
) {
  if (editBusy.get(chatId)) return;
  editBusy.set(chatId, true);
  try {
    await bot.telegram.editMessageText(chatId, msgId, undefined, text, {
      parse_mode: "HTML",
      ...(keyboard ? keyboard : {}),
    });
  } catch { /* silently ignore */ }
  editBusy.delete(chatId);
}

// ─── Join phase ────────────────────────────────────────────────────────────────

function buildJoinMsg(s: ReverseState): string {
  const names = [...s.players.values()].map(p => `• ${esc(dnS(p))}`).join("\n") || "—";
  return (
    `🔄 <b>عكس القروب</b>\n\n` +
    `<i>فكّر عكس الجميع — اختار ما يختاره أقل ناس!</i>\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${names}\n\n` +
    `<i>💡 تحتاج ${MIN_PLAYERS} لاعبين على الأقل — الفائز من يخالف الأغلبية!</i>`
  );
}

export async function startReverse(
  bot: Telegraf, chatId: number,
  hostId: number, hostUsername: string | undefined,
  hostFirst: string, hostLast: string,
): Promise<void> {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId, "⚠️ في لعبة شغالة! أوقفوها أولاً بـ /stop").catch(() => {});
    return;
  }

  const questions = shuffleArr(QUESTIONS).slice(0, MAX_ROUNDS);

  const s: ReverseState = {
    type: "reverse", phase: "joining", hostId,
    players: new Map(), round: 0, maxRounds: MAX_ROUNDS,
    questions, answers: new Map(),
  };
  s.players.set(hostId, { id: hostId, username: hostUsername, firstName: hostFirst, lastName: hostLast, points: 0 });
  gameStates.set(chatId, s);

  const msg = await bot.telegram.sendMessage(chatId, buildJoinMsg(s), {
    parse_mode: "HTML",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🙋 انضم للعبة",   `rev:join:${chatId}`)],
      [Markup.button.callback("▶️ ابدأ الآن",     `rev:start:${chatId}`)],
    ]),
  }).catch(() => null);

  if (msg) s.joinMsgId = msg.message_id;

  // Auto-start after JOIN_TIMEOUT_MS if enough players joined
  s.roundTimer = setTimeout(async () => {
    const cur = gameStates.get(chatId);
    if (!cur || cur.type !== "reverse" || cur.phase !== "joining") return;
    if (cur.players.size >= MIN_PLAYERS) {
      if (cur.joinMsgId)
        bot.telegram.editMessageReplyMarkup(chatId, cur.joinMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
      launchRound(bot, chatId);
    } else {
      bot.telegram.sendMessage(chatId, "⌛ انتهى وقت التسجيل — ما يكفي لاعبين. اللعبة ألغيت.").catch(() => {});
      clearGame(chatId);
    }
  }, JOIN_TIMEOUT_MS);
}

export async function handleReverseJoin(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "reverse" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ التسجيل غير متاح").catch(() => {}); return;
  }
  if (s.players.has(from.id)) {
    await ctx.answerCbQuery("✅ أنت مسجل مسبقاً!").catch(() => {}); return;
  }
  s.players.set(from.id, {
    id: from.id, username: from.username,
    firstName: from.first_name ?? "", lastName: from.last_name ?? "",
    points: 0,
  });
  await ctx.answerCbQuery("✅ انضممت للعبة!").catch(() => {});
  if (s.joinMsgId) {
    safeEdit(bot, chatId, s.joinMsgId, buildJoinMsg(s),
      Markup.inlineKeyboard([
        [Markup.button.callback("🙋 انضم للعبة",   `rev:join:${chatId}`)],
        [Markup.button.callback("▶️ ابدأ الآن",     `rev:start:${chatId}`)],
      ])
    );
  }
}

export async function handleReverseForceStart(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "reverse" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ ما في تسجيل").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط من أنشأ اللعبة يقدر يبدأها!").catch(() => {}); return;
  }
  if (s.players.size < MIN_PLAYERS) {
    await ctx.answerCbQuery(`⚠️ تحتاج ${MIN_PLAYERS} لاعبين على الأقل! (${s.players.size} الآن)`).catch(() => {}); return;
  }
  await ctx.answerCbQuery("🎮 اللعبة تبدأ!").catch(() => {});
  if (s.roundTimer) { clearTimeout(s.roundTimer); s.roundTimer = undefined; }
  ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
  launchRound(bot, chatId);
}

export async function handleReversePick(bot: Telegraf, ctx: Context, chatId: number, optIdx: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "reverse" || s.phase !== "question") {
    await ctx.answerCbQuery("⏸ ما في سؤال الآن!").catch(() => {}); return;
  }
  if (!s.players.has(from.id)) {
    await ctx.answerCbQuery("⛔ أنت مو في اللعبة").catch(() => {}); return;
  }
  if (s.answers.has(from.id)) {
    const prev = s.answers.get(from.id)!;
    const label = s.questions[s.round - 1]?.options[prev] ?? `${prev + 1}`;
    await ctx.answerCbQuery(`✅ اخترت مسبقاً: ${label}`).catch(() => {}); return;
  }

  const q = s.questions[s.round - 1];
  if (!q || optIdx < 0 || optIdx >= q.options.length) {
    await ctx.answerCbQuery("❌ خيار غير صالح").catch(() => {}); return;
  }

  s.answers.set(from.id, optIdx);
  await ctx.answerCbQuery(`✅ اخترت: ${q.options[optIdx]}`).catch(() => {});

  // Update answered count in message
  if (s.questionMsgId) {
    const elapsed  = Date.now() - (s.questionStart ?? Date.now());
    const remSec   = Math.max(0, Math.ceil((QUESTION_TIME_MS - elapsed) / 1000));
    safeEdit(bot, chatId, s.questionMsgId, buildQuestionMsg(s, remSec));
  }

  // All answered? Advance early
  if (s.answers.size >= s.players.size) {
    if (s.countdownTimer) { clearInterval(s.countdownTimer); s.countdownTimer = undefined; }
    if (s.roundTimer)     { clearTimeout(s.roundTimer);      s.roundTimer = undefined; }
    await new Promise(r => setTimeout(r, 800));
    revealRound(bot, chatId);
  }
}

// ─── Round ────────────────────────────────────────────────────────────────────

function buildQuestionMsg(s: ReverseState, remSec: number): string {
  const q          = s.questions[s.round - 1]!;
  const totalSec   = QUESTION_TIME_MS / 1000;
  const bar        = makeBar(remSec / totalSec);
  const answered   = s.answers.size;
  const total      = s.players.size;
  const urgency    = remSec <= 5  ? "\n🔴 <b>آخر ثوانٍ!</b>" :
                     remSec <= 10 ? "\n⚠️ عجّل!" : "";

  return (
    `🔄 <b>عكس القروب</b> — الجولة ${s.round} من ${s.maxRounds}\n\n` +
    `${bar} <b>${remSec}ث</b>${urgency}\n\n` +
    `❓ <b>${q.text}</b>\n\n` +
    `✅ أجاب <b>${answered}</b> من <b>${total}</b>\n` +
    `<i>اختار الأقل شيوعاً — كن مختلفاً!</i>`
  );
}

async function launchRound(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "reverse") return;

  s.round++;
  s.phase   = "question";
  s.answers = new Map();

  if (s.round > s.maxRounds) { endReverse(bot, chatId); return; }

  const q = s.questions[s.round - 1]!;

  // Announcement before question
  await bot.telegram.sendMessage(chatId,
    `🎯 <b>الجولة ${s.round} من ${s.maxRounds}</b> — فكّر قبل ما تضغط! 👇`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  await new Promise(r => setTimeout(r, 1_000));

  s.questionStart = Date.now();

  const msg = await bot.telegram.sendMessage(chatId, buildQuestionMsg(s, QUESTION_TIME_MS / 1000), {
    parse_mode: "HTML",
    ...Markup.inlineKeyboard(
      q.options.map((opt, i) => [Markup.button.callback(opt, `rev:pick:${chatId}:${i}`)])
    ),
  }).catch(() => null);

  if (msg) s.questionMsgId = msg.message_id;

  // Live countdown
  s.countdownTimer = setInterval(async () => {
    if (editBusy.get(chatId)) return;
    const st = gameStates.get(chatId);
    if (!st || st.type !== "reverse" || st.phase !== "question" || !st.questionMsgId) return;
    const elapsed = Date.now() - (st.questionStart ?? Date.now());
    const remSec  = Math.max(0, Math.ceil((QUESTION_TIME_MS - elapsed) / 1000));
    await safeEdit(bot, chatId, st.questionMsgId, buildQuestionMsg(st, remSec));
  }, COUNTDOWN_TICK_MS);

  // Auto-reveal when timer expires
  s.roundTimer = setTimeout(() => {
    const st = gameStates.get(chatId);
    if (!st || st.type !== "reverse" || st.phase !== "question") return;
    if (st.countdownTimer) { clearInterval(st.countdownTimer); st.countdownTimer = undefined; }
    revealRound(bot, chatId);
  }, QUESTION_TIME_MS);
}

// ─── Reveal ───────────────────────────────────────────────────────────────────

async function revealRound(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "reverse" || s.phase !== "question") return;

  s.phase = "reveal";
  if (s.countdownTimer) { clearInterval(s.countdownTimer); s.countdownTimer = undefined; }
  if (s.roundTimer)     { clearTimeout(s.roundTimer);      s.roundTimer = undefined; }
  editBusy.delete(chatId);

  const q       = s.questions[s.round - 1]!;
  const counts  = new Array(q.options.length).fill(0) as number[];
  const byOpt   = new Map<number, ReversePlayer[]>(); // optIdx → players

  for (let i = 0; i < q.options.length; i++) byOpt.set(i, []);

  for (const [uid, optIdx] of s.answers.entries()) {
    counts[optIdx]++;
    const p = s.players.get(uid);
    if (p) byOpt.get(optIdx)!.push(p);
  }

  // Hide question buttons
  if (s.questionMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.questionMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
  }

  // Calculate points
  const pointsGained = new Map<number, number>(); // uid → points this round

  const chosenCounts = counts.filter(c => c > 0);
  if (chosenCounts.length >= 2 && s.answers.size >= 2) {
    const minCount = Math.min(...chosenCounts);
    for (const [uid, optIdx] of s.answers.entries()) {
      if (counts[optIdx] === minCount) {
        pointsGained.set(uid, minCount === 1 ? 2 : 1);
      }
    }
  }

  // Apply points
  for (const [uid, pts] of pointsGained) {
    const p = s.players.get(uid);
    if (p) p.points += pts;
  }

  // Build reveal text
  let txt = `📊 <b>نتائج الجولة ${s.round} من ${s.maxRounds}</b>\n\n`;
  txt += `❓ <b>${q.text}</b>\n\n`;

  for (let i = 0; i < q.options.length; i++) {
    const cnt    = counts[i]!;
    const names  = byOpt.get(i)!.map(p => esc(dnS(p))).join("، ");
    const pts    = byOpt.get(i)!
      .map(p => pointsGained.get(p.id) ?? 0)
      .find(() => true) ?? 0;

    const tag = cnt === 0              ? ""
      : pts === 2                       ? " ✨ <b>مختلف!</b> +2"
      : pts === 1                       ? " ✅ <b>أقلية!</b> +1"
      : ` ❌ أغلبية`;

    txt += `${q.options[i]} — <b>${cnt}</b>${tag}\n`;
    if (names) txt += `  └ ${names}\n`;
  }

  // Players who didn't answer
  const notAnswered = [...s.players.values()].filter(p => !s.answers.has(p.id));
  if (notAnswered.length > 0) {
    txt += `\n⏭ <b>ما أجابوا:</b> ${notAnswered.map(p => esc(dnS(p))).join("، ")}`;
  }

  if (pointsGained.size === 0) {
    txt += `\n\n😤 <b>الكل في الأغلبية — لا أحد يكسب هذه الجولة!</b>`;
  } else {
    const winners = [...pointsGained.entries()]
      .filter(([, pts]) => pts === Math.max(...pointsGained.values()))
      .map(([uid]) => esc(dnS(s.players.get(uid)!)));
    txt += `\n\n🌟 <b>${winners.join(" و")} ${winners.length > 1 ? "يكسبون" : "يكسب"} هذه الجولة!</b>`;
  }

  // Current standings
  const sorted = [...s.players.values()].sort((a, b) => b.points - a.points);
  txt += `\n\n📈 <b>الترتيب الآن:</b>\n`;
  sorted.forEach((p, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    txt += `${medal} ${esc(dnS(p))} — ${p.points} نقطة\n`;
  });

  await bot.telegram.sendMessage(chatId, txt, { parse_mode: "HTML" }).catch(() => {});

  // Transition
  if (s.round >= s.maxRounds) {
    await new Promise(r => setTimeout(r, REVEAL_PAUSE_MS));
    endReverse(bot, chatId);
  } else {
    await new Promise(r => setTimeout(r, REVEAL_PAUSE_MS));
    const cur = gameStates.get(chatId);
    if (cur && cur.type === "reverse") {
      cur.phase = "question";
      launchRound(bot, chatId);
    }
  }
}

// ─── End ──────────────────────────────────────────────────────────────────────

async function endReverse(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "reverse") return;
  s.phase = "done";
  if (s.countdownTimer) { clearInterval(s.countdownTimer); s.countdownTimer = undefined; }
  if (s.roundTimer)     { clearTimeout(s.roundTimer);      s.roundTimer = undefined; }
  editBusy.delete(chatId);

  const sorted = [...s.players.values()].sort((a, b) => b.points - a.points);
  const winner = sorted[0] ?? null;

  for (const p of sorted) {
    const pObj = { id: p.id, username: p.username, name: dnS(p) };
    if (p === winner) recordWin(chatId, pObj);
    else recordGame(chatId, [pObj]);
  }

  let txt = `🏆 <b>النتائج النهائية — عكس القروب</b>\n\n`;
  sorted.forEach((p, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    const extra = i === 0 ? " ← الفائز! 🎉" : "";
    txt += `${medal} ${esc(dnS(p))} — <b>${p.points}</b> نقطة${extra}\n`;
  });

  if (!winner || winner.points === 0) {
    txt += `\n😅 <b>ما فاز أحد — الكل كان في الأغلبية دائماً!</b>`;
  } else {
    txt += `\n\n👏 <b>${esc(dnS(winner))}</b> تفكيره مختلف عن الجميع!`;
  }

  await bot.telegram.sendMessage(chatId, txt, { parse_mode: "HTML" }).catch(() => {});
  clearGame(chatId);
}
