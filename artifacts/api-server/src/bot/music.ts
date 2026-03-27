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

async function downloadAudio(videoId: string): Promise<AudioFile> {
  const bin     = await resolveYtDlp();
  const ffDir   = await getFfmpegDir();
  const tmpBase = path.join(os.tmpdir(), `yt_${Date.now()}_${videoId}`);
  const outTpl  = `${tmpBase}.%(ext)s`;

  const baseArgs = [
    `https://www.youtube.com/watch?v=${videoId}`,
    "--no-warnings", "--no-playlist",
    "--socket-timeout", "20",
    "--no-part",
    "-o", outTpl,
  ];

  // ── Helper: find the output file by prefix ──────────────────────────────────
  const findFile = (): string | null => {
    const prefix = path.basename(tmpBase);
    const found  = readdirSync(os.tmpdir()).find(f => f.startsWith(prefix));
    return found ? path.join(os.tmpdir(), found) : null;
  };

  // ── Strategy A: mp3 via ffmpeg ──────────────────────────────────────────────
  if (ffDir) {
    try {
      await runYtDlp(bin, [
        ...baseArgs,
        "-x", "--audio-format", "mp3", "--audio-quality", "5",
        "--ffmpeg-location", ffDir,
      ], 90_000);
      const f = findFile();
      if (f) { const buf = await readFile(f); try { unlinkSync(f); } catch {} return { buf, ext: "mp3" }; }
    } catch (e: any) { console.error("[music:dl] mp3 failed:", e?.message); }
  }

  // ── Strategy B: webm/opus — no ffmpeg, no fixup ─────────────────────────────
  // 251 = webm/opus 132kbps, 249 = webm/opus 51kbps — neither needs ffmpeg
  try {
    await runYtDlp(bin, [
      ...baseArgs,
      "-f", "251/249/bestaudio[ext=webm]",
    ], 90_000);
    const f = findFile();
    if (f) {
      const buf = await readFile(f);
      try { unlinkSync(f); } catch {}
      return { buf, ext: path.extname(f).slice(1) || "webm" };
    }
  } catch (e: any) { console.error("[music:dl] webm failed:", e?.message); }

  // ── Strategy C: m4a with fixup disabled ─────────────────────────────────────
  try {
    await runYtDlp(bin, [
      ...baseArgs,
      "-f", "140/139/bestaudio[ext=m4a]",
      "--fixup", "never",
    ], 90_000);
    const f = findFile();
    if (f) {
      const buf = await readFile(f);
      try { unlinkSync(f); } catch {}
      return { buf, ext: path.extname(f).slice(1) || "m4a" };
    }
  } catch (e: any) { console.error("[music:dl] m4a failed:", e?.message); }

  throw new Error("all strategies failed");
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
  let audio: AudioFile;
  try { audio = await downloadAudio(song.id); }
  catch (e: any) { console.error("[music] download failed:", e?.message); await edit("❌ فشل التحميل — جرب مرة ثانية."); return; }

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
