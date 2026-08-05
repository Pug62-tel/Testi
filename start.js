const { Telegraf } = require('telegraf');
const express = require('express');

// فقط توکن ربات نیازه
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN not set!');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

let targetChatId = null;
let word = 'میو';
let isRunning = false;
let intervalId = null;

// لیست گروه‌ها
const groups = {};

// شروع ربات
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  
  // دستورات راهنما
  ctx.reply(`🤖 ربات میو!\n\n` +
    `📌 دستورات:\n` +
    `/add - اضافه کردن گروه فعلی\n` +
    `/groups - لیست گروه‌ها\n` +
    `/select - انتخاب گروه فعال\n` +
    `/word - تغییر کلمه\n` +
    `/startmeow - شروع ارسال\n` +
    `/stopmeow - توقف ارسال\n` +
    `/status - وضعیت ربات`);
});

// اضافه کردن گروه
bot.command('add', (ctx) => {
  const chatId = ctx.chat.id;
  const chatTitle = ctx.chat.title || 'گروه بدون نام';
  
  groups[chatId] = chatTitle;
  
  ctx.reply(`✅ گروه "${chatTitle}" اضافه شد!\n` +
    `آیدی: ${chatId}\n\n` +
    `برای انتخاب این گروه: /select ${chatId}`);
});

// لیست گروه‌ها
bot.command('groups', (ctx) => {
  const groupList = Object.keys(groups);
  
  if (groupList.length === 0) {
    return ctx.reply('❌ هیچ گروهی اضافه نشده!');
  }
  
  let message = '📋 لیست گروه‌ها:\n\n';
  groupList.forEach((id, index) => {
    message += `${index + 1}. ${groups[id]}\n   آیدی: ${id}\n\n`;
  });
  
  ctx.reply(message);
});

// انتخاب گروه
bot.command('select', (ctx) => {
  const args = ctx.message.text.split(' ');
  
  if (args.length < 2) {
    return ctx.reply('❌ لطفاً آیدی گروه را وارد کنید: /select 123456789');
  }
  
  const chatId = args[1];
  
  if (!groups[chatId]) {
    return ctx.reply('❌ این گروه در لیست نیست! اول با /add اضافه کنید.');
  }
  
  targetChatId = chatId;
  ctx.reply(`✅ گروه "${groups[chatId]}" انتخاب شد!`);
});

// تغییر کلمه
bot.command('word', (ctx) => {
  const args = ctx.message.text.split(' ');
  
  if (args.length < 2) {
    return ctx.reply(`📝 کلمه فعلی: "${word}"\nبرای تغییر: /word کلمه_جدید`);
  }
  
  word = args.slice(1).join(' ');
  ctx.reply(`✅ کلمه به "${word}" تغییر کرد!`);
});

// شروع ارسال
bot.command('startmeow', (ctx) => {
  if (!targetChatId) {
    return ctx.reply('❌ ابتدا گروه را انتخاب کنید!');
  }
  
  if (isRunning) {
    return ctx.reply('⚠️ ربات در حال اجراست!');
  }
  
  isRunning = true;
  ctx.reply(`🚀 شروع ارسال "${word}" به گروه ${groups[targetChatId] || targetChatId}...`);
  
  // ارسال اولیه بعد ۱۰ ثانیه
  setTimeout(() => {
    sendMessage(ctx);
  }, 10000);
  
  // تایمر تصادفی
  intervalId = setInterval(() => {
    const delay = Math.floor(Math.random() * (600000 - 300000 + 1)) + 300000;
    setTimeout(() => {
      sendMessage(ctx);
    }, delay);
  }, 600000);
});

// توقف ارسال
bot.command('stopmeow', (ctx) => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    isRunning = false;
    ctx.reply('⏹️ ارسال متوقف شد.');
  } else {
    ctx.reply('ℹ️ ربات در حال ارسال نیست.');
  }
});

// وضعیت
bot.command('status', (ctx) => {
  const status = isRunning ? '✅ در حال اجرا' : '⏹️ متوقف';
  const chatInfo = targetChatId ? `${groups[targetChatId] || 'نامشخص'}` : 'هیچ گروهی انتخاب نشده';
  
  ctx.reply(`📊 وضعیت ربات:\n\n` +
    `📌 کلمه: "${word}"\n` +
    `📌 گروه: ${chatInfo}\n` +
    `📌 وضعیت: ${status}`);
});

// تابع ارسال پیام
async function sendMessage(ctx) {
  if (!targetChatId) {
    console.log('❌ گروه انتخاب نشده!');
    return;
  }
  
  try {
    await bot.telegram.sendMessage(targetChatId, word);
    console.log(`✅ "${word}" ارسال شد به ${targetChatId} (${new Date().toLocaleTimeString()})`);
  } catch (error) {
    console.error('❌ خطا:', error);
    if (ctx) {
      ctx.reply('❌ خطا در ارسال پیام!');
    }
  }
}

// وب‌سرور
app.get('/', (req, res) => {
  res.send('🤖 Meow Bot is running!');
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// راه‌اندازی ربات
bot.launch()
  .then(() => {
    console.log('✅ Bot started!');
    console.log('🤖 دستورات: /start برای راهنما');
  })
  .catch(err => console.error('❌ Failed:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
