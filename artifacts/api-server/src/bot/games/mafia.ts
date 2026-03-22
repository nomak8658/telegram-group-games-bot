import { Telegraf, Markup, Context } from "telegraf";
import {
  gameStates, clearGame, privateUserToGame,
  recordWin, recordGame, dn, esc,
  type MafiaState, type MafiaPlayer, type MafiaRole,
} from "../state.js";
import { getRoleCard } from "../roleCard.js";
import { logger } from "../../lib/logger.js";

// ─── Timing ────────────────────────────────────────────────────────────────────
const JOIN_MS          = 120_000;
const JOIN_WARN_MS     =  70_000;
const DISCUSS_MS       = 150_000;  // 2.5 min open discussion
const DISCUSS_WARN_MS  = 110_000;  // warn at 40s remaining
const VOTE_MS          =  60_000;
const VOTE_WARN_MS     =  25_000;
const MIN_PLAYERS      = 5;
const MAX_PLAYERS      = 15;

// ─── Roles ─────────────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<MafiaRole, string> = {
  mafia:     "مافيا 😈",
  citizen:   "مواطن 🙂",
  doctor:    "دكتور 🩺",
  detective: "محقق 🔍",
};

const ROLE_DESC: Record<MafiaRole, string> = {
  mafia:     "أنت مع المافيا — اتفقوا في السر وتلاعبوا بالتصويت دون أن تنكشفوا",
  citizen:   "اكشف المافيا عبر النقاش والتصويت",
  doctor:    "احمِ لاعباً من الإقصاء كل جولة — اختر بحكمة",
  detective: "اكشف هوية أي لاعب سراً كل جولة",
};

// ─── Role assignment ───────────────────────────────────────────────────────────
function assignRoles(count: number): MafiaRole[] {
  // Always 2 mafia (or scale for larger groups), 1 doctor, 1 detective, rest citizens
  const mafiaCount = count <= 8 ? 2 : count <= 12 ? 3 : 4;
  const roles: MafiaRole[] = [];
  for (let i = 0; i < mafiaCount; i++) roles.push("mafia");
  roles.push("doctor");
  roles.push("detective");
  while (roles.length < count) roles.push("citizen");
  // Fisher-Yates
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}

// ─── Win condition ─────────────────────────────────────────────────────────────
function checkWin(s: MafiaState): "mafia" | "citizens" | null {
  const alive      = [...s.players.values()].filter((p) => p.alive);
  const aliveMafia = alive.filter((p) => p.role === "mafia").length;
  const aliveOther = alive.filter((p) => p.role !== "mafia").length;
  if (aliveMafia === 0)          return "citizens";
  if (aliveMafia >= aliveOther)  return "mafia";
  return null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function alivePlayers(s: MafiaState) {
  return [...s.players.values()].filter((p) => p.alive);
}

function aliveListStr(s: MafiaState): string {
  return alivePlayers(s).map((p) => `• ${esc(dn(p))}`).join("\n");
}

// ─── Keyboards ─────────────────────────────────────────────────────────────────
function joinKb(chatId: number, count: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(
      count ? `🙋 أشارك  (${count})` : "🙋 أشارك في اللعبة",
      `mf:join:${chatId}`
    )],
    [Markup.button.callback("▶️ ابدأ اللعبة الآن", `mf:start:${chatId}`)],
  ]);
}

function playerActionKb(chatId: number, prefix: string, targets: MafiaPlayer[]) {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  let row: ReturnType<typeof Markup.button.callback>[] = [];
  targets.forEach((p, i) => {
    row.push(Markup.button.callback(dn(p), `${prefix}:${chatId}:${p.id}`));
    if (row.length === 2 || i === targets.length - 1) { rows.push([...row]); row = []; }
  });
  return Markup.inlineKeyboard(rows);
}

function voteKb(chatId: number, s: MafiaState) {
  const tally = new Map<number, number>();
  for (const [, t] of s.dayVotes) tally.set(t, (tally.get(t) ?? 0) + 1);
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  let row: ReturnType<typeof Markup.button.callback>[] = [];
  alivePlayers(s).forEach((p, i) => {
    const v = tally.get(p.id) ?? 0;
    row.push(Markup.button.callback(v ? `${dn(p)}  ${v} 🗳️` : dn(p), `mf:vote:${chatId}:${p.id}`));
    if (row.length === 2 || i === alivePlayers(s).length - 1) { rows.push([...row]); row = []; }
  });
  return Markup.inlineKeyboard(rows);
}

