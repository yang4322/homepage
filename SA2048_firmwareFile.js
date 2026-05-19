// ====================== 多CDN自动切换 + 同步顺序加载器 ======================
const CDN = {
  forge: [
    "https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js",
    "https://unpkg.com/node-forge@1.3.1/dist/forge.min.js"
  ],
  sha3: [
    "https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/crypto-js.min.js",
    "https://unpkg.com/crypto-js@4.2.0/crypto-js.min.js"
  ],
  sm3: [
    "https://cdn.jsdelivr.net/npm/sm-crypto@0.3.13/dist/sm3.min.js"
  ]
};

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function loadScriptMulti(urls) {
  for (let i = 0; i < urls.length; i++) {
    try {
      await loadScript(urls[i]);
      console.log("✅ 加载成功:", urls[i]);
      return true;
    } catch (e) {
      console.warn("⚠️ 加载失败，切换:", urls[i]);
    }
  }
  console.error("❌ 所有CDN均加载失败:", urls[0]);
  return false;
}

async function loadAllDependencies() {
  await loadScriptMulti(CDN.forge);
  await loadScriptMulti(CDN.sha3);
  await loadScriptMulti(CDN.sm3);
  console.log("✅ 所有加密库加载完成，可以使用 RSA 功能");
}

let isLoggedIn = false;
let privateKeyText = "";
let publicKeyText = "";
let firmwareFile = null;
let keycodeFileObj = null;
let packedBinFile = null;
let loadedKeyProjectName = "";

const logBox = document.getElementById('log');
const RSA_SIZE = 256;
const HEADER_SIZE = 64;
const SUB_BLOCK_SIZE = 16;
const MD5_ASCII_HEX_LEN = 32;

const chipConfigs = {
    "R5F10BGG(8368&安卓)": {
        versionAddr: "0x3FC0",
        fileAddr: "0x4000",
        plainStartOffset: "0",
        plainEndOffset: "0",
        hashAlgo: "SHA256",
        outputMode: "trimmed-pack",
        zeroDetectStep: "64",
        lockParams: false,
        skipEncryption: false,
        skipHeader: false,
        fileName: "XS_UPDATE_MCU.bin"
    },
    "R7F7016923AFP": {
        versionAddr: "0x18000",
        fileAddr: "0x18200",
        plainStartOffset: "0",
        plainEndOffset: "0",
        hashAlgo: "SHA256",
        outputMode: "trimmed-pack",
        zeroDetectStep: "256",
        lockParams: false,
        skipEncryption: false,
        skipHeader: false,
        fileName: "XS_UPDATE_MCU.bin"
    },
    "R5F10BGG(8268)": {
        versionAddr: "0x3FC0",
        fileAddr: "0x4000",
        plainStartOffset: "0",
        plainEndOffset: "0",
        hashAlgo: "SHA256",
        outputMode: "trimmed-pack",
        zeroDetectStep: "64",
        lockParams: true,
        skipEncryption: true,
        skipHeader: true,
        fileName: "XS_UPMCU.bin"
    },
    "R5F10BGG(630H)": {
        versionAddr: "0x4100",
        fileAddr: "0x4000",
        plainStartOffset: "0",
        plainEndOffset: "0",
        hashAlgo: "SHA256",
        outputMode: "trimmed-pack",
        zeroDetectStep: "64",
        lockParams: true,
        skipEncryption: false,
        skipHeader: false,
        useSignFlow: true,
        forceHashAlgo: "SHA256",
        fileName: "XS_UPDATE_MCU.bin"
    },
    "R5F10BGG(8268_CRC)": {
        versionAddr: "0x4100",
        fileAddr: "0x4000",
        plainStartOffset: "0",
        plainEndOffset: "0",
        hashAlgo: "SHA256",
        outputMode: "trimmed-pack",
        zeroDetectStep: "64",
        lockParams: true,
        skipEncryption: true,
        skipHeader: false,
        useSignFlow: false,
        forceHashAlgo: "SHA256",
        fileName: "XS_UPDATE_MCU.bin"
    },
    "R5F10BGG(MD5)": {
        versionAddr: "0x3FC0",
        fileAddr: "0x3FC0",
        plainStartOffset: "0",
        plainEndOffset: "0",
        hashAlgo: "SHA256",
        outputMode: "trimmed-pack",
        zeroDetectStep: "64",
        lockParams: true,
        skipEncryption: true,
        skipHeader: true,
        useSignFlow: false,
        useMD5Append: true,
        fileName: "XS_UPDATE_MCU.bin"
    }
};

const zeroStepOptions = ["16", "32", "64", "128", "256", "512", "1024"];

// ====================== UI / 登录 / 数据库 ======================
function log(msg, cls = '') {
    const div = document.createElement('div');
    div.className = cls;
    div.innerText = msg;
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
}
function clearLog() {
    logBox.innerHTML = '';
}

function updateLoginUI() {
    const pill = document.getElementById('loginStatusPill');
    const btn = document.getElementById('authToggleBtn');
    const user = document.getElementById('loginUsername');
    const pwd = document.getElementById('loginPassword');

    if (isLoggedIn) {
        pill.className = 'status-pill online';
        pill.textContent = '✅ 已登录，可自动加载数据库密钥';
        btn.textContent = '退出';
        btn.className = 'auth-btn logout';
        user.disabled = true;
        pwd.disabled = true;
    } else {
        pill.className = 'status-pill offline';
        pill.textContent = '❌ 未登录，请手动上传密钥';
        btn.textContent = '登录';
        btn.className = 'auth-btn login';
        user.disabled = false;
        pwd.disabled = false;
        clearProjectList();
    }
}

function clearProjectList() {
    const select = document.getElementById('projectSelect');
    select.innerHTML = '<option value="">-- 请先登录后刷新数据库 --</option>';
}

async function handleAuthToggle() {
    if (isLoggedIn) {
        await doLogout();
    } else {
        await doLogin();
    }
}

async function doLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!username || !password) {
        alert('请输入账号和密码');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('ajax', 'login');
        formData.append('username', username);
        formData.append('password', password);

        const res = await fetch('', {
            method: 'POST',
            body: formData
        });
        const json = await res.json();

        if (json.ok) {
            isLoggedIn = true;
            updateLoginUI();
            log('✅ 登录成功', 'ok');
            await refreshProjectList(true);
            updateKeyStatusDisplay();
        } else {
            alert(json.msg || '登录失败');
            log('❌ 登录失败：' + (json.msg || '未知错误'), 'err');
        }
    } catch (e) {
        console.error(e);
        alert('登录异常：' + e.message);
        log('❌ 登录异常：' + e.message, 'err');
    }
}

