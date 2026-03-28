import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type XoState, type XoPlayer, type XoBoard, type XoCell, type Player,
} from "../state.js";
import {
  generateXoChallengeCard, generateXoBoardCard,
  generateXoWinnerCard, generateXoDrawCard,
} from "../xoCard.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const TURN_TIMEOUT_MS   = 45_000;
const CANCEL_TIMEOUT_MS = 180_000;

const WIN_LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dn(p: XoPlayer): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ")
    || (p.username ? `@${p.username}` : String(p.id));
}

function checkWin(board: XoBoard): [number, number, number] | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return line;
  }
  return null;
}

function isDraw(board: XoBoard): boolean {
  return board.every((c) => c !== null);
}

function boardKeyboard(chatId: number, board: XoBoard) {
  const rows = [];
  for (let row = 0; row < 3; row++) {
    const cols = [];
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      const cell = board[idx];
      const label = cell === "X" ? "✕" : cell === "O" ? "○" : "·";
      const data  = cell ? `xo:noop:${chatId}` : `xo:move:${idx}:${chatId}`;
      cols.push(Markup.button.callback(label, data));
    }
    rows.push(cols);
  }
  return Markup.inlineKeyboard(rows);
}

function toPlayerObj(p: XoPlayer): Player {
  return {
    id: p.id,
    username: p.username,
    name: dn(p),
  };
}

// ─── Board caption ─────────────────────────────────────────────────────────────

function boardCaption(s: XoState): string {
  if (!s.guestPlayer) return "";
  const hName = esc(dn(s.hostPlayer));
  const gName = esc(dn(s.guestPlayer));
  const turnName = s.currentTurn === "host" ? hName : gName;
  const turnSym  = s.currentTurn === "host" ? s.hostSymbol : s.guestSymbol;
  return (
    `✕○ <b>أكس أو</b>\n` +
    `<b>${hName}</b> ${s.hostSymbol}  ضد  ${s.guestSymbol} <b>${gName}</b>\n\n` +
    `⏳ دور <b>${turnName}</b> — يلعب <b>${turnSym}</b>`
  );
}

// ─── Turn timeout ──────────────────────────────────────────────────────────────

function setTurnTimeout(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "xo") return;
  if (s.turnTimeoutId) clearTimeout(s.turnTimeoutId);

  s.turnTimeoutId = setTimeout(async () => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "xo" || ss.phase !== "playing") return;

    const emptyIdxs = ss.board.map((c, i) => c === null ? i : -1).filter(i => i >= 0);
    if (emptyIdxs.length === 0) return;

    const randIdx = emptyIdxs[Math.floor(Math.random() * emptyIdxs.length)];
    const sym = ss.currentTurn === "host" ? ss.hostSymbol : ss.guestSymbol;

    await bot.telegram.sendMessage(
      chatId,
      `⏰ <b>انتهى الوقت!</b> — ينتقل الدور تلقائياً...`,
      { parse_mode: "HTML" }
    ).catch(() => {});

    await playMove(bot, chatId, ss.currentTurn === "host" ? ss.hostPlayer.id : ss.guestPlayer!.id, randIdx);
  }, TURN_TIMEOUT_MS);
}

// ─── Play a move ───────────────────────────────────────────────────────────────

