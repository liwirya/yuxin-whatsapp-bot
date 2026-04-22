import { fileTypeFromBuffer } from "file-type";
import ffmpegLib from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import {
	existsSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
	mkdirSync,
	readdirSync,
} from "fs";
import crypto from "node:crypto";
import { tmpdir } from "node:os";
import { PassThrough, Readable } from "node:stream";
import { join } from "path";
ffmpegLib.setFfmpegPath(ffmpegStatic);

const supported_audio_args = {
	"3g2": ["-vn", "-c:a", "libopus", "-b:a", "128k", "-vbr", "on", "-compression_level", "10"],
	"3gp": ["-vn", "-c:a", "libopus", "-b:a", "128k", "-vbr", "on", "-compression_level", "10"],
	aiff:  ["-vn", "-c:a", "pcm_s16be"],
	amr:   ["-vn", "-c:a", "libopencore_amrnb", "-ar", "8000", "-b:a", "12.2k"],
	flac:  ["-vn", "-c:a", "flac"],
	m4a:   ["-vn", "-c:a", "aac", "-b:a", "128k"],
	m4r:   ["-vn", "-c:a", "libfdk_aac", "-b:a", "64k"],
	mka:   ["-vn", "-c:a", "libvorbis", "-b:a", "128k"],
	mp3:   ["-vn", "-c:a", "libmp3lame", "-q:a", "2"],
	ogg:   ["-vn", "-c:a", "libvorbis", "-q:a", "3"],
	opus:  ["-vn", "-c:a", "libopus", "-b:a", "128k", "-vbr", "on", "-compression_level", "10"],
	wav:   ["-vn", "-c:a", "pcm_s16le"],
	wma:   ["-vn", "-c:a", "wmav2", "-b:a", "128k"],
};

export function bufferToStream(buffer) {
	const stream = new Readable();
	stream.push(buffer);
	stream.push(null);
	return stream;
}

function tmpId() {
	return crypto.randomBytes(12).toString("hex");
}

function tmpPath(ext) {
	return join(tmpdir(), `${tmpId()}.${ext}`);
}

function safeUnlink(...paths) {
	for (const p of paths) {
		try { if (existsSync(p)) unlinkSync(p); } catch (_) {}
	}
}

function safeUnlinkDir(dir) {
	try {
		const files = readdirSync(dir);
		for (const f of files) safeUnlink(join(dir, f));
		require("fs").rmdirSync(dir);
	} catch (_) {}
}

/**
 * Ekstrak semua frame dari WebP animasi menggunakan sharp (libvips).
 * sharp support WebP animasi multi-frame, tidak butuh libwebp di ffmpeg.
 *
 * @param {Buffer} webpBuffer
 * @returns {Promise<{ frames: Buffer[], delay: number[], width: number, height: number }>}
 */
async function extractWebpFrames(webpBuffer) {
	const sharp = (await import("sharp")).default;
	const image = sharp(webpBuffer, { animated: true });
	const meta  = await image.metadata();

	const width  = meta.width  || 512;
	const pages  = meta.pages  || 1;
	const pageHeight = meta.pageHeight || Math.floor((meta.height || 512) / pages);
	const delays = meta.delay  || Array(pages).fill(100); 
	const frames = [];

	for (let i = 0; i < pages; i++) {
		const frameBuf = await sharp(webpBuffer, { animated: false, page: i })
			.png()
			.toBuffer();
		frames.push(frameBuf);
	}

	return {
		frames,
		delay: delays,
		width,
		height: pageHeight,
	};
}

/**
 * Ekstrak frame pertama dari WebP (static atau animasi) → PNG buffer.
 * @param {Buffer} webpBuffer
 * @returns {Promise<Buffer>}
 */
async function extractWebpFirstFrame(webpBuffer) {
	const sharp = (await import("sharp")).default;
	return sharp(webpBuffer, { animated: false, page: 0 })
		.png()
		.toBuffer();
}

/**
 * Konversi array frame PNG buffer → MP4 buffer via ffmpeg image sequence.
 * Cara ini tidak butuh WebP decoder di ffmpeg sama sekali,
 * karena input-nya sudah PNG murni hasil decode dari sharp.
 *
 * @param {Buffer[]} frames  - Array PNG frame buffer
 * @param {number[]} delays  - Array delay per frame dalam ms
 * @returns {Promise<Buffer>}
 */
async function framesToMp4(frames, delays) {
	if (frames.length === 0) throw new Error("Tidak ada frame yang ditemukan");

	const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
	const fps = Math.round(1000 / Math.max(avgDelay, 10));
	const frameDir = join(tmpdir(), tmpId());
	mkdirSync(frameDir, { recursive: true });

	for (let i = 0; i < frames.length; i++) {
		const framePath = join(frameDir, `frame_${String(i).padStart(5, "0")}.png`);
		writeFileSync(framePath, frames[i]);
	}

	const outputPath = tmpPath("mp4");

	return new Promise((resolve, reject) => {
		ffmpegLib()
			.input(join(frameDir, "frame_%05d.png"))
			.inputOptions([
				`-framerate`, String(fps),
			])
			.outputOptions([
				"-pix_fmt",  "yuv420p",
				"-c:v",      "libx264",
				"-movflags", "+faststart",
				"-vf",       "scale=trunc(iw/2)*2:trunc(ih/2)*2",
				"-preset",   "fast",
				"-crf",      "23",
				"-an",       // no audio
			])
			.format("mp4")
			.on("end", () => {
				const buf = readFileSync(outputPath);
				safeUnlink(outputPath);
				safeUnlinkDir(frameDir);
				resolve(buf);
			})
			.on("error", (err) => {
				safeUnlink(outputPath);
				safeUnlinkDir(frameDir);
				reject(new Error(`framesToMp4 error: ${err.message}`));
			})
			.save(outputPath);
	});
}

