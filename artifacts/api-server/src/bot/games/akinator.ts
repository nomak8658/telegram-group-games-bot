import type { Telegraf } from "telegraf";
import type { CallbackQuery } from "telegraf/types";
import { Markup }   from "telegraf";
import { gameStates, clearGame } from "../state.js";
import type { AkinatorState } from "../state.js";
import {
  generateAkinatorQuestionCard,
  generateAkinatorGuessCard,
  generateAkinatorWinCard,
  generateAkinatorLoseCard,
  generateAkinatorWelcomeCard,
} from "../akinatorCard.js";

// ─── Character Database ───────────────────────────────────────────────────────

type A = 1 | 0; // yes / no
interface Char { ar: string; a: Record<string, A | undefined>; }

const CHARS: Char[] = [
  // ── Real people ──────────────────────────────────────────────────────────────
  { ar: "محمد صلاح",
    a: { real:1,male:1,human:1,alive:1,arabic:1,modern:1,athlete:1,soccer:1,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "كريستيانو رونالدو",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:1,soccer:1,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "ليونيل ميسي",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:1,soccer:1,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "نيمار",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:1,soccer:1,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "كيليان مبابي",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:1,soccer:1,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "مايكل جوردان",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:1,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "مايكل جاكسون",
    a: { real:1,male:1,human:1,alive:0,arabic:0,modern:0,athlete:0,soccer:0,singer:1,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "شاكيرا",
    a: { real:1,male:0,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:1,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "بيونسيه",
    a: { real:1,male:0,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:1,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "إيلون ماسك",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:1,superpower:0,flying:0 } },
  { ar: "بيل غيتس",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:1,superpower:0,flying:0 } },
  { ar: "باراك أوباما",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:1,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "الملك عبدالله الثاني",
    a: { real:1,male:1,human:1,alive:1,arabic:1,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:1,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:1,scientist:0,superpower:0,flying:0 } },
  { ar: "الملك تشارلز الثالث",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:1,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:1,scientist:0,superpower:0,flying:0 } },
  { ar: "أم كلثوم",
    a: { real:1,male:0,human:1,alive:0,arabic:1,modern:0,athlete:0,soccer:0,singer:1,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "محمد علي كلاي",
    a: { real:1,male:1,human:1,alive:0,arabic:0,modern:0,athlete:1,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "ألبرت أينشتاين",
    a: { real:1,male:1,human:1,alive:0,arabic:0,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:1,superpower:0,flying:0 } },
  { ar: "ليوناردو دي كابريو",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:1,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "أنجلينا جولي",
    a: { real:1,male:0,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:1,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "ستيف هارفي",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:1,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  // ── Fictional characters ──────────────────────────────────────────────────────
  { ar: "سبايدرمان",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:1 } },
  { ar: "باتمان",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "سوبرمان",
    a: { real:0,male:1,human:0,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:1 } },
  { ar: "أيرون مان",
    a: { real:0,male:1,human:1,alive:0,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:0,animal:0,royal:0,scientist:1,superpower:1,flying:1 } },
  { ar: "ثانوس",
    a: { real:0,male:1,human:0,alive:0,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:1,cartoon:1,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:0 } },
  { ar: "جوكر",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:1,cartoon:1,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "هاري بوتر",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:1 } },
  { ar: "فولديمورت",
    a: { real:0,male:1,human:1,alive:0,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:1,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:0 } },
  { ar: "دارث فيدر",
    a: { real:0,male:1,human:0,alive:0,arabic:0,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:1,cartoon:1,anime:0,disney:1,animal:0,royal:0,scientist:0,superpower:1,flying:0 } },
  { ar: "يودا",
    a: { real:0,male:1,human:0,alive:0,arabic:0,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:1,animal:0,royal:0,scientist:0,superpower:1,flying:0 } },
  { ar: "شيرلوك هولمز",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "دراكولا",
    a: { real:0,male:1,human:0,alive:1,arabic:0,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:1,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:1 } },
  { ar: "سيمبا",
    a: { real:0,male:1,human:0,alive:1,arabic:0,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:1,animal:1,royal:1,scientist:0,superpower:0,flying:0 } },
  { ar: "إلسا",
    a: { real:0,male:0,human:1,alive:1,arabic:0,modern:0,athlete:0,soccer:0,singer:1,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:1,animal:0,royal:1,scientist:0,superpower:1,flying:0 } },
  { ar: "علاء الدين",
    a: { real:0,male:1,human:1,alive:1,arabic:1,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:1,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "ميكي ماوس",
    a: { real:0,male:1,human:0,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:1,animal:1,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "ناروتو",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:1,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:0 } },
  { ar: "غوكو",
    a: { real:0,male:1,human:0,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:1,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:1 } },
  { ar: "لوفي",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:1,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:0 } },
  { ar: "سايتاما",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:1,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:0 } },
  { ar: "جحا",
    a: { real:0,male:1,human:1,alive:0,arabic:1,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:1,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "موانا",
    a: { real:0,male:0,human:1,alive:1,arabic:0,modern:0,athlete:0,soccer:0,singer:1,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:1,animal:0,royal:1,scientist:0,superpower:0,flying:0 } },
];

// ─── Questions ────────────────────────────────────────────────────────────────

const QUESTIONS: Record<string, string> = {
  real:       "هل شخصيتك شخص حقيقي ومشهور؟",
  male:       "هل شخصيتك من الذكور؟",
  human:      "هل شخصيتك إنسان؟",
  alive:      "هل لا تزال شخصيتك حية حتى اليوم؟",
  arabic:     "هل شخصيتك عربية أو من العالم العربي؟",
  modern:     "هل تعيش شخصيتك في العصر الحديث؟",
  superpower: "هل لشخصيتك قوى خارقة أو سحرية؟",
  athlete:    "هل شخصيتك رياضي/ة محترف/ة؟",
  soccer:     "هل شخصيتك لاعب/ة كرة القدم؟",
  singer:     "هل شخصيتك مغني/ة أو فنانة موسيقية؟",
  actor:      "هل شخصيتك ممثل/ة في السينما أو التلفاز؟",
  politician: "هل شخصيتك سياسي/ة أو زعيم دولة؟",
  hero:       "هل شخصيتك بطل/ة تحارب من أجل الخير؟",
  villain:    "هل شخصيتك شرير/ة أو الخصم الرئيسي؟",
  cartoon:    "هل شخصيتك من كرتون أو رسوم متحركة؟",
  anime:      "هل شخصيتك من أنمي ياباني؟",
  disney:     "هل شخصيتك من إنتاج ديزني؟",
  animal:     "هل شخصيتك حيوان أو مخلوق غير بشري؟",
  royal:      "هل شخصيتك ملك/ة أو أمير/ة أو من العائلة المالكة؟",
  scientist:  "هل شخصيتك عالم/ة أو مخترع/ة أو رائد أعمال تقني؟",
  flying:     "هل تستطيع شخصيتك الطيران؟",
};

const MAX_STEPS   = 20;
const GUESS_AFTER = 15; // ask after this many questions if confident

// ─── Algorithm ────────────────────────────────────────────────────────────────

function initScores(): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const c of CHARS) scores[c.ar] = 1.0;
  return scores;
}

function updateScores(
  scores: Record<string, number>,
  key: string,
  answer: "yes" | "no" | "dk",
): Record<string, number> {
  const s = { ...scores };
  for (const c of CHARS) {
    const v = c.a[key];
    if (answer === "yes") {
      s[c.ar]! *= v === 1 ? 2.0 : v === 0 ? 0.04 : 0.5;
    } else if (answer === "no") {
      s[c.ar]! *= v === 0 ? 2.0 : v === 1 ? 0.04 : 0.5;
    }
    // "dk" → no change (keeps all open)
    if (s[c.ar]! < 1e-9) s[c.ar] = 1e-9;
  }
  return s;
}

function pickBestQuestion(scores: Record<string, number>, askedKeys: string[]): string | null {
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  let bestKey: string | null = null;
  let bestDist = Infinity;

  for (const key of Object.keys(QUESTIONS)) {
    if (askedKeys.includes(key)) continue;
    let yes = 0;
    for (const c of CHARS) {
      const v = c.a[key];
      const sc = scores[c.ar] ?? 0;
      yes += v === 1 ? sc : v === undefined ? sc * 0.5 : 0;
    }
    const ratio = yes / (total + 1e-9);
    const dist  = Math.abs(ratio - 0.5);
    if (dist < bestDist) { bestDist = dist; bestKey = key; }
  }
  return bestKey;
}

function topChars(scores: Record<string, number>): string[] {
  return Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .map(([n]) => n);
}

function confidence(scores: Record<string, number>): number {
  const vals  = Object.values(scores);
  const total = vals.reduce((a, b) => a + b, 0);
  const top   = Math.max(...vals);
  return top / (total + 1e-9);
}

function shouldGuess(scores: Record<string, number>, step: number): boolean {
  return confidence(scores) > 0.60 || step >= GUESS_AFTER;
}

// ─── Keyboard helpers ─────────────────────────────────────────────────────────

function answerKb(chatId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅  نعم",      `aki:yes:${chatId}`),
      Markup.button.callback("❌  لا",        `aki:no:${chatId}`),
      Markup.button.callback("🤷  لا أعلم",  `aki:dk:${chatId}`),
    ],
  ]);
}

