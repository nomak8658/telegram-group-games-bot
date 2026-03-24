import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type UnoState, type UnoPlayer, type UnoCard,
} from "../state.js";
import {
  generateUnoGroupStateImage,
  generateUnoWinnerCard,
  generateUnoTopCardImage,
  generateUnoHandImage,
  type HandCard,
} from "../unoCard.js";
import { logger } from "../../lib/logger.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_PLAYERS  = 2;
const MAX_PLAYERS  = 8;
const HAND_SIZE    = 7;
const TURN_MS      = 35_000;
const UNO_WIN_MS   = 8_000;

// ─── Card helpers ─────────────────────────────────────────────────────────────

const CE: Record<string, string> = { red:"🔴", blue:"🔵", green:"🟢", yellow:"🟡", wild:"⚫" };
const CA: Record<string, string> = { red:"أحمر", blue:"أزرق", green:"أخضر", yellow:"أصفر", wild:"جوكر" };
const VA: Record<string, string> = { skip:"حظر", reverse:"عكس", "+2":"+٢", wild:"جوكر", "+4":"+٤" };
function cl(c: UnoCard) { return `${CE[c.color]} ${VA[c.value] ?? c.value}`; }

function canPlay(card: UnoCard, top: UnoCard, color: UnoCard["color"]): boolean {
  if (card.color === "wild") return true;
  if (card.color === color)  return true;
  if (card.value === top.value) return true;
  return false;
}

// ─── Deck ─────────────────────────────────────────────────────────────────────

function createDeck(): UnoCard[] {
  const colors = ["red","blue","green","yellow"] as const;
  const deck: UnoCard[] = [];
  for (const col of colors) {
    deck.push({ color: col, value: "0" });
    for (let n = 1; n <= 9; n++) {
      deck.push({ color: col, value: String(n) as UnoCard["value"] });
      deck.push({ color: col, value: String(n) as UnoCard["value"] });
    }
    for (const v of ["skip","reverse","+2"] as const) {
      deck.push({ color: col, value: v });
      deck.push({ color: col, value: v });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: "wild", value: "wild" });
    deck.push({ color: "wild", value: "+4"  });
  }
  return shuffle(deck);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawCard(s: UnoState): UnoCard {
  if (s.deck.length === 0) {
    const top = s.discard.pop()!;
    s.deck    = shuffle(s.discard);
    s.discard = [top];
  }
  return s.deck.pop()!;
}

// ─── Player helpers ───────────────────────────────────────────────────────────

function dn(p: UnoPlayer): string {
  const f = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return f || (p.username ? `@${p.username}` : String(p.id));
}
function toP(p: UnoPlayer) { return { id: p.id, username: p.username, name: dn(p) }; }

// ─── Group state image ────────────────────────────────────────────────────────

async function buildGroupStateImage(s: UnoState): Promise<Buffer> {
  const top = s.discard[s.discard.length - 1];
  return generateUnoGroupStateImage(
    top,
    s.currentColor,
    s.players.map((p, i) => ({
      name:          dn(p),
      cards:         p.hand.length,
      isCurrentTurn: i === s.currentIdx,
      hasUno:        p.hand.length === 1,
    })),
    s.direction,
    s.round,
  );
}

function buildGroupCaption(s: UnoState): string {
  const cur = s.players[s.currentIdx];
  let txt = `🃏 <b>UNO</b> — دور ${s.round}  ${s.direction === 1 ? "←" : "→"}\n`;
  txt += `🎨 اللون: ${CE[s.currentColor]} ${CA[s.currentColor]}\n\n`;
  if (s.colorChoosing) {
    txt += `🎨 <b>${esc(dn(cur))}</b> يختار لون الجوكر...`;
  } else if (s.drawPending > 0) {
    txt += `⚡ <b>${esc(dn(cur))}</b> يجب يسحب ${s.drawPending} أوراق!`;
  } else {
    txt += `📲 <b>${esc(dn(cur))}</b> — دورك! تفقد خاصك`;
  }
  if (s.unoCallerId !== undefined) {
    const p = s.players.find(x => x.id === s.unoCallerId);
    if (p) txt += `\n⚠️ <b>${esc(dn(p))}</b> عنده ورقة واحدة!`;
  }
  return txt;
}

