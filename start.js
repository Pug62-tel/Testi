const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs');

// ===================== تنظیمات =====================
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN not set!');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

// ===================== دیتابیس JSON =====================
const DATA_FILE = 'data.json';

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('❌ خطا:', error);
    }
    return { groups: {}, messages: [], bridge: null };
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('❌ خطا:', error);
    }
}

let data = loadData();
if (!data.groups) data.groups = {};
if (!data.messages) data.messages = [];
if (!data.bridge) data.bridge = null;

// ===================== وضعیت‌ها =====================
const userStates = {};
let messageCounter = 0;

function generateId() {
    messageCounter++;
    return `msg_${Date.now()}_${messageCounter}`;
}

// ===================== خوش‌آمدگویی =====================
bot.start(async (ctx) => {
    const chatId = String(ctx.chat.id);
    const chatTitle = ctx.chat.title || 'گروه بدون نام';

    // ثبت گروه
    if (!data.groups[chatId]) {
        data.groups[chatId] = {
            chatId: chatId,
            chatTitle: chatTitle,
            createdAt: new Date().toISOString()
        };
        saveData(data);
        console.log(`✅ گروه ثبت شد: ${chatTitle}`);
    }

    // اگر قبلاً گروهی به عنوان پل ثبت شده
    const bridge = data.bridge;
    let status = '❌ بدون اتصال';
    let connectedGroup = '';

    if (bridge) {
        if (bridge.group1 === chatId) {
            status = '✅ متصل';
            connectedGroup = data.groups[bridge.group2]?.chatTitle || '';
        } else if (bridge.group2 === chatId) {
            status = '✅ متصل';
            connectedGroup = data.groups[bridge.group1]?.chatTitle || '';
        }
    }

    await ctx.reply(
        `🤖 **ربات میانجیگر**\n\n` +
        `📌 **گروه:** ${chatTitle}\n` +
        `🔗 **وضعیت:** ${status}${connectedGroup ? ` (به ${connectedGroup})` : ''}\n\n` +
        `📝 برای اتصال دو گروه، توی یکی از گروه‌ها بنویسید:\n` +
        `\`اتصال به [اسم گروه]\`\n\n` +
        `مثال: \`اتصال به گروه تست\``,
        { parse_mode: 'Markdown' }
    );
});

// ===================== دریافت پیام‌ها =====================
bot.on('text', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const messageId = ctx.message.message_id;

    // ========== مدیریت اتصال ==========
    if (text.startsWith('اتصال به ')) {
        const targetTitle = text.replace('اتصال به ', '').trim();
        
        // پیدا کردن گروه هدف
        let targetGroup = null;
        for (const key in data.groups) {
            if (data.groups[key].chatTitle === targetTitle && key !== chatId) {
                targetGroup = data.groups[key];
                break;
            }
        }

        if (!targetGroup) {
            return ctx.reply(`❌ گروهی با نام "${targetTitle}" پیدا نشد!`);
        }

        // برقراری اتصال
        data.bridge = {
            group1: chatId,
            group2: targetGroup.chatId
        };
        saveData(data);

        await ctx.reply(
            `✅ **اتصال برقرار شد!**\n\n` +
            `🔹 ${data.groups[chatId].chatTitle} ↔️ 🔹 ${targetGroup.chatTitle}\n\n` +
            `📝 حالا هر پیامی در این گروه به گروه دیگر ارسال میشود.`,
            { parse_mode: 'Markdown' }
        );

        // اطلاع به گروه دیگر
        try {
            await bot.telegram.sendMessage(
                targetGroup.chatId,
                `✅ **اتصال برقرار شد!**\n\n` +
                `🔹 ${data.groups[chatId].chatTitle} ↔️ 🔹 ${targetGroup.chatTitle}\n\n` +
                `📝 حالا هر پیامی در این گروه به گروه دیگر ارسال میشود.`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {
            console.log('❌ نتونست به گروه دیگه پیام بده');
        }

        return;
    }

    // ========== مدیریت قطع اتصال ==========
    if (text === 'قطع اتصال') {
        if (!data.bridge) {
            return ctx.reply('❌ هیچ اتصالی وجود ندارد!');
        }

        const bridge = data.bridge;
        const group1 = data.groups[bridge.group1];
        const group2 = data.groups[bridge.group2];

        data.bridge = null;
        saveData(data);

        await ctx.reply(
            `🔌 **اتصال قطع شد!**\n\n` +
            `🔹 ${group1?.chatTitle || 'نامشخص'} ↔️ 🔹 ${group2?.chatTitle || 'نامشخص'}`,
            { parse_mode: 'Markdown' }
        );

        // اطلاع به گروه دیگر
        try {
            if (bridge.group1 === chatId) {
                await bot.telegram.sendMessage(bridge.group2, '🔌 اتصال قطع شد!');
            } else {
                await bot.telegram.sendMessage(bridge.group1, '🔌 اتصال قطع شد!');
            }
        } catch (e) {}

        return;
    }

    // ========== مدیریت وضعیت ==========
    if (text === 'وضعیت') {
        const bridge = data.bridge;
        let message = '📊 **وضعیت سیستم**\n\n';

        if (!bridge) {
            message += '❌ هیچ اتصالی برقرار نیست!\n';
            message += '📝 برای اتصال بنویسید: `اتصال به [اسم گروه]`';
        } else {
            const group1 = data.groups[bridge.group1];
            const group2 = data.groups[bridge.group2];
            message += `✅ **اتصال فعال:**\n`;
            message += `🔹 ${group1?.chatTitle || 'نامشخص'}\n`;
            message += `🔹 ${group2?.chatTitle || 'نامشخص'}\n\n`;
            
            // چند پیام آخر
            const lastMessages = data.messages.slice(-5).reverse();
            if (lastMessages.length > 0) {
                message += `📜 **۵ پیام آخر:**\n`;
                lastMessages.forEach(msg => {
                    message += `• ${msg.fromGroup} → ${msg.toGroup}: ${msg.text.substring(0, 20)}${msg.text.length > 20 ? '...' : ''}\n`;
                });
            }
        }

        await ctx.reply(message, { parse_mode: 'Markdown' });
        return;
    }

    // ========== ارسال پیام به گروه دیگر ==========
    const bridge = data.bridge;
    if (!bridge) return; // اتصالی وجود ندارد

    // مشخص کردن گروه مقصد
    let targetChatId = null;
    if (bridge.group1 === chatId) {
        targetChatId = bridge.group2;
    } else if (bridge.group2 === chatId) {
        targetChatId = bridge.group1;
    } else {
        return; // این گروه در اتصال نیست
    }

    const fromGroup = data.groups[chatId];
    const toGroup = data.groups[targetChatId];

    if (!toGroup) return;

    // ذخیره پیام
    const msgId = generateId();
    const messageRecord = {
        id: msgId,
        fromUser: ctx.from.first_name || 'کاربر',
        fromUserId: userId,
        fromGroup: fromGroup.chatTitle,
        toGroup: toGroup.chatTitle,
        text: text,
        seen: false,
        replied: false,
        createdAt: new Date().toISOString()
    };
    data.messages.push(messageRecord);
    saveData(data);

    // ارسال به گروه مقصد
    try {
        await bot.telegram.sendMessage(
            targetChatId,
            `📩 **پیام جدید از ${fromGroup.chatTitle}**\n\n` +
            `👤 **${ctx.from.first_name}**\n` +
            `📝 ${text}`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('👁️ دیدم', `seen_${msgId}`),
                        Markup.button.callback('✍️ پاسخ', `reply_${msgId}`)
                    ]
                ])
            }
        );

        console.log(`✅ پیام ارسال شد: ${text}`);

    } catch (error) {
        console.error('❌ خطا:', error);
    }
});