function guessKb(chatId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅  نعم، أصبت!",    `aki:correct:${chatId}`),
      Markup.button.callback("❌  لا، أخطأت",     `aki:wrong:${chatId}`),
    ],
  ]);
}

// ─── Send / replace message ───────────────────────────────────────────────────

async function sendCard(
  bot: Telegraf,
  chatId: number,
  state: AkinatorState,
  buf: Buffer,
  kb: ReturnType<typeof Markup.inlineKeyboard>,
) {
  if (state.msgId) {
    bot.telegram.deleteMessage(chatId, state.msgId).catch(() => {});
    state.msgId = null;
  }
  const msg = await bot.telegram.sendPhoto(
    chatId,
    { source: buf },
    { reply_markup: kb.reply_markup },
  );
  state.msgId = msg.message_id;
}

// ─── Game functions ───────────────────────────────────────────────────────────

export async function startAkinator(
  bot: Telegraf,
  chatId: number,
  userId: number,
  _username: string | undefined,
  firstName: string,
  _lastName: string,
): Promise<void> {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId, "⚠️ في لعبة شغالة بالفعل.").catch(() => {});
    return;
  }

  const state: AkinatorState = {
    type:         "akinator",
    chatId,
    userId,
    msgId:        null,
    step:         0,
    scores:       initScores(),
    askedKeys:    [],
    currentKey:   null,
    phase:        "playing",
    guessAttempts: 0,
    triedChars:   [],
  };
  gameStates.set(chatId, state);

  const buf = await generateAkinatorWelcomeCard();
  const startKb = Markup.inlineKeyboard([
    [Markup.button.callback("🔮  ابدأ التحدي!", `aki:start:${chatId}`)],
  ]);
  const msg = await bot.telegram.sendPhoto(chatId, { source: buf }, { reply_markup: startKb.reply_markup });
  state.msgId = msg.message_id;
}

