import type { Telegraf } from "telegraf";
import { spawn }         from "child_process";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SongInfo {
  title:     string;
  url:       string;
  duration:  number;   // seconds
  author:    string;
}

// ─── YouTube search & stream via play-dl ─────────────────────────────────────

async function findSong(query: string): Promise<SongInfo | null> {
  try {
    // @ts-ignore
    const playdl = await import("play-dl");
    const results = await playdl.search(query, {
      source: { youtube: "video" },
      limit:  5,
    });
    const video = results?.find((r: any) => r.durationInSec > 0 && r.durationInSec <= 600);
    if (!video) return null;
    return {
      title:    video.title   ?? query,
      url:      video.url,
      duration: video.durationInSec ?? 0,
      author:   video.channel?.name ?? "",
    };
  } catch {
    return null;
  }
}

async function downloadMp3(url: string): Promise<Buffer> {
  // @ts-ignore
  const playdl = await import("play-dl");

  const info = await playdl.stream(url, { quality: 2 });

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    const ff = spawn("ffmpeg", [
      "-loglevel", "error",
      "-i",        "pipe:0",
      "-f",        "mp3",
      "-ab",       "128k",
      "-vn",
      "pipe:1",
    ]);

    info.stream.pipe(ff.stdin as NodeJS.WritableStream);
    ff.stdout.on("data",  (c: Buffer) => chunks.push(c));
    ff.stdout.on("end",   ()          => resolve(Buffer.concat(chunks)));
    ff.on("error",        reject);
    (ff.stdin  as any).on("error", () => {});
    info.stream.on("error", reject);
  });
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

  // 1. Find the song
  const song = await findSong(query);
  if (!song) {
    await edit("❌ ما لقيت نتيجة — جرب اسماً ثانياً.");
    return;
  }

  await edit(`🎵 <b>${trimTitle(song.title)}</b>\n⏳ جاري التحميل…`);

  // 2. Download audio → mp3
  let buf: Buffer;
  try {
    buf = await downloadMp3(song.url);
  } catch {
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
