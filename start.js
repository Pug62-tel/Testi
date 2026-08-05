const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs');

// ===================== تنظیمات اولیه =====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN not set!');
    process.exit(1);
}

if (!ADMIN_ID) {
    console.error('❌ ADMIN_ID not set!');
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
        console.error('❌ خطا در خواندن فایل:', error);
    }
    return { groups: {}, messages: [], messenger: null };
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('❌ خطا در ذخیره فایل:', error);
    }
}

let data = loadData();
if (!data.groups) data.groups = {};
if (!data.messages) data.messages = [];
if (!data.messenger) data.messenger = null;

// ===================== وضعیت‌های کاربر =====================
const userStates = {};
let messageCounter = 0;

function generateId() {
    messageCounter++;
    return `msg_${Date.now()}_${messageCounter}`;
}

function isAdmin(userId) {
    return String(userId) === String(ADMIN_ID);
}

// ===================== تابع ارسال پیام به گروه =====================
async function sendMessageToGroup(chatId, text, keyboard) {
    try {
        if (keyboard) {
            return await bot.telegram.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } else {
            return await bot.telegram.sendMessage(chatId, text, {
                parse_mode: 'Markdown'
            });
        }
    } catch (error) {
        console.error('❌ خطا در ارسال پیام:', error);
        return null;
    }
}

// ===================== دستور /start =====================
bot.command('start', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const userId = ctx.from.id;
    const chatTitle = ctx.chat.title || 'گروه بدون نام';

    // ثبت گروه
    if (!data.groups[chatId]) {
        data.groups[chatId] = {
            chatId: chatId,
            chatTitle: chatTitle,
            chatType: ctx.chat.type,
            isActive: true,
            bridgeTo: null,
            createdAt: new Date().toISOString()
        };
        saveData(data);
        console.log(`✅ گروه جدید ثبت شد: ${chatTitle} (${chatId})`);
    }

    // منوی اصلی
    let message = `🤖 **ربات میانجیگر تلگرام**\n\n`;
    message += `📋 **گروه فعلی:** ${chatTitle}\n`;
    
    const group = data.groups[chatId];
    if (group && group.bridgeTo) {
        const targetGroup = data.groups[group.bridgeTo];
        message += `🔗 **متصل به:** ${targetGroup?.chatTitle || 'نامشخص'}\n`;
    } else {
        message += `🔗 **وضعیت:** ❌ بدون اتصال\n`;
    }

    if (data.messenger) {
        message += `👤 **پیام‌رسان:** ${data.messenger.name}\n`;
    }

    message += `\n🔧 **دستورات:**\n`;
    message += `/bridge - اتصال دو گروه\n`;
    message += `/status - وضعیت گروه‌ها\n`;
    message += `/disconnect - قطع اتصال\n`;
    message += `/setmessenger - تعیین پیام‌رسان\n`;
    message += `/removemessenger - لغو پیام‌رسان\n`;
    message += `/logs - تاریخچه پیام‌ها\n`;
    message += `/clear - پاک کردن تاریخچه\n`;

    // دکمه‌های شیشه‌ای
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔗 اتصال گروه‌ها', 'bridge_btn')],
        [Markup.button.callback('📊 وضعیت', 'status_btn')],
        [Markup.button.callback('👤 مدیریت پیام‌رسان', 'messenger_btn')],
        [Markup.button.callback('📜 تاریخچه', 'logs_btn')]
    ]);

    await ctx.reply(message, { 
        parse_mode: 'Markdown',
        ...keyboard 
    });
});

// ===================== دکمه‌ها =====================
bot.action('bridge_btn', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
    }
    await ctx.reply('🔗 از دستور /bridge استفاده کنید.');
});

bot.action('status_btn', async (ctx) => {
    await ctx.reply('📊 از دستور /status استفاده کنید.');
});

bot.action('messenger_btn', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
    }
    await ctx.reply('👤 از دستور /setmessenger استفاده کنید.');
});

bot.action('logs_btn', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
    }
    await ctx.reply('📜 از دستور /logs استفاده کنید.');
});

