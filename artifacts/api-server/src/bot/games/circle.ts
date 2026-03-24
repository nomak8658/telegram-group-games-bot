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

// ─── Category word lists ──────────────────────────────────────────────────────

const WORDS: Record<string, string[]> = {
  animals: [
    // أليفة وشائعة جداً
    "قط","كلب","حصان","بقرة","شاة","خروف","ماعز","أرنب","ببغاء","حمام","دجاج","ديك","بط","إوزة",
    "جمل","ناقة","حمار","بغل","جاموس","فأر",
    // كبيرة وشهيرة
    "أسد","نمر","فيل","زرافة","قرد","ثعلب","ذئب","دب","كركدن","فهد","شمبانزي","غوريلا","حصان",
    "زبرا","غزال","وعل","أيل","نمس","ظبي","لاما","مها","يرقان","كنغر","ألباكا","ياك",
    // طيور
    "نسر","صقر","طاووس","بجعة","لقلق","فلامينغو","بومة","هدهد","بلبل","عصفور","غراب",
    "شاهين","عندليب","طوقان","حجل","رخمة","عقاب","سنونو","يمامة","حجل","بطريق","كركي",
    // بحرية
    "دلفين","حوت","قرش","أخطبوط","حبار","نجم البحر","فقمة","أسد البحر","سلطعون","كركند",
    "سمكة","تونة","سلطعون","حصان البحر","قنديل البحر",
    // زواحف وبرمائيات
    "تمساح","أفعى","ثعبان","كوبرا","سحلية","حرباء","سلحفاة","ضفدع","ضب","ورل","وزغ","برص",
    // حشرات وأخرى
    "نحلة","فراشة","نمل","صرصور","عقرب","بعوضة","ذبابة","دودة","خنفساء","حلزون","عنكبوت",
    // إضافية شائعة في العربية
    "خفاش","قنفذ","سنجاب","ضبع","وشق","غرير","دلق","ابن عرس","راكون","بابون","قرد المكاك",
  ],
  fruits: [
    "تفاح","موز","برتقال","عنب","بطيخ","فراولة","مانجو","خوخ","كمثرى","تين","رمان","ليمون","بطاطا",
    "أناناس","كيوي","توت","كرز","خرموز","شمام","بلح","نخل","جوافة","بابايا","ليتشي","نارنج",
    "زيتون","نبق","حصرم","عوسج","قشطة","آفوكادو","تمر","مشمش","برقوق","كراز","لوزة","فستق",
    "جوز","لوز","حبحب","جريب فروت","مندرين","يوسفي","كلمنتين","نكتارين","إجاص","دراق","عليق",
  ],
  colors: [
    "أحمر","أزرق","أخضر","أصفر","أبيض","أسود","برتقالي","بنفسجي","وردي","بني","رمادي","ذهبي",
    "فضي","تركوازي","زيتي","كحلي","عنابي","قرمزي","فيروزي","أرجواني","سماوي","بيج","كريمي",
    "خوخي","ليموني","بطيخي","نيلي","دموعي","شفاف","قاتم","فاتح","ملوني",
  ],
  cities_sa: [
    "الرياض","جدة","مكة","المدينة","الدمام","الخبر","الظهران","تبوك","أبها","خميس مشيط",
    "حائل","نجران","جازان","ينبع","القطيف","الهفوف","الطائف","بريدة","عنيزة","أرامكو",
    "المجمعة","الجبيل","شقراء","الزلفي","عرعر","سكاكا","القيصومة","رفحاء","طريف","وادي الدواسر",
    "بيشة","المخواة","القنفذة","صبيا","احد رفيدة","ضباء","العُلا","العقيق","المندق",
  ],
  countries_ar: [
    "السعودية","مصر","الإمارات","الكويت","قطر","البحرين","عُمان","الأردن","لبنان","سوريا",
    "العراق","ليبيا","تونس","الجزائر","المغرب","السودان","اليمن","الصومال","موريتانيا","جيبوتي",
    "فلسطين","الأراضي الفلسطينية",
  ],
  countries_asia: [
    "الصين","اليابان","الهند","كوريا","تايلاند","إندونيسيا","ماليزيا","سنغافورة","فيتنام",
    "الفلبين","بنغلاديش","باكستان","أفغانستان","إيران","تركيا","كازاخستان","أوزبكستان",
    "تركمانستان","أذربيجان","جورجيا","أرمينيا","نيبال","سريلانكا","ميانمار","كمبوديا","لاوس",
    "منغوليا","كوريا الشمالية","تايوان","هونج كونج","تيمور الشرقية","بروناي","المالديف",
  ],
  jobs: [
    "طبيب","مهندس","معلم","محامي","طيار","ممرض","شرطي","جندي","عامل","فلاح","بائع","محاسب",
    "مصمم","برمجة","مبرمج","مدير","مستشار","سائق","طباخ","حلاق","نجار","حداد","كهربائي",
    "سباك","بناء","رسام","ممثل","صحفي","مذيع","فنان","موسيقي","رياضي","لاعب","مدرب",
    "دكتور","صيدلاني","مختبر","أشعة","مساح","معماري","ديكور","مصور","مخرج","كاتب","شاعر",
  ],
  food: [
    "كبسة","مندي","مطبق","حريس","جريش","صالونة","كباب","شاورما","فلافل","حمص","فتة","مسخن",
    "مقلوبة","بريياني","سمبوسة","لقيمات","خبز","رز","عيش","لحم","دجاج","سمك","تمر","قهوة",
    "شاي","لبن","عصير","هريس","بسبوسة","كنافة","قطايف","مهلبية","رز بالحليب","كليجا",
  ],
  rivers: [
    "النيل","الفرات","دجلة","الأمازون","المسيسيبي","الفولغا","الراين","الدانوب","الميكونغ",
    "الغانج","السند","نهر الصين الأصفر","اليانغتسي","الكونغو","النيجر","الزمبيزي","الأورال",
    "الأوب","الينيسي","اللينا","المتزموري","الهدسون","كولورادو","أوهايو","ميسوري",
  ],
};