async function doLogout() {
    try {
        const formData = new FormData();
        formData.append('ajax', 'logout');

        const res = await fetch('', {
            method: 'POST',
            body: formData
        });
        const json = await res.json();

        if (json.ok) {
            isLoggedIn = false;
            updateLoginUI();
            document.getElementById('loginPassword').value = '';
            log('已退出登录', 'warn');
            updateKeyStatusDisplay();
        } else {
            alert(json.msg || '退出失败');
        }
    } catch (e) {
        console.error(e);
        alert('退出异常：' + e.message);
        log('❌ 退出异常：' + e.message, 'err');
    }
}

async function refreshProjectList(auto = false) {
    if (!isLoggedIn) {
        if (!auto) {
            alert('请登录');
            log('未登录，无法刷新数据库项目', 'warn');
        }
        return;
    }

    try {
        const res = await fetch('?ajax=project_list');
        const json = await res.json();

        if (!json.ok) {
            alert(json.msg || '刷新失败');
            log('❌ 刷新数据库失败：' + (json.msg || '未知错误'), 'err');
            return;
        }

        const select = document.getElementById('projectSelect');
        select.innerHTML = '<option value="">-- 选择项目 --</option>';

        (json.list || []).forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.project_name;
            select.appendChild(opt);
        });

        log('✅ 数据库项目已刷新，共 ' + (json.list || []).length + ' 个', 'ok');
    } catch (e) {
        console.error(e);
        alert('刷新数据库失败：' + e.message);
        log('❌ 刷新数据库异常：' + e.message, 'err');
    }
}

async function loadKeyFromDB() {
    if (!isLoggedIn) {
        alert('请先登录');
        log('未登录，无法加载数据库密钥', 'warn');
        return;
    }

    const select = document.getElementById('projectSelect');
    const pid = select.value;
    const selectedText = select.options[select.selectedIndex]?.text || '';

    if (!pid) {
        alert('请选择项目');
        return;
    }

    try {
        const res = await fetch(`?ajax=load_key&pid=${encodeURIComponent(pid)}`);
        const json = await res.json();

        if (!json.ok) {
            alert(json.msg || '加载失败');
            log('❌ 数据库密钥加载失败：' + (json.msg || '未知错误'), 'err');
            updateKeyStatusDisplay();
            return;
        }

        privateKeyText = json.pri || "";
        publicKeyText = json.pub || "";

        const keyRawBase64 = json.keycode || "";
        const keyBin = keyRawBase64 ? Uint8Array.from(atob(keyRawBase64), c => c.charCodeAt(0)) : new Uint8Array();
        keycodeFileObj = keyBin.length > 0 ? new File([keyBin], "KEYCODE_FROM_DB.bin") : null;

        loadedKeyProjectName = selectedText;

        document.getElementById('priKeyName').value = privateKeyText ? '数据库已加载' : '';
        document.getElementById('pubKeyName').value = publicKeyText ? '数据库已加载' : '';
        document.getElementById('keycodeName').value = keycodeFileObj ? '数据库已加载' : '';

        log('✅ 从数据库加载密钥成功', 'ok');
        log('当前数据库项目: ' + loadedKeyProjectName, 'info');
        log('私钥状态: ' + (privateKeyText ? '已加载' : '未加载'), privateKeyText ? 'ok' : 'warn');
        log('公钥状态: ' + (publicKeyText ? '已加载' : '未加载'), publicKeyText ? 'ok' : 'warn');
        log('KEYCODE状态: ' + (keycodeFileObj ? '已加载' : '未加载'), keycodeFileObj ? 'ok' : 'warn');

        updateKeyStatusDisplay();
    } catch (e) {
        console.error(e);
        alert('加载数据库密钥失败：' + e.message);
        log('❌ 加载数据库密钥异常：' + e.message, 'err');
        updateKeyStatusDisplay();
    }
}

function clearLoadedKeys() {
    privateKeyText = "";
    publicKeyText = "";
    keycodeFileObj = null;
    loadedKeyProjectName = "";

    document.getElementById('priKeyName').value = '';
    document.getElementById('pubKeyName').value = '';
    document.getElementById('keycodeName').value = '';

    document.getElementById('priKeyFile').value = '';
    document.getElementById('pubKeyFile').value = '';
    document.getElementById('keycodeFile').value = '';

    updateKeyStatusDisplay();
    log('已清除所有已加载的密钥', 'warn');
}

function updateKeyStatusDisplay() {
    const display = document.getElementById('keyStatusDisplay');
    const chipName = document.getElementById('chipSelect')?.value || '';

    const hasPri = !!privateKeyText;
    const hasPub = !!publicKeyText;
    const hasKeycode = !!keycodeFileObj;

    if (!hasPri && !hasPub && !hasKeycode) {
        display.innerHTML = `
            <span style="color:#666;">未加载任何密钥</span>
            ${chipName ? `<span class="key-chip-tag">当前芯片：${chipName}</span>` : ''}
        `;
        return;
    }

    display.innerHTML = `
        <span class="${hasPri ? 'key-ok' : 'key-miss'}">私钥：${hasPri ? '已加载' : '未加载'}</span>
        <span class="${hasPub ? 'key-ok' : 'key-miss'}">公钥：${hasPub ? '已加载' : '未加载'}</span>
        <span class="${hasKeycode ? 'key-ok' : 'key-miss'}">KEYCODE：${hasKeycode ? '已加载' : '未加载'}</span>
        ${loadedKeyProjectName ? `<span class="key-chip-tag">密钥项目：${loadedKeyProjectName}</span>` : ''}
        ${chipName ? `<span class="key-chip-tag">当前芯片：${chipName}</span>` : ''}
    `;
}

