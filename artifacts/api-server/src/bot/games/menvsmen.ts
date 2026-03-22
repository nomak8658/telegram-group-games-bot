import { Telegraf, Markup, Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, dn, esc, bar,
  type MenVsMenState, type Player,
} from "../state.js";
import { logger } from "../../lib/logger.js";

const DEBATE_MS   = 120_000;
const WARN1_MS    =  60_000;
const WARN2_MS    =  90_000;
const VOTE_MS     =  45_000;
const VOTE_WARN_MS =  20_000;

// ─── Debate Topics ─────────────────────────────────────────────────────────────

const DEBATES = [
  // 💔 علاقات
  { category: "💔 علاقات", q: "في الصداقة — أيهما أفضل؟", a: "الصراحة الكاملة ولو كانت مؤلمة", b: "المجاملة لحفظ المشاعر والعلاقة" },
  { category: "💔 علاقات", q: "الغيرة في العلاقة؟", a: "دليل حب واهتمام حقيقي", b: "سم بطيء يفسد كل شيء" },
  { category: "💔 علاقات", q: "الحب من أول نظرة؟", a: "حقيقي وموجود — القلب ما يكذب", b: "وهم رومانسي — الحب يبنى بالوقت" },
  { category: "💔 علاقات", q: "الشريك المثالي؟", a: "شبيهك في التفكير والاهتمامات", b: "مختلف عنك ويكمّلك من حيث تنقص" },
  { category: "💔 علاقات", q: "العلاقات عن بُعد؟", a: "تنجح لو في إرادة حقيقية من الطرفين", b: "مآلها الفشل — الشخص يحتاج الحضور" },
  { category: "💔 علاقات", q: "في الخلاف — أيهما أصح؟", a: "واجه المشكلة فوراً مهما كلّف", b: "اعطها وقت — المشاكل تخف لوحدها" },
  { category: "💔 علاقات", q: "الصديق الحقيقي؟", a: "يقول الحقيقة ولو جرحتك", b: "يسندك أولاً ولو كنت مخطئاً" },
  // 🧠 تفكير
  { category: "🧠 تفكير", q: "الشخص الناجح هو؟", a: "اللي يتعب ويجتهد بلا كلل", b: "اللي يشتغل بذكاء لا بجهد" },
  { category: "🧠 تفكير", q: "أيهما أقوى تأثيراً؟", a: "الثقة بالنفس الكاملة", b: "الذكاء الاجتماعي والمرونة" },
  { category: "🧠 تفكير", q: "تغيير حياة الإنسان يبدأ من؟", a: "الداخل — عقلك وأفكارك أولاً", b: "الخارج — بدّل بيئتك وناسك" },
  { category: "🧠 تفكير", q: "النجاح الحقيقي هو؟", a: "المال والمكانة بين الناس", b: "الرضا والسعادة الداخلية" },
  { category: "🧠 تفكير", q: "اللي يقول ما عنده وقت؟", a: "فعلاً مشغول والحياة صعبة عليه", b: "الأولويات تُختار — هذي أعذار" },
  { category: "🧠 تفكير", q: "المستقبل — الأصح؟", a: "التخطيط المسبق لكل خطوة أساسي", b: "العيش لحظة بلحظة والتكيّف مع الواقع" },
  // 🌍 حياة
  { category: "🌍 حياة", q: "الحياة الأفضل؟", a: "في المدينة بفرصها وحركتها", b: "في الهدوء بعيداً عن الضغط والزحام" },
  { category: "🌍 حياة", q: "وقت الفراغ — الصح؟", a: "تستغله وتطور نفسك باستمرار", b: "ترتاح وتفعل ما يسعدك فعلاً" },
  { category: "🌍 حياة", q: "الاعتذار؟", a: "بادر دائماً ولو ما أخطأت كثيراً", b: "اعتذر فقط لما تكون مخطئاً فعلاً" },
  { category: "🌍 حياة", q: "في الصداقة — الأهم؟", a: "صديق واحد وفي أحسن من ألف", b: "كثرة العلاقات قوة وثروة اجتماعية" },
  { category: "🌍 حياة", q: "السوشيال ميديا؟", a: "أفسدت العلاقات وعمّقت الوحدة", b: "وثّقت ناساً ما كانوا يلتقون أبداً" },
  { category: "🌍 حياة", q: "تربية الأولاد — الأهم؟", a: "الحزم والوضوح في الحدود والقواعد", b: "الحرية والثقة من الأهل" },
  { category: "🌍 حياة", q: "الشخص المتفائل؟", a: "أقوى وأنجح لأنه يرى الفرص دائماً", b: "ساذج — الواقعية أهم من التفاؤل" },
];

