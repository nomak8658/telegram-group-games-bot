import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type WireState, type WirePlayer, type WireEntry, type WireColor,
} from "../state.js";
import { generateWireBombCard, generateWireExplodeCard, generateWireDefuseCard } from "../wireCard.js";
import { logger } from "../../lib/logger.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dnW(p: WirePlayer): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return full || (p.username ? `@${p.username}` : String(p.id));
}

function toP(p: WirePlayer) {
  return { id: p.id, username: p.username, name: dnW(p) };
}

const WIRE_AR: Record<WireColor, string> = {
  red:    "الأحمر",
  blue:   "الأزرق",
  green:  "الأخضر",
  yellow: "الأصفر",
};

const WIRE_ICON: Record<WireColor, string> = {
  red:    "🔴",
  blue:   "🔵",
  green:  "🟢",
  yellow: "🟡",
};

function remainingSec(s: WireState): number {
  return Math.max(0, Math.round((s.explodeAt - Date.now()) / 1000));
}

function teamName(team: "A" | "B"): string {
  return team === "A" ? "فريق أ" : "فريق ب";
}

function teamNames(s: WireState, team: "A" | "B"): string[] {
  const map = team === "A" ? s.teamA : s.teamB;
  return [...map.values()].map(dnW);
}

function buildJoinMessage(s: WireState): string {
  const aN = [...s.teamA.values()].map(p => `• ${esc(dnW(p))}`).join("\n") || "—";
  const bN = [...s.teamB.values()].map(p => `• ${esc(dnW(p))}`).join("\n") || "—";
  return (
    `🔌 <b>قنبلة الثواني الأخيرة</b>\n\n` +
    `فريقان يتنافسان — أول فريق يقطع السلك الصحيح يفكك القنبلة ويفوز\n` +
    `⚠️ الحذر: سلك واحد يُفجّر القنبلة فوراً!\n\n` +
    `━━━━━━━━━━━━━━\n` +
    `🔵 <b>فريق أ</b>  (${s.teamA.size}):\n${aN}\n\n` +
    `🟠 <b>فريق ب</b>  (${s.teamB.size}):\n${bN}\n` +
    `━━━━━━━━━━━━━━`
  );
}

function buildWireKeyboard(chatId: number, s: WireState) {
  const available = s.wires.filter(w => !w.cut);
  const rows = available.map(w => [
    Markup.button.callback(
      `${WIRE_ICON[w.color]}  السلك ${WIRE_AR[w.color]}`,
      `wire:cut:${chatId}:${w.color}`
    )
  ]);
  return Markup.inlineKeyboard(rows);
}

function makeWires(): WireEntry[] {
  const effects: WireEntry["effect"][] = ["defuse", "explode", "delay", "speed"];
  const colors: WireColor[] = ["red", "blue", "green", "yellow"];
  // Shuffle colors
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  // Shuffle effects
  for (let i = effects.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [effects[i], effects[j]] = [effects[j], effects[i]];
  }
  return colors.map((color, i) => ({ color, effect: effects[i], cut: false }));
}

const INITIAL_TIMER_MS = 65_000;   // 65 seconds
const VOTE_TIMEOUT_MS  = 22_000;   // 22 seconds per team to pick

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startWire(
  bot: Telegraf,
  chatId: number,
  hostId: number,
  hostUsername: string | undefined,
  hostFirst: string,
  hostLast: string,
): Promise<void> {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId, "⚠️ في لعبة شغالة! أوقفوها أولاً بـ /stop").catch(() => {});
    return;
  }

  const s: WireState = {
    type: "wire",
    phase: "joining",
    hostId,
    teamA: new Map(),
    teamB: new Map(),
    wires: [],
    currentTeam: "A",
    explodeAt: 0,
    round: 0,
    cutting: false,
  };

  const host: WirePlayer = { id: hostId, username: hostUsername, firstName: hostFirst, lastName: hostLast };
  s.teamA.set(hostId, host);
  gameStates.set(chatId, s);

  const msg = await bot.telegram.sendMessage(
    chatId,
    buildJoinMessage(s),
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("🔵  انضم لفريق أ",  `wire:joinA:${chatId}`),
          Markup.button.callback("🟠  انضم لفريق ب",  `wire:joinB:${chatId}`),
        ],
        [Markup.button.callback("▶️  ابدأ اللعبة",     `wire:start:${chatId}`)],
      ]),
    }
  ).catch(() => null);

  if (msg) s.joinMsgId = msg.message_id;
}

