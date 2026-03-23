import { Telegraf, Markup, Context } from "telegraf";
import { gameStates, clearGame, privateUserToGame, recordWin, recordGame, dn, esc, type OutsiderState, type OutsiderPlayer } from "../state.js";
import { logger } from "../../lib/logger.js";

// ─── Timing ────────────────────────────────────────────────────────────────────
const JOIN_MS        = 60_000;
const JOIN_WARN_MS   = 40_000;
const HINT_MS        = 120_000;
const HINT_WARN_MS   =  80_000;
const VOTE_MS        =  60_000;
const VOTE_WARN_MS   =  30_000;
const GUESS_MS       =  40_000;
const MIN_PLAYERS    = 3;

// ─── Topics ────────────────────────────────────────────────────────────────────
const TOPICS: Record<string, string[]> = {
  "🐾 حيوانات": [
    "قطة","كلب","أسد","نمر","فيل","زرافة","دلفين","قرش","ببغاء","تمساح",
    "حصان","ذئب","قرد","ثعلب","أرنب","بطريق","طاووس","عقرب","نسر","فهد",
    "خروف","بقرة","ديك","حمامة","صقر","سلحفاة","ثعبان","غزال","حمار","جمل",
    "دب","كنغر","عصفور","سمكة","قنفذ","خفاش","ضفدع","وحيد القرن","ضب","وزغ",
    "حمار وحشي","أخطبوط","جراد البحر","طاووس","بجع","لقلق","بومة","خروف","تيس","عنز",
  ],
  "🍕 أكلات": [
    "بيتزا","برغر","شاورما","كبسة","مندي","فلافل","حمص","كنافة","بقلاوة","مكرونة",
    "سوشي","تاكو","نودلز","دونر","هريسة","جريش","مرقوق","مطبق","سمبوسة","لقيمات",
    "محلبية","أوزي","فريدة","ملوخية","كبد","مشاوي","دجاج","سلمون","تمر","خبز",
    "شكولاته","آيس كريم","وافل","بان كيك","دونات","كرواسون","تشيز كيك","تيراميسو","مافن","بروتشيتا",
    "لحم بعجين","قيمر","كليجا","حلوى عربية","رز بحليب","أم علي","بسبوسة","حلوى تمر","جلاش","مهلبية",
  ],
  "🏙️ أماكن": [
    "برج إيفل","الكعبة","بيج بن","برج خليفة","تمثال الحرية","الأهرامات","سور الصين العظيم","برج بيزا","كولوسيوم روما","أنغكور وات",
    "مطار","مستشفى","ملعب كرة","سينما","مكتبة","حديقة حيوان","شاطئ","جبل","صحراء","غابة",
    "مطعم","فندق","ملاهي","متحف","حديقة","محطة قطار","ميناء","سوق","جامعة","مدرسة",
    "الرياض","دبي","باريس","لندن","طوكيو","نيويورك","مكة","المدينة المنورة","إسطنبول","روما",
  ],
  "⚽ رياضة": [
    "كرة القدم","كرة السلة","سباحة","تنس","جولف","ملاكمة","عدو","رفع أثقال","فروسية","بولينغ",
    "تايكوندو","جودو","شطرنج","كرة طائرة","كريكيت","سنوكر","رماية","غوص","تسلق","دراجات",
    "سباق سيارات","تنس طاولة","بيسبول","رغبي","هوكي","جمباز","تزلج","رمح","قرص","مصارعة",
  ],
  "📱 تقنية": [
    "آيفون","لابتوب","يوتيوب","تيك توك","انستقرام","تويتر","بلستيشن","إكس بوكس","درون","سيارة كهربائية",
    "ساعة ذكية","ذكاء اصطناعي","روبوت","واي فاي","بلوتوث","هاتف قديم","طابعة","كاميرا","تلفزيون","راديو",
    "ماكبوك","سامسونج","تيسلا","ميتا","نتفليكس","سبوتيفاي","زووم","شات جي بي تي","أمازون","قوقل",
  ],
  "🎬 ترفيه": [
    "باب الحارة","نمر بن عدوان","ذيب","بياض الثلج","الأسد الملك","شيرلوك هولمز","المندلوريان","الصديقون","بريكينغ باد","غيم أوف ثرونز",
    "هاري بوتر","أفاتار","تيتانيك","الجوكر","الأخضر","ترانسفورمرز","سبايدر مان","باتمان","سوبرمان","ثانوس",
    "يوتيوبر","مذيع","ممثل","مغني","كوميدي","مسلسل","فيلم رعب","مسرحية","أنيمي","كارتون",
  ],
  "🌍 أشياء عامة": [
    "سيارة","دراجة","طائرة","سفينة","قطار","حافلة","دراجة نارية","مروحية","غواصة","صاروخ",
    "قلم","كتاب","كرسي","طاولة","باب","نافذة","مفتاح","ساعة","حذاء","قبعة",
    "شمس","قمر","نجمة","سحابة","مطر","ثلج","رعد","قوس قزح","بحر","نهر",
    "ذهب","فضة","ألماس","معدن","خشب","حجر","زجاج","بلاستيك","قماش","ورق",
  ],
};