function normalize(t: string): string {
  return t.trim()
    .replace(/[أإآا]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/[\u064B-\u065F]/g, "") // remove tashkeel
    .toLowerCase();
}

function inList(answer: string, list: string[]): boolean {
  const a = normalize(answer.trim().split(/\s+/)[0]); // first word only
  if (a.length < 2) return false;
  return list.some(w => {
    const nw = normalize(w);
    // Exact match (after normalize)
    if (nw === a) return true;
    // Answer is a prefix of a list word (min 3 chars match) — handles "تمساح" vs "تمس"
    if (a.length >= 3 && nw.startsWith(a) && a.length >= nw.length - 2) return true;
    // List word is the answer (user wrote full correct word)
    if (a.length >= 4 && a.startsWith(nw)) return true;
    return false;
  });
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
      return normalize(t)[0] === normalize(challenge.letter!)[0];
    }
    case "no_letter": {
      if (!isArabic(t) || !challenge.letter) return false;
      return !normalize(t).includes(normalize(challenge.letter!));
    }
    case "race": {
      // any arabic word, at least 2 chars
      return t.length >= 2 && isArabic(t);
    }
    case "category": {
      if (!challenge.category) return false;
      const list = WORDS[challenge.category] ?? [];
      return t.length >= 2 && isArabic(t) && inList(t, list);
    }
    default: return false;
  }
}

// ─── Challenge bank ───────────────────────────────────────────────────────────

