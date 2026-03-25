import { Telegraf, Markup, Context } from "telegraf";
import {
  gameStates, clearGame, privateUserToGame, recordWin, recordGame,
  esc, type OutsiderState, type OutsiderPlayer, type Player,
} from "../state.js";
import { generateOutsiderCard, generateInsiderCard, generateRevealCard } from "../outsiderCard.js";
import { logger } from "../../lib/logger.js";

// Show full name (firstName + lastName) first, fall back to @username, then ID
function dnO(p: OutsiderPlayer): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return full || (p.username ? `@${p.username}` : String(p.id));
}

// ─── Saved categories (persisted across games per chat) ───────────────────────
const savedCategories = new Map<number, Set<string>>();

function toPlayer(p: OutsiderPlayer): Player {
  return { id: p.id, username: p.username, name: dnO(p) };
}

// ─── Timing ────────────────────────────────────────────────────────────────────
const JOIN_MS       = 60_000;
const JOIN_WARN_MS  = 40_000;
const HINT_MS       = 120_000;
const HINT_WARN_MS  =  80_000;
const VOTE_MS       =  60_000;
const VOTE_WARN_MS  =  30_000;
const GUESS_MS      =  45_000;
const MIN_PLAYERS   = 3;

// ─── Topic Database ─────────────────────────────────────────────────────────────
export const ALL_TOPICS: Record<string, string[]> = {
  "🐾 حيوانات": [
    // أليفة وبيتية
    "قطة","كلب","أرنب","هامستر","ببغاء","سمكة زينة","سلحفاة","فأر أبيض","قنديل البحر","حمامة",
    // غابة وبرية
    "أسد","نمر","فهد","دب","ذئب","ثعلب","ضبع","وشق","جرو الثعلب","قرد",
    "شمبانزي","غوريلا","أورانجوتان","قرد المكاك","قردة البابون","بابون","ليمور","نمس","غرير","زباد",
    // أفريقية وآسيوية
    "فيل","زرافة","حصان نهري","كركدن","وحيد القرن","جاموس","زيبرا","حمار وحشي","نو","أيل",
    "غزال","وعل","ظبي","مها","مهر","حمار","بغل","جمل","ناقة","لاما",
    // طيور
    "نسر","صقر","باز","طاووس","بجع","فلامينغو","بومة","لقلق","طوقان","قطرس",
    "بطة","إوزة","ديك رومي","ديك","دجاجة","حجل","يمامة","عندليب","تمساح المنقار","سنونو",
    // بحرية
    "دلفين","حوت","حوت أحدب","قرش","سمكة مارلن","أسد البحر","فقمة","فرس البحر","سلطعون","جراد البحر",
    "أخطبوط","حبار","قنديل بحر","نجم البحر","قنفذ البحر","حصان البحر","سمكة القرش الأبيض","تونة","سردين","قباقب",
    // زواحف وحشرات
    "تمساح","ثعبان","ثعبان الكوبرا","ثعبان الأصلة","أفعى","سحلية","حرباء","غكو","ورل","ضب",
    "نملة","نحلة","فراشة","دودة القز","خنفساء","جندب","صرصار","عقرب","بعوضة","ذبابة",
    // نادرة وغريبة
    "بانغولين","اردفارك","كومودو","تاسمانيا","كيوي","ألباكا","ياك","ثور الماء","أبو منجل","كواكبرا",
    "قنفذ","خفاش","ضفدع","ضفدع السم","سلمندر","عقرب صحراء","أبو بريص","حمار البحر","حمار الوحش","الطيهوج",
  ],
  "🍕 أكلات": [
    // خليجي وسعودي
    "كبسة","مندي","مرقوق","جريش","هريسة","مطبق","مجبوس","بالو","سليق","عصيد",
    "كليجا","قهوة عربية","محلبية","لقيمات","مطبق","خبيصة","سمبوسة","حلوى عمانية","كنافة ناعمة","قيمر",
    // شرق أوسط
    "شاورما","فلافل","حمص","فتة","منسف","مسخن","مقلوبة","كشك","فريكة","كنافة",
    "بقلاوة","معمول","مامول","حلاوة طحينية","طحينة","مسبحة","فول مدمس","طعمية","كوارع","هريس",
    // إيطالي وغربي
    "بيتزا","باستا","لازانيا","ريزوتو","برغر","هوت دوج","فرنش فرايز","ناجتس","ستيك","شيش طاووق",
    "كرواسون","بان كيك","وافل","دونات","كيك","براونيز","مافن","تشيز كيك","تيراميسو","بروفيترول",
    // آسيوي
    "سوشي","رامن","تاكو","بريتو","بيريياني","تندوري","بادثاي","دمبلينج","موموس","فو",
    "نودلز","كيمتشي","بيبيمباب","ساشيمي","مستو","توفو","دمبلينج قلي","باو","أونيغيري","ماتشا كيك",
    // حلويات ومشروبات
    "شكولاتة","آيس كريم","جيلاتو","سوفلية","كريم برولية","مولتن كيك","كانيلي","إكلير","مليونيرز شورت كيك","رقائق",
    "قهوة","كابتشينو","لاتيه","شاي أخضر","شاي هندي","كوكاكولا","عصير برتقال","لبن","لاسي","سموذي",
    // متنوع
    "سمك مشوي","دجاج مقلي","لحم بعجين","فطير","بيض","فول","عدس","تبولة","فتوش","سلطة",
  ],
  "🏙️ أماكن": [
    // معالم عالمية
    "برج إيفل","الكعبة المشرفة","بيج بن","برج خليفة","تمثال الحرية","الأهرامات","سور الصين العظيم",
    "برج بيزا","كولوسيوم روما","أنغكور وات","تاج محل","أبو سمبل","ماتشو بيتشو","بيت لحم","أثينا القديمة",
    // مدن عربية
    "مكة المكرمة","المدينة المنورة","الرياض","دبي","أبوظبي","مسقط","الكويت","الدوحة","بغداد","دمشق",
    "القاهرة","الإسكندرية","عمّان","بيروت","الخرطوم","الدار البيضاء","تونس","الجزائر","طرابلس","جدة",
    // مدن عالمية
    "لندن","باريس","طوكيو","نيويورك","روما","برلين","مدريد","بكين","موسكو","سيدني",
    "تورنتو","دبلن","أمستردام","زيوريخ","سنغافورة","بانكوك","إسطنبول","أثينا","برشلونة","ميلانو",
    // أماكن عامة
    "مطار","مستشفى","ملعب كرة قدم","سينما","مكتبة","حديقة حيوان","متحف","مسجد","كنيسة","كاتدرائية",
    "محطة قطار","ميناء","سوق","جامعة","مدرسة","فندق","مطعم","مقهى","دار أوبرا","قلعة",
    // طبيعة وجغرافيا
    "شلال نياغارا","جراند كانيون","فيوردات النرويج","صحراء الصحراء","غابة الأمازون","جزر المالديف",
    "قمة إيفرست","بحيرة فيكتوريا","نهر النيل","نهر الأمازون","البحر الميت","القطب الشمالي","هاواي","أيسلندا",
  ],
  "⚽ رياضة": [
    // كرة
    "كرة القدم","كرة السلة","كرة الطائرة","كرة القدم الأمريكية","كرة اليد","كرة الماء","كرة الطاولة","البولينغ","الغولف","كرة القاعدة",
    // مضرب
    "تنس","تنس طاولة","بادمنتون","اسكواش","الريشة الطائرة","البيكلبول","كروكيه","الكريكيت","الهوكي","الرغبي",
    // مائي وجوي
    "السباحة","الغوص","الإبحار","التجديف","ركوب الأمواج","الغطس","الزوارق","الكانو","البواخر الريحية","القفز المظلي",
    // قتالي ورياضي
    "الملاكمة","الكاراتيه","الجودو","التايكوندو","الكونغ فو","المصارعة","السومو","الجيو جيتسو","الكيك بوكسينغ","الفنون المختلطة",
    // شتوي وجبلي
    "التزلج على الجليد","التزلج على الثلج","السنوبورد","الهوكي على الجليد","التزلج الريفي","التسلق","الرياضة الجبلية",
    // أولمبي
    "رفع الأثقال","الجمباز","المبارزة","الرماية","الفروسية","سباق الخيل","الدراجات","العدو","القفز العالي","الثلاثي",
    // ذهني وإلكتروني
    "الشطرنج","الداما","ألعاب الورق","ألعاب الفيديو","السباق الإلكتروني","الرياضة الإلكترونية",
  ],
  "📱 تقنية": [
    // أجهزة
    "آيفون","آيباد","ماكبوك","سامسونج جالاكسي","هواوي","شاومي","لابتوب","حاسب مكتبي","ساعة ذكية","نظارة ذكية",
    "سماعة لاسلكية","هيدفون","لوحة مفاتيح","ماوس","شاشة","طابعة ثلاثية الأبعاد","روبوت","درون","كاميرا","تلفزيون ذكي",
    // تطبيقات ومنصات
    "يوتيوب","تيك توك","انستقرام","تويتر/إكس","سناب شات","واتساب","تيليغرام","فيسبوك","لينكدإن","بينترست",
    "نتفليكس","سبوتيفاي","ديزني بلاس","أمازون برايم","آبل تي في","شاهد","يوتيوب ميوزك","ساوند كلاود","أنغامي","ديزر",
    // ألعاب
    "بلايستيشن","إكس بوكس","نينتندو سويتش","فورتنايت","ماينكرافت","جي تي إيه","فيفا","كول أوف ديوتي","بابجي","فالورانت",
    // ذكاء اصطناعي وتقنية
    "شات جي بي تي","جيميناي","كلود","ميتا إيه آي","مدجورني","دال إي","ذكاء اصطناعي","تعلم الآلة","روبوتيكس",
    // شركات وخدمات
    "أبل","قوقل","مايكروسوفت","أمازون","ميتا","تيسلا","نفيديا","سامسونج","إنتل","إكس بوكس",
    "كلاود","واي فاي","بلوتوث","VPN","بلوكشين","كريبتو","NFT","ميتافيرس","أوبر","كريم",
  ],
  "🎬 ترفيه": [
    // مسلسلات عربية
    "باب الحارة","نمر بن عدوان","طاش ما طاش","سيلفي","واي فاي","حارة كول","دفعة بيروت","مسمار جحا","صاحبي الغالي","يوميات وهج",
    // أفلام عالمية
    "أفاتار","تيتانيك","الجوكر","أفنجرز","هاري بوتر","ذيب","بنوكيو","بلاك بانثر","توب غان","إنترستيلار",
    "الملك الأسد","بياض الثلج","علاء الدين","موانا","زوتوبيا","كوكو","باحثة الفضاء","إنسايد آوت","الترانزفورمرز",
    // شخصيات وأبطال
    "سبايدر مان","باتمان","سوبرمان","آيرون مان","كابتن أمريكا","ثانوس","جوكر","مادالوريان","يودا","دارث فيدر",
    "شيرلوك هولمز","جيمس بوند","إيثان هانت","جاك سبارو","إنديانا جونز","سيمبا","دوري","شريك","بوز لايتير",
    // مسلسلات عالمية
    "بريكينغ باد","غيم أوف ثرونز","ستوريج وورز","بيبر بيغ","المندلوريان","الويتشر","سكويد غيم","لوبان","الورقة","مني هايست",
    // شخصيات كرتون
    "توم وجيري","سبونجبوب","ميكي ماوس","دونالد داك","كوالا لومبور","باغز باني","داعي الإسلام","أنيمي","شينشان","دورا",
    // صناعة الترفيه
    "يوتيوبر","مذيع","ممثل","مغني","راقص","مؤلف","منتج","مخرج","فنان كوميدي","مصمم أزياء",
  ],
  "🌍 أشياء عامة": [
    // مواصلات
    "سيارة","دراجة","طائرة","سفينة","قطار","حافلة","دراجة نارية","مروحية","غواصة","صاروخ",
    "تاكسي","أوبر","مترو","ترام","قارب","يخت","طائرة شراعية","دراجة هوائية","سكوتر","سكيت بورد",
    // منزل
    "قلم","كتاب","كرسي","طاولة","باب","نافذة","مفتاح","ساعة","تلفزيون","ثلاجة",
    "سرير","وسادة","بطانية","خزانة","حوض","مرآة","مصباح","مكنسة","غسالة","مكيف",
    // ملابس وإكسسوار
    "حذاء","قبعة","نظارة","ساعة","خاتم","قلادة","حقيبة","حزام","كرافة","عطر",
    "معطف","جاكيت","تيشيرت","جينز","ثوب","كرتة","دشداشة","عبايا","نقاب","عمامة",
    // طبيعة
    "شمس","قمر","نجمة","سحابة","مطر","ثلج","رعد","برق","قوس قزح","بركان",
    "جبل","نهر","بحيرة","شلال","صحراء","غابة","جزيرة","كهف","مرجان","رمل",
    // مواد وخامات
    "ذهب","فضة","ألماس","حجر كريم","برونز","حديد","نحاس","ألمنيوم","خشب","رخام",
    "زجاج","بلاستيك","قماش","جلد","ورق","طين","إسفنج","كربون","سيليكون","سيراميك",
    // متنوع
    "بالون","شمعة","كاميرا","مقص","مطرقة","مفتاح ربط","فرشاة","مسطرة","آلة حاسبة","بطاقة",
  ],
  "💼 مهن ووظائف": [
    "طبيب","ممرض","معلم","مهندس","محامي","قاضي","طيار","رائد فضاء","شرطي","عسكري",
    "طباخ شيف","حلاق","نجار","حداد","كهربائي","سباك","رسام","مصور","مصمم","مؤلف",
    "مذيع","صحفي","ممثل","مغني","رياضي","مدرب","حارس أمن","سائق","موزع","محاسب",
    "علماء فضاء","بيطري","صيدلاني","أرخيولوجيست","مترجم","مستشار","مدير","سفير","دبلوماسي","رئيس وزراء",
    "كاتب","شاعر","فيلسوف","عالم دين","إمام","قسيس","حاخام","معالج نفسي","اجتماعي","خيري",
    "ميكانيكي","سائق شاحنة","بحار","صياد","مزارع","راعي أغنام","عطار","فلكي","موسيقار","عازف",
  ],
  "😂 مواقف وحالات": [
    "نسيت المحفظة","فلتت منك ضحكة","وقفت أمام الشيف","فاتتك الرحلة","كسرت شيء عند أحد",
    "اتصادمت بجدار","وقعت أمام الناس","نمت على المنبّه","وصلت متأخر للامتحان","ضيعت مفاتيحك",
    "اتصل بك الغلط","وقعت الهاتف في المي","أكلت الأكل الحار","ارتديت ملابسك معكوسة","لقيت فلوس في جيبك",
    "فضلت تقود دون بنزين","أكلت من صحن غيرك","انقطع النت في أهم لحظة","خسرت في لعبة","حلمت بحلم غريب",
    "نسيت كلمة بالمحادثة","ضحكت في وقت غلط","اتصادمت مع أحد","نسيت الشاحن","انكسر كرسيك",
  ],
  "🎨 فنون وإبداع": [
    "لوحة زيتية","رسم رصاص","خط عربي","نحت","تصوير","موسيقى","غناء","رقص","شعر","رواية",
    "عزف بيانو","عزف جيتار","عزف طبلة","موسيقى كلاسيكية","راب","أغنية شعبية","مسرحية","أوبرا","باليه","فلامنكو",
    "تصميم جرافيك","تصميم داخلي","عمارة","أنيمي","كومكس","رسوم متحركة","فوتوغرافيا","سينما تجريبية","وثائقي","مسلسل",
  ],
};

