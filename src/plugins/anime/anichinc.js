import axios from "axios";
import cheerio from "cheerio";

const client = axios.create({
	baseURL: "https://anichin.cafe",
	headers: {
		"User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "id-ID,id;q=0.9",
		"Cookie": "_ga=GA1.1.1210577259.1774491552; _ga_LKVWRJK4J4=GS2.1.s1774491551$o1$g0$t1774491551$j60$l0$h0",
	},
	timeout: 15000,
	decompress: true,
});

async function getAnichinCompleted(page = 1) {
	const url = page === 1 ? "/completed/" : `/completed/page/${page}/`;
	const { data } = await client.get(url);
	const $ = cheerio.load(data);
	const allResults = [];

	const cards = $(".bsx");
	if (!cards.length) return allResults;

	cards.each((_, el) => {
		const card = $(el);
		const title =
			card.find("h2, h3, .tt").first().text().trim() ||
			card.find("a").first().attr("title") || "";
		const link = card.find("a").first().attr("href") || "";
		const thumb = card.find("img").first().attr("src") || card.find("img").first().attr("data-src") || "";
		const episode = card.find(".epx, .ep").first().text().trim();
		const rating = card.find(".numscore, .score").first().text().trim();

		if (title && link) {
			allResults.push({ title, episode, rating, link, thumbnail: thumb });
		}
	});

	return allResults;
}

export default {
	name: "anichincompleted",
	description: "Melihat daftar anime yang sudah tamat di Anichin.",
	command: ["anichinc", "anichincompleted", "anicompleted"],
	usage: "$prefix$command [nomor halaman, opsional]",
	permissions: "all",
	hidden: false,
	failed: "Failed to execute %command: %error",
	wait: null,
	category: "anime",
	cooldown: 5,
	limit: true,
	react: true,
	botAdmin: false,
	group: false,
	private: false,
	owner: false,

	execute: async (m) => {
		let page = 1;
		if (m.text && m.text.trim() !== "" && !isNaN(m.text.trim())) {
			page = parseInt(m.text.trim());
		}

		await m.reply(`⟳ Mengambil data Anichin Completed (Halaman ${page})...`);

		try {
			const results = await getAnichinCompleted(page);

			if (!results || results.length === 0) {
				return m.reply(`[!] Tidak ada data anime yang ditemukan di halaman ${page}.`);
			}

			let text = `┌───────────────────────────────\n`;
			text += `│  *ANICHIN - COMPLETED* (Hal. ${page})\n`;
			text += `└───────────────────────────────\n\n`;

			results.forEach((a, i) => {
				const ep = a.episode ? `[ ${a.episode} ]` : "";
				const rat = a.rating ? `⚝ ${a.rating}` : "";
				const info = [ep, rat].filter(Boolean).join("  •  ");

				text += ` *[${String(i + 1).padStart(2, '0')}] ${a.title}*\n`;
				if (info) text += `   ├─ Info : ${info}\n`;
				text += `   └─ Link : ${a.link}\n\n`;
			});

			text += `═`.repeat(32) + `\n`;
			text += ` ≡  Total Data : ${results.length} anime\n`;
			text += `═`.repeat(32);

			// Mengirim pesan berupa teks rapi
			return m.reply(text.trim());

		} catch (error) {
			console.error(error);
			return m.reply("[!] Gagal terhubung ke Anichin atau terjadi kesalahan sistem.");
		}
	},
};