const MATH: CircleChallenge[] = [
  { kind: "math", text: "احسب: 7 × 8 = ؟",     expectedNum: 56,  timerSec: 12 },
  { kind: "math", text: "احسب: 6 × 9 = ؟",     expectedNum: 54,  timerSec: 12 },
  { kind: "math", text: "احسب: 15 + 27 = ؟",   expectedNum: 42,  timerSec: 12 },
  { kind: "math", text: "احسب: 100 - 38 = ؟",  expectedNum: 62,  timerSec: 12 },
  { kind: "math", text: "احسب: 48 ÷ 6 = ؟",   expectedNum: 8,   timerSec: 13 },
  { kind: "math", text: "احسب: 13 × 4 = ؟",   expectedNum: 52,  timerSec: 12 },
  { kind: "math", text: "احسب: 200 - 76 = ؟",  expectedNum: 124, timerSec: 14 },
  { kind: "math", text: "احسب: 9 × 9 = ؟",     expectedNum: 81,  timerSec: 10 },
  { kind: "math", text: "احسب: 144 ÷ 12 = ؟", expectedNum: 12,  timerSec: 12 },
  { kind: "math", text: "احسب: 17 × 6 = ؟",   expectedNum: 102, timerSec: 14 },
  { kind: "math", text: "احسب: 88 + 44 = ؟",  expectedNum: 132, timerSec: 13 },
  { kind: "math", text: "احسب: 250 ÷ 5 = ؟",  expectedNum: 50,  timerSec: 12 },
  { kind: "math", text: "احسب: 19 × 3 = ؟",   expectedNum: 57,  timerSec: 12 },
  { kind: "math", text: "احسب: 300 - 127 = ؟", expectedNum: 173, timerSec: 14 },
  { kind: "math", text: "احسب: 64 ÷ 8 = ؟",   expectedNum: 8,   timerSec: 11 },
  { kind: "math", text: "احسب: 25 × 4 = ؟",   expectedNum: 100, timerSec: 12 },
];

const STARTS: CircleChallenge[] = [
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "م"',  letter: "م", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "س"',  letter: "س", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "ب"',  letter: "ب", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "ح"',  letter: "ح", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "ك"',  letter: "ك", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "د"',  letter: "د", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "ج"',  letter: "ج", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "ف"',  letter: "ف", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "ن"',  letter: "ن", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "ل"',  letter: "ل", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "ر"',  letter: "ر", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "ز"',  letter: "ز", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "خ"',  letter: "خ", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "ع"',  letter: "ع", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "ق"',  letter: "ق", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "ش"',  letter: "ش", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "ت"',  letter: "ت", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "ه"',  letter: "ه", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "و"',  letter: "و", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة عربية تبدأ بحرف "أ"',  letter: "أ", timerSec: 10 },
];

const NO_LETTER: CircleChallenge[] = [
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ا"',  letter: "ا", timerSec: 14 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ل"',  letter: "ل", timerSec: 14 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "م"',  letter: "م", timerSec: 14 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ن"',  letter: "ن", timerSec: 14 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ي"',  letter: "ي", timerSec: 14 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "و"',  letter: "و", timerSec: 14 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ب"',  letter: "ب", timerSec: 14 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ر"',  letter: "ر", timerSec: 14 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ع"',  letter: "ع", timerSec: 14 },
  { kind: "no_letter", text: 'اكتب كلمة عربية لا تحتوي حرف "ه"',  letter: "ه", timerSec: 14 },
];

const RACE: CircleChallenge[] = [
  { kind: "race", text: "اكتب أي كلمة عربية أسرع ما تقدر!", timerSec: 8 },
  { kind: "race", text: "اكتب أي كلمة عربية الآن! — الأبطأ يطلع", timerSec: 9 },
  { kind: "race", text: "اكتب كلمة بسرعة! — آخر واحد يجاوب يطلع", timerSec: 8 },
];