async function playMove(bot: Telegraf, chatId: number, playerId: number, idx: number) {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "xo" || s.phase !== "playing" || !s.guestPlayer) return;

  const isHost  = playerId === s.hostPlayer.id;
  const isGuest = playerId === s.guestPlayer.id;
  if (!isHost && !isGuest) return;
  if (isHost && s.currentTurn !== "host")   return;
  if (isGuest && s.currentTurn !== "guest") return;
  if (s.board[idx] !== null) return;

  if (s.turnTimeoutId) { clearTimeout(s.turnTimeoutId); s.turnTimeoutId = undefined; }

  const sym = isHost ? s.hostSymbol : s.guestSymbol;
  const newBoard = [...s.board] as XoBoard;
  newBoard[idx] = sym;
  s.board = newBoard;

  const winLine = checkWin(newBoard);
  const draw    = !winLine && isDraw(newBoard);

  if (winLine) {
    s.phase = "done";
    const winner = isHost ? s.hostPlayer : s.guestPlayer;
    const loser  = isHost ? s.guestPlayer : s.hostPlayer;
    const wName  = dn(winner);
    const lName  = dn(loser);

    const caption =
      `🏆 <b>${esc(wName)}</b> يفوز!\n` +
      `لعبة رائعة  🎊  جولة ثأر؟ /xo`;

    let buf: Buffer | null = null;
    try {
      buf = await generateXoWinnerCard(wName, lName, sym, newBoard, winLine);
    } catch { /* fallback */ }

    if (s.mainMsgId) {
      bot.telegram.editMessageReplyMarkup(chatId, s.mainMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
      s.mainMsgId = null;
    }

    if (buf) {
      await bot.telegram.sendPhoto(chatId, { source: buf }, { caption, parse_mode: "HTML" }).catch(() => {});
    } else {
      await bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
    }

    recordWin(chatId,  toPlayerObj(winner));
    recordGame(chatId, [toPlayerObj(loser)]);
    clearGame(chatId);
    return;
  }

  if (draw) {
    s.phase = "done";
    const caption = `🤝 <b>تعادل!</b> — ما كسب أحد! /xo`;

    let buf: Buffer | null = null;
    try { buf = await generateXoDrawCard(dn(s.hostPlayer), dn(s.guestPlayer), newBoard); } catch { /* fallback */ }

    if (s.mainMsgId) {
      bot.telegram.editMessageReplyMarkup(chatId, s.mainMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
      s.mainMsgId = null;
    }

    if (buf) {
      await bot.telegram.sendPhoto(chatId, { source: buf }, { caption, parse_mode: "HTML" }).catch(() => {});
    } else {
      await bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
    }

    recordGame(chatId, [toPlayerObj(s.hostPlayer), toPlayerObj(s.guestPlayer)]);
    clearGame(chatId);
    return;
  }

  s.currentTurn = s.currentTurn === "host" ? "guest" : "host";

  let buf: Buffer | null = null;
  try {
    buf = await generateXoBoardCard(
      dn(s.hostPlayer), dn(s.guestPlayer),
      s.hostSymbol, newBoard, s.currentTurn, null,
    );
  } catch { /* fallback */ }

  const cap = boardCaption(s);
  const kb  = boardKeyboard(chatId, newBoard);

  if (s.mainMsgId) {
    if (buf) {
      bot.telegram.editMessageMedia(
        chatId, s.mainMsgId, undefined,
        { type: "photo", media: { source: buf }, caption: cap, parse_mode: "HTML" } as any,
        kb as any,
      ).catch(async () => {
        const sent = await bot.telegram.sendPhoto(
          chatId, { source: buf! },
          { caption: cap, parse_mode: "HTML", ...kb }
        ).catch(() => null);
        if (sent) s.mainMsgId = sent.message_id;
      });
    } else {
      bot.telegram.editMessageText(chatId, s.mainMsgId, undefined, cap, {
        parse_mode: "HTML", ...kb,
      }).catch(() => {});
    }
  } else {
    if (buf) {
      const sent = await bot.telegram.sendPhoto(chatId, { source: buf },
        { caption: cap, parse_mode: "HTML", ...kb }).catch(() => null);
      if (sent) s.mainMsgId = sent.message_id;
    } else {
      const sent = await bot.telegram.sendMessage(chatId, cap,
        { parse_mode: "HTML", ...kb }).catch(() => null);
      if (sent) s.mainMsgId = sent.message_id;
    }
  }

  setTurnTimeout(bot, chatId);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startXo(
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

  const host: XoPlayer = { id: hostId, username, firstName, lastName };

  const s: XoState = {
    type: "xo", phase: "waiting", chatId,
    hostPlayer: host, guestPlayer: null,
    board: [null, null, null, null, null, null, null, null, null],
    currentTurn: "host",
    hostSymbol: "X",
    guestSymbol: "O",
    mainMsgId: null,
  };

  gameStates.set(chatId, s);

  const hName = dn(host);

  let buf: Buffer | null = null;
  try { buf = await generateXoChallengeCard(hName); } catch { /* fallback */ }

  const joinKb = Markup.inlineKeyboard([[
    Markup.button.callback("⚔️ انضم والعب!", `xo:join:${chatId}`),
  ]]);

  const caption =
    `✕○ <b>أكس أو</b>\n` +
    `<b>${esc(hName)}</b> يتحدى القروب!\n\n` +
    `<i>انتظار منافس... ⏳</i>`;

  let sent: { message_id: number } | null = null;
  if (buf) {
    sent = await bot.telegram.sendPhoto(chatId, { source: buf },
      { caption, parse_mode: "HTML", ...joinKb }).catch(() => null);
  } else {
    sent = await bot.telegram.sendMessage(chatId, caption,
      { parse_mode: "HTML", ...joinKb }).catch(() => null);
  }

  if (sent) s.mainMsgId = sent.message_id;

  s.cancelTimeoutId = setTimeout(() => {
    const ss = gameStates.get(chatId);
    if (ss?.type === "xo" && ss.phase === "waiting") {
      if (ss.mainMsgId) {
        bot.telegram.editMessageReplyMarkup(chatId, ss.mainMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
      }
      bot.telegram.sendMessage(chatId, "⏰ <b>انتهى وقت التحدي</b> — ما انضم أحد!", { parse_mode: "HTML" }).catch(() => {});
      clearGame(chatId);
    }
  }, CANCEL_TIMEOUT_MS);
}

export async function handleXoJoin(
  bot: Telegraf,
  ctx: Context,
  chatId: number,
): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "xo" || s.phase !== "waiting") {
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

  await ctx.answerCbQuery("✅ انضممت! الدور لك بعد X!").catch(() => {});

  if (s.mainMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.mainMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
    s.mainMsgId = null;
  }

  const hName = esc(dn(s.hostPlayer));
  const gName = esc(dn(s.guestPlayer));

  await bot.telegram.sendMessage(
    chatId,
    `⚔️ <b>اللعبة بدت!</b>\n\n` +
    `✕ <b>${hName}</b>  ضد  ○ <b>${gName}</b>\n\n` +
    `<i>${esc(dn(s.hostPlayer))} يبدأ بـ X 🎮</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(async () => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "xo" || !ss.guestPlayer) return;

    let buf: Buffer | null = null;
    try {
      buf = await generateXoBoardCard(
        dn(ss.hostPlayer), dn(ss.guestPlayer),
        ss.hostSymbol, ss.board, "host", null,
      );
    } catch { /* fallback */ }

    const cap = boardCaption(ss);
    const kb  = boardKeyboard(chatId, ss.board);

    let sent: { message_id: number } | null = null;
    if (buf) {
      sent = await bot.telegram.sendPhoto(chatId, { source: buf },
        { caption: cap, parse_mode: "HTML", ...kb }).catch(() => null);
    } else {
      sent = await bot.telegram.sendMessage(chatId, cap,
        { parse_mode: "HTML", ...kb }).catch(() => null);
    }

    if (sent) ss.mainMsgId = sent.message_id;
    setTurnTimeout(bot, chatId);
  }, 1800);
}

export async function handleXoMove(
  bot: Telegraf,
  ctx: Context,
  chatId: number,
  idx: number,
): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "xo" || s.phase !== "playing" || !s.guestPlayer) {
    await ctx.answerCbQuery("⚠️ ما في لعبة نشطة").catch(() => {});
    return;
  }

  const uid     = ctx.from!.id;
  const isHost  = uid === s.hostPlayer.id;
  const isGuest = uid === s.guestPlayer.id;

  if (!isHost && !isGuest) {
    await ctx.answerCbQuery("❌ أنت مش من اللاعبين!").catch(() => {});
    return;
  }

  if (isHost && s.currentTurn !== "host") {
    await ctx.answerCbQuery("⏳ انتظر دورك!").catch(() => {});
    return;
  }
  if (isGuest && s.currentTurn !== "guest") {
    await ctx.answerCbQuery("⏳ انتظر دورك!").catch(() => {});
    return;
  }

  if (s.board[idx] !== null) {
    await ctx.answerCbQuery("❌ الخانة ممتلئة!").catch(() => {});
    return;
  }

  const sym = isHost ? s.hostSymbol : s.guestSymbol;
  await ctx.answerCbQuery(`${sym === "X" ? "✕" : "○"} لعبت!`).catch(() => {});
  await playMove(bot, chatId, uid, idx);
}

export async function handleXoNoop(ctx: Context): Promise<void> {
  await ctx.answerCbQuery("❌ الخانة ممتلئة!").catch(() => {});
}