// ====================== 业务逻辑 ======================
function clearVerifyInfo() {
    packedBinFile = null;
    document.getElementById('verifyBinName').value = '';
    document.getElementById('verifyBinFile').value = '';
    document.getElementById('manualDecryptedHex').value = '';
    clearLog();
    log('已清除已加载BIN信息、外部解密HEX、校验日志', 'ok');
}
function parseHex(str) {
    str = String(str).trim();
    if (!str) return NaN;
    if (/^0x/i.test(str)) return parseInt(str, 16);
    return parseInt(str, 10);
}
function normalizeHex(str) {
    return String(str).replace(/[^0-9a-fA-F]/g, '').toLowerCase();
}
function safeHex(num) {
    return '0x' + (num >>> 0).toString(16).toUpperCase();
}
function bytesToHex(bytes, upper = false) {
    const out = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return upper ? out.toUpperCase() : out.toLowerCase();
}
function uint8ToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}
function forgeBytesToUint8Array(bytesStr) {
    const out = new Uint8Array(bytesStr.length);
    for (let i = 0; i < bytesStr.length; i++) {
        out[i] = bytesStr.charCodeAt(i) & 0xFF;
    }
    return out;
}
function uint8ArrayToForgeBytes(arr) {
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < arr.length; i += chunk) {
        s += String.fromCharCode.apply(null, arr.subarray(i, i + chunk));
    }
    return s;
}
function asciiStringToBytes(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        out[i] = str.charCodeAt(i) & 0xFF;
    }
    return out;
}
function bytesToAsciiString(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        out += String.fromCharCode(bytes[i]);
    }
    return out;
}
async function sha256Bytes(dataBytes) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
    return new Uint8Array(hashBuffer);
}
function hashByCryptoJS(bytes, algo) {
    if (typeof CryptoJS === 'undefined') {
        throw new Error('CryptoJS 尚未加载完成，请稍后重试');
    }
    const wordArray = CryptoJS.lib.WordArray.create(bytes);
    switch (algo) {
        case 'SHA384': return CryptoJS.SHA384(wordArray);
        case 'SHA512': return CryptoJS.SHA512(wordArray);
        case 'SHA3-224': return CryptoJS.SHA3(wordArray, { outputLength: 224 });
        case 'SHA3-256': return CryptoJS.SHA3(wordArray, { outputLength: 256 });
        case 'SHA3-384': return CryptoJS.SHA3(wordArray, { outputLength: 384 });
        case 'SHA3-512': return CryptoJS.SHA3(wordArray, { outputLength: 512 });
        case 'SM3':
            throw new Error('当前页面未集成 CryptoJS.SM3，如需SM3请另外扩展');
        default:
            return CryptoJS.SHA256(wordArray);
    }
}
async function hashBytes(dataBytes, algo) {
    if (algo === 'SHA256') return await sha256Bytes(dataBytes);
    const wa = hashByCryptoJS(dataBytes, algo);
    const hex = wa.toString(CryptoJS.enc.Hex);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        out[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return out;
}
function crc32(data) {
    let crc = 0xFFFFFFFF;
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
function calculateChecksum(data) {
    let checksum = 0;
    const len = data.length;
    let i = 0;
    while (i < len) {
        let b0 = (i < len) ? data[i] : 0;
        let b1 = (i + 1 < len) ? data[i + 1] : 0;
        let b2 = (i + 2 < len) ? data[i + 2] : 0;
        let b3 = (i + 3 < len) ? data[i + 3] : 0;
        checksum += b0 + b1 + b2 + b3;
        i += 4;
    }
    checksum = checksum * 2 + 1;
    return checksum >>> 0;
}

async function md5(dataBytes) {
    if (typeof CryptoJS === 'undefined') {
        throw new Error('CryptoJS 尚未加载完成，请稍后重试');
    }
    const wordArray = CryptoJS.lib.WordArray.create(dataBytes);
    const md5WordArray = CryptoJS.MD5(wordArray);
    const hex = md5WordArray.toString(CryptoJS.enc.Hex);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        out[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return out;
}

async function md5HexLower(dataBytes) {
    const raw = await md5(dataBytes);
    return bytesToHex(raw, false);
}

function writeUint32LE(arr, offset, value) {
    arr[offset] = value & 0xFF;
    arr[offset + 1] = (value >>> 8) & 0xFF;
    arr[offset + 2] = (value >>> 16) & 0xFF;
    arr[offset + 3] = (value >>> 24) & 0xFF;
}
function readUint32LE(arr, offset) {
    return ((arr[offset] & 0xFF)) |
           ((arr[offset + 1] & 0xFF) << 8) |
           ((arr[offset + 2] & 0xFF) << 16) |
           ((arr[offset + 3] & 0xFF) << 24);
}
function buildStructData(versionData, keycode16, appFileSize, checkValue, fileAddr, appData) {
    const data = new Uint8Array(HEADER_SIZE + appData.length);
    data.set(versionData, 0);
    data.set(keycode16, 32);
    writeUint32LE(data, 48, appFileSize);
    writeUint32LE(data, 52, checkValue);
    writeUint32LE(data, 56, 0);
    writeUint32LE(data, 60, fileAddr);
    data.set(appData, 64);
    return data;
}
function toggleCheckType(type) {
    if (type === 'CRC') {
        document.getElementById('checkChecksum').checked = false;
        document.getElementById('checkMD5').checked = false;
    } else if (type === 'CHECKSUM') {
        document.getElementById('checkCRC').checked = false;
        document.getElementById('checkMD5').checked = false;
    } else if (type === 'MD5') {
        document.getElementById('checkCRC').checked = false;
        document.getElementById('checkChecksum').checked = false;
    }
}
function getCheckOptions() {
    return {
        structure: document.getElementById('checkStructure').checked,
        length: document.getElementById('checkLength').checked,
        crc: document.getElementById('checkCRC').checked,
        checksum: document.getElementById('checkChecksum').checked,
        md5: document.getElementById('checkMD5').checked,
        rsa: document.getElementById('checkRSA').checked
    };
}
function downloadBytes(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    // 【关键修复】把打包好的文件存到全局变量，供串口模块读取
    window.packedBinFile = new File([blob], filename);
    log(`已保存打包文件到全局变量，串口模块可直接读取`, 'ok');
}

function forgePublicEncryptRaw(digestBytes, publicPem) {
    const publicKey = forge.pki.publicKeyFromPem(publicPem);
    const raw = uint8ArrayToForgeBytes(digestBytes);
    const encrypted = publicKey.encrypt(raw, 'RSAES-PKCS1-V1_5');
    return forgeBytesToUint8Array(encrypted);
}
function forgePrivateDecryptRaw(cipherBytes, privatePem) {
    const privateKey = forge.pki.privateKeyFromPem(privatePem);
    const rawCipher = uint8ArrayToForgeBytes(cipherBytes);
    const decrypted = privateKey.decrypt(rawCipher, 'RSAES-PKCS1-V1_5');
    return forgeBytesToUint8Array(decrypted);
}
function createForgeMd(hashAlgo, dataBytes) {
    let md;
    switch (hashAlgo) {
        case 'SHA256':
            md = forge.md.sha256.create();
            break;
        case 'SHA384':
            md = forge.md.sha384.create();
            break;
        case 'SHA512':
            md = forge.md.sha512.create();
            break;
        default:
            throw new Error('630H签名流程当前仅支持 SHA256/SHA384/SHA512，其中630H默认固定为SHA256');
    }
    md.update(uint8ArrayToForgeBytes(dataBytes), 'raw');
    return md;
}
function forgePrivateSignByPlain(plainBytes, privatePem, hashAlgo) {
    const privateKey = forge.pki.privateKeyFromPem(privatePem);
    const md = createForgeMd(hashAlgo, plainBytes);
    const signature = privateKey.sign(md, 'RSASSA-PKCS1-V1_5');
    return forgeBytesToUint8Array(signature);
}
function forgePublicVerifyByPlain(plainBytes, signatureBytes, publicPem, hashAlgo) {
    const publicKey = forge.pki.publicKeyFromPem(publicPem);
    const md = createForgeMd(hashAlgo, plainBytes);
    return publicKey.verify(md.digest().bytes(), uint8ArrayToForgeBytes(signatureBytes));
}
async function buildFormalExpected(structData) {
    const { start, end } = getPlainOffsetRange(structData.length);
    const hashAlgo = getSelectedHashAlgo();
    const plainSource = structData.slice(start, end);
    const digestBytes = await hashBytes(plainSource, hashAlgo);
    return {
        hashAlgo,
        start,
        end,
        plainSource,
        digestBytes,
        expectedHex: bytesToHex(digestBytes, false),
        expectedBase64: uint8ToBase64(digestBytes)
    };
}

function fillChipOptions() {
    const chipSelect = document.getElementById('chipSelect');
    chipSelect.innerHTML = '';
    Object.keys(chipConfigs).forEach(chip => {
        const opt = document.createElement('option');
        opt.value = chip;
        opt.textContent = chip;
        chipSelect.appendChild(opt);
    });
}
function fillZeroStepOptions(selectedValue = "64") {
    const zeroDetectStep = document.getElementById('zeroDetectStep');
    zeroDetectStep.innerHTML = '';
    zeroStepOptions.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = `${v} 字节`;
        if (String(v) === String(selectedValue)) opt.selected = true;
        zeroDetectStep.appendChild(opt);
    });
}
function updateRsaCheckLabel(chipName) {
    const labels = document.querySelectorAll('.check-item');
    for (const label of labels) {
        const input = label.querySelector('input');
        if (input && input.id === 'checkRSA') {
            const cfg = chipConfigs[chipName];
            let text = "RSA解密比对";
            if (cfg?.useSignFlow) text = "RSA签名验签";
            if (cfg?.skipEncryption) text = "无加密/签名";
            label.childNodes[label.childNodes.length - 1].textContent = text;
            break;
        }
    }
}
function applyChipConfig(chipName) {
    const cfg = chipConfigs[chipName];
    if (!cfg) return;

    document.getElementById('versionAddr').value = cfg.versionAddr ?? '';
    document.getElementById('fileAddr').value = cfg.fileAddr ?? '';
    document.getElementById('plainStartOffset').value = cfg.plainStartOffset ?? '0';
    document.getElementById('plainEndOffset').value = cfg.plainEndOffset ?? '0';
    document.getElementById('hashAlgo').value = cfg.hashAlgo ?? 'SHA256';
    document.getElementById('outputMode').value = cfg.outputMode ?? 'trimmed-pack';

    fillZeroStepOptions(cfg.zeroDetectStep ?? "64");

    if (cfg.lockParams) {
        document.getElementById('versionAddr').disabled = true;
        document.getElementById('plainStartOffset').disabled = true;
        document.getElementById('plainEndOffset').disabled = true;
        log('已锁定芯片参数: ' + chipName, 'warn');
    } else {
        document.getElementById('versionAddr').disabled = false;
        document.getElementById('plainStartOffset').disabled = false;
        document.getElementById('plainEndOffset').disabled = false;
    }

    if (cfg.forceHashAlgo) {
        document.getElementById('hashAlgo').value = cfg.forceHashAlgo;
        document.getElementById('hashAlgo').disabled = true;
        log('该芯片签名流程固定哈希算法: ' + cfg.forceHashAlgo, 'warn');
    } else {
        document.getElementById('hashAlgo').disabled = false;
    }

    if (cfg.useSignFlow) {
        document.getElementById('outputMode').value = 'trimmed-pack';
        document.getElementById('outputMode').disabled = true;
    } else {
        document.getElementById('outputMode').disabled = false;
    }

    const descMap = {
        "R5F10BGG(8368&安卓)": "R5F10BGG(8368&安卓)，适用于8368或安卓使用RSA2048公钥加密/私钥解密比对的项目。默认地址 0x3FC0/0x4000，32字节版本+16字节KEYCODE+4字节appFileSize+4字节CRC32+4字节Reserved+4字节起始地址。",
        "R7F7016923AFP": "RH850 R7F7016923AFP，适用于项目使用RSA2048公钥加密/私钥解密比对的场景。默认地址 0x18000/0x18200。",
        "R5F10BGG(8268)": "R5F10BGG 8268，适用于不带任何加密的项目。不可修改版本地址与签名地址。",
        "R5F10BGG(630H)": "R5F10BGG 630H：从0x4100复制32字节版本号，拼接16字节KEYCODE、4字节长度、4字节CRC32/Checksum、4字节预留、4字节文件地址，形成64字节头；256字节签名附加在文件末尾。",
        "R5F10BGG(8268_CRC)": "R5F10BGG 8268_CRC：从0x4100复制32字节版本号，拼接16字节KEYCODE、4字节长度、4字节CRC32/Checksum、4字节预留、4字节文件地址，形成64字节头；无末尾签名、无加密验签。",
        "R5F10BGG(MD5)": "R5F10BGG(MD5)：从0x3FC0开始按自动识别有效长度裁切，最后32字节存储MD5小写hex ASCII字符串；MD5计算范围为除最后32字节外的全部数据。"
    };
    document.getElementById('chipDescText').innerText = descMap[chipName] || "请选择目标芯片以加载说明信息。";
    updateRsaCheckLabel(chipName);
    log('已加载芯片默认参数: ' + chipName, 'ok');
    updateKeyStatusDisplay();
}
function initChipConfigUI() {
    fillChipOptions();
    const chipSelect = document.getElementById('chipSelect');
    const firstChip = Object.keys(chipConfigs)[0];
    if (firstChip) {
        chipSelect.value = firstChip;
        applyChipConfig(firstChip);
    } else {
        fillZeroStepOptions("64");
    }
    chipSelect.addEventListener('change', (e) => {
        applyChipConfig(e.target.value);
    });
}

function isZeroOrFF16Block(bytes16) {
    if (bytes16.length !== SUB_BLOCK_SIZE) return false;
    let all00 = true;
    let allFF = true;
    for (let i = 0; i < SUB_BLOCK_SIZE; i++) {
        if (bytes16[i] !== 0x00) all00 = false;
        if (bytes16[i] !== 0xFF) allFF = false;
    }
    return all00 || allFF;
}
function padSliceToLength(bytes, start, wantedLen, fillValue = 0x00) {
    const out = new Uint8Array(wantedLen);
    out.fill(fillValue);
    const end = Math.min(bytes.length, start + wantedLen);
    if (end > start) {
        out.set(bytes.slice(start, end), 0);
    }
    return out;
}
function ceilToMultiple(value, step) {
    if (step <= 0) return value;
    return Math.ceil(value / step) * step;
}
function detectActualFileLength(srcBin, fileAddr, detectStep) {
    if (fileAddr < 0 || fileAddr >= srcBin.length) {
        throw new Error('文件地址超出BIN范围');
    }
    if (!detectStep || detectStep <= 0) {
        throw new Error('零长度检测步长无效');
    }
    if (detectStep % SUB_BLOCK_SIZE !== 0) {
        throw new Error('零长度检测步长必须为16的整数倍');
    }

    let lastValid16End = fileAddr;
    let firstSuspectPadding16Pos = null;
    let stepBlockCount = 0;
    let suspectCount = 0;
    let valid16Count = 0;

    for (let blockStart = fileAddr; blockStart < srcBin.length; blockStart += detectStep) {
        stepBlockCount++;
        const stepBlock = padSliceToLength(srcBin, blockStart, detectStep, 0x00);
        const subBlockCount = detectStep / SUB_BLOCK_SIZE;

        for (let sub = 0; sub < subBlockCount; sub++) {
            const subStart = blockStart + sub * SUB_BLOCK_SIZE;
            const subBytes = stepBlock.slice(sub * SUB_BLOCK_SIZE, (sub + 1) * SUB_BLOCK_SIZE);
            const isPadding16 = isZeroOrFF16Block(subBytes);

            if (!isPadding16) {
                valid16Count++;
                lastValid16End = subStart + SUB_BLOCK_SIZE;
            } else if (firstSuspectPadding16Pos === null) {
                firstSuspectPadding16Pos = subStart;
                suspectCount++;
            } else {
                suspectCount++;
            }
        }
    }

    let rawLength = Math.max(0, lastValid16End - fileAddr);
    let alignedLength = ceilToMultiple(rawLength, detectStep);

    const maxAvailableLength = srcBin.length - fileAddr;
    if (alignedLength > maxAvailableLength) {
        alignedLength = maxAvailableLength;
    }

    return {
        length: alignedLength,
        rawLength,
        detectStep,
        stepBlockCount,
        valid16Count,
        suspectCount,
        firstSuspectPaddingPos: firstSuspectPadding16Pos
    };
}
function getAppDataByDetectedLength(srcBin, fileAddr, detectedLength) {
    const out = new Uint8Array(detectedLength);
    out.fill(0x00);
    const end = Math.min(srcBin.length, fileAddr + detectedLength);
    if (end > fileAddr) {
        out.set(srcBin.slice(fileAddr, end), 0);
    }
    return out;
}

async function autoDetectFileLength() {
    clearLog();
    try {
        if (!firmwareFile) return alert('请先选择BIN文件');
        const srcBin = new Uint8Array(await firmwareFile.arrayBuffer());
        const fileAddr = parseHex(document.getElementById('fileAddr').value);
        const detectStep = parseInt(document.getElementById('zeroDetectStep').value, 10);

        if (Number.isNaN(fileAddr) || fileAddr < 0) throw new Error('文件地址输入无效');
        if (Number.isNaN(detectStep) || detectStep <= 0) throw new Error('零长度检测步长输入无效');
        if (detectStep % 16 !== 0) throw new Error('零长度检测步长必须是16的整数倍');

        const result = detectActualFileLength(srcBin, fileAddr, detectStep);
        document.getElementById('fileLen').value = safeHex(result.length);

        log('开始自动识别文件长度...', 'info');
        log('文件起始地址: ' + safeHex(fileAddr), 'info');
        log('零长度检测步长: ' + detectStep + ' 字节', 'info');
        log('每个步长块按16字节子块分解判断', 'info');
        log('扫描步长块数量: ' + result.stepBlockCount, 'info');
        log('检测到有效16字节数据块数量: ' + result.valid16Count, 'info');
        log('检测到疑似填充16字节块数量: ' + result.suspectCount, 'info');
        if (result.firstSuspectPaddingPos !== null) {
            log('首次检测到疑似填充16字节块位置: ' + safeHex(result.firstSuspectPaddingPos), 'info');
        }
        log('按16字节判断得到的原始有效长度: ' + safeHex(result.rawLength) + ' (' + result.rawLength + ' bytes)', 'info');
        log('最终按零长度检测步长对齐后的文件长度: ' + safeHex(result.length) + ' (' + result.length + ' bytes)', 'ok');
        log('说明：若尾部不足一个步长，已按00补齐参与判断；打包时也将按此长度取数/补00。', 'warn');
        log('✅ 自动识别完成', 'ok');
    } catch (e) {
        console.error(e);
        log('自动识别长度失败: ' + e.message, 'err');
    }
}

document.getElementById('priKeyFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    privateKeyText = await file.text();
    loadedKeyProjectName = loadedKeyProjectName || '手动加载';
    document.getElementById('priKeyName').value = file.name;
    log('已加载私钥: ' + file.name, 'ok');
    updateKeyStatusDisplay();
});
document.getElementById('pubKeyFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    publicKeyText = await file.text();
    loadedKeyProjectName = loadedKeyProjectName || '手动加载';
    document.getElementById('pubKeyName').value = file.name;
    log('已加载公钥: ' + file.name, 'ok');
    updateKeyStatusDisplay();
});
document.getElementById('keycodeFile').addEventListener('change', (e) => {
    keycodeFileObj = e.target.files[0];
    if (!keycodeFileObj) return;
    loadedKeyProjectName = loadedKeyProjectName || '手动加载';
    document.getElementById('keycodeName').value = keycodeFileObj.name;
    log('已加载KEYCODE: ' + keycodeFileObj.name, 'ok');
    updateKeyStatusDisplay();
});
document.getElementById('binFile').addEventListener('change', (e) => {
    firmwareFile = e.target.files[0];
    if (!firmwareFile) return;
    document.getElementById('binName').value = firmwareFile.name;
    log('已加载固件: ' + firmwareFile.name, 'ok');
});
document.getElementById('verifyBinFile').addEventListener('change', (e) => {
    packedBinFile = e.target.files[0];
    if (!packedBinFile) return;
    document.getElementById('verifyBinName').value = packedBinFile.name;
    log('已加载打包文件: ' + packedBinFile.name, 'ok');
});

