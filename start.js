const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs');

// ===================== تنظیمات =====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = '6732134123'; // آیدی مدیر اصلی

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
    return { groups: {}, messages: [], bridge: null, messenger: null };
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
if (!data.messenger) data.messenger = null;

// ===================== وضعیت‌ها =====================
const userStates = {};
let messageCounter = 0;

function generateId() {
    messageCounter++;
    return `msg_${Date.now()}_${messageCounter}`;
}

function isAdmin(userId) {
    return String(userId) === String(ADMIN_ID);
}

// ===================== دکمه‌های شیشه‌ای =====================
function createGlassKeyboard(buttons) {
    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
        const row = [];
        for (let j = i; j < Math.min(i + 2, buttons.length); j++) {
            row.push({
                text: buttons[j].text,
                callback_data: buttons[j].callback_data
            });
        }
        keyboard.push(row);
    }
    return Markup.inlineKeyboard(keyboard);
}

// ===================== دکمه‌های اصلی =====================
const mainButtons = [
    { text: '🔗 اتصال گروه‌ها', callback_data: 'bridge_start' },
    { text: '📊 وضعیت', callback_data: 'status' },
    { text: '👤 پیام‌رسان', callback_data: 'messenger_menu' },
    { text: '📜 تاریخچه', callback_data: 'logs' },
    { text: '🔌 قطع اتصال', callback_data: 'disconnect' },
    { text: '❌ حذف پیام‌رسان', callback_data: 'remove_messenger' }
];

// ===================== خوش‌آمدگویی =====================
bot.start(async (ctx) => {
    const chatId = String(ctx.chat.id);
    const chatTitle = ctx.chat.title || 'گروه بدون نام';

    if (!data.groups[chatId]) {
        data.groups[chatId] = {
            chatId: chatId,
            chatTitle: chatTitle,
            createdAt: new Date().toISOString()
        };
        saveData(data);
        console.log(`✅ گروه ثبت شد: ${chatTitle}`);
    }

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

    const messenger = data.messenger;
    let messengerText = '❌ تعیین نشده';
    if (messenger) {
        messengerText = `✅ ${messenger.name}`;
    }

    await ctx.reply(
        `✨ **ربات میانجیگر پیشرفته** ✨\n\n` +
        `📌 **گروه:** ${chatTitle}\n` +
        `🔗 **وضعیت:** ${status}${connectedGroup ? ` (به ${connectedGroup})` : ''}\n` +
        `👤 **پیام‌رسان:** ${messengerText}\n\n` +
        `📝 **راهنما:**\n` +
        `• برای اتصال: \`اتصال به [اسم گروه]\`\n` +
        `• برای تعیین پیام‌رسان: ریپلای به فرد + \`پیام رسان\`\n` +
        `• برای قطع اتصال: \`قطع اتصال\``,
        {
            parse_mode: 'Markdown',
            ...createGlassKeyboard(mainButtons)
        }
    );
});

