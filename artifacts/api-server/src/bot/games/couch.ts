import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type CouchState, type CouchPlayer, type CouchQuestion,
} from "../state.js";
import {
  generateCouchStartCard,
  generateCouchSofaCard,
  generateCouchWinCard,
} from "../couchCard.js";

// ─── Question Bank ──────────────────────────────────────────────────────────

const ALL_QUESTIONS: CouchQuestion[] = [
  // ── General Knowledge ───────────────────────────────────────────────────
  { text: "ما هي عاصمة المملكة العربية السعودية؟", answers: ["الرياض", "رياض"], type: "text", timeMs: 20000 },
  { text: "ما هي عاصمة الإمارات العربية المتحدة؟", answers: ["أبوظبي", "ابوظبي", "أبو ظبي", "ابو ظبي"], type: "text", timeMs: 20000 },
  { text: "ما هي عاصمة مصر؟", answers: ["القاهرة", "قاهرة"], type: "text", timeMs: 18000 },
  { text: "ما هي عاصمة فرنسا؟", answers: ["باريس", "paris"], type: "text", timeMs: 18000 },
  { text: "ما هي عاصمة اليابان؟", answers: ["طوكيو", "توكيو", "tokyo"], type: "text", timeMs: 18000 },
  { text: "ما هي عاصمة الكويت؟", answers: ["الكويت", "مدينة الكويت"], type: "text", timeMs: 18000 },
  { text: "ما هي عاصمة البحرين؟", answers: ["المنامة", "manama"], type: "text", timeMs: 20000 },
  { text: "ما هي عاصمة قطر؟", answers: ["الدوحة", "doha"], type: "text", timeMs: 18000 },
  { text: "ما هي عاصمة سلطنة عُمان؟", answers: ["مسقط", "muscat"], type: "text", timeMs: 20000 },
  { text: "ما هي عاصمة الأردن؟", answers: ["عمان", "amman"], type: "text", timeMs: 18000 },
  { text: "أطول نهر في العالم؟", answers: ["النيل", "نهر النيل"], type: "text", timeMs: 20000 },
  { text: "أكبر كوكب في المجموعة الشمسية؟", answers: ["المشتري", "jupiter"], type: "text", timeMs: 20000 },
  { text: "أسرع حيوان بري في العالم؟", answers: ["الفهد", "cheetah"], type: "text", timeMs: 20000 },
  { text: "أطول حيوان في العالم؟", answers: ["الزرافة", "giraffe"], type: "text", timeMs: 20000 },
  { text: "أكبر محيط في العالم؟", answers: ["الهادئ", "المحيط الهادئ", "المحيط الهادي", "pacific"], type: "text", timeMs: 20000 },
  { text: "أكبر دولة في العالم من حيث المساحة؟", answers: ["روسيا", "russia"], type: "text", timeMs: 18000 },
  { text: "من اخترع الهاتف؟", answers: ["غراهام بيل", "بيل", "graham bell", "alexander graham bell"], type: "text", timeMs: 20000 },
  { text: "أول رجل وصل إلى سطح القمر؟", answers: ["نيل أرمسترونج", "أرمسترونج", "ارمسترونج", "armstrong", "neil armstrong"], type: "text", timeMs: 20000 },
  { text: "كم عدد ألوان قوس قزح؟", answers: ["7", "سبعة"], type: "text", timeMs: 14000 },
  { text: "كم عدد أيام الأسبوع؟", answers: ["7", "سبعة"], type: "text", timeMs: 12000 },
  { text: "كم عدد أشهر السنة؟", answers: ["12", "اثنا عشر", "اثني عشر"], type: "text", timeMs: 12000 },
  { text: "في أي دولة يقع برج إيفل؟", answers: ["فرنسا", "france"], type: "text", timeMs: 15000 },
  { text: "ما هو أكبر حيوان في العالم؟", answers: ["الحوت الأزرق", "حوت أزرق", "الحوت", "blue whale"], type: "text", timeMs: 20000 },
  { text: "من اخترع المصباح الكهربائي؟", answers: ["إديسون", "ادیسون", "thomas edison", "edison"], type: "text", timeMs: 20000 },
  { text: "ما هي عاصمة ألمانيا؟", answers: ["برلين", "berlin"], type: "text", timeMs: 18000 },
  { text: "كم يوماً يأخذ القمر ليكتمل؟", answers: ["28", "29", "30"], type: "text", timeMs: 22000 },
  { text: "ما هو أصغر كوكب في المجموعة الشمسية؟", answers: ["عطارد", "mercury"], type: "text", timeMs: 22000 },
  { text: "ما هي الدولة الأكثر سكاناً في العالم؟", answers: ["الهند", "india"], type: "text", timeMs: 22000 },
  { text: "في أي دولة يقع نهر الأمازون؟", answers: ["البرازيل", "brazil"], type: "text", timeMs: 22000 },
  { text: "ما عدد أضلاع المثلث؟", answers: ["3", "ثلاثة"], type: "text", timeMs: 12000 },
  { text: "ما عدد أضلاع المسدس؟", answers: ["6", "ستة"], type: "text", timeMs: 14000 },
  { text: "كم ثانية في الدقيقة الواحدة؟", answers: ["60", "ستون"], type: "text", timeMs: 12000 },
  { text: "كم دقيقة في الساعة؟", answers: ["60", "ستون"], type: "text", timeMs: 12000 },
  { text: "ما هو أكبر بلد في القارة الأفريقية مساحةً؟", answers: ["الجزائر", "algeria"], type: "text", timeMs: 22000 },
  { text: "في أي قارة تقع مصر؟", answers: ["أفريقيا", "africa"], type: "text", timeMs: 16000 },
  // ── Math ─────────────────────────────────────────────────────────────────
  { text: "🔢 كم ناتج: 7 × 7؟", answers: ["49"], type: "text", timeMs: 14000 },
  { text: "🔢 كم ناتج: 5 × 9؟", answers: ["45"], type: "text", timeMs: 14000 },
  { text: "🔢 كم ناتج: 100 ÷ 4؟", answers: ["25"], type: "text", timeMs: 14000 },
  { text: "🔢 كم ناتج: 8 × 8؟", answers: ["64"], type: "text", timeMs: 14000 },
  { text: "🔢 كم ناتج: 6 × 7؟", answers: ["42"], type: "text", timeMs: 14000 },
  { text: "🔢 كم ناتج: 50 + 77؟", answers: ["127"], type: "text", timeMs: 15000 },
  { text: "🔢 كم ناتج: 200 - 87؟", answers: ["113"], type: "text", timeMs: 16000 },
  { text: "🔢 الجذر التربيعي لـ 144؟", answers: ["12"], type: "text", timeMs: 18000 },
  { text: "🔢 كم ناتج: 3 × 3 × 3؟", answers: ["27"], type: "text", timeMs: 16000 },
  { text: "🔢 كم ناتج: 15 × 4؟", answers: ["60"], type: "text", timeMs: 14000 },
  { text: "🔢 كم ناتج: 9 × 9؟", answers: ["81"], type: "text", timeMs: 14000 },
  { text: "🔢 كم ناتج: 13 × 5؟", answers: ["65"], type: "text", timeMs: 15000 },
  { text: "🔢 كم ناتج: 144 ÷ 12؟", answers: ["12"], type: "text", timeMs: 18000 },
  { text: "🔢 كم ناتج: 17 + 28؟", answers: ["45"], type: "text", timeMs: 15000 },
  // ── Sports ───────────────────────────────────────────────────────────────
  { text: "⚽ كم لاعباً في الفريق الواحد بكرة القدم؟", answers: ["11", "أحد عشر"], type: "text", timeMs: 14000 },
  { text: "⚽ كأس العالم يُقام كل كم سنة؟", answers: ["4", "أربع", "أربعة"], type: "text", timeMs: 14000 },
  { text: "⚽ في أي دولة أُقيم كأس العالم 2022؟", answers: ["قطر", "qatar"], type: "text", timeMs: 18000 },
  { text: "🏆 كم مرة فازت البرازيل بكأس العالم؟", answers: ["5", "خمس", "خمسة"], type: "text", timeMs: 20000 },
  { text: "⚽ ما هو نادي ليونيل ميسي الحالي؟", answers: ["إنتر ميامي", "inter miami", "انتر ميامي", "ميامي"], type: "text", timeMs: 20000 },
  { text: "🏀 كم نقطة تساوي رمية الثلاثة في كرة السلة؟", answers: ["3", "ثلاثة"], type: "text", timeMs: 14000 },
  { text: "⚽ ما اسم البطولة الأوروبية لكرة القدم؟", answers: ["يورو", "يويفا يورو", "euro", "uefa euro"], type: "text", timeMs: 18000 },
  // ── Entertainment ────────────────────────────────────────────────────────
  { text: "🎬 اسم بطل فيلم هاري بوتر؟", answers: ["هاري بوتر", "هاري", "harry", "harry potter"], type: "text", timeMs: 18000 },
  { text: "📱 شركة iPhone من تصنع؟", answers: ["أبل", "apple"], type: "text", timeMs: 14000 },
  { text: "🎵 جنسية المغني جاستن بيبر؟", answers: ["كندية", "كندا", "canadian", "canada"], type: "text", timeMs: 20000 },
  { text: "🎬 شركة ديزني أسسها من؟", answers: ["والت ديزني", "والت", "walt disney", "walt"], type: "text", timeMs: 20000 },
  { text: "🎮 ما اسم الشخصية الرئيسية في لعبة Super Mario؟", answers: ["ماريو", "mario"], type: "text", timeMs: 18000 },
  { text: "📺 ما هي الشركة المصنعة لـ PlayStation؟", answers: ["سوني", "sony"], type: "text", timeMs: 16000 },
  { text: "🎬 ما اسم الفيلم الذي يتكلم عن دمى تلعب؟", answers: ["توي ستوري", "toy story"], type: "text", timeMs: 20000 },
  { text: "🎵 اسم الفرقة الأشهر في التاريخ من بريطانيا؟", answers: ["بيتلز", "البيتلز", "beatles", "the beatles"], type: "text", timeMs: 22000 },
  { text: "📱 ما هي شركة صاحبة تطبيق تيك توك؟", answers: ["بايت دانس", "bytedance", "بايتدانس"], type: "text", timeMs: 22000 },
  // ── Speed Challenges ─────────────────────────────────────────────────────
  { text: "⚡ أسرع واحد يكتب: كنبة", answers: ["كنبة"], type: "speed", timeMs: 16000 },
  { text: "⚡ أسرع واحد يكتب: برودة", answers: ["برودة"], type: "speed", timeMs: 16000 },
  { text: "⚡ أسرع واحد يكتب: طماطم", answers: ["طماطم"], type: "speed", timeMs: 16000 },
  { text: "⚡ أسرع واحد يكتب: مقلاة", answers: ["مقلاة"], type: "speed", timeMs: 16000 },
  { text: "⚡ أسرع واحد يكتب: برتقال", answers: ["برتقال"], type: "speed", timeMs: 16000 },
  { text: "⚡ أسرع واحد يكتب: شنطة", answers: ["شنطة"], type: "speed", timeMs: 16000 },
  { text: "⚡ أسرع واحد يكتب: موزة", answers: ["موزة", "موز"], type: "speed", timeMs: 16000 },
  { text: "⚡ أسرع واحد يكتب: زلابية", answers: ["زلابية"], type: "speed", timeMs: 18000 },
  { text: "⚡ أسرع واحد يكتب: بطيخ", answers: ["بطيخ"], type: "speed", timeMs: 14000 },
  { text: "⚡ أسرع واحد يكتب: مغامرة", answers: ["مغامرة"], type: "speed", timeMs: 18000 },
  { text: "⚡ أسرع واحد يكتب: قهوة", answers: ["قهوة"], type: "speed", timeMs: 14000 },
  { text: "⚡ أسرع واحد يكتب: طائرة", answers: ["طائرة", "طيارة"], type: "speed", timeMs: 16000 },
  { text: "⚡ أسرع واحد يكتب: فراشة", answers: ["فراشة"], type: "speed", timeMs: 16000 },
  { text: "⚡ أسرع واحد يكتب: مكيف", answers: ["مكيف"], type: "speed", timeMs: 14000 },
  { text: "⚡ أسرع واحد يكتب: شاشة", answers: ["شاشة"], type: "speed", timeMs: 14000 },
  { text: "⚡ أسرع واحد يكتب: تلفزيون", answers: ["تلفزيون", "تلفاز"], type: "speed", timeMs: 18000 },
  { text: "⚡ أسرع واحد يكتب: مصلحة", answers: ["مصلحة"], type: "speed", timeMs: 20000 },
  // ── Emoji Challenges ─────────────────────────────────────────────────────
  { text: "🎭 أرسل إيموجي النار الآن!", answers: ["🔥"], type: "emoji", timeMs: 13000 },
  { text: "🎭 أرسل إيموجي الكنبة الآن!", answers: ["🛋️", "🛋"], type: "emoji", timeMs: 13000 },
  { text: "🎭 أرسل إيموجي الضحكة الآن!", answers: ["😂", "🤣", "😹"], type: "emoji", timeMs: 13000 },
  { text: "🎭 أرسل إيموجي الكرة الآن!", answers: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉"], type: "emoji", timeMs: 13000 },
  { text: "🎭 أرسل إيموجي القلب الآن!", answers: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💗", "💕", "💓", "💞", "💝", "♥️", "🩷", "🩵", "🩶"], type: "emoji", timeMs: 13000 },
  { text: "🎭 أرسل إيموجي النجمة الآن!", answers: ["⭐", "🌟", "✨", "💫", "🌠"], type: "emoji", timeMs: 13000 },
  { text: "🎭 أرسل إيموجي الهاتف الآن!", answers: ["📱", "☎️", "📞", "📲"], type: "emoji", timeMs: 13000 },
  { text: "🎭 أرسل إيموجي السيارة الآن!", answers: ["🚗", "🚕", "🚙", "🏎️", "🚓", "🚑", "🚒"], type: "emoji", timeMs: 13000 },
  { text: "🎭 أرسل إيموجي الطيارة الآن!", answers: ["✈️", "🛩️", "✈"], type: "emoji", timeMs: 13000 },
  { text: "🎭 أرسل إيموجي الفاكهة الآن!", answers: ["🍎", "🍏", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍑", "🍒", "🥭", "🍍", "🥥", "🥝", "🍅"], type: "emoji", timeMs: 13000 },
  { text: "🎭 أرسل إيموجي الحيوان الآن!", answers: ["🐶", "🐱", "🐭", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🦓", "🦒", "🐘", "🦋", "🐢"], type: "emoji", timeMs: 13000 },
  { text: "🎭 أرسل إيموجي الطعام الآن!", answers: ["🍕", "🍔", "🌮", "🌯", "🍜", "🍣", "🍱", "🍛", "🍝", "🥗", "🍗", "🍖", "🥩", "🍞", "🧀", "🥚", "🍳", "🥞", "🧇", "🌭", "🍟"], type: "emoji", timeMs: 13000 },
  { text: "🎭 أرسل إيموجي الموسيقى الآن!", answers: ["🎵", "🎶", "🎸", "🎹", "🎺", "🎻", "🥁", "🎤", "🎧"], type: "emoji", timeMs: 13000 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dnC(p: CouchPlayer): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return full || (p.username ? `@${p.username}` : String(p.id));
}
function toP(p: CouchPlayer) {
  return { id: p.id, username: p.username, name: dnC(p) };
}
function normText(s: string): string {
  return s.trim().toLowerCase().replace(/[\u064B-\u065F]/g, ""); // strip Arabic diacritics
}
function checkAnswer(text: string, q: CouchQuestion): boolean {
  if (!q.answers.length) return false;
  const n = normText(text);
  return q.answers.some(a => normText(a) === n);
}

function findTeamIdx(s: CouchState, uid: number): 0 | 1 | null {
  if (s.teams[0].has(uid)) return 0;
  if (s.teams[1].has(uid)) return 1;
  return null;
}

function getPlayer(s: CouchState, uid: number): CouchPlayer | undefined {
  return s.teams[0].get(uid) ?? s.teams[1].get(uid);
}

function teamDisplay(idx: 0 | 1) {
  return idx === 0 ? "🔵 الفريق الأزرق" : "🔴 الفريق الأحمر";
}

function teamPlayers(s: CouchState, idx: 0 | 1): string {
  const arr = [...s.teams[idx].values()];
  return arr.length ? arr.map(p => `• ${esc(dnC(p))}`).join("\n") : "<i>لا أحد</i>";
}

function lobbyText(s: CouchState): string {
  return (
    `🛋️ <b>تحدي الكنبة</b>\n\n` +
    `🔵 <b>الفريق الأزرق (${s.teams[0].size}):</b>\n${teamPlayers(s, 0)}\n\n` +
    `🔴 <b>الفريق الأحمر (${s.teams[1].size}):</b>\n${teamPlayers(s, 1)}\n\n` +
    `<i>اختار فريقك  •  لازم فريقين فيهم 2+ لاعبين</i>`
  );
}

function pickQuestion(s: CouchState): CouchQuestion {
  if (!s.questionPool.length) {
    // reshuffle excluding last question
    s.questionPool = shuffle([...ALL_QUESTIONS]);
  }
  return s.questionPool.shift()!;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function startCouch(
  bot: Telegraf, chatId: number,
  hostId: number, hostUsername: string | undefined,
  hostFirst: string, hostLast: string,
): Promise<void> {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId, "⚠️ في لعبة شغالة! أوقفوها أولاً بـ /stop", { parse_mode: "HTML" }).catch(() => {});
    return;
  }

  // Ask for target score
  const sent = await bot.telegram.sendMessage(chatId,
    `🛋️ <b>تحدي الكنبة</b>\n\nاختار عدد الجولات للفوز:`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("🥉 3 جولات", `couch:rounds:${chatId}:3`),
          Markup.button.callback("🥇 5 جولات", `couch:rounds:${chatId}:5`),
          Markup.button.callback("🏆 7 جولات", `couch:rounds:${chatId}:7`),
        ],
      ]),
    }
  ).catch(() => null);

  if (!sent) return;

  // Temporarily store host info for when rounds are picked
  const s: CouchState = {
    type: "couch",
    phase: "setup",
    chatId,
    hostId,
    teams: [new Map(), new Map()],
    sofaPlayerId: null,
    sofaTeamIdx: null,
    currentQ: null,
    roundSeq: 0,
    scores: [0, 0],
    targetScore: 3,
    choosingPlayerId: null,
    choosingTeamIdx: null,
    questionPool: [],
    questionNum: 0,
    setupMsgId: sent.message_id,
    joinMsgId: undefined,
    timerHandle: undefined,
    choosingMsgId: undefined,
    mvpKills: new Map(),
  };
  s.teams[0].set(hostId, { id: hostId, username: hostUsername, firstName: hostFirst, lastName: hostLast });
  gameStates.set(chatId, s);
}

export async function handleCouchSetRounds(
  bot: Telegraf, ctx: Context, chatId: number, rounds: number,
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "setup") {
    await ctx.answerCbQuery("❌").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط من بدأ اللعبة!").catch(() => {}); return;
  }
  await ctx.answerCbQuery(`✅ ${rounds} جولات`).catch(() => {});

  s.targetScore = rounds;
  s.phase = "joining";

  // Remove setup message
  if (s.setupMsgId) {
    bot.telegram.deleteMessage(chatId, s.setupMsgId).catch(() => {});
  }

  // Send lobby
  const msg = await bot.telegram.sendMessage(chatId,
    lobbyText(s),
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("🔵 الفريق الأزرق", `couch:join:${chatId}:0`),
          Markup.button.callback("🔴 الفريق الأحمر",  `couch:join:${chatId}:1`),
        ],
        [Markup.button.callback("▶️  ابدأ اللعبة",   `couch:start:${chatId}`)],
      ]),
    }
  ).catch(() => null);

  if (msg) s.joinMsgId = msg.message_id;
}

