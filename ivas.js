
/* * PROJECT: WARXZZ NEW 
 * PROTECTED MANUAL 
 */ 
const { Telegraf, Markup } = require('telegraf');
const puppeteer = require('puppeteer-extra');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { parsePhoneNumber } = require('libphonenumber-js');
const fs = require('fs');
const path = require('path');
const rl = require('readline/promises');
const settings = require('./settings');
const XLSX = require('xlsx');
const csv = require('csv-parser');
const { PassThrough } = require('stream');
const chalk = require('chalk');
const axios = require('axios');

puppeteerExtra.use(StealthPlugin());

const ALLOWED_TOKENS_URL = 'https://raw.githubusercontent.com/WarxzBot/bukan-apa-apa/main/allowed-tokens.json';

async function getAllowedTokens() {
    try {
        const response = await axios.get(ALLOWED_TOKENS_URL, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        let allowedTokens = [];
        if (Array.isArray(response.data)) {
            allowedTokens = response.data;
        } else if (response.data && response.data.allowed_tokens && Array.isArray(response.data.allowed_tokens)) {
            allowedTokens = response.data.allowed_tokens;
        } else if (typeof response.data === 'object') {
            allowedTokens = Object.values(response.data).filter(token => typeof token === 'string' && token.length > 10);
        }
        if (allowedTokens.length === 0) {
            console.error(chalk.red(`[TOKEN VALIDATION] Daftar token kosong di database`));
        }
        return allowedTokens;
    } catch (error) {
        console.error(chalk.red(`[TOKEN VALIDATION] Gagal mengambil daftar token dari database:`), error.message);
        return [];
    }
}



// --- FUNGSI UPDATE TOKEN (Sikat semua duplikat) ---
function saveTokenToSettings(token) {
    try {
        const settingsFilePath = path.join(__dirname, 'settings.js');
        let fileContent = fs.readFileSync(settingsFilePath, 'utf8');
       
        const tokenRegex = /("TOKEN"|TOKEN)\s*[:=]\s*['"]([^'"]*)['"]/g;
        
        if (tokenRegex.test(fileContent)) {
            fileContent = fileContent.replace(tokenRegex, (match, p1) => `${p1}: '${token}'`);
        } else {
            fileContent = fileContent.replace(/};?\s*$/, `  TOKEN: '${token}',\n};`);
        }
        
        fs.writeFileSync(settingsFilePath, fileContent, 'utf8');
        // Update memori supaya langsung sinkron
        settings.TOKEN = token; 
        console.log(chalk.green("✅ Token berhasil diupdate di settings.js"));
        return true;
    } catch (error) {
        console.error(chalk.red("❌ Gagal menyimpan token:"), error.message);
        return false;
    }
}


async function validateBotToken(token) {
    const allowedTokens = await getAllowedTokens();
    if (allowedTokens.length === 0) {
        console.error(chalk.red('[TOKEN VALIDATION] Tidak dapat mengambil daftar token dari GitHub'));
        return false;
    }
    const isValid = allowedTokens.includes(token.trim());
    return isValid;
}

async function askForToken() {
    const readline = rl.createInterface({ input: process.stdin, output: process.stdout });
    console.log(chalk.cyan("╔══════════════════════════════════════╗"));
    console.log(chalk.cyan("║      SETUP BOT TELEGRAM TOKEN        ║"));
    console.log(chalk.cyan("╚══════════════════════════════════════╝"));
    let token = '';
    while (!token || !token.includes(':')) {
        token = await readline.question(chalk.cyan("Masukkan Token Bot (dari BotFather): "));
        token = token.trim();
        if (!token) console.log(chalk.red("❌ Token tidak boleh kosong"));
        else if (!token.includes(':')) console.log(chalk.red("❌ Format token tidak valid!"));
    }
    readline.close();
    return token;
}


// --- FUNGSI UPDATE OWNER ID (Simpan ke id owner/OWNER_ID) ---
async function askForOwnerId() {
    const readline = rl.createInterface({ input: process.stdin, output: process.stdout });
    console.log(chalk.cyan("╔══════════════════════════════════════╗"));
    console.log(chalk.cyan("║      SETUP ID TELEGRAM OWNER         ║"));
    console.log(chalk.cyan("╚══════════════════════════════════════╝"));
    let ownerId = '';
    while (!ownerId || isNaN(ownerId)) {
        ownerId = await readline.question(chalk.cyan("Masukkan ID Telegram Anda: "));
        ownerId = ownerId.trim();
        if (!ownerId) console.log(chalk.red("❌ ID tidak boleh kosong"));
        else if (isNaN(ownerId)) console.log(chalk.red("❌ ID harus angka!"));
    }
    readline.close();
    return ownerId;
}

function saveOwnerIdToSettings(ownerId) {
    try {
        const settingsFilePath = path.join(__dirname, 'settings.js');
        let fileContent = fs.readFileSync(settingsFilePath, 'utf8');
        
        // Pastikan nilai yang disimpan adalah angka, jika kosong jadikan 0
        const finalId = (ownerId && !isNaN(ownerId)) ? ownerId : 0;

        const idRegex = /("OWNER_ID"|OWNER_ID)\s*[:=]\s*['"]?([^'",\s}]*)['"]?/g;
        
        if (idRegex.test(fileContent)) {
            // Simpan SEBAGAI ANGKA (tanpa tanda kutip)
            fileContent = fileContent.replace(idRegex, `"OWNER_ID": ${finalId}`);
        } else {
            fileContent = fileContent.replace(/};?\s*$/, `  "OWNER_ID": ${finalId},\n};`);
        }
        
        fs.writeFileSync(settingsFilePath, fileContent, 'utf8');
        settings.OWNER_ID = Number(finalId); // Update memori sebagai angka
        return true;
    } catch (error) {
        return false;
    }
}


// --- ALUR VALIDASI UTAMA ---
async function setupAndValidateToken() {
    console.log(chalk.blue("╔══════════════════════════════════════╗"));
    console.log(chalk.blue("║     TOKEN VALIDATION SYSTEM          ║"));
    console.log(chalk.blue("╚══════════════════════════════════════╝"));
    
    let token = settings.TOKEN || '';
    
    // 1. Cek Token
    if (!token || token.length < 10) {
        console.log(chalk.yellow("⚠️ Token belum valid di settings.js"));
        token = await askForToken();
        if (!token.includes(':')) {
            console.log(chalk.red("❌ Format token salah!"));
            process.exit(1);
        }
        const saved = saveTokenToSettings(token);
        if (!saved) process.exit(1);
    }
    
    // 2. Validasi Token ke Server
    const isValid = await validateBotToken(token);
    if (!isValid) {
        console.log(chalk.red("╔══════════════════════════════════════╗"));
        console.log(chalk.red("║     TOKEN TIDAK TERDAFTAR           ║"));
        console.log(chalk.red("╚══════════════════════════════════════╝"));
        process.exit(1);
    }
    
    console.log(chalk.green("╔══════════════════════════════════════╗"));
    console.log(chalk.green("║     TOKEN VALIDATION BERHASIL        ║"));
    console.log(chalk.green("╚══════════════════════════════════════╝"));

    let ownerId = settings.OWNER_ID || '';
    if (!ownerId || ownerId === '0' || ownerId === 0) {
        console.log(chalk.yellow("⚠️ Owner ID belum diset!"));
        ownerId = await askForOwnerId();
        const savedId = saveOwnerIdToSettings(ownerId);
        if (!savedId) process.exit(1);
    }
    
    return token;
}

(async () => {
    try {
        await setupAndValidateToken();
        
        console.clear(); 
        
        console.log(chalk.bold.yellow("╔══════════════════════════════════════╗"));
        console.log(chalk.bold.yellow("║      IVASMS BOT RECIEVE ACTIVED      ║"));
        console.log(chalk.bold.yellow("╚══════════════════════════════════════╝"));
        
        console.log(chalk.bold.green("\n🚀 SEMUA VALIDASI BERHASIL, MENYALAKAN BOT..."));

        await initializeBot();

    } catch (e) {
        console.error(chalk.red("❌ ERROR:"), e.message);
        process.exit(1);
    }
})();



const settingsFilePath = path.join(__dirname, 'settings.js');
const TEMP_DIR = path.join(__dirname, 'temp');
const SS_DIR = path.join(TEMP_DIR, 'screenshots');
const PROJECT_NAME = settings.PROJECT_NAME || "KILLUA NEW";
const LIVE_SMS_URL = "https://www.ivasms.com/portal/live/my_sms";
const RANGE_BASE_URL = "https://www.ivasms.com/portal/sms/test/sms";
const DASH_URL = "https://www.ivasms.com/portal";
const CHECK_INTERVAL_MS = 15000;
const LOG_INTERVAL_MS = 5000;
const INITIAL_CONNECT_TIMEOUT_MS = 60000;
const SCREENSHOT_TIMEOUT_MS = 60000;
const MACBOOK_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MACBOOK_VIEWPORT = { width: 1440, height: 900 };

let isPollingActive = false;
let liveSmsPage = null;
const sentOtps = new Set();
let lastLoggedStatus = 'Initializing';
let lastCheckTime = "N/A";
let disconnectAlertSent = false;
let botStatus = 'Initializing';
let browser = null;
let isBrowserReady = false;
let disconnectRetryCount = 0;
const MAX_FATAL_FAILURES = 5;
const bot = new Telegraf(settings.TOKEN);
const OWNER_ID = Number(settings.OWNER_ID);
const CHAT_ID = Number(settings.CHAT_ID);
let lastStatusLog = 0;
const STATUS_LOG_INTERVAL = 300000;

bot.catch((err, ctx) => {
    console.error(chalk.red(`[BOT ERROR]`), err);
    console.error(chalk.red(`Update yang error:`), ctx.update);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('Unhandled Rejection at:'), promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error(chalk.red('[STATUS] Uncaught Exception:'), error);
});

const ownerOnly = async (ctx, next) => {
    const userId = ctx.from.id;
    if (userId === OWNER_ID) return next();
    if (ctx.updateType === 'message' || ctx.updateType === 'callback_query') {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery("⚠️ Akses Ditolak. Hanya Owner yang bisa menggunakan perintah ini.");
        } else {
            ctx.reply("⚠️ Akses Ditolak. Hanya Owner yang bisa menggunakan perintah ini.");
        }
    }
};

const replyHTML = (ctx, text, keyboard = {}) => {
    return ctx.replyWithHTML(text, { 
        reply_markup: keyboard.reply_markup,
        reply_to_message_id: ctx.message ? ctx.message.message_id : undefined
    }).catch(err => {
        console.error(chalk.red(`[REPLY ERROR] ${err.message}`));
        // Fallback: coba kirim tanpa reply
        return ctx.replyWithHTML(text, { 
            reply_markup: keyboard.reply_markup 
        }).catch(console.error);
    });
};

const deleteMessage = async (ctx) => {
    try {
        if (ctx.message && ctx.message.message_id) {
            await ctx.deleteMessage(ctx.message.message_id);
        } else if (ctx.callbackQuery && ctx.callbackQuery.message) {
            await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
        }
    } catch (e) {}
};

const editOrReplyHTML = async (ctx, text, keyboard, messageIdToEdit) => {
    try {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery().catch(() => {});
        }
        if (messageIdToEdit) {
            const editedMessage = await ctx.telegram.editMessageText(ctx.chat.id, messageIdToEdit, null, text, { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
            return editedMessage;
        }
    } catch (e) {}
    return replyHTML(ctx, text, keyboard);
};

const chunkArray = (arr, size) => {
    const result = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
};

const downloadFile = async (fileId, fileName) => {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    const localPath = path.join(TEMP_DIR, fileName);
    try {
        const fileLink = await bot.telegram.getFileLink(fileId);
        const response = await axios({
            method: 'GET',
            url: fileLink.href,
            responseType: 'stream'
        });
        const writer = fs.createWriteStream(localPath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(localPath));
            writer.on('error', reject);
        });
    } catch (e) {
        if (fs.existsSync(localPath)) {
            try { fs.unlinkSync(localPath); } catch(err) { }
        }
        throw new Error(`Gagal mengunduh file dari Telegram: ${e.message}`);
    }
};

const detectTypeByName = (fileName) => {
    const ext = path.extname(fileName).toLowerCase();
    if (['.csv', '.txt'].includes(ext)) return 'csv';
    if (['.xlsx', '.xls'].includes(ext)) return 'xlsx';
    if (['.vcf', '.vcard'].includes(ext)) return 'vcf';
    return null;
};

const getCountryInfo = (number) => {
    try {
        const num = number.startsWith('+') ? number : `+${number}`;
        const p = parsePhoneNumber(num);
        if (p && p.isValid() && p.country) {
            return new Intl.DisplayNames(['en'], { type: 'region' }).of(p.country) || p.country;
        }
    } catch (e) {}
    return "UNKNOWN";
};

const isLikelyPhoneNumber = (value) => {
    if (typeof value !== 'string') value = String(value);
    const cleanValue = value.trim().replace(/[\s\(\)-]/g, '');
    return /^\+?\d{8,15}$/.test(cleanValue);
};

const getCountryFlag = (countryName) => {
    const flagMap = {
        'INDONESIA': '🇮🇩', 'MOZAMBIQUE': '🇲🇿', 'SRI LANKA': '🇱🇰',
        'MALAYSIA': '🇲🇾', 'THAILAND': '🇹🇭', 'VIETNAM': '🇻🇳',
        'PHILIPPINES': '🇵🇭', 'SINGAPORE': '🇸🇬', 'INDIA': '🇮🇳',
        'PAKISTAN': '🇵🇰', 'BANGLADESH': '🇧🇩', 'NEPAL': '🇳🇵',
        'CHINA': '🇨🇳', 'JAPAN': '🇯🇵', 'SOUTH KOREA': '🇰🇷',
        'RUSSIA': '🇷🇺', 'UKRAINE': '🇺🇦', 'POLAND': '🇵🇱',
        'GERMANY': '🇩🇪', 'FRANCE': '🇫🇷', 'ITALY': '🇮🇹',
        'SPAIN': '🇪🇸', 'PORTUGAL': '🇵🇹', 'NETHERLANDS': '🇳🇱',
        'BELGIUM': '🇧🇪', 'SWITZERLAND': '🇨🇭', 'AUSTRIA': '🇦🇹',
        'UNITED KINGDOM': '🇬🇧', 'IRELAND': '🇮🇪', 'SWEDEN': '🇸🇪',
        'NORWAY': '🇳🇴', 'DENMARK': '🇩🇰', 'FINLAND': '🇫🇮',
        'USA': '🇺🇸', 'CANADA': '🇨🇦', 'MEXICO': '🇲🇽',
        'BRAZIL': '🇧🇷', 'ARGENTINA': '🇦🇷', 'COLOMBIA': '🇨🇴',
        'PERU': '🇵🇪', 'CHILE': '🇨🇱', 'VENEZUELA': '🇻🇪',
        'SOUTH AFRICA': '🇿🇦', 'NIGERIA': '🇳🇬', 'EGYPT': '🇪🇬',
        'KENYA': '🇰🇪', 'ETHIOPIA': '🇪🇹', 'GHANA': '🇬🇭',
        'AUSTRALIA': '🇦🇺', 'NEW ZEALAND': '🇳🇿',
        'AFGHANISTAN': '🇦🇫', 'ALBANIA': '🇦🇱', 'ALGERIA': '🇩🇿',
        'ANDORRA': '🇦🇩', 'ANGOLA': '🇦🇴', 'ANTIGUA AND BARBUDA': '🇦🇬',
        'ARMENIA': '🇦🇲', 'AZERBAIJAN': '🇦🇿', 'BAHAMAS': '🇧🇸',
        'BAHRAIN': '🇧🇭', 'BARBADOS': '🇧🇧', 'BELARUS': '🇧🇾',
        'BELIZE': '🇧🇿', 'BENIN': '🇧🇯', 'BHUTAN': '🇧🇹',
        'BOLIVIA': '🇧🇴', 'BOSNIA AND HERZEGOVINA': '🇧🇦', 'BOTSWANA': '🇧🇼',
        'BRUNEI': '🇧🇳', 'BULGARIA': '🇧🇬', 'BURKINA FASO': '🇧🇫',
        'BURUNDI': '🇧🇮', 'CAMBODIA': '🇰🇭', 'CAMEROON': '🇨🇲',
        'CAPE VERDE': '🇨🇻', 'CENTRAL AFRICAN REPUBLIC': '🇨🇫', 'CHAD': '🇹🇩',
        'COMOROS': '🇰🇲', 'CONGO (BRAZZAVILLE)': '🇨🇬', 'CONGO (KINSHASA)': '🇨🇩',
        'COSTA RICA': '🇨🇷', 'CROATIA': '🇭🇷', 'CUBA': '🇨🇺',
        'CYPRUS': '🇨🇾', 'CZECHIA': '🇨🇿', 'DJIBOUTI': '🇩🇯',
        'DOMINICA': '🇩🇲', 'DOMINICAN REPUBLIC': '🇩🇴', 'EAST TIMOR': '🇹🇱',
        'ECUADOR': '🇪🇨', 'EL SALVADOR': '🇸🇻', 'EQUATORIAL GUINEA': '🇬🇶',
        'ERITREA': '🇪🇷', 'ESTONIA': '🇪🇪', 'ESWATINI': '🇸🇿',
        'FIJI': '🇫🇯', 'GABON': '🇬🇦', 'GAMBIA': '🇬🇲',
        'GEORGIA': '🇬🇪', 'GREECE': '🇬🇷', 'GRENADA': '🇬🇩',
        'GUATEMALA': '🇬🇹', 'GUINEA': '🇬🇳', 'GUINEA-BISSAU': '🇬🇼',
        'GUYANA': '🇬🇾', 'HAITI': '🇭🇹', 'HONDURAS': '🇭🇳',
        'HUNGARY': '🇭🇺', 'ICELAND': '🇮🇸', 'IRAN': '🇮🇷',
        'IRAQ': '🇮🇶', 'ISRAEL': '🇮🇱', 'JAMAICA': '🇯🇲',
        'JORDAN': '🇯🇴', 'KAZAKHSTAN': '🇰🇿', 'KIRIBATI': '🇰🇮',
        'KUWAIT': '🇰🇼', 'KYRGYZSTAN': '🇰🇬', 'LAOS': '🇱🇦',
        'LATVIA': '🇱🇻', 'LEBANON': '🇱🇧', 'LESOTHO': '🇱🇸',
        'LIBERIA': '🇱🇷', 'LIBYA': '🇱🇾', 'LIECHTENSTEIN': '🇱🇮',
        'LITHUANIA': '🇱🇹', 'LUXEMBOURG': '🇱🇺', 'MADAGASCAR': '🇲🇬',
        'MALAWI': '🇲🇼', 'MALDIVES': '🇲🇻', 'MALI': '🇲🇱',
        'MALTA': '🇲🇹', 'MARSHALL ISLANDS': '🇲🇭', 'MAURITANIA': '🇲🇷',
        'MAURITIUS': '🇲🇺', 'MICRONESIA': '🇫🇲', 'MOLDOVA': '🇲🇩',
        'MONACO': '🇲🇨', 'MONGOLIA': '🇲🇳', 'MONTENEGRO': '🇲🇪',
        'MOROCCO': '🇲🇦', 'MYANMAR': '🇲🇲', 'NAMIBIA': '🇳🇦',
        'NAURU': '🇳🇷', 'NICARAGUA': '🇳🇮', 'NIGER': '🇳🇪',
        'NORTH KOREA': '🇰🇵', 'NORTH MACEDONIA': '🇲🇰', 'OMAN': '🇴🇲',
        'PALAU': '🇵🇼', 'PANAMA': '🇵🇦', 'PAPUA NEW GUINEA': '🇵🇬',
        'PARAGUAY': '🇵🇾', 'QATAR': '🇶🇦', 'ROMANIA': '🇷🇴',
        'RWANDA': '🇷🇼', 'SAINT KITTS AND NEVIS': '🇰🇳', 'SAINT LUCIA': '🇱🇨',
        'SAINT VINCENT AND THE GRENADINES': '🇻🇨', 'SAMOA': '🇼🇸', 'SAN MARINO': '🇸🇲',
        'SAO TOME AND PRINCIPE': '🇸🇹', 'SAUDI ARABIA': '🇸🇦', 'SENEGAL': '🇸🇳',
        'SERBIA': '🇷🇸', 'SEYCHELLES': '🇸🇨', 'SIERRA LEONE': '🇸🇱',
        'SLOVAKIA': '🇸🇰', 'SLOVENIA': '🇸🇮', 'SOLOMON ISLANDS': '🇸🇧',
        'SOMALIA': '🇸🇴', 'SOUTH SUDAN': '🇸🇸', 'SUDAN': '🇸🇩',
        'SURINAME': '🇸🇷', 'SYRIA': '🇸🇾', 'TAJIKISTAN': '🇹🇯',
        'TANZANIA': '🇹🇿', 'TOGO': '🇹🇬', 'TONGA': '🇹🇴',
        'TRINIDAD AND TOBAGO': '🇹🇹', 'TUNISIA': '🇹🇳', 'TURKEY': '🇹🇷',
        'TURKMENISTAN': '🇹🇲', 'TUVALU': '🇹🇻', 'UGANDA': '🇺🇬',
        'UNITED ARAB EMIRATES': '🇦🇪', 'URUGUAY': '🇺🇾', 'UZBEKISTAN': '🇺🇿',
        'VANUATU': '🇻🇺', 'VATICAN CITY': '🇻🇦', 'YEMEN': '🇾🇪',
        'ZAMBIA': '🇿🇲', 'ZIMBABWE': '🇿🇼'
    };
    const cleanCountry = countryName.replace(/\s+\d+$/, '').toUpperCase();
    return flagMap[cleanCountry] || '🏴';
};

