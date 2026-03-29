import axios from "axios";
import * as cheerio from "cheerio";

const CONFIG = {
	API_URL: "https://getsnackvideo.com/results",
	DOMAIN: "https://getsnackvideo.com/",
	USER_AGENT: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36"
};

export class SnackVideo {
	async scrape(url) {
		const params = new URLSearchParams({
			'ic-request': 'true',
			'id': url,
			'locale': 'id',
			'ic-element-id': 'main_page_form',
			'ic-id': '1',
			'ic-target-id': 'active_container',
			'ic-trigger-id': 'main_page_form',
			'ic-current-url': '/id',
			'ic-select-from-response': '#id1',
			'_method': 'POST'
		});

		const { data } = await axios.post(CONFIG.API_URL, params.toString(), {
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
				'Accept': 'text/html-partial, */*; q=0.9',
				'X-IC-Request': 'true',
				'X-HTTP-Method-Override': 'POST',
				'X-Requested-With': 'XMLHttpRequest',
				'User-Agent': CONFIG.USER_AGENT,
				'Referer': CONFIG.DOMAIN
			}
		});

		const $ = cheerio.load(data);
		const downloadLink = $('a.download_link.without_watermark').attr('href');

		if (!downloadLink) {
			throw new Error("Struktur web berubah atau tautan unduhan tidak ditemukan.");
		}

		return {
			videoUrl: downloadLink
		};
	}
}