// ===================== دستور /bridge =====================
bot.command('bridge', async (ctx) => {
    const userId = ctx.from.id;

    if (!isAdmin(userId)) {
        return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
    }

    const groups = Object.values(data.groups).filter(g => g.isActive);

    if (groups.length < 2) {
        return ctx.reply('❌ حداقل به ۲ گروه نیاز است!\nربات را به گروه‌های بیشتری اضافه کنید.');
    }

    userStates[userId] = { step: 'bridge_step1' };

    let message = '🔗 **اتصال دو گروه**\n\n';
    message += '📌 **گروه اول** را انتخاب کنید:\n\n';
    groups.forEach((g, index) => {
        message += `${index + 1}. ${g.chatTitle} (${g.chatId})\n`;
    });
    message += '\nشماره گروه را وارد کنید:';

    await ctx.reply(message, { parse_mode: 'Markdown' });
});

// ===================== دریافت متن برای bridge =====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    // ===== مرحله 1: انتخاب گروه اول =====
    if (userStates[userId]?.step === 'bridge_step1') {
        const groups = Object.values(data.groups).filter(g => g.isActive);
        const index = parseInt(text) - 1;

        if (isNaN(index) || index < 0 || index >= groups.length) {
            return ctx.reply(`❌ لطفاً عددی بین 1 تا ${groups.length} وارد کنید.`);
        }

        userStates[userId].firstGroup = groups[index].chatId;
        userStates[userId].step = 'bridge_step2';

        let message = '📌 **گروه دوم** را انتخاب کنید:\n\n';
        groups.forEach((g, i) => {
            if (g.chatId !== userStates[userId].firstGroup) {
                message += `${i + 1}. ${g.chatTitle} (${g.chatId})\n`;
            }
        });
        message += '\nشماره گروه را وارد کنید:';

        return ctx.reply(message, { parse_mode: 'Markdown' });
    }

    // ===== مرحله 2: انتخاب گروه دوم =====
    if (userStates[userId]?.step === 'bridge_step2') {
        const groups = Object.values(data.groups).filter(g => g.isActive);
        const index = parseInt(text) - 1;

        if (isNaN(index) || index < 0 || index >= groups.length) {
            return ctx.reply(`❌ لطفاً عددی بین 1 تا ${groups.length} وارد کنید.`);
        }

        const secondGroup = groups[index];
        const firstGroupId = userStates[userId].firstGroup;

        if (secondGroup.chatId === firstGroupId) {
            return ctx.reply('❌ نمی‌توانید یک گروه را دو بار انتخاب کنید!');
        }

        // برقراری اتصال
        data.groups[firstGroupId].bridgeTo = secondGroup.chatId;
        data.groups[secondGroup.chatId].bridgeTo = firstGroupId;
        saveData(data);

        const firstGroup = data.groups[firstGroupId];
        await ctx.reply(
            `✅ **اتصال برقرار شد!**\n\n` +
            `🔹 ${firstGroup.chatTitle} ↔️ 🔹 ${secondGroup.chatTitle}\n\n` +
            `📝 حالا پیام‌ها بین دو گروه رد و بدل میشوند.`,
            { parse_mode: 'Markdown' }
        );

        delete userStates[userId];
        return;
    }

    // ===== دستور /setmessenger =====
    if (userStates[userId]?.step === 'messenger_step') {
        const groups = Object.values(data.groups).filter(g => g.isActive);
        const index = parseInt(text) - 1;

        if (isNaN(index) || index < 0 || index >= groups.length) {
            return ctx.reply(`❌ لطفاً عددی بین 1 تا ${groups.length} وارد کنید.`);
        }

        const selectedGroup = groups[index];
        userStates[userId].messengerGroup = selectedGroup.chatId;
        userStates[userId].step = 'messenger_user';

        await ctx.reply(
            `✅ گروه "${selectedGroup.chatTitle}" انتخاب شد!\n\n` +
            `👤 حالا در گروه به فرد مورد نظر **ریپلای** کنید و بنویسید:\n` +
            `\`پیام رسان\``,
            { parse_mode: 'Markdown' }
        );

        return;
    }
});