export async function handleCouchJoin(
  bot: Telegraf, ctx: Context, chatId: number, teamIdx: 0 | 1,
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ التسجيل مو متاح").catch(() => {}); return;
  }

  const player: CouchPlayer = {
    id: from.id, username: from.username,
    firstName: from.first_name ?? "", lastName: from.last_name ?? "",
  };

  // Remove from other team if switching
  const other = (1 - teamIdx) as 0 | 1;
  s.teams[other].delete(from.id);
  s.teams[teamIdx].set(from.id, player);

  const teamName = teamIdx === 0 ? "الفريق الأزرق 🔵" : "الفريق الأحمر 🔴";
  await ctx.answerCbQuery(`✅ انضممت لـ ${teamName}!`).catch(() => {});

  // Update lobby
  if (s.joinMsgId) {
    bot.telegram.editMessageText(chatId, s.joinMsgId, undefined,
      lobbyText(s),
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("🔵 الفريق الأزرق", `couch:join:${chatId}:0`),
            Markup.button.callback("🔴 الفريق الأحمر",  `couch:join:${chatId}:1`),
          ],
          [Markup.button.callback("▶️  ابدأ اللعبة",   `couch:start:${chatId}`)],
        ]),
      }
    ).catch(() => {});
  }
}

export async function handleCouchStart(
  bot: Telegraf, ctx: Context, chatId: number,
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط المنشئ يبدأ اللعبة!").catch(() => {}); return;
  }
  if (s.teams[0].size < 2 || s.teams[1].size < 2) {
    await ctx.answerCbQuery(`⚠️ كل فريق يحتاج لاعبين أو أكثر!\n🔵 ${s.teams[0].size}  🔴 ${s.teams[1].size}`).catch(() => {}); return;
  }
  await ctx.answerCbQuery("🛋️ ابدأت اللعبة!").catch(() => {});
  launchCouch(bot, chatId);
}