function getSelectedHashAlgo() {
    const chipName = document.getElementById('chipSelect').value;
    const cfg = chipConfigs[chipName];
    if (cfg?.forceHashAlgo) return cfg.forceHashAlgo;
    return document.getElementById('hashAlgo').value;
}
function getPlainOffsetRange(structLen) {
    let start = parseHex(document.getElementById('plainStartOffset').value);
    let end = parseHex(document.getElementById('plainEndOffset').value);
    if (Number.isNaN(start)) start = 0;
    if (start < 0) throw new Error('明文起始偏移不能小于0');
    if (Number.isNaN(end) || end === 0) end = structLen;
    if (end < 0) throw new Error('明文结束偏移不能小于0');
    if (start > end) throw new Error('明文起始偏移不能大于结束偏移');
    if (end > structLen) throw new Error('明文结束偏移超出结构数据长度');
    return { start, end };
}

async function buildStructFromInputBin(srcBin) {
    const chipName = document.getElementById('chipSelect').value;
    const cfg = chipConfigs[chipName];
    const versionAddr = parseHex(document.getElementById('versionAddr').value);
    const fileAddr = parseHex(document.getElementById('fileAddr').value);
    let fileLen = parseHex(document.getElementById('fileLen').value);
    const checkType = document.getElementById('packCheckType').value;
    const detectStep = parseInt(document.getElementById('zeroDetectStep').value, 10);

    if ([versionAddr, fileAddr].some(v => Number.isNaN(v) || v < 0)) throw new Error('版本地址/文件地址输入无效');

    if (Number.isNaN(detectStep) || detectStep <= 0 || detectStep % 16 !== 0) {
        throw new Error('零长度检测步长无效，必须为16的整数倍');
    }

    if (cfg.useMD5Append) {
        if (Number.isNaN(fileLen) || fileLen <= 0) {
            const result = detectActualFileLength(srcBin, fileAddr, detectStep);
            fileLen = result.length;
            document.getElementById('fileLen').value = safeHex(fileLen);
            log('MD5模式文件长度为空或无效，已按规则自动识别为: ' + safeHex(fileLen), 'warn');
        } else {
            fileLen = ceilToMultiple(fileLen, detectStep);
            document.getElementById('fileLen').value = safeHex(fileLen);
            log('MD5模式输入文件长度已自动按零长度检测步长对齐为: ' + safeHex(fileLen), 'warn');
        }

        const trimmedData = getAppDataByDetectedLength(srcBin, fileAddr, fileLen);
        if (trimmedData.length < MD5_ASCII_HEX_LEN) {
            throw new Error('MD5模式文件长度不足32字节，无法预留MD5 ASCII存储区');
        }

        const md5Source = trimmedData.slice(0, trimmedData.length - MD5_ASCII_HEX_LEN);
        const md5Hex = await md5HexLower(md5Source);
        const md5AsciiBytes = asciiStringToBytes(md5Hex);

        const outputData = new Uint8Array(trimmedData);
        outputData.set(md5AsciiBytes, outputData.length - MD5_ASCII_HEX_LEN);

        log('MD5模式起始地址：' + safeHex(fileAddr), 'info');
        log('MD5模式有效长度：' + fileLen + ' 字节', 'info');
        log('MD5参与计算长度（除最后32字节）：' + md5Source.length + ' 字节', 'info');
        log('计算MD5：' + md5Hex, 'ok');

        return {
            structData: outputData,
            skipEncryption: true,
            skipHeader: true,
            fileName: cfg.fileName,
            fileLen: trimmedData.length
        };
    }

    if (Number.isNaN(fileLen) || fileLen <= 0) {
        const result = detectActualFileLength(srcBin, fileAddr, detectStep);
        fileLen = result.length;
        document.getElementById('fileLen').value = safeHex(fileLen);
        log('文件长度为空或无效，已按新规则自动识别为: ' + safeHex(fileLen), 'warn');
    } else {
        fileLen = ceilToMultiple(fileLen, detectStep);
        document.getElementById('fileLen').value = safeHex(fileLen);
        log('输入文件长度已自动按零长度检测步长对齐为: ' + safeHex(fileLen), 'warn');
    }

    if (cfg.skipHeader) {
        const appData = getAppDataByDetectedLength(srcBin, fileAddr, fileLen);
        return { structData: appData, skipEncryption: true, skipHeader: true, fileName: cfg.fileName, fileLen };
    }

    if (cfg.useSignFlow) {
        if (versionAddr + 32 > srcBin.length) throw new Error('版本地址越界，无法读取32字节版本数据');
        const versionData = srcBin.slice(versionAddr, versionAddr + 32);
        const appData = getAppDataByDetectedLength(srcBin, fileAddr, fileLen);
        const appFileSize = appData.length;

        let checkValue;
        if (checkType === 'CRC') checkValue = crc32(appData);
        else checkValue = calculateChecksum(appData);

        if (!keycodeFileObj) throw new Error('请选择KEYCODE文件');
        const keycodeRaw = new Uint8Array(await keycodeFileObj.arrayBuffer());
        if (keycodeRaw.length < 16) throw new Error('KEYCODE不足16字节');
        const keycode16 = keycodeRaw.slice(0, 16);

        const structData = buildStructData(versionData, keycode16, appFileSize, checkValue, fileAddr, appData);
        return {
            versionAddr,
            fileAddr,
            fileLen,
            appData,
            checkValue,
            checkType,
            structData,
            skipEncryption: false,
            skipHeader: false,
            useSignFlow: true,
            fileName: cfg.fileName
        };
    }

    if (versionAddr + 32 > srcBin.length) throw new Error('版本地址越界');
    if (versionAddr < RSA_SIZE) throw new Error('版本地址前不足256字节放密文');

    const versionData = srcBin.slice(versionAddr, versionAddr + 32);
    const appData = getAppDataByDetectedLength(srcBin, fileAddr, fileLen);
    const appFileSize = appData.length;

    let checkValue;
    if (checkType === 'CRC') checkValue = crc32(appData);
    else checkValue = calculateChecksum(appData);

    if (!keycodeFileObj) throw new Error('请选择KEYCODE文件');
    const keycodeRaw = new Uint8Array(await keycodeFileObj.arrayBuffer());
    if (keycodeRaw.length < 16) throw new Error('KEYCODE不足16字节');
    const keycode16 = keycodeRaw.slice(0, 16);

    const structData = buildStructData(versionData, keycode16, appFileSize, checkValue, fileAddr, appData);

    if (cfg?.skipEncryption && !cfg?.useSignFlow && !cfg?.skipHeader) {
        return {
            versionAddr, fileAddr, fileLen, appData, checkValue, checkType,
            structData, skipEncryption: true, skipHeader: false, fileName: cfg.fileName
        };
    }

    return {
        versionAddr,
        fileAddr,
        fileLen,
        appData,
        checkValue,
        checkType,
        structData,
        skipEncryption: cfg.skipEncryption,
        skipHeader: false,
        fileName: cfg.fileName
    };
}