// ─── Update group photo ───────────────────────────────────────────────────────

async function updateGroupPhoto(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "playing") return;

  // Delete old photo
  if (s.groupPhotoMsgId) {
    await bot.telegram.deleteMessage(chatId, s.groupPhotoMsgId).catch(() => {});
    s.groupPhotoMsgId = undefined;
  }

  // Send new group state photo
  try {
    const buf = await buildGroupStateImage(s);
    const caption = buildGroupCaption(s);
    const msg = await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption,
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([[
        Markup.button.url("📩 أوراقي بالخاص", `https://t.me/${s.botUsername}?start=uno_${chatId}`),
      ]]),
    }).catch(() => null);
    if (msg) s.groupPhotoMsgId = msg.message_id;
  } catch (e) {
    logger.warn({ err: e }, "uno group state image failed");
  }
}

// ─── DM hand management ───────────────────────────────────────────────────────

function buildHandKeyboard(chatId: number, s: UnoState, player: UnoPlayer): ReturnType<typeof Markup.inlineKeyboard> {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  const top = s.discard[s.discard.length - 1];

  if (s.colorChoosing) {
    rows.push([
      Markup.button.callback("🔴 أحمر",  `uno:color:${chatId}:red`),
      Markup.button.callback("🔵 أزرق",  `uno:color:${chatId}:blue`),
    ]);
    rows.push([
      Markup.button.callback("🟢 أخضر",  `uno:color:${chatId}:green`),
      Markup.button.callback("🟡 أصفر",  `uno:color:${chatId}:yellow`),
    ]);
    return Markup.inlineKeyboard(rows);
  }

  if (s.drawPending > 0) {
    return Markup.inlineKeyboard([[
      Markup.button.callback(`🃏 اسحب ${s.drawPending} أوراق`, `uno:draw:${chatId}`),
    ]]);
  }

  // Card buttons  (max 4 per row)
  const btns = player.hand.map((c, i) =>
    Markup.button.callback(`${canPlay(c, top, s.currentColor) ? "✅" : "❌"} ${i+1}`, `uno:play:${chatId}:${i}`)
  );
  for (let i = 0; i < btns.length; i += 5) rows.push(btns.slice(i, i + 5));

  const bottom: ReturnType<typeof Markup.button.callback>[] = [];
  if (!s.hasDrawn) {
    bottom.push(Markup.button.callback("🃏 سحب", `uno:draw:${chatId}`));
  } else {
    bottom.push(Markup.button.callback("⏭ تمرير", `uno:pass:${chatId}`));
  }
  if (s.unoCallerId !== undefined) {
    bottom.push(Markup.button.callback("🔔 UNO!", `uno:uno:${chatId}`));
  }
  if (bottom.length) rows.push(bottom);

  return Markup.inlineKeyboard(rows);
}

function buildHandCaption(s: UnoState, player: UnoPlayer): string {
  const top = s.discard[s.discard.length - 1];
  let txt = `🃏 <b>دورك!</b>\n`;
  txt += `الورقة الحالية: <b>${cl(top)}</b>   اللون: <b>${CE[s.currentColor]} ${CA[s.currentColor]}</b>\n\n`;

  if (s.colorChoosing) return `🎨 اختر اللون للجوكر:`;
  if (s.drawPending > 0) return `⚡ يجب سحب <b>${s.drawPending}</b> أوراق:`;

  txt += `<b>أوراقك (${player.hand.length}):</b>\n`;
  for (let i = 0; i < player.hand.length; i++) {
    const c  = player.hand[i];
    const ok = canPlay(c, top, s.currentColor);
    txt += `${ok ? "✅" : "❌"} ${i + 1}. <b>${cl(c)}</b>\n`;
  }
  if (!s.hasDrawn) {
    const havePlay = player.hand.some(c => canPlay(c, top, s.currentColor));
    if (!havePlay) txt += `\n<i>ما عندك ورقة — اسحب</i>`;
  } else {
    txt += `\n<i>سحبت — العب أو مرّر</i>`;
  }
  return txt;
}

