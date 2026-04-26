export default {
	name: "kjmail",
	description: "Get temporary phone numbers and SMS.",
	command: ["kjmail", "tempsms"],
	permissions: "all",
	hidden: false,
	failed: "Failed to %command: %error",
	wait: true, 
	category: "tools",
	cooldown: 5,
	limit: true,
	usage: "$prefix$command nomor_urut",
	react: true,
	botAdmin: false,
	group: false,
	private: false,
	owner: false,

	execute: async (m, { args, prefix, command }) => {
		const SUPABASE_URL = "https://lmfwpuoczjrccbwsulyz.supabase.co"; 
		const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtZndwdW9jempyY2Nid3N1bHl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNzE4NjIsImV4cCI6MjA4MTg0Nzg2Mn0.JYH5X4Yq_5MrtsYFlgKfhcUNt_kACmNWXhtBvd5qXzc"; 

		try {
			const resNumbers = await fetch(`${SUPABASE_URL}/functions/v1/get-phone-numbers`, {
				method: 'GET', 
				headers: {
					'apikey': API_KEY, 
					'Content-Type': 'application/json'
				}
			});

			if (!resNumbers.ok) {
				return m.reply("Gagal mengambil data KJMail.");
			}

			const dataNumbers = await resNumbers.json();
			const numbers = dataNumbers.numbers; 
			const input = args ? args[0] : null;

			if (!input || isNaN(input)) {
				let cap = "*📱 DAFTAR NOMOR SEMENTARA (KJMail)*\n\n";
				cap += `_Ketik *${prefix || ""}${command} <urutan>* untuk melihat inbox._\n_Contoh: *${prefix || ""}${command} 1*_\n\n`;
				
				numbers.forEach((item, index) => {
					cap += `*${index + 1}.* ${item.number} (${item.country})\n`; 
				});

				return m.reply(cap.trim());
			}

			const choice = parseInt(input);
			if (choice < 1 || choice > numbers.length) {
				return m.reply(`Pilihan tidak valid! Silakan masukkan angka dari 1 hingga ${numbers.length}.`);
			}

			const target = numbers[choice - 1];

			const resMessages = await fetch(`${SUPABASE_URL}/functions/v1/get-phone-messages`, {
				method: 'POST', 
				headers: {
					'apikey': API_KEY, 
					'Authorization': `Bearer ${API_KEY}`, 
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ 
					number: target.number,
					source: target.source
				})
			});

			if (!resMessages.ok) {
				return m.reply("Gagal mengambil isi Inbox dari server.");
			}

			const dataMessages = await resMessages.json();

			let msgCap = `*📥 INBOX UNTUK ${target.number}*\n\n`;

			if (dataMessages.messages && dataMessages.messages.length > 0) { 
				dataMessages.messages.forEach((msg, idx) => {
					msgCap += `*[ ${idx + 1} ] Dari: ${msg.from}*\n`; 
					msgCap += `- *Waktu:* ${msg.time}\n`; 
					msgCap += `- *Pesan:* ${msg.message}\n\n`; 
				});
			} else {
				msgCap += "_Belum ada pesan masuk untuk nomor ini._";
			}

			return m.reply(msgCap.trim());

		} catch (error) {
			console.error(error);
			return m.reply(`Terjadi kesalahan: ${error.message}`);
		}
	},
};