async function startPack() {
    clearLog();
    try {
        if (!firmwareFile) return alert('请选择BIN文件');
        const srcBin = new Uint8Array(await firmwareFile.arrayBuffer());
        const outputMode = document.getElementById('outputMode').value;
        const info = await buildStructFromInputBin(srcBin);

        log('开始按正式协议加密打包...', 'info');
        log('参与打包的原始APP长度: ' + info.fileLen + ' bytes', 'info');
        log('结构数据总长度: ' + info.structData.length + ' bytes', 'info');

        if (info.skipEncryption) {
            downloadBytes(info.structData, info.fileName);
            log('已生成输出文件: ' + info.fileName, 'ok');
            log('✅ 打包完成', 'ok');
            return;
        }

        const formal = await buildFormalExpected(info.structData);
        log('校验方式: ' + info.checkType, 'info');
        log(info.checkType + ': ' + safeHex(info.checkValue), 'info');
        log('明文参与范围偏移: [' + formal.start + ', ' + formal.end + ')', 'info');
        log('明文参与数据长度: ' + formal.plainSource.length + ' bytes', 'info');
        log('哈希算法: ' + formal.hashAlgo, 'info');
        log('计算明文(HEX): ' + formal.expectedHex, 'ok');
        log('计算明文(Base64): ' + formal.expectedBase64, 'info');

        let output;
        if (info.useSignFlow) {
            if (!privateKeyText) return alert('630H项目需要私钥签名，请选择私钥文件');

            const signatureBytes = forgePrivateSignByPlain(
                formal.plainSource,
                privateKeyText,
                formal.hashAlgo
            );

            if (signatureBytes.length !== RSA_SIZE) {
                throw new Error('生成的签名字节数不是256，请确认是否为RSA2048私钥');
            }

            output = new Uint8Array(info.structData.length + RSA_SIZE);
            output.set(info.structData, 0);
            output.set(signatureBytes, info.structData.length);

            log('已生成签名包输出：[结构数据][256字节签名块]', 'ok');
        } else {
            if (!publicKeyText) return alert('当前芯片需要公钥加密，请选择公钥文件');
            const cipherBytes = forgePublicEncryptRaw(formal.digestBytes, publicKeyText);
            if (outputMode === 'trimmed-pack') {
                output = new Uint8Array(RSA_SIZE + info.structData.length);
                output.set(cipherBytes.slice(0, RSA_SIZE), 0);
                output.set(info.structData, RSA_SIZE);
                log('已生成裁切包输出：[256字节密文块][结构数据]', 'ok');
            } else {
                output = new Uint8Array(srcBin);
                output.set(cipherBytes.slice(0, RSA_SIZE), info.versionAddr - RSA_SIZE);
                output.set(info.structData, info.versionAddr);
                log('已生成完整BIN输出', 'ok');
            }
        }

        downloadBytes(output, info.fileName);
        log('✅ 打包完成', 'ok');
    } catch (e) {
        console.error(e);
        log('错误: ' + e.message, 'err');
    }
}

