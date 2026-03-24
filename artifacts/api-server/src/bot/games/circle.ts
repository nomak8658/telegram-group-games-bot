import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import {
  gameStates, clearGame, recordWin, recordGame, esc,
  type CircleState, type CirclePlayer, type CircleChallenge,
} from "../state.js";
import { generateCircleEliminatedCard, generateCircleWinnerCard } from "../circleCard.js";
import { logger } from "../../lib/logger.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dnC(p: CirclePlayer): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return full || (p.username ? `@${p.username}` : String(p.id));
}

function toP(p: CirclePlayer) {
  return { id: p.id, username: p.username, name: dnC(p) };
}

function playerList(s: CircleState): string {
  return [...s.players.values()].map(p => `• ${esc(dnC(p))}`).join("\n") || "—";
}

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text.trim());
}

// ─── Category word lists ──────────────────────────────────────────────────────

const WORDS: Record<string, string[]> = {
  animals: [
    "قط","كلب","حصان","بقرة","شاة","خروف","ماعز","أرنب","ببغاء","حمام","دجاج","ديك","بط","إوزة",
    "جمل","ناقة","حمار","بغل","جاموس","فأر","أسد","نمر","فيل","زرافة","قرد","ثعلب","ذئب","دب",
    "كركدن","فهد","شمبانزي","غوريلا","زبرا","غزال","وعل","أيل","نمس","ظبي","لاما","مها","كنغر",
    "ألباكا","ياك","نسر","صقر","طاووس","بجعة","لقلق","فلامينغو","بومة","هدهد","بلبل","عصفور",
    "غراب","شاهين","عندليب","طوقان","حجل","عقاب","سنونو","يمامة","بطريق","كركي","دلفين","حوت",
    "قرش","أخطبوط","حبار","فقمة","سلطعون","كركند","تونة","تمساح","أفعى","ثعبان","كوبرا","سحلية",
    "حرباء","سلحفاة","ضفدع","ضب","ورل","وزغ","برص","نحلة","فراشة","نمل","صرصور","عقرب","بعوضة",
    "خنفساء","حلزون","عنكبوت","خفاش","قنفذ","سنجاب","ضبع","غرير","راكون","بابون",
  ],
  fruits: [
    "تفاح","موز","برتقال","عنب","بطيخ","فراولة","مانجو","خوخ","كمثرى","تين","رمان","ليمون",
    "أناناس","كيوي","توت","كرز","شمام","بلح","جوافة","بابايا","ليتشي","نارنج","زيتون","نبق",
    "قشطة","آفوكادو","تمر","مشمش","برقوق","كراز","لوز","فستق","جوز","جريب فروت","مندرين",
    "يوسفي","نكتارين","إجاص","دراق","عليق","تمر هندي","جوز هند","خرموز","درّاق","حبحب",
  ],
  colors: [
    "أحمر","أزرق","أخضر","أصفر","أبيض","أسود","برتقالي","بنفسجي","وردي","بني","رمادي","ذهبي",
    "فضي","تركوازي","زيتي","كحلي","عنابي","قرمزي","فيروزي","أرجواني","سماوي","بيج","كريمي",
    "خوخي","ليموني","بطيخي","نيلي","شفاف","قاتم","فاتح","أخضر زيتي","أزرق سماوي","بنفسجي داكن",
    "أحمر داكن","رصاصي","خمري","نيلوفري","أزرق نيلي","أحمر أرجواني",
  ],
  cities_sa: [
    "الرياض","جدة","مكة","المدينة","الدمام","الخبر","الظهران","تبوك","أبها","خميس مشيط",
    "حائل","نجران","جازان","ينبع","القطيف","الهفوف","الطائف","بريدة","عنيزة","المجمعة",
    "الجبيل","شقراء","الزلفي","عرعر","سكاكا","رفحاء","طريف","وادي الدواسر","بيشة","المخواة",
    "القنفذة","صبيا","ضباء","العُلا","أبو عريش","الباحة","المدينة المنورة","رابغ","عفيف","المزاحمية",
  ],
  cities_world: [
    "باريس","لندن","نيويورك","طوكيو","دبي","برلين","روما","مدريد","موسكو","بكين","سيدني",
    "تورنتو","مومباي","القاهرة","لاغوس","مكسيكو","بوينس آيرس","برازيليا","إسطنبول","بانكوك",
    "سيول","جاكرتا","مانيلا","هونج كونج","سنغافورة","كوالالمبور","كراتشي","لاهور","دلهي",
    "شنغهاي","أمستردام","بروكسل","زيورخ","فيينا","براغ","وارسو","بودابست","أثينا","ليزبون",
  ],
  countries_ar: [
    "السعودية","مصر","الإمارات","الكويت","قطر","البحرين","عُمان","الأردن","لبنان","سوريا",
    "العراق","ليبيا","تونس","الجزائر","المغرب","السودان","اليمن","الصومال","موريتانيا","جيبوتي",
    "فلسطين","جزر القمر","إريتريا",
  ],
  countries_asia: [
    "الصين","اليابان","الهند","كوريا","تايلاند","إندونيسيا","ماليزيا","سنغافورة","فيتنام",
    "الفلبين","بنغلاديش","باكستان","أفغانستان","إيران","تركيا","كازاخستان","أوزبكستان",
    "أذربيجان","جورجيا","أرمينيا","نيبال","سريلانكا","ميانمار","كمبوديا","لاوس","منغوليا",
    "تايوان","بروناي","المالديف","قيرغيزستان","طاجيكستان","تركمانستان",
  ],
  countries_europe: [
    "فرنسا","ألمانيا","إيطاليا","إسبانيا","بريطانيا","روسيا","هولندا","بلجيكا","سويسرا",
    "النمسا","السويد","النرويج","الدنمارك","فنلندا","بولندا","المجر","التشيك","اليونان",
    "البرتغال","رومانيا","أوكرانيا","بيلاروسيا","صربيا","كرواتيا","سلوفينيا","بلغاريا",
    "لوكسمبورغ","أيسلندا","أيرلندا","اسكتلندا","ويلز",
  ],
  countries_africa: [
    "نيجيريا","إثيوبيا","تنزانيا","كينيا","جنوب أفريقيا","غانا","الكاميرون","أنغولا",
    "موزمبيق","مدغشقر","زامبيا","زيمبابوي","السنغال","مالي","بوركينا فاسو","غينيا","رواندا",
    "أوغندا","الكونغو","الكونغو الديمقراطية","ساحل العاج","الغابون","بوتسوانا","ناميبيا",
  ],
  jobs: [
    "طبيب","مهندس","معلم","محامي","طيار","ممرض","شرطي","جندي","عامل","فلاح","بائع","محاسب",
    "مصمم","مبرمج","مدير","مستشار","سائق","طباخ","حلاق","نجار","حداد","كهربائي","سباك",
    "بناء","رسام","ممثل","صحفي","مذيع","فنان","موسيقي","لاعب","مدرب","صيدلاني","مصور",
    "مخرج","كاتب","شاعر","باحث","أستاذ","نادل","كاشير","مزارع","ربان","قاضي","مفتي",
    "مؤذن","خباز","جزار","خياط","نحات","ملاح","رائد فضاء","مفتش","محقق","عالم",
  ],
  food: [
    "كبسة","مندي","مطبق","حريس","جريش","صالونة","كباب","شاورما","فلافل","حمص","فتة","مسخن",
    "مقلوبة","بريياني","سمبوسة","لقيمات","خبز","رز","تمر","قهوة","شاي","لبن","هريس",
    "بسبوسة","كنافة","قطايف","مهلبية","كليجا","ملوخية","كشك","منسف","بيريك","باقلاء",
    "فول","عدس","شعير","شيش طاووق","برياني","جريش","زبادي","لبنة","أرز","مضغوط","مرق",
    "هرائس","أسيدة","شربة","بلح","تمر هندي","عصيدة","عجين","مقامير","خبيصة","قرصان",
  ],
  vegetables: [
    "طماطم","بصل","ثوم","جزر","بطاطس","خيار","فلفل","كوسا","باذنجان","ملفوف","قرنبيط",
    "بروكلي","سبانخ","خس","فاصولياء","بازلاء","ذرة","قرع","لفت","فجل","كرات","كرفس",
    "بامية","هليون","فجل أبيض","بنجر","جعدة","أرضي شوكي","ملوخية","بقدونس","كزبرة",
    "نعناع","شبت","زعتر","حلبة","كمون","كركم","زنجبيل","طرخون","ريحان",
  ],
  sports: [
    "كرة قدم","كرة سلة","كرة طائرة","تنس","سباحة","جري","ملاكمة","مصارعة","غولف","جمباز",
    "رماية","فروسية","رياضة الدراجات","سكواش","بادمنتون","تنس طاولة","رفع أثقال","كريكيت",
    "هوكي","رغبي","أمريكان فوتبول","بيسبول","قفز","سيف","جودو","كاراتيه","تايكوندو",
    "كيك بوكسينج","ألعاب قوى","مشي","تسلق","غطس","تجديف","ريف","سباق خيل","إسكي",
  ],
  electronics: [
    "هاتف","جهاز لوحي","حاسوب","لابتوب","تلفاز","ثلاجة","غسالة","مكيف","مروحة","فرن",
    "مايكروويف","سماعات","كاميرا","طابعة","راوتر","بلايستيشن","إكس بوكس","ساعة ذكية",
    "سمارت تي في","شاشة","ماوس","كيبورد","وحدة تخزين","باور بنك","سماعات لاسلكية",
    "درون","روبوت","جهاز بصمة","مكنسة كهربائية","ميزان إلكتروني","جهاز قياس ضغط",
  ],
  clothes: [
    "ثوب","عباية","قميص","بنطلون","فستان","تنورة","جاكيت","معطف","بلوزة","تيشيرت",
    "جوارب","حذاء","صندل","كوفية","شماغ","غترة","عقال","كاب","قبعة","حزام","ربطة عنق",
    "بدلة","طقم","بيجامة","ملابس رياضية","شورت","بنطال جينز","سترة","كوت","بونشو",
    "إيشارب","شال","قفازات","منتو","عباءة","بشت","سروال","توب","كارديغان",
  ],
  furniture: [
    "كرسي","طاولة","سرير","خزانة","أريكة","رف","مكتب","خزانة ملابس","سجادة","ستارة",
    "مرآة","إطار صورة","تلفاز","مصباح","وسادة","لحاف","مرتبة","ثلاجة","باب","نافذة",
    "درج","بوفيه","كنبة","ركيزة","مشجب","صنبور","مغسلة","شماعة","منضدة جانبية",
  ],
  body_parts: [
    "رأس","وجه","عين","أنف","أذن","فم","شفة","سن","لسان","رقبة","كتف","ذراع","مرفق",
    "يد","أصبع","ظفر","صدر","بطن","ظهر","خصر","ورك","فخذ","ركبة","ساق","قدم","كعب",
    "جبهة","خد","حاجب","رمش","حلق","قلب","رئة","كبد","كلية","معدة","عمود فقري",
    "عضلة","وريد","شريان","جلد","عظم","مخ","دماغ",
  ],
  school_subjects: [
    "رياضيات","علوم","تاريخ","جغرافيا","عربي","إنجليزي","فيزياء","كيمياء","أحياء",
    "تربية إسلامية","تربية وطنية","فنون","موسيقى","حاسوب","اجتماعيات","فلسفة","منطق",
    "اقتصاد","محاسبة","قانون","طب","هندسة","أدب","لغة عربية","تربية بدنية","حرف يدوية",
  ],
  languages: [
    "عربي","إنجليزي","فرنسي","إسباني","ألماني","صيني","ياباني","روسي","برتغالي","إيطالي",
    "هندي","أردو","بنغالي","تركي","فارسي","كوري","ملايو","إندونيسي","هولندي","بولندي",
    "سويدي","نرويجي","دنماركي","فنلندي","يوناني","عبري","سواحيلي","هوسا","أمهرية",
  ],
  vehicles: [
    "سيارة","دراجة","شاحنة","باص","قطار","طائرة","سفينة","قارب","دراجة نارية","طوافة",
    "مترو","ترام","تاكسي","ليموزين","جيب","بيك آب","كارافان","مركبة فضائية","غواصة",
    "عربة","قطار سريع","طائرة مروحية","زورق","مركب شراعي","لنش","ناقلة نفط","رافعة",
    "بولدوزر","جرافة","حفارة","دراجة هوائية",
  ],
  car_brands: [
    "تويوتا","هوندا","نيسان","بي إم دبليو","مرسيدس","أودي","فولكسفاغن","فورد","شيفرولية",
    "لكزس","هيونداي","كيا","مازدا","سوبارو","ميتسوبيشي","سوزوكي","بيجو","رينو","سيتروين",
    "فيراري","لامبورغيني","بورش","رولز رويس","بنتلي","جاغوار","أرييل","ماكلارين","أستون مارتن",
    "لاند روفر","جيب","دودج","جنرال موتورز","هامر","لينكولن","إنفينيتي","أكيورا","جينيسيس",
  ],
  rivers: [
    "النيل","الفرات","دجلة","الأمازون","المسيسيبي","الفولغا","الراين","الدانوب","الميكونغ",
    "الغانج","السند","اليانغتسي","الكونغو","النيجر","الزمبيزي","الأورال","الينيسي","اللينا",
    "الهدسون","كولورادو","أوهايو","ميسوري","السين","الفستولا","أوكا","الإيبيريا","الإيبرو",
  ],
  seas_oceans: [
    "المحيط الهادئ","المحيط الهندي","المحيط الأطلسي","المحيط المتجمد الشمالي","البحر المتوسط",
    "البحر الأحمر","بحر العرب","الخليج العربي","بحر قزوين","البحر الأسود","بحر البلطيق",
    "بحر الشمال","البحر الكاريبي","بحر قطر","البحر الأبيض","المحيط الجنوبي","بحر البنغال",
    "بحر إيجه","بحر الصين الجنوبي","بحر اليابان","خليج المكسيك","خليج فارس",
  ],
  planets: [
    "عطارد","الزهرة","الأرض","المريخ","المشتري","زحل","أورانوس","نبتون","بلوتو","القمر",
    "الشمس","المجرة","نجم","كويكب","مذنب","ثقب أسود","نيبيرو","سيريس","هاليبوب","كيرون",
    "إيو","يوروبا","غانيمد","كاليستو","تيتان","إنسيلادوس","ميراندا","أوبيرون","ترايتون",
  ],
  instruments: [
    "بيانو","غيتار","كمان","طبل","ناي","عود","رباب","قانون","مزمار","بوق","طرومبيت",
    "أكورديون","بانجو","هارمونيكا","أورغ","سنثسايزر","تشيللو","فيولا","كونترباس","أوبوا",
    "كلارينيت","فلوت","ساكسفون","دف","طار","مرواس","كيبورد","ماريمبا","زيلوفون","باس",
  ],
  tools: [
    "مطرقة","مفتاح ربط","مشرط","مسطرة","مثقاب","منشار","لحام","مبرد","قلم قياس",
    "ميزان ماء","شريط قياس","مقص","كماشة","عتلة","إزميل","سنفرة","مسمار","براغي",
    "مفك براغي","مبرد معادن","دلو","مجرفة","معول","فأس","منجل","جرافة يدوية","حفارة يد",
  ],
  arabic_names_m: [
    "محمد","أحمد","علي","عمر","خالد","سعد","فهد","عبدالله","سلطان","عبدالرحمن","يوسف",
    "إبراهيم","إسماعيل","بلال","حسن","حسين","ناصر","ماجد","عادل","وليد","زياد","طارق",
    "هشام","باسم","راشد","سالم","مازن","كريم","جاسم","نواف","صالح","منصور","ياسر",
    "فيصل","تركي","بندر","عبدالعزيز","سطام","متعب","مشعل","نايف","أنس","سامي","رامي",
  ],
  arabic_names_f: [
    "فاطمة","عائشة","مريم","سارة","نورة","ريم","لمياء","هند","لينا","منى","رنا","دانة",
    "أميرة","شيماء","زينب","خديجة","أسماء","رهف","غلا","ديما","رغد","مها","وفاء","سمية",
    "حنان","نادية","إيمان","بشرى","شروق","أروى","هيفاء","ريهام","نهى","صفاء","وجدان",
    "تهاني","ميار","جوري","صبا","علا","أماني","لجين","شمس","إلهام","نجاح",
  ],
};