export async function handleAkinatorStart(
  bot: Telegraf,
  ctx: { from: { id: number }; answerCbQuery: (s?: string) => Promise<void> },
  chatId: number,
): Promise<void> {
  const state = gameStates.get(chatId) as AkinatorState | undefined;
  if (!state || state.type !== "akinator") return;

  await ctx.answerCbQuery("🔮").catch(() => {});

  // Ask first question
  const key = pickBestQuestion(state.scores, state.askedKeys);
  if (!key) { clearGame(chatId); return; }

  state.step++;
  state.currentKey = key;
  state.askedKeys.push(key);

  const buf = await generateAkinatorQuestionCard(QUESTIONS[key]!, state.step, MAX_STEPS);
  await sendCard(bot, chatId, state, buf, answerKb(chatId));
}

export async function handleAkinatorAnswer(
  bot: Telegraf,
  ctx: { from: { id: number }; answerCbQuery: (s?: string) => Promise<void> },
  chatId: number,
  answer: "yes" | "no" | "dk",
): Promise<void> {
  const state = gameStates.get(chatId) as AkinatorState | undefined;
  if (!state || state.type !== "akinator" || state.phase !== "playing") return;

  await ctx.answerCbQuery(answer === "yes" ? "✅" : answer === "no" ? "❌" : "🤷").catch(() => {});

  if (!state.currentKey) return;

  // Update scores
  state.scores = updateScores(state.scores, state.currentKey, answer);

  // Decide: keep asking or guess?
  if (shouldGuess(state.scores, state.step) || state.step >= MAX_STEPS) {
    await doGuess(bot, chatId, state);
    return;
  }

  // Next question
  const key = pickBestQuestion(state.scores, state.askedKeys);
  if (!key) {
    await doGuess(bot, chatId, state);
    return;
  }

  state.step++;
  state.currentKey = key;
  state.askedKeys.push(key);

  const buf = await generateAkinatorQuestionCard(QUESTIONS[key]!, state.step, MAX_STEPS);
  await sendCard(bot, chatId, state, buf, answerKb(chatId));
}

