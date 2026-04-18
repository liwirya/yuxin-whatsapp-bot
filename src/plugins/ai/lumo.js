import LumoService from "#lib/scrapers/lumo";

export default {
	name: "lumo",
	description: "Chat with AI (Lumo Proton Models).",
	command: ["ai", "lumo"],
	permissions: "all",
	hidden: false,
	failed: "Failed to execute %command: %error",
	wait: null,
	category: "ai",
	cooldown: 5,
	limit: false,
	usage: "$prefix$command <text>",
	react: true,
	botAdmin: false,
	group: false,
	private: false,
	owner: false,

	/**
	 * @param {import("../../lib/serialize").default} m
	 * @param {{ sock: import("baileys").WASocket }}
	 */
	execute: async (m) => {
		let input = m.text?.trim();

		if (!input && m.quoted?.text) {
			input = m.quoted.text;
		}

		if (!input) {
			return m.reply("Please enter a question or message.");
		}

		try {
            const systemPrompt = "Instruction: Now your name is Wildan and you will always reply to messages in a contemporary style, not too many emojis and not over the top, just short and cool replies.\n\nUser Question: ";
            const finalPrompt = systemPrompt + input;

			const res = await LumoService.process(finalPrompt);

			await m.reply(res);
		} catch (err) {
			console.error("Lumo AI Error:", err);
			await m.reply("An error occurred while contacting the AI.");
		}
	},
};