async function parseVerifyFile(fileData) {
    const chipName = document.getElementById('chipSelect').value;
    const cfg = chipConfigs[chipName];
    const versionAddr = parseHex(document.getElementById('versionAddr').value);
    if (Number.isNaN(versionAddr) || versionAddr < 0) throw new Error('版本地址输入无效');

    let signatureBytes, structData;

    if (cfg?.skipEncryption && !cfg?.useSignFlow && !cfg?.skipHeader) {
        structData = fileData;
        signatureBytes = new Uint8Array(0);
        return { signatureBytes, structData };
    }

    if (cfg.useMD5Append) {
        structData = fileData;
        signatureBytes = new Uint8Array(0);
        return { signatureBytes, structData };
    }

    if (cfg.useSignFlow) {
        if (fileData.length < RSA_SIZE + HEADER_SIZE) throw new Error('文件长度不足，无法识别签名包');
        signatureBytes = fileData.slice(fileData.length - RSA_SIZE);
        structData = fileData.slice(0, fileData.length - RSA_SIZE);
    } else {
        if (fileData.length >= RSA_SIZE + HEADER_SIZE && readUint32LE(fileData, RSA_SIZE + 48) > 0) {
            signatureBytes = fileData.slice(0, RSA_SIZE);
            structData = fileData.slice(RSA_SIZE);
        } else {
            signatureBytes = fileData.slice(versionAddr - RSA_SIZE, versionAddr);
            const appFileSize = readUint32LE(fileData, versionAddr + 48) >>> 0;
            structData = fileData.slice(versionAddr, versionAddr + HEADER_SIZE + appFileSize);
        }
    }

    if (cfg.useSignFlow === false && signatureBytes.length !== RSA_SIZE) throw new Error('签名/密文块长度不是256字节');
    if (structData.length < HEADER_SIZE) throw new Error('结构数据不足64字节');
    return { signatureBytes, structData };
}

