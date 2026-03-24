import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type UnoState, type UnoPlayer, type UnoCard,
} from "../state.js";
import { generateUnoWinnerCard, generateUnoTopCardImage } from "../unoCard.js";
import { logger } from "../../lib/logger.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_PLAYERS    = 2;
const MAX_PLAYERS    = 8;
const HAND_SIZE      = 7;
const TURN_MS        = 35_000;
const UNO_WINDOW_MS  = 8_000;

// ─── Card helpers ─────────────────────────────────────────────────────────────

const COLOR_EMOJI: Record<string, string> = { red:"🔴", blue:"🔵", green:"🟢", yellow:"🟡", wild:"⚫" };
const COLOR_AR:    Record<string, string> = { red:"أحمر", blue:"أزرق", green:"أخضر", yellow:"أصفر", wild:"جوكر" };
const VALUE_AR:    Record<string, string> = { skip:"حظر", reverse:"عكس", "+2":"+٢", wild:"جوكر", "+4":"+٤" };

function cardLabel(c: UnoCard): string {
  const ce = COLOR_EMOJI[c.color];
  const vl = VALUE_AR[c.value] ?? c.value;
  return `${ce} ${vl}`;
}

function canPlay(card: UnoCard, top: UnoCard, color: UnoCard["color"]): boolean {
  if (card.color === "wild") return true;
  if (card.color === color)  return true;
  if (card.value === top.value) return true;
  return false;
}

function hasPlayable(hand: UnoCard[], top: UnoCard, color: UnoCard["color"]): boolean {
  return hand.some(c => canPlay(c, top, color));
}

// ─── Deck ─────────────────────────────────────────────────────────────────────

function createDeck(): UnoCard[] {
  const colors: Array<"red"|"blue"|"green"|"yellow"> = ["red","blue","green","yellow"];
  const deck: UnoCard[] = [];
  for (const color of colors) {
    deck.push({ color, value: "0" });
    for (let n = 1; n <= 9; n++) {
      deck.push({ color, value: String(n) as UnoCard["value"] });
      deck.push({ color, value: String(n) as UnoCard["value"] });
    }
    for (const v of ["skip","reverse","+2"] as const) {
      deck.push({ color, value: v });
      deck.push({ color, value: v });
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

function drawFromDeck(s: UnoState): UnoCard {
  if (s.deck.length === 0) {
    const top  = s.discard.pop()!;
    s.deck     = shuffle(s.discard);
    s.discard  = [top];
  }
  return s.deck.pop()!;
}

// ─── Player helpers ───────────────────────────────────────────────────────────

function dn(p: UnoPlayer): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return full || (p.username ? `@${p.username}` : String(p.id));
}
function toP(p: UnoPlayer) { return { id: p.id, username: p.username, name: dn(p) }; }

// ─── Message builders ─────────────────────────────────────────────────────────

function buildJoinMsg(s: UnoState): string {
  const list = s.players.map(p => `• ${esc(dn(p))}`).join("\n") || "—";
  return (
    `🃏 <b>أونو</b>\n\n` +
    `لعبة الأوراق الشهيرة — تخلص من أوراقك أول!\n` +
    `كل لاعب يأخذ 7 أوراق. طابق اللون أو الرقم أو الرمز.\n` +
    `⚠️ لما تبقى ورقة واحدة — قُل <b>UNO!</b>\n\n` +
    `👥 <b>اللاعبون (${s.players.length}/${MAX_PLAYERS}):</b>\n${list}\n\n` +
    `<i>اضغط ▶️ لبدء اللعبة (2–8 لاعبين)</i>`
  );
}

function handBar(count: number): string {
  const filled = Math.min(count, 10);
  return "●".repeat(filled) + (count > 10 ? `+${count-10}` : "");
}

function buildGameMsg(s: UnoState): string {
  const top = s.discard[s.discard.length - 1];
  const dir = s.direction === 1 ? "⬇" : "⬆";

  let txt = `🃏 <b>أونو</b>  ${dir}\n\n`;
  txt += `┌───────────────────┐\n`;
  txt += `│ ${cardLabel(top).padEnd(14)}      │\n`;
  txt += `└───────────────────┘\n`;
  txt += `🎨 <b>اللون:</b> ${COLOR_EMOJI[s.currentColor]} ${COLOR_AR[s.currentColor]}\n\n`;

  txt += `👥 <b>اللاعبون:</b>\n`;
  for (let i = 0; i < s.players.length; i++) {
    const p   = s.players[i];
    const cur = i === s.currentIdx;
    const cnt = p.hand.length;
    const uno = cnt === 1 ? " ⚠️ UNO!" : "";
    txt += `${cur ? "▶️" : "   "} <b>${esc(dn(p))}</b>  ${handBar(cnt)} (${cnt})${uno}\n`;
  }
  txt += "\n";

  const cur = s.players[s.currentIdx];

  if (s.drawPending > 0) {
    txt += `⚡ <b>${esc(dn(cur))}</b> يجب عليك سحب ${s.drawPending} أوراق!\n`;
  } else if (s.colorChoosing) {
    txt += `🎨 <b>${esc(dn(cur))}</b> اختر اللون:`;
  } else {
    txt += `━━━ دور <b>${esc(dn(cur))}</b> ━━━`;
  }

  return txt;
}

function buildHandKeyboard(chatId: number, s: UnoState): ReturnType<typeof Markup.inlineKeyboard> {
  const cur = s.players[s.currentIdx];
  const top = s.discard[s.discard.length - 1];
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];

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
    rows.push([Markup.button.callback(`🃏 اسحب ${s.drawPending} أوراق`, `uno:draw:${chatId}`)]);
    return Markup.inlineKeyboard(rows);
  }

  // Show hand
  const cardBtns = cur.hand.map((c, i) =>
    Markup.button.callback(cardLabel(c), `uno:play:${chatId}:${i}`)
  );
  for (let i = 0; i < cardBtns.length; i += 4) {
    rows.push(cardBtns.slice(i, i + 4));
  }

  if (!s.hasDrawn) {
    rows.push([Markup.button.callback("🃏 سحب ورقة", `uno:draw:${chatId}`)]);
  } else {
    rows.push([Markup.button.callback("⏭ تمرير الدور", `uno:pass:${chatId}`)]);
  }

  // UNO button
  if (s.unoCallerId !== undefined) {
    rows.push([Markup.button.callback("🔔 قُل / سمّع UNO!", `uno:uno:${chatId}`)]);
  }

  return Markup.inlineKeyboard(rows);
}

