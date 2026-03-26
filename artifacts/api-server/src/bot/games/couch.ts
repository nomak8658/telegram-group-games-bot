import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type CouchState, type CouchPlayer, type CouchQuestion,
} from "../state.js";
import {
  generateCouchStartCard,
  generateCouchQuestionCard,
  generateCouchSofaCard,
  generateCouchBothOnSofaCard,
  generateCouchWinCard,
} from "../couchCard.js";

// ─── Question Bank ──────────────────────────────────────────────────────────

const ALL_QUESTIONS: CouchQuestion[] = [
  // ── معرفة عامة سهلة ──────────────────────────────────────────────────────
  { text: "ما هي عاصمة المملكة العربية السعودية؟", answers: ["الرياض", "رياض"], type: "text", timeMs: 18000 },
  { text: "ما هي عاصمة الإمارات؟", answers: ["ابوظبي", "أبوظبي", "أبو ظبي", "ابو ظبي"], type: "text", timeMs: 18000 },
  { text: "ما هي عاصمة مصر؟", answers: ["القاهرة", "قاهرة"], type: "text", timeMs: 16000 },
  { text: "ما هي عاصمة فرنسا؟", answers: ["باريس"], type: "text", timeMs: 16000 },
  { text: "ما هي عاصمة اليابان؟", answers: ["طوكيو", "توكيو"], type: "text", timeMs: 16000 },
  { text: "ما هي عاصمة الكويت؟", answers: ["الكويت", "مدينة الكويت"], type: "text", timeMs: 16000 },
  { text: "ما هي عاصمة قطر؟", answers: ["الدوحة", "دوحة"], type: "text", timeMs: 16000 },
  { text: "ما هي عاصمة عُمان؟", answers: ["مسقط"], type: "text", timeMs: 18000 },
  { text: "ما هي عاصمة الأردن؟", answers: ["عمان"], type: "text", timeMs: 16000 },
  { text: "ما هي عاصمة تركيا؟", answers: ["انقرة", "أنقرة"], type: "text", timeMs: 18000 },
  { text: "ما هي عاصمة البحرين؟", answers: ["المنامة", "منامة"], type: "text", timeMs: 18000 },
  { text: "ما هي عاصمة ألمانيا؟", answers: ["برلين"], type: "text", timeMs: 16000 },
  { text: "ما هي عاصمة إيطاليا؟", answers: ["روما"], type: "text", timeMs: 16000 },
  { text: "ما هي عاصمة إسبانيا؟", answers: ["مدريد"], type: "text", timeMs: 16000 },
  { text: "أطول نهر في العالم؟", answers: ["النيل", "نهر النيل"], type: "text", timeMs: 18000 },
  { text: "أكبر كوكب في المجموعة الشمسية؟", answers: ["المشتري"], type: "text", timeMs: 18000 },
  { text: "أسرع حيوان بري في العالم؟", answers: ["الفهد"], type: "text", timeMs: 18000 },
  { text: "أطول حيوان في العالم؟", answers: ["الزرافة"], type: "text", timeMs: 18000 },
  { text: "أكبر محيط في العالم؟", answers: ["الهادئ", "المحيط الهادئ", "المحيط الهادي"], type: "text", timeMs: 18000 },
  { text: "أكبر دولة في العالم من حيث المساحة؟", answers: ["روسيا"], type: "text", timeMs: 16000 },
  { text: "أول رجل وصل إلى سطح القمر؟", answers: ["أرمسترونج", "ارمسترونج", "نيل أرمسترونج"], type: "text", timeMs: 18000 },
  { text: "في أي دولة يقع برج إيفل؟", answers: ["فرنسا"], type: "text", timeMs: 14000 },
  { text: "ما هو أكبر حيوان في العالم؟", answers: ["الحوت الأزرق", "حوت أزرق", "الحوت"], type: "text", timeMs: 18000 },
  { text: "ما هو أصغر كوكب في المجموعة الشمسية؟", answers: ["عطارد"], type: "text", timeMs: 20000 },
  { text: "ما هي الدولة الأكثر سكاناً في العالم؟", answers: ["الهند"], type: "text", timeMs: 20000 },
  { text: "في أي دولة يقع نهر الأمازون؟", answers: ["البرازيل"], type: "text", timeMs: 20000 },
  { text: "ما هو أكبر بلد في القارة الأفريقية مساحةً؟", answers: ["الجزائر"], type: "text", timeMs: 20000 },
  { text: "في أي قارة تقع مصر؟", answers: ["افريقيا", "أفريقيا"], type: "text", timeMs: 16000 },
  { text: "ما هي أكبر قارة في العالم؟", answers: ["آسيا", "اسيا"], type: "text", timeMs: 16000 },
  { text: "ما لون الدم؟", answers: ["أحمر", "احمر"], type: "text", timeMs: 12000 },
  { text: "ما لون السماء؟", answers: ["أزرق", "ازرق"], type: "text", timeMs: 12000 },
  { text: "ما لون الثلج؟", answers: ["أبيض", "ابيض"], type: "text", timeMs: 12000 },
  { text: "ما لون الموز؟", answers: ["أصفر", "اصفر"], type: "text", timeMs: 12000 },
  { text: "النحل يصنع ماذا؟", answers: ["عسل", "العسل"], type: "text", timeMs: 14000 },
  { text: "ما هي اللغة الرسمية في البرازيل؟", answers: ["البرتغالية", "برتغالية", "البرتغاليه"], type: "text", timeMs: 18000 },
  { text: "كم لاعباً في فريق كرة القدم؟", answers: ["11", "أحد عشر", "احد عشر"], type: "text", timeMs: 14000 },
  { text: "كأس العالم يُقام كل كم سنة؟", answers: ["4", "أربع", "أربعة", "اربع", "اربعة"], type: "text", timeMs: 14000 },
  { text: "في أي دولة أُقيم كأس العالم 2022؟", answers: ["قطر"], type: "text", timeMs: 16000 },
  { text: "كم مرة فازت البرازيل بكأس العالم؟", answers: ["5", "خمس", "خمسة"], type: "text", timeMs: 18000 },
  { text: "شركة iPhone من تصنع؟", answers: ["أبل", "ابل", "apple"], type: "text", timeMs: 14000 },
  { text: "اسم الشخصية الرئيسية في لعبة Super Mario؟", answers: ["ماريو", "mario"], type: "text", timeMs: 16000 },
  { text: "الشركة المصنعة لـ PlayStation؟", answers: ["سوني", "sony"], type: "text", timeMs: 16000 },
  { text: "اسم الفرقة الأشهر في التاريخ من بريطانيا؟", answers: ["بيتلز", "البيتلز", "beatles"], type: "text", timeMs: 20000 },
  { text: "الشعار Just Do It لأي شركة؟", answers: ["نايكي", "nike"], type: "text", timeMs: 16000 },
  { text: "لون شعار كوكاكولا؟", answers: ["أحمر", "احمر"], type: "text", timeMs: 12000 },
  { text: "علم اليابان فيه شكل ماذا؟", answers: ["دائرة", "قرص", "شمس", "دايرة"], type: "text", timeMs: 14000 },
  { text: "ما هو الحيوان الذي يعيش أطول مدة؟", answers: ["السلحفاة", "سلحفاة"], type: "text", timeMs: 20000 },
  { text: "أي حيوان يُعرف بملك الغابة؟", answers: ["الأسد", "اسد", "الاسد"], type: "text", timeMs: 14000 },
  { text: "من أسس شركة Microsoft؟", answers: ["بيل غيتس", "بيل جيتس", "bill gates"], type: "text", timeMs: 18000 },
  { text: "من أسس شركة Apple؟", answers: ["ستيف جوبز", "steve jobs"], type: "text", timeMs: 18000 },
  { text: "كم ضلعاً للمثلث؟", answers: ["3", "ثلاثة"], type: "text", timeMs: 12000 },
  { text: "كم ضلعاً للمسدس؟", answers: ["6", "ستة", "سته"], type: "text", timeMs: 14000 },
  { text: "كم ضلعاً للمربع؟", answers: ["4", "أربعة", "اربعة"], type: "text", timeMs: 12000 },
  { text: "كم ثانية في الدقيقة؟", answers: ["60", "ستون"], type: "text", timeMs: 12000 },
  { text: "كم ساعة في اليوم؟", answers: ["24", "أربعة وعشرون"], type: "text", timeMs: 12000 },
  { text: "كم شهر في السنة؟", answers: ["12", "اثنا عشر", "اثني عشر"], type: "text", timeMs: 12000 },
  { text: "كم يوماً في الأسبوع؟", answers: ["7", "سبعة"], type: "text", timeMs: 10000 },
  { text: "كم لون في قوس قزح؟", answers: ["7", "سبعة"], type: "text", timeMs: 12000 },
  { text: "أين تقع برج خليفة؟", answers: ["دبي", "الإمارات", "الامارات"], type: "text", timeMs: 16000 },
  { text: "ما عاصمة المغرب؟", answers: ["الرباط", "رباط"], type: "text", timeMs: 18000 },
  { text: "ما عاصمة تونس؟", answers: ["تونس"], type: "text", timeMs: 14000 },
  { text: "ما عاصمة ليبيا؟", answers: ["طرابلس"], type: "text", timeMs: 18000 },
  { text: "البقرة تعطينا ماذا؟", answers: ["حليب", "لبن"], type: "text", timeMs: 12000 },
  { text: "البيضة تأتي من ماذا؟", answers: ["دجاجة", "دجاج", "طير", "فرخة"], type: "text", timeMs: 12000 },
  { text: "البيتزا مشهورة في أي دولة؟", answers: ["ايطاليا", "إيطاليا"], type: "text", timeMs: 14000 },
  { text: "السوشي أصله من أي دولة؟", answers: ["اليابان", "يابان"], type: "text", timeMs: 14000 },
  // ── صح أم خطأ ────────────────────────────────────────────────────────────
  { text: "صح أم خطأ: القرش حيوان ثديي", answers: ["خطأ", "خطا", "غلط", "لا"], type: "tf", timeMs: 16000 },
  { text: "صح أم خطأ: الحوت حيوان ثديي", answers: ["صح", "صحيح", "نعم"], type: "tf", timeMs: 16000 },
  { text: "صح أم خطأ: الطماطم فاكهة", answers: ["صح", "صحيح", "نعم"], type: "tf", timeMs: 16000 },
  { text: "صح أم خطأ: الزرافة هي أطول حيوان", answers: ["صح", "صحيح", "نعم"], type: "tf", timeMs: 16000 },
  { text: "صح أم خطأ: المريخ أكبر من الأرض", answers: ["خطأ", "خطا", "غلط", "لا"], type: "tf", timeMs: 16000 },
  { text: "صح أم خطأ: الدلفين حيوان ثديي", answers: ["صح", "صحيح", "نعم"], type: "tf", timeMs: 16000 },
  { text: "صح أم خطأ: مكة المكرمة في المدينة المنورة", answers: ["خطأ", "خطا", "غلط", "لا"], type: "tf", timeMs: 16000 },
  { text: "صح أم خطأ: أستراليا قارة", answers: ["صح", "صحيح", "نعم"], type: "tf", timeMs: 18000 },
  { text: "صح أم خطأ: الشمس نجم", answers: ["صح", "صحيح", "نعم"], type: "tf", timeMs: 14000 },
  { text: "صح أم خطأ: الذهب لونه فضي", answers: ["خطأ", "خطا", "غلط", "لا"], type: "tf", timeMs: 14000 },
  { text: "صح أم خطأ: القطب الجنوبي فيه دببة قطبية", answers: ["خطأ", "خطا", "غلط", "لا"], type: "tf", timeMs: 18000 },
  { text: "صح أم خطأ: النعامة أكبر طيور العالم", answers: ["صح", "صحيح", "نعم"], type: "tf", timeMs: 16000 },
  // ── تحدي السرعة ──────────────────────────────────────────────────────────
  { text: "أسرع واحد يكتب: كنبة", answers: ["كنبة"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: برودة", answers: ["برودة"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: طماطم", answers: ["طماطم"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: مقلاة", answers: ["مقلاة"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: برتقال", answers: ["برتقال"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: شنطة", answers: ["شنطة"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: موزة", answers: ["موزة", "موز"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: زلابية", answers: ["زلابية"], type: "speed", timeMs: 16000 },
  { text: "أسرع واحد يكتب: بطيخ", answers: ["بطيخ"], type: "speed", timeMs: 13000 },
  { text: "أسرع واحد يكتب: مغامرة", answers: ["مغامرة"], type: "speed", timeMs: 17000 },
  { text: "أسرع واحد يكتب: قهوة", answers: ["قهوة"], type: "speed", timeMs: 13000 },
  { text: "أسرع واحد يكتب: طائرة", answers: ["طائرة", "طيارة"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: فراشة", answers: ["فراشة"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: مكيف", answers: ["مكيف"], type: "speed", timeMs: 13000 },
  { text: "أسرع واحد يكتب: شاشة", answers: ["شاشة"], type: "speed", timeMs: 13000 },
  { text: "أسرع واحد يكتب: تلفزيون", answers: ["تلفزيون", "تلفاز"], type: "speed", timeMs: 16000 },
  { text: "أسرع واحد يكتب: فستق", answers: ["فستق"], type: "speed", timeMs: 13000 },
  { text: "أسرع واحد يكتب: سلحفاة", answers: ["سلحفاة"], type: "speed", timeMs: 17000 },
  { text: "أسرع واحد يكتب: عصفور", answers: ["عصفور"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: صاروخ", answers: ["صاروخ"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: كاميرا", answers: ["كاميرا"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: مطبخ", answers: ["مطبخ"], type: "speed", timeMs: 13000 },
  { text: "أسرع واحد يكتب: حاسوب", answers: ["حاسوب", "كمبيوتر"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: علاكة", answers: ["علاكة", "علكة", "علاكه"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: بوظة", answers: ["بوظة", "بوظه", "آيس كريم", "ايس كريم"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: مشروع", answers: ["مشروع"], type: "speed", timeMs: 15000 },
  { text: "أسرع واحد يكتب: قمر", answers: ["قمر"], type: "speed", timeMs: 11000 },
  { text: "أسرع واحد يكتب: نجمة", answers: ["نجمة"], type: "speed", timeMs: 13000 },
  { text: "أسرع واحد يكتب: سحابة", answers: ["سحابة"], type: "speed", timeMs: 13000 },
  { text: "أسرع واحد يكتب: رعد", answers: ["رعد"], type: "speed", timeMs: 11000 },
  // ── تحدي الأرقام ─────────────────────────────────────────────────────────
  { text: "أسرع واحد يكتب الرقم: 2025", answers: ["2025"], type: "number", timeMs: 12000 },
  { text: "أسرع واحد يكتب الرقم: 100", answers: ["100"], type: "number", timeMs: 10000 },
  { text: "أسرع واحد يكتب الرقم: 786", answers: ["786"], type: "number", timeMs: 12000 },
  { text: "أسرع واحد يكتب الرقم: 999", answers: ["999"], type: "number", timeMs: 11000 },
  { text: "أسرع واحد يكتب الرقم: 12345", answers: ["12345"], type: "number", timeMs: 13000 },
  { text: "أسرع واحد يكتب الرقم: 777", answers: ["777"], type: "number", timeMs: 11000 },
  { text: "أسرع واحد يكتب الرقم: 54321", answers: ["54321"], type: "number", timeMs: 13000 },
  { text: "أسرع واحد يكتب الرقم: 1001", answers: ["1001"], type: "number", timeMs: 12000 },
  { text: "أسرع واحد يكتب الرقم: 55555", answers: ["55555"], type: "number", timeMs: 13000 },
  { text: "أسرع واحد يكتب الرقم: 2024", answers: ["2024"], type: "number", timeMs: 12000 },
  // ── تحدي الإيموجي ─────────────────────────────────────────────────────────
  { text: "أرسل إيموجي النار الآن!", answers: ["🔥"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي الكنبة الآن!", answers: ["🛋️", "🛋"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي الضحكة الآن!", answers: ["😂", "🤣", "😹"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي الكرة الآن!", answers: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي القلب الآن!", answers: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💗", "💕", "💓", "💞", "💝", "♥️", "🩷", "🩵", "🩶"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي النجمة الآن!", answers: ["⭐", "🌟", "✨", "💫", "🌠"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي الهاتف الآن!", answers: ["📱", "☎️", "📞", "📲"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي السيارة الآن!", answers: ["🚗", "🚕", "🚙", "🏎️", "🚓", "🚑", "🚒"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي الطيارة الآن!", answers: ["✈️", "🛩️", "✈"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي الفاكهة الآن!", answers: ["🍎", "🍏", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍑", "🍒", "🥭", "🍍", "🥥", "🥝", "🍅"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي الحيوان الآن!", answers: ["🐶", "🐱", "🐭", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🦓", "🦒", "🐘", "🦋", "🐢"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي الطعام الآن!", answers: ["🍕", "🍔", "🌮", "🌯", "🍜", "🍣", "🍱", "🍛", "🍝", "🥗", "🍗", "🍖", "🥩", "🍞", "🧀", "🥚", "🍳", "🥞", "🧇", "🌭", "🍟"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي الموسيقى الآن!", answers: ["🎵", "🎶", "🎸", "🎹", "🎺", "🎻", "🥁", "🎤", "🎧"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي البيت الآن!", answers: ["🏠", "🏡", "🏘️", "🏚️"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي المال الآن!", answers: ["💰", "💵", "💴", "💶", "💷", "💸", "🤑"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي الساعة الآن!", answers: ["⌚", "🕐", "🕑", "🕒", "🕓", "🕔", "⏰", "⏱️", "🕛"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي الشمس الآن!", answers: ["☀️", "🌞", "🌅", "🌄"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي القمر الآن!", answers: ["🌙", "🌛", "🌜", "🌚", "🌕", "🌑"], type: "emoji", timeMs: 13000 },
  { text: "أرسل إيموجي المطر الآن!", answers: ["🌧️", "☔", "🌦️", "⛈️"], type: "emoji", timeMs: 13000 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lim(s: string, n = 16) { return s.length > n ? s.slice(0, n) + ".." : s; }

function dnC(p: CouchPlayer): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return full || (p.username ? `@${p.username}` : String(p.id));
}
function toP(p: CouchPlayer) {
  return { id: p.id, username: p.username, name: dnC(p) };
}
function normText(s: string): string {
  return s.trim().toLowerCase().replace(/[\u064B-\u065F]/g, ""); // strip Arabic diacritics
}
function checkAnswer(text: string, q: CouchQuestion): boolean {
  if (!q.answers.length) return false;
  const n = normText(text);
  return q.answers.some(a => normText(a) === n);
}

function findTeamIdx(s: CouchState, uid: number): 0 | 1 | null {
  if (s.teams[0].has(uid)) return 0;
  if (s.teams[1].has(uid)) return 1;
  return null;
}

function getPlayer(s: CouchState, uid: number): CouchPlayer | undefined {
  return s.teams[0].get(uid) ?? s.teams[1].get(uid);
}

function teamDisplay(idx: 0 | 1) {
  return idx === 0 ? "🔵 الفريق الأزرق" : "🔴 الفريق الأحمر";
}

function teamPlayers(s: CouchState, idx: 0 | 1): string {
  const arr = [...s.teams[idx].values()];
  return arr.length ? arr.map(p => `• ${esc(dnC(p))}`).join("\n") : "<i>لا أحد</i>";
}

function lobbyText(s: CouchState): string {
  return (
    `🛋️ <b>تحدي الكنبة</b>\n\n` +
    `🔵 <b>الفريق الأزرق (${s.teams[0].size}):</b>\n${teamPlayers(s, 0)}\n\n` +
    `🔴 <b>الفريق الأحمر (${s.teams[1].size}):</b>\n${teamPlayers(s, 1)}\n\n` +
    `<i>اضغط انضم — التوزيع عشوائي تلقائي  •  لازم فريقين فيهم 2+ لاعبين</i>`
  );
}

function autoAssignTeam(s: CouchState, uid: number): 0 | 1 {
  // If already in a team, remove first
  s.teams[0].delete(uid);
  s.teams[1].delete(uid);
  // Assign to team with fewer players; random if equal
  if (s.teams[0].size < s.teams[1].size) return 0;
  if (s.teams[1].size < s.teams[0].size) return 1;
  return Math.random() < 0.5 ? 0 : 1;
}

function pickQuestion(s: CouchState): CouchQuestion {
  if (!s.questionPool.length) {
    // reshuffle excluding last question
    s.questionPool = shuffle([...ALL_QUESTIONS]);
  }
  return s.questionPool.shift()!;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function startCouch(
  bot: Telegraf, chatId: number,
  hostId: number, hostUsername: string | undefined,
  hostFirst: string, hostLast: string,
): Promise<void> {
  if (gameStates.has(chatId)) {
    bot.telegram.sendMessage(chatId, "⚠️ في لعبة شغالة! أوقفوها أولاً بـ /stop", { parse_mode: "HTML" }).catch(() => {});
    return;
  }

  const s: CouchState = {
    type: "couch",
    phase: "joining",
    chatId,
    hostId,
    teams: [new Map(), new Map()],
    sofaPlayerId: null,
    sofaTeamIdx: null,
    currentQ: null,
    roundSeq: 0,
    scores: [0, 0],
    targetScore: 5, // first team to reach 5 points wins
    choosingPlayerId: null,
    choosingTeamIdx: null,
    questionPool: [],
    questionNum: 0,
    setupMsgId: undefined,
    joinMsgId: undefined,
    timerHandle: undefined,
    choosingMsgId: undefined,
    mvpKills: new Map(),
  };
  // Randomly assign host to either team
  const hostTeam: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
  s.teams[hostTeam].set(hostId, { id: hostId, username: hostUsername, firstName: hostFirst, lastName: hostLast });
  gameStates.set(chatId, s);

  const msg = await bot.telegram.sendMessage(chatId,
    lobbyText(s),
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("انضم للعبة", `couch:join:${chatId}:auto`)],
        [Markup.button.callback("ابدا اللعبة", `couch:start:${chatId}`)],
      ]),
    }
  ).catch(() => null);

  if (msg) s.joinMsgId = msg.message_id;
}

// Stub kept for backward-compat with any existing callbacks — immediately redirects
export async function handleCouchSetRounds(
  _bot: Telegraf, ctx: Context, _chatId: number, _rounds: number,
): Promise<void> {
  await ctx.answerCbQuery("✅").catch(() => {});
}

export async function handleCouchJoin(
  bot: Telegraf, ctx: Context, chatId: number, _teamIdx: number,
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "joining") {
    await ctx.answerCbQuery("التسجيل مو متاح").catch(() => {}); return;
  }

  const player: CouchPlayer = {
    id: from.id, username: from.username,
    firstName: from.first_name ?? "", lastName: from.last_name ?? "",
  };

  const assigned = autoAssignTeam(s, from.id);
  s.teams[assigned].set(from.id, player);

  const teamName = assigned === 0 ? "الفريق الأزرق" : "الفريق الأحمر";
  await ctx.answerCbQuery(`انضممت للـ ${teamName}!`).catch(() => {});

  // Update lobby
  if (s.joinMsgId) {
    bot.telegram.editMessageText(chatId, s.joinMsgId, undefined,
      lobbyText(s),
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("انضم للعبة", `couch:join:${chatId}:auto`)],
          [Markup.button.callback("ابدا اللعبة", `couch:start:${chatId}`)],
        ]),
      }
    ).catch(() => {});
  }
}

export async function handleCouchStart(
  bot: Telegraf, ctx: Context, chatId: number,
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط المنشئ يبدأ اللعبة!").catch(() => {}); return;
  }
  if (s.teams[0].size < 2 || s.teams[1].size < 2) {
    await ctx.answerCbQuery(`⚠️ كل فريق يحتاج لاعبين أو أكثر!\n🔵 ${s.teams[0].size}  🔴 ${s.teams[1].size}`).catch(() => {}); return;
  }
  await ctx.answerCbQuery("🛋️ ابدأت اللعبة!").catch(() => {});
  launchCouch(bot, chatId);
}

// ── Called from index.ts message handler ─────────────────────────────────────

export function handleCouchText(
  bot: Telegraf, chatId: number, uid: number, text: string,
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch") return;
  if (s.phase !== "playing" && s.phase !== "sofa_active") return;

  const teamIdx = findTeamIdx(s, uid);
  if (teamIdx === null) return; // not in the game

  const player = getPlayer(s, uid)!;

  // Sofa player cannot answer
  if (s.sofaPlayerId === uid) return;

  if (!checkAnswer(text, s.currentQ!)) return; // wrong answer

  // ── Correct answer! ────────────────────────────────────────────────────
  if (s.phase === "playing") {
    // First correct → player goes to sofa
    onFirstCorrect(bot, chatId, uid, teamIdx, player);
  } else if (s.phase === "sofa_active") {
    if (teamIdx === s.sofaTeamIdx) {
      // Sofa team answered → sit together + score!
      void onSofaTeamScores(bot, chatId, uid, player);
    } else {
      // Opponent answered → choosing
      onOpponentAnswers(bot, chatId, uid, player, teamIdx);
    }
  }
}

export async function handleCouchChoose(
  bot: Telegraf, ctx: Context, chatId: number, action: "kick" | "take",
): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "choosing") {
    await ctx.answerCbQuery("❌ انتهى الوقت للاختيار").catch(() => {}); return;
  }
  // Allow any member of the choosing team
  const presserTeam = findTeamIdx(s, from.id);
  if (presserTeam !== s.choosingTeamIdx) {
    await ctx.answerCbQuery("⛔ مو فريقك تختار!").catch(() => {}); return;
  }

  await ctx.answerCbQuery(action === "kick" ? "💥 تم الطرد!" : "🛋️ جلست على الكنبة!").catch(() => {});

  // Cancel choosing timer
  if (s.timerHandle) { clearTimeout(s.timerHandle); s.timerHandle = undefined; }
  s.roundSeq++;

  // Remove choosing buttons
  if (s.choosingMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.choosingMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
    s.choosingMsgId = undefined;
  }

  if (action === "kick") {
    // Sofa cleared → back to playing phase with new question
    const sofaPlayer = getPlayer(s, s.sofaPlayerId!)!;
    await bot.telegram.sendMessage(chatId,
      `💥 <b>${esc(dnC(sofaPlayer))}</b> طُرد من الكنبة! الكنبة فاضية الآن.\n\n<i>سؤال جديد قادم...</i>`,
      { parse_mode: "HTML" }
    ).catch(() => {});

    s.sofaPlayerId = null;
    s.sofaTeamIdx  = null;
    s.choosingPlayerId  = null;
    s.choosingTeamIdx   = null;
    s.phase = "playing";
    setTimeout(() => askQuestion(bot, chatId), 1_200);

  } else {
    // Choosing player takes the sofa → go to sofa_active with new sofa holder
    const chooser  = getPlayer(s, s.choosingPlayerId!)!;
    const prevSofa = s.sofaPlayerId !== null ? getPlayer(s, s.sofaPlayerId) : null;
    const prevName = prevSofa ? dnC(prevSofa) : "";

    await bot.telegram.sendMessage(chatId,
      `🛋️ <b>${esc(dnC(chooser))}</b> طرد <b>${prevName ? esc(prevName) : "اللاعب"}</b> وجلس مكانه على الكنبة!\n\n` +
      `📣 يا ${teamDisplay(s.choosingTeamIdx!)} — زميلكم ينتظركم!\n` +
      `<i>أجاوبوا الصح تقعدوا معه وتسجلون!</i>`,
      { parse_mode: "HTML" }
    ).catch(() => {});

    s.sofaPlayerId = chooser.id;
    s.sofaTeamIdx  = s.choosingTeamIdx!;
    s.choosingPlayerId  = null;
    s.choosingTeamIdx   = null;
    s.phase = "sofa_active";
    setTimeout(() => askSofaQuestion(bot, chatId), 1_200);
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function launchCouch(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch") return;

  // Remove lobby buttons
  if (s.joinMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.joinMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
  }

  s.phase         = "playing";
  s.questionPool  = shuffle([...ALL_QUESTIONS]);

  // Game start card
  const teamANames = [...s.teams[0].values()].map(p => dnC(p));
  const teamBNames = [...s.teams[1].values()].map(p => dnC(p));

  let buf: Buffer | null = null;
  try { buf = await generateCouchStartCard(teamANames, teamBNames, s.targetScore); } catch { /* fallback */ }

  const startCaption =
    `🛋️ <b>تحدي الكنبة — انطلقنا!</b>\n\n` +
    `🔵 <b>الأزرق:</b> ${teamANames.map(esc).join("، ")}\n` +
    `🔴 <b>الأحمر:</b> ${teamBNames.map(esc).join("، ")}\n\n` +
    `🏆 أول فريق يصل <b>${s.targetScore}</b> نقاط يفوز!`;

  if (buf) {
    await bot.telegram.sendPhoto(chatId, { source: buf }, { caption: startCaption, parse_mode: "HTML" }).catch(() => {
      bot.telegram.sendMessage(chatId, startCaption, { parse_mode: "HTML" }).catch(() => {});
    });
  } else {
    await bot.telegram.sendMessage(chatId, startCaption, { parse_mode: "HTML" }).catch(() => {});
  }

  await bot.telegram.sendMessage(chatId,
    `📜 <b>القواعد:</b>\n` +
    `• أجاوب الصح أول → تجلس على الكنبة 🛋️\n` +
    `• اللي على الكنبة ما يقدر يجاوب\n` +
    `• زميلك يجاوب الصح → يجلس معك على الكنبة = نقطة لفريقكم! 🎉\n` +
    `• الخصم يجاوب → يختارون: يطردونك من الكنبة أو يجلسون مكانك\n` +
    `• أول فريق يوصل ${s.targetScore} نقاط يفوز 🏆`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => askQuestion(bot, chatId), 2_500);
}

function startTimer(
  bot: Telegraf, chatId: number, ms: number,
  onExpire: () => void | Promise<void>,
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch") return;
  if (s.timerHandle) clearTimeout(s.timerHandle);
  s.roundSeq++;
  const mySeq = s.roundSeq;
  s.timerHandle = setTimeout(async () => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "couch" || ss.roundSeq !== mySeq) return;
    await onExpire();
  }, ms);
}

async function askQuestion(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "playing") return;

  const q = pickQuestion(s);
  s.currentQ = q;
  s.questionNum++;

  const secs    = Math.round(q.timeMs / 1000);
  const caption = `❓ <b>${esc(q.text)}</b>\n\n` +
                  `🔵 ${s.scores[0]}  —  ${s.scores[1]} 🔴  |  ⏱️ ${secs} ثانية`;

  let buf: Buffer | null = null;
  try {
    buf = await generateCouchQuestionCard(
      s.scores[0], s.scores[1],
      q.text, q.type, s.questionNum,
    );
  } catch { /* fallback to text */ }

  let msg: { message_id: number } | null = null;
  if (buf) {
    msg = await bot.telegram.sendPhoto(chatId, { source: buf }, { caption, parse_mode: "HTML" }).catch(async () => {
      return bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => null);
    });
  } else {
    msg = await bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => null);
  }
  if (msg) s.qMsgId = msg.message_id;

  startTimer(bot, chatId, q.timeMs, async () => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "couch" || ss.phase !== "playing") return;
    // Time up — new question
    const correct = ss.currentQ!.answers[0] ? `\n\n💡 الإجابة: <b>${esc(ss.currentQ!.answers[0])}</b>` : "";
    await bot.telegram.sendMessage(chatId,
      `⏰ انتهى الوقت! ما أجاب أحد.${correct}`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    setTimeout(() => askQuestion(bot, chatId), 1_800);
  });
}

async function askSofaQuestion(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "sofa_active") return;

  const q = pickQuestion(s);
  s.currentQ = q;
  s.questionNum++;

  const sofaPlayer = getPlayer(s, s.sofaPlayerId!)!;

  // Send sofa card
  let buf: Buffer | null = null;
  try {
    buf = await generateCouchSofaCard(
      dnC(sofaPlayer), s.sofaTeamIdx!,
      s.scores[0], s.scores[1], s.targetScore,
      q.text, q.type, s.questionNum,
    );
  } catch { /* fallback */ }

  const secs      = Math.round((q.timeMs + 5000) / 1000);
  const typeTag   = q.type === "speed" ? "⚡ تحدي السرعة" :
                    q.type === "emoji" ? "🎭 تحدي الإيموجي" : "❓ سؤال";
  const caption   =
    `🛋️ <b>${esc(dnC(sofaPlayer))}</b> على الكنبة!\n\n` +
    `${typeTag}: <b>${esc(q.text)}</b>\n\n` +
    `🔵 ${s.scores[0]}  —  ${s.scores[1]} 🔴  |  ⏱️ ${secs} ثانية`;

  if (buf) {
    await bot.telegram.sendPhoto(chatId, { source: buf }, { caption, parse_mode: "HTML" }).catch(async () => {
      await bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
    });
  } else {
    await bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
  }

  startTimer(bot, chatId, q.timeMs + 5000, async () => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "couch" || ss.phase !== "sofa_active") return;
    const correct = ss.currentQ!.answers[0] ? `\n\n💡 الإجابة: <b>${esc(ss.currentQ!.answers[0])}</b>` : "";
    await bot.telegram.sendMessage(chatId,
      `⏰ انتهى الوقت! الكنبة تفضى والجولة تُعاد.${correct}`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    ss.sofaPlayerId = null;
    ss.sofaTeamIdx  = null;
    ss.phase = "playing";
    setTimeout(() => askQuestion(bot, chatId), 1_800);
  });
}

function onFirstCorrect(
  bot: Telegraf, chatId: number,
  uid: number, teamIdx: 0 | 1, player: CouchPlayer,
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "playing") return;

  // Cancel current question timer
  if (s.timerHandle) { clearTimeout(s.timerHandle); s.timerHandle = undefined; }
  s.roundSeq++;

  s.sofaPlayerId = uid;
  s.sofaTeamIdx  = teamIdx;
  s.phase        = "sofa_active";

  bot.telegram.sendMessage(chatId,
    `🛋️ <b>${esc(dnC(player))}</b> جلس على الكنبة! (${teamDisplay(teamIdx)})\n\n` +
    `📣 يا ${teamDisplay(teamIdx)} — زميلكم ينتظركم!\n` +
    `<i>أجاوب السؤال القادم تجلس معه وتسجلون نقطة!</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => askSofaQuestion(bot, chatId), 1_000);
}

async function onSofaTeamScores(
  bot: Telegraf, chatId: number,
  uid: number, player: CouchPlayer,
): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "sofa_active") return;

  // Cancel timer
  if (s.timerHandle) { clearTimeout(s.timerHandle); s.timerHandle = undefined; }
  s.roundSeq++;

  const sofaPlayer  = getPlayer(s, s.sofaPlayerId!)!;
  const scoringTeam = s.sofaTeamIdx!;
  s.scores[scoringTeam]++;

  // Track MVP
  const mvpId = s.sofaPlayerId!;
  s.mvpKills.set(mvpId, (s.mvpKills.get(mvpId) ?? 0) + 1);

  // Send "both on sofa together" card
  let buf2: Buffer | null = null;
  try {
    buf2 = await generateCouchBothOnSofaCard(
      dnC(sofaPlayer), dnC(player), scoringTeam,
      s.scores[0], s.scores[1],
    );
  } catch { /* fallback */ }

  const scoreCaption =
    `🛋️🛋️ <b>${esc(dnC(sofaPlayer))}</b> + <b>${esc(dnC(player))}</b> قعدوا على الكنبة معاً!\n` +
    `🏆 <b>${teamDisplay(scoringTeam)}</b> سجّل!\n\n` +
    `🔵 ${s.scores[0]}  —  ${s.scores[1]} 🔴`;

  if (buf2) {
    await bot.telegram.sendPhoto(chatId, { source: buf2 }, { caption: scoreCaption, parse_mode: "HTML" }).catch(async () => {
      await bot.telegram.sendMessage(chatId, scoreCaption, { parse_mode: "HTML" }).catch(() => {});
    });
  } else {
    await bot.telegram.sendMessage(chatId, scoreCaption, { parse_mode: "HTML" }).catch(() => {});
  }

  // Reset sofa
  s.sofaPlayerId = null;
  s.sofaTeamIdx  = null;

  // Check win
  if (s.scores[scoringTeam] >= s.targetScore) {
    endCouch(bot, chatId, scoringTeam);
    return;
  }

  s.phase = "playing";
  setTimeout(() => askQuestion(bot, chatId), 2_200);
}

function onOpponentAnswers(
  bot: Telegraf, chatId: number,
  uid: number, player: CouchPlayer, teamIdx: 0 | 1,
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch" || s.phase !== "sofa_active") return;

  // Cancel timer
  if (s.timerHandle) { clearTimeout(s.timerHandle); s.timerHandle = undefined; }
  s.roundSeq++;

  s.phase             = "choosing";
  s.choosingPlayerId  = uid;
  s.choosingTeamIdx   = teamIdx;

  const sofaPlayer = getPlayer(s, s.sofaPlayerId!)!;

  bot.telegram.sendMessage(chatId,
    `⚡ <b>${esc(dnC(player))}</b> (${teamDisplay(teamIdx)}) أجاب صح!\n\n` +
    `اختاروا خلال <b>15 ثانية</b>:`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback(`💥 اطردوا ${lim(dnC(sofaPlayer), 14)} من الكنبة`, `couch:choose:${chatId}:kick`)],
        [Markup.button.callback(`🛋️ ${lim(dnC(player), 14)} يجلس بدل ${lim(dnC(sofaPlayer), 12)}`, `couch:choose:${chatId}:take`)],
      ]),
    }
  ).then(msg => {
    s.choosingMsgId = msg?.message_id;
  }).catch(() => {});

  // 15s choosing timer — default = kick
  startTimer(bot, chatId, 15_000, async () => {
    const ss = gameStates.get(chatId);
    if (!ss || ss.type !== "couch" || ss.phase !== "choosing") return;
    if (ss.choosingMsgId) {
      bot.telegram.editMessageReplyMarkup(chatId, ss.choosingMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
    }
    const sofaP = ss.sofaPlayerId !== null ? getPlayer(ss, ss.sofaPlayerId) : null;
    await bot.telegram.sendMessage(chatId,
      `⏰ انتهى وقت الاختيار — تم طرد <b>${sofaP ? esc(dnC(sofaP)) : "اللاعب"}</b> من الكنبة تلقائياً!`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    ss.sofaPlayerId     = null;
    ss.sofaTeamIdx      = null;
    ss.choosingPlayerId = null;
    ss.choosingTeamIdx  = null;
    ss.phase = "playing";
    setTimeout(() => askQuestion(bot, chatId), 1_500);
  });
}

async function endCouch(bot: Telegraf, chatId: number, winnerIdx: 0 | 1): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "couch") return;
  s.phase = "done";

  const winnerTeam  = [...s.teams[winnerIdx].values()];
  const loserTeam   = [...s.teams[(1 - winnerIdx) as 0 | 1].values()];

  // MVP = player with most sofa+score combos
  let mvpPlayer: CouchPlayer | undefined;
  let mvpMax = 0;
  for (const [uid, count] of s.mvpKills) {
    if (count > mvpMax) {
      mvpMax   = count;
      mvpPlayer = getPlayer(s, uid);
    }
  }

  // Record scores
  for (const p of winnerTeam) recordWin(chatId, toP(p));
  for (const p of loserTeam)  recordGame(chatId, [toP(p)]);

  // Winner card
  let buf: Buffer | null = null;
  try {
    buf = await generateCouchWinCard(winnerIdx, s.scores[0], s.scores[1], mvpPlayer ? dnC(mvpPlayer) : "");
  } catch { /* fallback */ }

  const caption =
    `🏆 <b>${teamDisplay(winnerIdx)}</b> فاز بتحدي الكنبة!\n\n` +
    `🔵 ${s.scores[0]}  —  ${s.scores[1]} 🔴\n` +
    (mvpPlayer ? `⭐ <b>${esc(dnC(mvpPlayer))}</b> — أكثر تأثيراً!\n` : "") +
    `\n<i>جولة أخرى؟  /couch</i>`;

  if (buf) {
    await bot.telegram.sendPhoto(chatId, { source: buf }, { caption, parse_mode: "HTML" }).catch(() => {
      bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
    });
  } else {
    await bot.telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
  }

  clearGame(chatId);
}