async function doGuess(bot: Telegraf, chatId: number, state: AkinatorState): Promise<void> {
  const ranked = topChars(state.scores).filter(n => !state.triedChars.includes(n));
  if (ranked.length === 0) {
    // Give up
    if (state.msgId) bot.telegram.deleteMessage(chatId, state.msgId).catch(() => {});
    state.msgId = null;
    const buf = await generateAkinatorLoseCard();
    const msg = await bot.telegram.sendPhoto(chatId, { source: buf });
    state.msgId = msg.message_id;
    clearGame(chatId);
    return;
  }

  const guess = ranked[0]!;
  state.triedChars.push(guess);
  state.guessAttempts++;
  state.phase = "guessing";

  const buf = await generateAkinatorGuessCard(guess, state.guessAttempts);
  await sendCard(bot, chatId, state, buf, guessKb(chatId));
}

export async function handleAkinatorCorrect(
  bot: Telegraf,
  ctx: { from: { id: number }; answerCbQuery: (s?: string) => Promise<void> },
  chatId: number,
): Promise<void> {
  const state = gameStates.get(chatId) as AkinatorState | undefined;
  if (!state || state.type !== "akinator") return;

  await ctx.answerCbQuery("🎉").catch(() => {});

  if (state.msgId) bot.telegram.deleteMessage(chatId, state.msgId).catch(() => {});
  state.msgId = null;

  const guessedChar = state.triedChars[state.triedChars.length - 1] ?? "الشخصية";
  const buf = await generateAkinatorWinCard(guessedChar, state.step);
  await bot.telegram.sendPhoto(chatId, { source: buf });
  clearGame(chatId);
}

export async function handleAkinatorWrong(
  bot: Telegraf,
  ctx: { from: { id: number }; answerCbQuery: (s?: string) => Promise<void> },
  chatId: number,
): Promise<void> {
  const state = gameStates.get(chatId) as AkinatorState | undefined;
  if (!state || state.type !== "akinator") return;

  await ctx.answerCbQuery("❌").catch(() => {});

  // Penalize the wrong guess heavily and try again
  const wrongChar = state.triedChars[state.triedChars.length - 1];
  if (wrongChar) state.scores[wrongChar] = 0;

  state.phase = "playing";

  // Keep asking or guess another
  const ranked = topChars(state.scores).filter(n => !state.triedChars.includes(n));
  const conf   = confidence(state.scores);

  if (ranked.length === 0 || (state.guessAttempts >= 3 && conf < 0.3)) {
    // Give up
    if (state.msgId) bot.telegram.deleteMessage(chatId, state.msgId).catch(() => {});
    state.msgId = null;
    const buf = await generateAkinatorLoseCard();
    await bot.telegram.sendPhoto(chatId, { source: buf });
    clearGame(chatId);
    return;
  }

  if (state.step < MAX_STEPS && !shouldGuess(state.scores, state.step)) {
    // Ask more questions
    const key = pickBestQuestion(state.scores, state.askedKeys);
    if (key) {
      state.step++;
      state.currentKey = key;
      state.askedKeys.push(key);
      const buf = await generateAkinatorQuestionCard(QUESTIONS[key]!, state.step, MAX_STEPS);
      await sendCard(bot, chatId, state, buf, answerKb(chatId));
      return;
    }
  }

  // Guess another character
  await doGuess(bot, chatId, state);
}

export async function handleAkinatorStop(
  bot: Telegraf,
  chatId: number,
): Promise<void> {
  const state = gameStates.get(chatId) as AkinatorState | undefined;
  if (!state || state.type !== "akinator") return;
  if (state.msgId) bot.telegram.deleteMessage(chatId, state.msgId).catch(() => {});
  clearGame(chatId);
  bot.telegram.sendMessage(chatId, "🔮 انتهت جلسة المارد العبقري.").catch(() => {});
}