// ── Called from index.ts message handler ─────────────────────────────────────

export function handleCouchText(
  bot: Telegraf, chatId: number, uid: number, text: string,
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch") return;
  if (s.phase !== "playing" && s.phase !== "sofa_active") return;

  const teamIdx = findTeamIdx(s, uid);
  if (teamIdx === null) return; // not in the game

  const player = getPlayer(s, uid)!;

  // Sofa player cannot answer
  if (s.sofaPlayerId === uid) return;

  if (!checkAnswer(text, s.currentQ!)) return; // wrong answer

  // ── Correct answer! ────────────────────────────────────────────────────
  if (s.phase === "playing") {
    // First correct → player goes to sofa
    onFirstCorrect(bot, chatId, uid, teamIdx, player);
  } else if (s.phase === "sofa_active") {
    if (teamIdx === s.sofaTeamIdx) {
      // Sofa team answered → point!
      onSofaTeamScores(bot, chatId, uid, player);
    } else {
      // Opponent answered → choosing
      onOpponentAnswers(bot, chatId, uid, player, teamIdx);
    }
  }
}

export async function handleCouchChoose(
  bot: Telegraf, ctx: Context, chatId: number, action: "kick" | "take",
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "choosing") {
    await ctx.answerCbQuery("❌ انتهى الوقت للاختيار").catch(() => {}); return;
  }
  // Allow any member of the choosing team
  const presserTeam = findTeamIdx(s, from.id);
  if (presserTeam !== s.choosingTeamIdx) {
    await ctx.answerCbQuery("⛔ مو فريقك تختار!").catch(() => {}); return;
  }

  await ctx.answerCbQuery(action === "kick" ? "💥 تم الطرد!" : "🛋️ جلست على الكنبة!").catch(() => {});

  // Cancel choosing timer
  if (s.timerHandle) { clearTimeout(s.timerHandle); s.timerHandle = undefined; }
  s.roundSeq++;

  // Remove choosing buttons
  if (s.choosingMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.choosingMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
    s.choosingMsgId = undefined;
  }

  if (action === "kick") {
    // Sofa cleared → back to playing phase with new question
    const sofaPlayer = getPlayer(s, s.sofaPlayerId!)!;
    await bot.telegram.sendMessage(chatId,
      `💥 <b>${esc(dnC(sofaPlayer))}</b> طُرد من الكنبة! الكنبة فاضية الآن.\n\n<i>سؤال جديد قادم...</i>`,
      { parse_mode: "HTML" }
    ).catch(() => {});

    s.sofaPlayerId = null;
    s.sofaTeamIdx  = null;
    s.choosingPlayerId  = null;
    s.choosingTeamIdx   = null;
    s.phase = "playing";
    setTimeout(() => askQuestion(bot, chatId), 1_200);

  } else {
    // Choosing player takes the sofa → go to sofa_active with new sofa holder
    const chooser  = getPlayer(s, s.choosingPlayerId!)!;
    const prevSofa = s.sofaPlayerId !== null ? getPlayer(s, s.sofaPlayerId) : null;
    const prevName = prevSofa ? dnC(prevSofa) : "";

    await bot.telegram.sendMessage(chatId,
      `🛋️ <b>${esc(dnC(chooser))}</b> جلس على الكنبة${prevName ? ` بدل ${esc(prevName)}` : ""}!\n\n<i>فريقه يحتاج يجاوب السؤال القادم...</i>`,
      { parse_mode: "HTML" }
    ).catch(() => {});

    s.sofaPlayerId = chooser.id;
    s.sofaTeamIdx  = s.choosingTeamIdx!;
    s.choosingPlayerId  = null;
    s.choosingTeamIdx   = null;
    s.phase = "sofa_active";
    setTimeout(() => askSofaQuestion(bot, chatId), 1_200);
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function launchCouch(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch") return;

  // Remove lobby buttons
  if (s.joinMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.joinMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
  }

  s.phase         = "playing";
  s.questionPool  = shuffle([...ALL_QUESTIONS]);

  // Game start card
  const teamANames = [...s.teams[0].values()].map(p => dnC(p));
  const teamBNames = [...s.teams[1].values()].map(p => dnC(p));

  let buf: Buffer | null = null;
  try { buf = await generateCouchStartCard(teamANames, teamBNames, s.targetScore); } catch { /* fallback */ }

  const startCaption =
    `🛋️ <b>تحدي الكنبة — انطلقنا!</b>\n\n` +
    `🔵 <b>الأزرق:</b> ${teamANames.map(esc).join("، ")}\n` +
    `🔴 <b>الأحمر:</b> ${teamBNames.map(esc).join("، ")}\n\n` +
    `🏆 أول فريق يصل لـ <b>${s.targetScore}</b> جولات يفوز!`;

  if (buf) {
    await bot.telegram.sendPhoto(chatId, { source: buf }, { caption: startCaption, parse_mode: "HTML" }).catch(() => {
      bot.telegram.sendMessage(chatId, startCaption, { parse_mode: "HTML" }).catch(() => {});
    });
  } else {
    await bot.telegram.sendMessage(chatId, startCaption, { parse_mode: "HTML" }).catch(() => {});
  }

  await bot.telegram.sendMessage(chatId,
    `📜 <b>قواعد سريعة:</b>\n` +
    `• أجاوب الصح أول → تجلس على الكنبة 🛋️\n` +
    `• اللي على الكنبة ما يقدر يجاوب\n` +
    `• زميلك يجاوب الصح → فريقك يسجّل نقطة 🎉\n` +
    `• الخصم يجاوب → يختارون: يطردونك أو يجلسون مكانك\n` +
    `• مؤقت لكل سؤال ⏱️`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => askQuestion(bot, chatId), 2_500);
}

function startTimer(
  bot: Telegraf, chatId: number, ms: number,
  onExpire: () => void | Promise<void>,
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch") return;
  if (s.timerHandle) clearTimeout(s.timerHandle);
  s.roundSeq++;
  const mySeq = s.roundSeq;
  s.timerHandle = setTimeout(async () => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "couch" || ss.roundSeq !== mySeq) return;
    await onExpire();
  }, ms);
}