const CATEGORY: CircleChallenge[] = [
  { kind: "category", category: "animals",      text: "اكتب اسم حيوان!", timerSec: 10 },
  { kind: "category", category: "animals",      text: "اكتب اسم حيوان بري!", timerSec: 10 },
  { kind: "category", category: "animals",      text: "اسم حيوان — الإجابة الغلط تطلعك!", timerSec: 10 },
  { kind: "category", category: "fruits",       text: "اكتب اسم فاكهة!", timerSec: 10 },
  { kind: "category", category: "fruits",       text: "اسم فاكهة أو ثمرة فقط — غيرها يطلعك!", timerSec: 10 },
  { kind: "category", category: "colors",       text: "اكتب اسم لون!", timerSec: 8 },
  { kind: "category", category: "colors",       text: "اسم لون فقط — أي كلمة ثانية تطلعك!", timerSec: 8 },
  { kind: "category", category: "cities_sa",    text: "اكتب اسم مدينة سعودية!", timerSec: 11 },
  { kind: "category", category: "cities_sa",    text: "مدينة سعودية فقط — غيرها يطلعك!", timerSec: 11 },
  { kind: "category", category: "countries_ar", text: "اكتب اسم دولة عربية!", timerSec: 10 },
  { kind: "category", category: "countries_ar", text: "دولة عربية فقط — أي دولة ثانية تطلعك!", timerSec: 10 },
  { kind: "category", category: "countries_asia", text: "اكتب اسم دولة من آسيا!", timerSec: 11 },
  { kind: "category", category: "jobs",         text: "اكتب اسم مهنة!", timerSec: 9 },
  { kind: "category", category: "jobs",         text: "مهنة فقط — أي كلمة ثانية تطلعك!", timerSec: 9 },
  { kind: "category", category: "food",         text: "اكتب اسم أكلة شعبية!", timerSec: 10 },
  { kind: "category", category: "food",         text: "اسم أكل أو شراب شعبي — غيره يطلعك!", timerSec: 10 },
  { kind: "category", category: "rivers",       text: "اكتب اسم نهر في العالم!", timerSec: 12 },
];

function pickChallenge(round: number, used: Set<string>): CircleChallenge {
  let pool: CircleChallenge[];
  if (round <= 2)       pool = [...RACE, ...CATEGORY.slice(0, 8)];
  else if (round <= 4)  pool = [...CATEGORY, ...STARTS.slice(0, 10)];
  else if (round <= 7)  pool = [...MATH.slice(0, 8), ...CATEGORY, ...STARTS, ...NO_LETTER.slice(0, 4)];
  else                  pool = [...MATH, ...NO_LETTER, ...STARTS, ...CATEGORY];

  const fresh   = pool.filter(c => !used.has(c.text));
  const choices = fresh.length > 0 ? fresh : pool;
  const pick    = choices[Math.floor(Math.random() * choices.length)];
  used.add(pick.text);
  return pick;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_PLAYERS       = 3;
const BETWEEN_ROUNDS_MS = 3_000;

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
    totalRounds: 1,
    completedRounds: 0,
    roundWins: new Map(),
    allPlayers: new Map(),
  };

  s.players.set(hostId, {
    id: hostId, username: hostUsername,
    firstName: hostFirst, lastName: hostLast,
  });
  gameStates.set(chatId, s);

  const msg = await bot.telegram.sendMessage(
    chatId,
    `🔴 <b>الدائرة القاتلة</b>\n\n` +
    `كل جولة تحدي — الأبطأ أو الغلطان يطلع!\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerList(s)}\n\n` +
    `اضغط <b>➕ انضم</b> للمشاركة\n` +
    `<i>اضغط ▶️ ابدأ الآن عندما يكون الكل جاهز</i>`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕  انضم للدائرة", `circle:join:${chatId}`)],
        [Markup.button.callback("▶️  ابدأ الآن",    `circle:fstart:${chatId}`)],
      ]),
    }
  ).catch(() => null);

  if (msg) s.joinMsgId = msg.message_id;
}

