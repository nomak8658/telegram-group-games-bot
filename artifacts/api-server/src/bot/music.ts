import type { Telegraf } from "telegraf";
import { spawn, execFile }  from "child_process";
import { existsSync, unlinkSync } from "fs";
import { readFile, chmod }  from "fs/promises";
import { promisify }        from "util";
import path                 from "path";
import os                   from "os";

const execFileAsync = promisify(execFile);

// ─── yt-dlp binary path ───────────────────────────────────────────────────────

const YTDLP_PATH = "/tmp/yt-dlp-bin";
const YTDLP_URL  =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

let ytdlpReady = false;

async function ensureYtDlp(): Promise<string> {
  if (ytdlpReady && existsSync(YTDLP_PATH)) return YTDLP_PATH;

  if (!existsSync(YTDLP_PATH)) {
    // Download the standalone Linux binary
    await new Promise<void>((resolve, reject) => {
      const curlProc = spawn("curl", ["-sL", YTDLP_URL, "-o", YTDLP_PATH], {
        stdio: "inherit",
      });
      curlProc.on("close", code => (code === 0 ? resolve() : reject(new Error(`curl exited ${code}`))));
      curlProc.on("error", reject);
    });
    await chmod(YTDLP_PATH, 0o755);
  }

  ytdlpReady = true;
  return YTDLP_PATH;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SongInfo {
  title:    string;
  id:       string;
  duration: number;   // seconds
  author:   string;
}

// ─── Search ───────────────────────────────────────────────────────────────────

async function findSong(query: string): Promise<SongInfo | null> {
  const bin = await ensureYtDlp();

  return new Promise<SongInfo | null>((resolve) => {
    let out = "";
    const proc = spawn(bin, [
      `ytsearch5:${query}`,
      "--print", "%(title)s\t%(id)s\t%(duration)s\t%(uploader)s",
      "--flat-playlist",
      "--no-warnings",
      "--no-playlist",
      "--socket-timeout", "15",
    ]);

    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", () => {
      const lines = out.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        const [title, id, durStr, author] = line.split("\t");
        const dur = parseFloat(durStr ?? "0");
        if (id && dur > 0 && dur <= 600) {   // max 10 min
          return resolve({ title: title ?? query, id, duration: Math.round(dur), author: author ?? "" });
        }
      }
      resolve(null);
    });
    proc.on("error", () => resolve(null));

    setTimeout(() => { proc.kill(); resolve(null); }, 20_000);
  });
}

// ─── Download audio → mp3 buffer ─────────────────────────────────────────────

async function downloadMp3(videoId: string): Promise<Buffer> {
  const bin  = await ensureYtDlp();
  const tmp  = path.join(os.tmpdir(), `ytdl_${Date.now()}_${videoId}`);
  const outTemplate = `${tmp}.%(ext)s`;

  const args = [
    `https://www.youtube.com/watch?v=${videoId}`,
    "-x",
    "--audio-format",  "mp3",
    "--audio-quality", "5",
    "-o", outTemplate,
    "--no-warnings",
    "--no-playlist",
    "--socket-timeout", "30",
    "--no-part",
  ];

  // Add ffmpeg location if available via `which ffmpeg`
  try {
    const { stdout: ffPath } = await execFileAsync("which", ["ffmpeg"]);
    const ffmpeg = ffPath.trim();
    if (ffmpeg) args.push("--ffmpeg-location", path.dirname(ffmpeg));
  } catch { /* ffmpeg not in PATH, yt-dlp will try its own */ }

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited ${code}: ${stderr.slice(-200)}`));
    });
    proc.on("error", reject);
    setTimeout(() => { proc.kill(); reject(new Error("yt-dlp timeout")); }, 90_000);
  });

  // The output file will be .mp3
  const mp3Path = `${tmp}.mp3`;
  if (!existsSync(mp3Path)) throw new Error("mp3 file not found after download");

  const buf = await readFile(mp3Path);
  try { unlinkSync(mp3Path); } catch { /* ignore */ }
  return buf;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trimTitle(t: string, max = 60): string {
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

// ─── Public handler ───────────────────────────────────────────────────────────

export async function handleMusicSearch(
  bot:     Telegraf,
  chatId:  number,
  query:   string,
  replyTo: number,
): Promise<void> {

  const statusMsg = await bot.telegram.sendMessage(
    chatId,
    `🔍 جاري البحث عن: <b>${trimTitle(query, 60)}</b>…`,
    { parse_mode: "HTML", reply_parameters: { message_id: replyTo } },
  ).catch(() => null);

  const edit = (text: string) =>
    bot.telegram.editMessageText(
      chatId, statusMsg?.message_id, undefined,
      text, { parse_mode: "HTML" },
    ).catch(() => {});

  // 1. Search
  const song = await findSong(query);
  if (!song) {
    await edit("❌ ما لقيت نتيجة — جرب اسماً ثانياً.");
    return;
  }

  const mins = Math.floor(song.duration / 60);
  const secs = String(song.duration % 60).padStart(2, "0");
  await edit(
    `🎵 <b>${trimTitle(song.title)}</b>\n` +
    `👤 ${song.author || "—"}  ⏱ ${mins}:${secs}\n` +
    `⏳ جاري التحميل…`,
  );

  // 2. Download
  let buf: Buffer;
  try {
    buf = await downloadMp3(song.id);
  } catch (err: any) {
    console.error("[music] download error:", err?.message);
    await edit("❌ فشل التحميل — جرب مرة ثانية.");
    return;
  }

  // 3. Delete status & send audio
  await bot.telegram.deleteMessage(chatId, statusMsg?.message_id ?? 0).catch(() => {});

  await bot.telegram.sendAudio(
    chatId,
    { source: buf, filename: `${trimTitle(song.title, 40)}.mp3` },
    {
      title:      trimTitle(song.title, 60),
      performer:  song.author   || undefined,
      duration:   song.duration || undefined,
      caption:    `🎵 <b>${trimTitle(song.title)}</b>`,
      parse_mode: "HTML",
      reply_parameters: { message_id: replyTo },
    } as any,
  ).catch(async () => {
    await bot.telegram.sendMessage(
      chatId,
      "❌ فشل الإرسال — الملف ربما كبير جداً.",
      { parse_mode: "HTML" },
    ).catch(() => {});
  });
}