async function sendOrEditDM(
  bot: Telegraf,
  player: UnoPlayer,
  chatId: number,  // group chat ID
  s: UnoState,
  isTurn: boolean,
): Promise<void> {
  if (!player.dmChatId) return;

  if (isTurn) {
    // Generate hand image
    const top   = s.discard[s.discard.length - 1];
    const cards: HandCard[] = player.hand.map(c => ({
      color:    c.color,
      value:    c.value,
      playable: s.colorChoosing ? false : s.drawPending > 0 ? false : canPlay(c, top, s.currentColor),
    }));

    try {
      const buf     = await generateUnoHandImage(cards);
      const caption = buildHandCaption(s, player);
      const keyboard = buildHandKeyboard(chatId, s, player);

      // Delete old DM message if exists
      if (player.dmMsgId) {
        await bot.telegram.deleteMessage(player.dmChatId, player.dmMsgId).catch(() => {});
        player.dmMsgId = undefined;
      }

      const msg = await bot.telegram.sendPhoto(player.dmChatId, { source: buf }, {
        caption,
        parse_mode: "HTML",
        ...keyboard,
      }).catch(() => null);
      if (msg) player.dmMsgId = msg.message_id;
    } catch (e) {
      logger.warn({ err: e }, "uno hand DM image failed");
    }
  } else {
    // Not their turn — just update caption (remove buttons)
    if (player.dmMsgId) {
      await bot.telegram.editMessageCaption(
        player.dmChatId, player.dmMsgId, undefined,
        `⏳ <b>${esc(dn(s.players[s.currentIdx]))}</b> يلعب...`,
        { parse_mode: "HTML", ...Markup.inlineKeyboard([]) }
      ).catch(() => {});
    }
  }
}

// ─── Full turn update ─────────────────────────────────────────────────────────

async function sendTurnMessages(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "playing") return;

  // 1. Update group photo
  await updateGroupPhoto(bot, chatId);

  // 2. Update all players' DMs
  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[i];
    if (p.dmChatId) {
      await sendOrEditDM(bot, p, chatId, s, i === s.currentIdx);
    }
  }

  // 3. Reset turn timer
  if (s.turnTimer) clearTimeout(s.turnTimer);
  s.turnTimer = setTimeout(() => autoPlay(bot, chatId), TURN_MS);
}

// ─── Auto-play on timeout ─────────────────────────────────────────────────────