export async function handleCircleJoin(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "circle" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ التسجيل مو متاح الحين").catch(() => {}); return;
  }
  if (s.players.has(from.id)) {
    await ctx.answerCbQuery("✅ أنت مسجل مسبقاً!").catch(() => {}); return;
  }

  const p: CirclePlayer = {
    id: from.id,
    username:  from.username,
    firstName: from.first_name ?? "",
    lastName:  from.last_name  ?? "",
  };
  s.players.set(from.id, p);

  await ctx.answerCbQuery("✅ دخلت الدائرة!").catch(() => {});
  bot.telegram.sendMessage(
    chatId,
    `✅ <b>${esc(dnC(p))}</b> دخل الدائرة!\n👥 اللاعبون (${s.players.size}):\n${playerList(s)}`,
    { parse_mode: "HTML" }
  ).catch(() => {});
}

export async function handleCircleForceStart(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "circle" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ ما في تسجيل").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط من أنشأ اللعبة يقدر يبدأها!").catch(() => {}); return;
  }
  if (s.players.size < MIN_PLAYERS) {
    await ctx.answerCbQuery(`⚠️ ما يكفي لاعبين! (${s.players.size}/${MIN_PLAYERS})`).catch(() => {}); return;
  }

  await ctx.answerCbQuery("🔢 اختر عدد الراوندات!").catch(() => {});
  s.phase = "selecting";

  // Build 2-row keyboard: 1-5 top, 6-10 bottom
  const row1 = [1,2,3,4,5].map(n =>
    Markup.button.callback(`${n}`, `circle:setn:${n}:${chatId}`)
  );
  const row2 = [6,7,8,9,10].map(n =>
    Markup.button.callback(`${n}`, `circle:setn:${n}:${chatId}`)
  );

  const msg = await bot.telegram.sendMessage(
    chatId,
    `🔢 <b>كم راوند تبون تلعبون؟</b>\n\n` +
    `كل راوند = لعبة كاملة من الدائرة القاتلة\n` +
    `الفائز بكل راوند يحصل نقطة — في النهاية البطل الأكبر يُعلن!\n\n` +
    `👥 اللاعبون: <b>${s.players.size}</b>\n\n` +
    `<i>اختر العدد أدناه:</i>`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([row1, row2]),
    }
  ).catch(() => null);

  if (msg) s.selectMsgId = msg.message_id;
}

export async function handleCircleSetRounds(bot: Telegraf, ctx: Context, chatId: number, n: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "circle" || s.phase !== "selecting") {
    await ctx.answerCbQuery("❌ ما في اختيار متاح").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط من أنشأ اللعبة يقدر يختار!").catch(() => {}); return;
  }

  s.totalRounds = n;
  await ctx.answerCbQuery(`✅ ${n} راوند — يلا نبدأ!`).catch(() => {});

  // Remove selection buttons
  if (s.selectMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.selectMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
  }

  await bot.telegram.sendMessage(
    chatId,
    `✅ <b>تم! ${n} راوند${n > 1 ? "ات" : ""}</b>\n\n` +
    `👥 اللاعبون: ${[...s.players.values()].map(p => esc(dnC(p))).join("، ")}\n\n` +
    `<i>الراوند الأول يبدأ خلال ثوانٍ...</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  s.phase = "joining"; // reset to allow launchCircle to proceed
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
  if (s.responses.has(uid)) return; // one answer per round per player
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
    clearGame(chatId); return;
  }

  if (s.joinTimer)     clearTimeout(s.joinTimer);
  if (s.joinWarnTimer) clearTimeout(s.joinWarnTimer);

  // Save the full player list so we can reset between rounds
  s.allPlayers = new Map(s.players);

  s.phase = "playing";
  s.round = 0;
  s.eliminated = [];
  s.responses = new Map();
  s.usedChallenges = new Set();

  const isMulti = s.totalRounds > 1;
  const roundLabel = isMulti ? `  •  الراوند ${s.completedRounds + 1} من ${s.totalRounds}` : "";

  await bot.telegram.sendMessage(
    chatId,
    `🔴 <b>الدائرة القاتلة — انطلقت!${roundLabel}</b>\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerList(s)}\n\n` +
    `اكتبوا إجاباتكم في القروب عند ظهور كل تحدي\n` +
    `آخر واحد يبقى = فائز هذا الراوند\n\n` +
    `<i>الجولة الأولى خلال ثوانٍ...</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => sendChallenge(bot, chatId), BETWEEN_ROUNDS_MS);
}