/**
 * Konversi WebP animasi buffer → MP4 buffer.
 *
 * Pipeline:
 *   WebP buffer → sharp (extract frames PNG) → ffmpeg image sequence → MP4
 *
 * Tidak menggunakan inputFormat("webp") di ffmpeg karena ffmpeg-static
 * tidak include libwebp decoder ("Input format webp is not available").
 *
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
export async function webpToVideo(buffer) {
	if (!Buffer.isBuffer(buffer)) throw new Error("Input harus berupa Buffer");

	const ft = await fileTypeFromBuffer(buffer);
	if (!ft || !/(webp)/i.test(ft.ext)) {
		throw new Error(`Format tidak didukung: ${ft?.mime ?? "unknown"}. Harus WebP animasi.`);
	}

	const { frames, delay } = await extractWebpFrames(buffer);

	if (frames.length === 1) {
		return framesToMp4(frames, [500]);
	}

	return framesToMp4(frames, delay);
}

/**
 * Konversi WebP buffer → PNG buffer (frame pertama).
 *
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
export async function webpToImage(buffer) {
	if (!Buffer.isBuffer(buffer)) throw new Error("Input harus berupa Buffer");
	return extractWebpFirstFrame(buffer);
}

export async function convert(mediaBuffer, args, format = null) {
	const tempPath = tmpPath(format || "out");
	return new Promise((resolve, reject) => {
		ffmpegLib()
			.input(bufferToStream(mediaBuffer))
			.addOutputOptions(args)
			.format(format)
			.on("end", () => {
				if (existsSync(tempPath)) {
					const buf = readFileSync(tempPath);
					unlinkSync(tempPath);
					resolve(buf);
				} else {
					reject(new Error("Output file tidak ditemukan setelah konversi"));
				}
			})
			.on("error", reject)
			.save(tempPath);
	});
}

export async function to_audio(mediaBuffer, ext = null) {
	if (!ext) {
		const ft = await fileTypeFromBuffer(mediaBuffer);
		if (!ft) throw new Error("Tidak dapat mendeteksi tipe file");
		ext = ft.ext;
	}
	if (!supported_audio_args[ext]) {
		throw new Error(`Tipe tidak didukung: ${ext}`);
	}
	return convert(mediaBuffer, supported_audio_args[ext], ext);
}

const audio_effects = {
	bass:      { filter: "bass=g=20:f=110:w=0.6" },
	blown:     { filter: "acrusher=level_in=4:level_out=5:bits=8:mode=log:aa=1" },
	deep:      { filter: "asetrate=44100*0.7,aresample=44100,atempo=1.3" },
	earrape:   { filter: "volume=10,bass=g=30:f=80:w=0.6,acrusher=level_in=8:level_out=12:bits=4:mode=log:aa=1" },
	echo:      { filter: "aecho=0.8:0.88:60:0.4" },
	fast:      { filter: "atempo=1.5" },
	fat:       { filter: "bass=g=15:f=60:w=0.8,lowpass=f=3000,volume=1.5" },
	nightcore: { filter: "asetrate=44100*1.25,aresample=44100,atempo=1.1" },
	reverse:   { filter: "areverse" },
	robot:     { filter: "afftfilt=real='hypot(re,im)':imag='0',aecho=0.8:0.9:40:0.3,aresample=44100" },
	slowed:    { filter: "asetrate=44100*0.9,aresample=44100,atempo=0.85" },
	smooth:    { filter: "lowpass=f=4500,bass=g=2:f=120,treble=g=-1:f=3000,volume=1.2" },
	chimpunk:  { filter: "asetrate=44100*1.5,aresample=44100,atempo=1.1" },
};

export function getAudioEffectCommands() {
	return Object.keys(audio_effects);
}

export async function audioEffects(inputBuffer, effectName) {
	const key    = (effectName || "").toLowerCase();
	const effect = audio_effects[key];
	if (!effect) {
		throw new Error(
			`Unknown effect: ${effectName}\nAvailable: ${Object.keys(audio_effects).join(", ")}`
		);
	}
	return new Promise((resolve, reject) => {
		const outStream = new PassThrough();
		const chunks    = [];
		outStream.on("data",  (c) => chunks.push(c));
		outStream.on("end",   () => resolve(Buffer.concat(chunks)));
		outStream.on("error", reject);
		ffmpegLib()
			.input(bufferToStream(inputBuffer))
			.noVideo()
			.outputOptions(["-map_metadata", "-1", "-af", effect.filter, "-b:a", "192k"])
			.format("mp3")
			.on("error", reject)
			.pipe(outStream, { end: true });
	});
}