// ─── Turn management ──────────────────────────────────────────────────────────

function nextIdx(s: UnoState, skips = 1): number {
  const n = s.players.length;
  return ((s.currentIdx + s.direction * skips) % n + n) % n;
}

function advanceTurn(s: UnoState, extraSkip = false): void {
  s.currentIdx = nextIdx(s, extraSkip ? 2 : 1);
  s.hasDrawn   = false;
}

async function sendTurnMessage(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "playing") return;

  const text     = buildGameMsg(s);
  const keyboard = buildHandKeyboard(chatId, s);

  if (s.mainMsgId) {
    await bot.telegram.editMessageText(chatId, s.mainMsgId, undefined, text, {
      parse_mode: "HTML",
      ...keyboard,
    }).catch(async () => {
      // If edit fails (e.g. message too old), send new
      const m = await bot.telegram.sendMessage(chatId, text, { parse_mode: "HTML", ...keyboard }).catch(() => null);
      if (m && s) s.mainMsgId = m.message_id;
    });
  } else {
    const m = await bot.telegram.sendMessage(chatId, text, { parse_mode: "HTML", ...keyboard }).catch(() => null);
    if (m && s) s.mainMsgId = m.message_id;
  }

  // Reset turn timer
  if (s.turnTimer) clearTimeout(s.turnTimer);
  s.turnTimer = setTimeout(() => autoPlay(bot, chatId), TURN_MS);
}