// Keep inList working for multi-word list items (like "نجم البحر")
function inListFull(answer: string, list: string[]): boolean {
  const aTrimmed = answer.trim();
  const aFirst   = normalize(aTrimmed.split(/\s+/)[0]);
  if (aFirst.length < 2) return false;
  const aNorm = normalize(aTrimmed);
  return list.some(w => {
    const nw = normalize(w);
    if (nw === aNorm) return true;   // full match (multi-word)
    if (nw === aFirst) return true;  // exact first-word match
    if (aFirst.length >= 3 && nw.startsWith(aFirst) && aFirst.length >= nw.length - 2) return true;
    if (aFirst.length >= 4 && aFirst.startsWith(nw) && nw.length >= aFirst.length - 1) return true;
    return false;
  });
}

function normalize(t: string): string {
  return t.trim()
    .replace(/[أإآا]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/[\u064B-\u065F]/g, "") // remove tashkeel
    .toLowerCase();
}

function validateAnswer(challenge: CircleChallenge, answer: string): boolean {
  const t = answer.trim();
  if (!t) return false;
  switch (challenge.kind) {
    case "math": {
      const n = parseInt(t.replace(/[^\d]/g, ""), 10);
      return !isNaN(n) && n === challenge.expectedNum;
    }
    case "starts": {
      if (!isArabic(t) || !challenge.letter) return false;
      return normalize(t)[0] === normalize(challenge.letter!)[0];
    }
    case "no_letter": {
      if (!isArabic(t) || !challenge.letter) return false;
      return !normalize(t).includes(normalize(challenge.letter!));
    }
    case "race":
      return t.length >= 2 && isArabic(t);
    case "category": {
      if (!challenge.category) return false;
      const list = WORDS[challenge.category] ?? [];
      return t.length >= 2 && isArabic(t) && inListFull(t, list);
    }
    default: return false;
  }
}

