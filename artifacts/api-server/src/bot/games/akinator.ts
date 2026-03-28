import type { Telegraf } from "telegraf";
import { Markup } from "telegraf";
import OpenAI from "openai";
import { gameStates, clearGame } from "../state.js";
import type { AkinatorState } from "../state.js";
import {
  generateAkinatorQuestionCard,
  generateAkinatorGuessCard,
  generateAkinatorWinCard,
  generateAkinatorLoseCard,
  generateAkinatorWelcomeCard,
} from "../akinatorCard.js";

// ─── OpenAI client ────────────────────────────────────────────────────────────

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY
        ?? process.env.OPENAI_API_KEY
        ?? "not-configured",
});

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_STEPS = 20;

const ANSWER_MAP: Record<string, string> = {
  yes:    "نعم",
  no:     "لا",
  maybe:  "من الممكن",
  probno: "الظاهر لا",
  dk:     "لا أعلم",
};

const ANSWER_EMOJI: Record<string, string> = {
  yes: "✅", no: "❌", maybe: "🔶", probno: "🔸", dk: "🤷",
};

// ─── AI System Prompt ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `أنت "المارد العبقري" — مارد ذكي يلعب لعبة أكيناتور باللغة العربية.
هدفك: تخمين أي شخصية يفكر فيها المستخدم — حقيقية أو خيالية، عربية أو عالمية.

قواعد صارمة:
1. اطرح سؤالاً واحداً فقط في كل رد باللغة العربية الفصحى
2. الأسئلة تضيّق دائرة الشخصيات بكفاءة عالية (مثال: هل هو شخصية حقيقية؟ هل هو رياضي؟ هل هو حي الآن؟)
3. استخدم كل إجابة سابقة لتحليل الشخصية وطرح سؤال أذكى
4. بعد 6-10 أسئلة مع إجابات واضحة، خمّن إذا كنت واثقاً بما يكفي
5. تستطيع تخمين أي شخصية: لاعبون، فنانون، ممثلون، شخصيات كرتونية، أنمي، ألعاب، تاريخ، أساطير، إلخ
6. الأجوبة الممكنة للمستخدم: نعم / لا / من الممكن / الظاهر لا / لا أعلم
7. لا تكرر أسئلة طُرحت من قبل أبداً
8. إذا خُمِّنت شخصية وكانت خاطئة، اطرح أسئلة جديدة لتضيّق أكثر ثم خمّن مجدداً
9. كن واثقاً وجريئاً في التخمين عند وضوح الصورة

أجب دائماً بـ JSON فقط، بدون أي نص آخر خارج الـ JSON:
- للسؤال: {"action":"question","content":"نص السؤال بالعربية"}
- للتخمين: {"action":"guess","content":"اسم الشخصية بالعربية"}`;

// ─── AI caller ────────────────────────────────────────────────────────────────

async function callAI(
  history: Array<{ question: string; answer: string }>,
  triedChars: string[],
): Promise<{ action: "question" | "guess"; content: string }> {
  const lines: string[] = [];

  if (history.length === 0) {
    lines.push("ابدأ اللعبة بأول سؤال ذكي يضيّق دائرة الشخصيات.");
  } else {
    lines.push("تاريخ الأسئلة والأجوبة حتى الآن:");
    for (const h of history) {
      lines.push(`• ${h.question} — ${h.answer}`);
    }
  }

  if (triedChars.length > 0) {
    lines.push(`\nجرّبت هذه التخمينات وكانت خاطئة: ${triedChars.join("، ")}`);
    lines.push("لا تعد لتخمين نفس الشخصية.");
  }

  const resp = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 150,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: lines.join("\n") },
    ],
  });

  const text = resp.choices[0]?.message?.content?.trim() ?? "";
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error("Bad AI response: " + text);

  const parsed = JSON.parse(match[0]) as { action?: string; content?: string };
  if (!parsed.action || !parsed.content) throw new Error("Missing fields in AI JSON");
  if (parsed.action !== "question" && parsed.action !== "guess") throw new Error("Unknown action");

  return { action: parsed.action, content: parsed.content.trim() };
}

// ─── Wikipedia image fetch (Arabic) ──────────────────────────────────────────

async function fetchWithTimeout(url: string, ms = 7000): Promise<Response> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      headers: { "User-Agent": "TelegramGameBot/1.0" },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWikiImage(charName: string): Promise<Buffer | null> {
  try {
    const url = `https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(charName)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = await res.json() as { thumbnail?: { source?: string } };
    const imgUrl = data.thumbnail?.source;
    if (!imgUrl) return null;
    const imgRes = await fetchWithTimeout(imgUrl);
    if (!imgRes.ok) return null;
    return Buffer.from(await imgRes.arrayBuffer());
  } catch {
    return null;
  }
}