async function sendChallenge(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "circle" || s.phase !== "playing") return;

  s.round++;
  s.responses = new Map();

  // Double elimination only when > 4 players remain (to avoid ending the game too fast)
  const doubleElim = s.round % 3 === 0 && s.players.size > 4;
  s.doubleElim = doubleElim;

  const challenge = pickChallenge(s.round, s.usedChallenges);
  s.challenge = challenge;

  const remaining = [...s.players.values()].map(p => `• ${esc(dnC(p))}`).join("\n");

  let header = `🔴 <b>الجولة ${s.round}</b>`;
  if (doubleElim) header += `  ⚡ إقصاء مزدوج!`;
  if (s.round >= 7) header += `  🔥`;

  // Challenge type hint
  const catLabel: Record<string, string> = {
    animals: "🐾 حيوانات", fruits: "🍓 فواكه", colors: "🎨 ألوان",
    cities_sa: "🏙️ مدن سعودية", countries_ar: "🌍 دول عربية",
    countries_asia: "🌏 دول آسيا", jobs: "💼 مهن", food: "🍽️ أكل شعبي", rivers: "🌊 أنهار",
  };
  let hint = "";
  if (challenge.kind === "math")      hint = "📐 <b>حساب</b> — اكتب الرقم بالأرقام فقط";
  if (challenge.kind === "starts")    hint = "✍️ <b>كلمة بحرف معين</b> — أول كلمة صح تنجو";
  if (challenge.kind === "no_letter") hint = "🚫 <b>حرف محظور</b> — إجابة تحتويه = إقصاء فوري";
  if (challenge.kind === "race")      hint = "⚡ <b>سباق كلمات</b> — أسرع كلمة عربية تنجو";
  if (challenge.kind === "category") {
    const cat = challenge.category ?? "";
    hint = `🎯 <b>الفئة: ${catLabel[cat] ?? cat}</b> — كلمة خارج الفئة = إقصاء فوري`;
  }

  const msg = await bot.telegram.sendMessage(
    chatId,
    `${header}\n\n` +
    `👥 <b>المتبقون (${s.players.size}):</b>\n${remaining}\n\n` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
    `🎯 ${hint}\n\n` +
    `<b>${challenge.text}</b>\n` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
    `⏱ <b>${challenge.timerSec} ثانية</b>` +
    (doubleElim ? `  •  شخصان سيطلعان!` : ""),
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

  // Guard: only run once
  if (s.challengeTimer) { clearTimeout(s.challengeTimer); s.challengeTimer = undefined; }

  const challenge = s.challenge;
  s.challenge     = null;

  const allUids  = [...s.players.keys()];
  const correct: { uid: number; ts: number }[] = [];
  const wrong:      number[] = [];
  const noResp:     number[] = [];

  for (const uid of allUids) {
    const r = s.responses.get(uid);
    if (!r) {
      noResp.push(uid);
    } else if (validateAnswer(challenge, r.text)) {
      correct.push({ uid, ts: r.timestamp });
    } else {
      wrong.push(uid);
    }
  }

  correct.sort((a, b) => a.ts - b.ts);

  // Elimination logic per challenge type
  let elimCandidates: number[];

  if (challenge.kind === "race") {
    // Slowest valid response, OR no/wrong response
    elimCandidates = [...noResp, ...wrong];
    if (elimCandidates.length === 0 && correct.length > 1) {
      // Everyone answered: eliminate slowest
      elimCandidates = [correct[correct.length - 1].uid];
    }
  } else {
    // math / starts / no_letter: wrong answer = eliminated; if all correct → slowest out
    elimCandidates = [...wrong, ...noResp];
    if (elimCandidates.length === 0 && correct.length > 1) {
      elimCandidates = [correct[correct.length - 1].uid];
    }
  }

  // Build results text
  let result = `📊 <b>نتيجة الجولة ${s.round}:</b>\n\n`;
  if (correct.length > 0) {
    result += `✅ صح: ${correct.slice(0, 8).map(({ uid }) => {
      const p = s.players.get(uid); return p ? esc(dnC(p)) : "؟";
    }).join("، ")}\n`;
  }
  if (wrong.length > 0) {
    result += `❌ خطأ: ${wrong.slice(0, 8).map(uid => {
      const p = s.players.get(uid); return p ? esc(dnC(p)) : "؟";
    }).join("، ")}\n`;
  }
  if (noResp.length > 0) {
    result += `💤 لم يردوا: ${noResp.slice(0, 8).map(uid => {
      const p = s.players.get(uid); return p ? esc(dnC(p)) : "؟";
    }).join("، ")}\n`;
  }
  if (challenge.kind === "math" && challenge.expectedNum !== undefined) {
    result += `\n💡 الجواب الصح: <b>${challenge.expectedNum}</b>`;
  }
  if (challenge.kind === "category") {
    const catLabelR: Record<string, string> = {
      animals: "🐾 حيوانات", fruits: "🍓 فواكه", colors: "🎨 ألوان",
      cities_sa: "🏙️ مدن سعودية", countries_ar: "🌍 دول عربية",
      countries_asia: "🌏 دول آسيا", jobs: "💼 مهن", food: "🍽️ أكل شعبي", rivers: "🌊 أنهار",
    };
    const cat = challenge.category ?? "";
    if (wrong.length > 0)
      result += `\n💡 المقبول فقط: <b>${catLabelR[cat] ?? cat}</b> — كلمة خارج الفئة = خطأ`;
  }

  if (elimCandidates.length === 0) {
    result += `\n\n✨ الكل أجاب صح وبسرعة — لا إقصاء هذه الجولة!`;
    await bot.telegram.sendMessage(chatId, result, { parse_mode: "HTML" }).catch(() => {});
    setTimeout(() => sendChallenge(bot, chatId), BETWEEN_ROUNDS_MS);
    return;
  }

  await bot.telegram.sendMessage(chatId, result, { parse_mode: "HTML" }).catch(() => {});

  shuffle(elimCandidates);
  // Cap elimination: never eliminate more than players-1 (keep at least 1)
  const maxElim   = Math.min(s.players.size - 1, s.doubleElim && elimCandidates.length >= 2 ? 2 : 1);
  const toElim    = elimCandidates.slice(0, maxElim);

  await eliminatePlayers(bot, chatId, toElim);
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
        caption:    `🔴 <b>${esc(dnC(p))}</b> خرج من الدائرة في الجولة ${s.round}!`,
        parse_mode: "HTML",
      });
    } catch (e) {
      logger.warn({ err: e }, "circle eliminated card failed");
      await bot.telegram.sendMessage(
        chatId,
        `🔴 <b>${esc(dnC(p))}</b> خرج من الدائرة!`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }
  }

  // Win check
  if (s.players.size === 1) {
    await endCircle(bot, chatId, [...s.players.values()][0]); return;
  }
  if (s.players.size === 0) {
    await bot.telegram.sendMessage(chatId, `🔴 الكل طلع — ما في فائز!`, { parse_mode: "HTML" }).catch(() => {});
    clearGame(chatId); return;
  }

  setTimeout(() => sendChallenge(bot, chatId), BETWEEN_ROUNDS_MS);
}