async function verifyPackedFile({ forExtract = false } = {}) {
    if (!packedBinFile) {
        alert(forExtract ? '请选择待解包BIN文件' : '请选择待验证BIN文件');
        return null;
    }

    const chipName = document.getElementById('chipSelect').value;
    const cfg = chipConfigs[chipName];

    if (cfg.useSignFlow) {
        if (!publicKeyText) {
            alert('请先选择公钥');
            return null;
        }
    } else if (!cfg.skipEncryption) {
        if (!privateKeyText) {
            alert('请先选择私钥');
            return null;
        }
    }

    const fileData = new Uint8Array(await packedBinFile.arrayBuffer());
    const options = getCheckOptions();
    clearLog();
    log('开始处理文件: ' + packedBinFile.name, 'info');
    log('文件总长度: ' + fileData.length + ' bytes', 'info');

    let signatureBytes, structData;
    try {
        const parsed = await parseVerifyFile(fileData);
        signatureBytes = parsed.signatureBytes;
        structData = parsed.structData;
    } catch (e) {
        log('❌ ' + e.message, 'err');
        return null;
    }

    let appFileSize = 0, storedCheckValue = 0, appData = structData;
    if (!cfg.useMD5Append) {
        appFileSize = readUint32LE(structData, 48) >>> 0;
        storedCheckValue = readUint32LE(structData, 52) >>> 0;
        const reserved = readUint32LE(structData, 56) >>> 0;
        const fileAddrStored = readUint32LE(structData, 60) >>> 0;
        appData = structData.slice(64);

        log('签名/密文块长度: ' + signatureBytes.length + ' bytes', 'info');
        log('结构数据总长度: ' + structData.length + ' bytes', 'info');
        log('头字段 appFileSize = ' + appFileSize, 'info');
        log('头字段 校验值 = ' + safeHex(storedCheckValue), 'info');
        log('头字段 reserved = ' + safeHex(reserved), 'info');
        log('头字段 fileAddr = ' + safeHex(fileAddrStored), 'info');
    }

    if (options.structure && !cfg.useMD5Append) {
        if (structData.length < HEADER_SIZE) {
            log('❌ 结构校验失败：结构数据不足64字节', 'err');
            return null;
        }
        log('结构校验 ✅', 'ok');
    }

    if (options.length && !cfg.useMD5Append) {
        if (appData.length !== appFileSize) {
            log('❌ 长度校验失败：APP实际长度与头部记录不一致', 'err');
            return null;
        }
        log('长度校验 ✅', 'ok');
    }

    let checkPass = true;
    if (options.crc && !cfg.useMD5Append) {
        const calc = crc32(appData);
        log('计算CRC32 = ' + safeHex(calc), 'info');
        if (calc !== storedCheckValue) {
            log('❌ CRC32校验失败', 'err');
            checkPass = false;
        } else {
            log('CRC32校验 ✅', 'ok');
        }
    }
    if (options.checksum && !cfg.useMD5Append) {
        const calc = calculateChecksum(appData);
        log('计算校验和 = ' + safeHex(calc), 'info');
        if (calc !== storedCheckValue) {
            log('❌ 校验和校验失败', 'err');
            checkPass = false;
        } else {
            log('校验和校验 ✅', 'ok');
        }
    }
    if (options.md5 && cfg.useMD5Append) {
        if (fileData.length < MD5_ASCII_HEX_LEN) {
            log('❌ MD5校验失败：文件长度不足32字节', 'err');
            checkPass = false;
        } else {
            const storedMd5Bytes = fileData.slice(fileData.length - MD5_ASCII_HEX_LEN);
            const storedMd5 = normalizeHex(bytesToAsciiString(storedMd5Bytes));
            const appDataMd5 = fileData.slice(0, fileData.length - MD5_ASCII_HEX_LEN);
            const calcMd5 = await md5HexLower(appDataMd5);

            log('MD5参与计算长度（除最后32字节）：' + appDataMd5.length + ' 字节', 'info');
            log('计算MD5 = ' + calcMd5, 'info');
            log('存储MD5(ASCII) = ' + storedMd5, 'info');

            if (calcMd5 !== storedMd5) {
                log('❌ MD5校验失败', 'err');
                checkPass = false;
            } else {
                log('MD5校验 ✅', 'ok');
            }
        }
    }
    if (!checkPass) return null;

    if (cfg?.skipEncryption && !cfg.useMD5Append) {
        log('当前芯片无加密/签名，跳过RSA校验', 'warn');
    } else if (options.rsa && !cfg.useMD5Append) {
        try {
            const formal = await buildFormalExpected(structData);
            log('---------------- 三方一致性核心数据 ----------------', 'info');
            log('明文参与范围偏移: [' + formal.start + ', ' + formal.end + ')', 'info');
            log('明文参与数据长度: ' + formal.plainSource.length + ' bytes', 'info');
            log('哈希算法: ' + formal.hashAlgo, 'info');
            log('计算明文(HEX): ' + formal.expectedHex, 'ok');
            log('计算明文(Base64): ' + formal.expectedBase64, 'info');

            let verifyPass;
            if (cfg.useSignFlow) {
                verifyPass = forgePublicVerifyByPlain(
                    formal.plainSource,
                    signatureBytes,
                    publicKeyText,
                    formal.hashAlgo
                );
                log('公钥验签结果: ' + (verifyPass ? '通过' : '失败'), verifyPass ? 'ok' : 'err');
            } else {
                const parsedPlainBytes = forgePrivateDecryptRaw(signatureBytes, privateKeyText);
                const parsedPlainHex = normalizeHex(bytesToHex(parsedPlainBytes, false));
                const parsedPlainBase64 = uint8ToBase64(parsedPlainBytes);
                log('解析明文(HEX): ' + parsedPlainHex, parsedPlainHex === formal.expectedHex ? 'ok' : 'err');
                log('解析明文(Base64): ' + parsedPlainBase64, parsedPlainBase64 === formal.expectedBase64 ? 'ok' : 'warn');
                verifyPass = (parsedPlainHex === formal.expectedHex);
            }

            if (!verifyPass) {
                log('❌ RSA校验失败', 'err');
                return null;
            }

            const manualHex = normalizeHex(document.getElementById('manualDecryptedHex').value);
            if (manualHex) {
                log('外部工具解密明文(HEX): ' + manualHex, manualHex === formal.expectedHex ? 'ok' : 'err');
                if (!cfg.useSignFlow && manualHex !== formal.expectedHex) {
                    log('❌ 正式校验失败：外部工具解密明文 != 计算明文', 'err');
                    return null;
                }
                if (!cfg.useSignFlow) {
                    log('✅ 三方一致：计算明文 == 解析明文 == 外部工具解密明文', 'ok');
                } else {
                    log('ℹ️ 当前630H为标准签名验签流程，外部HEX仅供参考，不参与签结果判定', 'warn');
                }
            } else {
                log(cfg.useSignFlow ? '⚠️ 未输入外部工具HEX；当前已确认：公钥验签通过' : '⚠️ 未输入外部工具解密HEX；当前已确认：计算明文 == 解析明文', 'warn');
            }
        } catch (e) {
            log('❌ RSA校验异常: ' + e.message, 'err');
            return null;
        }
    }

    log('====================================', 'ok');
    log(forExtract ? '✅ 文件检查通过，可执行解包导出' : '✅ 验证完成', 'ok');
    log('====================================', 'ok');
    return cfg.useMD5Append
        ? { appData: fileData.slice(0, fileData.length - MD5_ASCII_HEX_LEN), fileAddr: parseHex(cfg.fileAddr) }
        : { appData, fileAddr: parseHex(cfg.fileAddr) };
}