// ─── All category keys for display ───────────────────────────────────────────
export const CATEGORY_KEYS = Object.keys(ALL_TOPICS);

// ─── Pick topic from selected categories ─────────────────────────────────────
function pickTopic(selectedCats: string[]): { category: string; topic: string } {
  const cats = selectedCats.length > 0 ? selectedCats : CATEGORY_KEYS;
  const category = cats[Math.floor(Math.random() * cats.length)];
  const list = ALL_TOPICS[category] ?? ALL_TOPICS[CATEGORY_KEYS[0]];
  const topic = list[Math.floor(Math.random() * list.length)];
  return { category, topic };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function playerList(s: OutsiderState): string {
  return [...s.players.values()].map((p) => `• ${esc(dnO(p))}`).join("\n");
}

function voteKb(chatId: number, s: OutsiderState) {
  const buttons = [...s.players.values()].map((p) => {
    const cnt = [...s.votes.values()].filter((v) => v === p.id).length;
    const label = cnt > 0 ? `${dnO(p)} (${cnt}) 🗳` : dnO(p);
    return [Markup.button.callback(label, `out:vote:${chatId}:${p.id}`)];
  });
  return Markup.inlineKeyboard(buttons);
}

// Use INDEX (0-9) in callback to stay well under Telegram's 64-byte limit
function catSelectionKb(chatId: number, selected: Set<string>) {
  const rows = CATEGORY_KEYS.map((k, i) => {
    const on = selected.has(k);
    // callback: "out:cat:{chatId}:{index}" — max ~25 bytes ✓
    return [Markup.button.callback(on ? `✅ ${k}` : `☑️ ${k}`, `out:cat:${chatId}:${i}`)];
  });
  rows.push([Markup.button.callback("🎮 بدء الانضمام", `out:catdone:${chatId}`)]);
  rows.push([Markup.button.callback("🌐 كل الفئات",   `out:catall:${chatId}`)]);
  return Markup.inlineKeyboard(rows);
}

// ─── Send role cards via DM ────────────────────────────────────────────────────
async function sendRoleCards(
  bot: Telegraf,
  s: OutsiderState,
  chatId: number
) {
  const insiders = [...s.players.values()].filter((p) => p.id !== s.outsiderId);
  const outsider = s.players.get(s.outsiderId!);

  // Outsider card
  if (outsider) {
    try {
      const buf = await generateOutsiderCard(dnO(outsider));
      await bot.telegram.sendPhoto(outsider.id, { source: buf }, {
        caption: `🫥 <b>أنت برا السالفة!</b>\n\nالكل يعرف كلمة سرية <b>ما تعرفها أنت</b>.\nاستمع للتلميحات واكتشف الكلمة!`,
        parse_mode: "HTML",
      });
    } catch {
      await bot.telegram.sendMessage(outsider.id,
        `🫥 <b>أنت برا السالفة!</b>\n\nالكل يعرف كلمة سرية ما تعرفها أنت.\nاستمع للتلميحات واكتشف الكلمة!`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }
  }

  // Insider cards
  for (const p of insiders) {
    try {
      const buf = await generateInsiderCard(dnO(p), s.category!, s.topic!);
      await bot.telegram.sendPhoto(p.id, { source: buf }, {
        caption: `✅ <b>أنت داخل السالفة!</b>\n\nلمّح على الكلمة بذكاء — <b>لا تقولها مباشرة!</b> 🎯`,
        parse_mode: "HTML",
      });
    } catch {
      await bot.telegram.sendMessage(p.id,
        `✅ <b>أنت داخل السالفة!</b>\n\nالفئة: ${s.category}\nالكلمة: <b>${esc(s.topic!)}</b>\n\nلمّح بذكاء ولا تقولها مباشرة! 🎯`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }
  }
}

// ─── Start game ────────────────────────────────────────────────────────────────
export async function startOutsider(bot: Telegraf, ctx: Context) {
  const chatId = (ctx.chat as any).id;
  if (gameStates.has(chatId)) {
    ctx.reply("⚠️ في لعبة شغّالة! أنهوها أولاً.").catch(() => {});
    return;
  }

  const uid   = (ctx.from as any).id;
  const uname = (ctx.from as any).username;
  const fname = (ctx.from as any).first_name ?? "";
  const lname = (ctx.from as any).last_name ?? "";

  // Load previously saved categories or default to all
  const prevCats = savedCategories.get(chatId);
  const initialCats = prevCats ? new Set(prevCats) : new Set(CATEGORY_KEYS);

  const s: OutsiderState = {
    type: "outsider",
    phase: "selecting",
    players: new Map(),
    outsiderId: null,
    topic: null,
    category: null,
    votes: new Map(),
    hostId: uid,
    selectedCategories: initialCats,
    joinMsgId: undefined,
  };
  gameStates.set(chatId, s);

  const count = [...initialCats].reduce((a, k) => a + (ALL_TOPICS[k]?.length ?? 0), 0);
  const msg = await ctx.reply(
    `🫥 <b>برا السالفة</b> — اختر الفئات\n\n` +
    `الفئات المختارة: <b>${initialCats.size}</b> | المواضيع: <b>${count}</b>\n\n` +
    `✅ مفعّلة  |  ☑️ معطّلة\n` +
    `<i>اختياراتك السابقة محفوظة تلقائياً</i>`,
    { parse_mode: "HTML", ...catSelectionKb(chatId, s.selectedCategories) }
  );

  s.joinMsgId = msg.message_id;
}

// ─── Category toggle ────────────────────────────────────────────────────────────
export async function handleOutsiderCatToggle(
  bot: Telegraf, ctx: Context, chatId: number, catIndex: number
) {
  const uid = (ctx.from as any).id;
  const s = gameStates.get(chatId);
  if (!s || s.type !== "outsider" || s.phase !== "selecting") {
    ctx.answerCbQuery("⚠️ ما في لعبة").catch(() => {}); return;
  }
  if (uid !== s.hostId) {
    ctx.answerCbQuery("فقط من بدأ اللعبة يقدر يختار الفئات!").catch(() => {}); return;
  }

  const cat = CATEGORY_KEYS[catIndex];
  if (!cat) { ctx.answerCbQuery("⚠️ فئة غير صالحة").catch(() => {}); return; }

  if (s.selectedCategories.has(cat)) {
    if (s.selectedCategories.size <= 1) {
      ctx.answerCbQuery("لازم تبقى فئة واحدة على الأقل!").catch(() => {}); return;
    }
    s.selectedCategories.delete(cat);
  } else {
    s.selectedCategories.add(cat);
  }

  const count = [...s.selectedCategories.values()].reduce(
    (a, k) => a + (ALL_TOPICS[k]?.length ?? 0), 0
  );

  // Persist selection
  savedCategories.set(chatId, new Set(s.selectedCategories));

  await ctx.editMessageText(
    `🫥 <b>برا السالفة</b> — اختر الفئات\n\n` +
    `الفئات المختارة: <b>${s.selectedCategories.size}</b> | المواضيع: <b>${count}</b>\n\n` +
    `✅ مفعّلة  |  ☑️ معطّلة`,
    { parse_mode: "HTML", ...catSelectionKb(chatId, s.selectedCategories) }
  ).catch(() => {});

  ctx.answerCbQuery().catch(() => {});
}

// ─── Select all categories ──────────────────────────────────────────────────────
export async function handleOutsiderCatAll(
  bot: Telegraf, ctx: Context, chatId: number
) {
  const uid = (ctx.from as any).id;
  const s = gameStates.get(chatId);
  if (!s || s.type !== "outsider" || s.phase !== "selecting") {
    ctx.answerCbQuery().catch(() => {}); return;
  }
  if (uid !== s.hostId) {
    ctx.answerCbQuery("فقط من بدأ اللعبة!").catch(() => {}); return;
  }

  CATEGORY_KEYS.forEach((k) => s.selectedCategories.add(k));
  const count = [...s.selectedCategories.values()].reduce((a, k) => a + (ALL_TOPICS[k]?.length ?? 0), 0);

  savedCategories.set(chatId, new Set(s.selectedCategories));

  await ctx.editMessageText(
    `🫥 <b>برا السالفة</b> — اختر الفئات\n\n` +
    `الفئات المختارة: <b>${s.selectedCategories.size}</b> | المواضيع: <b>${count}</b>\n\n` +
    `✅ مفعّلة  |  ☑️ معطّلة`,
    { parse_mode: "HTML", ...catSelectionKb(chatId, s.selectedCategories) }
  ).catch(() => {});

  ctx.answerCbQuery("✅ كل الفئات مفعّلة").catch(() => {});
}

// ─── Confirm category selection → start join phase ─────────────────────────────
export async function handleOutsiderCatDone(
  bot: Telegraf, ctx: Context, chatId: number
) {
  const uid   = (ctx.from as any).id;
  const uname = (ctx.from as any).username;
  const fname = (ctx.from as any).first_name ?? "";
  const lname = (ctx.from as any).last_name ?? "";
  const s = gameStates.get(chatId);

  if (!s || s.type !== "outsider" || s.phase !== "selecting") {
    ctx.answerCbQuery().catch(() => {}); return;
  }
  if (uid !== s.hostId) {
    ctx.answerCbQuery("فقط من بدأ اللعبة يقدر يبدأ الانضمام!").catch(() => {}); return;
  }

  s.phase = "joining";

  // Persist categories on game start
  savedCategories.set(chatId, new Set(s.selectedCategories));

  // Add host as first player
  const hostPlayer: OutsiderPlayer = { id: uid, username: uname, firstName: fname, lastName: lname };
  s.players.set(uid, hostPlayer);
  privateUserToGame.set(uid, chatId);

  // Delete the category selection message and send a fresh join message
  ctx.answerCbQuery().catch(() => {});

  const joinMsg = await bot.telegram.sendMessage(chatId,
    `🫥 <b>برا السالفة</b> — باب الانضمام مفتوح!\n\n` +
    `👤 اللاعبون (${s.players.size}):\n${playerList(s)}\n\n` +
    `اضغط <b>➕ انضم</b> للمشاركة!\n` +
    `عندك <b>60 ثانية</b> قبل ما تبدأ اللعبة تلقائياً.`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕  انضم للعبة", `out:join:${chatId}`)],
        [Markup.button.callback("▶️  ابدأ الآن", `out:fstart:${chatId}`)],
      ]),
    }
  ).catch(() => null);

  if (joinMsg) s.joinMsgId = joinMsg.message_id;

  // Warn at 40s
  s.joinWarnTimer = setTimeout(async () => {
    const gs = gameStates.get(chatId);
    if (!gs || gs.type !== "outsider" || gs.phase !== "joining") return;
    bot.telegram.sendMessage(chatId,
      `⏳ <b>تبقى 20 ثانية!</b> — انضم الآن قبل فوات الأوان (${gs.players.size} لاعب) 👋`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }, JOIN_WARN_MS);

  // Auto-start
  s.joinTimer = setTimeout(() => launchGame(bot, chatId), JOIN_MS);
}

// ─── Join ──────────────────────────────────────────────────────────────────────
export async function handleOutsiderJoin(
  bot: Telegraf, ctx: Context, chatId: number
) {
  const uid   = (ctx.from as any).id;
  const uname = (ctx.from as any).username;
  const fname = (ctx.from as any).first_name ?? "";
  const lname = (ctx.from as any).last_name ?? "";
  const s = gameStates.get(chatId);

  if (!s || s.type !== "outsider" || s.phase !== "joining") {
    ctx.answerCbQuery("❌ التسجيل مو متاح الحين").catch(() => {}); return;
  }
  if (s.players.has(uid)) {
    ctx.answerCbQuery("✅ أنت مسجل مسبقاً!").catch(() => {}); return;
  }

  s.players.set(uid, { id: uid, username: uname, firstName: fname, lastName: lname });
  privateUserToGame.set(uid, chatId);

  const name = dnO({ id: uid, username: uname, firstName: fname, lastName: lname });
  ctx.answerCbQuery(`✅ ${name} انضم!`).catch(() => {});

  // Send a brief status update (don't edit the shared join message to avoid conflicts)
  await bot.telegram.sendMessage(chatId,
    `✅ <b>${esc(name)}</b> انضم للعبة!\n👥 اللاعبون الآن (${s.players.size}):\n${playerList(s)}`,
    { parse_mode: "HTML" }
  ).catch(() => {});
}

// ─── Force start ───────────────────────────────────────────────────────────────
export async function handleOutsiderForceStart(
  bot: Telegraf, ctx: Context, chatId: number
) {
  const uid = (ctx.from as any).id;
  const s   = gameStates.get(chatId);

  if (!s || s.type !== "outsider" || s.phase !== "joining") {
    ctx.answerCbQuery("❌ ما في تسجيل").catch(() => {}); return;
  }
  if (uid !== s.hostId) {
    ctx.answerCbQuery("فقط من بدأ اللعبة يقدر يضغط هذا!").catch(() => {}); return;
  }
  if (s.players.size < MIN_PLAYERS) {
    ctx.answerCbQuery(`ما يكفي لاعبين! (${s.players.size}/${MIN_PLAYERS})`).catch(() => {}); return;
  }
  ctx.answerCbQuery("🚀 تم!").catch(() => {});
  launchGame(bot, chatId);
}

// ─── Launch game ───────────────────────────────────────────────────────────────
async function launchGame(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "outsider" || s.phase !== "joining") return;
  if (s.players.size < MIN_PLAYERS) {
    bot.telegram.sendMessage(chatId,
      `❌ ما كفت لاعبين! (${s.players.size}/${MIN_PLAYERS})\nاللعبة انتهت.`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    clearGame(chatId);
    return;
  }

  s.phase = "hinting";

  // Pick outsider randomly
  const allIds = [...s.players.keys()];
  s.outsiderId = allIds[Math.floor(Math.random() * allIds.length)];

  // Pick topic
  const { category, topic } = pickTopic([...s.selectedCategories]);
  s.topic    = topic;
  s.category = category;

  // Group announcement with skip-to-vote button for host
  const playerNames = [...s.players.values()].map((p) => `• ${esc(dnO(p))}`).join("\n");
  await bot.telegram.sendMessage(chatId,
    `🫥 <b>برا السالفة — اللعبة بدأت!</b>\n\n` +
    `👥 اللاعبون (${s.players.size}):\n${playerNames}\n\n` +
    `📨 <b>شوف خاصك</b> — وصلك دورك هناك!\n\n` +
    `🗣 <b>كل لاعب يلمّح</b> عن الكلمة في القروب دون أن يذكرها مباشرة.\n` +
    `التصويت يبدأ تلقائياً بعد <b>دقيقتين</b> ⏳\n\n` +
    `<i>من بدأ اللعبة يقدر يبدأ التصويت مبكراً من الزر أدناه</i>`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("⏭️ ابدأ التصويت الآن (للمضيف فقط)", `out:skipvote:${chatId}`)],
      ]),
    }
  ).catch(() => {});

  // Send role cards
  await sendRoleCards(bot, s, chatId);

  // Hinting warn timer
  s.hintWarnTimer = setTimeout(() => {
    const gs = gameStates.get(chatId);
    if (!gs || gs.type !== "outsider" || gs.phase !== "hinting") return;
    bot.telegram.sendMessage(chatId,
      `⏳ <b>تبقى 40 ثانية</b> على التصويت — لمّحوا الآن! 🎯`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }, HINT_WARN_MS);

  // Hinting end timer
  s.hintTimer = setTimeout(() => startVoting(bot, chatId), HINT_MS);
}