// ─── Start ─────────────────────────────────────────────────────────────────────
export function startMafia(
  bot: Telegraf, chatId: number, startedBy: number, botUsername: string
): void {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId, "⚠️ في لعبة شغالة — أوقفها أولاً بـ /stop").catch(() => {});
    return;
  }
  const s: MafiaState = {
    type: "mafia", phase: "joining",
    players: new Map(), round: 0, startedBy, chatId,
    actionsCompleted: new Set(), dayVotes: new Map(),
  };
  gameStates.set(chatId, s);

  bot.telegram.sendMessage(
    chatId,
    `🎭 <b>لعبة المافيا</b>\n\n` +
    `👥 <b>الأدوار:</b>\n` +
    `😈 مافيا — يخدعون ويتلاعبون بالتصويت\n` +
    `🩺 دكتور — يحمي لاعباً من الإقصاء كل جولة\n` +
    `🔍 محقق — يكشف هوية أي لاعب سراً\n` +
    `🙂 مواطن — يكشف المافيا بالنقاش والتصويت\n\n` +
    `🗣️ <b>اللعب كله نقاش مفتوح</b> — ما في ليل أو نهار!\n` +
    `كل جولة: نقاش حر ← تصويت ← إقصاء\n\n` +
    `⚠️ <b>مهم:</b> افتح محادثة مع @${botUsername} لتستلم دورك!\n\n` +
    `⏳ دقيقتان للانضمام  (${MIN_PLAYERS}–${MAX_PLAYERS} لاعب) 👇`,
    { parse_mode: "HTML", ...joinKb(chatId, 0) }
  ).then((msg) => {
    const cur = gameStates.get(chatId) as MafiaState | undefined;
    if (cur) cur.joinMsgId = msg.message_id;
  }).catch((e) => logger.error({ err: e }, "mafia: announce"));

  s.joinWarnTimer = setTimeout(() => {
    const cur = gameStates.get(chatId) as MafiaState | undefined;
    if (!cur || cur.phase !== "joining") return;
    bot.telegram.sendMessage(
      chatId,
      `⏱ <b>50 ثانية متبقية!</b>  المنضمون: ${cur.players.size}`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }, JOIN_WARN_MS);

  s.joinTimer = setTimeout(() => beginGame(bot, chatId, botUsername), JOIN_MS);
}