async function startVerifyOnly() {
    try {
        await verifyPackedFile({ forExtract: false });
    } catch (e) {
        console.error(e);
        log('验证异常：' + e.message, 'err');
    }
}
async function startExtract() {
    try {
        const parsed = await verifyPackedFile({ forExtract: true });
        if (!parsed) return;
        downloadBytes(parsed.appData, 'APP_EXTRACTED.bin');
        log('已导出原始APP数据: APP_EXTRACTED.bin', 'ok');
        log('原始APP装载地址参考: ' + safeHex(parsed.fileAddr), 'info');
        log('🔓 解包完成', 'ok');
    } catch (e) {
        console.error(e);
        log('解包异常：' + e.message, 'err');
    }
}
async function startManualHexCompare() {
    clearLog();
    try {
        if (!packedBinFile) return alert('请先选择待验证BIN文件');
        const chipName = document.getElementById('chipSelect').value;
        const cfg = chipConfigs[chipName];
        if (cfg?.skipEncryption) {
            log('当前芯片无加密/签名，无需进行外部HEX比对', 'warn');
            return;
        }
        if (cfg.useSignFlow) {
            log('630H为标准签名验签流程，不再适用“外部解密HEX == 计算明文”比对方式。', 'warn');
            log('如需确认，请使用相同公钥在外部工具中执行标准验签。', 'info');
            return;
        }
        if (cfg.useMD5Append) {
            log('MD5芯片为末尾追加ASCII MD5字符串，无需进行外部HEX比对', 'warn');
            return;
        }

        const fileData = new Uint8Array(await packedBinFile.arrayBuffer());
        const parsed = await parseVerifyFile(fileData);
        const formal = await buildFormalExpected(parsed.structData);
        const inputHex = normalizeHex(document.getElementById('manualDecryptedHex').value);
        if (!inputHex) return alert('请先粘贴外部网页工具解密得到的HEX');

        log('开始手工HEX比对（三方一致性中的外部明文）...', 'info');
        log('明文参与范围偏移: [' + formal.start + ', ' + formal.end + ')', 'info');
        log('哈希算法: ' + formal.hashAlgo, 'info');
        log('外部解密HEX: ' + inputHex, 'info');
        log('计算明文HEX: ' + formal.expectedHex, 'info');

        if (inputHex === formal.expectedHex) {
            log('✅ 外部工具解密明文 与 计算明文 完全一致', 'ok');
        } else {
            log('❌ 外部工具解密明文 与 计算明文 不一致', 'err');
        }
    } catch (e) {
        console.error(e);
        log('手工HEX比对异常：' + e.message, 'err');
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    await loadAllDependencies();
    initChipConfigUI();
    updateLoginUI();
    if (isLoggedIn) {
        await refreshProjectList(true);
    }
    updateKeyStatusDisplay();
});