// ─── Skip to voting (host-only shortcut) ───────────────────────────────────────
export async function handleOutsiderSkipVote(
  bot: Telegraf, ctx: Context, chatId: number
) {
  const uid = (ctx.from as any).id;
  const s = gameStates.get(chatId);
  if (!s || s.type !== "outsider" || s.phase !== "hinting") {
    ctx.answerCbQuery("⚠️ التصويت مش متاح الآن").catch(() => {}); return;
  }
  if (uid !== s.hostId) {
    ctx.answerCbQuery("فقط من بدأ اللعبة يقدر يضغط هذا! 🙅").catch(() => {}); return;
  }
  ctx.answerCbQuery("⏭️ ينتقل للتصويت الآن!").catch(() => {});
  // Cancel hint timers
  if (s.hintTimer) clearTimeout(s.hintTimer);
  if (s.hintWarnTimer) clearTimeout(s.hintWarnTimer);
  // Edit the message to remove the skip button
  ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
  await startVoting(bot, chatId);
}

// ─── Voting ────────────────────────────────────────────────────────────────────
async function startVoting(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "outsider" || s.phase !== "hinting") return;

  s.phase = "voting";

  const voteMsg = await bot.telegram.sendMessage(chatId,
    `🗳 <b>وقت التصويت!</b>\n\nمن تظن إنه <b>برا السالفة</b>؟\n\n` +
    `<i>لكل لاعب صوت واحد — صوّت الآن! (${s.votes.size}/${s.players.size})</i>`,
    { parse_mode: "HTML", ...voteKb(chatId, s) }
  ).catch(() => null);

  if (voteMsg) s.voteMsgId = voteMsg.message_id;

  s.voteWarnTimer = setTimeout(() => {
    const gs = gameStates.get(chatId);
    if (!gs || gs.type !== "outsider" || gs.phase !== "voting") return;
    bot.telegram.sendMessage(chatId,
      `⏳ <b>تبقى 30 ثانية</b> للتصويت! صوّتوا الآن 🗳`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }, VOTE_WARN_MS);

  s.voteTimer = setTimeout(() => resolveVote(bot, chatId), VOTE_MS);
}