export async function handleWireJoin(
  bot: Telegraf, ctx: Context, chatId: number, team: "A" | "B",
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "wire" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ التسجيل مو متاح الحين").catch(() => {}); return;
  }

  const p: WirePlayer = {
    id: from.id, username: from.username,
    firstName: from.first_name ?? "", lastName: from.last_name ?? "",
  };

  // Remove from other team if exists
  s.teamA.delete(from.id);
  s.teamB.delete(from.id);

  if (team === "A") s.teamA.set(from.id, p);
  else              s.teamB.set(from.id, p);

  await ctx.answerCbQuery(`✅ انضممت لفريق ${team === "A" ? "أ" : "ب"}!`).catch(() => {});

  // Update join message
  if (s.joinMsgId) {
    bot.telegram.editMessageText(
      chatId, s.joinMsgId, undefined, buildJoinMessage(s),
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("🔵  انضم لفريق أ",  `wire:joinA:${chatId}`),
            Markup.button.callback("🟠  انضم لفريق ب",  `wire:joinB:${chatId}`),
          ],
          [Markup.button.callback("▶️  ابدأ اللعبة",     `wire:start:${chatId}`)],
        ]),
      }
    ).catch(() => {});
  }
}

export async function handleWireStart(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "wire" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ ما في تسجيل").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط من أنشأ اللعبة يقدر يبدأها!").catch(() => {}); return;
  }
  if (s.teamA.size < 1 || s.teamB.size < 1) {
    await ctx.answerCbQuery("⚠️ كل فريق يحتاج لاعب واحد على الأقل!").catch(() => {}); return;
  }

  await ctx.answerCbQuery("🔌 القنبلة تشتغل...").catch(() => {});
  ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});

  launchWire(bot, chatId);
}

