import { fileTypeFromBuffer } from "file-type";

const sesiyt = new Map();

async function getYtdown(youtubeUrl) {
	const baseUrl = "https://app.ytdown.to";
	const proxyUrl = `${baseUrl}/proxy.php`;
	const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

	const initRes = await fetch(baseUrl, { headers: { "User-Agent": userAgent } });
	const rawCookies = initRes.headers.get("set-cookie") || "";
	const sessionId = rawCookies.split(";")[0];

	const payload = new URLSearchParams({ url: youtubeUrl });
	const headers = {
		"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
		"X-Requested-With": "XMLHttpRequest",
		"Origin": baseUrl,
		"Referer": `${baseUrl}/`,
		"User-Agent": userAgent,
		"Cookie": sessionId
	};

	const proxyRes = await fetch(proxyUrl, { method: "POST", headers, body: payload.toString() });
	if (!proxyRes.ok) throw new Error("Gagal terhubung ke ytdown.");
	
	const data = await proxyRes.json();
	if (data.api?.status !== "ok") throw new Error(data.api?.message || "Video tidak ditemukan atau link tidak valid.");

	return {
		title: data.api.title,
		channel: data.api.userInfo?.name || "Unknown",
		duration: data.api.mediaItems[0]?.mediaDuration || "Unknown",
		thumbnail: data.api.imagePreviewUrl,
		cookie: sessionId,
		userAgent: userAgent,
		downloads: data.api.mediaItems.map((item) => ({
			type: item.type,
			quality: item.mediaQuality,
			size: item.mediaFileSize,
			format: item.mediaExtension,
			url: item.mediaUrl || item.mediaPreviewUrl
		}))
	};
}

async function pollAndDownload(mediaUrl, cookie, userAgent) {
	let pollingUrl = mediaUrl;
	let actualDownloadUrl = null;
	let retryCount = 0;
	const maxRetries = 30; 
	
	const headers = {
		"User-Agent": userAgent,
		"Cookie": cookie,
		"Referer": "https://app.ytdown.to/",
		"Accept": "*/*"
	};

	while (retryCount < maxRetries) {
		const response = await fetch(pollingUrl, { headers });
		const contentType = response.headers.get("content-type") || "";

		if (contentType.includes("application/json")) {
			const jsonData = await response.json();
			const loadingStatuses = ["processing", "pending", "queued", "starting", "downloading", "merge"];
			
			if (loadingStatuses.includes(jsonData.status?.toLowerCase())) {
				retryCount++;
				await new Promise((r) => setTimeout(r, 3000));
				continue;
			} else if (jsonData.status === "completed" || jsonData.status === "ok" || jsonData.url) {
				actualDownloadUrl = jsonData.url || jsonData.downloadUrl || jsonData.fileUrl || jsonData.link;
				if (!actualDownloadUrl) {
					const match = JSON.stringify(jsonData).match(/https?:\/\/[^\s"']+/);
					if (match) actualDownloadUrl = match[0];
				}
				break;
			} else {
				actualDownloadUrl = pollingUrl;
				break;
			}
		} else {
			actualDownloadUrl = pollingUrl;
			break;
		}
	}

	if (!actualDownloadUrl) throw new Error("Timeout! Server terlalu lama memproses media.");

	const res = await fetch(actualDownloadUrl, { headers });
	if (!res.ok) throw new Error(`Gagal mengunduh file media (HTTP: ${res.status})`);
	
	const buf = Buffer.from(await res.arrayBuffer());
	return buf;
}

export default {
	name: "youtube",
	description: "Download video atau audio dari YouTube",
	command: ["yt", "ytmp4", "ytmp3"], 
	category: "downloader",
	permissions: "all",
	cooldown: 5,
	limit: false,
	hidden: false,
	react: true,
	usage: "$prefix$command <url>",
	wait: null,
	failed: "Gagal menjalankan perintah",

	execute: async (m) => {
		const input = m.text?.trim() || m.quoted?.text || null;

		if (!input) {
			return m.reply("Input URL Youtube.");
		}

		const isNumber = /^\d+$/.test(input);

		if (isNumber) {
			const session = sesiyt.get(m.sender);
			if (!session) return m.reply("Sesi download tidak ditemukan atau kedaluwarsa. Silakan kirim ulang link YouTube-nya.");

			const index = parseInt(input) - 1;
			const selected = session.downloads[index];

			if (!selected) return m.reply(`Pilihan tidak sesuai. Silakan pilih nomor 1 sampai ${session.downloads.length}.`);

			await m.reply(`📥 Download: format *${selected.type} (${selected.quality})*\nMohon ditunggu sebentar...`);

			try {
				const buf = await pollAndDownload(selected.url, session.cookie, session.userAgent);
				
				if (buf.length < 50000) throw new Error("File corrupt atau terlalu kecil, coba lagi.");
				const file = await fileTypeFromBuffer(buf);

				const caption = `🎬 *${session.title}*\n\nSukses dengan format ${selected.quality} (${selected.format}).`;

				if (selected.type.toLowerCase() === "audio") {
					await m.reply({
						audio: buf,
						mimetype: file?.mime || "audio/mp4",
						ptt: false
					});
				} else {
					await m.reply({
						video: buf,
						caption: caption,
						mimetype: file?.mime || "video/mp4"
					});
				}

				sesiyt.delete(m.sender);
				return;

			} catch (err) {
				return m.reply(`Gagal mengunduh: ${err.message}`);
			}
		}

		if (!input.includes("youtu")) {
			return m.reply("Link tidak valid.");
		}

		try {
			await m.reply("Mohon Tunggu Sebentar...");
			const result = await getYtdown(input);

			sesiyt.set(m.sender, result);

			let msgText = `🎬 *${result.title}*\n`;
			msgText += `👤 Channel: ${result.channel}\n`;
			msgText += `⏱️ Durasi: ${result.duration}\n\n`;
			msgText += `*Kualitas yang Tersedia:*\n`;

			result.downloads.forEach((d, i) => {
				msgText += `*[ ${i + 1} ]* ${d.type} - ${d.quality} (${d.size})\n`;
			});

			msgText += `\n💡 *Cara Unduh:* Balas/Reply pesan ini dengan perintah:\n*${m.prefix || '.'}${m.command} <nomor>*\n_(Contoh: ${m.prefix || '.'}${m.command} 1)_`;

			return m.reply({
				image: { url: result.thumbnail },
				caption: msgText
			});

		} catch (err) {
			return m.reply(`Gagal memproses YouTube: ${err.message}`);
		}
	}
};
