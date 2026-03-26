import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import qs from "qs";
import crypto from "crypto";

const API = {
	BASE: "https://wink.ai",
	STRATEGY: "https://strategy.app.meitudata.com",
	QINIU: "https://up-qagw.meitudata.com",
};

const CLIENT = {
	ID: "1189857605",
	VERSION: "3.7.1",
	LANGUAGE: "en_US",
};

const TASK = {
	HD: { type: 2, label: "HD Image", content_type: 1 },
	ULTRA_HD: { type: 12, label: "Ultra HD Image", content_type: 1 },
};

const TYPE_PARAMS = { is_mirror: 0, orientation_tag: 1, j_420_trans: "1", return_ext: "2" };
const RIGHT_DETAIL = { source: "4", touch_type: "4", function_id: "630", material_id: "63001" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class WinkBotClient {
	constructor() {
		this.gnum = this.generateGnum();
		this.http = axios.create({
			baseURL: API.BASE,
			timeout: 60000,
			headers: {
				"Accept": "application/json, text/plain, */*",
				"Accept-Language": "en-US,en;q=0.9",
				"Accept-Encoding": "gzip, deflate, br",
				"Origin": API.BASE,
				"Referer": `${API.BASE}/`,
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			},
		});
	}

	generateGnum() {
		const ts = Date.now().toString(16);
		const r1 = crypto.randomBytes(6).toString("hex");
		const r2 = crypto.randomBytes(6).toString("hex");
		return `${ts}-${r1}-10462c6e-288000-${ts}${r2.slice(0, 3)}`;
	}

	_p(extra = {}) {
		return {
			client_id: CLIENT.ID,
			version: CLIENT.VERSION,
			country_code: "ID",
			gnum: this.gnum,
			client_language: CLIENT.LANGUAGE,
			client_channel_id: "",
			client_timezone: "Asia/Jakarta",
			...extra,
		};
	}

	async uploadFile(filePath) {
		const ext = path.extname(filePath).toLowerCase() || ".jpg";
		const stat = fs.statSync(filePath);

		const signRes = await this.http.get("/api/file/get_maat_sign.json", {
			params: this._p({ suffix: ext, type: "temp", count: 1 }),
		});
		const sign = signRes.data?.data;
		if (!sign?.sig) throw new Error("Gagal mendapatkan signature upload");

		const policyRes = await axios.get(`${API.STRATEGY}/upload/policy`, {
			params: {
				app: sign.app || "wink",
				count: 1,
				sig: sign.sig,
				sigTime: sign.sig_time,
				sigVersion: sign.sig_version,
				suffix: ext,
				type: "temp",
			},
			timeout: 15000,
		});
		const qiniu = policyRes.data?.[0]?.qiniu;
		if (!qiniu?.token) throw new Error("Gagal mendapatkan Qiniu policy");

		const form = new FormData();
		form.append("token", qiniu.token);
		form.append("key", qiniu.key);
		form.append("file", fs.createReadStream(filePath), {
			filename: path.basename(filePath),
			contentType: `image/${ext.replace(".", "").replace("jpg", "jpeg")}`,
		});

		const uploadRes = await axios.post(qiniu.url || API.QINIU, form, {
			headers: form.getHeaders(),
			timeout: 120000,
			maxBodyLength: Infinity,
			maxContentLength: Infinity,
		});

		if (!uploadRes.data?.url) throw new Error("Upload ke Qiniu gagal (URL kosong)");

		return { fileUrl: uploadRes.data.url, qiniuKey: qiniu.key };
	}

	async submitTask(fileUrl, taskCfg) {
		const taskName = `${taskCfg.label.replace(/\s+/g, "_")}-${crypto.randomBytes(8).toString("hex")}`;
		const body = qs.stringify({
			...this._p(),
			type: taskCfg.type,
			source_url: fileUrl,
			content_type: taskCfg.content_type,
			ext_params: JSON.stringify({ task_name: taskName, records: "2" }),
			type_params: JSON.stringify(TYPE_PARAMS),
			right_detail: JSON.stringify(RIGHT_DETAIL),
			with_prepare: 1,
		});

		const res = await this.http.post("/api/meitu_ai/delivery.json", body, {
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
		});

		const delivery = res.data?.data;
		if (!delivery?.prepare_msg_id) throw new Error("Gagal submit task ke Wink AI");

		return delivery.prepare_msg_id;
	}

	async waitForResult(msgId, timeoutMs = 120000) {
		const deadline = Date.now() + timeoutMs;
		let currentMsgId = msgId;

		while (Date.now() < deadline) {
			await sleep(2000);
			let res;
			try {
				res = await this.http.get("/api/meitu_ai/query_batch.json", {
					params: { ...this._p(), msg_ids: currentMsgId },
				});
			} catch {
				continue;
			}

			const item = res.data?.data?.item_list?.[0];
			if (!item) continue;

			if (currentMsgId.startsWith("wpr_")) {
				const realId = item.result?.result;
				if (realId && realId !== currentMsgId) currentMsgId = realId;
				continue;
			}

			if (item.result?.error_code && item.result?.error_code !== 0) {
				throw new Error(`AI error: ${item.result?.error_msg}`);
			}

			const media = item.result?.media_info_list;
			if (media?.length && media[0].media_data) {
				return {
					url: media[0].media_data,
					width: item.width,
					height: item.height,
					size: item.size_human,
				};
			}
		}
		throw new Error("Waktu tunggu habis (Timeout), AI terlalu sibuk.");
	}
}

export default {
	name: "Wink Ai",
	description: "memproses foto ke (HD / Ultra HD) menggunakan Wink AI.",
	command: ["wink", "hd", "uhd"],
	usage: "$prefix$command [hd/uhd] (mereply gambar)",
	permissions: "all",
	hidden: false,
	failed: "Failed to execute %command: %error",
	wait: true,
	category: "tools",
	cooldown: 15,
	limit: true,
	react: true,
	botAdmin: false,
	group: false,
	private: false,
	owner: false,

	execute: async (m) => {
		const isQuotedImage = m.quoted && (m.quoted.mtype === 'imageMessage' || m.quoted.type === 'imageMessage');
		const isImage = m.mtype === 'imageMessage' || m.type === 'imageMessage';

		if (!isImage && !isQuotedImage) {
			return m.reply(`[!] Silakan kirim gambar dengan perintah \`.wink\` atau reply gambar dengan perintah \`.wink\`.`);
		}

		const query = m.text?.toLowerCase().trim();
		const isUHD = query === "uhd" || m.command === "uhd";
		const selectedTask = isUHD ? TASK.ULTRA_HD : TASK.HD;

		await m.reply(`⟳ Memproses gambar ke *${selectedTask.label}*...\n⏳ Tunggu 10–30 detik`);

		let tmpPath = "";

		try {
			const mediaBuffer = isQuotedImage ? await m.quoted.download() : await m.download();
			
			const tmpName = `wink_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.jpg`;
			tmpPath = path.join(process.cwd(), tmpName);
			fs.writeFileSync(tmpPath, mediaBuffer);

			const wink = new WinkBotClient();
			const upload = await wink.uploadFile(tmpPath);
			const msgId = await wink.submitTask(upload.fileUrl, selectedTask);
			const result = await wink.waitForResult(msgId);

			let caption = `✨ *Wink AI Enhancer*\n\n`;
            caption += `Mode      : ${selectedTask.label}\n`;
            caption += `Resolusi  : ${result.width} x ${result.height}\n`;
            caption += `Ukuran    : ${result.size}\n`;

			await m.reply({
				image: { url: result.url },
				caption: caption.trim()
			});

		} catch (error) {
			console.error("WINK AI ERROR", error.message);
			return m.reply(`[!] Gagal memproses gambar.\nAlasan: ${error.message}`);
		} finally {
			if (tmpPath && fs.existsSync(tmpPath)) {
				fs.unlinkSync(tmpPath);
			}
		}
	},
};

