const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs');

// =============== تنظیمات ===============
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID; // آیدی مدیر اصلی

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN not set!');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

// =============== دیتابیس JSON ===============
const DATA_FILE = 'data.json';

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('❌ خطا در خواندن فایل:', error);
  }
  return { groups: {}, messages: [], messenger: null, chatLogs: {} };
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
if (!data.chatLogs) data.chatLogs = {};

// =============== وضعیت‌های کاربر ===============
const userStates = {};
let messageCounter = 0;

// =============== توابع کمکی ===============
function generateId() {
  messageCounter++;
  return `msg_${Date.now()}_${messageCounter}`;
}

function isAdmin(userId) {
  return String(userId) === String(ADMIN_ID);
}

function canSendMessage(chatId, userId) {
  // اگر مدیر اصلی باشه حتماً میتونه
  if (isAdmin(userId)) return true;
  
  // اگر پیام‌رسان تعیین شده باشه
  if (data.messenger) {
    // فقط پیام‌رسان میتونه پیام بفرسته
    return String(data.messenger.userId) === String(userId);
  }
  
  // اگر پیام‌رسان تعیین نشده، همه میتونن پیام بدن
  return true;
}

// =============== دکمه‌های شیشه‌ای ===============
const glassKeyboard = (buttons) => {
  return Markup.inlineKeyboard(buttons.map(btn => 
    Markup.button.callback(btn.text, btn.callback_data)
  ));
};

// =============== منوی اصلی ===============
bot.start(async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const userId = ctx.from.id;
  
  // ثبت گروه
  if (!data.groups[chatId]) {
    data.groups[chatId] = {
      chatId: chatId,
      chatTitle: ctx.chat.title || 'گروه بدون نام',
      chatType: ctx.chat.type,
      isActive: true,
      bridgeTo: null,
      createdAt: new Date().toISOString()
    };
    saveData(data);
  }
  
  // منوی مدیریت (فقط برای مدیر)
  if (isAdmin(userId)) {
    const groups = Object.values(data.groups).filter(g => g.isActive);
    const groupList = groups.map(g => 
      `🔹 ${g.chatTitle}\n   آیدی: ${g.chatId}\n   وضعیت: ${g.bridgeTo ? '✅ متصل' : '❌ بدون اتصال'}`
    ).join('\n\n');
    
    return ctx.reply(
      `👑 **پنل مدیریت ربات میانجیگر**\n\n` +
      `📋 **لیست گروه‌ها:**\n${groupList || 'هیچ گروهی ثبت نشده!'}\n\n` +
      `📊 **وضعیت پیام‌رسان:**\n${data.messenger ? `✅ ${data.messenger.name} (${data.messenger.userId})` : '❌ تعیین نشده'}\n\n` +
      `🔧 **دستورات مدیریت:**\n` +
      `/bridge - اتصال دو گروه\n` +
      `/status - وضعیت گروه‌ها\n` +
      `/disconnect - قطع اتصال\n` +
      `/messenger - مدیریت پیام‌رسان\n` +
      `/logs - مشاهده تاریخچه پیام‌ها\n` +
      `/clear - پاک کردن تاریخچه`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔗 اتصال دو گروه', 'bridge_start')],
          [Markup.button.callback('📊 وضعیت', 'status')],
          [Markup.button.callback('🔌 قطع اتصال', 'disconnect')],
          [Markup.button.callback('👤 مدیریت پیام‌رسان', 'messenger_menu')],
          [Markup.button.callback('📜 تاریخچه پیام‌ها', 'logs')],
          [Markup.button.callback('🗑️ پاک کردن تاریخچه', 'clear_logs')]
        ])
      }
    );
  }
  
  // منوی کاربر عادی
  ctx.reply(
    `🤖 **ربات میانجیگر تلگرام**\n\n` +
    `📋 **گروه فعلی:** ${ctx.chat.title || 'گروه بدون نام'}\n` +
    `📊 **وضعیت:** ${data.groups[chatId]?.bridgeTo ? '✅ متصل' : '❌ بدون اتصال'}\n\n` +
    `🔹 برای ارسال پیام، کافیست در گروه پیام بنویسید.\n` +
    `🔹 اگر پیام‌رسان تعیین شده باشد، فقط او میتواند پیام بفرستد.`,
    { parse_mode: 'Markdown' }
  );
});