// ==================================== //
// ========== SETTINGS HELPER ========= //
// ==================================== //

const reloadSettings = () => {
    try {
        // Clear cache
        delete require.cache[require.resolve('./settings.js')];
        
        // Load fresh settings
        const freshSettings = require('./settings.js');
        
        // Update global settings object
        Object.keys(freshSettings).forEach(key => {
            settings[key] = freshSettings[key];
        });
        
        console.log(chalk.green('[SETTINGS] ✅ Settings reloaded successfully'));
        return true;
    } catch (error) {
        console.error(chalk.red('[SETTINGS] ❌ Failed to reload settings:'), error);
        return false;
    }
};

const writeSettingToFileSync = (key, value) => {
    try {
        const settingsFilePath = path.join(__dirname, 'settings.js');
        
        if (!fs.existsSync(settingsFilePath)) {
            console.error(chalk.red(`[SETTINGS] ❌ File settings.js tidak ditemukan!`));
            return false;
        }
        
        let fileContent = fs.readFileSync(settingsFilePath, 'utf8');
        const cleanValue = value ? value.trim() : "";
        
        // Escape karakter khusus untuk string JavaScript
        const escapedValue = cleanValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        
        // Pattern lebih spesifik untuk mencari key di dalam module.exports
        const exportPattern = /module\.exports\s*=\s*{([\s\S]*?)}/;
        const match = fileContent.match(exportPattern);
        
        if (!match) {
            console.error(chalk.red(`[SETTINGS] ❌ Format module.exports tidak ditemukan!`));
            return false;
        }
        
        const innerContent = match[1];
        const keyPattern = new RegExp(`(${key}\\s*[=:]\\s*['"])([^'"]*)(['"])`, 'i');
        const keyMatch = innerContent.match(keyPattern);
        
        let newInnerContent;
        
        if (keyMatch) {
            // Key sudah ada, replace value-nya
            newInnerContent = innerContent.replace(keyPattern, `$1${escapedValue}$3`);
            
        } else {
            // Key belum ada, tambahkan ke akhir object sebelum penutup }
            let trimmedInner = innerContent.trim();
            
            // Tambahkan koma jika inner content tidak kosong dan tidak berakhir dengan koma
            if (trimmedInner.length > 0 && !trimmedInner.endsWith(',') && !trimmedInner.endsWith('{')) {
                trimmedInner += ',';
            }
            
            // Tambahkan key baru
            newInnerContent = trimmedInner + `\n    ${key}: '${escapedValue}',`;
            
        }
        
        // Reconstruct the entire file content
        const newContent = fileContent.replace(exportPattern, `module.exports = {${newInnerContent}\n}`);
        
        fs.writeFileSync(settingsFilePath, newContent, 'utf8');
        
        // Update cache settings
        if (settings[key] !== undefined) {
            settings[key] = cleanValue;
        }
        
        return true;
        
    } catch (err) {
        console.error(chalk.red(`[SETTINGS] ❌ Gagal update ${key}:`), err.message);
        return false;
    }
};

const updateSettingSilent = (key, value) => {
    const cleanValue = value ? value.trim() : "";
    
    // Clear cache sebelum membaca ulang
    delete require.cache[require.resolve('./settings.js')];
    
    const success = writeSettingToFileSync(key, cleanValue);
    
    if (success) {
        // Force reload settings
        delete require.cache[require.resolve('./settings.js')];
        const newSettings = require('./settings.js');
        
        // Update global settings object
        Object.keys(newSettings).forEach(k => {
            settings[k] = newSettings[k];
        });
    }
    
    return success;
};

// ==================================== //
// ========== STATE MANAGEMENT ======== //
// ==================================== //

let userState = new Map(); // Gunakan Map untuk lebih efisien

const resetUserState = (userId) => {
    userState.delete(userId);
};

const setUserState = (userId, type, data = {}) => {
    const state = {
        type: type,
        data: data,
        step: 'awaiting_input',
        timestamp: Date.now()
    };
    userState.set(userId, state);
    return state;
};

const getUserState = (userId) => {
    return userState.get(userId);
};

// Cleanup old states setiap 30 menit
setInterval(() => {
    const now = Date.now();
    const THIRTY_MINUTES = 30 * 60 * 1000;
    
    for (const [userId, state] of userState.entries()) {
        if (now - state.timestamp > THIRTY_MINUTES) {
            userState.delete(userId);
        }
    }
}, 1800000);
// ==================================== //
// ========== BOT INITIALIZE ========== //
// ==================================== //

const initializeBot = async () => {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    fs.mkdirSync(SS_DIR, { recursive: true });
    
    try {
        // Deteksi display VNC
        let headlessMode = 'new';
        let displayArgs = [];
        
        try {
            const { execSync } = require('child_process');
            execSync('xdpyinfo -display :1 > /dev/null 2>&1');
            headlessMode = false;
            displayArgs = ['--display=:1'];
        } catch (e) {
            headlessMode = 'new';
        }

        // --- PERBAIKAN PATH CHROMIUM ---
        let chromePath = '/usr/bin/chromium';
        if (!fs.existsSync(chromePath)) {
            chromePath = '/usr/bin/chromium-browser'; // Coba nama alternatif
        }
        // -------------------------------
        
        // Launch browser dengan args
        const browserArgs = [
            ...displayArgs,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote',
            '--window-size=1920,1080',
            '--start-maximized',
            '--incognito',
            '--disable-blink-features=AutomationControlled',
            '--lang=en-US,en',
            '--no-default-browser-check',
            '--no-first-run',
            '--timezone-id=Asia/Jakarta',
            '--disable-features=IsolateOrigins,site-per-process'
        ];
        
        browser = await puppeteerExtra.launch({
            executablePath: chromePath, // Menggunakan variabel chromePath
            headless: headlessMode,
            args: browserArgs,
            ignoreDefaultArgs: ['--enable-automation'],
            defaultViewport: null
        });
        
        isBrowserReady = true;
        console.log(chalk.green(`[STATUS] ✔️ BROWSER ACTIVED`));
        
        // Cek apakah sudah ada credentials
        if (!settings.IVAS_USERNAME || !settings.IVAS_PASSWORD) {
            console.log(chalk.yellow("[STATUS] ⚠️ Login credentials not found"));
            const readline = rl.createInterface({ input: process.stdin, output: process.stdout });
            
            let username = '';
            while (!username) {
                username = await (await readline.question(chalk.cyan("Masukkan Username/Email IVASMS: "))).trim();
                if (!username) console.log(chalk.red("❌ Username tidak boleh kosong"));
            }
            
            let password = '';
            while (!password) {
                password = await (await readline.question(chalk.cyan("Masukkan Password IVASMS: "), { hideEchoBack: true })).trim();
                if (!password) console.log(chalk.red("❌ Password tidak boleh kosong"));
            }
            
            readline.close();
            
            writeSettingToFileSync('IVAS_USERNAME', username);
            writeSettingToFileSync('IVAS_PASSWORD', password);
            
            console.log(chalk.green("[STATUS] ✅ Credentials saved"));
        }
        
        // Cek User Agent (Sesuai permintaan: Jika kosong atau kurang dari 20 karakter)
        if (!settings.CURRENT_USER_AGENT || settings.CURRENT_USER_AGENT === '' || settings.CURRENT_USER_AGENT.length < 20) {
            console.log(chalk.yellow("[STATUS] ⚠️ User Agent not found or empty in settings.js"));
            const readline = rl.createInterface({ input: process.stdin, output: process.stdout });
            
            let valid = false;
            let userAgent = "";
            while (!valid) {
                userAgent = await (await readline.question(chalk.cyan("Masukkan User Agent (Full): "))).trim();
                if (userAgent.length >= 20) valid = true;
                else console.log(chalk.red("❌ User Agent terlalu pendek"));
            }
            
            readline.close();
            writeSettingToFileSync('CURRENT_USER_AGENT', userAgent);
            settings.CURRENT_USER_AGENT = userAgent; // Update memori
            console.log(chalk.green("[STATUS] ✅ User Agent saved"));
        }
        
        await bot.launch({
            dropPendingUpdates: true,
            polling: {
                timeout: 60
            }
        });

        // Panggil langsung connectRobustLiveSms setelah browser siap
        console.log(chalk.cyan("[STATUS] 🔍 Auto-connecting to Live SMS..."));
        
        // Auto-connect langsung tanpa timeout
        try {
            const connected = await connectRobustLiveSms();
            if (connected) {
                console.log(chalk.green("[STATUS] ✅ Auto-connect successful!"));
                isPollingActive = true;
            } else {
                console.log(chalk.yellow("[STATUS] ⚠️ Auto-connect failed. Use /login to connect manually."));
            }
        } catch (error) {
            console.log(chalk.red("[STATUS] ❌ Auto-connect error:"), error.message);
        }
        
    } catch (e) {
        isBrowserReady = false;
        console.error(chalk.red("❌ Initialization failed:"), e.message);
        process.exit(1);
    }

    console.log(chalk.blue(`[STATUS] 🚀 ${PROJECT_NAME} Started...`));  
};



// ==================================== //
// ========== POPUP HANDLER =========== //
// ==================================== //

const handlePopupAndTutorial = async (page) => {
    try {
      
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        await page.evaluate(() => {
            const closeModal = () => {
                const modals = document.querySelectorAll('.modal');
                modals.forEach(modal => {
                    const closeBtn = modal.querySelector('[data-dismiss="modal"], .close, [aria-label="Close"]');
                    if (closeBtn) {
                        closeBtn.click();
                    } else if (modal.style.display === 'block' || modal.classList.contains('show')) {
                        modal.style.display = 'none';
                        modal.classList.remove('show');
                    }
                });
                
                const backdrops = document.querySelectorAll('.modal-backdrop');
                backdrops.forEach(backdrop => {
                    backdrop.remove();
                });
            };
            
            closeModal();
            
            if (window.driver && window.driverObj) {
                try {
                    window.driverObj.reset();
                } catch (e) {}
            }
            
            const driverElements = document.querySelectorAll('.driver-popover, .driver-overlay');
            driverElements.forEach(el => {
                el.remove();
            });
            
            if (window.Swal && Swal.getPopup()) {
                Swal.close();
            }
            
            document.body.click();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            
            localStorage.setItem('sms-totorial-completed', 'true');
            localStorage.setItem('sms-totorial-status', 'closed');
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await page.evaluate(() => {
            const closeBtn = document.querySelector('[data-dismiss="modal"]');
            if (closeBtn) {
                closeBtn.click();
            }
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return true;
        
    } catch (error) {
        console.log('Error handling popup:', error.message);
        return false;
    }
};

// ==================================== //
// ========== VARIABLES =============== //
// ==================================== //

let sentMessageHashes = new Set();
let isFirstPoll = true;
let hasScreenshotBeenSent = false;
let isConnecting = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;
let lastConnectionError = null;
let connectionErrorLogTime = 0;
const CONNECTION_ERROR_COOLDOWN = 120000;
let webSocketMonitorActive = false;
let stableConnectionStartTime = 0;
let lastSuccessfulCheck = 0;
let isConnectionStable = false;
let pageValidationInterval = null;

// ==================================== //
// ========== HELPERS ================= //
// ==================================== //

const maskPhoneNumber = (num) => {
    if (!num) return 'N/A';
    
    // PERBAIKAN LOGIKA MASKING: Sesuai instruksi lu
    // Jika panjang nomor kurang dari 8 -> 3 depan, sisanya bintang, 4 belakang
    if (num.length < 8) {
        return num.slice(0, 3) + '*'.repeat(Math.max(0, num.length - 7)) + num.slice(-4);
    } 
    
    // Jika panjang nomor 8 atau lebih -> 4 depan, sisanya bintang, 4 belakang
    return num.slice(0, 4) + '*'.repeat(Math.max(0, num.length - 8)) + num.slice(-4);
};

const escapeHtml = (text) => text ? text.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])) : '';

// ==================================== //
// ========== CONNECTION ============== //
// ==================================== //

const markConnectionStable = () => { 
    isConnectionStable=true; 
    stableConnectionStartTime=Date.now(); 
    connectionAttempts=0; 
    disconnectAlertSent=false; 
};

const markConnectionUnstable = () => { 
    isConnectionStable=false; 
    console.log(chalk.yellow('[STABILITY] ⚠️ Connection UNSTABLE')); 
};

const shouldAttemptReconnect = () => {
    const now = Date.now();
    
    // Jika sudah stable, jangan reconnect kecuali benar-benar disconnect
    if (isConnectionStable && (now - lastSuccessfulCheck < 30000)) {
        return false;
    }
    
    // Cooldown setelah error
    if ((now - connectionErrorLogTime) < 120000) {
        return false;
    }
    
    // Batasi jumlah attempts
    if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
        return false;
    }
    
    // Hanya reconnect jika polling aktif
    return isPollingActive;
};

const maintainConnection = async () => {
    if (isConnecting || !isPollingActive) return;
    
    // Jika connection stable, cukup validasi sesekali
    if (isConnectionStable && liveSmsPage) {
        // Validasi setiap 2 menit saja
        if (Date.now() - lastSuccessfulCheck > 120000) {
            await validatePage();
        }
        return;
    }
    
    // Jika unstable atau tidak ada connection, coba reconnect
    if (shouldAttemptReconnect()) {
        console.log(chalk.yellow('[MAINTENANCE] 🔄 Attempting reconnection...'));
        await connectRobustLiveSms();
    }
};

// ==================================== //
// ========== PAGE VALIDATION ========= //
// ==================================== //

const validatePage = async () => {
    if (!liveSmsPage) { 
        markConnectionUnstable(); 
        return false; 
    }
    try {
        const pageState = await liveSmsPage.evaluate(() => ({
            url: window.location.href,
            hasWebSocket: typeof WebSocket!=='undefined'
        })).catch(()=>null);
        if (!pageState||!pageState.url.includes(LIVE_SMS_URL)||!pageState.hasWebSocket){ 
            markConnectionUnstable(); 
            return false; 
        }
        lastSuccessfulCheck=Date.now();
        if (!isConnectionStable && (Date.now()-stableConnectionStartTime>300000)) markConnectionStable();
        return true;
    } catch { 
        markConnectionUnstable(); 
        return false; 
    }
};

// ==================================== //
// ========== FETCH & PARSE =========== //
// ==================================== //

const fetchSimpleSMS = async () => {
    if(!liveSmsPage) return [];
    const winMsgs = await liveSmsPage.evaluate(() => window._simpleSMS || []).catch(() => []);
    let globMsgs = []; 
    if(global.simpleSMSBuffer) { 
        globMsgs = global.simpleSMSBuffer.map(i => i.data); 
        global.simpleSMSBuffer = []; 
    }
    return [...winMsgs, ...globMsgs];
};

const parseSimpleSMS = data => {
    try {
        const msg = data.message || '';
        const orig = data.originator || '';
        const rec = data.recipient || '';
        const range = data.range || '';
        let country = range.replace(/\s+\d+$/, '').trim() || 'Unknown';
        let otp = (msg.match(/(\d{3}[- ]?\d{3})|(\d{4,8})/) || [])[0]?.replace(/[-\s]/g, '') || '';
        let service = orig.toLowerCase().includes('whatsapp') || msg.toLowerCase().includes('whatsapp') ? 'WhatsApp' :
                    orig.toLowerCase().includes('telegram') || msg.toLowerCase().includes('telegram') ? 'Telegram' :
                    orig.toLowerCase().includes('google') || msg.toLowerCase().includes('google') ? 'Google' :
                    orig.toLowerCase().includes('facebook') || msg.toLowerCase().includes('facebook') ? 'Facebook' : orig;
        return { 
            time: new Date().toLocaleTimeString('id-ID'),
            country, 
            number: rec, 
            msg, 
            service, 
            otp, 
            originator: orig, 
            range, 
            source: 'websocket' 
        };
    } catch { 
        return null; 
    }
};

// ==================================== //
// ========== SOCKET.IO MONITOR ======= //
// ==================================== //

const setupEnhancedSocketIOMonitoring = async () => {
    if (!liveSmsPage) return;
    
    try {
        // 1. Ekspos fungsi ke Node.js untuk notifikasi Telegram
        // PERBAIKAN: Menggunakan 'parsed' karena 'msg' belum didefinisikan di console.log awal
        await liveSmsPage.exposeFunction('onSMSReceived', (smsData) => {
            const parsed = parseSimpleSMS(smsData);
            if (parsed) {
                console.log(chalk.bold.green(`\n[ 💬 ] [ NEW SMS RECIEVED ] ${parsed.country} - ${parsed.service} \n`));
                sendMessageNotification(parsed);
            }
        });

        await liveSmsPage.evaluateOnNewDocument(() => {
            const OriginalWebSocket = window.WebSocket;
            window.WebSocket = function(url, protocols) {
                const ws = new OriginalWebSocket(url, protocols);
                
                console.log('%c[SYSTEM] WebSocket Connection Attempt: ' + url, 'color: blue');

                ws.addEventListener('message', (event) => {
                    const rawData = event.data;
                    
                    // Cek apakah data mengandung livesms seperti di screenshot log Anda
                    if (typeof rawData === 'string' && rawData.includes('livesms')) {
                        console.log('%c[DEBUG-WS] Data Masuk: ' + rawData, 'color: cyan');
                        
                        try {
                            // Ekstrak array JSON dari format 42/livesms,[...]
                            const jsonMatch = rawData.match(/\[.*\]/);
                            if (jsonMatch) {
                                const payload = JSON.parse(jsonMatch[0]);
                                if (Array.isArray(payload)) {
                                    // Cari objek yang punya property message
                                    const smsObj = payload.find(i => i && typeof i === 'object' && i.message);
                                    if (smsObj) {
                                        window.onSMSReceived(smsObj);
                                    }
                                }
                            }
                        } catch (e) {
                            console.error('Parse Error:', e);
                        }
                    }
                });
                return ws;
            };
            window.WebSocket.prototype = OriginalWebSocket.prototype;
        });

        await liveSmsPage.reload({ waitUntil: 'networkidle2' });
        
        webSocketMonitorActive = true;
        console.log(chalk.bold.green('[SOCKET] ✅ RECIEVED BOT ACTIVATED'));

    } catch (error) {
        console.log(chalk.red('[SOCKET] ❌ ERROR: ' + error.message));
    }
};