function pickTopic(): { category: string; topic: string } {
  const cats = Object.keys(TOPICS);
  const category = cats[Math.floor(Math.random() * cats.length)];
  const list = TOPICS[category];
  const topic = list[Math.floor(Math.random() * list.length)];
  return { category, topic };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function playerList(s: OutsiderState): string {
  return [...s.players.values()].map((p) => `• ${esc(dn(p))}`).join("\n");
}

function voteKb(chatId: number, s: OutsiderState) {
  const buttons = [...s.players.values()].map((p) => {
    const cnt = [...s.votes.values()].filter((v) => v === p.id).length;
    const label = cnt > 0 ? `${dn(p)} (${cnt})` : dn(p);
    return [Markup.button.callback(label, `out:vote:${chatId}:${p.id}`)];
  });
  return Markup.inlineKeyboard(buttons);
}

// ─── Start ─────────────────────────────────────────────────────────────────────
export async function startOutsider(bot: Telegraf, ctx: Context): Promise<void> {
  const chatId = ctx.chat!.id;
  if (gameStates.has(chatId)) {
    await ctx.reply("⚠️ فيه لعبة شغالة الحين — خلّوها تنتهي أو /endgame", { parse_mode: "HTML" });
    return;
  }
  const from = ctx.from!;
  const starter: OutsiderPlayer = {
    id: from.id,
    name: [from.first_name, from.last_name].filter(Boolean).join(" "),
    username: from.username,
  };

  const s: OutsiderState = {
    type: "outsider",
    phase: "joining",
    players: new Map([[from.id, starter]]),
    outsiderId: null,
    topic: "",
    category: "",
    votes: new Map(),
    startedBy: from.id,
    chatId,
  };
  gameStates.set(chatId, s);

  const sent = await bot.telegram.sendMessage(
    chatId,
    `🫥 <b>برا السالفة!</b>\n\n` +
    `${esc(dn(starter))} فتح اللعبة!\n\n` +
    `<b>طريقة اللعب:</b>\n` +
    `• شخص واحد بيكون <b>برا السالفة</b> ما يعرف الموضوع\n` +
    `• الباقي يعرفون الموضوع ويعطون تلميحات ذكية\n` +
    `• الجميع يصوّت على مين يظن إنه برا السالفة\n\n` +
    `👥 اللاعبون (1):\n• ${esc(dn(starter))}\n\n` +
    `⏳ <b>60 ثانية للانضمام</b>`,
    { parse_mode: "HTML", ...Markup.inlineKeyboard([[Markup.button.callback("🙋 انضم للعبة", `out:join:${chatId}`)]]) }
  );
  s.joinMsgId = sent.message_id;

  s.joinWarnTimer = setTimeout(() => {
    const cur = gameStates.get(chatId) as OutsiderState | undefined;
    if (!cur || cur.phase !== "joining") return;
    bot.telegram.sendMessage(chatId, `⚡ <b>20 ثانية متبقية للانضمام!</b>`, { parse_mode: "HTML" }).catch(() => {});
  }, JOIN_WARN_MS);

  s.joinTimer = setTimeout(() => forceStart(bot, chatId), JOIN_MS);
}

// ─── Join ──────────────────────────────────────────────────────────────────────
export function handleOutsiderJoin(bot: Telegraf, ctx: Context, chatId: number): void {
  const s = gameStates.get(chatId) as OutsiderState | undefined;
  if (!s || s.type !== "outsider" || s.phase !== "joining") {
    ctx.answerCbQuery("⚠️ الانضمام منتهي").catch(() => {}); return;
  }
  const from = ctx.from!;
  if (s.players.has(from.id)) { ctx.answerCbQuery("✅ أنت منضم").catch(() => {}); return; }
  if (s.players.size >= 12) { ctx.answerCbQuery("🚫 اللعبة ممتلئة (12 لاعب)").catch(() => {}); return; }

  s.players.set(from.id, {
    id: from.id,
    name: [from.first_name, from.last_name].filter(Boolean).join(" "),
    username: from.username,
  });
  ctx.answerCbQuery("✅ انضممت!").catch(() => {});

  const list = playerList(s);
  if (s.joinMsgId) {
    bot.telegram.editMessageText(
      chatId, s.joinMsgId, undefined,
      `🫥 <b>برا السالفة!</b>\n\n` +
      `👥 اللاعبون (${s.players.size}):\n${list}\n\n` +
      `⏳ في انتظار المزيد...`,
      { parse_mode: "HTML", ...Markup.inlineKeyboard([[Markup.button.callback("🙋 انضم للعبة", `out:join:${chatId}`)]]) }
    ).catch(() => {});
  }
}

// ─── Force Start ───────────────────────────────────────────────────────────────
export function handleOutsiderForceStart(bot: Telegraf, ctx: Context, chatId: number): void {
  const s = gameStates.get(chatId) as OutsiderState | undefined;
  if (!s || s.type !== "outsider" || s.phase !== "joining") {
    ctx.answerCbQuery("⚠️ اللعبة مو في مرحلة الانضمام").catch(() => {}); return;
  }
  if (ctx.from!.id !== s.startedBy) { ctx.answerCbQuery("🚫 بس اللي فتح اللعبة يقدر يبدأها").catch(() => {}); return; }
  ctx.answerCbQuery("▶️ تبدأ!").catch(() => {});
  forceStart(bot, chatId);
}

function forceStart(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId) as OutsiderState | undefined;
  if (!s || s.type !== "outsider" || s.phase !== "joining") return;
  if (s.joinTimer)     clearTimeout(s.joinTimer);
  if (s.joinWarnTimer) clearTimeout(s.joinWarnTimer);

  if (s.players.size < MIN_PLAYERS) {
    bot.telegram.sendMessage(chatId, `❌ ما يكفي لاعبين (أقل شيء ${MIN_PLAYERS})`, { parse_mode: "HTML" }).catch(() => {});
    clearGame(chatId);
    return;
  }

  const ids = [...s.players.keys()];
  s.outsiderId = ids[Math.floor(Math.random() * ids.length)];
  const { category, topic } = pickTopic();
  s.topic    = topic;
  s.category = category;
  s.phase    = "hinting";

  recordGame(chatId, [...s.players.values()]);

  // DM everyone
  for (const [uid, p] of s.players) {
    privateUserToGame.set(uid, chatId);
    if (uid === s.outsiderId) {
      bot.telegram.sendMessage(uid,
        `🫥 <b>أنت برا السالفة!</b>\n\n` +
        `الكل عارف الموضوع وأنت لا!\n` +
        `<i>استمع للتلميحات في القروب وحاول تكتشف الموضوع — ولا تنكشف!</i>`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    } else {
      bot.telegram.sendMessage(uid,
        `🎯 <b>الموضوع:</b> ${s.category}\n` +
        `🔑 <b>الكلمة:</b> <b>${esc(s.topic)}</b>\n\n` +
        `<i>أعط تلميحاً ذكياً في القروب — لا تقول الكلمة مباشرة!\n` +
        `ولا تفضح نفسك لـ "برا السالفة"!</i>`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }
  }

  bot.telegram.sendMessage(
    chatId,
    `🫥 <b>برا السالفة — الجولة بدأت!</b>\n\n` +
    `👥 اللاعبون:\n${playerList(s)}\n\n` +
    `📨 <b>كل واحد وصله رسالة خاصة</b>\n` +
    `• إذا عرفت الموضوع: أعط تلميحاً ذكياً هنا في القروب\n` +
    `• إذا أنت برا السالفة: حاول ما تنكشف 😏\n\n` +
    `⏳ <b>دقيقتان للتلميحات — ابدأوا!</b>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  s.hintWarnTimer = setTimeout(() => {
    const cur = gameStates.get(chatId) as OutsiderState | undefined;
    if (!cur || cur.phase !== "hinting") return;
    bot.telegram.sendMessage(chatId, `⚡ <b>40 ثانية متبقية للتلميحات!</b> بعدها يبدأ التصويت...`, { parse_mode: "HTML" }).catch(() => {});
  }, HINT_WARN_MS);

  s.hintTimer = setTimeout(() => startVoting(bot, chatId), HINT_MS);
}

// ─── Voting ────────────────────────────────────────────────────────────────────
function startVoting(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId) as OutsiderState | undefined;
  if (!s || s.type !== "outsider" || s.phase !== "hinting") return;
  if (s.hintTimer)     clearTimeout(s.hintTimer);
  if (s.hintWarnTimer) clearTimeout(s.hintWarnTimer);

  s.phase = "voting";

  bot.telegram.sendMessage(
    chatId,
    `🗳️ <b>وقت التصويت!</b>\n\n` +
    `مين تظنه <b>برا السالفة</b>؟\n` +
    `<i>صوّت الحين — عندك 60 ثانية</i>`,
    { parse_mode: "HTML", ...voteKb(chatId, s) }
  ).then((msg) => {
    const cur = gameStates.get(chatId) as OutsiderState | undefined;
    if (cur) cur.voteMsgId = msg.message_id;
  }).catch((e) => logger.error({ err: e }, "outsider: vote msg"));

  s.voteWarnTimer = setTimeout(() => {
    const cur = gameStates.get(chatId) as OutsiderState | undefined;
    if (!cur || cur.phase !== "voting") return;
    bot.telegram.sendMessage(chatId, `⚡ <b>30 ثانية متبقية للتصويت!</b>`, { parse_mode: "HTML" }).catch(() => {});
  }, VOTE_WARN_MS);

  s.voteTimer = setTimeout(() => resolveVoting(bot, chatId), VOTE_MS);
}

export function handleOutsiderVote(bot: Telegraf, ctx: Context, chatId: number, targetId: number): void {
  const s = gameStates.get(chatId) as OutsiderState | undefined;
  if (!s || s.type !== "outsider" || s.phase !== "voting") {
    ctx.answerCbQuery("⚠️ التصويت منتهي").catch(() => {}); return;
  }
  const voter = s.players.get(ctx.from!.id);
  if (!voter) { ctx.answerCbQuery("🚫 لست في اللعبة").catch(() => {}); return; }
  if (ctx.from!.id === targetId) { ctx.answerCbQuery("🚫 ما تصوّت على نفسك!").catch(() => {}); return; }
  const target = s.players.get(targetId);
  if (!target) { ctx.answerCbQuery("🚫 لاعب غير موجود").catch(() => {}); return; }

  s.votes.set(ctx.from!.id, targetId);
  ctx.answerCbQuery(`✅ صوّتت على ${dn(target)}`).catch(() => {});

  if (s.voteMsgId)
    bot.telegram.editMessageReplyMarkup(chatId, s.voteMsgId, undefined, voteKb(chatId, s).reply_markup).catch(() => {});

  // All voted → resolve early
  if ([...s.players.keys()].every((uid) => s.votes.has(uid))) {
    bot.telegram.sendMessage(chatId, `⚡ <b>الجميع صوّتوا — نكشف النتيجة!</b>`, { parse_mode: "HTML" }).catch(() => {});
    resolveVoting(bot, chatId);
  }
}

// ─── Resolve ───────────────────────────────────────────────────────────────────
function resolveVoting(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId) as OutsiderState | undefined;
  if (!s || s.type !== "outsider" || s.phase !== "voting") return;
  if (s.voteTimer)     clearTimeout(s.voteTimer);
  if (s.voteWarnTimer) clearTimeout(s.voteWarnTimer);
  if (s.voteMsgId)
    bot.telegram.editMessageReplyMarkup(chatId, s.voteMsgId, undefined, { inline_keyboard: [] }).catch(() => {});

  // Tally votes
  const tally = new Map<number, number>();
  for (const [, v] of s.votes) tally.set(v, (tally.get(v) ?? 0) + 1);

  let maxV = 0, topId: number | null = null, tie = false;
  for (const [uid, cnt] of tally) {
    if (cnt > maxV) { maxV = cnt; topId = uid; tie = false; }
    else if (cnt === maxV) tie = true;
  }

  // Build vote summary
  const summary = [...s.players.values()].map((p) => {
    const cnt = tally.get(p.id) ?? 0;
    const bar = "🔴".repeat(cnt) + "⚪".repeat(s.players.size - 1 - cnt);
    return `${bar} <b>${esc(dn(p))}</b> (${cnt} صوت)`;
  }).join("\n");

  const outsider = s.players.get(s.outsiderId!)!;
  const caughtCorrectly = !tie && topId === s.outsiderId;

  bot.telegram.sendMessage(
    chatId,
    `📊 <b>نتائج التصويت:</b>\n\n${summary}`,
    { parse_mode: "HTML" }
  ).then(() => {
    if (caughtCorrectly) {
      // Outsider caught → give them a chance to guess
      s.phase = "guessing";
      bot.telegram.sendMessage(
        chatId,
        `🎯 <b>القروب اشتبه في ${esc(dn(outsider))}!</b>\n\n` +
        `🫥 يا ${esc(dn(outsider))} — هل تقدر تحزر الموضوع؟\n` +
        `<i>أرسلي الكلمة خاص للبوت خلال 40 ثانية!</i>`,
        { parse_mode: "HTML" }
      ).catch(() => {});

      // DM the outsider to guess
      bot.telegram.sendMessage(
        outsider.id,
        `🫥 <b>تم الإمساك بك!</b>\n\n` +
        `عندك فرصة واحدة — أرسل لي الموضوع تخمينك الحين (فئة: <b>${esc(s.category)}</b>)`,
        { parse_mode: "HTML" }
      ).catch(() => {});

      s.guessTimer = setTimeout(() => announceResult(bot, chatId, false), GUESS_MS);
    } else {
      announceResult(bot, chatId, false);
    }
  }).catch(() => {});
}

// ─── Handle outsider's guess (via DM) ─────────────────────────────────────────
export function handleOutsiderGuess(bot: Telegraf, chatId: number, userId: number, text: string): void {
  const s = gameStates.get(chatId) as OutsiderState | undefined;
  if (!s || s.type !== "outsider" || s.phase !== "guessing") return;
  if (userId !== s.outsiderId) return;

  const guessClean  = text.trim().toLowerCase().replace(/\s+/g, "");
  const topicClean  = s.topic.trim().toLowerCase().replace(/\s+/g, "");
  const guessedRight = guessClean === topicClean ||
    topicClean.includes(guessClean) ||
    guessClean.includes(topicClean);

  if (s.guessTimer) clearTimeout(s.guessTimer);
  announceResult(bot, chatId, guessedRight, text.trim());
}

// ─── Announce final result ─────────────────────────────────────────────────────
function announceResult(bot: Telegraf, chatId: number, outsiderGuessedRight: boolean, guess?: string) {
  const s = gameStates.get(chatId) as OutsiderState | undefined;
  if (!s || s.type !== "outsider") return;
  s.phase = "done";

  const outsider = s.players.get(s.outsiderId!)!;
  const players = [...s.players.values()];

  // Determine who won
  // Logic:
  // - If outsider was NOT caught (tie or wrong person): outsider wins (no guess needed)
  // - If outsider WAS caught AND guessed right: outsider wins
  // - If outsider WAS caught AND guessed wrong: players win
  const tally = new Map<number, number>();
  for (const [, v] of s.votes) tally.set(v, (tally.get(v) ?? 0) + 1);
  let maxV = 0, topId: number | null = null, tie = false;
  for (const [uid, cnt] of tally) {
    if (cnt > maxV) { maxV = cnt; topId = uid; tie = false; }
    else if (cnt === maxV) tie = true;
  }
  const caughtCorrectly = !tie && topId === s.outsiderId;

  let outsiderWins: boolean;
  let msg = "";

  if (!caughtCorrectly) {
    outsiderWins = true;
    msg = `🫥 <b>برا السالفة فاز!</b>\n\n` +
      `القروب ما اكتشف ${esc(dn(outsider))} 😏\n` +
      `الموضوع كان: <b>${esc(s.category)} — ${esc(s.topic)}</b>`;
  } else if (outsiderGuessedRight) {
    outsiderWins = true;
    msg = `🫥 <b>برا السالفة فاز من الباب الخلفي!</b>\n\n` +
      `تم إمساك ${esc(dn(outsider))}...\n` +
      `لكنه خمّن الموضوع صح: <b>${esc(guess ?? s.topic)}</b> ✅\n` +
      `الموضوع كان: <b>${esc(s.category)} — ${esc(s.topic)}</b>`;
  } else {
    outsiderWins = false;
    const guessMsg = guess ? `حاول يقول: "${esc(guess)}" ❌` : `ما رد في الوقت المحدد ❌`;
    msg = `🎉 <b>القروب فاز!</b>\n\n` +
      `اكتشفوا ${esc(dn(outsider))} كان <b>برا السالفة!</b>\n` +
      `${guessMsg}\n` +
      `الموضوع كان: <b>${esc(s.category)} — ${esc(s.topic)}</b>`;
  }

  // Record wins
  if (outsiderWins) {
    recordWin(chatId, outsider);
  } else {
    const winners = players.filter((p) => p.id !== s.outsiderId);
    for (const w of winners) recordWin(chatId, w);
  }

  bot.telegram.sendMessage(chatId, msg, { parse_mode: "HTML" }).catch(() => {});
  setTimeout(() => clearGame(chatId), 3000);
}

export { TOPICS };