// ─── Challenge bank ───────────────────────────────────────────────────────────

const MATH: CircleChallenge[] = [
  // سهل
  { kind: "math", text: "احسب: 7 × 8 = ؟",       expectedNum: 56,  timerSec: 11 },
  { kind: "math", text: "احسب: 6 × 9 = ؟",       expectedNum: 54,  timerSec: 11 },
  { kind: "math", text: "احسب: 9 × 9 = ؟",       expectedNum: 81,  timerSec: 10 },
  { kind: "math", text: "احسب: 8 × 7 = ؟",       expectedNum: 56,  timerSec: 11 },
  { kind: "math", text: "احسب: 12 × 6 = ؟",      expectedNum: 72,  timerSec: 11 },
  { kind: "math", text: "احسب: 48 ÷ 6 = ؟",     expectedNum: 8,   timerSec: 12 },
  { kind: "math", text: "احسب: 64 ÷ 8 = ؟",     expectedNum: 8,   timerSec: 11 },
  { kind: "math", text: "احسب: 15 + 27 = ؟",     expectedNum: 42,  timerSec: 11 },
  { kind: "math", text: "احسب: 33 + 49 = ؟",     expectedNum: 82,  timerSec: 12 },
  { kind: "math", text: "احسب: 100 - 38 = ؟",    expectedNum: 62,  timerSec: 11 },
  { kind: "math", text: "احسب: 150 - 67 = ؟",    expectedNum: 83,  timerSec: 12 },
  // متوسط
  { kind: "math", text: "احسب: 13 × 4 = ؟",     expectedNum: 52,  timerSec: 12 },
  { kind: "math", text: "احسب: 17 × 6 = ؟",     expectedNum: 102, timerSec: 13 },
  { kind: "math", text: "احسب: 19 × 3 = ؟",     expectedNum: 57,  timerSec: 12 },
  { kind: "math", text: "احسب: 25 × 4 = ؟",     expectedNum: 100, timerSec: 11 },
  { kind: "math", text: "احسب: 14 × 7 = ؟",     expectedNum: 98,  timerSec: 12 },
  { kind: "math", text: "احسب: 88 + 44 = ؟",     expectedNum: 132, timerSec: 12 },
  { kind: "math", text: "احسب: 250 ÷ 5 = ؟",   expectedNum: 50,  timerSec: 12 },
  { kind: "math", text: "احسب: 144 ÷ 12 = ؟",  expectedNum: 12,  timerSec: 12 },
  { kind: "math", text: "احسب: 200 - 76 = ؟",    expectedNum: 124, timerSec: 13 },
  { kind: "math", text: "احسب: 300 - 127 = ؟",   expectedNum: 173, timerSec: 13 },
  { kind: "math", text: "احسب: 11 × 11 = ؟",    expectedNum: 121, timerSec: 12 },
  { kind: "math", text: "احسب: 23 + 58 = ؟",     expectedNum: 81,  timerSec: 12 },
  // صعب
  { kind: "math", text: "احسب: 16 × 9 = ؟",     expectedNum: 144, timerSec: 14 },
  { kind: "math", text: "احسب: 23 × 8 = ؟",     expectedNum: 184, timerSec: 14 },
  { kind: "math", text: "احسب: 450 ÷ 9 = ؟",   expectedNum: 50,  timerSec: 13 },
  { kind: "math", text: "احسب: 500 - 247 = ؟",   expectedNum: 253, timerSec: 14 },
  { kind: "math", text: "احسب: 18 × 12 = ؟",    expectedNum: 216, timerSec: 15 },
  { kind: "math", text: "احسب: 125 + 376 = ؟",   expectedNum: 501, timerSec: 14 },
  { kind: "math", text: "احسب: 999 - 456 = ؟",   expectedNum: 543, timerSec: 14 },
  { kind: "math", text: "احسب: 36 × 5 = ؟",     expectedNum: 180, timerSec: 13 },
];

