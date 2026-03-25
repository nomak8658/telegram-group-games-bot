import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type RpsState, type RpsPlayer, type RpsMove, type Player,
} from "../state.js";
import {
  generateRpsChallengeCard, generateRpsRoundCard,
  generateRpsRevealCard, generateRpsWinnerCard,
} from "../rpsCard.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROUND_TIMEOUT_MS  = 25_000;
const CANCEL_TIMEOUT_MS = 180_000;
const NEXT_ROUND_DELAY  = 2_800;

const MOVE_EMOJI: Record<RpsMove, string> = { rock: "🪨", paper: "📄", scissors: "✂️" };
const MOVE_LABEL: Record<RpsMove, string> = { rock: "الحجر", paper: "الورقة", scissors: "المقص" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dn(p: RpsPlayer): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ")
    || (p.username ? `@${p.username}` : String(p.id));
}

function beats(a: RpsMove, b: RpsMove): boolean {
  return (a === "rock" && b === "scissors") ||
         (a === "scissors" && b === "paper") ||
         (a === "paper"    && b === "rock");
}

function beatReason(w: RpsMove, l: RpsMove): string {
  if (w === "rock"     && l === "scissors") return "🪨 الحجر يكسر المقص";
  if (w === "scissors" && l === "paper")    return "✂️ المقص يقص الورقة";
  if (w === "paper"    && l === "rock")     return "📄 الورقة تغطي الحجر";
  return "";
}

function roundsLabel(n: number): string {
  return n === 1 ? "جولة واحدة فقط" : `أفضل ${n} جولات`;
}

function pickKeyboard(chatId: number) {
  return Markup.inlineKeyboard([[
    Markup.button.callback("🪨 حجر",  `rps:move:rock:${chatId}`),
    Markup.button.callback("📄 ورقة", `rps:move:paper:${chatId}`),
    Markup.button.callback("✂️ مقص",  `rps:move:scissors:${chatId}`),
  ]]);
}

// ─── Round logic ──────────────────────────────────────────────────────────────

async function startRound(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "rps" || s.phase !== "playing" || !s.guestPlayer) return;

  s.hostMove  = null;
  s.guestMove = null;

  const hName = dn(s.hostPlayer);
  const gName = dn(s.guestPlayer);
  const caption =
    `🎮 <b>الجولة ${s.currentRound}</b>  —  ${s.totalRounds === 1 ? "جولة واحدة" : `أفضل ${s.totalRounds} جولات`}\n` +
    `<b>${esc(hName)}</b>  ⚔️  <b>${esc(gName)}</b>\n\n` +
    `<i>اختار حركتك بسرية 👇</i>`;

  let buf: Buffer | null = null;
  try {
    buf = await generateRpsRoundCard(
      hName, gName,
      s.currentRound, s.totalRounds,
      s.hostScore, s.guestScore,
    );
  } catch { /* canvas fallback */ }

  let sent: { message_id: number } | null = null;
  if (buf) {
    sent = await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption, parse_mode: "HTML",
      ...pickKeyboard(chatId),
    }).catch(() => null);
  } else {
    sent = await bot.telegram.sendMessage(chatId, caption, {
      parse_mode: "HTML",
      ...pickKeyboard(chatId),
    }).catch(() => null);
  }

  if (sent) s.mainMsgId = sent.message_id;

  if (s.roundTimeoutId) clearTimeout(s.roundTimeoutId);
  s.roundTimeoutId = setTimeout(async () => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "rps" || ss.phase !== "playing") return;
    const pool: RpsMove[] = ["rock", "paper", "scissors"];
    if (!ss.hostMove)  ss.hostMove  = pool[Math.floor(Math.random() * 3)];
    if (!ss.guestMove) ss.guestMove = pool[Math.floor(Math.random() * 3)];
    await revealRound(bot, chatId);
  }, ROUND_TIMEOUT_MS);
}

