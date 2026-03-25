import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type RpsState, type RpsPlayer, type RpsMove, type Player,
} from "../state.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROUND_TIMEOUT_MS  = 20_000;
const CANCEL_TIMEOUT_MS = 180_000;
const REVEAL_DELAY_MS   = 2_000;

const MOVE_EMOJI: Record<RpsMove, string> = {
  rock:     "🪨",
  paper:    "📄",
  scissors: "✂️",
};

const MOVE_LABEL: Record<RpsMove, string> = {
  rock:     "الحجر",
  paper:    "الورقة",
  scissors: "المقص",
};

const DIV = "━━━━━━━━━━━━━━━━━━━━━━";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dn(p: RpsPlayer): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ")
    || (p.username ? `@${p.username}` : String(p.id));
}

function beats(a: RpsMove, b: RpsMove): boolean {
  return (
    (a === "rock"     && b === "scissors") ||
    (a === "scissors" && b === "paper")    ||
    (a === "paper"    && b === "rock")
  );
}

function beatReason(winner: RpsMove, loser: RpsMove): string {
  if (winner === "rock"     && loser === "scissors") return "🪨 الحجر يكسر المقص";
  if (winner === "scissors" && loser === "paper")    return "✂️ المقص يقص الورقة";
  if (winner === "paper"    && loser === "rock")     return "📄 الورقة تغطي الحجر";
  return "";
}

function roundsLabel(n: number): string {
  if (n === 1) return "جولة واحدة فقط";
  return `أفضل ${n} جولات`;
}

// ─── Keyboards ────────────────────────────────────────────────────────────────

function pickKeyboard(chatId: number) {
  return Markup.inlineKeyboard([[
    Markup.button.callback("🪨 حجر",  `rps:move:rock:${chatId}`),
    Markup.button.callback("📄 ورقة", `rps:move:paper:${chatId}`),
    Markup.button.callback("✂️ مقص",  `rps:move:scissors:${chatId}`),
  ]]);
}

// ─── Round ────────────────────────────────────────────────────────────────────

async function startRound(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "rps" || s.phase !== "playing" || !s.guestPlayer) return;

  s.hostMove  = null;
  s.guestMove = null;

  const hName = esc(dn(s.hostPlayer));
  const gName = esc(dn(s.guestPlayer));
  const label = s.totalRounds === 1
    ? "الجولة الوحيدة"
    : `الجولة <b>${s.currentRound}</b> من ${s.totalRounds}`;

  const text =
    `🎮 ${label}\n` +
    `<b>${DIV}</b>\n\n` +
    `${hName}  ⏳   ⚔️   ⏳  ${gName}\n\n` +
    (s.currentRound > 1 ? `📊 ${s.hostScore} — ${s.guestScore}\n\n` : "") +
    `<i>اختار حركتك بسرية 👇</i>`;

  const sent = await bot.telegram.sendMessage(chatId, text, {
    parse_mode: "HTML",
    ...pickKeyboard(chatId),
  }).catch(() => null);

  if (sent) s.mainMsgId = sent.message_id;

  if (s.roundTimeoutId) clearTimeout(s.roundTimeoutId);
  s.roundTimeoutId = setTimeout(async () => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "rps" || ss.phase !== "playing") return;
    const moves: RpsMove[] = ["rock", "paper", "scissors"];
    if (!ss.hostMove)  ss.hostMove  = moves[Math.floor(Math.random() * 3)];
    if (!ss.guestMove) ss.guestMove = moves[Math.floor(Math.random() * 3)];
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
  const hName = esc(dn(s.hostPlayer));
  const gName = esc(dn(s.guestPlayer));
  const hEmoji = MOVE_EMOJI[hMove];
  const gEmoji = MOVE_EMOJI[gMove];

  if (s.mainMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.mainMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
  }

  let resultLine = "";
  let roundWinner: "host" | "guest" | "tie" = "tie";

  if (beats(hMove, gMove)) {
    roundWinner = "host";
    s.hostScore++;
    resultLine = `\n🏆 <b>${hName}</b> يأخذ الجولة!\n<i>${beatReason(hMove, gMove)}</i>`;
  } else if (beats(gMove, hMove)) {
    roundWinner = "guest";
    s.guestScore++;
    resultLine = `\n🏆 <b>${gName}</b> يأخذ الجولة!\n<i>${beatReason(gMove, hMove)}</i>`;
  } else {
    resultLine = `\n🤝 <b>تعادل!</b> نعيد الجولة...`;
  }

  const label = s.totalRounds === 1
    ? "نتيجة الجولة الوحيدة"
    : `نتيجة الجولة ${s.currentRound}`;

  const revealText =
    `<b>${DIV}</b>\n` +
    `🎮 <b>${label}</b>\n` +
    `<b>${DIV}</b>\n\n` +
    `     ${hName}\n` +
    `  ${hEmoji}  <b>${MOVE_LABEL[hMove]}</b>     ⚔️     ${gEmoji}  <b>${MOVE_LABEL[gMove]}</b>\n` +
    `     ${gName}\n` +
    `${resultLine}\n\n` +
    `📊 <b>${hName} ${s.hostScore} — ${s.guestScore} ${gName}</b>\n` +
    `<b>${DIV}</b>`;

  await bot.telegram.sendMessage(chatId, revealText, { parse_mode: "HTML" }).catch(() => {});

  const winsNeeded = Math.ceil(s.totalRounds / 2);
  if (s.hostScore >= winsNeeded || s.guestScore >= winsNeeded) {
    setTimeout(() => endGame(bot, chatId), REVEAL_DELAY_MS);
    return;
  }

  if (roundWinner !== "tie") s.currentRound++;

  setTimeout(() => startRound(bot, chatId), REVEAL_DELAY_MS);
}