const STARTS: CircleChallenge[] = [
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "م"',  letter: "م", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "س"',  letter: "س", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ب"',  letter: "ب", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ح"',  letter: "ح", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ك"',  letter: "ك", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "د"',  letter: "د", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ج"',  letter: "ج", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ف"',  letter: "ف", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ن"',  letter: "ن", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ل"',  letter: "ل", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ر"',  letter: "ر", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ز"',  letter: "ز", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "خ"',  letter: "خ", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ع"',  letter: "ع", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ق"',  letter: "ق", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ش"',  letter: "ش", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ت"',  letter: "ت", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ه"',  letter: "ه", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "و"',  letter: "و", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "أ"',  letter: "أ", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ط"',  letter: "ط", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ذ"',  letter: "ذ", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "غ"',  letter: "غ", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ص"',  letter: "ص", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ض"',  letter: "ض", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ث"',  letter: "ث", timerSec: 10 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ظ"',  letter: "ظ", timerSec: 11 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "ي"',  letter: "ي", timerSec: 9 },
  { kind: "starts", text: 'اكتب كلمة تبدأ بحرف "إ"',  letter: "إ", timerSec: 9 },
];

const NO_LETTER: CircleChallenge[] = [
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "ا"',  letter: "ا", timerSec: 13 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "ل"',  letter: "ل", timerSec: 13 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "م"',  letter: "م", timerSec: 13 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "ن"',  letter: "ن", timerSec: 13 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "ي"',  letter: "ي", timerSec: 13 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "و"',  letter: "و", timerSec: 13 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "ب"',  letter: "ب", timerSec: 13 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "ر"',  letter: "ر", timerSec: 13 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "ع"',  letter: "ع", timerSec: 13 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "ه"',  letter: "ه", timerSec: 13 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "س"',  letter: "س", timerSec: 14 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "ك"',  letter: "ك", timerSec: 14 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "ف"',  letter: "ف", timerSec: 14 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "ق"',  letter: "ق", timerSec: 15 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "د"',  letter: "د", timerSec: 14 },
  { kind: "no_letter", text: 'كلمة لا تحتوي حرف "ت"',  letter: "ت", timerSec: 14 },
];

const RACE: CircleChallenge[] = [
  { kind: "race", text: "اكتب أي كلمة عربية أسرع ما تقدر!",     timerSec: 8 },
  { kind: "race", text: "اكتب أي كلمة عربية الآن! — الأبطأ يطلع", timerSec: 9 },
  { kind: "race", text: "كلمة بسرعة! — آخر واحد يجاوب يطلع",    timerSec: 8 },
  { kind: "race", text: "شيل أسرع كلمة عربية عندك!",              timerSec: 7 },
  { kind: "race", text: "اكتب الآن أي شيء عربي!",                 timerSec: 8 },
];

// ─── الفئات الكاملة ────────────────────────────────────────────────────────────

