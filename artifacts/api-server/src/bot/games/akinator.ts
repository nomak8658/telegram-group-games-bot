import type { Telegraf } from "telegraf";
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

type A = 1 | 0;
interface Char {
  ar:   string;
  wiki: string; // Wikipedia page title (English)
  a:    Record<string, A | undefined>;
}

const CHARS: Char[] = [
  // ── Real people ──────────────────────────────────────────────────────────────
  { ar: "محمد صلاح",           wiki: "Mohamed Salah",
    a: { real:1,male:1,human:1,alive:1,arabic:1,modern:1,athlete:1,soccer:1,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "كريستيانو رونالدو",   wiki: "Cristiano Ronaldo",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:1,soccer:1,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "ليونيل ميسي",         wiki: "Lionel Messi",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:1,soccer:1,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "نيمار",               wiki: "Neymar",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:1,soccer:1,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "كيليان مبابي",        wiki: "Kylian Mbappé",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:1,soccer:1,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "مايكل جوردان",        wiki: "Michael Jordan",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:1,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "مايكل جاكسون",        wiki: "Michael Jackson",
    a: { real:1,male:1,human:1,alive:0,arabic:0,modern:0,athlete:0,soccer:0,singer:1,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "شاكيرا",              wiki: "Shakira",
    a: { real:1,male:0,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:1,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "بيونسيه",             wiki: "Beyoncé",
    a: { real:1,male:0,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:1,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "إيلون ماسك",          wiki: "Elon Musk",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:1,superpower:0,flying:0 } },
  { ar: "بيل غيتس",            wiki: "Bill Gates",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:1,superpower:0,flying:0 } },
  { ar: "باراك أوباما",         wiki: "Barack Obama",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:1,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "الملك عبدالله الثاني", wiki: "Abdullah II",
    a: { real:1,male:1,human:1,alive:1,arabic:1,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:1,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:1,scientist:0,superpower:0,flying:0 } },
  { ar: "الملك تشارلز الثالث", wiki: "Charles III",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:1,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:1,scientist:0,superpower:0,flying:0 } },
  { ar: "أم كلثوم",            wiki: "Umm Kulthum",
    a: { real:1,male:0,human:1,alive:0,arabic:1,modern:0,athlete:0,soccer:0,singer:1,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "محمد علي كلاي",       wiki: "Muhammad Ali",
    a: { real:1,male:1,human:1,alive:0,arabic:0,modern:0,athlete:1,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "ألبرت أينشتاين",      wiki: "Albert Einstein",
    a: { real:1,male:1,human:1,alive:0,arabic:0,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:1,superpower:0,flying:0 } },
  { ar: "ليوناردو دي كابريو",  wiki: "Leonardo DiCaprio",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:1,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "أنجلينا جولي",        wiki: "Angelina Jolie",
    a: { real:1,male:0,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:1,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "ستيف هارفي",          wiki: "Steve Harvey",
    a: { real:1,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:1,politician:0,hero:0,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  // ── Fictional characters ──────────────────────────────────────────────────────
  { ar: "سبايدرمان",           wiki: "Spider-Man",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:1 } },
  { ar: "باتمان",              wiki: "Batman",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "سوبرمان",             wiki: "Superman",
    a: { real:0,male:1,human:0,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:1 } },
  { ar: "أيرون مان",           wiki: "Iron Man",
    a: { real:0,male:1,human:1,alive:0,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:0,animal:0,royal:0,scientist:1,superpower:1,flying:1 } },
  { ar: "ثانوس",               wiki: "Thanos",
    a: { real:0,male:1,human:0,alive:0,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:1,cartoon:1,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:0 } },
  { ar: "جوكر",                wiki: "Joker (character)",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:1,cartoon:1,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "هاري بوتر",           wiki: "Harry Potter (character)",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:1 } },
  { ar: "فولديمورت",           wiki: "Lord Voldemort",
    a: { real:0,male:1,human:1,alive:0,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:1,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:0 } },
  { ar: "دارث فيدر",           wiki: "Darth Vader",
    a: { real:0,male:1,human:0,alive:0,arabic:0,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:1,cartoon:1,anime:0,disney:1,animal:0,royal:0,scientist:0,superpower:1,flying:0 } },
  { ar: "يودا",                wiki: "Yoda",
    a: { real:0,male:1,human:0,alive:0,arabic:0,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:1,animal:0,royal:0,scientist:0,superpower:1,flying:0 } },
  { ar: "شيرلوك هولمز",        wiki: "Sherlock Holmes",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "دراكولا",             wiki: "Count Dracula",
    a: { real:0,male:1,human:0,alive:1,arabic:0,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:1,cartoon:0,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:1 } },
  { ar: "سيمبا",               wiki: "Simba",
    a: { real:0,male:1,human:0,alive:1,arabic:0,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:1,animal:1,royal:1,scientist:0,superpower:0,flying:0 } },
  { ar: "إلسا",                wiki: "Elsa (Frozen)",
    a: { real:0,male:0,human:1,alive:1,arabic:0,modern:0,athlete:0,soccer:0,singer:1,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:1,animal:0,royal:1,scientist:0,superpower:1,flying:0 } },
  { ar: "علاء الدين",          wiki: "Aladdin",
    a: { real:0,male:1,human:1,alive:1,arabic:1,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:1,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "ميكي ماوس",           wiki: "Mickey Mouse",
    a: { real:0,male:1,human:0,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:0,disney:1,animal:1,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "ناروتو",              wiki: "Naruto Uzumaki",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:1,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:0 } },
  { ar: "غوكو",                wiki: "Goku",
    a: { real:0,male:1,human:0,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:1,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:1 } },
  { ar: "لوفي",                wiki: "Monkey D. Luffy",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:1,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:0 } },
  { ar: "سايتاما",             wiki: "Saitama (One-Punch Man)",
    a: { real:0,male:1,human:1,alive:1,arabic:0,modern:1,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:1,villain:0,cartoon:1,anime:1,disney:0,animal:0,royal:0,scientist:0,superpower:1,flying:0 } },
  { ar: "جحا",                 wiki: "Juha (folklore)",
    a: { real:0,male:1,human:1,alive:0,arabic:1,modern:0,athlete:0,soccer:0,singer:0,actor:0,politician:0,hero:0,villain:0,cartoon:1,anime:0,disney:0,animal:0,royal:0,scientist:0,superpower:0,flying:0 } },
  { ar: "موانا",               wiki: "Moana (Disney)",
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
const GUESS_AFTER = 15;

// ─── Wikipedia image fetch ────────────────────────────────────────────────────

async function fetchWikiImage(wikiTitle: string): Promise<Buffer | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "TelegramGameBot/1.0 (educational-project)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { thumbnail?: { source?: string } };
    const imgUrl = data.thumbnail?.source;
    if (!imgUrl) return null;
    const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(6000) });
    if (!imgRes.ok) return null;
    return Buffer.from(await imgRes.arrayBuffer());
  } catch {
    return null;
  }
}

function charByName(name: string): Char | undefined {
  return CHARS.find(c => c.ar === name);
}

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
      Markup.button.callback("✅  نعم",     `aki:yes:${chatId}`),
      Markup.button.callback("❌  لا",       `aki:no:${chatId}`),
      Markup.button.callback("🤷  لا أعلم", `aki:dk:${chatId}`),
    ],
  ]);
}