// ===================== دکمه‌های شیشه‌ای =====================
bot.action('bridge_start', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
    }

    const groups = Object.values(data.groups);
    if (groups.length < 2) {
        return ctx.reply('❌ حداقل به ۲ گروه نیاز است!');
    }

    let message = '🔗 **اتصال دو گروه**\n\n';
    message += '📌 **گروه اول** را انتخاب کنید:\n\n';
    groups.forEach((g, index) => {
        message += `${index + 1}. ${g.chatTitle}\n`;
    });
    message += '\nشماره گروه را وارد کنید:';

    userStates[ctx.from.id] = { step: 'bridge_step1' };
    await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.action('status', async (ctx) => {
    const bridge = data.bridge;
    let message = '📊 **وضعیت سیستم**\n\n';

    if (!bridge) {
        message += '❌ هیچ اتصالی برقرار نیست!\n';
    } else {
        const group1 = data.groups[bridge.group1];
        const group2 = data.groups[bridge.group2];
        message += `✅ **اتصال فعال:**\n`;
        message += `🔹 ${group1?.chatTitle || 'نامشخص'}\n`;
        message += `🔹 ${group2?.chatTitle || 'نامشخص'}\n\n`;
        
        const lastMessages = data.messages.slice(-5).reverse();
        if (lastMessages.length > 0) {
            message += `📜 **۵ پیام آخر:**\n`;
            lastMessages.forEach(msg => {
                message += `• ${msg.fromGroup} → ${msg.toGroup}: ${msg.text.substring(0, 30)}${msg.text.length > 30 ? '...' : ''}\n`;
            });
        }
    }

    const messenger = data.messenger;
    if (messenger) {
        message += `\n👤 **پیام‌رسان:** ${messenger.name}`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.action('messenger_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
    }

    const groups = Object.values(data.groups);
    if (groups.length === 0) {
        return ctx.reply('❌ هیچ گروهی ثبت نشده!');
    }

    let message = '👤 **مدیریت پیام‌رسان**\n\n';
    message += '📌 گروه مورد نظر را انتخاب کنید:\n\n';
    groups.forEach((g, index) => {
        message += `${index + 1}. ${g.chatTitle}\n`;
    });
    message += '\nشماره گروه را وارد کنید:';

    userStates[ctx.from.id] = { step: 'messenger_step' };
    await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.action('logs', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
    }

    const logs = data.messages.slice(-20).reverse();
    if (logs.length === 0) {
        return ctx.reply('📭 هیچ پیامی ثبت نشده!');
    }

    let message = '📜 **تاریخچه پیام‌ها**\n\n';
    logs.forEach((msg, index) => {
        message += `${index + 1}. 📩 **${msg.fromUser}**\n`;
        message += `   📌 ${msg.fromGroup} → ${msg.toGroup}\n`;
        message += `   📝 ${msg.text.substring(0, 40)}${msg.text.length > 40 ? '...' : ''}\n`;
        message += `   👁️ ${msg.seen ? '✅ دیده شد' : '❌ دیده نشده'}\n`;
        message += `   ✍️ ${msg.replied ? '✅ پاسخ داده شد' : '❌ بدون پاسخ'}\n\n`;
    });

    await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.action('disconnect', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
    }

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
});

bot.action('remove_messenger', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
    }

    if (!data.messenger) {
        return ctx.reply('❌ هیچ پیام‌رسانی تعیین نشده!');
    }

    const messengerName = data.messenger.name;
    data.messenger = null;
    saveData(data);

    await ctx.reply(`✅ پیام‌رسان (${messengerName}) حذف شد!`);
});