const CAT_LABEL: Record<string, string> = {
  animals:       "🐾 حيوانات",
  fruits:        "🍓 فواكه",
  colors:        "🎨 ألوان",
  cities_sa:     "🏙️ مدن سعودية",
  cities_world:  "🌆 مدن عالمية",
  countries_ar:  "🌍 دول عربية",
  countries_asia:"🌏 دول آسيا",
  countries_europe:"🇪🇺 دول أوروبا",
  countries_africa:"🌍 دول أفريقيا",
  jobs:          "💼 مهن",
  food:          "🍽️ أكل شعبي",
  vegetables:    "🥦 خضار",
  sports:        "⚽ رياضة",
  electronics:   "📱 أجهزة إلكترونية",
  clothes:       "👔 ملابس",
  furniture:     "🛋️ أثاث",
  body_parts:    "🫀 أعضاء الجسم",
  school_subjects:"📚 مواد دراسية",
  languages:     "🗣️ لغات",
  vehicles:      "🚗 مركبات",
  car_brands:    "🏎️ ماركات سيارات",
  rivers:        "🌊 أنهار",
  seas_oceans:   "🌊 بحار ومحيطات",
  planets:       "🪐 كواكب وفلك",
  instruments:   "🎵 آلات موسيقية",
  tools:         "🔧 أدوات",
  arabic_names_m:"👦 أسماء رجال",
  arabic_names_f:"👧 أسماء نساء",
};

const CATEGORY: CircleChallenge[] = [
  // حيوانات
  { kind: "category", category: "animals",       text: "اكتب اسم حيوان!",             timerSec: 10 },
  { kind: "category", category: "animals",       text: "اسم حيوان بري فقط!",           timerSec: 10 },
  { kind: "category", category: "animals",       text: "اسم حيوان أليف أو بري!",       timerSec: 10 },
  // فواكه
  { kind: "category", category: "fruits",        text: "اسم فاكهة!",                   timerSec: 10 },
  { kind: "category", category: "fruits",        text: "اكتب اسم ثمرة أو فاكهة!",     timerSec: 10 },
  // ألوان
  { kind: "category", category: "colors",        text: "اكتب اسم لون!",                timerSec: 8 },
  { kind: "category", category: "colors",        text: "اسم لون فقط — غيره تطلع!",    timerSec: 8 },
  // مدن سعودية
  { kind: "category", category: "cities_sa",     text: "اسم مدينة سعودية!",            timerSec: 11 },
  { kind: "category", category: "cities_sa",     text: "مدينة من مدن المملكة!",        timerSec: 11 },
  // مدن عالمية
  { kind: "category", category: "cities_world",  text: "اسم مدينة من العالم!",         timerSec: 11 },
  { kind: "category", category: "cities_world",  text: "اكتب عاصمة أو مدينة عالمية!", timerSec: 12 },
  // دول عربية
  { kind: "category", category: "countries_ar",  text: "اسم دولة عربية!",              timerSec: 10 },
  // دول آسيا
  { kind: "category", category: "countries_asia","text": "اسم دولة من آسيا!",          timerSec: 11 },
  // دول أوروبا
  { kind: "category", category: "countries_europe", text: "اسم دولة من أوروبا!",      timerSec: 11 },
  { kind: "category", category: "countries_europe", text: "دولة أوروبية فقط!",        timerSec: 11 },
  // دول أفريقيا
  { kind: "category", category: "countries_africa", text: "اسم دولة من أفريقيا!",    timerSec: 12 },
  // مهن
  { kind: "category", category: "jobs",          text: "اسم مهنة!",                    timerSec: 9 },
  { kind: "category", category: "jobs",          text: "اكتب اسم وظيفة أو مهنة!",    timerSec: 9 },
  // أكل
  { kind: "category", category: "food",          text: "اسم أكلة أو شراب شعبي!",      timerSec: 10 },
  { kind: "category", category: "food",          text: "اكتب اسم طعام أو مشروب!",    timerSec: 10 },
  // خضار
  { kind: "category", category: "vegetables",    text: "اسم خضار أو نبات أكلي!",      timerSec: 10 },
  { kind: "category", category: "vegetables",    text: "اكتب اسم خضار!",              timerSec: 10 },
  // رياضة
  { kind: "category", category: "sports",        text: "اسم رياضة!",                   timerSec: 9 },
  { kind: "category", category: "sports",        text: "نوع رياضة من الرياضات!",      timerSec: 10 },
  // أجهزة
  { kind: "category", category: "electronics",   text: "اسم جهاز إلكتروني!",          timerSec: 10 },
  { kind: "category", category: "electronics",   text: "جهاز كهربائي أو إلكتروني!",   timerSec: 10 },
  // ملابس
  { kind: "category", category: "clothes",       text: "اسم قطعة ملابس!",              timerSec: 9 },
  { kind: "category", category: "clothes",       text: "لبسة أو إكسسوار!",             timerSec: 9 },
  // أثاث
  { kind: "category", category: "furniture",     text: "اسم قطعة أثاث!",              timerSec: 10 },
  // أعضاء الجسم
  { kind: "category", category: "body_parts",    text: "اسم عضو من أعضاء الجسم!",    timerSec: 9 },
  { kind: "category", category: "body_parts",    text: "جزء من جسم الإنسان!",         timerSec: 9 },
  // مواد دراسية
  { kind: "category", category: "school_subjects", text: "اسم مادة دراسية!",          timerSec: 9 },
  // لغات
  { kind: "category", category: "languages",     text: "اسم لغة من لغات العالم!",     timerSec: 10 },
  // مركبات
  { kind: "category", category: "vehicles",      text: "اسم مركبة أو وسيلة نقل!",    timerSec: 10 },
  { kind: "category", category: "vehicles",      text: "نوع مواصلات!",                timerSec: 9 },
  // ماركات سيارات
  { kind: "category", category: "car_brands",    text: "اسم ماركة سيارة!",            timerSec: 10 },
  { kind: "category", category: "car_brands",    text: "ماركة سيارة مشهورة!",         timerSec: 10 },
  // أنهار
  { kind: "category", category: "rivers",        text: "اسم نهر في العالم!",           timerSec: 12 },
  // بحار ومحيطات
  { kind: "category", category: "seas_oceans",   text: "اسم بحر أو محيط!",            timerSec: 12 },
  // كواكب
  { kind: "category", category: "planets",       text: "اسم كوكب أو جرم فلكي!",      timerSec: 11 },
  // آلات موسيقية
  { kind: "category", category: "instruments",   text: "اسم آلة موسيقية!",            timerSec: 10 },
  // أدوات
  { kind: "category", category: "tools",         text: "اسم أداة أو عدة!",            timerSec: 10 },
  // أسماء
  { kind: "category", category: "arabic_names_m", text: "اسم رجل عربي!",             timerSec: 9 },
  { kind: "category", category: "arabic_names_f", text: "اسم بنت عربي!",             timerSec: 9 },
];