function pickDebate() {
  return DEBATES[Math.floor(Math.random() * DEBATES.length)];
}

// ─── Keyboards ─────────────────────────────────────────────────────────────────

function reactKb(s: MenVsMenState) {
  const r1 = [...s.liveReacts.values()].filter((v) => v === 1).length;
  const r2 = [...s.liveReacts.values()].filter((v) => v === 2).length;
  const n1 = dn(s.player1);
  const n2 = dn(s.player2);
  return Markup.inlineKeyboard([[
    Markup.button.callback(r1 ? `🔥 ${n1}  ${r1}` : `🔥 ${n1}`, `mvs:react:${s.chatId}:1`),
    Markup.button.callback(r2 ? `🔥 ${n2}  ${r2}` : `🔥 ${n2}`, `mvs:react:${s.chatId}:2`),
  ]]);
}

function voteKb(s: MenVsMenState) {
  const v1 = [...s.votes.values()].filter((v) => v === 1).length;
  const v2 = [...s.votes.values()].filter((v) => v === 2).length;
  const n1 = dn(s.player1);
  const n2 = dn(s.player2);
  return Markup.inlineKeyboard([[
    Markup.button.callback(v1 ? `${n1}  •  ${v1} ✓` : n1, `mvs:1:${s.chatId}`),
    Markup.button.callback(v2 ? `${n2}  •  ${v2} ✓` : n2, `mvs:2:${s.chatId}`),
  ]]);
}

// ─── Start ─────────────────────────────────────────────────────────────────────

export function startMenVsMen(
  bot: Telegraf,
  chatId: number,
  player1: Player,
  player2: Player,
  startedBy: number
): void {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId, "⚠️ في لعبة شغالة — أوقفها أولاً بـ /stop").catch(() => {});
    return;
  }

  const debate = pickDebate();
  const s: MenVsMenState = {
    type: "menvsmen",
    phase: "arguing",
    player1,
    player2,
    votes: new Map(),
    liveReacts: new Map(),
    debate,
    startedBy,
    chatId,
  };
  gameStates.set(chatId, s);
  recordGame(chatId, [player1, player2]);

  const p1 = esc(dn(player1));
  const p2 = esc(dn(player2));

  // Main announcement
  bot.telegram.sendMessage(
    chatId,
    `🥊 <b>مين ضد مين</b>  —  ${esc(debate.category)}\n\n` +
    `❓ <b>${esc(debate.q)}</b>\n\n` +
    `🔵 <b>${p1}</b> يدافع عن:\n<i>"${esc(debate.a)}"</i>\n\n` +
    `🔴 <b>${p2}</b> يدافع عن:\n<i>"${esc(debate.b)}"</i>\n\n` +
    `──────────────\n` +
    `⏳ دقيقتان للنقاش — اقنعوا القروب 🗣️`,
    { parse_mode: "HTML" }
  ).catch((e) => logger.error({ err: e }, "mvs: start"));

  // Live reaction message (separate, editable)
  bot.telegram.sendMessage(
    chatId,
    `👆 مين يعجبك كلامه أثناء النقاش؟`,
    { parse_mode: "HTML", ...reactKb(s) }
  ).then((msg) => {
    const cur = gameStates.get(chatId) as MenVsMenState | undefined;
    if (cur) cur.reactMsgId = msg.message_id;
  }).catch(() => {});

  // Countdown warnings
  s.warnTimer = setTimeout(() => {
    const cur = gameStates.get(chatId) as MenVsMenState | undefined;
    if (!cur || cur.phase !== "arguing") return;
    bot.telegram.sendMessage(chatId, `⏱ <b>دقيقة واحدة!</b>  سارعوا 🔥`, { parse_mode: "HTML" }).catch(() => {});
  }, WARN1_MS);

  s.warnTimer2 = setTimeout(() => {
    const cur = gameStates.get(chatId) as MenVsMenState | undefined;
    if (!cur || cur.phase !== "arguing") return;
    bot.telegram.sendMessage(chatId, `⚡ <b>30 ثانية!</b>  اختموا كلامكم`, { parse_mode: "HTML" }).catch(() => {});
  }, WARN2_MS);

  s.argTimer = setTimeout(() => openVoting(bot, chatId), DEBATE_MS);
}

