import { Telegraf, Markup, Context } from "telegraf";
import {
  gameStates, clearGame, privateUserToGame, victimUserToGame,
  recordWin, recordGame, dn, esc, isVictim, resolveVictimId,
  type TrustBreakState, type Player,
} from "../state.js";
import { logger } from "../../lib/logger.js";

const JOIN_MS        =  90_000;
const JOIN_WARN_MS   =  60_000;
const COLLECT_MS     = 300_000;
const COLLECT_WARN_MS = 240_000;
const VOTE_MS        =  40_000;
const MIN            = 2;

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

// ─── Harshness Rating ─────────────────────────────────────────────────────────

const HARSH_WORDS = [
  "أناني","كذاب","مزعج","وقح","ثقيل","بخيل","غبي","نرجسي","متكبر","فاشل",
  "لئيم","خاين","منافق","مزيف","عنيد","أحمق","سخيف","بغيض","متسلط","خسيس",
  "حقير","يضايق","كريه","سطحي","ممل","مدّعي","متصنّع","وضيع","قليل",
];

function harshScore(text: string): number {
  let score = text.length * 0.3;
  const t = text.toLowerCase();
  for (const w of HARSH_WORDS) if (t.includes(w)) score += 60;
  score += (text.match(/[!؟]{2,}/g) ?? []).length * 20;
  score += (text.match(/[!؟]/g) ?? []).length * 10;
  score += (text.match(/😡|💀|🤮|😤|😠|🖕/g) ?? []).length * 40;
  return score;
}

function harshLabel(score: number): string {
  if (score > 250) return "💀💀💀 قاتل";
  if (score > 160) return "💀💀 قاسي";
  if (score > 80)  return "💀 لاذع";
  if (score > 30)  return "😬 حاد";
  return "💬 خفيف";
}

function findHarshestUid(revealOrder: number[], opinions: Map<number, string>): number {
  let best = revealOrder[0], bestScore = -1;
  for (const uid of revealOrder) {
    const s = harshScore(opinions.get(uid) ?? "");
    if (s > bestScore) { bestScore = s; best = uid; }
  }
  return best;
}

// ─── Keyboards ─────────────────────────────────────────────────────────────────

function joinBtn(chatId: number, count: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(
      count ? `🙋 أشارك في اللعبة  (${count})` : "🙋 أشارك في اللعبة",
      `tb:join:${chatId}`
    )],
    [Markup.button.callback("🔒 إغلاق التسجيل", `tb:close:${chatId}`)],
  ]);
}

function voteOpinionBtns(chatId: number, count: number, votes: Map<number, Set<number>>) {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  let row: ReturnType<typeof Markup.button.callback>[] = [];
  for (let i = 1; i <= count; i++) {
    const n = votes.get(i)?.size ?? 0;
    row.push(Markup.button.callback(n ? `${i} 🔥 ${n}` : `${i}`, `tb:voteop:${chatId}:${i}`));
    if (row.length === 4 || i === count) { rows.push([...row]); row = []; }
  }
  return Markup.inlineKeyboard(rows);
}

function participantBtns(chatId: number, participants: Map<number, Player>) {
  const entries = [...participants.entries()];
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  let row: ReturnType<typeof Markup.button.callback>[] = [];
  entries.forEach(([uid, p], i) => {
    row.push(Markup.button.callback(dn(p), `tb:guess:${chatId}:${uid}`));
    if (row.length === 2 || i === entries.length - 1) { rows.push([...row]); row = []; }
  });
  return Markup.inlineKeyboard(rows);
}

// ─── Start ─────────────────────────────────────────────────────────────────────