// ─── Join ──────────────────────────────────────────────────────────────────────
export function handleMafiaJoin(
  bot: Telegraf, ctx: Context, chatId: number, botUsername: string
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "mafia" || s.phase !== "joining") {
    ctx.answerCbQuery("⚠️ انتهت مرحلة الانضمام").catch(() => {}); return;
  }
  if (s.players.size >= MAX_PLAYERS) {
    ctx.answerCbQuery(`🚫 اكتمل العدد (${MAX_PLAYERS})`).catch(() => {}); return;
  }
  const uid = ctx.from!.id;
  if (s.players.has(uid)) {
    ctx.answerCbQuery("✅ أنت مسجّل بالفعل").catch(() => {}); return;
  }
  const player: MafiaPlayer = {
    id: uid,
    name: [ctx.from!.first_name, ctx.from!.last_name].filter(Boolean).join(" "),
    username: ctx.from!.username,
    role: "citizen",
    alive: true,
  };
  s.players.set(uid, player);
  privateUserToGame.set(uid, chatId);
  const count = s.players.size;
  ctx.answerCbQuery(`✅ انضممت! (${count})`).catch(() => {});

  if (s.joinMsgId)
    bot.telegram.editMessageReplyMarkup(chatId, s.joinMsgId, undefined, joinKb(chatId, count).reply_markup).catch(() => {});

  const link = `https://t.me/${botUsername}?start=mf_${chatId}`;
  bot.telegram.sendMessage(
    uid,
    `🎭 <b>المافيا</b> — انضممت!\n\nسيصلك دورك سراً قبيل البدء.\n<i>لا تكشفه لأحد 🤫</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {
    bot.telegram.sendMessage(
      chatId,
      `⚠️ <b>${esc(dn(player))}</b> — اضغط هنا لتفعيل الرسائل الخاصة:`,
      { parse_mode: "HTML", ...Markup.inlineKeyboard([[Markup.button.url("📩 فعّل", link)]]) }
    ).catch(() => {});
  });
}

// ─── Force start ───────────────────────────────────────────────────────────────
export function handleMafiaForceStart(
  bot: Telegraf, ctx: Context, chatId: number, botUsername: string
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "mafia" || s.phase !== "joining") {
    ctx.answerCbQuery("⚠️ ما في مرحلة انضمام").catch(() => {}); return;
  }
  if (ctx.from!.id !== s.startedBy) {
    ctx.answerCbQuery("🚫 فقط من بدأ اللعبة").catch(() => {}); return;
  }
  ctx.answerCbQuery("✅").catch(() => {});
  if (s.joinTimer) clearTimeout(s.joinTimer);
  if (s.joinWarnTimer) clearTimeout(s.joinWarnTimer);
  beginGame(bot, chatId, botUsername);
}

// ─── Begin game ────────────────────────────────────────────────────────────────
async function beginGame(bot: Telegraf, chatId: number, botUsername: string) {
  const s = gameStates.get(chatId) as MafiaState | undefined;
  if (!s || s.type !== "mafia" || s.phase !== "joining") return;

  if (s.joinMsgId)
    bot.telegram.editMessageReplyMarkup(chatId, s.joinMsgId, undefined, { inline_keyboard: [] }).catch(() => {});

  if (s.players.size < MIN_PLAYERS) {
    bot.telegram.sendMessage(
      chatId,
      `😔 ما كفى لاعبين (محتاج ${MIN_PLAYERS} على الأقل).\n/mafia — حاول مرة ثانية`
    ).catch(() => {});
    clearGame(chatId);
    return;
  }

  const list = [...s.players.values()];
  const roles = assignRoles(list.length);
  list.forEach((p, i) => { p.role = roles[i]; s.players.set(p.id, p); });

  recordGame(chatId, list);

  const mafiaTeam = list.filter((p) => p.role === "mafia");
  const link = `https://t.me/${botUsername}?start=mf_${chatId}`;

  // Pre-warm the card cache before the loop (avoids await inside loop being slow)
  await Promise.all(
    (["mafia", "citizen", "doctor", "detective"] as const).map((r) => getRoleCard(r).catch(() => null))
  );

  // Send role DMs with role card image
  for (const p of list) {
    let caption = `🎭 <b>${ROLE_LABEL[p.role]}</b>\n\n`;
    caption += `<i>${ROLE_DESC[p.role]}</i>\n\n`;
    if (p.role === "mafia") {
      if (mafiaTeam.length > 1) {
        const allies = mafiaTeam
          .filter((m) => m.id !== p.id)
          .map((m) => `👤 <a href="tg://user?id=${m.id}">${esc(dn(m))}</a>`)
          .join("\n");
        caption += `😈 <b>خويك في المافيا:</b>\n${allies}\n\n`;
        caption += `💬 <i>تواصل معه بالخاص وقررا من تستهدفون في التصويت!</i>\n\n`;
      } else {
        caption += `😈 <i>أنت المافيا الوحيد — اعتمد على ذكائك!</i>\n\n`;
      }
    }
    if (p.role === "doctor")
      caption += `<i>💊 ستصلك أزرار الحماية في بداية كل جولة.\nيمكنك حماية نفسك لكن ليس في جولتين متتاليتين.</i>\n\n`;
    if (p.role === "detective")
      caption += `<i>🔍 ستصلك أزرار التحقيق في بداية كل جولة.\nستعرف الدور الكامل للاعب — لا مجرد مافيا أو لا.</i>\n\n`;
    caption += `🤫 <b>لا تكشف دورك لأحد!</b>`;

    const cardBuf = await getRoleCard(p.role).catch(() => null);

    if (cardBuf) {
      bot.telegram.sendPhoto(p.id, { source: cardBuf }, { caption, parse_mode: "HTML" })
        .catch(() => {
          // Fall back to text if DM fails
          bot.telegram.sendMessage(p.id, caption, { parse_mode: "HTML" }).catch(() => {
            bot.telegram.sendMessage(
              chatId,
              `📩 <b>${esc(dn(p))}</b> — اضغط لاستلام دورك:`,
              { parse_mode: "HTML", ...Markup.inlineKeyboard([[Markup.button.url("📩 استلم دورك", link)]]) }
            ).catch(() => {});
          });
        });
    } else {
      bot.telegram.sendMessage(p.id, caption, { parse_mode: "HTML" }).catch(() => {
        bot.telegram.sendMessage(
          chatId,
          `📩 <b>${esc(dn(p))}</b> — اضغط لاستلام دورك:`,
          { parse_mode: "HTML", ...Markup.inlineKeyboard([[Markup.button.url("📩 استلم دورك", link)]]) }
        ).catch(() => {});
      });
    }
  }

  // Guard: game might have been stopped while we awaited cards
  if (gameStates.get(chatId) !== s) return;

  const mafiaCount = mafiaTeam.length;
  const playersStr = list.map((p) => `• ${esc(dn(p))}`).join("\n");

  bot.telegram.sendMessage(
    chatId,
    `🎭 <b>اللعبة بدأت!</b>\n\n` +
    `👥 اللاعبون (${list.length}):\n${playersStr}\n\n` +
    `📋 التوزيع: ${mafiaCount} مافيا + طبيب + محقق + ${list.length - mafiaCount - 2} مواطن\n\n` +
    `الأدوار وصلت سراً... استعدوا للجولة الأولى! ⚡`,
    { parse_mode: "HTML" }
  ).then(() => setTimeout(() => startRound(bot, chatId), 3500))
   .catch((e) => logger.error({ err: e }, "mafia: begin"));
}

