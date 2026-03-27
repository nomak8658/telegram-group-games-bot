import type { Telegraf } from "telegraf";
import { spawn, execFile }  from "child_process";
import { existsSync, unlinkSync, readdirSync } from "fs";
import { readFile, chmod }  from "fs/promises";
import { promisify }        from "util";
import path                 from "path";
import os                   from "os";

const execFileAsync = promisify(execFile);

// ─── yt-dlp binary resolution ─────────────────────────────────────────────────

const YTDLP_FALLBACK  = path.join(os.tmpdir(), "yt-dlp-bin");
const YTDLP_URL       =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

let resolvedBin: string | null = null;
let downloadPromise: Promise<string> | null = null;

async function resolveYtDlp(): Promise<string> {
  if (resolvedBin) return resolvedBin;

  // 1. Check PATH (/usr/local/bin/yt-dlp from Docker build)
  try {
    const { stdout } = await execFileAsync("which", ["yt-dlp"]);
    const p = stdout.trim();
    if (p) { resolvedBin = p; return p; }
  } catch { /* not in PATH */ }

  // 2. Fallback binary already downloaded
  if (existsSync(YTDLP_FALLBACK)) {
    resolvedBin = YTDLP_FALLBACK;
    return YTDLP_FALLBACK;
  }

  // 3. Download standalone binary — one concurrent download
  if (!downloadPromise) {
    downloadPromise = (async () => {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("curl", [
          "-sL", "--max-time", "45", "--retry", "2",
          YTDLP_URL, "-o", YTDLP_FALLBACK,
        ]);
        proc.on("close", code => code === 0 ? resolve() : reject(new Error(`curl ${code}`)));
        proc.on("error", reject);
        setTimeout(() => { proc.kill(); reject(new Error("curl timeout")); }, 50_000);
      });
      await chmod(YTDLP_FALLBACK, 0o755);
      resolvedBin = YTDLP_FALLBACK;
      return YTDLP_FALLBACK;
    })().catch((e) => { downloadPromise = null; throw e; });
  }
  return downloadPromise;
}

export function preWarmYtDlp(): void {
  resolveYtDlp()
    .then(p => console.log("[music] yt-dlp ready:", p))
    .catch(e => console.error("[music] yt-dlp warm failed:", e?.message));
}

// ─── ffmpeg ───────────────────────────────────────────────────────────────────

let ffmpegDir: string | null = null;
let ffmpegChecked = false;

async function getFfmpegDir(): Promise<string | null> {
  if (ffmpegChecked) return ffmpegDir;
  ffmpegChecked = true;
  try {
    const { stdout } = await execFileAsync("which", ["ffmpeg"]);
    const p = stdout.trim();
    ffmpegDir = p ? path.dirname(p) : null;
  } catch { ffmpegDir = null; }
  console.log("[music] ffmpeg:", ffmpegDir ?? "NOT FOUND");
  return ffmpegDir;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SongInfo { title: string; id: string; duration: number; author: string; }
interface AudioFile { buf: Buffer; ext: string; }

// ─── Run yt-dlp ───────────────────────────────────────────────────────────────

function runYtDlp(
  bin: string, args: string[], timeoutMs = 30_000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn(bin, args);
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error(`timeout ${timeoutMs / 1000}s`)); }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`exit ${code}: ${stderr.slice(-300)}`));
    });
    proc.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────
// Uses 4 separate --print flags (one field per line) to avoid | in titles breaking parsing

async function findSong(query: string): Promise<SongInfo | null> {
  const bin = await resolveYtDlp();

  const { stdout } = await runYtDlp(bin, [
    `ytsearch10:${query}`,
    "--print", "%(id)s",
    "--print", "%(title)s",
    "--print", "%(duration)s",
    "--print", "%(uploader)s",
    "--flat-playlist",
    "--no-warnings",
    "--no-playlist",
    "--socket-timeout", "10",
  ], 25_000).catch(e => { console.error("[music:search]", e?.message); return { stdout: "", stderr: "" }; });

  // Each video produces 4 lines: id, title, duration, uploader
  const lines = stdout.trim().split("\n").filter(Boolean);
  for (let i = 0; i + 3 < lines.length; i += 4) {
    const id    = lines[i]!.trim();
    const title = lines[i + 1]!.trim();
    const dur   = parseFloat(lines[i + 2]!.trim());
    const auth  = lines[i + 3]!.trim();
    if (id && id !== "NA" && dur > 0 && dur <= 600) {
      return { id, title: title || query, duration: Math.round(dur), author: auth };
    }
  }
  return null;
}

// ─── Download ─────────────────────────────────────────────────────────────────