async function revealRound(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "rps" || s.phase !== "playing") return;
  if (!s.hostMove || !s.guestMove || !s.guestPlayer)   return;

  if (s.roundTimeoutId) { clearTimeout(s.roundTimeoutId); s.roundTimeoutId = undefined; }

  const hMove = s.hostMove;
  const gMove = s.guestMove;
  const hName = dn(s.hostPlayer);
  const gName = dn(s.guestPlayer);

  // Remove pick buttons from round card
  if (s.mainMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.mainMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
    s.mainMsgId = null;
  }

  let winnerSide: "host" | "guest" | "tie" = "tie";
  let resultCaption = "";

  if (beats(hMove, gMove)) {
    winnerSide = "host";
    s.hostScore++;
    resultCaption = `🏆 <b>${esc(hName)}</b> يأخذ الجولة!\n<i>${beatReason(hMove, gMove)}</i>`;
  } else if (beats(gMove, hMove)) {
    winnerSide = "guest";
    s.guestScore++;
    resultCaption = `🏆 <b>${esc(gName)}</b> يأخذ الجولة!\n<i>${beatReason(gMove, hMove)}</i>`;
  } else {
    resultCaption = `🤝 <b>تعادل!</b> — نعيد الجولة...`;
  }

  const fullCaption =
    `${MOVE_EMOJI[hMove]} <b>${esc(hName)}</b>  ⚔️  <b>${esc(gName)}</b> ${MOVE_EMOJI[gMove]}\n\n` +
    `${resultCaption}\n\n` +
    `📊 ${s.hostScore} — ${s.guestScore}`;

  // Send reveal card
  let buf: Buffer | null = null;
  try {
    buf = await generateRpsRevealCard(
      hName, gName, hMove, gMove,
      s.hostScore, s.guestScore,
      s.currentRound, s.totalRounds, winnerSide,
    );
  } catch { /* canvas fallback */ }

  if (buf) {
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption: fullCaption, parse_mode: "HTML",
    }).catch(() => {});
  } else {
    await bot.telegram.sendMessage(chatId, fullCaption, { parse_mode: "HTML" }).catch(() => {});
  }

  const winsNeeded = Math.ceil(s.totalRounds / 2);
  if (s.hostScore >= winsNeeded || s.guestScore >= winsNeeded) {
    setTimeout(() => endGame(bot, chatId), NEXT_ROUND_DELAY);
    return;
  }

  if (winnerSide !== "tie") s.currentRound++;

  setTimeout(() => startRound(bot, chatId), NEXT_ROUND_DELAY);
}

async function endGame(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "rps" || !s.guestPlayer) return;

  s.phase = "done";

  const hName = dn(s.hostPlayer);
  const gName = dn(s.guestPlayer);

  let winnerObj: RpsPlayer;
  let loserObj:  RpsPlayer;
  let winnerScore: number;
  let loserScore:  number;

  if (s.hostScore > s.guestScore) {
    winnerObj = s.hostPlayer; loserObj = s.guestPlayer;
    winnerScore = s.hostScore; loserScore = s.guestScore;
  } else {
    winnerObj = s.guestPlayer; loserObj = s.hostPlayer;
    winnerScore = s.guestScore; loserScore = s.hostScore;
  }

  const wName = dn(winnerObj);
  const lName = dn(loserObj);

  const caption =
    `🏆 <b>${esc(wName)}</b> يفوز باللعبة!\n` +
    `📊 النتيجة: <b>${esc(hName)} ${s.hostScore} — ${s.guestScore} ${esc(gName)}</b>\n\n` +
    `🎊 تهانينا! جولة ثأر؟  /rps`;

  let buf: Buffer | null = null;
  try {
    buf = await generateRpsWinnerCard(wName, lName, winnerScore, loserScore);
  } catch { /* canvas fallback */ }

  if (buf) {
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption, parse_mode: "HTML",
    }).catch(() => {});
  } else {
    await bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
  }

  const toPlayer = (p: RpsPlayer): Player => ({
    id: p.id, username: p.username,
    name: [p.firstName, p.lastName].filter(Boolean).join(" ") || (p.username ? `@${p.username}` : String(p.id)),
  });

  recordWin(chatId,  toPlayer(winnerObj));
  recordGame(chatId, [toPlayer(loserObj)]);

  clearGame(chatId);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startRps(
  bot: Telegraf,
  chatId: number,
  hostId: number,
  username: string | undefined,
  firstName: string,
  lastName: string,
): Promise<void> {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId, "⚠️ في لعبة شغالة! اكتب /stop لإيقافها.", { parse_mode: "HTML" }).catch(() => {});
    return;
  }

  const host: RpsPlayer = { id: hostId, username, firstName, lastName };

  const s: RpsState = {
    type: "rps", phase: "waiting", chatId,
    hostPlayer: host, guestPlayer: null,
    hostScore: 0, guestScore: 0,
    totalRounds: 3, currentRound: 1,
    hostMove: null, guestMove: null,
    mainMsgId: null,
  };

  gameStates.set(chatId, s);

  const sent = await bot.telegram.sendMessage(
    chatId,
    `🪨📄✂️ <b>حجر ورقة مقص</b>\n\n` +
    `⚔️ <b>${esc(firstName)}</b> يفتح تحدياً!\n\n` +
    `🎮 اختار عدد الجولات:`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([[
        Markup.button.callback("1️⃣",  `rps:setn:1:${chatId}`),
        Markup.button.callback("3",   `rps:setn:3:${chatId}`),
        Markup.button.callback("5",   `rps:setn:5:${chatId}`),
        Markup.button.callback("7",   `rps:setn:7:${chatId}`),
      ]]),
    }
  ).catch(() => null);

  if (sent) s.mainMsgId = sent.message_id;
}