// ===================== دریافت متن‌ها =====================
bot.on('text', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const messageId = ctx.message.message_id;
    const replyTo = ctx.message.reply_to_message;

    // ========== مدیریت مرحله‌ای ==========
    if (userStates[userId]) {
        // مرحله 1: اتصال گروه اول
        if (userStates[userId].step === 'bridge_step1') {
            if (!isAdmin(userId)) {
                delete userStates[userId];
                return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
            }

            const groups = Object.values(data.groups);
            const index = parseInt(text) - 1;
            if (isNaN(index) || index < 0 || index >= groups.length) {
                return ctx.reply(`❌ عددی بین 1 تا ${groups.length} وارد کنید!`);
            }
            userStates[userId].firstGroup = groups[index].chatId;
            userStates[userId].step = 'bridge_step2';

            let message = '📌 **گروه دوم** را انتخاب کنید:\n\n';
            groups.forEach((g, i) => {
                if (g.chatId !== userStates[userId].firstGroup) {
                    message += `${i + 1}. ${g.chatTitle}\n`;
                }
            });
            message += '\nشماره گروه را وارد کنید:';
            return ctx.reply(message, { parse_mode: 'Markdown' });
        }

        // مرحله 2: اتصال گروه دوم
        if (userStates[userId].step === 'bridge_step2') {
            if (!isAdmin(userId)) {
                delete userStates[userId];
                return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
            }

            const groups = Object.values(data.groups);
            const index = parseInt(text) - 1;
            if (isNaN(index) || index < 0 || index >= groups.length) {
                return ctx.reply(`❌ عددی بین 1 تا ${groups.length} وارد کنید!`);
            }
            const secondGroup = groups[index];
            if (secondGroup.chatId === userStates[userId].firstGroup) {
                return ctx.reply('❌ نمی‌توانید یک گروه را دو بار انتخاب کنید!');
            }

            data.bridge = {
                group1: userStates[userId].firstGroup,
                group2: secondGroup.chatId
            };
            saveData(data);

            const group1 = data.groups[userStates[userId].firstGroup];
            await ctx.reply(
                `✅ **اتصال برقرار شد!**\n\n` +
                `🔹 ${group1.chatTitle} ↔️ 🔹 ${secondGroup.chatTitle}\n\n` +
                `📝 حالا پیام‌ها بین دو گروه رد و بدل میشوند.`,
                { parse_mode: 'Markdown' }
            );
            delete userStates[userId];
            return;
        }

        // مرحله: انتخاب گروه برای پیام‌رسان
        if (userStates[userId].step === 'messenger_step') {
            if (!isAdmin(userId)) {
                delete userStates[userId];
                return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
            }

            const groups = Object.values(data.groups);
            const index = parseInt(text) - 1;
            if (isNaN(index) || index < 0 || index >= groups.length) {
                return ctx.reply(`❌ عددی بین 1 تا ${groups.length} وارد کنید!`);
            }
            userStates[userId].messengerGroup = groups[index].chatId;
            userStates[userId].step = 'messenger_user';

            await ctx.reply(
                `✅ گروه "${groups[index].chatTitle}" انتخاب شد!\n\n` +
                `👤 حالا در گروه به فرد مورد نظر **ریپلای** کنید و بنویسید:\n` +
                `\`پیام رسان\``,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // مرحله: پاسخ به پیام
        if (userStates[userId].step === 'waiting_reply') {
            const state = userStates[userId];
            try {
                // ارسال پاسخ به **گروه مبدا** (نه پیوی)
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
            return;
        }

        // مرحله: فوروارد
        if (userStates[userId].step === 'waiting_forward') {
            const state = userStates[userId];
            try {
                await bot.telegram.sendMessage(
                    state.originalChatId,
                    `🔁 **فوروارد از ${ctx.from.first_name}:**\n\n📝 ${text}`,
                    {
                        parse_mode: 'Markdown',
                        reply_to_message_id: parseInt(state.originalMessageId)
                    }
                );
                await ctx.reply('✅ فوروارد ارسال شد!');
                delete userStates[userId];
            } catch (error) {
                console.error('❌ خطا:', error);
                ctx.reply('❌ خطا در فوروارد!');
            }
            return;
        }
    }

    // ========== تشخیص "پیام رسان" در ریپلای (فقط مدیر) ==========
    if (replyTo && text.trim() === 'پیام رسان' && isAdmin(userId)) {
        const targetUserId = replyTo.from.id;
        const targetName = replyTo.from.first_name || 'کاربر';
        const group = data.groups[chatId];

        if (!group) {
            return ctx.reply('❌ این گروه ثبت نشده!');
        }

        data.messenger = {
            userId: targetUserId,
            name: targetName,
            username: replyTo.from.username || 'بدون یوزرنیم',
            groupId: chatId,
            groupTitle: group.chatTitle,
            setAt: new Date().toISOString()
        };
        saveData(data);

        // اطلاع در خود گروه
        await ctx.reply(
            `✅ **${targetName}** به عنوان پیام‌رسان تعیین شد!\n\n` +
            `🔒 فقط ایشان میتوانند در گروه "${group.chatTitle}" پیام بفرستند.\n` +
            `🔓 برای لغو: ریپلای به ایشان + \`لغو پیام رسان\``,
            { parse_mode: 'Markdown' }
        );

        // اطلاع به فرد انتخاب شده (در پیوی)
        try {
            await bot.telegram.sendMessage(
                targetUserId,
                `✅ شما به عنوان **پیام‌رسان** در گروه "${group.chatTitle}" تعیین شدید!\n🔒 فقط شما میتوانید پیام بفرستید.`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {}
        return;
    }

    // ========== تشخیص "لغو پیام رسان" در ریپلای (فقط مدیر) ==========
    if (replyTo && text.trim() === 'لغو پیام رسان' && isAdmin(userId)) {
        if (!data.messenger) {
            return ctx.reply('❌ هیچ پیام‌رسانی تعیین نشده!');
        }
        const messengerName = data.messenger.name;
        data.messenger = null;
        saveData(data);
        await ctx.reply(`✅ پیام‌رسان (${messengerName}) لغو شد!`);
        return;
    }

    // ========== اتصال با متن (فقط مدیر) ==========
    if (text.startsWith('اتصال به ') && isAdmin(userId)) {
        const targetTitle = text.replace('اتصال به ', '').trim();
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

        data.bridge = {
            group1: chatId,
            group2: targetGroup.chatId
        };
        saveData(data);

        await ctx.reply(
            `✅ **اتصال برقرار شد!**\n\n` +
            `🔹 ${data.groups[chatId].chatTitle} ↔️ 🔹 ${targetGroup.chatTitle}\n\n` +
            `📝 حالا هر پیامی رد و بدل میشود.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ========== قطع اتصال (فقط مدیر) ==========
    if (text === 'قطع اتصال' && isAdmin(userId)) {
        if (!data.bridge) return ctx.reply('❌ هیچ اتصالی وجود ندارد!');
        const bridge = data.bridge;
        const group1 = data.groups[bridge.group1];
        const group2 = data.groups[bridge.group2];
        data.bridge = null;
        saveData(data);
        await ctx.reply(`🔌 اتصال ${group1?.chatTitle} ↔️ ${group2?.chatTitle} قطع شد!`);
        return;
    }

    // ========== وضعیت ==========
    if (text === 'وضعیت') {
        const bridge = data.bridge;
        let message = '📊 **وضعیت سیستم**\n\n';
        if (!bridge) {
            message += '❌ هیچ اتصالی برقرار نیست!';
        } else {
            const group1 = data.groups[bridge.group1];
            const group2 = data.groups[bridge.group2];
            message += `✅ **اتصال فعال:**\n🔹 ${group1?.chatTitle}\n🔹 ${group2?.chatTitle}\n\n`;
            const lastMessages = data.messages.slice(-3).reverse();
            if (lastMessages.length > 0) {
                message += `📜 **۳ پیام آخر:**\n`;
                lastMessages.forEach(msg => {
                    message += `• ${msg.fromGroup} → ${msg.toGroup}: ${msg.text.substring(0, 20)}...\n`;
                });
            }
        }
        if (data.messenger) {
            message += `\n👤 **پیام‌رسان:** ${data.messenger.name}`;
        }
        await ctx.reply(message, { parse_mode: 'Markdown' });
        return;
    }

    // ========== ارسال پیام به گروه دیگر ==========
    const bridge = data.bridge;
    if (!bridge) return;

    let targetChatId = null;
    if (bridge.group1 === chatId) targetChatId = bridge.group2;
    else if (bridge.group2 === chatId) targetChatId = bridge.group1;
    else return;

    const fromGroup = data.groups[chatId];
    const toGroup = data.groups[targetChatId];

    // ========== بررسی مجوز ارسال ==========
    const messenger = data.messenger;
    
    // اگر پیام‌رسان تعیین شده و کاربر پیام‌رسان نیست و مدیر هم نیست
    if (messenger && String(messenger.userId) !== String(userId) && !isAdmin(userId)) {
        return ctx.reply(
            `❌ **شما مجاز به ارسال پیام نیستید!**\n\n` +
            `🔒 فقط **${messenger.name}** میتواند پیام بفرستد.`,
            { parse_mode: 'Markdown' }
        );
    }

    // ========== ذخیره و ارسال ==========
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

    try {
        // دکمه‌های شیشه‌ای برای پیام
        const messageButtons = [
            { text: '👁️ دیدم', callback_data: `seen_${msgId}` },
            { text: '✍️ پاسخ', callback_data: `reply_${msgId}` },
            { text: '❤️ لایک', callback_data: `like_${msgId}` },
            { text: '🔁 فوروارد', callback_data: `forward_${msgId}` }
        ];

        // ارسال به گروه مقصد با دکمه‌ها
        await bot.telegram.sendMessage(
            targetChatId,
            `📩 **پیام جدید از ${fromGroup.chatTitle}**\n\n` +
            `👤 **${ctx.from.first_name}**\n` +
            `📝 ${text}\n\n` +
            `🕐 ${new Date().toLocaleTimeString('fa-IR')}`,
            {
                parse_mode: 'Markdown',
                ...createGlassKeyboard(messageButtons)
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
    if (!message) return ctx.reply('❌ پیام یافت نشد!');

    message.seen = true;
    saveData(data);

    // ارسال تایید دید به **گروه مبدا**
    try {
        await bot.telegram.sendMessage(
            message.fromUserId,
            `👁️ **${ctx.from.first_name}** پیام شما را دید:\n\n"${message.text}"`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        // اگر نتونست به پیوی بفرسته، توی گروه بفرسته
        try {
            const bridge = data.bridge;
            if (bridge) {
                const targetChat = bridge.group1 === message.fromUserId ? bridge.group2 : bridge.group1;
                await bot.telegram.sendMessage(
                    targetChat,
                    `👁️ **${ctx.from.first_name}** پیام را دید:\n\n"${message.text}"`,
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (e2) {}
    }

    await ctx.reply('✅ تایید دید ارسال شد!');
    await ctx.answerCbQuery('✅ تایید شد');
});

// ===================== دکمه "پاسخ" =====================
bot.action(/reply_(.+)/, async (ctx) => {
    const msgId = ctx.match[1];
    const message = data.messages.find(m => m.id === msgId);
    if (!message) return ctx.reply('❌ پیام یافت نشد!');

    // پیدا کردن گروه مبدا برای ارسال پاسخ
    let originalChatId = message.fromUserId;
    
    // اگر کاربر در گروه مقصد است، پیام رو به گروه مبدا بفرست
    const chatId = String(ctx.chat.id);
    const bridge = data.bridge;
    if (bridge) {
        if (bridge.group1 === chatId) {
            originalChatId = bridge.group2;
        } else if (bridge.group2 === chatId) {
            originalChatId = bridge.group1;
        }
    }

    userStates[ctx.from.id] = {
        step: 'waiting_reply',
        originalChatId: originalChatId,
        originalMessageId: message.originalMessageId || message.bridgeMessageId,
        msgId: msgId
    };

    await ctx.reply(
        `✍️ **پاسخ به پیام:**\n\n` +
        `"${message.text}"\n\n` +
        `📝 پیام خود را بنویسید:`,
        { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery('✍️ پاسخ را بنویسید');
});

// ===================== دکمه "لایک" =====================
bot.action(/like_(.+)/, async (ctx) => {
    const msgId = ctx.match[1];
    const message = data.messages.find(m => m.id === msgId);
    if (!message) return ctx.reply('❌ پیام یافت نشد!');

    // ارسال لایک به گروه مبدا
    try {
        const bridge = data.bridge;
        if (bridge) {
            const targetChat = bridge.group1 === String(ctx.chat.id) ? bridge.group2 : bridge.group1;
            await bot.telegram.sendMessage(
                targetChat,
                `❤️ **${ctx.from.first_name}** به پیام شما لایک داد:\n\n"${message.text}"`,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (e) {}

    await ctx.reply('❤️ لایک شما ارسال شد!');
    await ctx.answerCbQuery('❤️ لایک شد');
});

// ===================== دکمه "فوروارد" =====================
bot.action(/forward_(.+)/, async (ctx) => {
    const msgId = ctx.match[1];
    const message = data.messages.find(m => m.id === msgId);
    if (!message) return ctx.reply('❌ پیام یافت نشد!');

    // پیدا کردن گروه مبدا
    let originalChatId = message.fromUserId;
    const chatId = String(ctx.chat.id);
    const bridge = data.bridge;
    if (bridge) {
        if (bridge.group1 === chatId) {
            originalChatId = bridge.group2;
        } else if (bridge.group2 === chatId) {
            originalChatId = bridge.group1;
        }
    }

    userStates[ctx.from.id] = {
        step: 'waiting_forward',
        originalChatId: originalChatId,
        originalMessageId: message.originalMessageId || message.bridgeMessageId,
        msgId: msgId
    };

    await ctx.reply(
        `🔁 **فوروارد پیام:**\n\n` +
        `"${message.text}"\n\n` +
        `📝 پیام خود را برای فوروارد بنویسید:`,
        { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery('🔁 پیام را بنویسید');
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
        console.log(`👑 Admin ID: ${ADMIN_ID}`);
        console.log('📝 برای اتصال: "اتصال به [اسم گروه]"');
        console.log('👤 برای پیام‌رسان: ریپلای + "پیام رسان"');
    })
    .catch(err => console.error('❌ Failed:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