async function autoPlay(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "playing") return;
  const cur = s.players[s.currentIdx];
  const top = s.discard[s.discard.length - 1];

  if (s.drawPending > 0) {
    for (let i = 0; i < s.drawPending; i++) cur.hand.push(drawCard(s));
    s.drawPending = 0;
    advance(s);
    await sendTurnMessages(bot, chatId);
    return;
  }
  if (s.colorChoosing) {
    const colors: UnoCard["color"][] = ["red","blue","green","yellow"];
    s.currentColor  = colors[Math.floor(Math.random() * 4)];
    s.colorChoosing = false;
    advance(s);
    await sendTurnMessages(bot, chatId);
    return;
  }
  if (s.hasDrawn) {
    advance(s);
    await sendTurnMessages(bot, chatId);
    return;
  }

  const drawn = drawCard(s);
  cur.hand.push(drawn);
  s.hasDrawn = true;

  if (canPlay(drawn, top, s.currentColor)) {
    await bot.telegram.sendMessage(chatId,
      `⏱ <b>${esc(dn(cur))}</b> انتهى وقته — لعب <b>${cl(drawn)}</b> تلقائياً`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    await applyCard(bot, chatId, cur, cur.hand.length - 1);
  } else {
    advance(s);
    await bot.telegram.sendMessage(chatId,
      `⏱ <b>${esc(dn(cur))}</b> انتهى وقته — تخطّى دوره`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    await sendTurnMessages(bot, chatId);
  }
}

// ─── Apply played card ────────────────────────────────────────────────────────

function nextIdx(s: UnoState, extra = false): number {
  const n = s.players.length;
  return ((s.currentIdx + s.direction * (extra ? 2 : 1)) % n + n) % n;
}
function advance(s: UnoState, extraSkip = false) {
  s.currentIdx = nextIdx(s, extraSkip);
  s.hasDrawn   = false;
  s.round++;
}

async function applyCard(
  bot: Telegraf, chatId: number, player: UnoPlayer, handIdx: number,
): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "uno") return;

  const card = player.hand.splice(handIdx, 1)[0];
  s.discard.push(card);

  if (s.unoCallerId === player.id) {
    if (s.unoChallengeTimer) { clearTimeout(s.unoChallengeTimer); s.unoChallengeTimer = undefined; }
    s.unoCallerId = undefined;
  }

  if (player.hand.length === 0) { await endUno(bot, chatId, player); return; }

  if (player.hand.length === 1 && s.unoCallerId === undefined) {
    s.unoCallerId = player.id;
    s.unoChallengeTimer = setTimeout(() => {
      const st = gameStates.get(chatId);
      if (st?.type === "uno" && st.unoCallerId === player.id) {
        st.unoCallerId      = undefined;
        st.unoChallengeTimer = undefined;
      }
    }, UNO_WIN_MS);
  }

  if (card.color === "wild") {
    s.colorChoosing = true;
    if (card.value === "+4") s.drawPending = 4;
    await sendTurnMessages(bot, chatId);
    return;
  }

  s.currentColor = card.color;

  switch (card.value) {
    case "skip":
      await bot.telegram.sendMessage(chatId,
        `🚫 <b>${esc(dn(s.players[nextIdx(s)]))}</b> — محظور دوره!`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      advance(s, true);
      break;
    case "reverse":
      s.direction *= -1 as 1 | -1;
      if (s.players.length === 2) { s.hasDrawn = false; }
      else                        { advance(s); }
      break;
    case "+2":
      s.drawPending = 2;
      advance(s);
      break;
    default:
      advance(s);
      break;
  }

  await sendTurnMessages(bot, chatId);
}

// ─── End game ─────────────────────────────────────────────────────────────────