// ─── Keyboard helpers ─────────────────────────────────────────────────────────

function answerKb(chatId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅  نعم",         `aki:yes:${chatId}`),
      Markup.button.callback("❌  لا",           `aki:no:${chatId}`),
    ],
    [
      Markup.button.callback("🔶  من الممكن",   `aki:maybe:${chatId}`),
      Markup.button.callback("🔸  الظاهر لا",   `aki:probno:${chatId}`),
    ],
    [
      Markup.button.callback("🤷  أنا لا أعلم", `aki:dk:${chatId}`),
    ],
  ]);
}

function guessKb(chatId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅  نعم، أصبت!",  `aki:correct:${chatId}`),
      Markup.button.callback("❌  لا، أخطأت",   `aki:wrong:${chatId}`),
    ],
  ]);
}

// ─── Send / replace card ──────────────────────────────────────────────────────

async function sendCard(
  bot: Telegraf,
  chatId: number,
  state: AkinatorState,
  buf: Buffer,
  kb: ReturnType<typeof Markup.inlineKeyboard>,
) {
  if (state.msgId) {
    bot.telegram.deleteMessage(chatId, state.msgId).catch(() => {});
    state.msgId = null;
  }
  const msg = await bot.telegram.sendPhoto(
    chatId,
    { source: buf },
    { reply_markup: kb.reply_markup },
  );
  state.msgId = msg.message_id;
}

// ─── Owner check ──────────────────────────────────────────────────────────────

function isOwner(state: AkinatorState, userId: number): boolean {
  return state.userId === userId;
}

// ─── Core AI step (ask question or make a guess) ──────────────────────────────

async function doAiStep(bot: Telegraf, chatId: number, state: AkinatorState): Promise<void> {
  let ai: { action: "question" | "guess"; content: string };
  try {
    ai = await callAI(state.history, state.triedChars);
  } catch {
    bot.telegram.sendMessage(chatId, "⚠️ المارد تعثّر — جرّب مرة ثانية.").catch(() => {});
    clearGame(chatId);
    return;
  }

  if (ai.action === "guess") {
    state.triedChars.push(ai.content);
    state.guessAttempts++;
    state.phase = "guessing";
    const buf = await generateAkinatorGuessCard(ai.content, state.guessAttempts);
    await sendCard(bot, chatId, state, buf, guessKb(chatId));
  } else {
    state.step++;
    state.currentQuestion = ai.content;
    const buf = await generateAkinatorQuestionCard(ai.content, state.step, MAX_STEPS);
    await sendCard(bot, chatId, state, buf, answerKb(chatId));
  }
}

// ─── Exported game functions ──────────────────────────────────────────────────

export async function startAkinator(
  bot: Telegraf,
  chatId: number,
  userId: number,
  _username: string | undefined,
  _firstName: string,
  _lastName: string,
): Promise<void> {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId, "⚠️ في لعبة شغالة بالفعل.").catch(() => {});
    return;
  }

  const state: AkinatorState = {
    type:            "akinator",
    chatId,
    userId,
    msgId:           null,
    step:            0,
    history:         [],
    currentQuestion: null,
    phase:           "playing",
    guessAttempts:   0,
    triedChars:      [],
  };
  gameStates.set(chatId, state);

  const buf    = await generateAkinatorWelcomeCard();
  const startKb = Markup.inlineKeyboard([
    [Markup.button.callback("🔮  ابدأ التحدي!", `aki:start:${chatId}`)],
  ]);
  const msg = await bot.telegram.sendPhoto(chatId, { source: buf }, { reply_markup: startKb.reply_markup });
  state.msgId = msg.message_id;
}

