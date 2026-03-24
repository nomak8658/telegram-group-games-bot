import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type UnoState, type UnoPlayer, type UnoCard,
} from "../state.js";
import { generateUnoWinnerCard, generateUnoTopCardImage } from "../unoCard.js";
import { logger } from "../../lib/logger.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_PLAYERS   = 2;
const MAX_PLAYERS   = 8;
const HAND_SIZE     = 7;
const TURN_MS       = 35_000;
const UNO_WIN_MS    = 8_000;

// ─── Card helpers ─────────────────────────────────────────────────────────────

const CE: Record<string, string> = { red:"🔴", blue:"🔵", green:"🟢", yellow:"🟡", wild:"⚫" };
const CA: Record<string, string> = { red:"أحمر", blue:"أزرق", green:"أخضر", yellow:"أصفر", wild:"جوكر" };
const VA: Record<string, string> = { skip:"حظر", reverse:"عكس", "+2":"+٢", wild:"جوكر", "+4":"+٤" };

function cl(c: UnoCard): string { return `${CE[c.color]} ${VA[c.value] ?? c.value}`; }

function canPlay(card: UnoCard, top: UnoCard, color: UnoCard["color"]): boolean {
  if (card.color === "wild") return true;
  if (card.color === color)  return true;
  if (card.value === top.value) return true;
  return false;
}

// ─── Deck ─────────────────────────────────────────────────────────────────────