// ==================================== //
// ========== ROBUST CONNECT ========== //
// ==================================== //

const updateBotStatus = (status, isError = false) => {
    const prevStatus = botStatus;
    botStatus = status;
    lastCheckTime = new Date().toLocaleTimeString('id-ID');
    
    // Log hanya jika status berubah atau error
    if (prevStatus !== status || isError) {
        const timestamp = new Date().toLocaleTimeString('id-ID');
        if (isError) {
            console.log(chalk.red(`[STATUS] ❌ ${status} - ${timestamp}`));
        } else {

        }
    }
};

const connectRobustLiveSms = async () => {
    if (isConnecting) {
        console.log(chalk.yellow('[CONNECT] ⏳ ALREADY CONNECTING...'));
        return false;
    }
    
    isConnecting = true;
    connectionAttempts++;

    try {
        updateBotStatus('CONNECTING...');
        console.log(chalk.yellow(`[CONNECT] 🔄 CONNECTING... ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}`));

        if (!settings.CF_CLEARANCE_VALUE || settings.CF_CLEARANCE_VALUE.length < 10) {
            throw new Error('CF Clearance tidak valid');
        }

        if (liveSmsPage) {
            try { await liveSmsPage.close(); } catch (e) {}
        }

        liveSmsPage = await browser.newPage();
        
        await liveSmsPage.setDefaultTimeout(20000);
        await liveSmsPage.setDefaultNavigationTimeout(30000);
await liveSmsPage.setViewport({ width: 1920, height: 1080 });
        await liveSmsPage.setUserAgent(settings.CURRENT_USER_AGENT);
        
        await liveSmsPage.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        await liveSmsPage.setCookie({
            name: 'cf_clearance',
            value: settings.CF_CLEARANCE_VALUE,
            domain: '.ivasms.com',
            path: '/',
            httpOnly: true,
            secure: true
        });

        console.log(chalk.cyan('[CONNECT] 🌐 NAVIGATING TO IVASMS...'));
        
        let response = await liveSmsPage.goto(LIVE_SMS_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 45000
        });

        console.log(chalk.cyan(`[CONNECT] 📊 Status : ${response ? response.status() : 'N/A'}`));

        if (response && (response.status() === 403 || response.status() === 429)) {
            console.log(chalk.red('[CONNECT] ❌ DIBLOKIR CLOUDFLARE: HTTP ' + response.status()));
            throw new Error('CLOUDFLARE BLOCK - HTTP ' + response.status());
        }

        await new Promise(r => setTimeout(r, 2000));
        
        const hasCloudflare = await liveSmsPage.evaluate(() => {
            const bodyText = document.body.innerText || '';
            return bodyText.includes('Checking your browser') || 
                   bodyText.includes('Just a moment');
        }).catch(() => false);
        
        if (hasCloudflare) {
            throw new Error('Cloudflare challenge muncul.');
        }

        const currentUrl = liveSmsPage.url();
        
        if (currentUrl.includes('/login')) {
            console.log(chalk.yellow('[CONNECT] 🔑 LOGIN TO IVASMS...'));
            
            if (!settings.IVAS_USERNAME || !settings.IVAS_PASSWORD) {
                throw new Error('Username atau password tidak ditemukan.');
            }
           
            console.log(chalk.cyan('[CONNECT] 📧 YOUR IVAS ACCOUNT :', settings.IVAS_USERNAME));
            
            await new Promise(r => setTimeout(r, 2000));
            
            let usernameSelector = null;
            const usernameSelectors = [
                'input[type="email"]', 'input[name="email"]', 'input[name="username"]',
                'input[autocomplete="username"]', 'input[autocomplete="email"]',
                'input[placeholder*="email" i]', 'input[placeholder*="username" i]'
            ];
            
            for (const selector of usernameSelectors) {
                try {
                    const exists = await liveSmsPage.$(selector);
                    if (exists) { usernameSelector = selector; break; }
                } catch (e) {}
            }
            
            if (usernameSelector) {
                try {
                    await liveSmsPage.focus(usernameSelector);
                    await liveSmsPage.evaluate((s) => { document.querySelector(s).value = ''; }, usernameSelector);
                    await liveSmsPage.type(usernameSelector, settings.IVAS_USERNAME, { delay: 20 });
                } catch (e) {}
            }
            
            await new Promise(r => setTimeout(r, 500));
            
            try {
                const passwordSelector = 'input[type="password"]';
                await liveSmsPage.focus(passwordSelector);
                await liveSmsPage.evaluate(() => { document.querySelector('input[type="password"]').value = ''; });
                await liveSmsPage.type(passwordSelector, settings.IVAS_PASSWORD, { delay: 20 });
            } catch (e) {}
            
            await new Promise(r => setTimeout(r, 500));
            
            try {
                const submitButton = await liveSmsPage.$('button[type="submit"], input[type="submit"]');
                if (submitButton) {
                    await submitButton.click();
                } else {
                    await liveSmsPage.keyboard.press('Enter');
                }
            } catch (e) {
                await liveSmsPage.keyboard.press('Enter');
            }
            
            // Tunggu navigasi selesai
            try {
                await liveSmsPage.waitForNavigation({ 
                    waitUntil: 'domcontentloaded',
                    timeout: 15000 
                });
            } catch (e) {
                console.log(chalk.yellow('[CONNECT] ⚠️ TIME OUT OR NO NAV AFTER LOGIN...'));
            }
            
            await new Promise(r => setTimeout(r, 2000));
            
            // --- VALIDASI LOGIN BERHASIL ATAU TIDAK ---
            const afterLoginUrl = liveSmsPage.url();
            if (afterLoginUrl.includes('/login')) {
                console.log(chalk.red('[CONNECT] ❌ LOGIN GAGAL: Username atau Password Salah!'));
                throw new Error('Username atau password tidak valid (Masih di halaman login)');
            }
            
            console.log(chalk.green('[CONNECT] ✅ LOGIN BERHASIL'));

            const cookies = await liveSmsPage.cookies();
            const newCfCookie = cookies.find(c => c.name === 'cf_clearance');
            if (newCfCookie && newCfCookie.value !== settings.CF_CLEARANCE_VALUE) {
                settings.CF_CLEARANCE_VALUE = newCfCookie.value;
                writeSettingToFileSync('CF_CLEARANCE_VALUE', newCfCookie.value);
            }
            
            if (!afterLoginUrl.includes('/live/my_sms')) {
                await liveSmsPage.goto(LIVE_SMS_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
            }
        }

        const finalUrl = liveSmsPage.url();
        if (!finalUrl.includes('/live/my_sms')) {
            response = await liveSmsPage.goto(LIVE_SMS_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
            if (!response || response.status() >= 400) {
                throw new Error(`Gagal akses Live SMS. Status: ${response ? response.status() : 'N/A'}`);
            }
        }

        await new Promise(r => setTimeout(r, 1000));
        await handlePopupAndTutorial(liveSmsPage);
        await setupEnhancedSocketIOMonitoring();

        markConnectionStable();
        updateBotStatus('Live SMS Ready');
        isPollingActive = true;
        
        return true;

    } catch (error) {
        console.error(chalk.red(`[CONNECT] ❌ Error: ${error.message}`));
        markConnectionUnstable();
        updateBotStatus(`Error: ${error.message.substring(0, 30)}...`, true);
        isPollingActive = false;
        return false;
    } finally {
        isConnecting = false;
    }
};


// ==================================== //
// ========== POLLING ================= //
// ==================================== //

const checkStableMessages = async () => {
    if(isConnecting || !isBrowserReady || !liveSmsPage || !isPollingActive) return;
    const rawMessages = await fetchSimpleSMS();
    const newMessages = [];
    for(const m of rawMessages){ 
        const parsed = parseSimpleSMS(m); 
        if(parsed){ 
            const h = `${parsed.number}-${parsed.service}-${parsed.msg.substring(0,50)}`; 
            if(!sentMessageHashes.has(h)){ 
                newMessages.push(parsed); 
                sentMessageHashes.add(h); 
                await sendMessageNotification(parsed); 
            } 
        } 
    }
};
setInterval(checkStableMessages, 10000);

// ==================================== //
// ========== NOTIFICATION ============ //
// ==================================== //

let lastSMSLogTime = 0;
const SMS_LOG_COOLDOWN = 1000;

const sendMessageNotification = async (msg) => {
    try {
        const now = Date.now();
        if (now - lastSMSLogTime < SMS_LOG_COOLDOWN) return;
        lastSMSLogTime = now;
        
        const countryFlag = getCountryFlag(msg.country);
        const masked = maskPhoneNumber(msg.number);
        const otpText = msg.otp
  ? `<blockquote>🔐 <b>𝗣𝗔𝗦𝗦𝗖𝗢𝗗𝗘</b> : <code>${msg.otp}</code></blockquote>`
  : '';
        
        const text = `<blockquote><b>💥 𝗡𝗘𝗪 ${msg.service} ${countryFlag}</b></blockquote>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>📱 𝗡𝘂𝗺𝗯𝗲𝗿 :</b> <i>${masked}</i>       
${otpText}
<b>🌍 𝗖𝗼𝘂𝗻𝘁𝗿𝘆 :</b> ${countryFlag} - ${msg.country}
<b>⚙️ 𝗦𝗲𝗿𝘃𝗶𝗰𝗲 :</b> ${msg.service}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b><blockquote>💬 𝗙𝘂𝗹𝗹 𝗠𝗲𝘀𝘀𝗮𝗴𝗲</blockquote></b>
<i><blockquote>${escapeHtml(msg.msg)}</blockquote></i>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b><i>⏰ 𝘁𝗶𝗺𝗲 : ${msg.time}</i></b>`;
        
        const keyboard = Markup.inlineKeyboard([
        
  [
    Markup.button.url('🚨 𝘾𝙃𝘼𝙉𝙉𝙀𝙇𝙎', settings.MAIN_CHANNEL_LINK || '#'),
    Markup.button.url('📂 𝙉𝙐𝙈𝘽𝙀𝙍𝙎', settings.NUMBER_GROUP_LINK || '#')
  ],
  [
    Markup.button.url('👑 𝙊𝙒𝙉𝙀𝙍 𝘽𝙊𝙏', settings.BOT_OWNER_LINK || '#')
  ]
]);
        // Mengirim ke banyak grup
        const chatIds = Array.isArray(settings.CHAT_ID) ? settings.CHAT_ID : [settings.CHAT_ID];
        
        for (const id of chatIds) {
            try {
                await bot.telegram.sendMessage(id, text, { 
                    parse_mode: 'HTML', 
                    reply_markup: keyboard.reply_markup 
                });
            } catch (err) {
                console.error(chalk.red(`[SMS] ❌ Gagal kirim ke ID ${id}: ${err.message}`));
            }
        }
        
    } catch (error) {
        console.error(chalk.red(`[SMS] ❌ Error sending notification: ${error.message}`));
    }
};



// ==================================== //
// ========== PROGRESS BAR SYSTEM ===== //
// ==================================== //

const createProgressBar = (current, total, length = 20) => {
  const percentage = current / total;
  const filledLength = Math.round(length * percentage);
  const emptyLength = length - filledLength;
  
  const filledBar = '█'.repeat(filledLength);
  const emptyBar = '░'.repeat(emptyLength);
  
  return `[${filledBar}${emptyBar}] ${Math.round(percentage * 100)}%`;
};

const updateRangeStatus = async (ctx, waitMsg, statusText, currentStep = 0, totalSteps = 10) => {
  try {
    const currentTime = new Date().toLocaleTimeString('id-ID');
    let progressBar = '';
    
    if (totalSteps > 0 && currentStep > 0) {
      progressBar = createProgressBar(currentStep, totalSteps);
    }
    
    const updatedText = `<blockquote>⏳ <b>Sedang Menganalisis Range</b></blockquote>\n\n${progressBar}\n\n🕐 <i>Last update : ${currentTime}</i>`;
    
    await ctx.telegram.editMessageText(
      ctx.chat.id, 
      waitMsg.message_id, 
      null, 
      updatedText, 
      { parse_mode: 'HTML' }
    );
   
  } catch (error) {
    console.log(`[STATUS] ${statusText}`);
  }
};

const handleRangeError = async (ctx, waitMsg, error) => {
  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
  } catch (e) {}
  
  await ctx.replyWithHTML(
    `<blockquote>❌ Gagal melakukan analisis range</blockquote>\n\n<code>${error.message}</code>`,
    { reply_to_message_id: ctx.message.message_id }
  );
};

// ==================================== //
// ========== RANGE CHECK SYSTEM ====== //
// ==================================== //

const extractTableDataFromPage = async (page) => {
    return await page.evaluate(() => {
        const cleanText = (txt) => {
            if (!txt) return '';
            let t = txt;
            t = t.replace(/function\s+[\s\S]*/gi, "");
            t = t.replace(/\$\([\s\S]*/gi, "");
            t = t.replace(/Swal[\s\S]*/gi, "");
            t = t.replace(/<\/?[^>]+>/g, "");
            t = t.replace(/\s{2,}/g, " ");
            t = t.trim();
            if (t.endsWith("(")) t = t + ")";
            return t;
        };

        const results = [];
        const table = document.querySelector('#clientsmshistory-table');
        if (!table) return results;

        const tbody = table.querySelector('tbody');
        if (!tbody) return results;

        const rows = tbody.querySelectorAll('tr');

        rows.forEach(row => {
            try {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 5) {
                    const rangeCell = cells[0];
                    const testNumberCell = cells[1];
                    const sidCell = cells[2];
                    const messageCell = cells[3];
                    const timeCell = cells[4];

                    const rangeText = cleanText(rangeCell.textContent?.trim() || '');
                    const testNumber = cleanText(testNumberCell.textContent?.trim() || '');
                    const sid = cleanText(sidCell.textContent?.trim() || '');
                    const message = cleanText(messageCell.textContent?.trim() || '');
                    const time = cleanText(timeCell.textContent?.trim() || '');

                    if (!rangeText || !sid) return;

                    let country = 'UNKNOWN';
                    const match = rangeText.match(/^([A-Za-z\s]+)/);
                    if (match) {
                        country = match[1].trim().toUpperCase();
                    }

                    results.push({
                        Range: rangeText,
                        TestNumber: testNumber,
                        SID: sid,
                        Message: message,
                        Time: time,
                        Country: country,
                        SSID: sid.toUpperCase()
                    });
                }
            } catch (e) {}
        });

        return results;
    });
};