export async function handleWireCut(
  bot: Telegraf, ctx: Context, chatId: number, color: WireColor,
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "wire" || s.phase !== "playing") {
    await ctx.answerCbQuery("❌ اللعبة مو شغالة").catch(() => {}); return;
  }

  const inTeam = s.currentTeam === "A" ? s.teamA.has(from.id) : s.teamB.has(from.id);
  if (!inTeam) {
    await ctx.answerCbQuery("ليس دورك — انتظر فريقك!").catch(() => {}); return;
  }

  const wire = s.wires.find(w => w.color === color && !w.cut);
  if (!wire) {
    await ctx.answerCbQuery("هذا السلك مقطوع مسبقاً!").catch(() => {}); return;
  }

  // Race condition guard
  if (s.cutting) {
    await ctx.answerCbQuery("...").catch(() => {}); return;
  }
  s.cutting = true;

  // Cancel timers
  if (s.voteTimer)  { clearTimeout(s.voteTimer);  s.voteTimer  = undefined; }
  if (s.bombTimer)  { clearTimeout(s.bombTimer);   s.bombTimer  = undefined; }

  await ctx.answerCbQuery(`✂️ قطع السلك ${WIRE_AR[color]}!`).catch(() => {});
  ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});

  const cutter = (s.currentTeam === "A" ? s.teamA : s.teamB).get(from.id)!;

  await bot.telegram.sendMessage(
    chatId,
    `✂️ <b>${esc(dnW(cutter))}</b> يقطع السلك <b>${WIRE_AR[color]}</b>...`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  // Dramatic pause before reveal
  await new Promise(r => setTimeout(r, 2_000));

  wire.cut = true;
  wire.cutByTeam = s.currentTeam;
  s.round++;

  await resolveCut(bot, chatId, wire);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function launchWire(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "wire") return;

  s.phase       = "playing";
  s.wires       = makeWires();
  s.currentTeam = "A";
  s.round       = 0;
  s.cutting     = false;
  s.explodeAt   = Date.now() + INITIAL_TIMER_MS;

  const aN = teamNames(s, "A");
  const bN = teamNames(s, "B");

  await bot.telegram.sendMessage(
    chatId,
    `🔌 <b>القنبلة شُغّلت!</b>\n\n` +
    `⏱ <b>65 ثانية</b> — والوقت يجري...\n\n` +
    `<b>القواعد:</b>\n` +
    `• 4 أسلاك مجهولة الهوية\n` +
    `• سلك يُفكّك القنبلة — سلك يُفجّرها فوراً\n` +
    `• سلك يُضيف وقتاً — سلك يُسرّع العد التنازلي\n` +
    `• الفرق تتناوب — كل فريق 22 ثانية للاختيار\n` +
    `• إذا انتهى الوقت: الكل يخسر!\n\n` +
    `🔵 <b>فريق أ:</b> ${aN.join("، ")}\n` +
    `🟠 <b>فريق ب:</b> ${bN.join("، ")}\n\n` +
    `<i>فريق أ يبدأ...</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  await new Promise(r => setTimeout(r, 2_000));
  sendTurnMessage(bot, chatId);
}

async function sendTurnMessage(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "wire" || s.phase !== "playing") return;

  s.cutting = false;

  const rem    = remainingSec(s);
  const team   = s.currentTeam;
  const teamN  = teamName(team);
  const tColor = team === "A" ? "🔵" : "🟠";

  // Available wires list
  const available = s.wires.filter(w => !w.cut);
  const wireList  = available.map(w => `${WIRE_ICON[w.color]} ${WIRE_AR[w.color]}`).join("  •  ");
  const cutCount  = s.wires.filter(w => w.cut).length;

  // Pressure messages
  const pressureMsg = cutCount === 2
    ? `\n⚡ <b>تبقى سلكان فقط — الاحتمالات ارتفعت!</b>`
    : cutCount === 3
    ? `\n🎰 <b>سلك واحد متبقٍ — إما النجاة أو الانفجار!</b>`
    : "";

  await bot.telegram.sendMessage(
    chatId,
    `${tColor} <b>دور ${teamN}</b> — الجولة ${s.round + 1}\n\n` +
    `⏱ يتبقى: <b>${rem} ثانية</b>${rem <= 15 ? " ⚠️" : ""}\n` +
    `الأسلاك المتبقية: ${wireList}${pressureMsg}\n\n` +
    `<i>اختاروا سلكاً خلال 22 ثانية... أو ستختار القنبلة!</i>`,
    {
      parse_mode: "HTML",
      ...buildWireKeyboard(chatId, s),
    }
  ).catch(() => {});

  // Send bomb status card
  try {
    const aN = teamNames(s, "A");
    const bN = teamNames(s, "B");
    const buf = await generateWireBombCard(s.wires, rem, team, aN, bN, s.round + 1);
    await bot.telegram.sendPhoto(chatId, { source: buf }).catch(() => {});
  } catch (e) {
    logger.warn({ err: e }, "wire bomb card failed");
  }

  // Set vote timeout (panic cut if no one picks)
  s.voteTimer = setTimeout(() => panicCut(bot, chatId), VOTE_TIMEOUT_MS);

  // Set bomb explosion timer
  const timeLeft = s.explodeAt - Date.now();
  if (timeLeft <= 0) {
    timeoutExplode(bot, chatId); return;
  }
  s.bombTimer = setTimeout(() => timeoutExplode(bot, chatId), timeLeft);
}

async function resolveCut(bot: Telegraf, chatId: number, wire: WireEntry): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "wire") return;

  const team  = s.currentTeam;
  const teamN = teamName(team);
  const other = team === "A" ? "B" : "A";

  switch (wire.effect) {

    case "defuse": {
      await bot.telegram.sendMessage(
        chatId,
        `💚 <b>${WIRE_AR[wire.color]}...</b>\n\n` +
        `━━━━━━━━━━━━━━\n` +
        `✅ <b>تُفكِّك!</b>\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `القنبلة أُوقفت! <b>${teamN}</b> فاز!`,
        { parse_mode: "HTML" }
      ).catch(() => {});

      await endWire(bot, chatId, team, wire.color, "defuse");
      return;
    }

    case "explode": {
      await bot.telegram.sendMessage(
        chatId,
        `❌ <b>${WIRE_AR[wire.color]}...</b>\n\n` +
        `━━━━━━━━━━━━━━\n` +
        `💥 <b>يُفجّر!</b>\n` +
        `━━━━━━━━━━━━━━`,
        { parse_mode: "HTML" }
      ).catch(() => {});

      await new Promise(r => setTimeout(r, 1_200));
      await endWire(bot, chatId, team, wire.color, "explode");
      return;
    }

    case "delay": {
      // Add 20 seconds
      s.explodeAt += 20_000;
      const newRem = remainingSec(s);

      await bot.telegram.sendMessage(
        chatId,
        `💛 <b>${WIRE_AR[wire.color]}...</b>\n\n` +
        `━━━━━━━━━━━━━━\n` +
        `⏳ <b>تأجيل! +20 ثانية</b>\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `الوقت المتبقي: <b>${newRem} ثانية</b>\n` +
        `دور <b>${teamName(other)}</b>...`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      break;
    }

    case "speed": {
      // Remove 15 seconds (minimum 5s)
      s.explodeAt = Math.max(s.explodeAt - 15_000, Date.now() + 5_000);
      const newRem = remainingSec(s);

      await bot.telegram.sendMessage(
        chatId,
        `⚡ <b>${WIRE_AR[wire.color]}...</b>\n\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔴 <b>تسريع! -15 ثانية</b>\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `الوقت المتبقي: <b>${newRem} ثانية</b> ⚠️\n` +
        `دور <b>${teamName(other)}</b>...`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      break;
    }
  }

  // Check if only 1 wire remains (the final choice)
  const remaining = s.wires.filter(w => !w.cut);
  if (remaining.length === 1) {
    s.currentTeam = other;
    await new Promise(r => setTimeout(r, 1_500));
    await sendFinalWire(bot, chatId, remaining[0]);
    return;
  }

  // Switch teams
  s.currentTeam = other;
  await new Promise(r => setTimeout(r, 1_800));
  sendTurnMessage(bot, chatId);
}