// ===================== دکمه "دیدم" =====================
bot.action(/seen_(.+)/, async (ctx) => {
    const msgId = ctx.match[1];
    const message = data.messages.find(m => m.id === msgId);
    
    if (!message) {
        return ctx.reply('❌ پیام یافت نشد!');
    }

    message.seen = true;
    saveData(data);

    // اطلاع به فرستنده
    try {
        await bot.telegram.sendMessage(
            message.fromUserId,
            `👁️ **${ctx.from.first_name}** پیام شما را دید:\n\n"${message.text}"`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {}

    await ctx.reply('✅ تایید دید ارسال شد!');
});

// ===================== دکمه "پاسخ" =====================
bot.action(/reply_(.+)/, async (ctx) => {
    const msgId = ctx.match[1];
    const message = data.messages.find(m => m.id === msgId);
    
    if (!message) {
        return ctx.reply('❌ پیام یافت نشد!');
    }

    userStates[ctx.from.id] = {
        step: 'waiting_reply',
        targetUserId: message.fromUserId,
        originalMessage: message.text,
        msgId: msgId
    };

    await ctx.reply(
        `✍️ **پاسخ به پیام:**\n\n"${message.text}"\n\n📝 پیام خود را بنویسید:`,
        { parse_mode: 'Markdown' }
    );
});

// ===================== دریافت پاسخ =====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (userStates[userId]?.step === 'waiting_reply') {
        const state = userStates[userId];

        try {
            await bot.telegram.sendMessage(
                state.targetUserId,
                `✍️ **پاسخ از ${ctx.from.first_name}:**\n\n📝 ${text}`,
                { parse_mode: 'Markdown' }
            );

            // بروزرسانی پیام در تاریخچه
            const msg = data.messages.find(m => m.id === state.msgId);
            if (msg) msg.replied = true;
            saveData(data);

            await ctx.reply('✅ پاسخ شما ارسال شد!');
            delete userStates[userId];
        } catch (error) {
            console.error('❌ خطا:', error);
            ctx.reply('❌ خطا در ارسال پاسخ!');
        }
    }
});

// ===================== وب‌سرور =====================
app.get('/', (req, res) => {
    res.send('🤖 Bridge Bot is running!');
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});

// ===================== راه‌اندازی =====================
bot.launch()
    .then(() => {
        console.log('✅ Bridge Bot started!');
        console.log('📝 برای اتصال گروه‌ها بنویسید: "اتصال به [اسم گروه]"');
    })
    .catch(err => console.error('❌ Failed:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