const checkAndClickNextPage = async (page) => {
    try {
        const clicked = await page.evaluate(() => {
            const nextLi = document.querySelector("#clientsmshistory-table_next");
            if (!nextLi) return false;

            if (nextLi.classList.contains("disabled")) return false;

            const a = nextLi.querySelector("a");
            if (a) {
                a.click();
                return true;
            }
            return false;
        });

        if (!clicked) return false;

        await new Promise(resolve => setTimeout(resolve, 8000));

        const loaded = await page.evaluate(() => {
            const tbody = document.querySelector("#clientsmshistory-table tbody");
            if (!tbody) return false;
            return tbody.querySelectorAll("tr").length > 0;
        });

        if (!loaded) {
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        return true;

    } catch (e) {
        console.error('[STATUS] Error in checkAndClickNextPage:', e.message);
        return false;
    }
};

const waitForTableData = async (page) => {
    try {
        // Tunggu sampai DataTables terinisialisasi
        await page.waitForFunction(() => {
            return typeof $ !== 'undefined' && 
                   $.fn.dataTable && 
                   $('#clientsmshistory-table').length > 0 &&
                   $('#clientsmshistory-table').DataTable();
        }, { timeout: 30000 });
        
        // Tunggu sampai ada data di tabel
        await page.waitForFunction(() => {
            const dataTable = $('#clientsmshistory-table').DataTable();
            return dataTable && dataTable.rows && dataTable.rows().count() > 0;
        }, { timeout: 30000 });
        
        return true;
    } catch (error) {
        console.log('[STATUS] ❌ Timeout menunggu DataTables:', error.message);
        
        // Coba pendekatan alternatif: tunggu elemen tabel muncul
        try {
            await page.waitForSelector('#clientsmshistory-table', { timeout: 10000 });
            await page.waitForSelector('#clientsmshistory-table tbody tr', { timeout: 20000 });
            console.log('[STATUS] ✅ Data range berhasil ditemukan');
            return true;
        } catch (e) {
            console.log('[STATUS] ⛔ Data range gagal ditemukan');
            return false;
        }
    }
};

const downloadAndAnalyzeRangeData = async (service, country, ctx, waitMsg) => {
    if (!isBrowserReady || !browser) {
        throw new Error("Browser tidak ready.");
    }
    
    let page = null;
    let allResults = [];
    
    try {
        // Step 1: Membuka browser
        await updateRangeStatus(ctx, waitMsg, "🔄 Membuka halaman range test...", 1, 10);
       
        page = await browser.newPage();
        await page.setDefaultNavigationTimeout(300000);
        await page.setDefaultTimeout(120000);
        await page.setViewport({ width: 1920, height: 1080 });
        
        const userAgent = settings.CURRENT_USER_AGENT;
        await page.setUserAgent(userAgent);
        
        if (settings.CF_CLEARANCE_VALUE && settings.IVAS_SESSION_VALUE && settings.XSRF_TOKEN_VALUE) {
            const cookies = [
                { name: 'cf_clearance', value: settings.CF_CLEARANCE_VALUE, domain: '.ivasms.com' },
                { name: 'ivas_sms_session', value: settings.IVAS_SESSION_VALUE, domain: '.ivasms.com' },
                { name: 'XSRF-TOKEN', value: settings.XSRF_TOKEN_VALUE, domain: '.ivasms.com' }
            ];
            await page.setCookie(...cookies);
        }
        
        let targetUrl = service === 'all'
            ? RANGE_BASE_URL
            : `${RANGE_BASE_URL}?app=${service}`;
        
        // Step 2: Mengakses URL
        await updateRangeStatus(ctx, waitMsg, `🌐 Mengakses: ${targetUrl}`, 2, 10);
        
        const response = await page.goto(targetUrl, {
            waitUntil: 'networkidle0',
            timeout: 120000
        });
        
        const status = response ? response.status() : 'N/A';
        
        if (status >= 400) {
            throw new Error(`Halaman error dengan status: ${status}`);
        }
        
        // Step 3: Menunggu load
        await updateRangeStatus(ctx, waitMsg, "⏳ Menunggu halaman selesai load...", 3, 10);
        await new Promise(r => setTimeout(r, 15000));
        
        // Step 4: Handle popup
        await updateRangeStatus(ctx, waitMsg, "🛡️ Menangani popup/tutorial...", 4, 10);
        await handlePopupAndTutorial(page);
        await new Promise(r => setTimeout(r, 5000));
        
        // Step 5: Clear filter
        await updateRangeStatus(ctx, waitMsg, "🧹 Membersihkan filter search...", 5, 10);
        await clearSearchFilter(page);
        await new Promise(r => setTimeout(r, 5000));
        
        if (country !== 'all') {
            // Step 6: Search country
            await updateRangeStatus(ctx, waitMsg, `🔎 Mencari negara: ${country}`, 6, 10);
            let ok = await searchCountryInTable(page, country);
            if (!ok) {
                const cap = country.charAt(0).toUpperCase() + country.slice(1);
                await searchCountryInTable(page, cap);
            }
            await new Promise(r => setTimeout(r, 10000));
        } else {
            await updateRangeStatus(ctx, waitMsg, "🌍 Menganalisis semua negara...", 6, 10);
        }
        
        // Step 7: Cari tabel
        await updateRangeStatus(ctx, waitMsg, "🔍 Mencari tabel data...", 7, 10);
        await new Promise(r => setTimeout(r, 10000));
        
        const tableExists = await page.evaluate(() => {
            return !!document.querySelector('#clientsmshistory-table');
        });
        
        if (!tableExists) {
            throw new Error("Tabel tidak ditemukan setelah load.");
        }

        // Step 8: Pastikan halaman 1
        await updateRangeStatus(ctx, waitMsg, "📄 Memastikan berada di halaman 1...", 8, 10);
        await page.waitForSelector('#clientsmshistory-table', { timeout: 20000 });

        await page.evaluate(() => {
            if (typeof $ !== 'undefined' && $.fn.dataTable) {
                try {
                    $('#clientsmshistory-table').DataTable().page(0).draw('page');
                } catch(e) {}
            }
        });

        await new Promise(r => setTimeout(r, 5000));

        // Step 9: Baca halaman 1
        await updateRangeStatus(ctx, waitMsg, "📊 Membaca data dari halaman 1...", 9, 10);
        await new Promise(r => setTimeout(r, 8000));
        
        let pageResults = await extractTableDataFromPage(page);
        allResults = [...pageResults];
        
        if (allResults.length === 0) {
            throw new Error(`Tidak ada data yang ditemukan untuk service ${service} dan negara ${country}.`);
        }
        
        await updateRangeStatus(ctx, waitMsg, `✅ Halaman 1: ${allResults.length} data ditemukan`, 9, 10);
        
        // Step 10: Baca halaman berikutnya
        let pageNumber = 1;
        const maxPages = 5;
        let consecutiveNoData = 0;
        
        while (pageNumber < maxPages) {
            await updateRangeStatus(ctx, waitMsg, `⏭️ Mencoba halaman ${pageNumber + 1}...`, 10, 10);
            
            const nextOk = await checkAndClickNextPage(page);
            if (!nextOk) {
                await updateRangeStatus(ctx, waitMsg, `🏁 Tidak ada tombol next di halaman ${pageNumber + 1}.`, 10, 10);
                break;
            }
            
            await new Promise(r => setTimeout(r, 12000));
            
            const tableStillExists = await page.evaluate(() => {
                const tb = document.querySelector('#clientsmshistory-table tbody');
                if (!tb) return false;
                return tb.querySelectorAll('tr').length > 0;
            });
            
            if (!tableStillExists) {
                await updateRangeStatus(ctx, waitMsg, `⚠️ Tabel hilang di halaman ${pageNumber + 1}, retry...`, 10, 10);
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }
            
            pageResults = await extractTableDataFromPage(page);
            
            if (pageResults.length === 0) {
                consecutiveNoData++;
                await updateRangeStatus(ctx, waitMsg, `⏹️ Data kosong di halaman ${pageNumber + 1} (${consecutiveNoData}/3)`, 10, 10);
                if (consecutiveNoData >= 3) break;
                pageNumber++;
                continue;
            }
            
            consecutiveNoData = 0;
            
            allResults.push(...pageResults);
            
            await updateRangeStatus(ctx, waitMsg, `📥 Halaman ${pageNumber + 1}: +${pageResults.length} data, Total: ${allResults.length}`, 10, 10);
            
            pageNumber++;
            await new Promise(r => setTimeout(r, 3000));
        }
        
        await updateRangeStatus(ctx, waitMsg, `✅ Total ${allResults.length} data ditemukan dari ${pageNumber} halaman`, 10, 10);
        
        const result = analyzeRangeData(allResults, service, country);
        return result;
        
    } catch (error) {
        console.error('[STATUS] Download and Analyze Error:', error);
        if (page) {
            const debugPath = path.join(SS_DIR, `error_${Date.now()}.png`);
            await page.screenshot({ path: debugPath, fullPage: true });
        }
        throw error;
    } finally {
        if (page) {
            try {
                await clearSearchFilter(page);
                await new Promise(r => setTimeout(r, 3000));
                await page.close();
            } catch {}
        }
    }
};

const downloadAndAnalyzeAllRangeData = async (ctx, waitMsg) => {
    if (!isBrowserReady || !browser) {
        throw new Error("Browser tidak ready.");
    }
    
    let page = null;
    let allResults = [];
    
    try {
        // Step 1: Membuka browser
        await updateRangeStatus(ctx, waitMsg, "🔄 Membuka halaman range test...", 1, 10);
        
        page = await browser.newPage();
        
        await page.setDefaultNavigationTimeout(180000);
        await page.setDefaultTimeout(60000);
        await page.setViewport({ width: 1280, height: 1024, isMobile: false });
        
        const userAgent = settings.CURRENT_USER_AGENT;
        await page.setUserAgent(userAgent);
        
        if (settings.CF_CLEARANCE_VALUE && settings.IVAS_SESSION_VALUE && settings.XSRF_TOKEN_VALUE) {
            const cookies = [
                { name: 'cf_clearance', value: settings.CF_CLEARANCE_VALUE, domain: '.ivasms.com' },
                { name: 'ivas_sms_session', value: settings.IVAS_SESSION_VALUE, domain: '.ivasms.com' },
                { name: 'XSRF-TOKEN', value: settings.XSRF_TOKEN_VALUE, domain: '.ivasms.com' }
            ];
            await page.setCookie(...cookies);
        }
        
        const targetUrl = RANGE_BASE_URL;
        
        // Step 2: Mengakses URL
        await updateRangeStatus(ctx, waitMsg, `🌐 Mengakses: ${targetUrl}`, 2, 10);
        
        const response = await page.goto(targetUrl, {
            waitUntil: 'networkidle2',
            timeout: 90000
        });
        
        const status = response ? response.status() : 'N/A';
        
        if (status >= 400) {
            throw new Error(`Halaman error dengan status: ${status}`);
        }
        
        // Step 3: Menunggu load
        await updateRangeStatus(ctx, waitMsg, `✅ Halaman berhasil diakses. Status: ${status}`, 3, 10);
        await updateRangeStatus(ctx, waitMsg, "⏳ Menunggu halaman selesai load...", 4, 10);
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Step 4: Handle popup
        await updateRangeStatus(ctx, waitMsg, "🛡️ Menangani popup/tutorial...", 5, 10);
        await handlePopupAndTutorial(page);
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Step 5: Clear filter
        await updateRangeStatus(ctx, waitMsg, "🧹 Membersihkan filter search...", 6, 10);
        await clearSearchFilter(page);
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Step 6: Cari tabel
        await updateRangeStatus(ctx, waitMsg, "🔍 Mencari tabel data...", 7, 10);
        await new Promise(resolve => setTimeout(resolve, 7000));
        
        let tableFound = false;
        
        try {
            await page.waitForSelector('#clientsmshistory-table', { timeout: 30000 });
            tableFound = true;
        } catch (e) {
            tableFound = false;
        }
        
        if (!tableFound) {
            throw new Error("Tabel tidak ditemukan. Halaman mungkin tidak berhasil load.");
        }
        
        // Step 7: Baca halaman 1
        await updateRangeStatus(ctx, waitMsg, "📊 Membaca data dari halaman 1...", 8, 10);
        await new Promise(resolve => setTimeout(resolve, 7000));
        
        let pageResults = await extractTableDataFromPage(page);
        allResults = [...pageResults];
        
        if (allResults.length === 0) {
            throw new Error("Tidak ada data yang ditemukan untuk analisis semua range.");
        }
        
        await updateRangeStatus(ctx, waitMsg, `✅ Halaman 1: ${allResults.length} data ditemukan`, 8, 10);
        
        // Step 8-10: Baca halaman berikutnya
        let pageNumber = 1;
        const maxPages = 5;
        
        while (pageNumber < maxPages) {
            await updateRangeStatus(ctx, waitMsg, `⏭️ Mencoba halaman ${pageNumber + 1}...`, 9, 10);
            
            const hasNextPage = await checkAndClickNextPage(page);
            
            if (!hasNextPage) {
                await updateRangeStatus(ctx, waitMsg, `🏁 Tidak ada halaman lagi.`, 10, 10);
                break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 8000));
            
            pageResults = await extractTableDataFromPage(page);
            
            if (pageResults.length === 0) {
                await updateRangeStatus(ctx, waitMsg, `⏹️ Data kosong di halaman ${pageNumber + 1}.`, 10, 10);
                break;
            }
            
            const newResults = [];
            pageResults.forEach(newItem => {
                const isDuplicate = allResults.some(existingItem => 
                    existingItem.Range === newItem.Range && 
                    existingItem.TestNumber === newItem.TestNumber &&
                    existingItem.SID === newItem.SID
                );
                
                if (!isDuplicate) {
                    newResults.push(newItem);
                }
            });
            
            if (newResults.length === 0) {
                await updateRangeStatus(ctx, waitMsg, `⏹️ Tidak ada data baru di halaman ${pageNumber + 1}.`, 10, 10);
                break;
            }
            
            allResults.push(...newResults);
            await updateRangeStatus(ctx, waitMsg, `📥 Halaman ${pageNumber + 1}: +${newResults.length} data baru, Total: ${allResults.length}`, 10, 10);
            
            pageNumber++;
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        await updateRangeStatus(ctx, waitMsg, `✅ Total ${allResults.length} data ditemukan dari ${pageNumber} halaman`, 10, 10);
        
        const result = analyzeRangeData(allResults, 'all', 'all');
        
        return result;
        
    } catch (error) {
        console.error('[STATUS] Range Check All Error:', error);
        throw error;
    } finally {
        if (page) {
            try {
                await clearSearchFilter(page);
                await new Promise(resolve => setTimeout(resolve, 2000));
                await page.close();
            } catch (e) {
                console.log('[STATUS] Error closing page:', e.message);
            }
        }
    }
};

const clearSearchFilter = async (page) => {
    try {
        await page.evaluate(() => {
            const searchInput = document.querySelector('input[type="search"]');
            if (searchInput) {
                searchInput.value = '';
                const events = ['input', 'keyup', 'change', 'search'];
                events.forEach(ev => searchInput.dispatchEvent(new Event(ev, { bubbles: true })));
            }

            if (typeof $ !== 'undefined' && $.fn.dataTable) {
                const table = $('#clientsmshistory-table').DataTable();
                if (table) {
                    table.search('').draw();
                    table.page(0).draw('page');
                }
            }
        });

        await page.waitForTimeout(4000);
        return true;

    } catch (error) {
        return false;
    }
};

const sendRangeResultFile = async (ctx, data, service, country) => {
    try {
        const reportContent = generateRangeReport(data);
        
        const timestamp = new Date().getTime();
        const fileName = `range_${service}_${country}_${timestamp}.txt`;
        const filePath = path.join(TEMP_DIR, fileName);
        
        fs.writeFileSync(filePath, reportContent, 'utf8');
        
        const caption = generateResultCaption(data, service, country);
        
        await ctx.replyWithDocument(
            { source: filePath, filename: fileName },
            { 
                caption: caption,
                parse_mode: 'HTML',
                reply_to_message_id: ctx.message.message_id
            }
        );
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
    } catch (error) {
        console.error('[STATUS] Error sending range result file:', error);
        throw error;
    }
};

const searchCountryInTable = async (page, country) => {
    try {
        await page.waitForSelector('input[type="search"]', { timeout: 10000 });
        await page.evaluate(async (searchCountry) => {
            const searchInput = document.querySelector('input[type="search"]');
            if (!searchInput) return;
            searchInput.focus();
            searchInput.value = '';
            searchInput.value = searchCountry;
            
            const inputEvent = new Event('input', { bubbles: true });
            searchInput.dispatchEvent(inputEvent);
            
            const keyupEvent = new Event('keyup', { bubbles: true });
            searchInput.dispatchEvent(keyupEvent);
            
            if (typeof $ !== 'undefined' && $.fn.dataTable) {
                const table = $('#clientsmshistory-table').DataTable();
                if (table) {
                    table.search(searchCountry).draw();
                }
            }
        }, country);
        
        await new Promise(resolve => setTimeout(resolve, 4000));
        
        const searchValue = await page.evaluate(() => {
            const input = document.querySelector('input[type="search"]');
            return input ? input.value : '';
        });
        
        return searchValue.toLowerCase().includes(country.toLowerCase());
    } catch (error) {
        console.error('[STATUS] Search country error:', error);
        return false;
    }
};

const analyzeRangeData = (results, service, country) => {
    const frequencyMap = {};
    
    results.forEach(row => {
        const cleanRange = row.Range;
        const cleanSid = row.SID;
        
        if (!cleanRange || cleanRange.length < 3 || !cleanSid) return;
        
        const key = `${cleanRange}|${cleanSid}`;
        
        if (!frequencyMap[key]) {
            frequencyMap[key] = {
                range: cleanRange,
                sid: cleanSid,
                country: row.Country || 'UNKNOWN',
                count: 0,
                examples: []
            };
        }
        frequencyMap[key].count += 1;
        
        if (frequencyMap[key].examples.length < 3 && row.TestNumber) {
            const cleanNumber = row.TestNumber.replace(/[^0-9+]/g, '');
            if (cleanNumber && !frequencyMap[key].examples.includes(cleanNumber)) {
                frequencyMap[key].examples.push(cleanNumber);
            }
        }
    });
    
    const sangatBagus = [];
    const bagus = [];
    const sedang = [];
    const rendah = [];
    
    Object.values(frequencyMap).forEach(item => {
        if (item.count >= 10) {
            sangatBagus.push(item);
        } else if (item.count >= 5) {
            bagus.push(item);
        } else if (item.count >= 2) {
            sedang.push(item);
        } else {
            rendah.push(item);
        }
    });
    
    sangatBagus.sort((a, b) => b.count - a.count);
    bagus.sort((a, b) => b.count - a.count);
    sedang.sort((a, b) => b.count - a.count);
    rendah.sort((a, b) => b.count - a.count);
    
    return {
        sangatBagus,
        bagus,
        sedang,
        rendah,
        totalData: results.length,
        service,
        country,
        frequencyMap
    };
};

const generateResultCaption = (data, service, country) => {
    const { sangatBagus, bagus, sedang, rendah, totalData } = data;
    
    let caption = '';
    
    if (service === 'all' && country === 'all') {
        caption += `<blockquote><b>📋 HASIL CEK SEMUA RANGE</b></blockquote>\n\n`;
    } else {
        caption += `<blockquote><b>📋 HASIL CEK RANGE ${service.toUpperCase()} ${country.toUpperCase()}</b></blockquote>\n\n`;
    }
    
    caption += `📊 Total : ${totalData}\n`;
    caption += `✅ Rating :\n`;
    caption += `└─🟢Sangat bagus : ${sangatBagus.length}\n`;
    caption += `   └─🟡Bagus : ${bagus.length}\n`;
    caption += `      └─🟠Sedang : ${sedang.length}\n`;
    caption += `         └─🔴Rendah : ${rendah.length}\n\n`;
    
    caption += `📁 File berhasil dibuat.\n`;
    caption += `<blockquote>Created By @Userrr_warxzz</blockquote>`;
    
    return caption;
};

const generateRangeReport = (data) => {
    const { sangatBagus, bagus, sedang, rendah, service, country, totalData } = data;
    
    let content = '';
    
    if (service === 'all' && country === 'all') {
        content += `📋 HASIL CEK SEMUA RANGE\n\n`;
    } else {
        content += `📋 HASIL CEK RANGE ${service.toUpperCase()} ${country.toUpperCase()}\n\n`;
    }
    
    content += `📊 Total Data: ${totalData}\n`;
    content += `📈 Data Unik: ${sangatBagus.length + bagus.length + sedang.length + rendah.length}\n\n`;
    
    content += `✅ Rating :\n`;
    content += `└─🟢 Sangat Bagus : ${sangatBagus.length}\n`;
    content += `   └─🟡 Bagus : ${bagus.length}\n`;
    content += `      └─🟠 Sedang : ${sedang.length}\n`;
    content += `         └─🔴 Rendah : ${rendah.length}\n\n`;
    
    if (sangatBagus.length > 0) {
        content += `RATING SANGAT BAGUS\n`;
        content += `└─🌐\n`;
        sangatBagus.forEach(item => {
            const flag = getCountryFlag(item.country);
            content += `   └─ ${flag} ${item.range} (${item.sid})\n`;
        });
        content += `\n`;
    }
    
    if (bagus.length > 0) {
        content += `RATING BAGUS\n`;
        content += `└─🌐\n`;
        bagus.forEach(item => {
            const flag = getCountryFlag(item.country);
            content += `   └─ ${flag} ${item.range} (${item.sid})\n`;
        });
        content += `\n`;
    }
    
    if (sedang.length > 0) {
        content += `RATING SEDANG\n`;
        content += `└─🌐\n`;
        sedang.forEach(item => {
            const flag = getCountryFlag(item.country);
            content += `   └─ ${flag} ${item.range} (${item.sid})\n`;
        });
        content += `\n`;
    }
    
    if (rendah.length > 0) {
        content += `RATING RENDAH\n`;
        content += `└─🌐\n`;
        rendah.forEach(item => {
            const flag = getCountryFlag(item.country);
            content += `   └─ ${flag} ${item.range} (${item.sid})\n`;
        });
        content += `\n`;
    }
    
    content += `\nCreated By @Userrr_warxzz\n`;
    content += `Generated: ${new Date().toLocaleString('id-ID')}\n`;
    
    return content;
};

bot.command('cekrange', ownerOnly, async (ctx) => {
    const args = ctx.message.text.split(/\s+/).slice(1);
    const input = args.join(' ').trim();
    if (!input) {
        return ctx.replyWithHTML(`<pre>⚠️ Cara penggunaan:\n/cekrange service,country\n/cekrange whatsapp,all\n/cekrange all,indonesia</pre>`, { reply_to_message_id: ctx.message.message_id });
    }
    const parts = input.split(',');
    if (parts.length !== 2) {
        return ctx.replyWithHTML(`<pre>⚠️ Format salah\nGunakan : /cekrange service,country</pre>`, { reply_to_message_id: ctx.message.message_id });
    }
    
    let service = parts[0].trim();
    let country = parts[1].trim().toLowerCase();
    
    const serviceMap = {
        whatsapp: 'WhatsApp',
        facebook: 'facebook',
        Apple: 'apple',
        Gmail: 'gmail',
        tiktok: 'tiktok',
        all: 'all',
        Samsung: 'samsung',
        temu: 'temu',
        Viber: 'viber',
        tiktokads: 'tiktokads',
        amex: 'amex',
        autmsg: 'AUTHMSG',
        nxcomm: 'nxcomm',
        telegram: 'Telegram',
        sms: 'sms',
        Paypal: 'paypal',
        qsms: 'Qsms',
        Uber: 'uber',
        Microsoft: 'microsoft',
    };
    
    const key = service.toLowerCase();
    service = serviceMap[key] || service;

    const waitMsg = await ctx.replyWithHTML('<blockquote>⏳ <b>Sedang Menganalisis Range</b></blockquote>\n\n[░░░░░░░░░░░░░░░░░░░░] 0%\n\n🔄 Memulai proses...\n\n🕐 <i>Last update : ' + new Date().toLocaleTimeString('id-ID') + '</i>', 
        { reply_to_message_id: ctx.message.message_id });

    try {
        const result = await downloadAndAnalyzeRangeData(service, country, ctx, waitMsg);

        await sendRangeResultFile(ctx, result, service, country);

        try { 
            await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); 
        } catch(err) {}

    } catch (error) {
        await handleRangeError(ctx, waitMsg, error);
    }
});