export function startTrustBreak(
  bot: Telegraf,
  chatId: number,
  victim: Player,
  startedBy: number,
  botUsername: string,
  round = 1
): void {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId, "⚠️ في لعبة شغالة — أوقفها أولاً بـ /stop").catch(() => {});
    return;
  }

  const s: TrustBreakState = {
    type: "trustbreak",
    phase: "joining",
    victim,
    participants: new Map(),
    opinions: new Map(),
    pending: new Set(),
    opinionVotes: new Map(),
    startedBy,
    chatId,
    round,
  };
  gameStates.set(chatId, s);
  if (victim.id !== 0) victimUserToGame.set(victim.id, chatId);

  bot.telegram.sendMessage(
    chatId,
    `💀 <b>كسر الثقة</b>\n\n` +
    `🎯 الضحية: <b>${esc(dn(victim))}</b>\n\n` +
    `كل مشارك يكتب رأيه الصريح سراً 😈\n` +
    `الآراء تتكشف واحداً واحداً مع مستوى قسوتها...\n` +
    `القروب يختار الأقسى — والضحية تخمن كاتبه!\n\n` +
    `⏳ 90 ثانية للانضمام 👇`,
    { parse_mode: "HTML", ...joinBtn(chatId, 0) }
  ).then((msg) => {
    const cur = gameStates.get(chatId) as TrustBreakState | undefined;
    if (cur) cur.joinMsgId = msg.message_id;
  }).catch((e) => logger.error({ err: e }, "tb: announce"));

  s.joinWarnTimer = setTimeout(() => {
    const cur = gameStates.get(chatId) as TrustBreakState | undefined;
    if (!cur || cur.phase !== "joining") return;
    bot.telegram.sendMessage(chatId, `⏱ <b>30 ثانية!</b>  المنضمون: ${cur.participants.size}`, { parse_mode: "HTML" }).catch(() => {});
  }, JOIN_WARN_MS);

  s.joinTimer = setTimeout(() => closeJoining(bot, chatId, botUsername), JOIN_MS);
}

// ─── Join / Close ─────────────────────────────────────────────────────────────

export function handleJoin(
  bot: Telegraf, ctx: Context, chatId: number, botUsername: string
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "trustbreak" || s.phase !== "joining") {
    ctx.answerCbQuery("⚠️ انتهت مرحلة الانضمام").catch(() => {}); return;
  }

  const uid = ctx.from!.id;
  const uname = ctx.from!.username;

  if (isVictim(s.victim, uid, uname)) {
    resolveVictimId(s.victim, uid, uname);
    if (s.victim.id !== 0) victimUserToGame.set(s.victim.id, chatId);
    ctx.answerCbQuery("😅 أنت الضحية — انتظر وشوف الناس تكتب عنك!").catch(() => {}); return;
  }
  if (s.participants.has(uid)) {
    ctx.answerCbQuery("✅ أنت مسجّل بالفعل").catch(() => {}); return;
  }

  const player: Player = {
    id: uid,
    name: [ctx.from!.first_name, ctx.from!.last_name].filter(Boolean).join(" "),
    username: uname,
  };
  s.participants.set(uid, player);
  privateUserToGame.set(uid, chatId);

  const count = s.participants.size;
  ctx.answerCbQuery(`✅ انضممت! (${count})`).catch(() => {});

  if (s.joinMsgId)
    bot.telegram.editMessageReplyMarkup(chatId, s.joinMsgId, undefined, joinBtn(chatId, count).reply_markup).catch(() => {});

  const link = `https://t.me/${botUsername}?start=tb_${chatId}`;
  bot.telegram.sendMessage(
    uid,
    `💀 <b>كسر الثقة</b> — انضممت!\n\n🎯 الضحية: <b>${esc(dn(s.victim))}</b>\n\nاكتب رأيك الصريح هنا 👇\n<i>عيب، موقف، شيء يزعجك... أي شيء</i>\n\n🔐 سري — لن يعرف أحد أنك كاتبه`,
    { parse_mode: "HTML" }
  ).catch(() => {
    bot.telegram.sendMessage(
      chatId,
      `💬 <b>${esc(dn(player))}</b> — اضغط هنا لكتابة رأيك سراً:`,
      { parse_mode: "HTML", ...Markup.inlineKeyboard([[Markup.button.url("📩 اكتب رأيك سراً", link)]]) }
    ).catch(() => {});
  });
}