// =============== مدیریت پیام‌رسان ===============
bot.action('messenger_menu', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
  }
  
  const groups = Object.values(data.groups).filter(g => g.isActive);
  
  if (groups.length === 0) {
    return ctx.reply('❌ هیچ گروهی ثبت نشده!');
  }
  
  const buttons = groups.map(g => ({
    text: `📌 ${g.chatTitle}`,
    callback_data: `messenger_set_${g.chatId}`
  }));
  
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  
  ctx.reply(
    `👤 **مدیریت پیام‌رسان**\n\n` +
    `📌 گروهی که میخواهید پیام‌رسان آن را تعیین کنید انتخاب کنید:\n\n` +
    `⚠️ بعد از انتخاب، در آن گروه به کاربر مورد نظر ریپلای کنید و بنویسید:\n` +
    `\`پیام رسان\``,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(rows)
    }
  );
});

bot.action(/messenger_set_(.+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  
  const chatId = ctx.match[1];
  userStates[ctx.from.id] = {
    step: 'waiting_messenger',
    chatId: chatId
  };
  
  ctx.reply(
    `✅ گروه انتخاب شد!\n\n` +
    `📌 حالا در گروه **${data.groups[chatId]?.chatTitle || 'انتخابی'}** به کاربر مورد نظر ریپلای کنید و بنویسید:\n` +
    `\`پیام رسان\``,
    { parse_mode: 'Markdown' }
  );
});

// =============== تشخیص "پیام رسان" در ریپلای ===============
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const userId = ctx.from.id;
  const messageText = ctx.message.text;
  const replyTo = ctx.message.reply_to_message;
  
  // اگر کاربر در حالت انتخاب پیام‌رسان است
  if (userStates[userId]?.step === 'waiting_messenger' && replyTo) {
    const targetUserId = replyTo.from.id;
    const targetName = replyTo.from.first_name || 'کاربر';
    const targetUsername = replyTo.from.username || 'بدون یوزرنیم';
    
    // بررسی اینکه آیا در گروه درست است
    if (userStates[userId].chatId !== chatId) {
      return ctx.reply('❌ لطفاً در گروه انتخاب شده این کار را انجام دهید!');
    }
    
    // تنظیم پیام‌رسان
    data.messenger = {
      userId: targetUserId,
      name: targetName,
      username: targetUsername,
      chatId: chatId,
      setBy: userId,
      setAt: new Date().toISOString()
    };
    saveData(data);
    
    ctx.reply(
      `✅ **پیام‌رسان تعیین شد!**\n\n` +
      `👤 **نام:** ${targetName}\n` +
      `🆔 **آیدی:** ${targetUserId}\n` +
      `📌 **گروه:** ${data.groups[chatId]?.chatTitle || 'نامشخص'}\n\n` +
      `🔒 فقط این کاربر میتواند پیام بفرستد.\n` +
      `🔓 برای لغو: /removemessenger`,
      { parse_mode: 'Markdown' }
    );
    
    delete userStates[userId];
    return;
  }
  
  // =============== اگر "پیام رسان" در ریپلای نوشته شد (حالت معمولی) ===============
  if (replyTo && messageText.trim() === 'پیام رسان' && isAdmin(userId)) {
    const targetUserId = replyTo.from.id;
    const targetName = replyTo.from.first_name || 'کاربر';
    
    data.messenger = {
      userId: targetUserId,
      name: targetName,
      username: replyTo.from.username || 'بدون یوزرنیم',
      chatId: chatId,
      setBy: userId,
      setAt: new Date().toISOString()
    };
    saveData(data);
    
    await ctx.reply(
      `✅ **${targetName}** به عنوان پیام‌رسان تعیین شد!\n` +
      `🔒 فقط ایشان میتوانند پیام بفرستند.`,
      { parse_mode: 'Markdown' }
    );
    
    // اطلاع به فرد انتخاب شده
    try {
      await bot.telegram.sendMessage(
        targetUserId,
        `✅ شما به عنوان **پیام‌رسان** در گروه "${ctx.chat.title}" تعیین شدید!\n` +
        `🔒 فقط شما میتوانید در این گروه پیام بفرستید.`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
    
    return;
  }
});

// =============== لغو پیام‌رسان ===============
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
  
  ctx.reply(`✅ پیام‌رسان (${messengerName}) لغو شد!\n🔓 همه میتوانند پیام بفرستند.`);
});