// ─── Handle vote ───────────────────────────────────────────────────────────────
export async function handleOutsiderVote(
  bot: Telegraf, ctx: Context, chatId: number, targetId: number
) {
  const uid = (ctx.from as any).id;
  const s   = gameStates.get(chatId);

  if (!s || s.type !== "outsider" || s.phase !== "voting") {
    ctx.answerCbQuery("التصويت مو متاح الحين").catch(() => {}); return;
  }
  if (!s.players.has(uid)) {
    ctx.answerCbQuery("أنت مو من اللاعبين").catch(() => {}); return;
  }
  if (uid === targetId) {
    ctx.answerCbQuery("ما تقدر تصوت على نفسك!").catch(() => {}); return;
  }
  if (!s.players.has(targetId)) {
    ctx.answerCbQuery("هذا مو لاعب").catch(() => {}); return;
  }

  const prev = s.votes.get(uid);
  s.votes.set(uid, targetId);

  ctx.answerCbQuery(prev ? "✏️ تم تعديل صوتك" : "✅ تم تسجيل صوتك").catch(() => {});

  // Update vote display
  await ctx.editMessageText(
    `🗳 <b>التصويت!</b>\n\nمن تظن إنه برا السالفة؟\n<i>لكل شخص صوت واحد — ${s.votes.size}/${s.players.size} صوتوا</i>`,
    { parse_mode: "HTML", ...voteKb(chatId, s) }
  ).catch(() => {});

  // All voted → early resolve
  if (s.votes.size >= s.players.size) resolveVote(bot, chatId);
}