async function endUno(bot: Telegraf, chatId: number, winner: UnoPlayer): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "uno") return;

  s.phase = "done";
  if (s.turnTimer)          clearTimeout(s.turnTimer);
  if (s.unoChallengeTimer)  clearTimeout(s.unoChallengeTimer);

  // Clean up group photo (remove buttons)
  if (s.groupPhotoMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.groupPhotoMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
  }

  // Clean up all DMs
  for (const p of s.players) {
    if (p.dmChatId && p.dmMsgId) {
      bot.telegram.editMessageReplyMarkup(p.dmChatId, p.dmMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
    }
  }

  for (const p of s.players) {
    if (p.id === winner.id) recordWin(chatId, toP(p));
    else                    recordGame(chatId, [toP(p)]);
  }

  try {
    const results = s.players.map(p => ({
      name: dn(p), cards: p.hand.length, isWinner: p.id === winner.id,
    }));
    const buf = await generateUnoWinnerCard(dn(winner), results);
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption:    `🏆 <b>${esc(dn(winner))}</b> فاز بلعبة الأونو!`,
      parse_mode: "HTML",
    }).catch(() => {});
  } catch (e) {
    logger.warn({ err: e }, "uno winner card failed");
    await bot.telegram.sendMessage(chatId,
      `🏆 <b>${esc(dn(winner))}</b> فاز!`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  clearGame(chatId);
}

// ─── Launch ───────────────────────────────────────────────────────────────────

async function launchUno(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "uno") return;

  s.phase = "playing";
  s.deck  = createDeck();
  for (const p of s.players) {
    for (let i = 0; i < HAND_SIZE; i++) p.hand.push(drawCard(s));
  }

  // First card must be a plain number
  let first = drawCard(s);
  let tries  = 0;
  while ((first.color === "wild" || first.value === "skip" || first.value === "reverse" || first.value === "+2") && tries++ < 30) {
    s.deck.unshift(first);
    first = drawCard(s);
  }
  s.discard      = [first];
  s.currentColor = first.color as UnoCard["color"];
  s.currentIdx   = 0;
  s.direction    = 1;
  s.drawPending  = 0;
  s.hasDrawn     = false;
  s.colorChoosing = false;
  s.round        = 1;

  // Send launch photo (single big card image)
  try {
    const buf = await generateUnoTopCardImage(first.color, first.value, first.color);
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption:
        `🃏 <b>UNO — انطلقت!</b>\n\n` +
        `الورقة الأولى: <b>${cl(first)}</b>\n\n` +
        s.players.map(p => `• <b>${esc(dn(p))}</b> — ${HAND_SIZE} أوراق`).join("\n") +
        `\n\n<b>اضغط الزر لتستلم أوراقك في الخاص!</b>`,
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([[
        Markup.button.url("📩 أوراقي بالخاص", `https://t.me/${s.botUsername}?start=uno_${chatId}`),
      ]]),
    }).catch(() => {});
  } catch (e) {
    logger.warn({ err: e }, "uno launch card failed");
    await bot.telegram.sendMessage(chatId,
      `🃏 <b>UNO — انطلقت!</b>\n\n<b>اضغط لتستلم أوراقك:</b>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([[
          Markup.button.url("📩 أوراقي بالخاص", `https://t.me/${s.botUsername}?start=uno_${chatId}`),
        ]]),
      }
    ).catch(() => {});
  }

  // Small delay to let players open the bot DM
  await new Promise(r => setTimeout(r, 4000));

  await sendTurnMessages(bot, chatId);
}

// ─── DM registration (called from /start handler) ────────────────────────────

export async function registerUnoDM(
  bot: Telegraf, groupChatId: number, userId: number, dmChatId: number,
): Promise<void> {
  const s = gameStates.get(groupChatId);
  if (!s || s.type !== "uno") return;

  const player = s.players.find(p => p.id === userId);
  if (!player) return;

  player.dmChatId = dmChatId;

  if (s.phase === "playing") {
    const isTurn = s.players[s.currentIdx].id === userId;
    await sendOrEditDM(bot, player, groupChatId, s, isTurn);
  }
}

// ─── Public handlers ──────────────────────────────────────────────────────────

export async function startUno(
  bot: Telegraf, chatId: number,
  hostId: number, hostUsername: string | undefined,
  hostFirst: string, hostLast: string,
  botUsername: string,
): Promise<void> {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId, "⚠️ في لعبة شغالة! أوقفوها أولاً بـ /stop").catch(() => {});
    return;
  }
  const s: UnoState = {
    type: "uno", phase: "joining", hostId,
    players: [{ id: hostId, username: hostUsername, firstName: hostFirst, lastName: hostLast, hand: [] }],
    deck: [], discard: [], currentIdx: 0, direction: 1,
    currentColor: "wild", drawPending: 0, hasDrawn: false, colorChoosing: false,
    botUsername, round: 1,
  };
  gameStates.set(chatId, s);

  const msg = await bot.telegram.sendMessage(chatId, buildJoinMsg(s), {
    parse_mode: "HTML",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("➕  انضم", `uno:join:${chatId}`)],
      [Markup.button.callback("▶️  ابدأ",  `uno:start:${chatId}`)],
      [Markup.button.url("📩 فعّل الخاص", `https://t.me/${botUsername}?start=uno_${chatId}`)],
    ]),
  }).catch(() => null);
  if (msg) s.joinMsgId = msg.message_id;
}

function buildJoinMsg(s: UnoState): string {
  return (
    `🃏 <b>أونو</b>\n\n` +
    `• خلّص أوراقك أول!\n• طابق اللون أو الرقم أو الرمز\n• لما تبقى ورقة واحدة — قُل <b>UNO!</b>\n\n` +
    `👥 <b>اللاعبون (${s.players.length}/${MAX_PLAYERS}):</b>\n` +
    s.players.map(p => `• ${esc(dn(p))}`).join("\n") + "\n\n" +
    `<i>⬆️ اضغط "فعّل الخاص" لتستلم أوراقك في DM</i>`
  );
}