function pickChallenge(round: number, used: Set<string>): CircleChallenge {
  // Build a weighted pool based on round number
  let pool: CircleChallenge[];
  if (round === 1) {
    // Round 1: easy — race + simple categories
    pool = [...RACE, ...CATEGORY.filter(c =>
      ["animals","fruits","colors","jobs","food","sports","clothes","vehicles"].includes(c.category ?? "")
    ).slice(0, 12)];
  } else if (round <= 3) {
    // Rounds 2-3: categories + starts (easy letters)
    pool = [...CATEGORY, ...STARTS.slice(0, 15)];
  } else if (round <= 6) {
    // Rounds 4-6: everything mixed
    pool = [...CATEGORY, ...STARTS, ...MATH.slice(0, 16), ...NO_LETTER.slice(0, 8)];
  } else {
    // Round 7+: harder — all types, more math and no_letter
    pool = [...CATEGORY, ...STARTS, ...MATH, ...NO_LETTER];
  }

  const fresh   = pool.filter(c => !used.has(c.text));
  const choices = fresh.length > 0 ? fresh : pool; // fallback: reuse if all used
  const pick    = choices[Math.floor(Math.random() * choices.length)];
  used.add(pick.text);
  return pick;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_PLAYERS       = 3;
const BETWEEN_ROUNDS_MS = 3_000;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startCircle(
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

  const s: CircleState = {
    type: "circle",
    phase: "joining",
    players: new Map(),
    eliminated: [],
    hostId,
    round: 0,
    challenge: null,
    responses: new Map(),
    usedChallenges: new Set(),
    doubleElim: false,
    totalRounds: 1,
    completedRounds: 0,
    roundWins: new Map(),
    allPlayers: new Map(),
  };

  s.players.set(hostId, {
    id: hostId, username: hostUsername,
    firstName: hostFirst, lastName: hostLast,
  });
  gameStates.set(chatId, s);

  const msg = await bot.telegram.sendMessage(
    chatId,
    `🔴 <b>الدائرة القاتلة</b>\n\n` +
    `كل جولة تحدي — الأبطأ أو الغلطان يطلع!\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerList(s)}\n\n` +
    `اضغط <b>➕ انضم</b> للمشاركة\n` +
    `<i>اضغط ▶️ ابدأ الآن عندما يكون الكل جاهز</i>`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕  انضم للدائرة", `circle:join:${chatId}`)],
        [Markup.button.callback("▶️  ابدأ الآن",    `circle:fstart:${chatId}`)],
      ]),
    }
  ).catch(() => null);

  if (msg) s.joinMsgId = msg.message_id;
}

export async function handleCircleJoin(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "circle" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ التسجيل مو متاح الحين").catch(() => {}); return;
  }
  if (s.players.has(from.id)) {
    await ctx.answerCbQuery("✅ أنت مسجل مسبقاً!").catch(() => {}); return;
  }

  const p: CirclePlayer = {
    id: from.id,
    username:  from.username,
    firstName: from.first_name ?? "",
    lastName:  from.last_name  ?? "",
  };
  s.players.set(from.id, p);

  await ctx.answerCbQuery("✅ دخلت الدائرة!").catch(() => {});
  bot.telegram.sendMessage(
    chatId,
    `✅ <b>${esc(dnC(p))}</b> دخل الدائرة!\n👥 اللاعبون (${s.players.size}):\n${playerList(s)}`,
    { parse_mode: "HTML" }
  ).catch(() => {});
}

export async function handleCircleForceStart(bot: Telegraf, ctx: Context, chatId: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "circle" || s.phase !== "joining") {
    await ctx.answerCbQuery("❌ ما في تسجيل").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط من أنشأ اللعبة يقدر يبدأها!").catch(() => {}); return;
  }
  if (s.players.size < MIN_PLAYERS) {
    await ctx.answerCbQuery(`⚠️ ما يكفي لاعبين! (${s.players.size}/${MIN_PLAYERS})`).catch(() => {}); return;
  }

  await ctx.answerCbQuery("🔢 اختر عدد الراوندات!").catch(() => {});
  s.phase = "selecting";

  // Build 2-row keyboard: 1-5 top, 6-10 bottom
  const row1 = [1,2,3,4,5].map(n =>
    Markup.button.callback(`${n}`, `circle:setn:${n}:${chatId}`)
  );
  const row2 = [6,7,8,9,10].map(n =>
    Markup.button.callback(`${n}`, `circle:setn:${n}:${chatId}`)
  );

  const msg = await bot.telegram.sendMessage(
    chatId,
    `🔢 <b>كم راوند تبون تلعبون؟</b>\n\n` +
    `كل راوند = لعبة كاملة من الدائرة القاتلة\n` +
    `الفائز بكل راوند يحصل نقطة — في النهاية البطل الأكبر يُعلن!\n\n` +
    `👥 اللاعبون: <b>${s.players.size}</b>\n\n` +
    `<i>اختر العدد أدناه:</i>`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([row1, row2]),
    }
  ).catch(() => null);

  if (msg) s.selectMsgId = msg.message_id;
}

