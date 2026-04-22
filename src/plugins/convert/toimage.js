import { webpToImage } from "#utils/converter";

export default {
	name: "toimage",
	description: "Convert sticker to image.",
	command: ["toimg", "toimage"],
	permissions: "all",
	hidden: false,
	failed: "Failed to %command: %error",
	wait: null,
	category: "convert",
	cooldown: 5,
	limit: false,
	usage: "$prefix$command reply sticker",
	react: true,
	botAdmin: false,
	group: false,
	private: false,
	owner: false,

	/**
	 * @param {import('baileys').WASocket} sock
	 * @param {object} m
	 */
	execute: async (m) => {
		const q    = m.isQuoted ? m.quoted : m;
		const mime = (q.type || q.mtype || "").toLowerCase();

		if (/lottie/i.test(mime) || mime === "lottiestickermessage") {
			return m.reply("Stiker animasi Lottie tidak bisa diconvert.");
		}

		if (!/webp|sticker|document/i.test(mime)) {
			return m.reply("Balas/kirim stiker dengan perintah ini ya.");
		}

		const media  = await q.download();
		const buffer = Buffer.isBuffer(media) ? media : Buffer.from(media);

		if (!buffer || buffer.length === 0) {
			return m.reply("Buffer stiker kosong, coba kirim ulang.");
		}

		const result = await webpToImage(buffer);
		return m.reply({ image: result });
	},
};
