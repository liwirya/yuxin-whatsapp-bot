import axios from 'axios';
import * as cheerio from 'cheerio';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

export default {
	name: "Komiku Search",
	description: "Mencari manga/manhua/manhwa dari website Komiku",
	command: ["komiku", "komikusrc", "kmusrc"],
	permissions: "all",
	hidden: false,
	failed: "Failed to execute %command: %error",
	category: "search",
	cooldown: 5,
	usage: "$prefix$command [keyword]",
	react: true,
	wait: null,

	execute: async (m, { sock }) => {
		if (m.args.length === 0) {
			return m.reply(
				`Harap masukkan judul yang ingin dicari!\n\n*Contoh:* \`${m.prefix}${m.command} Soul land\``
			);
		}

		await m.reply("_Sedang mencari, tunggu sebentar..._");

		const keyword = m.args.join(" ");

		try {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://komiku.org/',
                'Connection': 'keep-alive'
            };

            await client.get('https://komiku.org/', { headers });

			const url = `https://api.komiku.org/?post_type=manga&s=${encodeURIComponent(keyword)}`;
			const response = await client.get(url, { headers });

			if (response.status !== 200) {
				throw new Error(`API Error: ${response.status} ${response.statusText}`);
			}

			const $ = cheerio.load(response.data);
			const results = [];

			$('.bge').each((index, element) => {
				const title = $(element).find('.kan h3').text().trim();
				const link = $(element).find('.kan a').attr('href');
				const thumbnail = $(element).find('.bgei img').attr('src');
				const type = $(element).find('.tpe1_inf b').text().trim();
				const updateTime = $(element).find('.kan p').text().trim();

                const latestChapter = $(element).find('.new1').last().find('span').last().text().trim();

				if (title && link) {
					results.push({
						title: title,
						url: `https://komiku.org${link}`,
						thumbnail: thumbnail || "https://komiku.org/wp-content/uploads/2022/03/Logo-Komiku.png",
						type: type || "Komik",
						updateStatus: updateTime || "Tidak tahu",
                        latestChapter: latestChapter || "gk ada chapter"
					});
				}
			});

			if (results.length === 0) {
				return m.reply(`Tidak ditemukan hasil dari pencarian: *${keyword}*`);
			}

			let replyText = `📚 *Hasil Pencarian Komiku*\n\n`;
            replyText += `🔎 Pencarian: *${keyword}*\n`;
            replyText += `📑 Ditemukan: ${results.length}\n\n`;

			const limit = Math.min(results.length, 15); 
			
			for (let i = 0; i < limit; i++) {
				const item = results[i];

				replyText += `*${i + 1}. ${item.title}*\n`;
				replyText += `Tipe: ${item.type}\n`;
				replyText += `Terbaru: ${item.latestChapter}\n`;
				replyText += `Update: ${item.updateStatus}\n`;
				replyText += `Link: ${item.url}\n\n`;
			}

			if (results.length > limit) {
				replyText += `_Menampilkan ${limit} dari ${results.length} hasil pencarian._\n_Kunjungi langsung komiku.org untuk hasil lainnya._`;
			}
	
			const thumbnailImg = results[0].thumbnail;

			await m.reply({
				text: replyText.trim(),
				contextInfo: {
					externalAdReply: {
						title: "Komiku Search",
						body: `Mencari: ${keyword}`,
						renderLargerThumbnail: true,
						sourceUrl: results[0].url,
						mediaType: 1,
						thumbnailUrl: thumbnailImg,
					},
				},
			});

		} catch (error) {
			console.error("Komiku Search Error:", error);
            
            if (error.response && (error.response.status === 403 || error.response.status === 503)) {
                await m.reply(`*Akses Ditolak (403/503).`);
            } else {
			    await m.reply(`*Terjadi Kesalahan!*\nGagal mengambil data dari server.\nPesan error: _${error.message}_`);
            }
		}
	},
};