bot.command('cekrangeall', ownerOnly, async (ctx) => {
    const waitMsg = await ctx.replyWithHTML('<blockquote>⏳ <b>Sedang Menganalisis Range</b></blockquote>\n\n[░░░░░░░░░░░░░░░░░░░░] 0%\n\n🔄 Memulai proses...\n\n🕐 <i>Last update : ' + new Date().toLocaleTimeString('id-ID') + '</i>',
        { reply_to_message_id: ctx.message.message_id });
    
    try {
        const result = await downloadAndAnalyzeAllRangeData(ctx, waitMsg);
        
        await sendRangeResultFile(ctx, result, 'all', 'all');
        
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        
    } catch (error) {
        await handleRangeError(ctx, waitMsg, error);
    }
});

// ==================================== //
// ========== STATUS SYSTEM =========== //
// ==================================== //

const getFormattedStatus = () => {
    const cfStatus = settings.CF_CLEARANCE_VALUE && settings.CF_CLEARANCE_VALUE.length > 5 ? "✅ Ready" : "❌ Missing";
    const sessionStatus = settings.IVAS_SESSION_VALUE && settings.IVAS_SESSION_VALUE.length > 5 ? "✅ Ready" : "❌ Missing";
    const xsrfStatus = settings.XSRF_TOKEN_VALUE && settings.XSRF_TOKEN_VALUE.length > 5 ? "✅ Ready" : "❌ Missing";
    const uaStatus = settings.CURRENT_USER_AGENT && settings.CURRENT_USER_AGENT.length > 20 ? "✅ Ready" : "❌ Missing";
    const pollingInfo = isPollingActive ? `✅ Active` : `❌ Inactive`;
    const browserInfo = isBrowserReady ? `✅ Ready` : `❌ Error`;

    return `
LAST CHECK : ${lastCheckTime}
STATUS : ${botStatus}
BROWSER : ${browserInfo}
`.trim();
};

const updateStatusMessage = async (ctx, initialMessage = null, messageIdToEdit = null) => {
    const message = getFormattedStatus();

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh Status', 'check_status_refresh')]
    ]);

    const finalMessage = initialMessage ? `${initialMessage}\n\n${message}` : message;

    return editOrReplyHTML(ctx, finalMessage, keyboard, messageIdToEdit);
};

// ==================================== //
// ========== MENU SYSTEM ============= //
// ==================================== //

const sendMainMenu = async (ctx, messageId = null) => {
    const connectionStatus = isConnectionStable ? '✅ Connected' : '⚠️ Disconnected';
    const pollingStatus = isPollingActive ? '✅ Active' : '❌ Inactive';
    
    const message = `<blockquote>情⪼ ꪶ あ ꫂ⛧ 𝙬̸𝙖͢𝙧͞𝙭͢𝙯͞𝙯͢ × 𝙄̸𝙫͞𝙖͢𝙨͞𝙢͢𝙨 𝘽̸𝙤͞𝙩̸𝙕͞ ⛧</blockquote>
( 👤 ) - 情報 𝗢𝗹𝗮𝗮,
𝙬̸𝙖͢𝙧͞𝙭͢𝙯͞𝙯͢𝗫 ─ 𝗧𝗲𝗹𝗲𝗴𝗿𝗮𝗺 ボットは、速く柔軟で安全で자동화ツール。デジタルタスクを, 나를 지원하십시오!...

━━━━━━━━━━━━━━━━━━━━
<blockquote><b>⌞ 𝐅𝐨r 𝐘𝐨u𝐫 𝐈𝐧𝐟𝐨r𝐦𝐚𝐭𝐢𝐨𝐧⌝</b></blockquote>
𖠂 ᴄʀᴇᴀᴛᴏʀ : @Userrr_warxzz
𖠂 ᴠᴇʀsɪ : ᴠ2.0.01
𖠂 ᴛʏᴘᴇ : Javascript Nodejs
━━━━━━━━━━━━━━━━━━━━
<b><blockquote>📊 Current Status:</blockquote></b>
Connection: ${connectionStatus}
SMS Polling: ${pollingStatus}
User: ${settings.IVAS_USERNAME || 'Not set'}
━━━━━━━━━━━━━━━━━━━━

☐ ⧽ /login
☐ ⧽ /useragent

━━━━━━━━━━━━━━━━━━━━
<blockquote>Silakan pilih menu di bawah ini</blockquote>`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('📊 Status', 'show_status_panel'),
            Markup.button.callback('🔑 Login', 'show_login_panel')
        ],
        [
            Markup.button.callback('⚙️ Settings', 'show_settings'),
            Markup.button.callback('🔄 Refresh', 'refresh_main')
        ]
    ]);
    
    return editOrReplyHTML(ctx, message, keyboard, messageId);
};

const sendSettingsMenu = async (ctx) => {
    const pollingInfo = isPollingActive ? `✅ Active` : `❌ Inactive`;
    const browserInfo = isBrowserReady ? `✅ Ready` : `❌ Error`;
    const messageId = ctx.callbackQuery.message.message_id;
    
    const message = `<blockquote>情⪼ ꪶ あ ꫂ⛧ 𝙬̸𝙖͢𝙧͞𝙭͢𝙯͞𝙯͢ × 𝙄̸𝙫͞𝙖͢𝙨͞𝙢͢𝙨 𝘽̸𝙤͞𝙩̸𝙕͞ ⛧</blockquote>
( 👤 ) - 情報 𝗢𝗹𝗮𝗮,
𝙬̸𝙖͢𝙧͞𝙭͢𝙯͞𝙯͢𝗫 ─ 𝗧𝗲𝗹𝗲𝗴𝗿𝗮𝗺 ボットは、速く柔flexibleで安全な自動化ツール。デジタルタスクを, 나를 지원하십시오!...

━━━━━━━━━━━━━━━━━━━━
<blockquote>乂 𝗦𝗘𝗧𝗧𝗜𝗡𝗚𝗦 𝗠𝗘𝗡𝗨 乂</blockquote>
☐ ⧽ /cekrange
☐ ⧽ /cekrangeall
☐ ⧽ /exportnum
☐ ⧽ /status
☐ ⧽ /cv
☐ ⧽ /login
☐ ⧽ /useragent
☐ ⧽ /addgroup
☐ ⧽ /listgroup
☐ ⧽ /delgroup
☐ ⧽ /setownerlink
☐ ⧽ /setchnumber
☐ ⧽ /setchannel
━━━━━━━━━━━━━━━━━━━━.

<blockquote><b>DEV : @Userrr_warxzz</b></blockquote>`; 

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('🔙 Back', 'main_menu')
        ]
    ]);

    return editOrReplyHTML(ctx, message, keyboard, messageId);
};

const sendStatusPanelMenu = async (ctx) => {
    const messageId = ctx.callbackQuery.message.message_id;
    const pollingInfo = isPollingActive ? `✅ Active` : `❌ Inactive`;
    const browserInfo = isBrowserReady ? `✅ Ready` : `❌ Error`;

    const message = `<blockquote>情⪼ ꪶ あ ꫂ⛧ 𝙬̸𝙖͢𝙧͞𝙭͢𝙯͞𝙯͢ × 𝙄̸𝙫͞𝙖͢𝙨͞𝙢͢𝙨 𝘽̸𝙤͞𝙩̸𝙕͞ ⛧</blockquote>
( 👤 ) - 情報 𝗢𝗹𝗮𝗮,
𝙬̸𝙖͢𝙧͞𝙭͢𝙯͞𝙯͢𝗫 ─ 𝗧𝗲𝗹𝗲𝗴𝗿𝗮𝗺 ボットは、速く柔flexibleで安全な自動化ツール。デジタルタスクを, 나를 지원하십시오!...

━━━━━━━━━━━━━━━━━━━━
<blockquote><b>𝗕𝗢𝗧 𝗦𝗧𝗔𝗧𝗨𝗦</b></blockquote>
𖠂 Status : ${botStatus}
𖠂 Browser : ${browserInfo}
𖠂 Live Sms : ${pollingInfo}
━━━━━━━━━━━━━━━━━━━━
<blockquote>乂 𝗦𝗧𝗔𝗧𝗨𝗦 𝗠𝗘𝗡𝗨 乂</blockquote>
☐ ⧽ /statistic
☐ ⧽ /status
☐ ⧽ /viewsms
☐ ⧽ /ssurl
☐ ⧽ /mynum
☐ ⧽ /balance
━━━━━━━━━━━━━━━━━━━━

<blockquote><b>DEV : @Userrr_warxzz</b></blockquote>`; 

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('🔙 Back', 'main_menu')
        ]
    ]);

    return editOrReplyHTML(ctx, message, keyboard, messageId);
};

// ==================================== //
// ========== COMMAND HANDLERS ======== //
// ==================================== //

bot.command('start', (ctx) => {
    if (ctx.from.id === OWNER_ID) sendMainMenu(ctx);
    else ctx.reply("🤖 Bot is Online");
});

bot.command('status', ownerOnly, async (ctx) => {
    const statusText = getFormattedStatus();
    await replyHTML(ctx, statusText);
});

bot.command('login', ownerOnly, async (ctx) => {
    const userId = ctx.from.id;
    
    // Reset state sebelumnya
    resetUserState(userId);
    
    const currentUser = settings.IVAS_USERNAME || 'Not set';
    const hasCF = settings.CF_CLEARANCE_VALUE && settings.CF_CLEARANCE_VALUE.length > 10;
    
    const message = `<blockquote>🔑 LOGIN MANAGEMENT</blockquote>
━━━━━━━━━━━━━━━━━━━━
<b>Current Status:</b>
👤 Username: ${currentUser}
🍪 CF Clearance: ${hasCF ? '✅ Set' : '❌ Not set'}
━━━━━━━━━━━━━━━━━━━━
<b>Options:</b>
1. <b>Full Login</b> - Masukkan username/password/cf_clearance
2. <b>Update CF Only</b> - Hanya update cookie
3. <b>Reset All</b> - Hapus semua data login
4. <b>Try Connect</b> - Coba koneksi dengan data saat ini
━━━━━━━━━━━━━━━━━━━━
<blockquote>Pilih salah satu:</blockquote>`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('🔑 Full Login', 'login_full'),
            Markup.button.callback('🍪 Update CF', 'login_cf_only')
        ],
        [
            Markup.button.callback('🔄 Reset All', 'login_reset_all'),
            Markup.button.callback('🔌 Try Connect', 'login_try_connect')
        ]
    ]);
    
    const sentMsg = await ctx.replyWithHTML(message, { 
        reply_to_message_id: ctx.message.message_id,
        reply_markup: keyboard.reply_markup 
    });
    
    setUserState(userId, 'LOGIN', {
        messageId: sentMsg.message_id,
        chatId: ctx.chat.id,
        loginStep: '',
        loginData: {}
    });
});

bot.command('useragent', ownerOnly, async (ctx) => {
    const userId = ctx.from.id;
    
    resetUserState(userId);
    
    const currentUA = settings.CURRENT_USER_AGENT || 'Belum diatur';
    const shortUA = currentUA.length > 50 ? currentUA.substring(0, 50) + '...' : currentUA;

    const sentMessage = await ctx.replyWithHTML(
        `<pre>💻 Update User Agent</pre>\n\n` +
        `📱 <b>User Agent saat ini:</b>\n<code>${shortUA}</code>\n\n` +
        `📝 <b>Kirim User Agent baru (minimal 20 karakter):</b>`,
        { reply_to_message_id: ctx.message?.message_id }
    );

    setUserState(userId, 'USER_AGENT', {
        messageId: sentMessage.message_id,
        chatId: ctx.chat.id
    });
});

bot.command('ssweb', ownerOnly, async (ctx) => {    
    await takeDashboardScreenshot(ctx);
});

bot.command('viewsms', ownerOnly, async (ctx) => {    
    await takeLiveSmsScreenshot(ctx);
});

bot.command('ssurl', ownerOnly, async (ctx) => {
    const args = ctx.message.text.split(/\s+/).slice(1);
    const url = args[0];
    
    if (!url) {
        await replyHTML(ctx, 
            `<pre>Error\n\ngunakan : /ssurl https://example.com\nContoh : /ssurl https://www.google.com\n/ssurl https://www.ivasms.com</pre>`
        );
        return;
    }
    
    // Validasi URL dasar
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        await replyHTML(ctx, 
            `<pre>Error\n\nURL harus diawali dengan http:// atau https://\nContoh : /ssurl https://www.example.com</pre>`
        );
        return;
    }
    
    
    await takeMacbookScreenshot(ctx, url);
});


const saveSettings = (newSettings) => {
    const filePath = path.join(__dirname, 'settings.js');
    const content = `module.exports = ${JSON.stringify(newSettings, null, 4)};`;
    fs.writeFileSync(filePath, content);
};

// 1. COMMAND /addgroup
bot.command('addgroup', (ctx) => {
    const botUsername = ctx.botInfo.username;
    const inviteLink = `https://t.me/${botUsername}?startgroup=new`;
    
    ctx.reply(`Silakan klik tombol di bawah untuk menambahkan grup ke dalam bot.\n\nSetelah ditambahkan, ID grup akan otomatis tersimpan.`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "➕ Pilih Grup", url: inviteLink }]
            ]
        }
    });
});

// Listener saat bot masuk ke grup baru (Otomatis ambil ID)
bot.on('new_chat_members', async (ctx) => {
    const botId = ctx.botInfo.id;
    const isBotAdded = ctx.message.new_chat_members.some(member => member.id === botId);

    if (isBotAdded) {
        delete require.cache[require.resolve('./settings.js')];
        let settings = require('./settings.js');
        
        const chatId = ctx.chat.id;
        if (!Array.isArray(settings.CHAT_ID)) {
            settings.CHAT_ID = [settings.CHAT_ID];
        }

        if (!settings.CHAT_ID.includes(chatId)) {
            settings.CHAT_ID.push(chatId);
            saveSettings(settings);
            
            ctx.reply(`✅ Grup "${ctx.chat.title}" berhasil didaftarkan!\nID: <code>${chatId}</code>`, { parse_mode: 'HTML' });
            
            // Kirim notifikasi ke owner
            bot.telegram.sendMessage(settings.OWNER_ID, `📢 Grup Baru Ditambahkan:\nNama: ${ctx.chat.title}\nID: ${chatId}`);
        }
    }
});

// 2. COMMAND /listgroup
bot.command('listgroup', async (ctx) => {
    delete require.cache[require.resolve('./settings.js')];
    const settings = require('./settings.js');
    const chatIds = Array.isArray(settings.CHAT_ID) ? settings.CHAT_ID : [settings.CHAT_ID];
    
    if (chatIds.length === 0) return ctx.reply("Belum ada grup yang terdaftar.");

    let message = `<blockquote>${settings.PROJECT_NAME}</blockquote>\n\n`;
    
    for (const id of chatIds) {
        try {
            const chat = await bot.telegram.getChat(id);
            message += `<b>${chat.title}</b>\n<code>${id}</code>\n\n`;
        } catch (e) {
            message += `<b>Grup Tidak Dikenal</b>\n<code>${id}</code> (Bot mungkin dikeluarkan)\n\n`;
        }
    }

    ctx.reply(message, { parse_mode: 'HTML' });
});

// 3. COMMAND /delgroup <id>
bot.command('delgroup', async (ctx) => {
    const inputId = ctx.message.text.split(' ')[1];
    if (!inputId) return ctx.reply("Format: /delgroup -100xxxxxxx");

    delete require.cache[require.resolve('./settings.js')];
    let settings = require('./settings.js');
    const targetId = parseInt(inputId);

    if (Array.isArray(settings.CHAT_ID) && settings.CHAT_ID.includes(targetId)) {
        // Hapus dari array
        settings.CHAT_ID = settings.CHAT_ID.filter(id => id !== targetId);
        saveSettings(settings);

        // Bot keluar dari grup
        try {
            await bot.telegram.leaveChat(targetId);
            ctx.reply(`✅ Berhasil menghapus grup ${targetId} dan bot telah keluar.`);
        } catch (e) {
            ctx.reply(`✅ ID dihapus dari settings, tapi bot gagal keluar grup otomatis (Mungkin bot sudah tidak di sana).`);
        }
    } else {
        ctx.reply("❌ ID Grup tidak ditemukan di daftar.");
    }
});

// Ganti dengan menggunakan updateSettingSilent yang sudah ada
bot.command('setchannel', ownerOnly, (ctx) => {
    const link = ctx.message.text.split(' ')[1];
    if (!link) return ctx.reply('Format: /setchannel <link>');
    
    if (updateSettingSilent('MAIN_CHANNEL_LINK', link)) {
        ctx.reply(`✅ MAIN_CHANNEL_LINK updated: ${link}`);
    } else {
        ctx.reply('❌ Gagal update setting');
    }
});

bot.command('setchnumber', ownerOnly, (ctx) => {
    const link = ctx.message.text.split(' ')[1];
    if (!link) return ctx.reply('Format: /setchnumber <link>');

    if (updateSettingSilent('NUMBER_GROUP_LINK', link)) {
        ctx.reply(`✅ NUMBER_GROUP_LINK updated: ${link}`);
    } else {
        ctx.reply('❌ Gagal update setting');
    }
});

bot.command('setownerlink', ownerOnly, (ctx) => {
    const link = ctx.message.text.split(' ')[1];
    if (!link) return ctx.reply('Format: /setownerlink <link>');

    if (updateSettingSilent('BOT_OWNER_LINK', link)) {
        ctx.reply(`✅ BOT_OWNER_LINK updated: ${link}`);
    } else {
        ctx.reply('❌ Gagal update setting');
    }
});


// ==================================== //
// ========== ACTION HANDLERS ========= //
// ==================================== //

bot.action('main_menu', ownerOnly, async (ctx) => {
    const messageId = ctx.callbackQuery.message.message_id;
    await sendMainMenu(ctx, messageId);
});

bot.action('show_settings', ownerOnly, sendSettingsMenu);
bot.action('show_status_panel', ownerOnly, sendStatusPanelMenu);
bot.action('refresh_main', ownerOnly, async (ctx) => {
    await ctx.answerCbQuery('Refreshing...');
    const messageId = ctx.callbackQuery.message.message_id;
    await sendMainMenu(ctx, messageId);
});

bot.action('check_status_refresh', ownerOnly, async (ctx) => {
    await ctx.answerCbQuery("Melakukan Forced Check dan update status...");
    const messageId = ctx.callbackQuery.message.message_id;
    try { await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, '⏳ Melakukan Forced Check status koneksi...', { parse_mode: 'HTML' }); } catch(e) {}

    await connectRobustLiveSms();
    await updateStatusMessage(ctx, null, messageId);
});
bot.action('login_full', ownerOnly, async (ctx) => {
    const userId = ctx.from.id;
    let state = getUserState(userId);
    
    // Jika state tidak ada atau bukan type LOGIN, buat baru
    if (!state || state.type !== 'LOGIN') {
        const sentMsg = await ctx.replyWithHTML(`<pre>🔑 FULL LOGIN SETUP</pre>\n\n🔄 Memulai proses login...`);
        state = setUserState(userId, 'LOGIN', {
            messageId: sentMsg.message_id,
            chatId: ctx.chat.id,
            loginStep: 'username',
            loginData: {}
        });
    } else {
        state.data.loginStep = 'username';
        state.data.loginData = {};
        state.step = 'awaiting_input';
    }
    
    await ctx.answerCbQuery('Starting full login process...');
    
    await safeEditMessage(ctx, state.data.messageId, 
        `<pre>🔑 FULL LOGIN SETUP</pre>\n\n⚙️ <b>Status:</b> Menunggu input...\n📧 <b>Masukkan Username/Email IVASMS:</b>`
    );
});