// Auto-play on timeout
async function autoPlay(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "playing") return;

  const cur = s.players[s.currentIdx];
  const top = s.discard[s.discard.length - 1];

  if (s.drawPending > 0) {
    // Force draw
    for (let i = 0; i < s.drawPending; i++) cur.hand.push(drawFromDeck(s));
    s.drawPending = 0;
    advanceTurn(s);
    await sendTurnMessage(bot, chatId);
    return;
  }

  if (s.colorChoosing) {
    // Pick random color
    const colors: UnoCard["color"][] = ["red","blue","green","yellow"];
    s.currentColor  = colors[Math.floor(Math.random() * 4)];
    s.colorChoosing = false;
    advanceTurn(s);
    await sendTurnMessage(bot, chatId);
    return;
  }

  if (s.hasDrawn) {
    // Already drew, just pass
    advanceTurn(s);
    await sendTurnMessage(bot, chatId);
    return;
  }

  // Draw a card
  const drawn = drawFromDeck(s);
  cur.hand.push(drawn);

  if (canPlay(drawn, top, s.currentColor)) {
    // Play it
    await playCard(bot, chatId, cur, cur.hand.length - 1, "auto");
  } else {
    // Can't play, skip
    advanceTurn(s);
    await bot.telegram.sendMessage(chatId,
      `⏱ <b>${esc(dn(cur))}</b> انتهى وقته — تخطّى دوره!`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    await sendTurnMessage(bot, chatId);
  }
}

// ─── Core play logic ──────────────────────────────────────────────────────────

async function playCard(
  bot: Telegraf, chatId: number,
  player: UnoPlayer, handIdx: number, source: "player" | "auto",
): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "uno") return;

  const card = player.hand[handIdx];
  player.hand.splice(handIdx, 1);
  s.discard.push(card);

  // Clear UNO challenge on playing
  if (s.unoCallerId === player.id) {
    if (s.unoChallengeTimer) { clearTimeout(s.unoChallengeTimer); s.unoChallengeTimer = undefined; }
    s.unoCallerId = undefined;
  }

  // Win!
  if (player.hand.length === 0) {
    await endUno(bot, chatId, player); return;
  }

  // UNO challenge: 1 card left and hasn't called UNO
  if (player.hand.length === 1 && s.unoCallerId === undefined) {
    s.unoCallerId = player.id;
    s.unoChallengeTimer = setTimeout(() => {
      const st = gameStates.get(chatId);
      if (st && st.type === "uno" && st.unoCallerId === player.id) {
        st.unoCallerId = undefined;
        st.unoChallengeTimer = undefined;
      }
    }, UNO_WINDOW_MS);
  }

  // Apply card effect
  if (card.color === "wild") {
    s.colorChoosing = true;
    if (card.value === "+4") {
      // Next player will have drawPending applied after color is chosen
      s.drawPending = 4;
    }
    await sendTurnMessage(bot, chatId);
    return;
  }

  s.currentColor = card.color;

  switch (card.value) {
    case "skip":
      await bot.telegram.sendMessage(chatId,
        `🚫 ${esc(dn(s.players[nextIdx(s)]))} دوره مسكور!`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      advanceTurn(s, true);
      break;

    case "reverse":
      s.direction *= -1 as 1 | -1;
      if (s.players.length === 2) {
        // With 2 players: reverse = play again
        // don't advance (stay at current player)
      } else {
        advanceTurn(s);
      }
      break;

    case "+2":
      s.drawPending = 2;
      advanceTurn(s);
      break;

    default:
      advanceTurn(s);
      break;
  }

  await sendTurnMessage(bot, chatId);
}

// ─── End game ─────────────────────────────────────────────────────────────────