function createDeck(): UnoCard[] {
  const colors: Array<"red"|"blue"|"green"|"yellow"> = ["red","blue","green","yellow"];
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

// ─── Message builders ─────────────────────────────────────────────────────────

function buildJoinMsg(s: UnoState): string {
  return (
    `🃏 <b>أونو</b>\n\n` +
    `كل لاعب يأخذ 7 أوراق — تخلص منها أول!\n` +
    `طابق اللون أو الرقم أو الرمز مع الورقة الوسط.\n` +
    `⚠️ لما تبقى ورقة واحدة — قُل <b>UNO!</b> وإلا تسحب 2!\n\n` +
    `👥 <b>اللاعبون (${s.players.length}/${MAX_PLAYERS}):</b>\n` +
    s.players.map(p => `• ${esc(dn(p))}`).join("\n") + "\n\n" +
    `<i>اضغط ▶️ لبدء اللعبة (2–8 لاعبين)</i>`
  );
}

// The persistent game-state message — no hand buttons
function buildStateMsg(s: UnoState): string {
  const top = s.discard[s.discard.length - 1];
  const dir = s.direction === 1 ? "⬇" : "⬆";
  const cur = s.players[s.currentIdx];

  let txt = `🃏 <b>أونو</b>  ${dir}\n\n`;

  // Top card visual
  txt += `┌────────────────┐\n`;
  txt += `│  ${cl(top).padEnd(14)}│\n`;
  txt += `└────────────────┘\n`;
  txt += `🎨 <b>اللون الفعّال:</b> ${CE[s.currentColor]} ${CA[s.currentColor]}\n\n`;

  // Player list
  txt += `👥 <b>اللاعبون:</b>\n`;
  for (let i = 0; i < s.players.length; i++) {
    const p   = s.players[i];
    const isCur = i === s.currentIdx;
    const cnt = p.hand.length;
    const unoWarn = cnt === 1 ? " ⚠️ UNO!" : "";
    const bar = "●".repeat(Math.min(cnt, 9)) + (cnt > 9 ? `+${cnt-9}` : "");
    txt += `${isCur ? "▶️" : "   "} ${esc(dn(p))}  ${bar} (${cnt})${unoWarn}\n`;
  }

  txt += `\n`;

  if (s.colorChoosing) {
    txt += `🎨 <b>${esc(dn(cur))}</b> — اختر اللون`;
  } else if (s.drawPending > 0) {
    txt += `⚡ <b>${esc(dn(cur))}</b> — يجب سحب <b>${s.drawPending}</b> أوراق`;
  } else {
    txt += `🔔 دور <b>${esc(dn(cur))}</b>`;
    if (s.unoCallerId !== undefined) {
      const uno = s.players.find(p => p.id === s.unoCallerId);
      if (uno) txt += `\n⚠️ <b>${esc(dn(uno))}</b> عنده ورقة واحدة — سمّع عليه!`;
    }
  }

  return txt;
}

// The ephemeral hand message — shown per turn, deleted on next turn
function buildHandMsg(s: UnoState, player: UnoPlayer): string {
  const top = s.discard[s.discard.length - 1];

  if (s.colorChoosing) {
    return `🎨 <b>${esc(dn(player))}</b>\nاختر لون الجوكر:`;
  }
  if (s.drawPending > 0) {
    return (
      `⚡ <b>${esc(dn(player))}</b>\n` +
      `اللي عليك سحب <b>${s.drawPending}</b> أوراق — ما تقدر تلعب!\n\n` +
      `اضغط الزر أدناه للسحب:`
    );
  }

  const playableCount = player.hand.filter(c => canPlay(c, top, s.currentColor)).length;
  let txt = `🃏 <b>دور ${esc(dn(player))}</b>\n\n`;
  txt += `الورقة الحالية: <b>${cl(top)}</b>   اللون: <b>${CE[s.currentColor]} ${CA[s.currentColor]}</b>\n\n`;
  txt += `📋 <b>أوراقك (${player.hand.length}):</b>\n`;

  for (let i = 0; i < player.hand.length; i++) {
    const c  = player.hand[i];
    const ok = canPlay(c, top, s.currentColor);
    txt += `${ok ? "✅" : "❌"} ${i + 1}. <b>${cl(c)}</b>\n`;
  }

  if (!s.hasDrawn) {
    if (playableCount === 0) txt += `\n<i>ما عندك ورقة تنطبق — اسحب من المجموعة</i>`;
  } else {
    txt += `\n<i>سحبت ورقة — العب أو مرّر الدور</i>`;
  }

  return txt;
}

function buildHandKeyboard(chatId: number, s: UnoState): ReturnType<typeof Markup.inlineKeyboard> {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  const cur = s.players[s.currentIdx];
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

  // Card buttons
  const btns = cur.hand.map((c, i) =>
    Markup.button.callback(cl(c), `uno:play:${chatId}:${i}`)
  );
  for (let i = 0; i < btns.length; i += 4) rows.push(btns.slice(i, i + 4));

  const bottom: ReturnType<typeof Markup.button.callback>[] = [];
  if (!s.hasDrawn) {
    bottom.push(Markup.button.callback("🃏 سحب ورقة", `uno:draw:${chatId}`));
  } else {
    bottom.push(Markup.button.callback("⏭ تمرير الدور", `uno:pass:${chatId}`));
  }
  if (s.unoCallerId !== undefined) {
    bottom.push(Markup.button.callback("🔔 قُل UNO!", `uno:uno:${chatId}`));
  }
  if (bottom.length) rows.push(bottom);

  return Markup.inlineKeyboard(rows);
}

// ─── Turn management ──────────────────────────────────────────────────────────

function nextIdx(s: UnoState, extra = false): number {
  const n = s.players.length;
  return ((s.currentIdx + s.direction * (extra ? 2 : 1)) % n + n) % n;
}
function advance(s: UnoState, extraSkip = false) {
  s.currentIdx = nextIdx(s, extraSkip);
  s.hasDrawn   = false;
}

// Delete previous hand message, send new state + hand messages
async function sendTurnMessages(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "playing") return;

  // 1. Delete old hand message
  if (s.handMsgId) {
    await bot.telegram.deleteMessage(chatId, s.handMsgId).catch(() => {});
    s.handMsgId = undefined;
  }

  // 2. Edit main state message
  if (s.mainMsgId) {
    await bot.telegram.editMessageText(
      chatId, s.mainMsgId, undefined,
      buildStateMsg(s),
      { parse_mode: "HTML", ...Markup.inlineKeyboard([]) }
    ).catch(() => {});
  }

  // 3. Send fresh hand message for current player
  const cur = s.players[s.currentIdx];
  const hMsg = await bot.telegram.sendMessage(
    chatId,
    buildHandMsg(s, cur),
    { parse_mode: "HTML", ...buildHandKeyboard(chatId, s) }
  ).catch(() => null);
  if (hMsg) s.handMsgId = hMsg.message_id;

  // 4. Reset turn timer
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

  // Draw one card
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

// ─── Core: apply a played card ────────────────────────────────────────────────

async function applyCard(
  bot: Telegraf, chatId: number, player: UnoPlayer, handIdx: number,
): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "uno") return;

  const card = player.hand.splice(handIdx, 1)[0];
  s.discard.push(card);

  // Clear UNO challenge if this player had it
  if (s.unoCallerId === player.id) {
    if (s.unoChallengeTimer) { clearTimeout(s.unoChallengeTimer); s.unoChallengeTimer = undefined; }
    s.unoCallerId = undefined;
  }

  // Win!
  if (player.hand.length === 0) {
    await endUno(bot, chatId, player); return;
  }

  // Set UNO challenge if player now has exactly 1 card
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

  // Apply card effect
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
        `🚫 <b>${esc(dn(s.players[nextIdx(s)]))}</b> — دوره مسكور!`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      advance(s, true);
      break;

    case "reverse":
      s.direction *= -1 as 1|-1;
      if (s.players.length === 2) {
        // With 2 players, reverse = play again (stay at current)
        // We don't advance
      } else {
        advance(s);
      }
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

  // Clean up messages
  if (s.handMsgId) bot.telegram.deleteMessage(chatId, s.handMsgId).catch(() => {});
  if (s.mainMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.mainMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
  }

  // Stats
  for (const p of s.players) {
    if (p.id === winner.id) recordWin(chatId, toP(p));
    else recordGame(chatId, [toP(p)]);
  }

  await bot.telegram.sendMessage(chatId,
    `🎉 <b>UNO!</b>\n\n🏆 <b>${esc(dn(winner))}</b> خلّص أوراقه — مبروك الفوز!`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  try {
    const results = s.players.map(p => ({
      name: dn(p), cards: p.hand.length, isWinner: p.id === winner.id,
    }));
    const buf = await generateUnoWinnerCard(dn(winner), results);
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption:    `🏆 <b>${esc(dn(winner))}</b> فاز بلعبة الأونو!`,
      parse_mode: "HTML",
    }).catch(() => {});
  } catch (e) { logger.warn({ err: e }, "uno winner card failed"); }

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

  // Send top-card image
  try {
    const buf = await generateUnoTopCardImage(first.color, first.value, first.color);
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption:
        `🃏 <b>أونو — انطلقت!</b>\n\n` +
        `الورقة الأولى: <b>${cl(first)}</b>\n\n` +
        s.players.map(p => `• ${esc(dn(p))}: ${HAND_SIZE} أوراق`).join("\n") +
        `\n\n<i>⬇ رسالة الدور ستظهر بعد قليل — الأوراق تظهر لكل لاعب في دوره فقط</i>`,
      parse_mode: "HTML",
    }).catch(() => {});
  } catch (e) {
    logger.warn({ err: e }, "uno top card image failed");
    await bot.telegram.sendMessage(chatId,
      `🃏 <b>أونو — انطلقت!</b>\nالورقة الأولى: ${cl(first)}`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  // Send the persistent state message
  const sMsg = await bot.telegram.sendMessage(
    chatId, buildStateMsg(s),
    { parse_mode: "HTML", ...Markup.inlineKeyboard([]) }
  ).catch(() => null);
  if (sMsg) s.mainMsgId = sMsg.message_id;

  await sendTurnMessages(bot, chatId);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startUno(
  bot: Telegraf, chatId: number,
  hostId: number, hostUsername: string | undefined,
  hostFirst: string, hostLast: string,
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
  };
  gameStates.set(chatId, s);

  const msg = await bot.telegram.sendMessage(chatId, buildJoinMsg(s), {
    parse_mode: "HTML",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("➕  انضم للعبة", `uno:join:${chatId}`)],
      [Markup.button.callback("▶️  ابدأ الآن",  `uno:start:${chatId}`)],
    ]),
  }).catch(() => null);
  if (msg) s.joinMsgId = msg.message_id;
}