export async function handleRpsSetRounds(
  bot: Telegraf,
  ctx: Context,
  chatId: number,
  n: number,
): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "rps" || s.phase !== "waiting") {
    await ctx.answerCbQuery("⚠️ اللعبة مو في مرحلة الاختيار").catch(() => {});
    return;
  }
  if (ctx.from!.id !== s.hostPlayer.id) {
    await ctx.answerCbQuery("فقط من فتح التحدي يختار الجولات!").catch(() => {});
    return;
  }

  s.totalRounds = n;
  await ctx.answerCbQuery(`✅ ${n === 1 ? "جولة واحدة" : n + " جولات"}!`).catch(() => {});

  // Delete old text message
  if (s.mainMsgId) {
    bot.telegram.deleteMessage(chatId, s.mainMsgId).catch(() => {});
    s.mainMsgId = null;
  }

  const hName = dn(s.hostPlayer);

  // Generate and send challenge card photo + join button
  let buf: Buffer | null = null;
  try { buf = await generateRpsChallengeCard(hName, n); } catch { /* fallback */ }

  const joinKeyboard = Markup.inlineKeyboard([[
    Markup.button.callback("⚔️ انضم للتحدي!", `rps:join:${chatId}`),
  ]]);

  let sent: { message_id: number } | null = null;
  if (buf) {
    sent = await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption:
        `🪨📄✂️ <b>حجر ورقة مقص</b>\n` +
        `<b>${esc(hName)}</b> يتحدى القروب!\n` +
        `🏆 <b>${roundsLabel(n)}</b>\n\n` +
        `<i>انتظار المنافس... ⏳</i>`,
      parse_mode: "HTML",
      ...joinKeyboard,
    }).catch(() => null);
  } else {
    sent = await bot.telegram.sendMessage(chatId,
      `🪨📄✂️ <b>حجر ورقة مقص</b>\n` +
      `<b>${esc(hName)}</b> يتحدى القروب!\n` +
      `🏆 <b>${roundsLabel(n)}</b>\n\n` +
      `<i>انتظار المنافس... ⏳</i>`,
      { parse_mode: "HTML", ...joinKeyboard }
    ).catch(() => null);
  }

  if (sent) s.mainMsgId = sent.message_id;

  // Auto-cancel if no one joins
  s.cancelTimeoutId = setTimeout(() => {
    const ss = gameStates.get(chatId);
    if (ss?.type === "rps" && ss.phase === "waiting") {
      if (ss.mainMsgId) {
        bot.telegram.editMessageReplyMarkup(chatId, ss.mainMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
      }
      bot.telegram.sendMessage(chatId, `⏰ <b>انتهى وقت التحدي</b> — ما انضم أحد!`, { parse_mode: "HTML" }).catch(() => {});
      clearGame(chatId);
    }
  }, CANCEL_TIMEOUT_MS);
}