async function endUno(bot: Telegraf, chatId: number, winner: UnoPlayer): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "uno") return;
  s.phase = "done";
  if (s.turnTimer)         clearTimeout(s.turnTimer);
  if (s.unoChallengeTimer) clearTimeout(s.unoChallengeTimer);

  if (s.mainMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.mainMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
  }

  // Record stats
  for (const p of s.players) {
    if (p.id === winner.id) recordWin(chatId, toP(p));
    else recordGame(chatId, [toP(p)]);
  }

  await bot.telegram.sendMessage(chatId,
    `🎉 <b>UNO!</b>\n\n🏆 <b>${esc(dn(winner))}</b> انتهت أوراقه — مبروك الفوز!`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  try {
    const results = s.players.map(p => ({
      name:      dn(p),
      cards:     p.hand.length,
      isWinner:  p.id === winner.id,
    }));
    const buf = await generateUnoWinnerCard(dn(winner), results);
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption:    `🏆 <b>${esc(dn(winner))}</b> فاز بلعبة الأونو!`,
      parse_mode: "HTML",
    }).catch(() => {});
  } catch (e) { logger.warn({ err: e }, "uno winner card failed"); }

  clearGame(chatId);
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
  if (s.colorChoosing || s.drawPending > 0) {
    await ctx.answerCbQuery("⛔ اتبع التعليمات أولاً!").catch(() => {}); return;
  }

  const curPlayer = s.players[s.currentIdx];
  if (from.id !== curPlayer.id) {
    await ctx.answerCbQuery("⛔ مو دورك!").catch(() => {}); return;
  }

  if (handIdx < 0 || handIdx >= curPlayer.hand.length) {
    await ctx.answerCbQuery("❌ ورقة غير صالحة").catch(() => {}); return;
  }

  const card = curPlayer.hand[handIdx];
  const top  = s.discard[s.discard.length - 1];

  if (!canPlay(card, top, s.currentColor)) {
    await ctx.answerCbQuery(`❌ ${cardLabel(card)} — ما تنطبق الحين!`).catch(() => {}); return;
  }

  await ctx.answerCbQuery(`✅ لعبت ${cardLabel(card)}`).catch(() => {});
  await playCard(bot, chatId, curPlayer, handIdx, "player");
}

export async function handleUnoDraw(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "playing") {
    await ctx.answerCbQuery("❌ اللعبة مو شغالة").catch(() => {}); return;
  }

  const curPlayer = s.players[s.currentIdx];
  if (from.id !== curPlayer.id) {
    await ctx.answerCbQuery("⛔ مو دورك!").catch(() => {}); return;
  }

  if (s.drawPending > 0) {
    // Forced draw (from +2/+4)
    for (let i = 0; i < s.drawPending; i++) curPlayer.hand.push(drawFromDeck(s));
    await ctx.answerCbQuery(`😬 سحبت ${s.drawPending} أوراق!`).catch(() => {});
    s.drawPending = 0;
    advanceTurn(s);
    await sendTurnMessage(bot, chatId);
    return;
  }

  if (s.hasDrawn) {
    await ctx.answerCbQuery("سحبت مسبقاً — مرّر الدور!").catch(() => {}); return;
  }

  const drawn = drawFromDeck(s);
  curPlayer.hand.push(drawn);
  s.hasDrawn = true;

  const top = s.discard[s.discard.length - 1];
  const playable = canPlay(drawn, top, s.currentColor);

  await ctx.answerCbQuery(
    playable ? `🃏 سحبت ${cardLabel(drawn)} — تقدر تلعبها!` : `🃏 سحبت ${cardLabel(drawn)} — ما تنطبق`
  ).catch(() => {});

  await sendTurnMessage(bot, chatId);
}

export async function handleUnoPass(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "playing") {
    await ctx.answerCbQuery("❌ اللعبة مو شغالة").catch(() => {}); return;
  }
  const curPlayer = s.players[s.currentIdx];
  if (from.id !== curPlayer.id) {
    await ctx.answerCbQuery("⛔ مو دورك!").catch(() => {}); return;
  }
  if (!s.hasDrawn) {
    await ctx.answerCbQuery("يجب تسحب ورقة أولاً!").catch(() => {}); return;
  }
  await ctx.answerCbQuery("⏭ تمرير الدور").catch(() => {});
  advanceTurn(s);
  await sendTurnMessage(bot, chatId);
}