export async function handleUnoJoin(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ التسجيل مو متاح").catch(() => {}); return;
  }
  if (s.players.some(p => p.id === from.id)) {
    await ctx.answerCbQuery("✅ أنت مسجل مسبقاً!").catch(() => {}); return;
  }
  if (s.players.length >= MAX_PLAYERS) {
    await ctx.answerCbQuery(`⛔ الحد الأقصى ${MAX_PLAYERS} لاعبين!`).catch(() => {}); return;
  }
  s.players.push({ id: from.id, username: from.username, firstName: from.first_name ?? "", lastName: from.last_name ?? "", hand: [] });
  await ctx.answerCbQuery("✅ انضممت!").catch(() => {});
  if (s.joinMsgId) {
    bot.telegram.editMessageText(chatId, s.joinMsgId, undefined, buildJoinMsg(s), {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕  انضم للعبة", `uno:join:${chatId}`)],
        [Markup.button.callback("▶️  ابدأ الآن",  `uno:start:${chatId}`)],
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
    await ctx.answerCbQuery("⛔ فقط من أنشأ اللعبة يقدر يبدأها!").catch(() => {}); return;
  }
  if (s.players.length < MIN_PLAYERS) {
    await ctx.answerCbQuery(`⚠️ ما يكفي لاعبين! (${s.players.length}/${MIN_PLAYERS})`).catch(() => {}); return;
  }
  await ctx.answerCbQuery("🃏 تبدأ الآن!").catch(() => {});
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
    await ctx.answerCbQuery("⛔ اتبع التعليمات أولاً!").catch(() => {}); return;
  }
  if (handIdx < 0 || handIdx >= cur.hand.length) {
    await ctx.answerCbQuery("❌ ورقة غير صالحة").catch(() => {}); return;
  }
  const card = cur.hand[handIdx];
  const top  = s.discard[s.discard.length - 1];
  if (!canPlay(card, top, s.currentColor)) {
    await ctx.answerCbQuery(`❌ ${cl(card)} — ما تنطبق الحين!`).catch(() => {}); return;
  }
  await ctx.answerCbQuery(`✅ لعبت ${cl(card)}`).catch(() => {});

  // Announce the play in group
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
    await ctx.answerCbQuery(`😬 سحبت ${s.drawPending} أوراق!`).catch(() => {});
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
    await ctx.answerCbQuery("سحبت مسبقاً — مرّر الدور!").catch(() => {}); return;
  }

  const drawn = drawCard(s);
  cur.hand.push(drawn);
  s.hasDrawn = true;
  await ctx.answerCbQuery(`🃏 سحبت ${cl(drawn)}`).catch(() => {});
  await bot.telegram.sendMessage(chatId,
    `📤 <b>${esc(dn(cur))}</b> سحب ورقة`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  // Re-send hand message with new card visible
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
    await ctx.answerCbQuery("يجب تسحب ورقة أولاً!").catch(() => {}); return;
  }
  await ctx.answerCbQuery("⏭ تمرير الدور").catch(() => {});
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
  await ctx.answerCbQuery(`🎨 ${CE[color]} ${CA[color]}`).catch(() => {});

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
    await ctx.answerCbQuery("ما في أحد ينتظر UNO الحين").catch(() => {}); return;
  }

  const challenged = s.players.find(p => p.id === s.unoCallerId);
  if (!challenged) { s.unoCallerId = undefined; return; }

  if (from.id === s.unoCallerId) {
    // Safe!
    if (s.unoChallengeTimer) { clearTimeout(s.unoChallengeTimer); s.unoChallengeTimer = undefined; }
    s.unoCallerId = undefined;
    await ctx.answerCbQuery("🔔 UNO! — آمن! 👌").catch(() => {});
    await bot.telegram.sendMessage(chatId,
      `🔔 <b>${esc(dn(challenged))}</b> قال <b>UNO!</b> في وقته — آمن! ✅`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    // Update hand message to remove UNO button
    await sendTurnMessages(bot, chatId);
  } else {
    // Caught!
    if (s.unoChallengeTimer) { clearTimeout(s.unoChallengeTimer); s.unoChallengeTimer = undefined; }
    s.unoCallerId = undefined;
    const catcher = s.players.find(p => p.id === from.id);
    if (!catcher) { await ctx.answerCbQuery("⛔ أنت مو في اللعبة").catch(() => {}); return; }

    challenged.hand.push(drawCard(s));
    challenged.hand.push(drawCard(s));
    await ctx.answerCbQuery(`📣 اصطدته! ${esc(dn(challenged))} يسحب ورقتين!`).catch(() => {});
    await bot.telegram.sendMessage(chatId,
      `📣 <b>${esc(dn(catcher))}</b> سمّع على <b>${esc(dn(challenged))}</b>!\n` +
      `💀 <b>${esc(dn(challenged))}</b> يسحب ورقتين عقوبة!`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    await sendTurnMessages(bot, chatId);
  }
}