// ─── Build word choices (correct + 4 decoys from same category) ───────────────
function buildWordChoices(category: string, topic: string): string[] {
  const pool = (ALL_TOPICS[category] ?? []).filter((w) => w !== topic);
  // Shuffle pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const choices = [topic, ...pool.slice(0, 4)];
  // Shuffle choices
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}

// ─── Send word-choice keyboard to outsider via DM ────────────────────────────
async function sendWordChoiceDM(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "outsider") return;

  const outsider = s.players.get(s.outsiderId!);
  if (!outsider) { finalizeGame(bot, chatId, false); return; }

  const choices = buildWordChoices(s.category!, s.topic!);
  s.wordChoices = choices;

  const caught = s.outsiderCaught ?? false;
  const intro  = caught
    ? `🫥 <b>اكتشفوك — لكن عندك فرصة أخيرة!</b>\n\nخمّن الكلمة السرية واكسب! 🎯`
    : `🫥 <b>نجوت من التصويت — الآن خمّن الكلمة!</b>\n\nاختر الكلمة الصح من القائمة وتفوز! 🏆`;

  const buttons = choices.map((w, i) =>
    [Markup.button.callback(w, `out:guess:${chatId}:${i}`)]
  );

  try {
    await bot.telegram.sendMessage(outsider.id,
      `${intro}\n\n<i>الفئة: ${s.category}</i>\n\n<b>اختر الكلمة:</b>`,
      { parse_mode: "HTML", ...Markup.inlineKeyboard(buttons) }
    );
    // Announce in group
    await bot.telegram.sendMessage(chatId,
      caught
        ? `🫥 <b>${esc(dnO(outsider))}</b> عنده <b>45 ثانية</b> يختار الكلمة السرية من قائمة!\n\nانتظروا... ⏳`
        : `😏 <b>اتهمتوا الشخص الغلط!</b>\n\n` +
          `برا السالفة هو <b>${esc(dnO(outsider))}</b> 🫥\n` +
          `الآن يخمّن الكلمة — عنده <b>45 ثانية</b>! ⏳`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  } catch {
    // Can't DM → finalize without guess
    await bot.telegram.sendMessage(chatId,
      `⚠️ ما قدرنا نرسل للاعب الخاص! تأكد إنه فتح المحادثة مع البوت.`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    finalizeGame(bot, chatId, false);
    return;
  }

  s.guessTimer = setTimeout(() => finalizeGame(bot, chatId, false), GUESS_MS);
}

// ─── Resolve vote ──────────────────────────────────────────────────────────────
async function resolveVote(bot: Telegraf, chatId: number) {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "outsider" || s.phase !== "voting") return;

  s.phase = "guessing";

  // Count votes
  const tally = new Map<number, number>();
  for (const target of s.votes.values()) {
    tally.set(target, (tally.get(target) ?? 0) + 1);
  }

  let maxVotes = 0;
  let accused: number | null = null;
  for (const [pid, cnt] of tally) {
    if (cnt > maxVotes) { maxVotes = cnt; accused = pid; }
  }

  const accusedPlayer = accused ? s.players.get(accused) : null;
  const isOutsider    = accused === s.outsiderId;
  s.outsiderCaught    = isOutsider;

  // Show vote results
  const voteLines = [...s.players.values()].map((p) => {
    const cnt = tally.get(p.id) ?? 0;
    const bar = "🔸".repeat(Math.min(cnt, 8)) || "—";
    return `${esc(dnO(p))}: ${bar} (${cnt})`;
  }).join("\n");

  const outsiderPlayer = s.players.get(s.outsiderId!);
  const outsiderReveal = outsiderPlayer ? esc(dnO(outsiderPlayer)) : "؟";
  const outsiderRawName = outsiderPlayer ? dnO(outsiderPlayer) : "؟";

  // Show vote results
  await bot.telegram.sendMessage(chatId,
    `📊 <b>نتيجة التصويت:</b>\n\n${voteLines}\n\n` +
    `🎯 أعلى أصوات: <b>${accusedPlayer ? esc(dnO(accusedPlayer)) : "تعادل / ما صوت أحد"}</b>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  // Send dramatic reveal card
  try {
    const revealBuf = await generateRevealCard(outsiderRawName);
    await bot.telegram.sendPhoto(chatId, { source: revealBuf }, {
      caption:
        `🫥 <b>برا السالفة كان...</b> <b>${outsiderReveal}</b>!\n\n` +
        (isOutsider
          ? `✅ كشفتوه! لكن له فرصة أخيرة — يختار الكلمة ويكسب نقطة 🎯`
          : `❌ اتهمتوا الشخص الغلط!\n${outsiderReveal} الآن يختار الكلمة — لو صح يكسب! 🏆`),
      parse_mode: "HTML",
    });
  } catch {
    // Fallback to text if image fails
    await bot.telegram.sendMessage(chatId,
      `🫥 <b>برا السالفة كان...</b> <b>${outsiderReveal}</b>!\n\n` +
      (isOutsider
        ? `✅ كشفتوه! لكن له فرصة أخيرة — يختار الكلمة ويكسب نقطة 🎯`
        : `❌ اتهمتوا الشخص الغلط!\n${outsiderReveal} الآن يختار الكلمة — لو صح يكسب! 🏆`),
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  // Always give outsider the word-choice challenge
  await sendWordChoiceDM(bot, chatId);
}

// ─── Handle outsider's word pick (button) ────────────────────────────────────
export async function handleOutsiderWordPick(
  bot: Telegraf, ctx: Context, chatId: number, choiceIndex: number
) {
  const uid = (ctx.from as any).id;
  const s   = gameStates.get(chatId);

  if (!s || s.type !== "outsider" || s.phase !== "guessing") {
    ctx.answerCbQuery("انتهى وقت التخمين!").catch(() => {}); return;
  }
  if (uid !== s.outsiderId) {
    ctx.answerCbQuery("مو دورك!").catch(() => {}); return;
  }
  if (!s.wordChoices || choiceIndex < 0 || choiceIndex >= s.wordChoices.length) {
    ctx.answerCbQuery("خيار غير صالح").catch(() => {}); return;
  }

  const chosen  = s.wordChoices[choiceIndex];
  const correct = s.topic!;
  const isRight = chosen === correct;

  // Cancel the timeout
  if (s.guessTimer) { clearTimeout(s.guessTimer); s.guessTimer = undefined; }

  if (isRight) {
    await ctx.editMessageText(
      `✅ <b>اخترت: ${esc(chosen)}</b>\n\n🎉 صح! يتم إعلان النتيجة...`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  } else {
    await ctx.editMessageText(
      `❌ <b>اخترت: ${esc(chosen)}</b>\n\nالكلمة الصحيحة كانت: <b>${esc(correct)}</b>`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  ctx.answerCbQuery(isRight ? "🎉 صح!" : "❌ خطأ!").catch(() => {});

  await finalizeGame(bot, chatId, isRight);
}

// ─── Kept for backwards-compat (unused now) ──────────────────────────────────
export async function handleOutsiderGuess(
  _bot: Telegraf, _chatId: number, _uid: number, _text: string
) { /* replaced by button-based picking */ }

// ─── Finalize game ─────────────────────────────────────────────────────────────
// outsiderGuessedRight = did outsider pick the correct word?
async function finalizeGame(
  bot: Telegraf,
  chatId: number,
  outsiderGuessedRight: boolean,
) {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "outsider") return;
  if (s.phase === "done") return;
  s.phase = "done";

  const outsiderCaught = s.outsiderCaught ?? false;
  const outsider       = s.players.get(s.outsiderId!);
  const insiders       = [...s.players.values()].filter((p) => p.id !== s.outsiderId);
  const outsiderName   = outsider ? esc(dnO(outsider)) : "؟";

  // ── Points: correct voters (voted for the outsider) ──────────────────────
  const correctVoters = [...s.votes.entries()]
    .filter(([, target]) => target === s.outsiderId)
    .map(([voterId]) => s.players.get(voterId))
    .filter((p): p is OutsiderPlayer => !!p);

  for (const v of correctVoters) recordWin(chatId, toPlayer(v));

  // ── Points: outsider guessed correctly ────────────────────────────────────
  if (outsiderGuessedRight && outsider) recordWin(chatId, toPlayer(outsider));

  // ── Count game for all ────────────────────────────────────────────────────
  recordGame(chatId, [...s.players.values()].map(toPlayer));

  // ── Result message ────────────────────────────────────────────────────────
  let resultMsg = `🫥 <b>انتهت اللعبة!</b>\n\n`;
  resultMsg    += `🔑 الكلمة السرية: <b>${esc(s.topic ?? "؟")}</b>  |  ${s.category ?? ""}\n`;
  resultMsg    += `👤 برا السالفة: <b>${outsiderName}</b>\n\n`;

  if (outsiderGuessedRight) {
    resultMsg += `🎯 <b>${outsiderName} خمّن الكلمة الصح — يكسب نقطة!</b>\n`;
  } else if (outsiderCaught) {
    resultMsg += `🎉 <b>كشفوا برا السالفة وما قدر يخمن!</b>\n`;
  } else {
    resultMsg += `😈 <b>${outsiderName} نجا من التصويت!</b>\n`;
  }

  // Points summary
  const pointLines: string[] = [];
  if (correctVoters.length > 0) {
    pointLines.push(`🗳 صوّتوا صح (+1 نقطة): ${correctVoters.map((p) => esc(dnO(p))).join("، ")}`);
  }
  if (outsiderGuessedRight && outsider) {
    pointLines.push(`🎯 خمّن الكلمة (+1 نقطة): ${outsiderName}`);
  }
  if (pointLines.length > 0) {
    resultMsg += `\n<b>النقاط اللي اتمنحت:</b>\n${pointLines.join("\n")}`;
  } else {
    resultMsg += `\n<i>ما أحد كسب نقطة هالجولة!</i>`;
  }

  await bot.telegram.sendMessage(chatId, resultMsg, { parse_mode: "HTML" }).catch(() => {});

  clearGame(chatId);
}