// ─── Live React ────────────────────────────────────────────────────────────────

export function handleReact(
  bot: Telegraf, ctx: Context, chatId: number, choice: 1 | 2
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "menvsmen" || s.phase !== "arguing") {
    ctx.answerCbQuery("⚠️ انتهى وقت التفاعل").catch(() => {}); return;
  }
  const uid = ctx.from!.id;
  if (uid === s.player1.id || uid === s.player2.id) {
    ctx.answerCbQuery("🙅 ما تتفاعل مع نفسك!").catch(() => {}); return;
  }

  const prev = s.liveReacts.get(uid);
  s.liveReacts.set(uid, choice);
  const picked = choice === 1 ? dn(s.player1) : dn(s.player2);
  const msg = prev && prev !== choice ? `🔄 غيّرت لـ ${picked}` : `🔥 تفاعلت مع ${picked}`;
  ctx.answerCbQuery(msg).catch(() => {});

  if (s.reactMsgId) {
    bot.telegram.editMessageReplyMarkup(
      chatId, s.reactMsgId, undefined, reactKb(s).reply_markup
    ).catch(() => {});
  }
}

// ─── Voting ────────────────────────────────────────────────────────────────────

function openVoting(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "menvsmen" || s.phase !== "arguing") return;
  s.phase = "voting";

  // Disable react buttons
  if (s.reactMsgId) {
    const r1 = [...s.liveReacts.values()].filter((v) => v === 1).length;
    const r2 = [...s.liveReacts.values()].filter((v) => v === 2).length;
    const pulse = r1 > r2
      ? `🔥 القروب مال لـ <b>${esc(dn(s.player1))}</b> أثناء النقاش`
      : r2 > r1
      ? `🔥 القروب مال لـ <b>${esc(dn(s.player2))}</b> أثناء النقاش`
      : `⚖️ القروب منقسم أثناء النقاش`;
    bot.telegram.editMessageText(
      chatId, s.reactMsgId, undefined,
      `${pulse}\n\n<i>النبض الحي أثناء النقاش: ${esc(dn(s.player1))} ${r1} 🔥  vs  ${r2} 🔥 ${esc(dn(s.player2))}</i>`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  const d = s.debate!;
  const p1 = esc(dn(s.player1));
  const p2 = esc(dn(s.player2));

  bot.telegram.sendMessage(
    chatId,
    `🗳️ <b>التصويت بدأ!</b>\n\n` +
    `❓ <i>${esc(d.q)}</i>\n\n` +
    `🔵 ${p1} — <i>"${esc(d.a)}"</i>\n` +
    `🔴 ${p2} — <i>"${esc(d.b)}"</i>\n\n` +
    `مين أقنعك؟  45 ثانية 👇`,
    { parse_mode: "HTML", ...voteKb(s) }
  ).then((msg) => {
    const cur = gameStates.get(chatId) as MenVsMenState | undefined;
    if (cur) cur.voteMsgId = msg.message_id;
  }).catch((e) => logger.error({ err: e }, "mvs: vote msg"));

  s.voteWarnTimer = setTimeout(() => {
    bot.telegram.sendMessage(chatId, `⚡ <b>20 ثانية!</b>  لحقوا تصوتون`, { parse_mode: "HTML" }).catch(() => {});
  }, VOTE_WARN_MS);

  s.voteTimer = setTimeout(() => announceResult(bot, chatId), VOTE_MS);
}

export async function handleVote(
  bot: Telegraf, ctx: Context, chatId: number, choice: 1 | 2
) {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "menvsmen" || s.phase !== "voting") {
    return ctx.answerCbQuery("انتهى التصويت").catch(() => {});
  }
  const uid = ctx.from!.id;
  if (uid === s.player1.id || uid === s.player2.id)
    return ctx.answerCbQuery("🚫 ما تصوت على نفسك!").catch(() => {});
  if (s.votes.has(uid))
    return ctx.answerCbQuery("✅ صوّتك مسجّل").catch(() => {});

  s.votes.set(uid, choice);
  const picked = choice === 1 ? dn(s.player1) : dn(s.player2);
  await ctx.answerCbQuery(`✅ صوّتت لـ ${picked}`).catch(() => {});

  if (s.voteMsgId) {
    bot.telegram.editMessageReplyMarkup(
      chatId, s.voteMsgId, undefined, voteKb(s).reply_markup
    ).catch(() => {});
  }
}