// =============== تاریخچه پیام‌ها ===============
bot.action('logs', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  
  const logs = data.messages.slice(-50).reverse();
  
  if (logs.length === 0) {
    return ctx.reply('📭 هیچ پیامی ثبت نشده!');
  }
  
  let message = '📜 **تاریخچه پیام‌ها (۵۰ مورد آخر)**\n\n';
  logs.forEach((msg, index) => {
    message += `${index + 1}. 📩 **از:** ${msg.fromUser}\n`;
    message += `   📌 **گروه مبدا:** ${msg.fromGroup}\n`;
    message += `   📌 **گروه مقصد:** ${msg.toGroup}\n`;
    message += `   📝 **متن:** ${msg.text.substring(0, 30)}${msg.text.length > 30 ? '...' : ''}\n`;
    message += `   👁️ **دیده شد:** ${msg.seen ? '✅' : '❌'}\n`;
    message += `   ✍️ **پاسخ:** ${msg.replied ? '✅' : '❌'}\n`;
    message += `   🕐 **زمان:** ${new Date(msg.createdAt).toLocaleString('fa-IR')}\n\n`;
  });
  
  ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('logs', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.reply('📜 در حال ارسال تاریخچه...');
  // همان اکشن بالا اجرا میشه
});

// =============== پاک کردن تاریخچه ===============
bot.action('clear_logs', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  
  data.messages = [];
  saveData(data);
  ctx.reply('🗑️ تاریخچه پیام‌ها پاک شد!');
});

// =============== فرآیند اتصال دو گروه ===============
bot.action('bridge_start', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply('❌ فقط مدیر میتواند این کار را انجام دهد!');
  }
  
  const groups = Object.values(data.groups).filter(g => g.isActive);
  
  if (groups.length < 2) {
    return ctx.reply('❌ حداقل به ۲ گروه نیاز است!');
  }
  
  userStates[ctx.from.id] = { step: 'select_first_bridge' };
  
  const buttons = groups.map(g => ({
    text: `📌 ${g.chatTitle}`,
    callback_data: `bridge_select_${g.chatId}`
  }));
  
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  
  ctx.reply(
    '🔗 **اتصال دو گروه**\n\n' +
    '📌 **گروه اول** را انتخاب کنید:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(rows)
    }
  );
});

bot.action(/bridge_select_(.+)/, async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.match[1];
  
  if (!userStates[userId] || userStates[userId].step !== 'select_first_bridge') {
    return ctx.reply('❌ لطفاً دوباره /bridge را اجرا کنید.');
  }
  
  userStates[userId].firstGroup = chatId;
  userStates[userId].step = 'select_second_bridge';
  
  const groups = Object.values(data.groups).filter(g => 
    g.isActive && g.chatId !== chatId
  );
  
  if (groups.length === 0) {
    return ctx.reply('❌ گروه دیگری برای اتصال وجود ندارد!');
  }
  
  const buttons = groups.map(g => ({
    text: `📌 ${g.chatTitle}`,
    callback_data: `bridge_second_${g.chatId}`
  }));
  
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  
  ctx.reply(
    '📌 **گروه دوم** را انتخاب کنید:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(rows)
    }
  );
});

bot.action(/bridge_second_(.+)/, async (ctx) => {
  const userId = ctx.from.id;
  const secondGroupId = ctx.match[1];
  const firstGroupId = userStates[userId]?.firstGroup;
  
  if (!firstGroupId) {
    return ctx.reply('❌ خطا! دوباره /bridge را اجرا کنید.');
  }
  
  data.groups[firstGroupId].bridgeTo = secondGroupId;
  data.groups[secondGroupId].bridgeTo = firstGroupId;
  saveData(data);
  
  ctx.reply(
    `✅ **اتصال برقرار شد!**\n\n` +
    `🔹 ${data.groups[firstGroupId].chatTitle} ↔️ 🔹 ${data.groups[secondGroupId].chatTitle}\n\n` +
    `📝 حالا پیام‌ها بین دو گروه رد و بدل میشوند.`,
    { parse_mode: 'Markdown' }
  );
  
  delete userStates[userId];
});

// =============== وضعیت ===============
bot.action('status', async (ctx) => {
  const groups = Object.values(data.groups).filter(g => g.isActive);
  
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
  
  ctx.reply(message, { parse_mode: 'Markdown' });
});

// =============== قطع اتصال ===============
bot.action('disconnect', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  
  const groups = Object.values(data.groups).filter(g => g.isActive && g.bridgeTo);
  
  if (groups.length === 0) {
    return ctx.reply('❌ هیچ گروه متصلی وجود ندارد!');
  }
  
  const buttons = groups.map(g => ({
    text: `🔌 ${g.chatTitle}`,
    callback_data: `disconnect_${g.chatId}`
  }));
  
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  
  ctx.reply(
    '🔌 **قطع اتصال**\n\n' +
    'گروه مورد نظر را انتخاب کنید:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(rows)
    }
  );
});

