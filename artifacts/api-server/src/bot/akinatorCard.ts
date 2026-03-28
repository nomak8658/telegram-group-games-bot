import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = __dirname.endsWith("bot")
  ? path.join(__dirname, "assets")
  : path.join(__dirname, "bot", "assets");

let _canvas: typeof import("@napi-rs/canvas") | null = null;
async function getCanvas() {
  if (!_canvas) _canvas = await import("@napi-rs/canvas");
  return _canvas;
}

let fontsLoaded = false;
async function ensureFonts() {
  if (fontsLoaded) return;
  const cv = await getCanvas();
  cv.GlobalFonts.registerFromPath(path.join(ASSETS, "Cairo-Bold.ttf"),    "CairoBold");
  cv.GlobalFonts.registerFromPath(path.join(ASSETS, "Cairo-Regular.ttf"), "Cairo");
  fontsLoaded = true;
}

const W = 900;
const H = 520;

const BG_DARK  = "#030112";
const BG_MID   = "#080233";
const PURPLE   = "#7C3AED";
const VIOLET   = "#A855F7";
const GOLD     = "#FFD700";
const CYAN     = "#22D3EE";

function drawBg(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   BG_DARK);
  bg.addColorStop(0.5, BG_MID);
  bg.addColorStop(1,   BG_DARK);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
}

