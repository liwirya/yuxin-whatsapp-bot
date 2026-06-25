[![Banner](https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,20,30&height=180&section=header&text=Cellyn&fontSize=90&fontAlignY=38&animation=twinkling&fontColor=fff&desc=WhatsApp+Bot+built+on+Baileys&descSize=16&descAlignY=58)](https://github.com/liwirya/cellyn-whatsapp-bot)

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-20+-43A047?style=flat-square&logo=node.js&logoColor=white)
![Baileys](https://img.shields.io/badge/Baileys-Latest-00BCD4?style=flat-square&logo=whatsapp&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-7E57C2?style=flat-square)
![Stars](https://img.shields.io/github/stars/liwirya/cellyn-whatsapp-bot?style=flat-square&color=FFA726)

</div>

---

<div align="center">

<img src="./assets/preview.gif" width="600" alt="Cellyn Preview" />

</div>

---

## Overview

Cellyn is a WhatsApp bot built on [Baileys](https://github.com/WhiskeySockets/Baileys) with a modular plugin system, multi-database support, and a clean architecture designed for extensibility.

---

## Requirements

- Node.js 18+
- Git
- FFmpeg
- MongoDB or MySQL *(optional — Local JSON available)*

---

## Installation

```bash
git clone https://github.com/liwirya/cellyn-whatsapp-bot.git
cd cellyn-whatsapp-bot
npm install
cp .env.example .env
```

Edit `.env` then start:

```bash
# Development
npm start

# Production
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

---

## Configuration

```env
# Bot
BOT_NAME=Cellyn
OWNER_NUMBER=628xxxxxxxxxx
PREFIX=.

# Database (choose one or both)
MONGODB_URI=mongodb+srv://...
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_DATABASE=cellyn_bot

# API Keys
DIGIFLAZZ_USERNAME=your_username
DIGIFLAZZ_API_KEY=your_key
OPENAI_API_KEY=your_key
```

---

## Plugin System

Plugins live in `src/plugins/[category]/[name].js`. Each plugin exports a default object:

```js
export default {
    name: "ping",
    description: "Check bot latency",
    command: ["ping"],
    category: "tools",
    permissions: "all",
    cooldown: 3,
    react: true,

    execute: async (m) => {
        await m.reply(`Pong! ${Date.now()}ms`);
    },
};
```

**Available properties**

| Property | Type | Description |
|---|---|---|
| `command` | `string[]` | Command triggers |
| `permissions` | `string` | `all` / `admin` / `owner` |
| `cooldown` | `number` | Seconds between uses |
| `group` | `boolean` | Group-only |
| `private` | `boolean` | Private chat only |
| `owner` | `boolean` | Owner-only |
| `botAdmin` | `boolean` | Requires bot admin |
| `react` | `boolean` | Auto-react on execute |
| `wait` | `string\|null` | Message shown before executing |
| `dailyLimit` | `number` | Max uses per day |

---

## Project Structure

```
cellyn-whatsapp-bot/
├── src/
│   ├── config/              # Static bot configuration
│   ├── core/
│   │   ├── connect.js       # Baileys connection handler
│   │   └── message.js       # Incoming message processor
│   ├── lib/
│   │   ├── database/        # DB drivers (MongoDB, MySQL, Local)
│   │   │   ├── drivers/
│   │   │   └── models/      # User, Group, Settings, Session
│   │   ├── schema/          # Data validation schemas
│   │   └── serialize.js     # Message serializer
│   ├── plugins/
│   │   ├── ai/              # AI / ChatGPT
│   │   ├── convert/         # Sticker, audio, video converter
│   │   ├── digi/            # PPOB — Digiflazz
│   │   ├── downloader/      # TikTok, IG, YouTube, Spotify, etc.
│   │   ├── group/           # Group management
│   │   ├── info/            # Help, menu, ping
│   │   ├── owner/           # Owner-only tools
│   │   └── tools/           # Miscellaneous utilities
│   └── utils/               # API helpers, converters
├── assets/                  # Static assets (preview video, etc.)
├── .env.example
├── ecosystem.config.cjs
└── package.json
```

---

## License

MIT — see [LICENSE](./LICENSE) for details.

> Removing copyright notices or claiming original authorship is not permitted.

---

<div align="center">

Maintained by [Liwirya](https://github.com/liwirya)

<br>

[![Footer](https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,20,30&height=120&section=footer&text=Thank+You!&fontSize=38&fontColor=ffffff&animation=twinkling&fontAlignY=75)](https://github.com/liwirya/cellyn-whatsapp-bot)

</div>