bot.action(/disconnect_(.+)/, async (ctx) => {
  const chatId = ctx.match[1];
  
  if (!data.groups[chatId] || !data.groups[chatId].bridgeTo) {
    return ctx.reply('❌ این گروه اتصالی ندارد!');
  }
  
  const connectedId = data.groups[chatId].bridgeTo;
  
  data.groups[chatId].bridgeTo = null;
  if (data.groups[connectedId]) {
    data.groups[connectedId].bridgeTo = null;
  }
  saveData(data);
  
  ctx.reply(`✅ اتصال ${data.groups[chatId].chatTitle} قطع شد!`);
});

// =============== دریافت پیام‌ها ===============
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const userId = ctx.from.id;
  const messageText = ctx.message.text;
  const messageId = ctx.message.message_id;
  
  // اگر دستور بود نادیده بگیر
  if (messageText.startsWith('/')) return;
  
  // =============== سیستم پاسخ ===============
  if (userStates[userId]?.step === 'waiting_reply') {
    const state = userStates[userId];
    
    try {
      await bot.telegram.sendMessage(
        state.originalChatId,
        `✍️ **پاسخ از ${ctx.from.first_name}:**\n\n📝 ${messageText}`,
        {
          parse_mode: 'Markdown',
          reply_to_message_id: parseInt(state.originalMessageId)
        }
      );
      
      // ثبت پاسخ در تاریخچه
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
  
  // =============== بررسی مجوز ارسال ===============
  const group = data.groups[chatId];
  if (!group || !group.bridgeTo) return;
  
  // فقط مدیر یا پیام‌رسان مجاز به ارسال هستند
  if (!canSendMessage(chatId, userId)) {
    return ctx.reply(
      `❌ **شما مجاز به ارسال پیام نیستید!**\n\n` +
      `🔒 فقط **${data.messenger?.name || 'مدیر'}** میتواند پیام بفرستد.`,
      { parse_mode: 'Markdown' }
    );
  }
  
  // =============== ارسال پیام ===============
  const msgId = generateId();
  const targetGroup = data.groups[group.bridgeTo];
  if (!targetGroup) return;
  
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
    
    // ذخیره اطلاعات پیام ارسال شده
    messageRecord.bridgeChatId = targetGroup.chatId;
    messageRecord.bridgeMessageId = sentMessage.message_id;
    saveData(data);
    
  } catch (error) {
    console.error('❌ خطا در ارسال:', error);
  }
});

// =============== دکمه "دیدم" ===============
bot.action(/seen_(.+)/, async (ctx) => {
  const msgId = ctx.match[1];
  const userId = ctx.from.id;
  
  // فقط مدیر یا کسی که پیام رو دیده میتونه تایید کنه
  if (!isAdmin(userId)) {
    // چک کنیم که کاربر در گروه مقصد هست
    const message = data.messages.find(m => m.id === msgId);
    if (!message) return ctx.reply('❌ پیام یافت نشد!');
    
    // فقط کسانی که در گروه مقصد هستند میتونن تایید کنن
    const chatId = ctx.chat.id.toString();
    if (chatId !== message.bridgeChatId) {
      return ctx.reply('❌ شما مجاز به این کار نیستید!');
    }
  }
  
  const message = data.messages.find(m => m.id === msgId);
  if (!message) {
    return ctx.reply('❌ پیام یافت نشد!');
  }
  
  message.seen = true;
  saveData(data);
  
  // اطلاع به فرستنده اصلی
  try {
    await bot.telegram.sendMessage(
      message.fromUserId,
      `👁️ **${ctx.from.first_name}** پیام شما را دید:\n\n"${message.text}"`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
  
  await ctx.reply('✅ تایید دید ارسال شد!');
});

// =============== دکمه "پاسخ" ===============
bot.action(/reply_(.+)/, async (ctx) => {
  const msgId = ctx.match[1];
  const userId = ctx.from.id;
  
  // فقط مدیر یا کسی که پیام رو دریافت کرده میتونه پاسخ بده
  if (!isAdmin(userId)) {
    const message = data.messages.find(m => m.id === msgId);
    if (!message) return ctx.reply('❌ پیام یافت نشد!');
    
    const chatId = ctx.chat.id.toString();
    if (chatId !== message.bridgeChatId) {
      return ctx.reply('❌ شما مجاز به پاسخ دادن نیستید!');
    }
  }
  
  const message = data.messages.find(m => m.id === msgId);
  if (!message) {
    return ctx.reply('❌ پیام یافت نشد!');
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

// =============== وب‌سرور ===============
app.get('/', (req, res) => {
  res.send('🤖 Telegram Bridge Bot is running!');
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// =============== راه‌اندازی ===============
bot.launch()
  .then(() => {
    console.log('✅ Bridge Bot started!');
    console.log('👑 Admin ID:', ADMIN_ID);
  })
  .catch(err => console.error('❌ Failed:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