export async function handleAkinatorStart(
  bot: Telegraf,
  ctx: { from: { id: number }; answerCbQuery: (s?: string) => Promise<void> },
  chatId: number,
): Promise<void> {
  const state = gameStates.get(chatId) as AkinatorState | undefined;
  if (!state || state.type !== "akinator") return;

  if (!isOwner(state, ctx.from.id)) {
    await ctx.answerCbQuery("🚫 اللعبة ليست لك!").catch(() => {});
    return;
  }

  await ctx.answerCbQuery("🔮").catch(() => {});
  await doAiStep(bot, chatId, state);
}

export async function handleAkinatorAnswer(
  bot: Telegraf,
  ctx: { from: { id: number }; answerCbQuery: (s?: string) => Promise<void> },
  chatId: number,
  answerKey: string,
): Promise<void> {
  const state = gameStates.get(chatId) as AkinatorState | undefined;
  if (!state || state.type !== "akinator" || state.phase !== "playing") return;

  if (!isOwner(state, ctx.from.id)) {
    await ctx.answerCbQuery("🚫 فقط من بدأ اللعبة يجيب!").catch(() => {});
    return;
  }

  const emoji = ANSWER_EMOJI[answerKey] ?? "🤷";
  const label = ANSWER_MAP[answerKey]  ?? "لا أعلم";
  await ctx.answerCbQuery(emoji).catch(() => {});

  if (state.currentQuestion) {
    state.history.push({ question: state.currentQuestion, answer: label });
  }

  if (state.step >= MAX_STEPS) {
    await doAiStep(bot, chatId, state);
    return;
  }

  await doAiStep(bot, chatId, state);
}

export async function handleAkinatorCorrect(
  bot: Telegraf,
  ctx: { from: { id: number }; answerCbQuery: (s?: string) => Promise<void> },
  chatId: number,
): Promise<void> {
  const state = gameStates.get(chatId) as AkinatorState | undefined;
  if (!state || state.type !== "akinator") return;

  if (!isOwner(state, ctx.from.id)) {
    await ctx.answerCbQuery("🚫 فقط من بدأ اللعبة يجيب!").catch(() => {});
    return;
  }

  await ctx.answerCbQuery("🎉").catch(() => {});

  if (state.msgId) bot.telegram.deleteMessage(chatId, state.msgId).catch(() => {});
  state.msgId = null;

  const guessedChar = state.triedChars[state.triedChars.length - 1] ?? "الشخصية";
  const charImage   = await fetchWikiImage(guessedChar);

  const buf = await generateAkinatorWinCard(guessedChar, state.step, charImage);
  await bot.telegram.sendPhoto(chatId, { source: buf });
  clearGame(chatId);
}

export async function handleAkinatorWrong(
  bot: Telegraf,
  ctx: { from: { id: number }; answerCbQuery: (s?: string) => Promise<void> },
  chatId: number,
): Promise<void> {
  const state = gameStates.get(chatId) as AkinatorState | undefined;
  if (!state || state.type !== "akinator") return;

  if (!isOwner(state, ctx.from.id)) {
    await ctx.answerCbQuery("🚫 فقط من بدأ اللعبة يجيب!").catch(() => {});
    return;
  }

  await ctx.answerCbQuery("❌").catch(() => {});
  state.phase = "playing";

  if (state.guessAttempts >= 4) {
    if (state.msgId) bot.telegram.deleteMessage(chatId, state.msgId).catch(() => {});
    state.msgId = null;
    const buf = await generateAkinatorLoseCard();
    await bot.telegram.sendPhoto(chatId, { source: buf });
    clearGame(chatId);
    return;
  }

  await doAiStep(bot, chatId, state);
}

export async function handleAkinatorStop(
  bot: Telegraf,
  chatId: number,
): Promise<void> {
  const state = gameStates.get(chatId) as AkinatorState | undefined;
  if (!state || state.type !== "akinator") return;
  if (state.msgId) bot.telegram.deleteMessage(chatId, state.msgId).catch(() => {});
  clearGame(chatId);
  bot.telegram.sendMessage(chatId, "🔮 انتهت جلسة المارد العبقري.").catch(() => {});
}