async function sendFinalWire(bot: Telegraf, chatId: number, wire: WireEntry): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "wire" || s.phase !== "playing") return;

  s.cutting = false;
  const team  = s.currentTeam;
  const teamN = teamName(team);
  const rem   = remainingSec(s);

  await bot.telegram.sendMessage(
    chatId,
    `🎰 <b>السلك الأخير!</b>\n\n` +
    `⏱ يتبقى: <b>${rem} ثانية</b>\n` +
    `دور <b>${teamN}</b>\n\n` +
    `هذا هو السلك الأخير —\n` +
    `إما يُفكّك القنبلة... أو يُفجّرها!\n\n` +
    `<i>22 ثانية للضغط...</i>`,
    {
      parse_mode: "HTML",
      ...buildWireKeyboard(chatId, s),
    }
  ).catch(() => {});

  // Send final bomb card
  try {
    const aN = teamNames(s, "A");
    const bN = teamNames(s, "B");
    const buf = await generateWireBombCard(s.wires, rem, team, aN, bN, s.round + 1);
    await bot.telegram.sendPhoto(chatId, { source: buf }).catch(() => {});
  } catch (e) {
    logger.warn({ err: e }, "wire final bomb card failed");
  }

  s.voteTimer = setTimeout(() => panicCut(bot, chatId), VOTE_TIMEOUT_MS);
  const timeLeft = s.explodeAt - Date.now();
  if (timeLeft <= 0) { timeoutExplode(bot, chatId); return; }
  s.bombTimer = setTimeout(() => timeoutExplode(bot, chatId), timeLeft);
}