function guessKb(chatId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅  نعم، أصبت!",  `aki:correct:${chatId}`),
      Markup.button.callback("❌  لا، أخطأت",   `aki:wrong:${chatId}`),
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

// ─── Owner check ──────────────────────────────────────────────────────────────

function isOwner(state: AkinatorState, userId: number): boolean {
  return state.userId === userId;
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
    type:          "akinator",
    chatId,
    userId,
    msgId:         null,
    step:          0,
    scores:        initScores(),
    askedKeys:     [],
    currentKey:    null,
    phase:         "playing",
    guessAttempts: 0,
    triedChars:    [],
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

  if (!isOwner(state, ctx.from.id)) {
    await ctx.answerCbQuery("🚫 اللعبة ليست لك!").catch(() => {});
    return;
  }

  await ctx.answerCbQuery("🔮").catch(() => {});

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

  if (!isOwner(state, ctx.from.id)) {
    await ctx.answerCbQuery("🚫 فقط من بدأ اللعبة يجيب!").catch(() => {});
    return;
  }

  await ctx.answerCbQuery(answer === "yes" ? "✅" : answer === "no" ? "❌" : "🤷").catch(() => {});

  if (!state.currentKey) return;

  state.scores = updateScores(state.scores, state.currentKey, answer);

  if (shouldGuess(state.scores, state.step) || state.step >= MAX_STEPS) {
    await doGuess(bot, chatId, state);
    return;
  }

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

  if (!isOwner(state, ctx.from.id)) {
    await ctx.answerCbQuery("🚫 فقط من بدأ اللعبة يجيب!").catch(() => {});
    return;
  }

  await ctx.answerCbQuery("🎉").catch(() => {});

  if (state.msgId) bot.telegram.deleteMessage(chatId, state.msgId).catch(() => {});
  state.msgId = null;

  const guessedChar = state.triedChars[state.triedChars.length - 1] ?? "الشخصية";
  const char = charByName(guessedChar);

  // Fetch character image from Wikipedia (best-effort)
  let charImage: Buffer | null = null;
  if (char?.wiki) {
    charImage = await fetchWikiImage(char.wiki);
  }

  const buf = await generateAkinatorWinCard(guessedChar, state.step, charImage);
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

  if (!isOwner(state, ctx.from.id)) {
    await ctx.answerCbQuery("🚫 فقط من بدأ اللعبة يجيب!").catch(() => {});
    return;
  }

  await ctx.answerCbQuery("❌").catch(() => {});

  const wrongChar = state.triedChars[state.triedChars.length - 1];
  if (wrongChar) state.scores[wrongChar] = 0;

  state.phase = "playing";

  const ranked = topChars(state.scores).filter(n => !state.triedChars.includes(n));
  const conf   = confidence(state.scores);

  if (ranked.length === 0 || (state.guessAttempts >= 3 && conf < 0.3)) {
    if (state.msgId) bot.telegram.deleteMessage(chatId, state.msgId).catch(() => {});
    state.msgId = null;
    const buf = await generateAkinatorLoseCard();
    await bot.telegram.sendPhoto(chatId, { source: buf });
    clearGame(chatId);
    return;
  }

  if (state.step < MAX_STEPS && !shouldGuess(state.scores, state.step)) {
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