async function endGame(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "rps" || !s.guestPlayer) return;

  s.phase = "done";

  const hName = esc(dn(s.hostPlayer));
  const gName = esc(dn(s.guestPlayer));

  let champion: string;
  let loserName: string;
  let winnerObj: RpsPlayer;
  let loserObj: RpsPlayer;

  if (s.hostScore > s.guestScore) {
    champion = hName; loserName = gName;
    winnerObj = s.hostPlayer; loserObj = s.guestPlayer;
  } else {
    champion = gName; loserName = hName;
    winnerObj = s.guestPlayer; loserObj = s.hostPlayer;
  }

  const medals = ["🥇", "🥈"];
  const isHost = winnerObj.id === s.hostPlayer.id;

  const endText =
    `<b>${DIV}</b>\n` +
    `🏆 <b>انتهت اللعبة!</b>\n` +
    `<b>${DIV}</b>\n\n` +
    `${medals[0]} <b>${champion}</b> — الفائز!\n` +
    `${medals[1]} <b>${loserName}</b>\n\n` +
    `📊 النتيجة النهائية:\n` +
    `<b>${hName} ${s.hostScore} — ${s.guestScore} ${gName}</b>\n\n` +
    `🎊 تهانينا <b>${champion}</b>! 🎊\n` +
    `😤 <b>${loserName}</b> — جولة ثأر؟\n\n` +
    `<i>اكتب /play لبدء لعبة جديدة</i>`;

  await bot.telegram.sendMessage(chatId, endText, { parse_mode: "HTML" }).catch(() => {});

  const toPlayer = (p: RpsPlayer): Player => ({
    id: p.id,
    username: p.username,
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

  const hName = esc(firstName);

  const sent = await bot.telegram.sendMessage(
    chatId,
    `🪨📄✂️ <b>حجر ورقة مقص</b>\n` +
    `<b>${DIV}</b>\n\n` +
    `⚔️ <b>${hName}</b> يفتح تحدياً!\n\n` +
    `🎮 اختار عدد الجولات:`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([[
        Markup.button.callback("1 جولة",  `rps:setn:1:${chatId}`),
        Markup.button.callback("3 جولات", `rps:setn:3:${chatId}`),
        Markup.button.callback("5 جولات", `rps:setn:5:${chatId}`),
        Markup.button.callback("7 جولات", `rps:setn:7:${chatId}`),
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

  const hName = esc(dn(s.hostPlayer));

  if (s.mainMsgId) {
    await bot.telegram.editMessageText(
      chatId, s.mainMsgId, undefined,
      `🪨📄✂️ <b>حجر ورقة مقص</b>\n` +
      `<b>${DIV}</b>\n\n` +
      `⚔️ <b>${hName}</b> يتحدى القروب!\n` +
      `🏆 <b>${roundsLabel(n)}</b>\n\n` +
      `<i>انتظار المنافس... ⏳</i>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([[
          Markup.button.callback("⚔️ انضم للتحدي!", `rps:join:${chatId}`),
        ]]),
      }
    ).catch(() => {});
  }

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
    username: ctx.from!.username,
    firstName: ctx.from!.first_name ?? "",
    lastName: ctx.from!.last_name ?? "",
  };
  s.phase = "playing";

  if (s.cancelTimeoutId) { clearTimeout(s.cancelTimeoutId); s.cancelTimeoutId = undefined; }

  await ctx.answerCbQuery("✅ انضممت! حجر ورقة مقص! 🎮").catch(() => {});

  if (s.mainMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.mainMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
  }

  const hName = esc(dn(s.hostPlayer));
  const gName = esc(dn(s.guestPlayer));

  await bot.telegram.sendMessage(
    chatId,
    `🎮 <b>اللعبة بدت!</b>\n` +
    `<b>${DIV}</b>\n\n` +
    `🪨 <b>${hName}</b>\n` +
    `   ⚔️ ضد ⚔️\n` +
    `📄 <b>${gName}</b>\n\n` +
    `🏆 <b>${roundsLabel(s.totalRounds)}</b>\n\n` +
    `<i>حجر… ورقة… مقص! 🪨📄✂️</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => startRound(bot, chatId), 2000);
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

  if (!isHost && !isGuest) {
    await ctx.answerCbQuery("❌ أنت مش من اللاعبين!").catch(() => {});
    return;
  }
  if (isHost  && s.hostMove)  { await ctx.answerCbQuery(`${MOVE_EMOJI[s.hostMove]} اخترت مسبقاً!`).catch(() => {}); return; }
  if (isGuest && s.guestMove) { await ctx.answerCbQuery(`${MOVE_EMOJI[s.guestMove]} اخترت مسبقاً!`).catch(() => {}); return; }

  if (isHost)  s.hostMove  = move;
  else         s.guestMove = move;

  await ctx.answerCbQuery(`${MOVE_EMOJI[move]} اخترت ${MOVE_LABEL[move]}! انتظر خصمك... 🤫`).catch(() => {});

  if (s.mainMsgId && s.guestPlayer) {
    const hName   = esc(dn(s.hostPlayer));
    const gName   = esc(dn(s.guestPlayer));
    const hStatus = s.hostMove  ? "✅" : "⏳";
    const gStatus = s.guestMove ? "✅" : "⏳";
    const label   = s.totalRounds === 1 ? "الجولة الوحيدة" : `الجولة <b>${s.currentRound}</b> من ${s.totalRounds}`;

    bot.telegram.editMessageText(
      chatId, s.mainMsgId, undefined,
      `🎮 ${label}\n` +
      `<b>${DIV}</b>\n\n` +
      `${hName}  ${hStatus}   ⚔️   ${gStatus}  ${gName}\n\n` +
      (s.currentRound > 1 ? `📊 ${s.hostScore} — ${s.guestScore}\n\n` : "") +
      `<i>اختار حركتك بسرية 👇</i>`,
      { parse_mode: "HTML", ...pickKeyboard(chatId) }
    ).catch(() => {});
  }

  if (s.hostMove && s.guestMove) {
    await revealRound(bot, chatId);
  }
}