// ─── Round (discussion + special actions) ─────────────────────────────────────
function startRound(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId) as MafiaState | undefined;
  if (!s || s.type !== "mafia") return;

  s.phase = "discussing";
  s.round++;
  s.doctorChoice = undefined;
  s.detectiveChoice = undefined;
  s.actionsCompleted = new Set();
  s.dayVotes = new Map();

  const alive   = alivePlayers(s);
  const doctor  = alive.find((p) => p.role === "doctor");
  const detect  = alive.find((p) => p.role === "detective");

  // Check win before starting new round
  const earlyWin = checkWin(s);
  if (earlyWin) { announceWinner(bot, chatId, earlyWin); return; }

  // Group message
  bot.telegram.sendMessage(
    chatId,
    `🗣️ <b>الجولة ${s.round} — النقاش الحر!</b>\n\n` +
    `👥 الأحياء (${alive.length}):\n${aliveListStr(s)}\n\n` +
    `اتهموا، دافعوا، تحدّثوا بحرية!\n` +
    (doctor ? `🩺 الدكتور يختار من يحمي سراً...\n` : ``) +
    (detect  ? `🔍 المحقق يحقق سراً...\n` : ``) +
    `\n⏳ <b>دقيقتان ونصف للنقاش</b> ثم التصويت!`,
    { parse_mode: "HTML" }
  ).catch((e) => logger.error({ err: e }, "mafia: round msg"));

  // Send special action DMs
  if (doctor) {
    bot.telegram.sendMessage(
      doctor.id,
      `🩺 <b>الجولة ${s.round} — دور الدكتور</b>\n\nمن تحمي من الإقصاء هذه الجولة؟\n<i>إذا حصل على أكثر أصوات، لن يُقصى</i>\n<i>يمكنك حماية نفسك — لكن ليس جولتين متتاليتين</i>`,
      { parse_mode: "HTML", ...playerActionKb(chatId, "mf:protect", alive) }
    ).catch(() => {});
  } else {
    s.actionsCompleted.add("doctor");
  }

  if (detect) {
    const detectTargets = alive.filter((p) => p.id !== detect.id);
    bot.telegram.sendMessage(
      detect.id,
      `🔍 <b>الجولة ${s.round} — دور المحقق</b>\n\nمن تحقق في هويته هذه الجولة؟`,
      { parse_mode: "HTML", ...playerActionKb(chatId, "mf:invest", detectTargets) }
    ).catch(() => {});
  } else {
    s.actionsCompleted.add("detective");
  }

  // Warn at 40s remaining
  s.discussWarnTimer = setTimeout(() => {
    const cur = gameStates.get(chatId) as MafiaState | undefined;
    if (!cur || cur.phase !== "discussing") return;
    bot.telegram.sendMessage(chatId, `⚡ <b>40 ثانية!</b>  استعدوا للتصويت...`, { parse_mode: "HTML" }).catch(() => {});
  }, DISCUSS_WARN_MS);

  s.discussTimer = setTimeout(() => startVoting(bot, chatId), DISCUSS_MS);
}