async function askQuestion(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "playing") return;

  const q = pickQuestion(s);
  s.currentQ = q;
  s.questionNum++;

  const secs = Math.round(q.timeMs / 1000);
  const typeTag = q.type === "speed" ? "⚡ <b>تحدي السرعة</b>" :
                  q.type === "emoji" ? "🎭 <b>تحدي الإيموجي</b>" : "❓ <b>سؤال</b>";

  const msg = await bot.telegram.sendMessage(chatId,
    `${typeTag}  |  🔵 ${s.scores[0]}  —  ${s.scores[1]} 🔴\n\n` +
    `<b>${esc(q.text)}</b>\n\n` +
    `⏱️ لديكم ${secs} ثانية!`,
    { parse_mode: "HTML" }
  ).catch(() => null);
  if (msg) s.qMsgId = msg.message_id;

  startTimer(bot, chatId, q.timeMs, async () => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "couch" || ss.phase !== "playing") return;
    // Time up — new question
    const correct = ss.currentQ!.answers[0] ? `\n\n💡 الإجابة: <b>${esc(ss.currentQ!.answers[0])}</b>` : "";
    await bot.telegram.sendMessage(chatId,
      `⏰ انتهى الوقت! ما أجاب أحد.${correct}`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    setTimeout(() => askQuestion(bot, chatId), 1_800);
  });
}