bot.action('login_cf_only', ownerOnly, async (ctx) => {
    const userId = ctx.from.id;
    let state = getUserState(userId);
    
    if (!state || state.type !== 'LOGIN') {
        const sentMsg = await ctx.replyWithHTML(`<pre>🍪 UPDATE CF CLEARANCE</pre>\n\n🔄 Memulai update cookie...`);
        state = setUserState(userId, 'LOGIN', {
            messageId: sentMsg.message_id,
            chatId: ctx.chat.id,
            loginStep: 'cf_only',
            loginData: {}
        });
    } else {
        state.data.loginStep = 'cf_only';
        state.data.loginData = {};
        state.step = 'awaiting_input';
    }
    
    await ctx.answerCbQuery('Updating CF clearance only...');
    
    await safeEditMessage(ctx, state.data.messageId,
        `<pre>🍪 UPDATE CF CLEARANCE</pre>\n\n👤 <b>User:</b> <code>${settings.IVAS_USERNAME || 'Not set'}</code>\n⚙️ <b>Status:</b> Menunggu cookie...\n\n📋 <b>Masukkan CF Clearance baru:</b>\n<i>(Ambil nilai cf_clearance dari browser)</i>`
    );
});
bot.action('login_reset_all', ownerOnly, async (ctx) => {
    const userId = ctx.from.id;
    const state = getUserState(userId);
    
    if (!state || state.type !== 'LOGIN') {
        await ctx.answerCbQuery('❌ State tidak valid. Ulangi /login');
        return;
    }
    
    await ctx.answerCbQuery('Resetting all login data...');
    
    try {
        writeSettingToFileSync('IVAS_USERNAME', '');
        writeSettingToFileSync('IVAS_PASSWORD', '');
        writeSettingToFileSync('CF_CLEARANCE_VALUE', '');
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔑 Start Full Login', 'login_full')]
        ]);

        await safeEditMessage(ctx, state.data.messageId, `<pre>🔄 RESET COMPLETE</pre>\n\n✅ <b>Status:</b> Data dibersihkan\n📊 <b>Info:</b> Semua kredensial telah dihapus.\n\n<i>Silakan lakukan login ulang untuk memulai.</i>`, keyboard);
            
        resetUserState(userId);
        
    } catch (error) {
        await safeEditMessage(ctx, state.data.messageId, `<pre>🔄 RESET FAILED</pre>\n\n❌ <b>Error:</b> ${error.message}`);
    }
});

// ==================================== //
// ========== ACTION HANDLERS ========= //
// ==================================== //

bot.action('login_try_connect', ownerOnly, async (ctx) => {
    await ctx.answerCbQuery('Memulai proses koneksi...');
    const messageId = ctx.callbackQuery.message.message_id;

    // Update pesan dengan progress bar
    await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        `<blockquote>🔌 PROSES KONEKSI</blockquote>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `[░░░░░░░░░░░░░░░░░░░░] 0%`,
        { parse_mode: 'HTML' }
    );

    // Jalankan koneksi di background
    setImmediate(async () => {
        try {
            // Step 1: Persiapan
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                messageId,
                null,
                `<blockquote>🔌 PROSES KONEKSI</blockquote>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `[████████░░░░░░░░░░░░] 33%`,
                { parse_mode: 'HTML' }
            );

            // Step 2: Proses koneksi
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                messageId,
                null,
                `<blockquote>🔌 PROSES KONEKSI</blockquote>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `[████████████████░░░░] 66%`,
                { parse_mode: 'HTML' }
            );

            // Eksekusi fungsi koneksi
            const success = await connectRobustLiveSms();
            
            if (success) {
                const currentUrl = liveSmsPage ? await liveSmsPage.url() : 'N/A';
                const isActive = isPollingActive ? '✅ AKTIF' : '❌ NON-AKTIF';
                const isStable = isConnectionStable ? '✅ STABIL' : '⚠️ TIDAK STABIL';
                
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    messageId,
                    null,
                    `<blockquote>🔌 KONEKSI BERHASIL</blockquote>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ <b>Status Koneksi:</b> TERHUBUNG\n` +
                    `📊 <b>Status Bot:</b> ${botStatus}\n` +
                    `🌐 <b>URL:</b> <code>${currentUrl}</code>\n` +
                    `📡 <b>Live SMS:</b> ${isActive}\n` +
                    `⚡ <b>Stabilitas:</b> ${isStable}\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `🕐 <b>Waktu:</b> ${new Date().toLocaleTimeString('id-ID')}\n`,
                    { parse_mode: 'HTML' }
                );
                
            } else {
                throw new Error('Koneksi gagal - fungsi connectRobustLiveSms mengembalikan false');
            }
            
        } catch (error) {
            console.error(chalk.red(`[ACTION] ❌ Error koneksi: ${error.message}`));
            
            let suggestions = '';
            if (error.message.includes('Cloudflare') || error.message.includes('CF')) {
                suggestions = '1. Gunakan /login untuk update CF Clearance\n2. Ambil cookie cf_clearance terbaru\n3. Coba akses manual di browser';
            } else if (error.message.includes('login') || error.message.includes('credential')) {
                suggestions = '1. Pastikan username/password benar\n2. Gunakan /login untuk setup ulang\n3. Cek koneksi internet';
            } else {
                suggestions = '1. Coba /login ulang\n2. Restart bot\n3. Hubungi developer';
            }
            
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                messageId,
                null,
                `<blockquote>❌ KONEKSI GAGAL</blockquote>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `⚠️ <b>Error:</b> <code>${error.message}</code>\n\n` +
                `🔧 <b>Saran Perbaikan:</b>\n${suggestions}\n\n` +
                `🔄 <i>Silakan coba lagi atau gunakan /login</i>`,
                { parse_mode: 'HTML' }
            );
        }
    });
});


// ==================================== //
// ========== UTILITY FUNCTIONS ======= //
// ==================================== //

const safeEditMessage = async (ctx, messageId, newText, keyboard = null) => {
    try {
        const options = { parse_mode: 'HTML', disable_web_page_preview: true };
        if (keyboard && keyboard.reply_markup) options.reply_markup = keyboard.reply_markup;
        
        await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, newText, options);
        return true;
    } catch (error) {
        if (error.response && error.response.error_code === 400 && error.response.description.includes('message is not modified')) return true;
        if (error.response && error.response.error_code === 400 && error.response.description.includes('message to edit not found')) {
            const sendOptions = { parse_mode: 'HTML', disable_web_page_preview: true };
            if (keyboard && keyboard.reply_markup) sendOptions.reply_markup = keyboard.reply_markup;
            await ctx.telegram.sendMessage(ctx.chat.id, newText, sendOptions);
            return true;
        }
        return false;
    }
};

const handleLoginText = async (ctx, state, text) => {
    const userId = ctx.from.id;
    const messageId = state.data.messageId;
    const header = `<blockquote>🔑 LOGIN SETUP</blockquote>\n━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (!state.data.loginStep) { resetUserState(userId); return; }
    
    switch (state.data.loginStep) {
        case 'username':
            const username = text.trim();
            if (!username) {
                await safeEditMessage(ctx, messageId, `${header}❌ Username tidak boleh kosong!\n\n📧 <b>Masukkan Username/Email:</b>`);
                return;
            }
            state.data.loginData = state.data.loginData || {};
            state.data.loginData.username = username;
            state.data.loginStep = 'password';
            await safeEditMessage(ctx, messageId, `${header}👤 Username: <code>${username}</code>\n\n🔐 <b>Masukkan Password:</b>`);
            break;
            
        case 'password':
            const password = text.trim();
            if (!password) {
                await safeEditMessage(ctx, messageId, `${header}❌ Password tidak boleh kosong!\n\n🔐 <b>Masukkan Password:</b>`);
                return;
            }
            state.data.loginData.password = password;
            state.data.loginStep = 'cf_clearance';
            await safeEditMessage(ctx, messageId, `${header}👤 User: <code>${state.data.loginData.username}</code>\n🔑 Pass: <code>********</code>\n\n🍪 <b>Masukkan CF Clearance:</b>`);
            break;
            
        case 'cf_clearance':
            const cfValue = text.trim();
            if (cfValue.length < 10) {
                await safeEditMessage(ctx, messageId, `${header}❌ Cookie terlalu pendek!\n\n🍪 <b>Masukkan CF Clearance:</b>`);
                return;
            }
            updateSettingSilent('IVAS_USERNAME', state.data.loginData.username);
            updateSettingSilent('IVAS_PASSWORD', state.data.loginData.password);
            updateSettingSilent('CF_CLEARANCE_VALUE', cfValue);
            
            await safeEditMessage(ctx, messageId, `${header}✅ <b>Data berhasil disimpan!</b>\n\n🔄 <i>Mencoba koneksi otomatis...</i>`);
            
            setTimeout(async () => {
                try {
                    const success = await connectRobustLiveSms();
                    const statusMsg = success ? `✅ <b>Login & Koneksi Berhasil!</b>` : `⚠️ <b>Data tersimpan, koneksi gagal.</b>`;
                    await safeEditMessage(ctx, messageId, `<blockquote>🔑 STATUS LOGIN</blockquote>\n━━━━━━━━━━━━━━━━━━━━\n${statusMsg}\n\n👤 User: ${settings.IVAS_USERNAME}\n📡 SMS: ${isPollingActive ? 'AKTIF' : 'OFF'}`);
                } catch (e) {
                    await safeEditMessage(ctx, messageId, `<blockquote>⚠️ LOGIN ERROR</blockquote>\n━━━━━━━━━━━━━━━━━━━━\n❌ <b>Error:</b> ${e.message}`);
                }
                resetUserState(userId);
            }, 2000);
            break;
            
        case 'cf_only':
            const cfOnlyValue = text.trim();
            if (cfOnlyValue.length < 10) {
                await safeEditMessage(ctx, messageId, `<blockquote>🍪 UPDATE COOKIE</blockquote>\n━━━━━━━━━━━━━━━━━━━━\n❌ Cookie terlalu pendek!\n\n📋 <b>Masukkan CF Clearance baru:</b>`);
                return;
            }
            updateSettingSilent('CF_CLEARANCE_VALUE', cfOnlyValue);
            await safeEditMessage(ctx, messageId, `<blockquote>🍪 UPDATE BERHASIL</blockquote>\n━━━━━━━━━━━━━━━━━━━━\n✅ Cookie diperbarui.\n\n🔄 <i>Mencoba koneksi...</i>`);
            setTimeout(async () => {
                const success = await connectRobustLiveSms();
                await safeEditMessage(ctx, messageId, `<blockquote>🔌 STATUS KONEKSI</blockquote>\n━━━━━━━━━━━━━━━━━━━━\nStatus: ${success ? 'Connected' : 'Failed'}\n📡 SMS: ${isPollingActive ? 'AKTIF' : 'OFF'}`);
                resetUserState(userId);
            }, 2000);
            break;
    }
};