export async function handleUnoJoin(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ التسجيل مو متاح").catch(() => {}); return;
  }
  if (s.players.some(p => p.id === from.id)) {
    await ctx.answerCbQuery("✅ أنت مسجل!").catch(() => {}); return;
  }
  if (s.players.length >= MAX_PLAYERS) {
    await ctx.answerCbQuery(`⛔ الحد الأقصى ${MAX_PLAYERS}!`).catch(() => {}); return;
  }
  s.players.push({ id: from.id, username: from.username, firstName: from.first_name ?? "", lastName: from.last_name ?? "", hand: [] });
  await ctx.answerCbQuery("✅ انضممت!").catch(() => {});
  if (s.joinMsgId) {
    bot.telegram.editMessageText(chatId, s.joinMsgId, undefined, buildJoinMsg(s), {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕  انضم", `uno:join:${chatId}`)],
        [Markup.button.callback("▶️  ابدأ",  `uno:start:${chatId}`)],
        [Markup.button.url("📩 فعّل الخاص", `https://t.me/${s.botUsername}?start=uno_${chatId}`)],
      ]),
    }).catch(() => {});
  }
}

export async function handleUnoStart(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ ما في تسجيل").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط من أنشأ اللعبة!").catch(() => {}); return;
  }
  if (s.players.length < MIN_PLAYERS) {
    await ctx.answerCbQuery(`⚠️ محتاج لاعبين (${s.players.length}/${MIN_PLAYERS})`).catch(() => {}); return;
  }
  await ctx.answerCbQuery("🃏 تبدأ!").catch(() => {});
  ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
  launchUno(bot, chatId);
}