function buildScoreboard(s: CircleState): string {
  const entries = [...s.allPlayers.values()].map(p => ({
    p,
    wins: s.roundWins.get(p.id) ?? 0,
  })).sort((a, b) => b.wins - a.wins);

  const medals = ["🥇","🥈","🥉"];
  return entries.map((e, i) => {
    const m = medals[i] ?? "•";
    const bar = "⭐".repeat(e.wins) || "—";
    return `${m} ${esc(dnC(e.p))}: ${bar} (${e.wins} فوز)`;
  }).join("\n");
}

async function endCircle(bot: Telegraf, chatId: number, winner: CirclePlayer): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "circle") return;

  // Record this round's win
  s.roundWins.set(winner.id, (s.roundWins.get(winner.id) ?? 0) + 1);
  s.completedRounds++;

  // Show winner card for this round
  try {
    const buf = await generateCircleWinnerCard(dnC(winner));
    const roundLabel = s.totalRounds > 1 ? `الراوند ${s.completedRounds}` : "الدائرة القاتلة";
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption: `👑 <b>${esc(dnC(winner))}</b> هو الناجي الوحيد من ${roundLabel}!\nمبروك!`,
      parse_mode: "HTML",
    });
  } catch (e) {
    logger.warn({ err: e }, "circle winner card failed");
    await bot.telegram.sendMessage(
      chatId,
      `🏆 <b>فائز الراوند ${s.completedRounds}:</b> ${esc(dnC(winner))} 🎉`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  // ── All rounds done? ──────────────────────────────────────────────────────
  if (s.completedRounds >= s.totalRounds) {
    s.phase = "done";

    // Record leaderboard wins/games for all players
    const all = [...s.allPlayers.values()];
    for (const p of all) {
      if ((s.roundWins.get(p.id) ?? 0) > 0) recordWin(chatId, toP(p));
      else recordGame(chatId, [toP(p)]);
    }

    // Find overall champion (most round wins; tie → earlier alphabetically)
    const sorted = [...s.allPlayers.values()]
      .sort((a, b) => (s.roundWins.get(b.id) ?? 0) - (s.roundWins.get(a.id) ?? 0));
    const champion = sorted[0];

    // Build final scoreboard
    const scoreboard = buildScoreboard(s);

    if (s.totalRounds > 1) {
      await bot.telegram.sendMessage(
        chatId,
        `🏆 <b>النتيجة النهائية — ${s.totalRounds} راوندات</b>\n\n` +
        `${scoreboard}\n\n` +
        `👑 <b>البطل الأكبر: ${esc(dnC(champion))}!</b> مبروووك!`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }

    clearGame(chatId);
    return;
  }

  // ── More rounds remain — reset and start next ─────────────────────────────
  const next  = s.completedRounds + 1;
  const scoreboard = buildScoreboard(s);

  await bot.telegram.sendMessage(
    chatId,
    `📊 <b>نتيجة الراوند ${s.completedRounds} من ${s.totalRounds}</b>\n\n` +
    `${scoreboard}\n\n` +
    `<i>الراوند ${next} يبدأ خلال ثوانٍ...</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  // Reset for next round: restore all players
  s.players     = new Map(s.allPlayers);
  s.eliminated  = [];
  s.round       = 0;
  s.challenge   = null;
  s.responses   = new Map();
  s.usedChallenges = new Set();
  s.doubleElim  = false;
  s.phase       = "playing";

  setTimeout(() => {
    bot.telegram.sendMessage(
      chatId,
      `🔴 <b>الدائرة القاتلة — الراوند ${next} من ${s.totalRounds}</b>\n\n` +
      `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerList(s)}\n\n` +
      `<i>الجولة الأولى خلال ثوانٍ...</i>`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    setTimeout(() => sendChallenge(bot, chatId), BETWEEN_ROUNDS_MS);
  }, 5_000);
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
