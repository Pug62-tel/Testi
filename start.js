const MTProto = require('mtproto-core');
const express = require('express');
const input = require('input');

const app = express();
const PORT = process.env.PORT || 3000;

let client = null;
let targetChatId = null;
let meowWord = 'میو';
let isRunning = false;
let intervalId = null;

// تابع لاگین با شماره (بدون API_ID و API_HASH)
async function loginToTelegram() {
    try {
        console.log('\n🤖 ربات لاگین به تلگرام (بدون API)');
        console.log('====================================');
        
        // دریافت شماره
        const phoneNumber = await input.text('📱 شماره تلفن (مثل 989123456789): ');
        
        // ساخت کلاینت بدون API
        client = MTProto({
            api_id: 0, // صفر! بدون API
            api_hash: '', // خالی!
        });

        console.log('\n📨 در حال ارسال کد تایید...');
        
        // شروع لاگین
        const result = await client.call('auth.sendCode', {
            phone_number: phoneNumber,
            api_id: 0,
            api_hash: '',
            settings: {
                _: 'codeSettings'
            }
        });

        console.log('📨 کد تایید به تلگرام شما ارسال شد!');
        const code = await input.text('🔢 کد تایید را وارد کنید: ');

        // تایید کد
        const signIn = await client.call('auth.signIn', {
            phone_number: phoneNumber,
            phone_code_hash: result.phone_code_hash,
            phone_code: code
        });

        console.log('\n✅ لاگین موفق!');
        console.log(`👤 خوش آمدید ${signIn.user.first_name || ''}!`);
        
        return true;
    } catch (error) {
        console.error('❌ خطا در لاگین:', error);
        return false;
    }
}

// تابع دریافت لیست گروه‌ها
async function getGroups() {
    try {
        console.log('\n📋 در حال دریافت لیست گروه‌ها...');
        
        const dialogs = await client.call('messages.getDialogs', {
            offset_date: 0,
            offset_id: 0,
            offset_peer: { _: 'inputPeerEmpty' },
            limit: 100,
            hash: 0
        });

        const groups = dialogs.dialogs
            .map(dialog => {
                const chat = dialogs.chats.find(c => c.id === dialog.peer.chat_id);
                return chat;
            })
            .filter(chat => chat && chat._ === 'chat' || chat._ === 'channel');

        if (groups.length === 0) {
            console.log('❌ شما در هیچ گروهی عضو نیستید!');
            return [];
        }

        console.log('\n📋 لیست گروه‌های شما:');
        console.log('========================');
        groups.forEach((g, index) => {
            console.log(`${index + 1}. ${g.title || 'گروه بدون نام'}`);
            console.log(`   آیدی: ${g.id}`);
            console.log('---');
        });

        return groups;
    } catch (error) {
        console.error('❌ خطا:', error);
        return [];
    }
}

// تابع انتخاب گروه
async function selectGroup(groups) {
    if (groups.length === 0) return false;

    const choice = await input.text('\n🔢 شماره گروه مورد نظر را وارد کنید: ');
    const index = parseInt(choice) - 1;

    if (index < 0 || index >= groups.length) {
        console.log('❌ شماره نامعتبر!');
        return false;
    }

    targetChatId = groups[index].id;
    console.log(`✅ گروه انتخاب شد: ${groups[index].title}`);
    return true;
}

// تابع تنظیم کلمه
async function setWord() {
    const word = await input.text('\n📝 کلمه مورد نظر (پیش‌فرض: میو): ');
    if (word) meowWord = word;
    console.log(`✅ کلمه: "${meowWord}"`);
    return true;
}

// تابع ارسال پیام
async function sendMessage() {
    if (!client || !targetChatId) {
        console.log('❌ تنظیمات کامل نیست!');
        return false;
    }

    try {
        await client.call('messages.sendMessage', {
            peer: { _: 'inputPeerChat', chat_id: targetChatId },
            message: meowWord,
            random_id: Math.floor(Math.random() * 0xFFFFFFFF)
        });

        const time = new Date().toLocaleTimeString('fa-IR');
        console.log(`✅ "${meowWord}" ارسال شد (${time})`);
        return true;
    } catch (error) {
        console.error('❌ خطا:', error);
        return false;
    }
}