// ─── Result ────────────────────────────────────────────────────────────────────

function announceResult(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "menvsmen") return;
  s.phase = "done";

  let v1 = 0, v2 = 0;
  for (const v of s.votes.values()) v === 1 ? v1++ : v2++;
  const total = v1 + v2;
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : "—");

  // Voter breakdown
  const p1voters: string[] = [], p2voters: string[] = [];
  for (const [, v] of s.votes) v === 1 ? p1voters.push("") : p2voters.push("");
  // (We can't get names easily from uid without cache — just counts)

  const p1 = esc(dn(s.player1));
  const p2 = esc(dn(s.player2));
  const d = s.debate!;

  if (s.voteMsgId)
    bot.telegram.editMessageReplyMarkup(chatId, s.voteMsgId, undefined, { inline_keyboard: [] }).catch(() => {});

  // Live pulse recap
  const r1 = [...s.liveReacts.values()].filter((v) => v === 1).length;
  const r2 = [...s.liveReacts.values()].filter((v) => v === 2).length;

  let verdict: string;
  let flavor: string;
  let winner: Player | null = null;

  if (v1 > v2) {
    winner = s.player1;
    verdict = `🏆 الفائز: <b>${p1}</b>`;
    const margin = v1 - v2;
    flavor = margin >= 3 ? `سحق تام 💥` : margin === 1 ? `فوز صعب بفارق صوت واحد 😮` : `فوز واضح 👊`;
  } else if (v2 > v1) {
    winner = s.player2;
    verdict = `🏆 الفائز: <b>${p2}</b>`;
    const margin = v2 - v1;
    flavor = margin >= 3 ? `سحق تام 💥` : margin === 1 ? `فوز صعب بفارق صوت واحد 😮` : `فوز واضح 👊`;
  } else {
    verdict = `🤝 <b>تعادل</b>`;
    flavor = total === 0 ? `ما صوّت أحد 😶` : `القروب منقسم تماماً`;
  }

  if (winner) recordWin(chatId, winner);

  bot.telegram.sendMessage(
    chatId,
    `📊 <b>النتائج النهائية</b>\n\n` +
    `${esc(d.category)}  <i>${esc(d.q)}</i>\n\n` +
    `🔵 ${p1}\n${bar(v1, total)} ${pct(v1)}  •  ${v1} صوت\n\n` +
    `🔴 ${p2}\n${bar(v2, total)} ${pct(v2)}  •  ${v2} صوت\n\n` +
    `──────────────\n${verdict}  —  <i>${flavor}</i>\n\n` +
    `🔥 النبض الحي: ${p1} ${r1}  vs  ${r2} ${p2}\n\n` +
    `/score — لوحة المتصدرين  •  /play — جولة جديدة`,
    { parse_mode: "HTML" }
  ).catch((e) => logger.error({ err: e }, "mvs: result"));

  clearGame(chatId);
}