async function downloadAudio(
  videoId: string,
): Promise<AudioFile & { debugLog: string }> {
  const bin   = await resolveYtDlp();
  const ffDir = await getFfmpegDir();
  const stamp = `${Date.now()}_${videoId}`;
  const tmpDir = os.tmpdir();

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const errors: string[] = [];

  const cleanUp = (p: string) => { try { unlinkSync(p); } catch {} };

  const tryRead = async (p: string, ext: string): Promise<AudioFile & { debugLog: string } | null> => {
    if (!existsSync(p)) {
      errors.push(`file not found: ${p}`);
      return null;
    }
    const buf = await readFile(p);
    cleanUp(p);
    return { buf, ext, debugLog: errors.join(" | ") };
  };

  // android_vr bypasses YouTube authentication requirement on datacenter IPs
  // ios client NOW requires a GVS PO Token — do NOT use ios
  const AVR  = ["--extractor-args", "youtube:player_client=android_vr"];
  const BASE = [url, "--no-warnings", "--no-playlist", "--socket-timeout", "20", "--no-part"];

  // ── Strategy A: webm/opus + android_vr — no ffmpeg, no fixup ─────────────────
  // 251 = opus 132kbps, 249 = opus 51kbps — no fixup step needed
  const outWebm = path.join(tmpDir, `${stamp}_a.webm`);
  try {
    await runYtDlp(bin, [
      ...BASE, ...AVR, "-o", outWebm,
      "-f", "251/249/bestaudio[ext=webm]",
    ], 120_000);
    const r = await tryRead(outWebm, "webm");
    if (r) return r;
  } catch (e: any) { errors.push(`A(webm+avr): ${e?.message?.slice(0, 120)}`); cleanUp(outWebm); }

  // ── Strategy B: m4a 128kbps + android_vr — fixup disabled ────────────────────
  const outM4a = path.join(tmpDir, `${stamp}_b.m4a`);
  try {
    await runYtDlp(bin, [
      ...BASE, ...AVR, "-o", outM4a,
      "-f", "140/139/bestaudio[ext=m4a]",
      "--fixup", "never",
    ], 120_000);
    const r = await tryRead(outM4a, "m4a");
    if (r) return r;
  } catch (e: any) { errors.push(`B(m4a+avr): ${e?.message?.slice(0, 120)}`); cleanUp(outM4a); }

  // ── Strategy C: mp3 via ffmpeg + android_vr (if ffmpeg available) ─────────────
  if (ffDir) {
    const out = path.join(tmpDir, `${stamp}_c.mp3`);
    try {
      await runYtDlp(bin, [
        ...BASE, ...AVR, "-o", out,
        "-x", "--audio-format", "mp3", "--audio-quality", "5",
        "--ffmpeg-location", ffDir,
      ], 120_000);
      const r = await tryRead(out, "mp3");
      if (r) return r;
    } catch (e: any) { errors.push(`C(mp3+avr): ${e?.message?.slice(0, 120)}`); cleanUp(out); }
  }

  // ── Strategy D: bestaudio, android_vr, any format, fixup disabled ─────────────
  const outAny = path.join(tmpDir, `${stamp}_d.%(ext)s`);
  try {
    await runYtDlp(bin, [
      ...BASE, ...AVR, "-o", outAny,
      "-f", "bestaudio",
      "--fixup", "never",
    ], 120_000);
    const prefix = `${stamp}_d.`;
    const found  = readdirSync(tmpDir).find(f => f.startsWith(prefix));
    if (found) {
      const fp = path.join(tmpDir, found);
      const buf = await readFile(fp); cleanUp(fp);
      return { buf, ext: path.extname(found).slice(1) || "audio", debugLog: errors.join(" | ") };
    }
    errors.push("D(bestaudio+avr): exit 0 but no file");
  } catch (e: any) { errors.push(`D(bestaudio+avr): ${e?.message?.slice(0, 120)}`); }

  throw new Error(errors.join(" || "));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trimTitle(t: string, max = 60): string {
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function fmtDuration(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleMusicSearch(
  bot:     Telegraf,
  chatId:  number,
  query:   string,
  replyTo: number,
): Promise<void> {

  const statusMsg = await bot.telegram.sendMessage(
    chatId,
    `🔍 جاري البحث عن: <b>${trimTitle(query, 60)}</b>…`,
    { parse_mode: "HTML" },
  ).catch(() => null);

  if (!statusMsg) {
    console.error("[music] sendMessage failed for chatId", chatId);
    return;
  }

  const edit = (text: string) =>
    bot.telegram.editMessageText(
      chatId, statusMsg.message_id, undefined,
      text, { parse_mode: "HTML" },
    ).catch(() => {});

  // ── 1. Search ──
  let song: SongInfo | null;
  try { song = await findSong(query); }
  catch (e: any) { console.error("[music] findSong threw:", e?.message); await edit("❌ خطأ في البحث."); return; }
  if (!song) { await edit("❌ ما لقيت نتيجة — جرب اسماً ثانياً."); return; }

  await edit(
    `🎵 <b>${trimTitle(song.title)}</b>\n` +
    `👤 ${song.author || "—"}  ⏱ ${fmtDuration(song.duration)}\n` +
    `⏳ جاري التحميل…`,
  );

  // ── 2. Download ──
  let audio: AudioFile & { debugLog: string };
  try { audio = await downloadAudio(song.id); }
  catch (e: any) {
    const errTxt = (e?.message || "unknown").slice(0, 300);
    console.error("[music] download failed:", errTxt);
    // Show actual error in chat (debug mode — remove later)
    await edit(`❌ فشل التحميل\n<code>${errTxt}</code>`);
    return;
  }

  // ── 3. Send ──
  await bot.telegram.deleteMessage(chatId, statusMsg.message_id).catch(() => {});

  const filename = `${trimTitle(song.title, 40)}.${audio.ext}`;
  await bot.telegram.sendAudio(
    chatId,
    { source: audio.buf, filename },
    {
      title:      trimTitle(song.title, 60),
      performer:  song.author   || undefined,
      duration:   song.duration || undefined,
      caption:    `🎵 <b>${trimTitle(song.title)}</b>`,
      parse_mode: "HTML",
      reply_parameters: { message_id: replyTo },
    } as any,
  ).catch(async () => {
    await bot.telegram.sendMessage(chatId, "❌ فشل الإرسال — الملف كبير جداً.", { parse_mode: "HTML" }).catch(() => {});
  });
}