const handleUserAgentText = async (ctx, state, text) => {
    const userId = ctx.from.id;
    const userAgent = text.trim();
    const header = `<blockquote>💻 USER AGENT SETUP</blockquote>\n━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (userAgent.length < 20) {
        await safeEditMessage(ctx, state.data.messageId, `${header}❌ <b>User Agent terlalu pendek!</b>\n\n📝 <b>Kirim User Agent baru:</b>`);
        return;
    }
    
    updateSettingSilent('CURRENT_USER_AGENT', userAgent);
    await safeEditMessage(ctx, state.data.messageId, `${header}✅ <b>User Agent diperbarui!</b>\n\n<code>${userAgent.substring(0, 40)}...</code>\n\n🔄 <i>Restarting browser...</i>`);
    
    resetUserState(userId);
    setTimeout(async () => {
        try {
            if (liveSmsPage) { await liveSmsPage.close().catch(() => {}); liveSmsPage = null; }
            liveSmsPage = await browser.newPage();
            await liveSmsPage.setUserAgent(userAgent);
            if (settings.CF_CLEARANCE_VALUE) {
                await liveSmsPage.setCookie({ name: 'cf_clearance', value: settings.CF_CLEARANCE_VALUE, domain: '.ivasms.com' });
            }
            await liveSmsPage.goto(LIVE_SMS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e) {}
    }, 1000);
};

const handleCVText = async (ctx, state, text) => {
    const userId = ctx.from.id;
    const header = `<blockquote>📁 CONVERT STATUS</blockquote>\n━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (state.step === 'awaiting_all_service_input') {
        const serviceName = text.trim();
        if (!serviceName) {
            await safeEditMessage(ctx, state.data.messageId, `${header}❌ Nama Service kosong!\n\nMasukkan nama service.`);
            return;
        }
        state.data.serviceName = serviceName;
        state.data.fileList.forEach(file => file.serviceName = serviceName);
        await safeEditMessage(ctx, state.data.messageId, `${header}✅ Service: <b>${serviceName}</b>\n📦 File: ${state.data.fileList.length}\n\n⏳ <i>Memproses konversi...</i>`);
        await sendConvertedFiles(ctx, state.data);
        resetUserState(userId);
        
    } else if (state.step === 'awaiting_single_service_input') {
        const serviceName = text.trim();
        const currentIndex = state.data.currentFileIndex;
        if (!serviceName) {
            await safeEditMessage(ctx, state.data.messageId, `${header}❌ Nama Service kosong!\n\nInput service untuk file ke-${currentIndex + 1}.`);
            return;
        }
        state.data.fileList[currentIndex].serviceName = serviceName;
        if (currentIndex + 1 < state.data.fileList.length) {
            state.data.currentFileIndex++;
            const nextFile = state.data.fileList[state.data.currentFileIndex];
            await safeEditMessage(ctx, state.data.messageId, `${header}✅ Service ${currentIndex + 1} disimpan.\n\n📝 Input service untuk file ke-${state.data.currentFileIndex + 1}:\n${nextFile.country} (${nextFile.count} No)`);
        } else {
            await safeEditMessage(ctx, state.data.messageId, `${header}✅ Semua service diisi!\n\n⏳ <i>Memproses konversi...</i>`);
            await sendConvertedFiles(ctx, state.data);
            resetUserState(userId);
        }
    }
};
bot.action('login_try_connect', ownerOnly, async (ctx) => {
    await ctx.answerCbQuery('Memulai proses koneksi...');
    const messageId = ctx.callbackQuery.message.message_id;

    // Update pesan dengan progress bar
    await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        `<blockquote>🔌 PROSES KONEKSI</blockquote>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `[░░░░░░░░░░░░░░░░░░░░] 0%`,
        { parse_mode: 'HTML' }
    );

    // Jalankan koneksi di background
    setImmediate(async () => {
        try {
            // Step 1: Persiapan
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                messageId,
                null,
                `<blockquote>🔌 PROSES KONEKSI</blockquote>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `[████████░░░░░░░░░░░░] 33%`,
                { parse_mode: 'HTML' }
            );

            // Step 2: Proses koneksi
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                messageId,
                null,
                `<blockquote>🔌 PROSES KONEKSI</blockquote>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `[████████████████░░░░] 66%`,
                { parse_mode: 'HTML' }
            );

            // Eksekusi fungsi koneksi
            const success = await connectRobustLiveSms();
            
            if (success) {
                const currentUrl = liveSmsPage ? await liveSmsPage.url() : 'N/A';
                const isActive = isPollingActive ? '✅ AKTIF' : '❌ NON-AKTIF';
                const isStable = isConnectionStable ? '✅ STABIL' : '⚠️ TIDAK STABIL';
                
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    messageId,
                    null,
                    `<blockquote>🔌 KONEKSI BERHASIL</blockquote>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ <b>Status Koneksi:</b> TERHUBUNG\n` +
                    `📊 <b>Status Bot:</b> ${botStatus}\n` +
                    `🌐 <b>URL:</b> <code>${currentUrl}</code>\n` +
                    `📡 <b>Live SMS:</b> ${isActive}\n` +
                    `⚡ <b>Stabilitas:</b> ${isStable}\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `🕐 <b>Waktu:</b> ${new Date().toLocaleTimeString('id-ID')}\n`,
                    { parse_mode: 'HTML' }
                );
                
            } else {
                throw new Error('Koneksi gagal - fungsi connectRobustLiveSms mengembalikan false');
            }
            
        } catch (error) {
            console.error(chalk.red(`[ACTION] ❌ Error koneksi: ${error.message}`));
            
            let suggestions = '';
            if (error.message.includes('Cloudflare') || error.message.includes('CF')) {
                suggestions = '1. Gunakan /login untuk update CF Clearance\n2. Ambil cookie cf_clearance terbaru\n3. Coba akses manual di browser';
            } else if (error.message.includes('login') || error.message.includes('credential')) {
                suggestions = '1. Pastikan username/password benar\n2. Gunakan /login untuk setup ulang\n3. Cek koneksi internet';
            } else {
                suggestions = '1. Coba /login ulang\n2. Restart bot\n3. Hubungi developer';
            }
            
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                messageId,
                null,
                `<blockquote>❌ KONEKSI GAGAL</blockquote>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `⚠️ <b>Error:</b> <code>${error.message}</code>\n\n` +
                `🔧 <b>Saran Perbaikan:</b>\n${suggestions}\n\n` +
                `🔄 <i>Silakan coba lagi atau gunakan /login</i>`,
                { parse_mode: 'HTML' }
            );
        }
    });
});

// ==================================== //
// ========== TEXT HANDLER ============ //
// ==================================== //

bot.on('text', ownerOnly, async (ctx, next) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const state = getUserState(userId);

    if (text.startsWith('/')) return next();
    if (!state || !state.step) return next();

    try {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id).catch(() => {});
    } catch (e) {}

    try {
        switch (state.type) {
            case 'LOGIN': await handleLoginText(ctx, state, text); break;
            case 'USER_AGENT': await handleUserAgentText(ctx, state, text); break;
            case 'CV': await handleCVText(ctx, state, text); break;
            default: resetUserState(userId); return next();
        }
    } catch (error) {
        console.error(chalk.red(`[TEXT HANDLER] Error: ${error.message}`));
        try {
            await ctx.replyWithHTML(
                `<blockquote>⚠️ ERROR SYSTEM</blockquote>\n━━━━━━━━━━━━━━━━━━━━\n❌ <b>Error:</b> ${error.message}\n\n<i>Ulangi perintah dari awal.</i>`, 
                { reply_to_message_id: ctx.message.message_id }
            );
        } catch (e) {}
        resetUserState(userId);
    }
});



// ========== CV FILE SYSTEM ========== //
// ==================================== //

const readContacts = (localPath, type) => {
    if (!fs.existsSync(localPath)) return [];
    const contacts = [];

    if (type === 'csv' || type === 'txt') {
        let fileContent = '';
        try {
            fileContent = fs.readFileSync(localPath, 'utf8');
        } catch (e) {
            return [];
        }

        let lines = fileContent.trim().split('\n');
        const FIRST_DATA_ROW_INDEX = 0;
        if (lines.length === 0) return [];

        let phoneColumnIndex = -1;
        let finalSeparator = ',';
        let maxValidCount = -1;

        const possibleSeparators = [',', '\t', ';', '|'];
        const maxRowsCheck = Math.min(lines.length, 50);

        for (const currentSep of possibleSeparators) {
            let maxCols = 0;
            for(let i = FIRST_DATA_ROW_INDEX; i < maxRowsCheck; i++) {
                 const rowCols = lines[i].trim().split(currentSep);
                 maxCols = Math.max(maxCols, rowCols.length);
            }

            for (let colIndex = 0; colIndex < maxCols; colIndex++) {
                let validCount = 0;

                for (let i = FIRST_DATA_ROW_INDEX; i < maxRowsCheck; i++) {
                    const rowCols = lines[i].trim().split(currentSep);
                    if (rowCols.length > colIndex) {
                        if (isLikelyPhoneNumber(rowCols[colIndex])) {
                            validCount++;
                        }
                    }
                }

                if (validCount >= 5 && validCount > maxValidCount) {
                    maxValidCount = validCount;
                    phoneColumnIndex = colIndex;
                    finalSeparator = currentSep;
                }
            }
        }

        if (phoneColumnIndex === -1 || maxValidCount <= 0) {
            return [];
        }

        let separator = finalSeparator;

        for(let i = FIRST_DATA_ROW_INDEX; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            if (trimmedLine.length < 8 || trimmedLine.match(/^[,\\s\\t]*$/)) {
                continue;
            }

            const columns = trimmedLine.split(separator);

            if (columns.length > phoneColumnIndex) {
                let rawNumber = columns[phoneColumnIndex].trim().replace(/[^0-9+]/g, '');

                if (rawNumber.length >= 8) {
                    const countryName = getCountryInfo(rawNumber);

                    if (countryName !== "UNKNOWN") {
                        contacts.push({
                            number: rawNumber.startsWith('+') ? rawNumber.substring(1) : rawNumber,
                            country: countryName.toUpperCase(),
                            name: ''
                        });
                    }
                }
            }
        }

    }
    else if (type === 'vcf') {
        let fileContent = fs.readFileSync(localPath, 'utf8');
        const lines = fileContent.trim().split('\n');

        const telRegex = /TEL;(?:TYPE=CELL|TYPE=WORK|TYPE=HOME|TYPE=VOICE|VOICE|CELL|WORK|HOME):([+]*\d+)/i;

        lines.forEach(line => {
            const match = line.match(telRegex);
            if (match) {
                let rawNumber = match[1].trim().replace(/[^0-9+]/g, '');

                if (rawNumber.startsWith('+')) {
                    rawNumber = rawNumber.substring(1);
                }

                if (rawNumber.length >= 9) {
                    const countryName = getCountryInfo(rawNumber);

                    if (countryName !== "UNKNOWN") {
                        contacts.push({
                            number: rawNumber,
                            country: countryName.toUpperCase(),
                            name: ''
                        });
                    }
                }
            }
        });
    }
    else if (type === 'xlsx') {
        try {
            const workbook = XLSX.readFile(localPath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (json.length === 0) return [];

            let phoneColumnIndex = -1;
            let startIndex = 0;
            let maxValidCount = 0;
            const maxCols = json.reduce((max, row) => Math.max(max, row.length), 0);
            const maxRowsCheck = Math.min(json.length, 50);

            for (let colIndex = 0; colIndex < maxCols; colIndex++) {
                let validCount = 0;
                let firstDataRow = -1;

                for (let i = 0; i < maxRowsCheck; i++) {
                    const row = json[i];
                    if (row.length > colIndex) {
                        const cellValue = String(row[colIndex] || '').trim();
                        if (isLikelyPhoneNumber(cellValue)) {
                            validCount++;
                            if (firstDataRow === -1) firstDataRow = i;
                        }
                    }
                }

                if (validCount >= 5 && validCount > maxValidCount) {
                    maxValidCount = validCount;
                    phoneColumnIndex = colIndex;
                    startIndex = firstDataRow;
                }
            }

            if (phoneColumnIndex === -1 || maxValidCount === 0) {
                 return [];
            }

            for (let i = startIndex; i < json.length; i++) {
                const row = json[i];
                if (row.length > phoneColumnIndex) {
                    let rawNumber = String(row[phoneColumnIndex] || '').trim().replace(/[^0-9+]/g, '');

                    if (rawNumber.length >= 8) {
                        const countryName = getCountryInfo(rawNumber);

                        if (countryName !== "UNKNOWN") {
                            contacts.push({
                                number: rawNumber.startsWith('+') ? rawNumber.substring(1) : rawNumber,
                                country: countryName.toUpperCase(),
                                name: ''
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.error("[STATUS] Error reading XLSX:", e);
            return [];
        }
    }

    const uniqueContacts = Array.from(new Map(contacts.map(item => [item.number, item])).values());
    return uniqueContacts;
};

const getCountryData = (contacts) => {
    const countryData = {};
    const countryList = [];
    
    contacts.forEach(contact => {
        if (!countryData[contact.country]) {
            countryData[contact.country] = 0;
        }
        countryData[contact.country]++;
    });
    
    Object.keys(countryData).forEach(country => {
        countryList.push(`${getCountryFlag(country)} ${country}: ${countryData[country]} Number`);
    });
    
    return {
        data: countryData,
        list: countryList.join('\n')
    };
};

const processContacts = (contacts, targetType, splitByCountry, countryDataMap) => {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    const results = [];

    const writeContactFile = (countryName, listContacts) => {
        const countryFileName = countryName.replace(/[\s-]/g, '_');
        const targetPath = path.join(TEMP_DIR, `${countryFileName}_${Date.now()}_temp.${targetType}`);

        const contactNumbers = listContacts.map(c => [c.number]);

        if (targetType === 'xlsx') {
            const ws = XLSX.utils.aoa_to_sheet([['NUMBER'], ...contactNumbers]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Contacts");
            XLSX.writeFile(wb, targetPath);

        } else if (targetType === 'vcf') {
            let vcfContent = '';
            listContacts.forEach((c) => {
                vcfContent += `BEGIN:VCARD\nVERSION:3.0\nN:;${c.number};;;\nFN:${c.number}\nTEL;TYPE=CELL:${c.number}\nEND:VCARD\n`;
            });
            fs.writeFileSync(targetPath, vcfContent, 'utf8');

        } else if (targetType === 'csv' || targetType === 'txt') {
            let fileContent = '';
            listContacts.forEach(c => {
                const fullNumber = c.number;
                fileContent += `${fullNumber}\n`;
            });
            fs.writeFileSync(targetPath, fileContent, 'utf8');
        }

        results.push({
            path: targetPath,
            country: countryName,
            count: listContacts.length,
            serviceName: null
        });
    };

    if (splitByCountry) {
        // Group contacts by country
        const contactsByCountry = {};
        contacts.forEach(contact => {
            if (!contactsByCountry[contact.country]) {
                contactsByCountry[contact.country] = [];
            }
            contactsByCountry[contact.country].push(contact);
        });
        
        // Buat file untuk setiap negara
        for (const countryName in contactsByCountry) {
            if (contactsByCountry[countryName].length > 0) {
                writeContactFile(countryName, contactsByCountry[countryName]);
            }
        }
    } else {
        // Periksa berapa banyak negara unik dalam kontak
        const uniqueCountries = [...new Set(contacts.map(c => c.country))];
        
        if (uniqueCountries.length === 1) {
            // Jika hanya ada 1 negara, gunakan nama negara tersebut
            const singleCountryName = uniqueCountries[0];
            writeContactFile(singleCountryName, contacts);
        } else {
            // Jika ada multiple countries, gunakan 'ALL_COUNTRIES'
            writeContactFile('ALL_COUNTRIES', contacts);
        }
    }

    return results;
};

const sendConvertedFiles = async (ctx, cvData) => {
    const userId = ctx.from.id;
    const waitMessage = await ctx.replyWithHTML("⏳ Sedang mengkonversi dan mengirim file...");

    try {
        const filesToSend = cvData.fileList;

        if (!filesToSend || filesToSend.length === 0) {
            await ctx.telegram.deleteMessage(ctx.chat.id, waitMessage.message_id).catch(e => {});
            await ctx.replyWithHTML("❌ Tidak ada file yang dapat dikirim.");
            resetUserState(userId);
            return;
        }

        const currentDate = new Date().toLocaleDateString('id-ID', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        for (const fileInfo of filesToSend) {
            const finalServiceName = fileInfo.serviceName || cvData.serviceName || 'No_Service';
            const countryFlag = getCountryFlag(fileInfo.country);

            const countryFileName = fileInfo.country.replace(/[\s-]/g, '_');
            const serviceFileName = finalServiceName.replace(/[\s-]/g, '_');
            const finalFileName = `${countryFlag}_${countryFileName}_${serviceFileName}_${fileInfo.count}.${cvData.targetType}`;

            const finalCaption = `<blockquote>${countryFlag} ${fileInfo.country.toUpperCase()}</blockquote>
━━━━━━━━━━━━━━━━━━━━
${fileInfo.count} Number
${finalServiceName}
━━━━━━━━━━━━━━━━━━━━
<b><i>Date : ${currentDate}</i></b>`.trim();

            await ctx.replyWithDocument({ source: fileInfo.path, filename: finalFileName }, { 
                caption: finalCaption, 
                parse_mode: 'HTML' 
            });

            // Cleanup file temporary
            if (fs.existsSync(fileInfo.path)) {
                try {
                    fs.unlinkSync(fileInfo.path);
                } catch (e) {
                    console.error("[STATUS] Gagal menghapus file sementara:", e.message);
                }
            }
        }

        await ctx.telegram.deleteMessage(ctx.chat.id, waitMessage.message_id).catch(e => {});
        await ctx.replyWithHTML(`✅ Selesai! ${filesToSend.length} file berhasil dikirim.`);
        
    } catch (error) {
        console.error("[STATUS] Error saat mengirim file konversi:", error);
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMessage.message_id).catch(e => {});
        await ctx.replyWithHTML(`❌ Error: ${error.message}`);
    } finally {
        resetUserState(userId);
    }
};

const showSplitOptions = async (ctx, state, targetType) => {
    const messageId = state.data.messageId;
    const numCountries = Object.keys(state.data.countryData).length;
    state.data.targetType = targetType;

    const newText = `<pre>Convert Status

➡️ Pilihan Format : ${targetType.toUpperCase()}
➡️ Jumlah Negara : ${numCountries}
${numCountries > 1 ?
    `Terdeteksi ${numCountries} negara. Apakah Anda ingin [pisah] file per negara atau [gabung] menjadi satu file?` :
    `Hanya terdeteksi 1 negara. Silakan lanjut.`
}</pre>`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('PISAH', 'cv_split_true'), Markup.button.callback('GABUNG', 'cv_split_false')]
    ]);

    state.step = 'service_selection';
    
    if (numCountries <= 1) {
        state.data.splitByCountry = false;
        await showServiceOptions(ctx, state);
        return;
    }

    await safeEditMessage(ctx, messageId, newText, keyboard);
};

const showServiceOptions = async (ctx, state) => {
    const messageId = state.data.messageId;
    const numCountries = Object.keys(state.data.countryData).length;

    state.data.fileList = processContacts(state.data.contacts, state.data.targetType, state.data.splitByCountry, state.data.countryData);

    const filesToCreate = state.data.fileList.length;
    const splitText = state.data.splitByCountry ? 'PISAH' : (numCountries > 1 ? 'GABUNG' : 'SATU');

    const newText = `<pre>Convert Status

➡️ Format Konversi : ${state.data.targetType.toUpperCase()}
➡️ Mode File : ${splitText} (${filesToCreate} file akan dibuat)

Silakan konfirmasi terlebih dahulu: Service akan diisi satu-satu (per file) atau langsung semua dengan nama service yang sama..?
</pre>`;

    state.step = 'service_input_mode';

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('SATUAN', 'cv_service_mode_single'), Markup.button.callback('SEMUA', 'cv_service_mode_all')]
    ]);

    await safeEditMessage(ctx, messageId, newText, keyboard);
};

bot.command('cv', ownerOnly, async (ctx) => {
    const userId = ctx.from.id;
    
    // Clear any existing state
    resetUserState(userId);
    
    let doc = null;
    let localPath = null;

    // Case 1: Reply to a file with /cv
    if (ctx.message.reply_to_message && ctx.message.reply_to_message.document) {
        doc = ctx.message.reply_to_message.document;
    }
    // Case 2: Message with document and caption /cv
    else if (ctx.message.document) {
        const messageText = ctx.message.text || '';
        if (messageText.trim() === '/cv' || messageText.includes('/cv ')) {
            doc = ctx.message.document;
        }
    }

    if (!doc) {
        return replyHTML(ctx,
            `<pre>Error

⚠️ Cara penggunaan:
1. Balas file dengan mengetik /cv
2. Atau kirim file dengan caption /cv

Format file yang didukung:
.csv, .txt, .vcf, .xlsx, .xls</pre>`,
            { reply_to_message_id: ctx.message.message_id }
        );
    }

    try {
        const fileName = doc.file_name || 'file';
        const initialType = detectTypeByName(fileName);

        if (!initialType) {
            return replyHTML(ctx,
                `<pre>Error

❌ Format file tidak didukung.
Format yang didukung: .csv, .txt, .vcf, .xlsx, .xls</pre>`,
                { reply_to_message_id: ctx.message.message_id }
            );
        }

        const downloadMsg = await replyHTML(ctx,
            `<pre>Convert Status

⏳ Mengunduh file ${fileName}...</pre>`,
            { reply_to_message_id: ctx.message.message_id }
        );

        localPath = await downloadFile(doc.file_id, fileName);

        try { await ctx.telegram.deleteMessage(ctx.chat.id, downloadMsg.message_id); } catch { }

        const contacts = readContacts(localPath, initialType) || [];

        if (contacts.length === 0) {
            return replyHTML(ctx,
                `<pre>Error

❌ Tidak ada nomor telepon yang terdeteksi dalam file.
Pastikan file memiliki kolom nomor telepon yang valid.</pre>`,
                { reply_to_message_id: ctx.message.message_id }
            );
        }

        const { data: countryData, list: countryList } = getCountryData(contacts);
        const numCountries = Object.keys(countryData).length;

        // Set state untuk CV dengan sistem baru
        const state = setUserState(userId, 'CV', {
            contacts: contacts,
            countryData: countryData,
            fileName: fileName,
            fileType: initialType,
            chatId: ctx.chat.id,
            targetType: '',
            splitByCountry: false,
            serviceMode: null,
            fileList: [],
            currentFileIndex: 0,
            serviceName: null
        });
        state.step = 'country_split_selection';

        const info = `<pre>Convert Status

📄 File Asli: ${fileName} (${initialType.toUpperCase()})
👥 Total Nomor: ${contacts.length}

📋 Daftar Negara Terdeteksi (${numCountries} Negara):
${countryList}

✅ Silakan pilih format konversi yang Anda inginkan.</pre>`;

        const buttons = [
            Markup.button.callback('📄 TXT', 'cv_to_txt'),
            Markup.button.callback('📘 XLSX', 'cv_to_xlsx'),
            Markup.button.callback('📱 VCF', 'cv_to_vcf'),
            Markup.button.callback('📎 CSV', 'cv_to_csv')
        ];

        const sentMessage = await replyHTML(ctx, info, Markup.inlineKeyboard(chunkArray(buttons, 2)));
        state.data.messageId = sentMessage.message_id;

    } catch (e) {
        console.error("[STATUS] Error CV:", e.message);
        return replyHTML(ctx,
            `<pre>Error

❌ Terjadi kesalahan saat memproses file:
${e.message}</pre>`,
            { reply_to_message_id: ctx.message.message_id }
        );
    } finally {
        if (localPath && fs.existsSync(localPath)) {
            try { fs.unlinkSync(localPath); } catch { }
        }
    }
});

bot.action(/cv_to_(txt|xlsx|vcf|csv)/, ownerOnly, async (ctx) => {
    const userId = ctx.from.id;
    const state = getUserState(userId);
    
    if (!state || state.type !== 'CV' || state.step !== 'country_split_selection') {
        await ctx.answerCbQuery('⚠️ Sesi berakhir.');
        return;
    }

    const targetType = ctx.match[1];
    
    // Update state
    state.data.targetType = targetType;
    const numCountries = Object.keys(state.data.countryData).length;

    const newText = `<pre>Convert Status

➡️ Pilihan Format : ${targetType.toUpperCase()}
➡️ Jumlah Negara : ${numCountries}
${numCountries > 1 ?
    `Terdeteksi ${numCountries} negara. Apakah Anda ingin [pisah] file per negara atau [gabung] menjadi satu file?` :
    `Hanya terdeteksi 1 negara. Silakan lanjut.`
}</pre>`;

    if (numCountries <= 1) {
        state.data.splitByCountry = false;
        state.step = 'service_selection';
        state.data.fileList = processContacts(state.data.contacts, state.data.targetType, state.data.splitByCountry, state.data.countryData);
        
        const filesToCreate = state.data.fileList.length;
        const newText2 = `<pre>Convert Status

➡️ Format Konversi : ${state.data.targetType.toUpperCase()}
➡️ Mode File : SATU (${filesToCreate} file akan dibuat)

Silakan konfirmasi terlebih dahulu: Service akan diisi satu-satu (per file) atau langsung semua dengan nama service yang sama..?
</pre>`;

        state.step = 'service_input_mode';
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('SATUAN', 'cv_service_mode_single'), Markup.button.callback('SEMUA', 'cv_service_mode_all')]
        ]);

        await safeEditMessage(ctx, state.data.messageId, newText2, keyboard);
        return;
    }

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('PISAH', 'cv_split_true'), Markup.button.callback('GABUNG', 'cv_split_false')]
    ]);

    state.step = 'service_selection';
    await safeEditMessage(ctx, state.data.messageId, newText, keyboard);
});

bot.action(/cv_split_(true|false)/, ownerOnly, async (ctx) => {
    const userId = ctx.from.id;
    const state = getUserState(userId);
    
    if (!state || state.type !== 'CV' || state.step !== 'service_selection') {
        await ctx.answerCbQuery('⚠️ Sesi berakhir.');
        return;
    }

    state.data.splitByCountry = ctx.match[1] === 'true';
    state.data.fileList = processContacts(state.data.contacts, state.data.targetType, state.data.splitByCountry, state.data.countryData);

    const filesToCreate = state.data.fileList.length;
    const splitText = state.data.splitByCountry ? 'PISAH' : 'GABUNG';
    const numCountries = Object.keys(state.data.countryData).length;

    const newText = `<pre>Convert Status

➡️ Format Konversi : ${state.data.targetType.toUpperCase()}
➡️ Mode File : ${splitText} (${filesToCreate} file akan dibuat)

Silakan konfirmasi terlebih dahulu: Service akan diisi satu-satu (per file) atau langsung semua dengan nama service yang sama..?
</pre>`;

    state.step = 'service_input_mode';
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('SATUAN', 'cv_service_mode_single'), Markup.button.callback('SEMUA', 'cv_service_mode_all')]
    ]);

    await safeEditMessage(ctx, state.data.messageId, newText, keyboard);
});

bot.action(/cv_service_mode_(single|all)/, ownerOnly, async (ctx) => {
    const userId = ctx.from.id;
    const state = getUserState(userId);
    
    if (!state || state.type !== 'CV' || state.step !== 'service_input_mode') {
        await ctx.answerCbQuery('⚠️ Sesi berakhir.');
        return;
    }

    const mode = ctx.match[1];
    state.data.serviceMode = mode;
    state.data.currentFileIndex = 0;

    await ctx.answerCbQuery(mode === 'single' ? 'Mode Satuan dipilih.' : 'Mode Semua dipilih.');

    if (mode === 'single') {
        state.step = 'awaiting_single_service_input';
        const currentFile = state.data.fileList[0];
        const newText = `<pre>Convert Status

➡️ Service Mode : SATUAN (${state.data.fileList.length} File)

Silakan berikan nama Service (Contoh: WhatsApp, Google, dll.) untuk file 1 dari ${state.data.fileList.length} :
${getCountryFlag(currentFile.country)} ${currentFile.country} (${currentFile.count} Number)</pre>
`;

        await safeEditMessage(ctx, state.data.messageId, newText);
    } else {
        state.step = 'awaiting_all_service_input';
        const newText = `<pre>Convert Status

➡️ Service Mode : SEMUA (${state.data.fileList.length} File)

Silakan berikan satu nama Service (Contoh: WhatsApp) yang akan digunakan untuk semua ${state.data.fileList.length} file yang akan dikonversi.</pre>
        `;
        await safeEditMessage(ctx, state.data.messageId, newText);
    }
});


// ==================================== //
// ========== SCREENSHOT SYSTEM ======= //
// ==================================== //

const takeScreenshot = async (ctx, url, captionTitle) => {
    if (!isBrowserReady || !browser) {
        return replyHTML(ctx, "❌ Browser tidak ready.");
    }

    let page = null;
    let ssPath = null;
    const waitMsg = await replyHTML(ctx, `⏳ Sedang memproses...`);

    try {
        page = await browser.newPage();
        await page.setDefaultTimeout(SCREENSHOT_TIMEOUT_MS);
        await page.setViewport(null);
        await page.setUserAgent(settings.CURRENT_USER_AGENT);

        if (url.includes('ivasms.com') && settings.CF_CLEARANCE_VALUE) {
            await page.setCookie({
                name: 'cf_clearance',
                value: settings.CF_CLEARANCE_VALUE,
                domain: '.ivasms.com'
            });
        }

        const response = await page.goto(url, { 
            waitUntil: 'networkidle2', 
            timeout: SCREENSHOT_TIMEOUT_MS 
        });
        
        const status = response ? response.status() : 'N/A';
        await new Promise(r => setTimeout(r, 3000));

        ssPath = path.join(SS_DIR, `screenshot_${Date.now()}.jpeg`);
        await page.screenshot({ 
            path: ssPath, 
            fullPage: false,
            type: 'jpeg', 
            quality: 85
        });

        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

        const captionText = `<pre>📸 Hasil screenshot\n\nURL : ${url}\nStatus : ${status}\nWaktu : ${new Date().toLocaleTimeString('id-ID')}</pre>`;
        await ctx.replyWithPhoto({ source: ssPath }, { caption: captionText, parse_mode: 'HTML' });

    } catch (error) {
        await ctx.telegram.editMessageText(
            ctx.chat.id, 
            waitMsg.message_id, 
            null, 
            `<pre>❌ Gagal ambil screenshot\n${error.message}</pre>`, 
            { parse_mode: 'HTML' }
        );
    } finally {
        if (page) await page.close();
        if (ssPath && fs.existsSync(ssPath)) fs.unlinkSync(ssPath);
    }
};

const takeDashboardScreenshot = async (ctx) => {
    await takeScreenshot(ctx, DASH_URL, 'Dashboard screenshot');
};

const takeLiveSmsScreenshot = async (ctx) => {
    await takeScreenshot(ctx, LIVE_SMS_URL, 'Live SMS screenshot');
};

const takeMacbookScreenshot = async (ctx, targetUrl) => {
    if (!isBrowserReady || !browser) {
        return replyHTML(ctx, "❌ Browser tidak ready.");
    }

    let page = null;
    let ssPath = null;
    const waitMsg = await replyHTML(ctx, `<pre>Screenshot Status\n\nSedang mengambil screenshot\n⏳ Loading : ${targetUrl}</pre>`);

    try {
        if (!targetUrl.startsWith('http')) {
            throw new Error('URL harus diawali dengan http:// atau https://');
        }

        page = await browser.newPage();
        await page.setViewport(null);
        await page.setUserAgent(MACBOOK_USER_AGENT);
        
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        });

        if (targetUrl.includes('ivasms.com') && settings.CF_CLEARANCE_VALUE) {
            await page.setCookie({
                name: 'cf_clearance',
                value: settings.CF_CLEARANCE_VALUE,
                domain: '.ivasms.com'
            });
        }

        const response = await page.goto(targetUrl, { 
            waitUntil: 'networkidle2',
            timeout: 45000
        });
        
        const status = response ? response.status() : 'N/A';
        await new Promise(resolve => setTimeout(resolve, 3000));

        ssPath = path.join(SS_DIR, `macbook_ss_${Date.now()}.jpeg`);
        await page.screenshot({ 
            path: ssPath, 
            fullPage: false,
            type: 'jpeg', 
            quality: 90
        });

        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

        const captionText = `<pre>Hasil Screenshot\n\nURL : ${targetUrl}\nStatus : ${status}</pre>`;
        
        await ctx.replyWithPhoto(
            { source: ssPath }, 
            { caption: captionText, parse_mode: 'HTML' }
        );

    } catch (error) {
        console.error(chalk.red(`[STATUS] ❌ Screenshot Error: ${error.message}`));
        await ctx.telegram.editMessageText(
            ctx.chat.id, 
            waitMsg.message_id, 
            null, 
            `<pre>Error\n\n❌ Gagal mengambil screenshot\n${error.message}</pre>`, 
            { parse_mode: 'HTML' }
        );
    } finally {
        if (page) await page.close().catch(() => {});
        if (ssPath && fs.existsSync(ssPath)) {
            try { fs.unlinkSync(ssPath); } catch (e) {}
        }
    }
};

// ==================================== //
// ========== EXPORT NUMBERS ========== //
// ==================================== //

const simpleDirectExport = async (ctx) => {
    // Cek apakah sudah ada credentials
    if (!settings.CF_CLEARANCE_VALUE) {
        return await ctx.replyWithHTML(
            `<pre>Export Status\n\n❌ <b>CF Clearance tidak ditemukan</b>\n\nSilakan login dulu dengan /login</pre>`,
            { reply_to_message_id: ctx.message.message_id }
        );
    }
    
    const waitMsg = await replyHTML(ctx, `<pre>EXPORT NUMBER\n\n📥 Memulai export numbers...</pre>`);
    
    let page = null;
    
    try {
        if (!isBrowserReady || !browser) {
            throw new Error("Browser tidak ready");
        }
        
        // Buat page baru
        page = await browser.newPage();
        await page.setDefaultNavigationTimeout(45000);
        await page.setDefaultTimeout(45000);
        
        await safeEditMessage(ctx, waitMsg.message_id, `<pre>EXPORT NUMBER\n\n🌐 Setup browser...</pre>`);
        
        // Set User Agent
        await page.setUserAgent(settings.CURRENT_USER_AGENT || MACBOOK_USER_AGENT);
        
        // Set cookies (hanya cf_clearance yang penting)
        await page.setCookie({
            name: 'cf_clearance',
            value: settings.CF_CLEARANCE_VALUE,
            domain: '.ivasms.com',
            path: '/',
            httpOnly: true,
            secure: true
        });
        
        // Setup download path
        try {
            const client = await page.target().createCDPSession();
            await client.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: TEMP_DIR
            });
        } catch (e) {
            console.log(chalk.yellow('[EXPORT] ⚠️ CDPSession error, continue anyway'));
        }
        
        // Step 1: Akses halaman numbers
        await safeEditMessage(ctx, waitMsg.message_id, `<pre>EXPORT NUMBER\n\n🌐 Mengakses halaman numbers...</pre>`);
        
        const numbersUrl = 'https://www.ivasms.com/portal/numbers';
        console.log(chalk.cyan(`[EXPORT] Mengakses: ${numbersUrl}`));
        
        const response = await page.goto(numbersUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        const status = response ? response.status() : 'N/A';
        console.log(chalk.cyan(`[EXPORT] Status: ${status}`));
        
        // Tunggu halaman load
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Step 2: Cek apakah di halaman numbers
        const currentUrl = await page.url();
                
        if (!currentUrl.includes('/numbers')) {
            // Mungkin diarahkan ke login atau error
            if (currentUrl.includes('/login')) {
                await safeEditMessage(ctx, waitMsg.message_id, `<pre>EXPORT NUMBER\n\n🔑 Terdeteksi halaman login</pre>`);
                
                // Coba login dengan username/password jika ada
                if (settings.IVAS_USERNAME && settings.IVAS_PASSWORD) {
                    await safeEditMessage(ctx, waitMsg.message_id, `<pre>EXPORT NUMBER\n\n📧 Login dengan ${settings.IVAS_USERNAME}...</pre>`);
                    
                    await page.evaluate((username, password) => {
                        // Cari field login
                        const emailField = document.querySelector('input[type="email"], input[name="email"], input[name="username"]');
                        const passwordField = document.querySelector('input[type="password"]');
                        const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
                        
                        if (emailField) emailField.value = username;
                        if (passwordField) passwordField.value = password;
                        if (submitBtn) submitBtn.click();
                    }, settings.IVAS_USERNAME, settings.IVAS_PASSWORD);
                    
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    // Coba akses numbers lagi
                    await page.goto(numbersUrl, {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } else {
                    throw new Error("Diarahkan ke login page. Setup login dengan /login");
                }
            } else {
                throw new Error(`Tidak bisa mengakses halaman numbers. URL: ${currentUrl}`);
            }
        }
        
        // Step 3: Cari dan klik tombol export
        await safeEditMessage(ctx, waitMsg.message_id, `<pre>EXPORT NUMBER\n\n🔍 Mencari tombol export...</pre>`);
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        let exportClicked = false;
        
        // Coba beberapa cara klik export
        exportClicked = await page.evaluate(() => {
            // Cara 1: Cari tombol dengan text "Export"
            const buttons = document.querySelectorAll('button, a, .btn, input[type="button"]');
            
            for (const btn of buttons) {
                const text = (btn.textContent || btn.innerText || '').toLowerCase();
                const href = btn.getAttribute('href') || '';
                
                if (text.includes('export') || text.includes('download') || 
                    text.includes('unduh') || text.includes('ekspor') ||
                    href.includes('export') || href.includes('download')) {
                    
                    console.log('Found export button:', text);
                    
                    if (btn.tagName.toLowerCase() === 'a') {
                        // Untuk link, klik langsung
                        btn.click();
                        return true;
                    } else {
                        // Untuk button, klik
                        btn.click();
                        return true;
                    }
                }
            }
            
            // Cara 2: Cari link dengan href yang mengandung export
            const links = document.querySelectorAll('a[href*="export"], a[href*="download"]');
            if (links.length > 0) {
                links[0].click();
                return true;
            }
            
            return false;
        });
        
        if (!exportClicked) {
            // Cara 3: Coba cari dengan class atau ID
            exportClicked = await page.evaluate(() => {
                const exportElements = document.querySelectorAll('[class*="export"], [id*="export"], [class*="download"], [id*="download"]');
                
                for (const el of exportElements) {
                    try {
                        el.click();
                        console.log('Clicked export element by class/id');
                        return true;
                    } catch (e) {
                        continue;
                    }
                }
                return false;
            });
        }
        
        if (!exportClicked) {
            // Cara 4: Coba akses URL export langsung
            await safeEditMessage(ctx, waitMsg.message_id, `<pre>EXPORT NUMBER\n\n🔗 Mencoba URL export langsung...</pre>`);
            
            const exportUrl = 'https://www.ivasms.com/portal/numbers/export';
            
            await page.goto(exportUrl, {
                waitUntil: 'networkidle0',
                timeout: 30000
            });
            
            exportClicked = true;
        }
        
        if (!exportClicked) {
            throw new Error("Tidak bisa menemukan tombol export");
        }
        
        // Step 4: Tunggu file download
        await safeEditMessage(ctx, waitMsg.message_id, `<pre>EXPORT NUMBER\n\n⏳ Menunggu file download... (15 detik)</pre>`);
        
        let downloadedFile = null;
        const maxWaitTime = 15000; // 15 detik
        const checkInterval = 1000; // Cek setiap 1 detik
        
        for (let elapsed = 0; elapsed < maxWaitTime; elapsed += checkInterval) {
            // Cari file baru di TEMP_DIR
            const files = fs.readdirSync(TEMP_DIR);
            const excelFiles = files.filter(f => {
                const lower = f.toLowerCase();
                return lower.endsWith('.xlsx') || 
                       lower.endsWith('.xls') ||
                       lower.includes('numbers') ||
                       lower.includes('export');
            });
            
            if (excelFiles.length > 0) {
                // Ambil file terbaru berdasarkan waktu modifikasi
                excelFiles.sort((a, b) => {
                    const statA = fs.statSync(path.join(TEMP_DIR, a));
                    const statB = fs.statSync(path.join(TEMP_DIR, b));
                    return statB.mtimeMs - statA.mtimeMs;
                });
                
                const latestFile = excelFiles[0];
                const filePath = path.join(TEMP_DIR, latestFile);
                const stats = fs.statSync(filePath);
                
                // Pastikan file cukup besar (tidak corrupted)
                if (stats.size > 1024) {
                    downloadedFile = {
                        path: filePath,
                        name: latestFile,
                        size: stats.size,
                        mtime: stats.mtime
                    };
                    

                    break;
                }
            }
            
            // Update progress setiap 5 detik
            if (elapsed > 0 && elapsed % 5000 === 0) {
                const remaining = (maxWaitTime - elapsed) / 1000;
                await safeEditMessage(ctx, waitMsg.message_id, 
                    `<pre>EXPORT NUMBER\n\n⏳ Menunggu file... (${remaining}s tersisa)</pre>`);
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        if (!downloadedFile) {
            // Coba tunggu ekstra 5 detik
            await safeEditMessage(ctx, waitMsg.message_id, `<pre>EXPORT NUMBER\n\n⏳ Tunggu ekstra 5 detik...</pre>`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Cek lagi
            const files = fs.readdirSync(TEMP_DIR);
            const excelFiles = files.filter(f => f.toLowerCase().endsWith('.xlsx') || f.toLowerCase().endsWith('.xls'));
            
            if (excelFiles.length > 0) {
                excelFiles.sort((a, b) => {
                    const statA = fs.statSync(path.join(TEMP_DIR, a));
                    const statB = fs.statSync(path.join(TEMP_DIR, b));
                    return statB.mtimeMs - statA.mtimeMs;
                });
                
                const latestFile = excelFiles[0];
                const filePath = path.join(TEMP_DIR, latestFile);
                const stats = fs.statSync(filePath);
                
                if (stats.size > 1024) {
                    downloadedFile = {
                        path: filePath,
                        name: latestFile,
                        size: stats.size
                    };
                }
            }
            
            if (!downloadedFile) {
                throw new Error("File tidak terdownload setelah 20 detik");
            }
        }
        
        // Step 5: Proses file yang didownload
        await safeEditMessage(ctx, waitMsg.message_id, `<pre>EXPORT NUMBER\n\n📊 Memproses file...</pre>`);
        
        // Rename file dengan timestamp
        const timestamp = new Date().toLocaleString('id-ID').replace(/[/:\s]/g, '-');
        const newFileName = `ivasms_numbers_${timestamp}.xlsx`;
        const newFilePath = path.join(TEMP_DIR, newFileName);
        
        // Pastikan extension .xlsx
        if (!downloadedFile.path.toLowerCase().endsWith('.xlsx')) {
            fs.renameSync(downloadedFile.path, downloadedFile.path + '.xlsx');
            fs.renameSync(downloadedFile.path + '.xlsx', newFilePath);
        } else {
            fs.renameSync(downloadedFile.path, newFilePath);
        }
        
        // Hitung jumlah baris data
        let rowCount = 0;
        try {
            const workbook = XLSX.readFile(newFilePath);
            const sheetName = workbook.SheetNames[0];
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
            rowCount = data.length;
        } catch (e) {
            console.log(chalk.yellow(`[EXPORT] ❌ Tidak bisa membaca file: ${e.message}`));
            rowCount = 'N/A';
        }
        
        // Step 6: Kirim file ke Telegram
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        
        const fileSizeKB = (downloadedFile.size / 1024).toFixed(1);
        
        await ctx.replyWithDocument(
            { source: newFilePath, filename: newFileName },
            {
                caption: `<pre>✅ EXPORT BERHASIL\n\n📁 File: ${newFileName}\n📊 Data: ${rowCount} baris\n📏 Size: ${fileSizeKB} KB\n⏰ Waktu: ${new Date().toLocaleTimeString('id-ID')}\n\nCreated by @Userrr_warxzz</pre>`,
                parse_mode: 'HTML',
                reply_to_message_id: ctx.message.message_id
            }
        );
        
        console.log(chalk.green(`[EXPORT] ✅ File berhasil dikirim: ${newFileName}`));
        
        // Cleanup file setelah 10 detik
        setTimeout(() => {
            if (fs.existsSync(newFilePath)) {
                try {
                    fs.unlinkSync(newFilePath);
                } catch (e) {}
            }
        }, 10000);
        
    } catch (error) {
        console.error(chalk.red(`[EXPORT] ❌ Error: ${error.message}`));
        
        // Hapus pesan progress
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
        } catch (e) {}
        
        let errorMessage = error.message;
        let suggestions = '';
        
        if (error.message.includes('ERR_ABORTED') || error.message.includes('net::')) {
            suggestions = '\n\n💡 <b>Solusi:</b>\n' +
                         '1. Update CF Clearance dengan /login\n' +
                         '2. Coba akses manual di browser dulu\n' +
                         '3. Tunggu beberapa menit lalu coba lagi';
        } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
            suggestions = '\n\n💡 <b>Solusi:</b>\n' +
                         '1. Coba lagi nanti\n' +
                         '2. Cek koneksi internet\n' +
                         '3. Server mungkin sibuk';
        }
        
        await ctx.replyWithHTML(
            `<pre>Export Status\n\n❌ <b>Gagal Export</b>\n\n${errorMessage}${suggestions}</pre>`,
            { reply_to_message_id: ctx.message.message_id }
        );
        
    } finally {
        // Tutup page
        if (page && !page.isClosed()) {
            try {
                await page.close();
            } catch (e) {}
        }
    }
};

bot.command('exportnum', ownerOnly, async (ctx) => {
    await simpleDirectExport(ctx);
});


// ==================================== //
// ========== INTERVAL SYSTEM ========= //
// ==================================== //

const logStatus = () => {
    const now = Date.now();

    if (lastLoggedStatus !== botStatus || now - lastStatusLog > STATUS_LOG_INTERVAL) {
        
        const uptime = isConnectionStable 
            ? Math.floor((now - stableConnectionStartTime) / 60000) + 'm' 
            : 'N/A';

        // Styling Bold
        const bWhite = chalk.bold.whiteBright;
        const bCyan = chalk.bold.cyanBright;
        const bBlue = chalk.bold.blueBright;
        const bGreen = chalk.bold.greenBright;
        const bYellow = chalk.bold.yellowBright;

        // Penentuan warna status
        const currentStatusColor = (botStatus.includes('READY') || botStatus === 'CONNECTED') ? bGreen : bYellow;
        const stabilityColor = isConnectionStable ? bGreen : bYellow;

        const statusBox = `
${bCyan('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓')}
${bCyan('┃')}    ${bCyan('🚀 SYSTEM MONITOR')}  ━━  ${bWhite(PROJECT_NAME || 'BOT')}     ${bCyan('┃')}
${bCyan('┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫')}
${bCyan('┃')}  ${bWhite('🕒 LAST CHECK')}  ${bCyan('┃')} ${bWhite(lastCheckTime)}       ${bCyan('┃')}
${bCyan('┃')}  ${bWhite('📊 BOT STATUS')}  ${bCyan('┃')} ${currentStatusColor(botStatus)}             ${bCyan('┃')}
${bCyan('┃')}  ${bWhite('🛡️  STABILITY')}   ${bCyan('┃')} ${stabilityColor(isConnectionStable ? '✅ STABLE' : '⚠️ UNSTABLE')}     ${bCyan('┃')}
${bCyan('┃')}  ${bWhite('⏳ CONN TIME')}   ${bCyan('┃')} ${bBlue(uptime)}                       ${bCyan('┃')}
${bCyan('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛')}
        `.trim();

        console.log('\n' + statusBox + '\n');

        lastLoggedStatus = botStatus;
        lastStatusLog = now;
    }
};




// ==================================== //
// ========== START BOT =============== //
// ==================================== //

setInterval(maintainConnection, 60000);
setInterval(logStatus, 21600000);

process.once('SIGINT', () => {
    console.log(chalk.yellow("\nBot Stopped by SIGINT."));
    bot.stop('SIGINT');
});

module.exports = {
    bot,
    browser,
    liveSmsPage,
    isPollingActive,
    isBrowserReady,
    getBotStatus: () => botStatus
};