async function askSofaQuestion(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "sofa_active") return;

  const q = pickQuestion(s);
  s.currentQ = q;
  s.questionNum++;

  const sofaPlayer = getPlayer(s, s.sofaPlayerId!)!;

  // Send sofa card
  let buf: Buffer | null = null;
  try {
    buf = await generateCouchSofaCard(
      dnC(sofaPlayer), s.sofaTeamIdx!,
      s.scores[0], s.scores[1], s.targetScore,
      q.text, q.type, s.questionNum,
    );
  } catch { /* fallback */ }

  const secs      = Math.round((q.timeMs + 5000) / 1000);
  const typeTag   = q.type === "speed" ? "⚡ تحدي السرعة" :
                    q.type === "emoji" ? "🎭 تحدي الإيموجي" : "❓ سؤال";
  const caption   =
    `🛋️ <b>${esc(dnC(sofaPlayer))}</b> على الكنبة!\n\n` +
    `${typeTag}: <b>${esc(q.text)}</b>\n\n` +
    `🔵 ${s.scores[0]}  —  ${s.scores[1]} 🔴  |  ⏱️ ${secs} ثانية`;

  if (buf) {
    await bot.telegram.sendPhoto(chatId, { source: buf }, { caption, parse_mode: "HTML" }).catch(async () => {
      await bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
    });
  } else {
    await bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
  }

  startTimer(bot, chatId, q.timeMs + 5000, async () => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "couch" || ss.phase !== "sofa_active") return;
    const correct = ss.currentQ!.answers[0] ? `\n\n💡 الإجابة: <b>${esc(ss.currentQ!.answers[0])}</b>` : "";
    await bot.telegram.sendMessage(chatId,
      `⏰ انتهى الوقت! الكنبة تفضى والجولة تُعاد.${correct}`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    ss.sofaPlayerId = null;
    ss.sofaTeamIdx  = null;
    ss.phase = "playing";
    setTimeout(() => askQuestion(bot, chatId), 1_800);
  });
}