export async function handleUnoColor(
  bot: Telegraf, ctx: Context, chatId: number, color: UnoCard["color"],
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "uno" || s.phase !== "playing") {
    await ctx.answerCbQuery("❌ اللعبة مو شغالة").catch(() => {}); return;
  }
  const curPlayer = s.players[s.currentIdx];
  if (from.id !== curPlayer.id) {
    await ctx.answerCbQuery("⛔ مو دورك!").catch(() => {}); return;
  }
  if (!s.colorChoosing) {
    await ctx.answerCbQuery("ما تحتاج تختار لون").catch(() => {}); return;
  }

  s.currentColor  = color;
  s.colorChoosing = false;

  await ctx.answerCbQuery(`🎨 اخترت ${COLOR_EMOJI[color]} ${COLOR_AR[color]}`).catch(() => {});

  await bot.telegram.sendMessage(chatId,
    `🎨 <b>${esc(dn(curPlayer))}</b> اختار <b>${COLOR_EMOJI[color]} ${COLOR_AR[color]}</b>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  // If +4 was played, apply pending draws then skip
  if (s.drawPending > 0) {
    advanceTurn(s); // advance to +4 victim
    // drawPending remains, victim must draw
  } else {
    advanceTurn(s);
  }

  await sendTurnMessage(bot, chatId);
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
    // Player called UNO for themselves — safe!
    if (s.unoChallengeTimer) { clearTimeout(s.unoChallengeTimer); s.unoChallengeTimer = undefined; }
    s.unoCallerId = undefined;
    await ctx.answerCbQuery("🔔 UNO! — آمن!").catch(() => {});
    await bot.telegram.sendMessage(chatId,
      `🔔 <b>${esc(dn(challenged))}</b> قال <b>UNO!</b> بوقته — آمن! 👌`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  } else {
    // Someone caught them!
    if (s.unoChallengeTimer) { clearTimeout(s.unoChallengeTimer); s.unoChallengeTimer = undefined; }
    s.unoCallerId = undefined;
    const catcher = s.players.find(p => p.id === from.id);
    if (!catcher) { await ctx.answerCbQuery("⛔ أنت مو في اللعبة").catch(() => {}); return; }

    challenged.hand.push(drawFromDeck(s));
    challenged.hand.push(drawFromDeck(s));
    await ctx.answerCbQuery(`📣 اصطدته! ${esc(dn(challenged))} يسحب ورقتين!`).catch(() => {});
    await bot.telegram.sendMessage(chatId,
      `📣 <b>${esc(dn(catcher))}</b> سمّع على <b>${esc(dn(challenged))}</b>!\n💀 ${esc(dn(challenged))} يسحب ورقتين عقوبة!`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    await sendTurnMessage(bot, chatId);
  }
}

// ─── Launch ───────────────────────────────────────────────────────────────────

async function launchUno(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "uno") return;

  s.phase = "playing";
  s.deck  = createDeck();

  // Deal hands
  for (const p of s.players) {
    for (let i = 0; i < HAND_SIZE; i++) p.hand.push(drawFromDeck(s));
  }

  // Flip first card (must be a number card)
  let first = drawFromDeck(s);
  while (first.color === "wild" || first.value === "skip" || first.value === "reverse" || first.value === "+2") {
    s.deck.unshift(first); // put back at bottom
    s.deck = [...s.deck.slice(0, s.deck.length - 1), ...shuffle([first, ...s.deck.slice(s.deck.length - 1)])];
    first = drawFromDeck(s);
  }
  s.discard      = [first];
  s.currentColor = first.color;
  s.currentIdx   = 0;
  s.direction    = 1;
  s.drawPending  = 0;
  s.hasDrawn     = false;
  s.colorChoosing = false;

  // Send start image of top card
  try {
    const buf = await generateUnoTopCardImage(first.color, first.value, first.color);
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption: `🃏 <b>أونو — تبدأ!</b>\nالورقة الأولى: ${cardLabel(first)}\n\n${s.players.map(p => `• ${esc(dn(p))}: ${HAND_SIZE} أوراق`).join("\n")}`,
      parse_mode: "HTML",
    }).catch(() => {});
  } catch (e) {
    logger.warn({ err: e }, "uno top card image failed");
    await bot.telegram.sendMessage(chatId,
      `🃏 <b>أونو — تبدأ!</b>\nالورقة الأولى: ${cardLabel(first)}\n${s.players.map(p => `• ${esc(dn(p))}: ${HAND_SIZE} أوراق`).join("\n")}`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  await sendTurnMessage(bot, chatId);
}