// ─── Doctor protect ────────────────────────────────────────────────────────────
export function handleMafiaProtect(
  bot: Telegraf, ctx: Context, chatId: number, targetUid: number
): void {
  const s = gameStates.get(chatId) as MafiaState | undefined;
  if (!s || s.type !== "mafia" || s.phase !== "discussing") {
    ctx.answerCbQuery("⚠️ ليس وقت الحماية الآن").catch(() => {}); return;
  }
  const doctor = s.players.get(ctx.from!.id);
  if (!doctor || doctor.role !== "doctor" || !doctor.alive) {
    ctx.answerCbQuery("🚫 لست الدكتور").catch(() => {}); return;
  }
  const target = s.players.get(targetUid);
  if (!target || !target.alive) {
    ctx.answerCbQuery("🚫 هدف غير صالح").catch(() => {}); return;
  }

  // Self-protect cooldown: can't do it two consecutive rounds
  if (targetUid === doctor.id) {
    const lastSelf = s.doctorLastSelfProtectRound;
    if (lastSelf !== undefined && s.round === lastSelf + 1) {
      ctx.answerCbQuery("🚫 لا يمكنك حماية نفسك جولتين متتاليتين!").catch(() => {}); return;
    }
    s.doctorLastSelfProtectRound = s.round;
  }

  s.doctorChoice = targetUid;
  s.actionsCompleted.add("doctor");
  ctx.answerCbQuery(`✅ ستحمي ${dn(target)} هذه الجولة`).catch(() => {});

  const selfMsg = targetUid === doctor.id ? "\n<i>(اخترت حماية نفسك!)</i>" : "";
  bot.telegram.sendMessage(
    doctor.id,
    `🩺 اخترت حماية <b>${esc(dn(target))}</b>${selfMsg}\n<i>إذا حاولوا إقصاءه — ستنقذه!</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});
}

// ─── Detective investigate ─────────────────────────────────────────────────────
export function handleMafiaInvestigate(
  bot: Telegraf, ctx: Context, chatId: number, targetUid: number
): void {
  const s = gameStates.get(chatId) as MafiaState | undefined;
  if (!s || s.type !== "mafia" || s.phase !== "discussing") {
    ctx.answerCbQuery("⚠️ ليس وقت التحقيق الآن").catch(() => {}); return;
  }
  const detective = s.players.get(ctx.from!.id);
  if (!detective || detective.role !== "detective" || !detective.alive) {
    ctx.answerCbQuery("🚫 لست المحقق").catch(() => {}); return;
  }
  const target = s.players.get(targetUid);
  if (!target || !target.alive || target.id === detective.id) {
    ctx.answerCbQuery("🚫 هدف غير صالح").catch(() => {}); return;
  }

  s.detectiveChoice = targetUid;
  s.actionsCompleted.add("detective");
  ctx.answerCbQuery(`🔎 جاري التحقيق...`).catch(() => {});

  const roleEmoji: Partial<Record<MafiaRole, string>> = {
    mafia:     "😈",
    doctor:    "🩺",
    detective: "🔍",
    citizen:   "🙂",
  };
  const roleNameAr: Partial<Record<MafiaRole, string>> = {
    mafia:     "مافيا",
    doctor:    "دكتور",
    detective: "محقق",
    citizen:   "مواطن",
  };
  const roleHint: Partial<Record<MafiaRole, string>> = {
    mafia:     "استخدم هذه المعلومة بذكاء لفضحه في النقاش! 🎯",
    doctor:    "الطبيب يحمي الآخرين — ليس عدوك.",
    detective: "محقق آخر! تعاونا سراً.",
    citizen:   "مواطن بريء.",
  };

  bot.telegram.sendMessage(
    detective.id,
    `🔵 <b>نتيجة التحقيق في ${esc(dn(target))}:</b>\n\n` +
    `${roleEmoji[target.role] ?? "❓"} <b>${roleNameAr[target.role] ?? target.role}</b>\n\n` +
    `<i>${roleHint[target.role] ?? ""}</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});
}