function onFirstCorrect(
  bot: Telegraf, chatId: number,
  uid: number, teamIdx: 0 | 1, player: CouchPlayer,
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "playing") return;

  // Cancel current question timer
  if (s.timerHandle) { clearTimeout(s.timerHandle); s.timerHandle = undefined; }
  s.roundSeq++;

  s.sofaPlayerId = uid;
  s.sofaTeamIdx  = teamIdx;
  s.phase        = "sofa_active";

  bot.telegram.sendMessage(chatId,
    `🛋️ <b>${esc(dnC(player))}</b> (${teamDisplay(teamIdx)}) جلس على الكنبة!\n` +
    `<i>فريقه يحتاج يجاوب السؤال القادم...</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => askSofaQuestion(bot, chatId), 1_000);
}

function onSofaTeamScores(
  bot: Telegraf, chatId: number,
  uid: number, player: CouchPlayer,
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "sofa_active") return;

  // Cancel timer
  if (s.timerHandle) { clearTimeout(s.timerHandle); s.timerHandle = undefined; }
  s.roundSeq++;

  const sofaPlayer   = getPlayer(s, s.sofaPlayerId!)!;
  const scoringTeam  = s.sofaTeamIdx!;
  s.scores[scoringTeam]++;

  // Track MVP (sofa + scorer combo)
  const mvpId = s.sofaPlayerId!;
  s.mvpKills.set(mvpId, (s.mvpKills.get(mvpId) ?? 0) + 1);

  bot.telegram.sendMessage(chatId,
    `🎉 <b>${esc(dnC(sofaPlayer))}</b> على الكنبة + <b>${esc(dnC(player))}</b> أجاب!\n` +
    `🏆 <b>${teamDisplay(scoringTeam)}</b> يسجّل!\n\n` +
    `🔵 ${s.scores[0]}  —  ${s.scores[1]} 🔴`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  // Reset sofa
  s.sofaPlayerId = null;
  s.sofaTeamIdx  = null;

  // Check win
  if (s.scores[scoringTeam] >= s.targetScore) {
    endCouch(bot, chatId, scoringTeam);
    return;
  }

  s.phase = "playing";
  setTimeout(() => askQuestion(bot, chatId), 2_000);
}

function onOpponentAnswers(
  bot: Telegraf, chatId: number,
  uid: number, player: CouchPlayer, teamIdx: 0 | 1,
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "sofa_active") return;

  // Cancel timer
  if (s.timerHandle) { clearTimeout(s.timerHandle); s.timerHandle = undefined; }
  s.roundSeq++;

  s.phase             = "choosing";
  s.choosingPlayerId  = uid;
  s.choosingTeamIdx   = teamIdx;

  const sofaPlayer = getPlayer(s, s.sofaPlayerId!)!;

  bot.telegram.sendMessage(chatId,
    `⚡ <b>${esc(dnC(player))}</b> (${teamDisplay(teamIdx)}) أجاب صح!\n\n` +
    `اختار خلال <b>15 ثانية</b>:`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback(`💥 اطردوا ${dnC(sofaPlayer)} من الكنبة`, `couch:choose:${chatId}:kick`)],
        [Markup.button.callback(`🛋️ اجلس ${dnC(player)} على الكنبة`, `couch:choose:${chatId}:take`)],
      ]),
    }
  ).then(msg => {
    s.choosingMsgId = msg?.message_id;
  }).catch(() => {});

  // 15s choosing timer — default = kick
  startTimer(bot, chatId, 15_000, async () => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "couch" || ss.phase !== "choosing") return;
    if (ss.choosingMsgId) {
      bot.telegram.editMessageReplyMarkup(chatId, ss.choosingMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
    }
    const sofaP = ss.sofaPlayerId !== null ? getPlayer(ss, ss.sofaPlayerId) : null;
    await bot.telegram.sendMessage(chatId,
      `⏰ انتهى وقت الاختيار — تم طرد <b>${sofaP ? esc(dnC(sofaP)) : "اللاعب"}</b> من الكنبة تلقائياً!`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    ss.sofaPlayerId     = null;
    ss.sofaTeamIdx      = null;
    ss.choosingPlayerId = null;
    ss.choosingTeamIdx  = null;
    ss.phase = "playing";
    setTimeout(() => askQuestion(bot, chatId), 1_500);
  });
}

async function endCouch(bot: Telegraf, chatId: number, winnerIdx: 0 | 1): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch") return;
  s.phase = "done";

  const winnerTeam  = [...s.teams[winnerIdx].values()];
  const loserTeam   = [...s.teams[(1 - winnerIdx) as 0 | 1].values()];

  // MVP = player with most sofa+score combos
  let mvpPlayer: CouchPlayer | undefined;
  let mvpMax = 0;
  for (const [uid, count] of s.mvpKills) {
    if (count > mvpMax) {
      mvpMax   = count;
      mvpPlayer = getPlayer(s, uid);
    }
  }

  // Record scores
  for (const p of winnerTeam) recordWin(chatId, toP(p));
  for (const p of loserTeam)  recordGame(chatId, [toP(p)]);

  // Winner card
  let buf: Buffer | null = null;
  try {
    buf = await generateCouchWinCard(winnerIdx, s.scores[0], s.scores[1], mvpPlayer ? dnC(mvpPlayer) : "");
  } catch { /* fallback */ }

  const caption =
    `🏆 <b>${teamDisplay(winnerIdx)}</b> فاز بتحدي الكنبة!\n\n` +
    `🔵 ${s.scores[0]}  —  ${s.scores[1]} 🔴\n` +
    (mvpPlayer ? `⭐ <b>${esc(dnC(mvpPlayer))}</b> — أكثر تأثيراً!\n` : "") +
    `\n<i>جولة أخرى؟  /couch</i>`;

  if (buf) {
    await bot.telegram.sendPhoto(chatId, { source: buf }, { caption, parse_mode: "HTML" }).catch(() => {
      bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
    });
  } else {
    await bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
  }

  clearGame(chatId);
}
