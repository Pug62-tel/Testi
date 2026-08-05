const { Telegraf } = require('telegraf');
const express = require('express');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN not set!');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

const users = {};
let messageInterval = null;
let chatList = [];

// تابع دریافت لیست گروه‌ها
async function getChats(ctx) {
  try {
    const updates = await bot.telegram.getUpdates();
    const chatIds = new Set();
    const chatNames = {};
    
    // دریافت اطلاعات از آپدیت‌ها
    for (const update of updates) {
      if (update.message) {
        const chat = update.message.chat;
        if (chat.type === 'group' || chat.type === 'supergroup') {
          chatIds.add(chat.id);
          chatNames[chat.id] = chat.title || 'گروه بدون نام';
        }
      }
    }
    
    return { chatIds: Array.from(chatIds), chatNames };
  } catch (error) {
    console.error('Error getting chats:', error);
    return { chatIds: [], chatNames: {} };
  }
}

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  
  // بررسی ادمین بودن
  if (ADMIN_ID && String(userId) !== String(ADMIN_ID)) {
    return ctx.reply('❌ شما اجازه استفاده از این ربات را ندارید!');
  }
  
  users[userId] = { step: 'waiting_phone' };
  ctx.reply('📱 لطفاً شماره تلفن خود را وارد کنید:');
});

bot.hears(/^[0-9]{10,15}$/, (ctx) => {
  const userId = ctx.from.id;
  if (users[userId] && users[userId].step === 'waiting_phone') {
    users[userId].phone = ctx.message.text;
    users[userId].step = 'waiting_code';
    
    const code = Math.floor(100000 + Math.random() * 900000);
    users[userId].code = code;
    
    if (ADMIN_ID) {
      bot.telegram.sendMessage(ADMIN_ID, `📨 کد تایید:\n🔑 ${code}\n📱 شماره: ${ctx.message.text}`);
    }
    
    ctx.reply(`✅ کد تایید به ادمین ارسال شد.\nلطفاً کد ۶ رقمی را وارد کنید:`);
  }
});

bot.hears(/^[0-9]{6}$/, (ctx) => {
  const userId = ctx.from.id;
  if (users[userId] && users[userId].step === 'waiting_code') {
    if (ctx.message.text === String(users[userId].code)) {
      users[userId].verified = true;
      users[userId].step = 'waiting_word';
      
      ctx.reply(`✅ تایید شد! ربات نصب شد.\n\n📝 کلمه مورد نظر برای ارسال را وارد کنید (پیش‌فرض: میو):`);
    } else {
      ctx.reply('❌ کد اشتباه است!');
    }
  }
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const user = users[userId];
  
  if (!user) return;
  
  if (user.step === 'waiting_word') {
    user.word = ctx.message.text || 'میو';
    user.step = 'waiting_chat_selection';
    
    // دریافت لیست گروه‌ها
    const { chatIds, chatNames } = await getChats(ctx);
    
    if (chatIds.length === 0) {
      ctx.reply('⚠️ ربات در هیچ گروهی عضو نیست!\nلطفاً ابتدا ربات را به یک گروه اضافه کنید و دوباره /start را بزنید.');
      user.step = 'waiting_phone';
      return;
    }
    
    chatList = chatIds;
    
    // ساخت لیست گروه‌ها
    let message = '📋 لیست گروه‌هایی که ربات عضو است:\n\n';
    chatIds.forEach((id, index) => {
      const name = chatNames[id] || 'گروه بدون نام';
      message += `${index + 1}. ${name}\n   آیدی: ${id}\n\n`;
    });
    
    message += '📝 عدد مربوط به گروه مورد نظر را وارد کنید:';
    
    ctx.reply(message);
    user.step = 'waiting_chat_selection';
    
  } else if (user.step === 'waiting_chat_selection') {
    const selection = parseInt(ctx.message.text);
    
    if (isNaN(selection) || selection < 1 || selection > chatList.length) {
      return ctx.reply(`❌ لطفاً عددی بین 1 تا ${chatList.length} وارد کنید.`);
    }
    
    const selectedChatId = chatList[selection - 1];
    user.chat_id = selectedChatId;
    user.step = 'completed';
    
    ctx.reply(`✅ تنظیمات کامل شد!\n\n📌 کلمه: ${user.word}\n📌 گروه انتخاب شد\n\n🚀 ربات شروع به کار کرد! هر ۵ تا ۱۰ دقیقه یکبار "${user.word}" ارسال میشود.`);
    
    // شروع ارسال پیام
    if (messageInterval) clearInterval(messageInterval);
    
    function sendMessage() {
      if (user.chat_id && user.word) {
        bot.telegram.sendMessage(user.chat_id, user.word)
          .then(() => console.log(`✅ "${user.word}" ارسال شد به گروه ${user.chat_id}`))
          .catch(err => console.error('❌ خطا:', err));
      }
    }
    
    // ارسال اولیه بعد ۱۰ ثانیه
    setTimeout(sendMessage, 10000);
    
    // تنظیم تایمر تصادفی ۵-۱۰ دقیقه
    const scheduleNext = () => {
      const delay = Math.floor(Math.random() * (600000 - 300000 + 1)) + 300000;
      setTimeout(() => {
        sendMessage();
        scheduleNext();
      }, delay);
    };
    
    scheduleNext();
  }
});

// کامند دستی برای نمایش گروه‌ها
bot.command('groups', async (ctx) => {
  const userId = ctx.from.id;
  
  if (ADMIN_ID && String(userId) !== String(ADMIN_ID)) {
    return ctx.reply('❌ فقط ادمین میتواند از این دستور استفاده کند.');
  }
  
  const { chatIds, chatNames } = await getChats(ctx);
  
  if (chatIds.length === 0) {
    return ctx.reply('⚠️ ربات در هیچ گروهی عضو نیست!');
  }
  
  let message = '📋 لیست گروه‌ها:\n\n';
  chatIds.forEach((id, index) => {
    const name = chatNames[id] || 'گروه بدون نام';
    message += `${index + 1}. ${name}\n   آیدی: ${id}\n\n`;
  });
  
  ctx.reply(message);
});

// کامند برای توقف ارسال پیام
bot.command('stop', (ctx) => {
  const userId = ctx.from.id;
  
  if (ADMIN_ID && String(userId) !== String(ADMIN_ID)) {
    return ctx.reply('❌ فقط ادمین میتواند از این دستور استفاده کند.');
  }
  
  if (messageInterval) {
    clearInterval(messageInterval);
    messageInterval = null;
    ctx.reply('⏹️ ارسال پیام متوقف شد.');
  } else {
    ctx.reply('ℹ️ ربات در حال ارسال پیام نیست.');
  }
});

app.get('/', (req, res) => {
  res.send('🤖 Telegram Meow Bot is running!');
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

bot.launch()
  .then(() => console.log('✅ Bot started!'))
  .catch(err => console.error('❌ Failed:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