// تابع شروع ارسال خودکار
function startAutoSend() {
    if (isRunning) {
        console.log('⚠️ ربات در حال اجراست!');
        return;
    }

    isRunning = true;
    console.log(`\n🚀 شروع ارسال خودکار "${meowWord}"`);
    console.log(`⏱️ هر ۵ تا ۱۰ دقیقه یکبار`);
    console.log('========================\n');

    setTimeout(() => {
        sendMessage();
    }, 10000);

    intervalId = setInterval(() => {
        const delay = Math.floor(Math.random() * (600000 - 300000 + 1)) + 300000;
        const minutes = Math.round(delay / 60000);
        console.log(`⏱️ پیام بعدی در ${minutes} دقیقه`);

        setTimeout(() => {
            sendMessage();
        }, delay);
    }, 600000);
}

// تابع توقف
function stopAutoSend() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        isRunning = false;
        console.log('\n⏹️ ارسال متوقف شد.');
    }
}

// منوی اصلی
async function mainMenu() {
    console.log('\n📋 منوی ربات');
    console.log('=============');
    console.log('1. 🚀 شروع ارسال');
    console.log('2. ⏹️ توقف ارسال');
    console.log('3. 📝 تغییر کلمه');
    console.log('4. 📋 تغییر گروه');
    console.log('5. 📊 وضعیت');
    console.log('6. 🚪 خروج');

    const choice = await input.text('\nانتخاب شما: ');

    switch (choice) {
        case '1':
            if (!targetChatId) {
                console.log('❌ ابتدا گروه را انتخاب کنید!');
                const groups = await getGroups();
                if (groups.length > 0) {
                    await selectGroup(groups);
                }
            }
            if (targetChatId) startAutoSend();
            break;
        case '2':
            stopAutoSend();
            break;
        case '3':
            await setWord();
            break;
        case '4':
            const groups = await getGroups();
            if (groups.length > 0) {
                await selectGroup(groups);
            }
            break;
        case '5':
            console.log('\n📊 وضعیت:');
            console.log(`📌 کلمه: "${meowWord}"`);
            console.log(`📌 گروه: ${targetChatId || 'انتخاب نشده'}`);
            console.log(`📌 وضعیت: ${isRunning ? '✅ در حال اجرا' : '⏹️ متوقف'}`);
            break;
        case '6':
            console.log('👋 خداحافظ!');
            process.exit(0);
        default:
            console.log('❌ انتخاب نامعتبر!');
    }

    setTimeout(mainMenu, 1500);
}

// اجرای اصلی
async function main() {
    console.log('🤖 Self-Bot Telegram (بدون API)');
    console.log('=================================\n');

    const loggedIn = await loginToTelegram();
    if (!loggedIn) {
        console.log('❌ لاگین ناموفق!');
        process.exit(1);
    }

    const groups = await getGroups();
    if (groups.length > 0) {
        await selectGroup(groups);
    }

    await setWord();
    startAutoSend();

    setTimeout(mainMenu, 2000);
}

// وب‌سرور برای Railway
app.get('/', (req, res) => {
    res.send('🤖 Self-Bot is running!');
});

app.get('/status', (req, res) => {
    res.json({
        status: isRunning ? 'running' : 'stopped',
        word: meowWord,
        chat_id: targetChatId
    });
});

app.listen(PORT, () => {
    console.log(`✅ Web server running on port ${PORT}`);
});

// اجرا
main().catch(err => {
    console.error('❌ خطا:', err);
});

process.once('SIGINT', () => {
    console.log('\n⏹️ در حال توقف...');
    stopAutoSend();
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('\n⏹️ در حال توقف...');
    stopAutoSend();
    process.exit(0);
});  
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