// ─── Voting ────────────────────────────────────────────────────────────────────
function startVoting(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId) as MafiaState | undefined;
  if (!s || s.type !== "mafia" || s.phase !== "discussing") return;

  if (s.discussTimer) clearTimeout(s.discussTimer);
  if (s.discussWarnTimer) clearTimeout(s.discussWarnTimer);

  s.phase = "voting";
  s.dayVotes = new Map();

  bot.telegram.sendMessage(
    chatId,
    `🗳️ <b>التصويت بدأ!</b>\n\n` +
    `من تشك أنه مافيا؟ صوّتوا لإقصائه!\n` +
    `<i>أكثر واحد أصوات يطلع من اللعبة\nالتعادل = لا أحد يُقصى</i>\n\n` +
    `⏳ دقيقة واحدة 👇`,
    { parse_mode: "HTML", ...voteKb(chatId, s) }
  ).then((msg) => {
    const cur = gameStates.get(chatId) as MafiaState | undefined;
    if (cur) cur.dayVoteMsgId = msg.message_id;
  }).catch((e) => logger.error({ err: e }, "mafia: vote msg"));

  s.voteWarnTimer = setTimeout(() => {
    bot.telegram.sendMessage(chatId, `⚡ <b>25 ثانية!</b>  سارعوا بالتصويت!`, { parse_mode: "HTML" }).catch(() => {});
  }, VOTE_WARN_MS);

  s.voteTimer = setTimeout(() => resolveVoting(bot, chatId), VOTE_MS);
}

export function handleMafiaVote(
  bot: Telegraf, ctx: Context, chatId: number, targetUid: number
): void {
  const s = gameStates.get(chatId) as MafiaState | undefined;
  if (!s || s.type !== "mafia" || s.phase !== "voting") {
    ctx.answerCbQuery("⚠️ التصويت غير نشط حالياً").catch(() => {}); return;
  }
  const voter = s.players.get(ctx.from!.id);
  if (!voter || !voter.alive) {
    ctx.answerCbQuery("🚫 فقط الأحياء يصوتون").catch(() => {}); return;
  }
  if (voter.id === targetUid) {
    ctx.answerCbQuery("🚫 لا تصوت على نفسك").catch(() => {}); return;
  }
  const target = s.players.get(targetUid);
  if (!target || !target.alive) {
    ctx.answerCbQuery("🚫 هدف غير صالح").catch(() => {}); return;
  }

  const prev = s.dayVotes.get(voter.id);
  s.dayVotes.set(voter.id, targetUid);
  const changed = prev !== undefined && prev !== targetUid;
  ctx.answerCbQuery(changed ? `🔄 غيّرت صوتك` : `✅ صوّتت لـ ${dn(target)}`).catch(() => {});

  if (s.dayVoteMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.dayVoteMsgId, undefined, voteKb(chatId, s).reply_markup).catch(() => {});
  }
}