function drawStars(ctx: CanvasRenderingContext2D) {
  const positions = [
    [80,  40,  1.2, 0.6], [180, 90,  0.8, 0.4], [320,  20, 1.5, 0.8],
    [500, 55,  1.0, 0.5], [640, 30,  1.3, 0.7], [820,  80, 0.9, 0.4],
    [50, 200,  0.8, 0.3], [150,280,  1.1, 0.6], [700, 200, 1.4, 0.7],
    [830,300,  0.7, 0.3], [60, 400,  1.2, 0.5], [200,450,  0.9, 0.4],
    [400, 15,  1.0, 0.5], [700, 15,  0.8, 0.4], [860,450, 1.1, 0.6],
    [750,480,  1.3, 0.7], [350,490,  0.8, 0.4], [120,500, 1.0, 0.5],
    [580,480,  1.2, 0.6], [270, 60,  0.9, 0.4], [430,480, 1.5, 0.8],
  ];
  ctx.save();
  for (const [x, y, r, a] of positions) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,180,255,${a})`;
    ctx.fill();
  }
  ctx.restore();
}

function drawOrb(ctx: CanvasRenderingContext2D) {
  const cx = W / 2;
  const cy = H / 2 + 30;

  const outerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 280);
  outerGlow.addColorStop(0,   "rgba(124,58,237,0.28)");
  outerGlow.addColorStop(0.5, "rgba(88,28,220,0.12)");
  outerGlow.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = outerGlow;
  ctx.fillRect(0, 0, W, H);

  const innerGlow = ctx.createRadialGradient(cx - 30, cy - 30, 20, cx, cy, 140);
  innerGlow.addColorStop(0,   "rgba(200,160,255,0.22)");
  innerGlow.addColorStop(0.5, "rgba(124,58,237,0.18)");
  innerGlow.addColorStop(1,   "rgba(30,0,80,0.0)");
  ctx.fillStyle = innerGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, 160, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.strokeStyle = "rgba(167,139,250,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 170, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(167,139,250,0.10)";
  ctx.beginPath();
  ctx.arc(cx, cy, 195, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawEdgeGlow(ctx: CanvasRenderingContext2D, color = VIOLET) {
  const gl = ctx.createLinearGradient(0, 0, W, 0);
  gl.addColorStop(0,   "rgba(0,0,0,0)");
  gl.addColorStop(0.5, color);
  gl.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0,     W, 2);
  ctx.fillRect(0, H - 2, W, 2);
}

function drawHLine(ctx: CanvasRenderingContext2D, y: number, alpha = 0.35) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0,   "rgba(0,0,0,0)");
  g.addColorStop(0.5, `rgba(167,139,250,${alpha})`);
  g.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, 1.5);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function generateAkinatorQuestionCard(
  question: string,
  step: number,
  total: number,
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx);
  drawStars(ctx);
  drawOrb(ctx);
  drawEdgeGlow(ctx);

  // Header: branding
  ctx.save();
  ctx.font = "bold 24px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = VIOLET;
  ctx.shadowColor = VIOLET;
  ctx.shadowBlur = 14;
  ctx.fillText("◉  المارد العبقري", W / 2, 46);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Step counter
  ctx.save();
  ctx.font = "18px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(196,181,253,0.7)";
  ctx.fillText(`السؤال  ${step}  من  ${total}`, W / 2, 72);
  ctx.restore();

  drawHLine(ctx, 88, 0.4);

  // Question text (centered, wrapped)
  ctx.save();
  ctx.font = "bold 42px CairoBold";
  ctx.textAlign = "center";
  const maxW = 740;
  const lines = wrapText(ctx, question, maxW);

  const lineHeight = 58;
  const totalTextH = lines.length * lineHeight;
  const textStartY = (H - totalTextH) / 2 + 28;

  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(167,139,250,0.6)";
  ctx.shadowBlur = 22;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, W / 2, textStartY + i * lineHeight);
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  // Question mark decoration
  ctx.save();
  ctx.font = "bold 80px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(124,58,237,0.10)";
  ctx.fillText("؟", W / 2 + 10, H / 2 + 90);
  ctx.restore();

  drawHLine(ctx, H - 68, 0.3);

  // Progress dots
  const dotCount = total;
  const dotSpacing = Math.min(28, (W - 200) / dotCount);
  const dotsWidth  = (dotCount - 1) * dotSpacing;
  const dotStartX  = W / 2 - dotsWidth / 2;

  for (let i = 0; i < dotCount; i++) {
    const dx = dotStartX + i * dotSpacing;
    const dy = H - 38;
    ctx.beginPath();
    ctx.arc(dx, dy, i < step ? 5 : 3, 0, Math.PI * 2);
    if (i < step) {
      ctx.fillStyle = VIOLET;
      ctx.shadowColor = VIOLET;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = "rgba(100,80,160,0.35)";
      ctx.fill();
    }
  }

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

export async function generateAkinatorGuessCard(
  charName: string,
  attempt: number,
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx);
  drawStars(ctx);

  // Gold radial glow
  const glow = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 320);
  glow.addColorStop(0,   "rgba(250,204,21,0.18)");
  glow.addColorStop(0.5, "rgba(124,58,237,0.12)");
  glow.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  drawEdgeGlow(ctx, GOLD);

  // Header
  ctx.save();
  ctx.font = "bold 26px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = VIOLET;
  ctx.shadowColor = VIOLET;
  ctx.shadowBlur = 14;
  ctx.fillText("◉  المارد العبقري", W / 2, 52);
  ctx.shadowBlur = 0;
  ctx.restore();

  drawHLine(ctx, 70, 0.4);

  // "أعتقد أن شخصيتك..."
  ctx.save();
  ctx.font = "24px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(196,181,253,0.85)";
  ctx.fillText("🔮  أعتقد أن شخصيتك هي...", W / 2, 142);
  ctx.restore();

  // Character name
  const nLen = charName.length;
  const nfs  = nLen > 18 ? 52 : nLen > 12 ? 64 : nLen > 8 ? 76 : 88;
  ctx.save();
  ctx.font = `bold ${nfs}px CairoBold`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 45;
  ctx.fillText(charName, W / 2, 256);
  ctx.shadowBlur = 0;
  ctx.restore();

  if (attempt > 1) {
    ctx.save();
    ctx.font = "18px Cairo";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(196,181,253,0.5)";
    ctx.fillText(`المحاولة ${attempt}`, W / 2, 300);
    ctx.restore();
  }

  drawHLine(ctx, H - 90, 0.3);

  // "هل أصبت؟" hint
  ctx.save();
  ctx.font = "22px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(196,181,253,0.6)";
  ctx.fillText("هل أصبت في تخميني؟", W / 2, H - 52);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

export async function generateAkinatorWinCard(
  charName: string,
  steps: number,
  charImageBuf: Buffer | null = null,
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx);
  drawStars(ctx);

  // When image available, glow shifts left; otherwise centered
  const hasImg  = charImageBuf !== null;
  const textCX  = hasImg ? 380 : W / 2;
  const imgCX   = 762;
  const imgCY   = H / 2 + 10;
  const imgR    = 130;

  // Glow
  const glow = ctx.createRadialGradient(
    hasImg ? 340 : W / 2, H / 2, 0,
    hasImg ? 340 : W / 2, H / 2, 340,
  );
  glow.addColorStop(0,   "rgba(250,204,21,0.28)");
  glow.addColorStop(0.5, "rgba(124,58,237,0.13)");
  glow.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  if (hasImg) {
    const rightGlow = ctx.createRadialGradient(imgCX, imgCY, 0, imgCX, imgCY, 240);
    rightGlow.addColorStop(0,   "rgba(250,204,21,0.20)");
    rightGlow.addColorStop(0.6, "rgba(124,58,237,0.10)");
    rightGlow.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = rightGlow;
    ctx.fillRect(0, 0, W, H);
  }

  drawEdgeGlow(ctx, GOLD);

  // ── Header ──────────────────────────────────────────────────────────────────
  ctx.save();
  ctx.font = "bold 52px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 36;
  ctx.fillText("🎉 أصبت!", textCX, 82);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Divider spans only the text half if image present
  const divW = hasImg ? 560 : W;
  const divG = ctx.createLinearGradient(0, 0, divW, 0);
  divG.addColorStop(0,   "rgba(0,0,0,0)");
  divG.addColorStop(0.5, "rgba(250,204,21,0.55)");
  divG.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = divG;
  ctx.fillRect(0, 100, divW, 1.5);

  // ── "كنت أفكر في..." ────────────────────────────────────────────────────────
  ctx.save();
  ctx.font = "22px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(196,181,253,0.72)";
  ctx.fillText("كنت أفكر في...", textCX, 152);
  ctx.restore();

  // ── Character name ───────────────────────────────────────────────────────────
  const nLen = charName.length;
  const nfs  = nLen > 18 ? (hasImg ? 38 : 52) : nLen > 12 ? (hasImg ? 50 : 66) : nLen > 8 ? (hasImg ? 60 : 78) : (hasImg ? 72 : 90);
  ctx.save();
  ctx.font = `bold ${nfs}px CairoBold`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 46;
  ctx.fillText(charName, textCX, 262);
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── Divider 2 ────────────────────────────────────────────────────────────────
  ctx.fillStyle = divG;
  ctx.fillRect(0, 298, divW, 1.5);

  // ── Steps ────────────────────────────────────────────────────────────────────
  ctx.save();
  ctx.font = "20px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(196,181,253,0.55)";
  ctx.fillText(`عرفتها في ${steps} سؤالاً فقط! 🔮`, textCX, 352);
  ctx.restore();

  // ── Branding ─────────────────────────────────────────────────────────────────
  ctx.save();
  ctx.font = "bold 18px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = VIOLET;
  ctx.shadowColor = VIOLET;
  ctx.shadowBlur = 10;
  ctx.fillText("المارد العبقري لا يُغلب! ◉", textCX, H - 44);
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── Character portrait ───────────────────────────────────────────────────────
  if (hasImg && charImageBuf) {
    try {
      const charImg = await cv.loadImage(charImageBuf);

      // Outer golden ring glow
      ctx.save();
      ctx.beginPath();
      ctx.arc(imgCX, imgCY, imgR + 8, 0, Math.PI * 2);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3;
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 28;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Inner violet ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(imgCX, imgCY, imgR + 3, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(167,139,250,0.45)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Clip to circle and draw image
      ctx.save();
      ctx.beginPath();
      ctx.arc(imgCX, imgCY, imgR, 0, Math.PI * 2);
      ctx.clip();

      // Fit image into the circle (cover)
      const iw = charImg.width  as number;
      const ih = charImg.height as number;
      const scale = Math.max((imgR * 2) / iw, (imgR * 2) / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(
        charImg as unknown as CanvasImageSource,
        imgCX - dw / 2,
        imgCY - dh / 2,
        dw,
        dh,
      );

      // Subtle dark vignette overlay inside circle
      const vignette = ctx.createRadialGradient(imgCX, imgCY, imgR * 0.5, imgCX, imgCY, imgR);
      vignette.addColorStop(0,   "rgba(0,0,0,0)");
      vignette.addColorStop(1,   "rgba(0,0,30,0.35)");
      ctx.fillStyle = vignette;
      ctx.fillRect(imgCX - imgR, imgCY - imgR, imgR * 2, imgR * 2);
      ctx.restore();

      // Vertical divider between text and image areas
      const divLine = ctx.createLinearGradient(0, 80, 0, H - 60);
      divLine.addColorStop(0,   "rgba(0,0,0,0)");
      divLine.addColorStop(0.3, "rgba(167,139,250,0.25)");
      divLine.addColorStop(0.7, "rgba(167,139,250,0.25)");
      divLine.addColorStop(1,   "rgba(0,0,0,0)");
      ctx.fillStyle = divLine;
      ctx.fillRect(580, 0, 1.5, H);

    } catch {
      // If image rendering fails, no crash
    }
  }

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

export async function generateAkinatorLoseCard(charName?: string): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx);
  drawStars(ctx);

  const glow = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 300);
  glow.addColorStop(0,   "rgba(124,58,237,0.25)");
  glow.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  drawEdgeGlow(ctx, CYAN);

  ctx.save();
  ctx.font = "bold 52px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = CYAN;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 30;
  ctx.fillText("🤔 غلبتني!", W / 2, 82);
  ctx.shadowBlur = 0;
  ctx.restore();

  drawHLine(ctx, 100, 0.4);

  ctx.save();
  ctx.font = "26px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.70)";
  ctx.fillText("لم أستطع معرفة شخصيتك هذه المرة...", W / 2, 186);
  ctx.restore();

  if (charName) {
    ctx.save();
    ctx.font = "22px Cairo";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(196,181,253,0.6)";
    ctx.fillText("كانت شخصيتك:", W / 2, 264);
    ctx.restore();

    const nLen = charName.length;
    const nfs  = nLen > 18 ? 46 : nLen > 12 ? 56 : 68;
    ctx.save();
    ctx.font = `bold ${nfs}px CairoBold`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 28;
    ctx.fillText(charName, W / 2, 340);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  ctx.save();
  ctx.font = "20px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(196,181,253,0.45)";
  ctx.fillText("سأكون أذكى في المرة القادمة! 🔮", W / 2, H - 52);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

export async function generateAkinatorWelcomeCard(): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx);
  drawStars(ctx);
  drawOrb(ctx);
  drawEdgeGlow(ctx, VIOLET);

  // Big branding
  ctx.save();
  const tg = ctx.createLinearGradient(200, 0, 700, 0);
  tg.addColorStop(0, VIOLET);
  tg.addColorStop(0.5, "#C084FC");
  tg.addColorStop(1, PURPLE);
  ctx.font = "bold 72px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = tg;
  ctx.shadowColor = VIOLET;
  ctx.shadowBlur = 30;
  ctx.fillText("◉ أكيناتور ◉", W / 2, 116);
  ctx.shadowBlur = 0;
  ctx.restore();

  drawHLine(ctx, 136, 0.45);

  ctx.save();
  ctx.font = "26px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(196,181,253,0.85)";
  ctx.fillText("فكّر في شخصية — حقيقية أو خيالية", W / 2, 202);
  ctx.restore();

  ctx.save();
  ctx.font = "22px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(196,181,253,0.60)";
  ctx.fillText("سأطرح عليك أسئلة وأحاول تخمينها!", W / 2, 248);
  ctx.restore();

  drawHLine(ctx, 278, 0.25);

  // Bullets
  const bullets = [
    "✦  فكّر في شخصية الآن ولا تخبر أحداً",
    "✦  أجب بـ نعم / لا / لا أعلم",
    "✦  حاول أن تكون صادقاً!",
  ];
  ctx.save();
  ctx.font = "20px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(167,139,250,0.75)";
  for (let i = 0; i < bullets.length; i++) {
    ctx.fillText(bullets[i]!, W / 2, 320 + i * 38);
  }
  ctx.restore();

  drawHLine(ctx, H - 68, 0.3);

  ctx.save();
  ctx.font = "bold 20px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 12;
  ctx.fillText("هل تجرؤ على تحدي المارد العبقري؟ 🔮", W / 2, H - 34);
  ctx.shadowBlur = 0;
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