export function handleCloseJoin(
  bot: Telegraf, ctx: Context, chatId: number, botUsername: string
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "trustbreak" || s.phase !== "joining") {
    ctx.answerCbQuery("⚠️ ما في مرحلة انضمام نشطة").catch(() => {}); return;
  }
  if (ctx.from!.id !== s.startedBy) {
    ctx.answerCbQuery("🚫 فقط من بدأ اللعبة").catch(() => {}); return;
  }
  ctx.answerCbQuery("✅ تم الإغلاق").catch(() => {});
  if (s.joinTimer) clearTimeout(s.joinTimer);
  if (s.joinWarnTimer) clearTimeout(s.joinWarnTimer);
  closeJoining(bot, chatId, botUsername);
}

function closeJoining(bot: Telegraf, chatId: number, botUsername: string) {
  const s = gameStates.get(chatId) as TrustBreakState | undefined;
  if (!s || s.type !== "trustbreak" || s.phase !== "joining") return;

  if (s.joinMsgId)
    bot.telegram.editMessageReplyMarkup(chatId, s.joinMsgId, undefined, { inline_keyboard: [] }).catch(() => {});

  if (s.participants.size < MIN) {
    bot.telegram.sendMessage(chatId, `😔 ما كفى مشاركين (${MIN} على الأقل). انتهت اللعبة.`).catch(() => {});
    clearGame(chatId);
    return;
  }

  s.phase = "collecting";
  for (const uid of s.participants.keys()) s.pending.add(uid);

  const list = [...s.participants.values()].map((p) => `• ${esc(dn(p))}`).join("\n");
  recordGame(chatId, [...s.participants.values()]);

  bot.telegram.sendMessage(
    chatId,
    `🔒 <b>التسجيل أُغلق</b>\n\n👥 المشاركون:\n${list}\n\n<i>الكل يرسل رأيه سراً للبوت...</i>\n\n📊 0 / ${s.participants.size} آراء`,
    { parse_mode: "HTML" }
  ).then((msg) => {
    const cur = gameStates.get(chatId) as TrustBreakState | undefined;
    if (cur) cur.statusMsgId = msg.message_id;
  }).catch((e) => logger.error({ err: e }, "tb: collecting"));

  const link = `https://t.me/${botUsername}?start=tb_${chatId}`;
  for (const [uid] of s.participants) {
    bot.telegram.sendMessage(
      uid,
      `✍️ <b>اكتب رأيك الصريح في ${esc(dn(s.victim))}:</b>\n\n<i>أي شيء — عيب، موقف، شيء يزعجك...</i>\n\n🔐 سري تماماً`,
      { parse_mode: "HTML" }
    ).catch(() => {
      bot.telegram.sendMessage(
        chatId,
        `📩 <b>${esc(dn(s.participants.get(uid)!))}</b> — اضغط هنا:`,
        { parse_mode: "HTML", ...Markup.inlineKeyboard([[Markup.button.url("📩 اكتب رأيك هنا", link)]]) }
      ).catch(() => {});
    });
  }

  s.collectWarnTimer = setTimeout(() => {
    const cur = gameStates.get(chatId) as TrustBreakState | undefined;
    if (!cur || cur.phase !== "collecting") return;
    bot.telegram.sendMessage(
      chatId,
      `⏱ <b>دقيقة متبقية!</b>  ✅ ${cur.opinions.size} / ${cur.participants.size} آراء وصلت`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }, COLLECT_WARN_MS);

  s.collectTimer = setTimeout(() => revealOpinions(bot, chatId), COLLECT_MS);
}

// ─── Private Opinion ──────────────────────────────────────────────────────────

export function handlePrivateOpinion(
  bot: Telegraf, ctx: Context, uid: number, text: string, fromUsername?: string
): boolean {
  // Victim check
  const vcid = victimUserToGame.get(uid);
  if (vcid) {
    ctx.reply(`🚫 <b>أنت الضحية!</b>\n\nما تكتب رأيك عن نفسك 😄\nانتظر الكشف في القروب...`, { parse_mode: "HTML" }).catch(() => {});
    return true;
  }

  const chatId = privateUserToGame.get(uid);
  if (!chatId) {
    // Username-based victim check
    for (const [cid, state] of gameStates) {
      if (state.type === "trustbreak" && isVictim(state.victim, uid, fromUsername)) {
        resolveVictimId(state.victim, uid, fromUsername);
        if (state.victim.id !== 0) victimUserToGame.set(state.victim.id, cid);
        ctx.reply(`🚫 <b>أنت الضحية!</b>\n\nانتظر الكشف في القروب...`, { parse_mode: "HTML" }).catch(() => {});
        return true;
      }
    }
    return false;
  }

  const s = gameStates.get(chatId) as TrustBreakState | undefined;
  if (!s || s.type !== "trustbreak") return false;

  if (isVictim(s.victim, uid, fromUsername)) {
    resolveVictimId(s.victim, uid, fromUsername);
    ctx.reply(`🚫 <b>أنت الضحية!</b>\n\nانتظر الكشف في القروب...`, { parse_mode: "HTML" }).catch(() => {});
    return true;
  }
  if (s.phase !== "collecting") {
    ctx.reply("⚠️ انتهى وقت إرسال الآراء.").catch(() => {}); return true;
  }
  if (!s.participants.has(uid)) return false;

  if (s.opinions.has(uid)) {
    ctx.reply("✅ أرسلت رأيك بالفعل!\nانتظر النتائج في القروب 🙂").catch(() => {}); return true;
  }
  if (text.trim().length < 3) {
    ctx.reply("✍️ اكتب رأياً أوضح (3 أحرف على الأقل)").catch(() => {}); return true;
  }

  s.opinions.set(uid, text.trim());
  s.pending.delete(uid);
  const received = s.opinions.size;
  const total = s.participants.size;

  ctx.reply(
    `✅ <b>وصل رأيك!</b>\n\n${received} / ${total} آراء تجمّعت\n\n<i>انتظر الكشف في القروب...</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  if (s.statusMsgId) {
    const list = [...s.participants.values()].map((p) => `• ${esc(dn(p))}`).join("\n");
    bot.telegram.editMessageText(
      chatId, s.statusMsgId, undefined,
      `🔒 <b>مرحلة جمع الآراء</b>\n\n👥 المشاركون:\n${list}\n\n📊 ${received} / ${total} آراء`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  if (s.pending.size === 0) {
    if (s.collectTimer) clearTimeout(s.collectTimer);
    if (s.collectWarnTimer) clearTimeout(s.collectWarnTimer);
    revealOpinions(bot, chatId);
  }
  return true;
}

// ─── Reveal (Sequential + Dramatic) ──────────────────────────────────────────

function revealOpinions(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId) as TrustBreakState | undefined;
  if (!s || s.type !== "trustbreak") return;

  if (s.opinions.size === 0) {
    bot.telegram.sendMessage(chatId, "😅 ما وصل أي رأي. انتهت اللعبة.").catch(() => {});
    clearGame(chatId);
    return;
  }

  s.phase = "revealing";
  const entries = [...s.opinions.entries()].sort(() => Math.random() - 0.5);
  s.revealOrder = entries.map(([uid]) => uid);

  runRevealSequence(bot, chatId, entries).catch((e) =>
    logger.error({ err: e }, "tb: reveal sequence")
  );
}

async function runRevealSequence(
  bot: Telegraf, chatId: number, entries: [number, string][]
) {
  const total = entries.length;

  await bot.telegram.sendMessage(
    chatId,
    `🎭 <b>الآراء الصريحة تنكشف الآن...</b>\n\n<i>${total} رأي في ${esc(
      (gameStates.get(chatId) as TrustBreakState | undefined)
        ? dn((gameStates.get(chatId) as TrustBreakState).victim)
        : ""
    )}</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  await sleep(2500);

  for (let i = 0; i < total; i++) {
    const cur = gameStates.get(chatId) as TrustBreakState | undefined;
    if (!cur || cur.type !== "trustbreak" || cur.phase !== "revealing") return;

    await bot.telegram.sendChatAction(chatId, "typing").catch(() => {});
    await sleep(1800);

    const cur2 = gameStates.get(chatId) as TrustBreakState | undefined;
    if (!cur2 || cur2.type !== "trustbreak" || cur2.phase !== "revealing") return;

    const [, opinion] = entries[i];
    const score = harshScore(opinion);
    const label = harshLabel(score);

    await bot.telegram.sendMessage(
      chatId,
      `<b>${i + 1} / ${total}</b>  ${label}\n\n<i>"${esc(opinion)}"</i>`,
      { parse_mode: "HTML" }
    ).catch((e) => logger.error({ err: e }, "tb: reveal item"));

    if (i < total - 1) await sleep(3200);
  }

  await sleep(2000);
  openVoting(bot, chatId, total);
}

// ─── Voting Phase ─────────────────────────────────────────────────────────────

function openVoting(bot: Telegraf, chatId: number, count: number) {
  const s = gameStates.get(chatId) as TrustBreakState | undefined;
  if (!s || s.type !== "trustbreak") return;

  s.phase = "voting";
  for (let i = 1; i <= count; i++) s.opinionVotes.set(i, new Set());

  const victimName = s.victim.username ? `@${s.victim.username}` : esc(s.victim.name);

  bot.telegram.sendMessage(
    chatId,
    `🗳️ <b>صوّتوا — أي رأي الأقسى؟</b>\n\n${victimName} انتظر... القروب يختار الأقسى 😈\n\n⏳ 40 ثانية 👇`,
    { parse_mode: "HTML", ...voteOpinionBtns(chatId, count, s.opinionVotes) }
  ).then((msg) => {
    const cur = gameStates.get(chatId) as TrustBreakState | undefined;
    if (cur) cur.voteMsgId = msg.message_id;
  }).catch((e) => logger.error({ err: e }, "tb: vote msg"));

  s.voteTimer = setTimeout(() => resolveVoting(bot, chatId), VOTE_MS);
}

export function handleOpinionVote(
  bot: Telegraf, ctx: Context, chatId: number, opinionIdx: number
): void {
  const s = gameStates.get(chatId) as TrustBreakState | undefined;
  if (!s || s.type !== "trustbreak" || s.phase !== "voting") {
    ctx.answerCbQuery("⚠️ انتهى التصويت").catch(() => {}); return;
  }

  const uid = ctx.from!.id;
  const uname = ctx.from!.username;

  if (isVictim(s.victim, uid, uname)) {
    resolveVictimId(s.victim, uid, uname);
    ctx.answerCbQuery("🎯 أنت الضحية — صبراً!").catch(() => {}); return;
  }
  if (!s.opinionVotes.has(opinionIdx)) {
    ctx.answerCbQuery("⚠️ رقم غير صحيح").catch(() => {}); return;
  }

  for (const [, voters] of s.opinionVotes) voters.delete(uid);
  s.opinionVotes.get(opinionIdx)!.add(uid);
  ctx.answerCbQuery(`🔥 صوّتت على رأي #${opinionIdx}`).catch(() => {});

  if (s.voteMsgId) {
    bot.telegram.editMessageReplyMarkup(
      chatId, s.voteMsgId, undefined,
      voteOpinionBtns(chatId, s.opinionVotes.size, s.opinionVotes).reply_markup
    ).catch(() => {});
  }
}

function resolveVoting(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId) as TrustBreakState | undefined;
  if (!s || s.type !== "trustbreak" || s.phase !== "voting") return;

  let maxVotes = -1, winnerIdx = 1;
  for (const [idx, voters] of s.opinionVotes) {
    if (voters.size > maxVotes) { maxVotes = voters.size; winnerIdx = idx; }
  }
  if (maxVotes === 0)
    winnerIdx = Math.max(1,
      s.revealOrder!.indexOf(findHarshestUid(s.revealOrder!, s.opinions)) + 1
    );

  const winnerWriterUid = s.revealOrder![winnerIdx - 1];
  s.harshestWriterUid = winnerWriterUid;
  s.phase = "guessing";

  if (s.voteMsgId)
    bot.telegram.editMessageReplyMarkup(chatId, s.voteMsgId, undefined, { inline_keyboard: [] }).catch(() => {});

  const winnerText = s.opinions.get(winnerWriterUid)!;
  const voteInfo = maxVotes > 0 ? ` — فاز بـ ${maxVotes} صوت` : "";
  const victimName = esc(dn(s.victim));

  bot.telegram.sendMessage(
    chatId,
    `🏆 <b>الرأي الأقسى${voteInfo}:</b>\n\n<i>"${esc(winnerText)}"</i>\n\n──────────────\n🎯 <b>${victimName}</b> — مين كتب هذا الرأي؟\n\n👇 اضغط اسم الشخص:`,
    { parse_mode: "HTML", ...participantBtns(chatId, s.participants) }
  ).catch((e) => logger.error({ err: e }, "tb: guess msg"));

  const victimMention = s.victim.username ? `@${s.victim.username}` : esc(s.victim.name);
  bot.telegram.sendMessage(
    chatId,
    `👆 ${victimMention} — اضغط اسم اللي تعتقد أنه كتب الرأي الأقسى!`,
    { parse_mode: "HTML" }
  ).catch(() => {});
}

// ─── Guess ────────────────────────────────────────────────────────────────────

export function handleGuess(
  bot: Telegraf, ctx: Context, chatId: number, guessedUid: number
): void {
  const s = gameStates.get(chatId) as TrustBreakState | undefined;
  if (!s || s.type !== "trustbreak" || s.phase !== "guessing") {
    ctx.answerCbQuery("⚠️ انتهت مرحلة التخمين").catch(() => {}); return;
  }

  const fromId = ctx.from!.id;
  const fromUsername = ctx.from!.username;
  resolveVictimId(s.victim, fromId, fromUsername);
  if (s.victim.id !== 0) victimUserToGame.set(s.victim.id, chatId);

  if (!isVictim(s.victim, fromId, fromUsername)) {
    ctx.answerCbQuery("🚫 فقط الضحية تخمّن!").catch(() => {}); return;
  }
  if (!s.participants.has(guessedUid)) {
    ctx.answerCbQuery("⚠️ مشارك غير موجود").catch(() => {}); return;
  }

  ctx.answerCbQuery("✅").catch(() => {});
  ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});

  const harshestUid = s.harshestWriterUid!;
  const victimName = esc(dn(s.victim));
  const guessedName = esc(dn(s.participants.get(guessedUid)!));
  const harshestName = esc(dn(s.participants.get(harshestUid)!));
  const harshestText = esc(s.opinions.get(harshestUid)!);
  const correct = guessedUid === harshestUid;

  if (correct) {
    recordWin(chatId, s.victim);
    bot.telegram.sendMessage(
      chatId,
      `🎯 <b>تخمين صحيح!</b>\n\n${victimName} حسّها صح 🔥\n\nالرأي الأقسى كان فعلاً لـ <b>${guessedName}</b>!\n\n<i>"${harshestText}"</i>\n\n──────────────\n💀 <b>${guessedName}</b> صار الضحية الجولة القادمة!\n\n/score — المتصدرين  •  /play — جولة جديدة 🎮`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  } else {
    recordWin(chatId, s.participants.get(harshestUid)!);
    bot.telegram.sendMessage(
      chatId,
      `❌ <b>تخمين خاطئ!</b>\n\n${victimName} ما عرف 💀\n\nالرأي الأقسى كان لـ <b>${harshestName}</b>:\n\n<i>"${harshestText}"</i>\n\n──────────────\n🔄 <b>${victimName}</b> يكمل ضحية جولة ثانية 😈\n\n/score — المتصدرين  •  /play — جولة جديدة 🎮`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  clearGame(chatId);
}