export async function handleCircleSetRounds(bot: Telegraf, ctx: Context, chatId: number, n: number): Promise<void> {
  const from = ctx.from!;
  const s    = gameStates.get(chatId);

  if (!s || s.type !== "circle" || s.phase !== "selecting") {
    await ctx.answerCbQuery("❌ ما في اختيار متاح").catch(() => {}); return;
  }
  if (from.id !== s.hostId) {
    await ctx.answerCbQuery("⛔ فقط من أنشأ اللعبة يقدر يختار!").catch(() => {}); return;
  }

  s.totalRounds = n;
  await ctx.answerCbQuery(`✅ ${n} راوند — يلا نبدأ!`).catch(() => {});

  // Remove selection buttons
  if (s.selectMsgId) {
    bot.telegram.editMessageReplyMarkup(chatId, s.selectMsgId, undefined, { inline_keyboard: [] }).catch(() => {});
  }

  await bot.telegram.sendMessage(
    chatId,
    `✅ <b>تم! ${n} راوند${n > 1 ? "ات" : ""}</b>\n\n` +
    `👥 اللاعبون: ${[...s.players.values()].map(p => esc(dnC(p))).join("، ")}\n\n` +
    `<i>الراوند الأول يبدأ خلال ثوانٍ...</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  s.phase = "joining"; // reset to allow launchCircle to proceed
  launchCircle(bot, chatId);
}

export function handleCircleText(
  bot: Telegraf,
  chatId: number,
  uid: number,
  text: string,
  timestamp: number,
): void {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "circle" || s.phase !== "playing" || !s.challenge) return;
  if (!s.players.has(uid)) return;
  if (s.responses.has(uid)) return; // one answer per round per player
  s.responses.set(uid, { text: text.trim(), timestamp });
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function launchCircle(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "circle" || s.phase !== "joining") return;

  if (s.players.size < MIN_PLAYERS) {
    bot.telegram.sendMessage(
      chatId,
      `❌ ما كفت لاعبين (${s.players.size}/${MIN_PLAYERS}) — اللعبة انتهت.`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    clearGame(chatId); return;
  }

  if (s.joinTimer)     clearTimeout(s.joinTimer);
  if (s.joinWarnTimer) clearTimeout(s.joinWarnTimer);

  // Save the full player list so we can reset between rounds
  s.allPlayers = new Map(s.players);

  s.phase = "playing";
  s.round = 0;
  s.eliminated = [];
  s.responses = new Map();
  s.usedChallenges = new Set();

  const isMulti = s.totalRounds > 1;
  const roundLabel = isMulti ? `  •  الراوند ${s.completedRounds + 1} من ${s.totalRounds}` : "";

  await bot.telegram.sendMessage(
    chatId,
    `🔴 <b>الدائرة القاتلة — انطلقت!${roundLabel}</b>\n\n` +
    `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerList(s)}\n\n` +
    `اكتبوا إجاباتكم في القروب عند ظهور كل تحدي\n` +
    `آخر واحد يبقى = فائز هذا الراوند\n\n` +
    `<i>الجولة الأولى خلال ثوانٍ...</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  setTimeout(() => sendChallenge(bot, chatId), BETWEEN_ROUNDS_MS);
}

async function sendChallenge(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "circle" || s.phase !== "playing") return;

  s.round++;
  s.responses = new Map();

  // Double elimination only when > 4 players remain (to avoid ending the game too fast)
  const doubleElim = s.round % 3 === 0 && s.players.size > 4;
  s.doubleElim = doubleElim;

  const challenge = pickChallenge(s.round, s.usedChallenges);
  s.challenge = challenge;

  const remaining = [...s.players.values()].map(p => `• ${esc(dnC(p))}`).join("\n");

  let header = `🔴 <b>الجولة ${s.round}</b>`;
  if (doubleElim) header += `  ⚡ إقصاء مزدوج!`;
  if (s.round >= 7) header += `  🔥`;

  // Challenge type hint
  let hint = "";
  if (challenge.kind === "math")      hint = "📐 <b>حساب</b> — اكتب الرقم بالأرقام فقط";
  if (challenge.kind === "starts")    hint = "✍️ <b>كلمة بحرف معين</b> — أول كلمة صح تنجو";
  if (challenge.kind === "no_letter") hint = "🚫 <b>حرف محظور</b> — إجابة تحتويه = إقصاء فوري";
  if (challenge.kind === "race")      hint = "⚡ <b>سباق كلمات</b> — أسرع كلمة عربية تنجو";
  if (challenge.kind === "category") {
    const cat = challenge.category ?? "";
    hint = `🎯 <b>الفئة: ${CAT_LABEL[cat] ?? cat}</b> — كلمة خارج الفئة = إقصاء فوري`;
  }

  const msg = await bot.telegram.sendMessage(
    chatId,
    `${header}\n\n` +
    `👥 <b>المتبقون (${s.players.size}):</b>\n${remaining}\n\n` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
    `🎯 ${hint}\n\n` +
    `<b>${challenge.text}</b>\n` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
    `⏱ <b>${challenge.timerSec} ثانية</b>` +
    (doubleElim ? `  •  شخصان سيطلعان!` : ""),
    { parse_mode: "HTML" }
  ).catch(() => null);

  if (msg) s.challengeMsgId = msg.message_id;

  s.challengeTimer = setTimeout(
    () => resolveChallenge(bot, chatId),
    challenge.timerSec * 1_000
  );
}

async function resolveChallenge(bot: Telegraf, chatId: number): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "circle" || s.phase !== "playing" || !s.challenge) return;

  // Guard: only run once
  if (s.challengeTimer) { clearTimeout(s.challengeTimer); s.challengeTimer = undefined; }

  const challenge = s.challenge;
  s.challenge     = null;

  const allUids  = [...s.players.keys()];
  const correct: { uid: number; ts: number }[] = [];
  const wrong:      number[] = [];
  const noResp:     number[] = [];

  for (const uid of allUids) {
    const r = s.responses.get(uid);
    if (!r) {
      noResp.push(uid);
    } else if (validateAnswer(challenge, r.text)) {
      correct.push({ uid, ts: r.timestamp });
    } else {
      wrong.push(uid);
    }
  }

  correct.sort((a, b) => a.ts - b.ts);

  // Elimination logic per challenge type
  let elimCandidates: number[];

  if (challenge.kind === "race") {
    // Slowest valid response, OR no/wrong response
    elimCandidates = [...noResp, ...wrong];
    if (elimCandidates.length === 0 && correct.length > 1) {
      // Everyone answered: eliminate slowest
      elimCandidates = [correct[correct.length - 1].uid];
    }
  } else {
    // math / starts / no_letter: wrong answer = eliminated; if all correct → slowest out
    elimCandidates = [...wrong, ...noResp];
    if (elimCandidates.length === 0 && correct.length > 1) {
      elimCandidates = [correct[correct.length - 1].uid];
    }
  }

  // Build results text
  let result = `📊 <b>نتيجة الجولة ${s.round}:</b>\n\n`;
  if (correct.length > 0) {
    result += `✅ صح: ${correct.slice(0, 8).map(({ uid }) => {
      const p = s.players.get(uid); return p ? esc(dnC(p)) : "؟";
    }).join("، ")}\n`;
  }
  if (wrong.length > 0) {
    result += `❌ خطأ: ${wrong.slice(0, 8).map(uid => {
      const p = s.players.get(uid); return p ? esc(dnC(p)) : "؟";
    }).join("، ")}\n`;
  }
  if (noResp.length > 0) {
    result += `💤 لم يردوا: ${noResp.slice(0, 8).map(uid => {
      const p = s.players.get(uid); return p ? esc(dnC(p)) : "؟";
    }).join("، ")}\n`;
  }
  if (challenge.kind === "math" && challenge.expectedNum !== undefined) {
    result += `\n💡 الجواب الصح: <b>${challenge.expectedNum}</b>`;
  }
  if (challenge.kind === "category") {
    const cat = challenge.category ?? "";
    if (wrong.length > 0)
      result += `\n💡 المقبول فقط: <b>${CAT_LABEL[cat] ?? cat}</b> — كلمة خارج الفئة = خطأ`;
  }

  if (elimCandidates.length === 0) {
    result += `\n\n✨ الكل أجاب صح وبسرعة — لا إقصاء هذه الجولة!`;
    await bot.telegram.sendMessage(chatId, result, { parse_mode: "HTML" }).catch(() => {});
    setTimeout(() => sendChallenge(bot, chatId), BETWEEN_ROUNDS_MS);
    return;
  }

  await bot.telegram.sendMessage(chatId, result, { parse_mode: "HTML" }).catch(() => {});

  shuffle(elimCandidates);
  // Cap elimination: never eliminate more than players-1 (keep at least 1)
  const maxElim   = Math.min(s.players.size - 1, s.doubleElim && elimCandidates.length >= 2 ? 2 : 1);
  const toElim    = elimCandidates.slice(0, maxElim);

  await eliminatePlayers(bot, chatId, toElim);
}