// ===================== دستور /status =====================
bot.command('status', async (ctx) => {
    const groups = Object.values(data.groups).filter(g => g.isActive);

    if (groups.length === 0) {
        return ctx.reply('📭 هیچ گروهی ثبت نشده!');
    }

    let message = '📊 **وضعیت گروه‌ها**\n\n';
    groups.forEach(g => {
        message += `🔹 ${g.chatTitle}\n`;
        message += `   آیدی: ${g.chatId}\n`;
        message += `   وضعیت: ${g.bridgeTo ? '✅ متصل' : '❌ بدون اتصال'}\n`;
        if (g.bridgeTo) {
            const target = data.groups[g.bridgeTo];
            message += `   متصل به: ${target?.chatTitle || 'نامشخص'}\n`;
        }
        message += '\n';
    });

    if (data.messenger) {
        message += `👤 **پیام‌رسان فعلی:** ${data.messenger.name}\n`;
        message += `🆔 آیدی: ${data.messenger.userId}\n`;
        message += `📌 گروه: ${data.messenger.groupTitle || 'نامشخص'}\n`;
    } else {
        message += `👤 **پیام‌رسان:** تعیین نشده\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
});

// ===================== دستور /setmessenger =====================
bot.command('setmessenger', async (ctx) => {
    const userId = ctx.from.id;

    if (!isAdmin(userId)) {
        return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
    }

    const groups = Object.values(data.groups).filter(g => g.isActive);

    if (groups.length === 0) {
        return ctx.reply('❌ هیچ گروهی ثبت نشده!');
    }

    userStates[userId] = { step: 'messenger_step' };

    let message = '👤 **تعیین پیام‌رسان**\n\n';
    message += 'گروه مورد نظر را انتخاب کنید:\n\n';
    groups.forEach((g, index) => {
        message += `${index + 1}. ${g.chatTitle}\n`;
    });
    message += '\nشماره گروه را وارد کنید:';

    await ctx.reply(message, { parse_mode: 'Markdown' });
});

// ===================== دستور /removemessenger =====================
bot.command('removemessenger', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
    }

    if (!data.messenger) {
        return ctx.reply('❌ هیچ پیام‌رسانی تعیین نشده!');
    }

    const messengerName = data.messenger.name;
    data.messenger = null;
    saveData(data);

    await ctx.reply(`✅ پیام‌رسان (${messengerName}) لغو شد!\n🔓 همه میتوانند پیام بفرستند.`);
});

// ===================== دستور /disconnect =====================
bot.command('disconnect', async (ctx) => {
    const userId = ctx.from.id;

    if (!isAdmin(userId)) {
        return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
    }

    const groups = Object.values(data.groups).filter(g => g.isActive && g.bridgeTo);

    if (groups.length === 0) {
        return ctx.reply('❌ هیچ گروه متصلی وجود ندارد!');
    }

    let message = '🔌 **قطع اتصال**\n\nگروه مورد نظر را انتخاب کنید:\n\n';
    groups.forEach((g, index) => {
        message += `${index + 1}. ${g.chatTitle} (${g.chatId})\n`;
    });
    message += '\nشماره گروه را وارد کنید:';

    await ctx.reply(message, { parse_mode: 'Markdown' });

    userStates[userId] = { step: 'disconnect_step' };
});

// ===================== دریافت متن برای disconnect =====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (userStates[userId]?.step === 'disconnect_step') {
        const groups = Object.values(data.groups).filter(g => g.isActive && g.bridgeTo);
        const index = parseInt(text) - 1;

        if (isNaN(index) || index < 0 || index >= groups.length) {
            return ctx.reply(`❌ لطفاً عددی بین 1 تا ${groups.length} وارد کنید.`);
        }

        const selectedGroup = groups[index];
        const connectedId = selectedGroup.bridgeTo;

        data.groups[selectedGroup.chatId].bridgeTo = null;
        if (data.groups[connectedId]) {
            data.groups[connectedId].bridgeTo = null;
        }
        saveData(data);

        await ctx.reply(
            `✅ **اتصال قطع شد!**\n\n` +
            `🔹 ${selectedGroup.chatTitle} از اتصال خارج شد.`,
            { parse_mode: 'Markdown' }
        );

        delete userStates[userId];
    }
});

// ===================== دستور /logs =====================
bot.command('logs', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
    }

    const logs = data.messages.slice(-20).reverse();

    if (logs.length === 0) {
        return ctx.reply('📭 هیچ پیامی ثبت نشده!');
    }

    let message = '📜 **تاریخچه پیام‌ها (۲۰ مورد آخر)**\n\n';
    logs.forEach((msg, index) => {
        message += `${index + 1}. 📩 **از:** ${msg.fromUser}\n`;
        message += `   📌 **گروه مبدا:** ${msg.fromGroup}\n`;
        message += `   📌 **گروه مقصد:** ${msg.toGroup}\n`;
        message += `   📝 **متن:** ${msg.text.substring(0, 30)}${msg.text.length > 30 ? '...' : ''}\n`;
        message += `   👁️ **دیده شد:** ${msg.seen ? '✅' : '❌'}\n`;
        message += `   ✍️ **پاسخ:** ${msg.replied ? '✅' : '❌'}\n`;
        message += `   🕐 **زمان:** ${new Date(msg.createdAt).toLocaleString('fa-IR')}\n\n`;
    });

    await ctx.reply(message, { parse_mode: 'Markdown' });
});

// ===================== دستور /clear =====================
bot.command('clear', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
    }

    data.messages = [];
    saveData(data);
    await ctx.reply('🗑️ تاریخچه پیام‌ها پاک شد!');
});

// ===================== دریافت پیام‌های گروه =====================
bot.on('text', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const userId = ctx.from.id;
    const messageText = ctx.message.text;
    const messageId = ctx.message.message_id;

    // اگر دستور بود نادیده بگیر
    if (messageText.startsWith('/')) return;

    // بررسی اینکه کاربر در حالت خاصی نیست
    if (userStates[userId]) return;

    // پیدا کردن گروه
    const group = data.groups[chatId];
    if (!group || !group.bridgeTo) return;

    // بررسی مجوز ارسال
    const canSend = isAdmin(userId) || (data.messenger && String(data.messenger.userId) === String(userId));

    if (!canSend) {
        const messengerName = data.messenger?.name || 'مدیر';
        return ctx.reply(
            `❌ **شما مجاز به ارسال پیام نیستید!**\n\n` +
            `🔒 فقط **${messengerName}** میتواند پیام بفرستد.`,
            { parse_mode: 'Markdown' }
        );
    }

    // ارسال به گروه مقصد
    const targetGroup = data.groups[group.bridgeTo];
    if (!targetGroup) return;

    const msgId = generateId();

    // ذخیره در تاریخچه
    const messageRecord = {
        id: msgId,
        fromUser: ctx.from.first_name || 'کاربر',
        fromUserId: userId,
        fromGroup: group.chatTitle,
        toGroup: targetGroup.chatTitle,
        text: messageText,
        seen: false,
        replied: false,
        createdAt: new Date().toISOString()
    };
    data.messages.push(messageRecord);
    saveData(data);

    try {
        const sentMessage = await bot.telegram.sendMessage(
            targetGroup.chatId,
            `📩 **پیام جدید از ${group.chatTitle}**\n\n` +
            `👤 **فرستنده:** ${ctx.from.first_name}\n` +
            `📝 **متن:**\n${messageText}`,
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

        messageRecord.bridgeChatId = targetGroup.chatId;
        messageRecord.bridgeMessageId = sentMessage.message_id;
        saveData(data);

        console.log(`✅ پیام ارسال شد: ${messageText} (${msgId})`);

    } catch (error) {
        console.error('❌ خطا در ارسال:', error);
        await ctx.reply('❌ خطا در ارسال پیام به گروه مقصد!');
    }
});

// ===================== دکمه "دیدم" =====================
bot.action(/seen_(.+)/, async (ctx) => {
    const msgId = ctx.match[1];
    const userId = ctx.from.id;

    const message = data.messages.find(m => m.id === msgId);
    if (!message) {
        return ctx.reply('❌ پیام یافت نشد!');
    }

    // فقط کسی که پیام رو دیده میتونه تایید کنه
    const chatId = String(ctx.chat.id);
    if (chatId !== message.bridgeChatId && !isAdmin(userId)) {
        return ctx.reply('❌ شما مجاز به این کار نیستید!');
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
    } catch (e) {
        console.log('❌ نتونست به فرستنده پیام بده');
    }

    await ctx.reply('✅ تایید دید ارسال شد!');
});

// ===================== دکمه "پاسخ" =====================
bot.action(/reply_(.+)/, async (ctx) => {
    const msgId = ctx.match[1];
    const userId = ctx.from.id;

    const message = data.messages.find(m => m.id === msgId);
    if (!message) {
        return ctx.reply('❌ پیام یافت نشد!');
    }

    const chatId = String(ctx.chat.id);
    if (chatId !== message.bridgeChatId && !isAdmin(userId)) {
        return ctx.reply('❌ شما مجاز به پاسخ دادن نیستید!');
    }

    userStates[userId] = {
        step: 'waiting_reply',
        originalChatId: message.fromUserId,
        originalMessageId: message.originalMessageId || message.bridgeMessageId,
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
                state.originalChatId,
                `✍️ **پاسخ از ${ctx.from.first_name}:**\n\n📝 ${text}`,
                {
                    parse_mode: 'Markdown',
                    reply_to_message_id: parseInt(state.originalMessageId)
                }
            );

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

// ===================== تشخیص "پیام رسان" =====================
bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const replyTo = ctx.message.reply_to_message;
    const userId = ctx.from.id;

    // فقط اگر ریپلای داشته باشه و متن دقیقاً "پیام رسان" باشه
    if (replyTo && text.trim() === 'پیام رسان' && isAdmin(userId)) {
        const targetUserId = replyTo.from.id;
        const targetName = replyTo.from.first_name || 'کاربر';

        const chatId = String(ctx.chat.id);
        const group = data.groups[chatId];

        if (!group) {
            return ctx.reply('❌ این گروه در سیستم ثبت نشده!');
        }

        data.messenger = {
            userId: targetUserId,
            name: targetName,
            username: replyTo.from.username || 'بدون یوزرنیم',
            groupId: chatId,
            groupTitle: group.chatTitle,
            setBy: userId,
            setAt: new Date().toISOString()
        };
        saveData(data);

        await ctx.reply(
            `✅ **${targetName}** به عنوان پیام‌رسان تعیین شد!\n` +
            `🔒 فقط ایشان میتوانند در این گروه پیام بفرستند.`,
            { parse_mode: 'Markdown' }
        );

        // اطلاع به فرد انتخاب شده
        try {
            await bot.telegram.sendMessage(
                targetUserId,
                `✅ شما به عنوان **پیام‌رسان** در گروه "${group.chatTitle}" تعیین شدید!\n` +
                `🔒 فقط شما میتوانید در این گروه پیام بفرستید.`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {
            console.log('❌ نتونست به پیام‌رسان پیام بده');
        }
    }
});

// ===================== وب‌سرور =====================
app.get('/', (req, res) => {
    res.send('🤖 Telegram Bridge Bot is running!');
});

app.listen(PORT, () => {
    console.log(`✅ Web server running on port ${PORT}`);
});

// ===================== راه‌اندازی =====================
bot.launch()
    .then(() => {
        console.log('✅ Bridge Bot started successfully!');
        console.log(`👑 Admin ID: ${ADMIN_ID}`);
        console.log('🤖 Use /start to begin');
    })
    .catch(err => {
        console.error('❌ Failed to start bot:', err);
    });

process.once('SIGINT', () => {
    console.log('🛑 Stopping bot...');
    bot.stop('SIGINT');
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 Stopping bot...');
    bot.stop('SIGTERM');
    process.exit(0);
});