export async function handleUnoPlay(bot: Telegraf, ctx: Context, chatId: number, handIdx: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "playing") {
    await ctx.answerCbQuery("❌ اللعبة مو شغالة").catch(() => {}); return;
  }
  const cur = s.players[s.currentIdx];
  if (from.id !== cur.id) {
    await ctx.answerCbQuery("⛔ مو دورك!").catch(() => {}); return;
  }
  if (s.colorChoosing || s.drawPending > 0) {
    await ctx.answerCbQuery("⛔ اتبع التعليمات!").catch(() => {}); return;
  }
  if (handIdx < 0 || handIdx >= cur.hand.length) {
    await ctx.answerCbQuery("❌ ورقة غير صالحة").catch(() => {}); return;
  }
  const card = cur.hand[handIdx];
  const top  = s.discard[s.discard.length - 1];
  if (!canPlay(card, top, s.currentColor)) {
    await ctx.answerCbQuery(`❌ ${cl(card)} — ما تنطبق!`).catch(() => {}); return;
  }
  await ctx.answerCbQuery(`✅ لعبت ${cl(card)}`).catch(() => {});

  await bot.telegram.sendMessage(chatId,
    `🃏 <b>${esc(dn(cur))}</b> لعب <b>${cl(card)}</b>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  await applyCard(bot, chatId, cur, handIdx);
}

export async function handleUnoDraw(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "playing") {
    await ctx.answerCbQuery("❌ اللعبة مو شغالة").catch(() => {}); return;
  }
  const cur = s.players[s.currentIdx];
  if (from.id !== cur.id) {
    await ctx.answerCbQuery("⛔ مو دورك!").catch(() => {}); return;
  }

  if (s.drawPending > 0) {
    for (let i = 0; i < s.drawPending; i++) cur.hand.push(drawCard(s));
    await ctx.answerCbQuery(`😬 سحبت ${s.drawPending} أوراق`).catch(() => {});
    await bot.telegram.sendMessage(chatId,
      `📤 <b>${esc(dn(cur))}</b> سحب ${s.drawPending} أوراق`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    s.drawPending = 0;
    advance(s);
    await sendTurnMessages(bot, chatId);
    return;
  }

  if (s.hasDrawn) {
    await ctx.answerCbQuery("سحبت مسبقاً — مرّر!").catch(() => {}); return;
  }

  const drawn = drawCard(s);
  cur.hand.push(drawn);
  s.hasDrawn = true;
  await ctx.answerCbQuery(`🃏 سحبت ${cl(drawn)}`).catch(() => {});
  await bot.telegram.sendMessage(chatId,
    `📤 <b>${esc(dn(cur))}</b> سحب ورقة`,
    { parse_mode: "HTML" }
  ).catch(() => {});
  await sendTurnMessages(bot, chatId);
}

export async function handleUnoPass(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "playing") {
    await ctx.answerCbQuery("❌ اللعبة مو شغالة").catch(() => {}); return;
  }
  const cur = s.players[s.currentIdx];
  if (from.id !== cur.id) {
    await ctx.answerCbQuery("⛔ مو دورك!").catch(() => {}); return;
  }
  if (!s.hasDrawn) {
    await ctx.answerCbQuery("اسحب أولاً!").catch(() => {}); return;
  }
  await ctx.answerCbQuery("⏭ تم التمرير").catch(() => {});
  advance(s);
  await sendTurnMessages(bot, chatId);
}

export async function handleUnoColor(
  bot: Telegraf, ctx: Context, chatId: number, color: UnoCard["color"],
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "playing") {
    await ctx.answerCbQuery("❌ اللعبة مو شغالة").catch(() => {}); return;
  }
  const cur = s.players[s.currentIdx];
  if (from.id !== cur.id) {
    await ctx.answerCbQuery("⛔ مو دورك!").catch(() => {}); return;
  }
  if (!s.colorChoosing) {
    await ctx.answerCbQuery("ما تحتاج تختار لون").catch(() => {}); return;
  }

  s.currentColor  = color;
  s.colorChoosing = false;
  await ctx.answerCbQuery(`🎨 ${CE[color]}`).catch(() => {});

  await bot.telegram.sendMessage(chatId,
    `🎨 <b>${esc(dn(cur))}</b> اختار <b>${CE[color]} ${CA[color]}</b>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  advance(s);
  await sendTurnMessages(bot, chatId);
}

export async function handleUnoUno(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "playing") {
    await ctx.answerCbQuery("❌ اللعبة مو شغالة").catch(() => {}); return;
  }
  if (s.unoCallerId === undefined) {
    await ctx.answerCbQuery("ما في أحد الحين").catch(() => {}); return;
  }

  const challenged = s.players.find(p => p.id === s.unoCallerId);
  if (!challenged) { s.unoCallerId = undefined; return; }

  if (from.id === s.unoCallerId) {
    if (s.unoChallengeTimer) { clearTimeout(s.unoChallengeTimer); s.unoChallengeTimer = undefined; }
    s.unoCallerId = undefined;
    await ctx.answerCbQuery("🔔 UNO! — آمن!").catch(() => {});
    await bot.telegram.sendMessage(chatId,
      `🔔 <b>${esc(dn(challenged))}</b> قال <b>UNO!</b> ✅`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    await sendTurnMessages(bot, chatId);
  } else {
    if (s.unoChallengeTimer) { clearTimeout(s.unoChallengeTimer); s.unoChallengeTimer = undefined; }
    s.unoCallerId = undefined;
    const catcher = s.players.find(p => p.id === from.id);
    if (!catcher) { await ctx.answerCbQuery("⛔ أنت مو في اللعبة").catch(() => {}); return; }

    challenged.hand.push(drawCard(s));
    challenged.hand.push(drawCard(s));
    await ctx.answerCbQuery(`📣 اصطدته!`).catch(() => {});
    await bot.telegram.sendMessage(chatId,
      `📣 <b>${esc(dn(catcher))}</b> سمّع على <b>${esc(dn(challenged))}</b>!\n💀 يسحب ورقتين عقوبة!`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    await sendTurnMessages(bot, chatId);
  }
}