async function eliminatePlayers(bot: Telegraf, chatId: number, uids: number[]): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "circle") return;

  for (const uid of uids) {
    const p = s.players.get(uid);
    if (!p) continue;
    s.players.delete(uid);
    s.eliminated.push(p);

    try {
      const buf = await generateCircleEliminatedCard(dnC(p), s.round);
      await bot.telegram.sendPhoto(chatId, { source: buf }, {
        caption:    `🔴 <b>${esc(dnC(p))}</b> خرج من الدائرة في الجولة ${s.round}!`,
        parse_mode: "HTML",
      });
    } catch (e) {
      logger.warn({ err: e }, "circle eliminated card failed");
      await bot.telegram.sendMessage(
        chatId,
        `🔴 <b>${esc(dnC(p))}</b> خرج من الدائرة!`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }
  }

  // Win check
  if (s.players.size === 1) {
    await endCircle(bot, chatId, [...s.players.values()][0]); return;
  }
  if (s.players.size === 0) {
    await bot.telegram.sendMessage(chatId, `🔴 الكل طلع — ما في فائز!`, { parse_mode: "HTML" }).catch(() => {});
    clearGame(chatId); return;
  }

  setTimeout(() => sendChallenge(bot, chatId), BETWEEN_ROUNDS_MS);
}

function buildScoreboard(s: CircleState): string {
  const entries = [...s.allPlayers.values()].map(p => ({
    p,
    wins: s.roundWins.get(p.id) ?? 0,
  })).sort((a, b) => b.wins - a.wins);

  const medals = ["🥇","🥈","🥉"];
  return entries.map((e, i) => {
    const m = medals[i] ?? "•";
    const bar = "⭐".repeat(e.wins) || "—";
    return `${m} ${esc(dnC(e.p))}: ${bar} (${e.wins} فوز)`;
  }).join("\n");
}

async function endCircle(bot: Telegraf, chatId: number, winner: CirclePlayer): Promise<void> {
  const s = gameStates.get(chatId);
  if (!s || s.type !== "circle") return;

  // Record this round's win
  s.roundWins.set(winner.id, (s.roundWins.get(winner.id) ?? 0) + 1);
  s.completedRounds++;

  // Show winner card for this round
  try {
    const buf = await generateCircleWinnerCard(dnC(winner));
    const roundLabel = s.totalRounds > 1 ? `الراوند ${s.completedRounds}` : "الدائرة القاتلة";
    await bot.telegram.sendPhoto(chatId, { source: buf }, {
      caption: `👑 <b>${esc(dnC(winner))}</b> هو الناجي الوحيد من ${roundLabel}!\nمبروك!`,
      parse_mode: "HTML",
    });
  } catch (e) {
    logger.warn({ err: e }, "circle winner card failed");
    await bot.telegram.sendMessage(
      chatId,
      `🏆 <b>فائز الراوند ${s.completedRounds}:</b> ${esc(dnC(winner))} 🎉`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  // ── All rounds done? ──────────────────────────────────────────────────────
  if (s.completedRounds >= s.totalRounds) {
    s.phase = "done";

    // Record leaderboard wins/games for all players
    const all = [...s.allPlayers.values()];
    for (const p of all) {
      if ((s.roundWins.get(p.id) ?? 0) > 0) recordWin(chatId, toP(p));
      else recordGame(chatId, [toP(p)]);
    }

    // Find overall champion (most round wins; tie → earlier alphabetically)
    const sorted = [...s.allPlayers.values()]
      .sort((a, b) => (s.roundWins.get(b.id) ?? 0) - (s.roundWins.get(a.id) ?? 0));
    const champion = sorted[0];

    // Build final scoreboard
    const scoreboard = buildScoreboard(s);

    if (s.totalRounds > 1) {
      await bot.telegram.sendMessage(
        chatId,
        `🏆 <b>النتيجة النهائية — ${s.totalRounds} راوندات</b>\n\n` +
        `${scoreboard}\n\n` +
        `👑 <b>البطل الأكبر: ${esc(dnC(champion))}!</b> مبروووك!`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }

    clearGame(chatId);
    return;
  }

  // ── More rounds remain — reset and start next ─────────────────────────────
  const next  = s.completedRounds + 1;
  const scoreboard = buildScoreboard(s);

  await bot.telegram.sendMessage(
    chatId,
    `📊 <b>نتيجة الراوند ${s.completedRounds} من ${s.totalRounds}</b>\n\n` +
    `${scoreboard}\n\n` +
    `<i>الراوند ${next} يبدأ خلال ثوانٍ...</i>`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  // Reset for next round: restore all players
  s.players     = new Map(s.allPlayers);
  s.eliminated  = [];
  s.round       = 0;
  s.challenge   = null;
  s.responses   = new Map();
  s.usedChallenges = new Set();
  s.doubleElim  = false;
  s.phase       = "playing";

  setTimeout(() => {
    bot.telegram.sendMessage(
      chatId,
      `🔴 <b>الدائرة القاتلة — الراوند ${next} من ${s.totalRounds}</b>\n\n` +
      `👥 <b>اللاعبون (${s.players.size}):</b>\n${playerList(s)}\n\n` +
      `<i>الجولة الأولى خلال ثوانٍ...</i>`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    setTimeout(() => sendChallenge(bot, chatId), BETWEEN_ROUNDS_MS);
  }, 5_000);
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