export async function handleRpsJoin(
  bot: Telegraf,
  ctx: Context,
  chatId: number,
): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "rps" || s.phase !== "waiting") {
    await ctx.answerCbQuery("⚠️ التحدي مو متاح الحين").catch(() => {});
    return;
  }

  const uid = ctx.from!.id;
  if (uid === s.hostPlayer.id) {
    await ctx.answerCbQuery("🚫 ما تقدر تتحدى نفسك!").catch(() => {});
    return;
  }

  s.guestPlayer = {
    id: uid,
    username:  ctx.from!.username,
    firstName: ctx.from!.first_name ?? "",
    lastName:  ctx.from!.last_name  ?? "",
  };
  s.phase = "playing";

  if (s.cancelTimeoutId) { clearTimeout(s.cancelTimeoutId); s.cancelTimeoutId = undefined; }

  await ctx.answerCbQuery("✅ انضممت! حجر ورقة مقص!").catch(() => {});

  // Remove join button from challenge card
  if (s.mainMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.mainMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
    s.mainMsgId = null;
  }

  const hName = esc(dn(s.hostPlayer));
  const gName = esc(dn(s.guestPlayer));

  await bot.telegram.sendMessage(
    chatId,
    `⚔️ <b>اللعبة بدت!</b>\n\n` +
    `🔵 <b>${hName}</b>  ضد  <b>${gName}</b> 🟣\n` +
    `🏆 <b>${roundsLabel(s.totalRounds)}</b>\n\n` +
    `<i>حجر… ورقة… مقص! 🪨📄✂️</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => startRound(bot, chatId), 2200);
}

export async function handleRpsMove(
  bot: Telegraf,
  ctx: Context,
  chatId: number,
  move: RpsMove,
): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "rps" || s.phase !== "playing" || !s.guestPlayer) {
    await ctx.answerCbQuery("⚠️ ما في جولة نشطة").catch(() => {});
    return;
  }

  const uid     = ctx.from!.id;
  const isHost  = uid === s.hostPlayer.id;
  const isGuest = uid === s.guestPlayer.id;

  if (!isHost && !isGuest) { await ctx.answerCbQuery("❌ أنت مش من اللاعبين!").catch(() => {}); return; }
  if (isHost  && s.hostMove)  { await ctx.answerCbQuery(`${MOVE_EMOJI[s.hostMove]} اخترت مسبقاً!`).catch(() => {}); return; }
  if (isGuest && s.guestMove) { await ctx.answerCbQuery(`${MOVE_EMOJI[s.guestMove]} اخترت مسبقاً!`).catch(() => {}); return; }

  if (isHost)  s.hostMove  = move;
  else         s.guestMove = move;

  await ctx.answerCbQuery(`${MOVE_EMOJI[move]} اخترت ${MOVE_LABEL[move]}! انتظر خصمك... 🤫`).catch(() => {});

  // Update round card caption to show who picked (✅/⏳)
  if (s.mainMsgId && s.guestPlayer) {
    const hName  = esc(dn(s.hostPlayer));
    const gName  = esc(dn(s.guestPlayer));
    const hSt    = s.hostMove  ? "✅" : "⏳";
    const gSt    = s.guestMove ? "✅" : "⏳";
    const lbl    = s.totalRounds === 1 ? "الجولة الوحيدة" : `الجولة ${s.currentRound}`;

    const newCaption =
      `🎮 <b>${lbl}</b>\n` +
      `<b>${hName}</b>  ${hSt}   ⚔️   ${gSt}  <b>${gName}</b>\n\n` +
      (s.currentRound > 1 ? `📊 ${s.hostScore} — ${s.guestScore}\n\n` : "") +
      `<i>اختار حركتك بسرية 👇</i>`;

    bot.telegram.editMessageCaption(chatId, s.mainMsgId, undefined, newCaption, {
      parse_mode: "HTML",
      ...pickKeyboard(chatId),
    }).catch(() => {
      // fallback: maybe it's a text message
      bot.telegram.editMessageText(chatId, s.mainMsgId!, undefined, newCaption, {
        parse_mode: "HTML",
        ...pickKeyboard(chatId),
      }).catch(() => {});
    });
  }

  if (s.hostMove && s.guestMove) {
    await revealRound(bot, chatId);
  }
}