// ─── Resolve voting ────────────────────────────────────────────────────────────
function resolveVoting(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId) as MafiaState | undefined;
  if (!s || s.type !== "mafia" || s.phase !== "voting") return;

  if (s.voteTimer)    clearTimeout(s.voteTimer);
  if (s.voteWarnTimer) clearTimeout(s.voteWarnTimer);
  if (s.dayVoteMsgId)
    bot.telegram.editMessageReplyMarkup(chatId, s.dayVoteMsgId, undefined, { inline_keyboard: [] }).catch(() => {});

  // Tally
  const tally = new Map<number, number>();
  for (const [, t] of s.dayVotes) tally.set(t, (tally.get(t) ?? 0) + 1);

  let maxVotes = 0, topUid: number | null = null, tie = false;
  for (const [uid, cnt] of tally) {
    if (cnt > maxVotes) { maxVotes = cnt; topUid = uid; tie = false; }
    else if (cnt === maxVotes) tie = true;
  }

  // No votes or tie → no elimination
  if (!topUid || tie || maxVotes === 0) {
    bot.telegram.sendMessage(
      chatId,
      `⚖️ <b>الأصوات متعادلة!</b>\n\nلم يُقصَ أحد هذه الجولة.\n\n<i>المافيا تستغل الفرصة... استعدوا للجولة القادمة!</i>`,
      { parse_mode: "HTML" }
    ).then(() => setTimeout(() => startRound(bot, chatId), 3000)).catch(() => {});
    return;
  }

  const target = s.players.get(topUid)!;

  // Check doctor protection
  if (s.doctorChoice === topUid) {
    bot.telegram.sendMessage(
      chatId,
      `🛡️ <b>الطبيب تدخّل!</b>\n\n<b>${esc(dn(target))}</b> كان الأكثر تصويتاً بـ ${maxVotes}...\n` +
      `لكن الطبيب حماه — نجا من الإقصاء! 🩺✨\n\n` +
      `<i>الجولة القادمة تبدأ الآن...</i>`,
      { parse_mode: "HTML" }
    ).then(() => {
      const win = checkWin(s);
      if (win) announceWinner(bot, chatId, win);
      else setTimeout(() => startRound(bot, chatId), 3000);
    }).catch(() => {});
    return;
  }

  // Eliminate
  target.alive = false;
  const isMafia = target.role === "mafia";

  bot.telegram.sendMessage(
    chatId,
    `⚖️ <b>قرار القروب:</b>\n\n` +
    `<b>${esc(dn(target))}</b> يُقصى بـ <b>${maxVotes} أصوات!</b>\n\n` +
    `🎭 دوره كان: <b>${ROLE_LABEL[target.role]}</b>\n\n` +
    (isMafia
      ? `✅ <b>أصبتم! ضربة للمافيا 💥</b>`
      : `😔 <b>كان بريئاً...</b>\n<i>المافيا تضحك في الخفاء 😈</i>`),
    { parse_mode: "HTML" }
  ).then(() => {
    setTimeout(() => {
      const win = checkWin(s);
      if (win) announceWinner(bot, chatId, win);
      else startRound(bot, chatId);
    }, 2500);
  }).catch((e) => logger.error({ err: e }, "mafia: eliminate"));
}

// ─── Win ───────────────────────────────────────────────────────────────────────
function announceWinner(bot: Telegraf, chatId: number, winner: "mafia" | "citizens") {
  const s = gameStates.get(chatId) as MafiaState | undefined;
  if (!s || s.type !== "mafia") return;
  s.phase = "done";

  const mafiaTeam  = [...s.players.values()].filter((p) => p.role === "mafia");
  const mafiaNames = mafiaTeam.map((p) => `• ${esc(dn(p))}`).join("\n");

  if (winner === "citizens") {
    const citizens = [...s.players.values()].filter((p) => p.role !== "mafia");
    for (const p of citizens) recordWin(chatId, p);

    bot.telegram.sendMessage(
      chatId,
      `🏆 <b>انتهت اللعبة!</b>\n\n` +
      `🎉 <b>فاز المواطنون!</b>\n\n` +
      `كشفوا المافيا وأنقذوا القروب 🌟\n\n` +
      `😈 المافيا كانوا:\n${mafiaNames}\n\n` +
      `/score — المتصدرون  •  /mafia — جولة جديدة`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  } else {
    for (const p of mafiaTeam) recordWin(chatId, p);

    bot.telegram.sendMessage(
      chatId,
      `🏆 <b>انتهت اللعبة!</b>\n\n` +
      `😈 <b>فازت المافيا!</b>\n\n` +
      `تمكنوا من إخضاع القروب دون أن يُكشفوا...\n\n` +
      `😈 المافيا كانوا:\n${mafiaNames}\n\n` +
      `/score — المتصدرون  •  /mafia — جولة جديدة`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  clearGame(chatId);
}