async function panicCut(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "wire" || s.phase !== "playing") return;
  if (s.cutting) return;
  s.cutting = true;

  if (s.bombTimer) { clearTimeout(s.bombTimer); s.bombTimer = undefined; }

  const available = s.wires.filter(w => !w.cut);
  if (!available.length) { clearGame(chatId); return; }

  const wire = available[Math.floor(Math.random() * available.length)];

  await bot.telegram.sendMessage(
    chatId,
    `⏰ <b>انتهى الوقت!</b> القنبلة اختارت بنفسها...\n` +
    `✂️ تقطع <b>السلك ${WIRE_AR[wire.color]}</b>...`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  await new Promise(r => setTimeout(r, 2_000));

  wire.cut = true;
  wire.cutByTeam = s.currentTeam;
  s.round++;

  await resolveCut(bot, chatId, wire);
}

async function timeoutExplode(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "wire" || s.phase !== "playing") return;

  if (s.voteTimer) { clearTimeout(s.voteTimer); s.voteTimer = undefined; }
  if (s.cutting) return; // already handling a cut
  s.cutting = true;

  await bot.telegram.sendMessage(
    chatId,
    `⏰ <b>انتهى الوقت!</b>\n\n💥 القنبلة انفجرت وحدها — خسر الجميع!`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  // Record no winners
  const all = [...s.teamA.values(), ...s.teamB.values()];
  for (const p of all) recordGame(chatId, [toP(p)]);

  try {
    const teamN = `${teamName("A")} و ${teamName("B")}`;
    const buf = await generateWireExplodeCard(teamN, "red");
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption: `⏰ <b>انتهى الوقت!</b>\nالقنبلة انفجرت — لا فائز!`,
      parse_mode: "HTML",
    }).catch(() => {});
  } catch (e) {
    logger.warn({ err: e }, "wire timeout card failed");
  }

  clearGame(chatId);
}

async function endWire(
  bot: Telegraf, chatId: number,
  cuttingTeam: "A" | "B",
  color: WireColor,
  outcome: "defuse" | "explode",
): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "wire") return;

  if (s.voteTimer) { clearTimeout(s.voteTimer); s.voteTimer = undefined; }
  if (s.bombTimer) { clearTimeout(s.bombTimer); s.bombTimer = undefined; }
  s.phase = "done";

  const winnerTeam = outcome === "defuse" ? cuttingTeam : (cuttingTeam === "A" ? "B" : "A");
  const loserTeam  = winnerTeam === "A" ? "B" : "A";

  const winners = [...(winnerTeam === "A" ? s.teamA : s.teamB).values()];
  const losers  = [...(loserTeam  === "A" ? s.teamA : s.teamB).values()];

  for (const p of winners) recordWin(chatId, toP(p));
  for (const p of losers)  recordGame(chatId, [toP(p)]);

  const winN   = teamName(winnerTeam);
  const loseN  = teamName(loserTeam);
  const reason = outcome === "defuse"
    ? `<b>${winN}</b> فككوا القنبلة بالسلك ${WIRE_AR[color]}!`
    : `<b>${loseN}</b> قطعوا السلك المتفجر — فاز <b>${winN}</b>!`;

  try {
    if (outcome === "defuse") {
      const buf = await generateWireDefuseCard(winN, color);
      await bot.telegram.sendPhoto(chatId, { source: buf }, {
        caption: `🏆 ${reason}\n\nمبروك لـ${winners.map(p => esc(dnW(p))).join("، ")}!`,
        parse_mode: "HTML",
      }).catch(() => {});
    } else {
      const buf = await generateWireExplodeCard(loseN, color);
      await bot.telegram.sendPhoto(chatId, { source: buf }, {
        caption: `💥 ${reason}\n\nمبروك لـ${winners.map(p => esc(dnW(p))).join("، ")}!`,
        parse_mode: "HTML",
      }).catch(() => {});
    }
  } catch (e) {
    logger.warn({ err: e }, "wire end card failed");
    await bot.telegram.sendMessage(
      chatId,
      `🏆 <b>النتيجة:</b> ${reason}`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  clearGame(chatId);
}
