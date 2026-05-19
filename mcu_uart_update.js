// mcu_uart_update.js - 8368PU Boot 升级优化版（减少日志卡顿）
let port = null;
let reader = null;
let writer = null;

let isConnected = false;
let isProcessing = false;
let isDisconnecting = false;
let isUpgrading = false;
let shouldStopUpgrade = false;

let readLoopTask = null;
let rxBuffer = [];
let frameQueue = [];

const BOOT_TX_HEAD1 = 0x55;
const BOOT_TX_HEAD2 = 0xAA;
const BOOT_RX_HEAD1 = 0xAA;
const BOOT_RX_HEAD2 = 0x55;

const FRAME_TYPE_CMD = 0x00;
const FRAME_TYPE_ACK = 0x01;

const HOST_MODULE_SYSTEM = 0x08;
const MCU_MODULE_SYSTEM  = 0x80;

const CMD_START_UPGRADE = 0x82;
const CMD_ERASE_FLASH   = 0x83;
const CMD_WRITE_FLASH   = 0x84;
const CMD_WRITE_DONE    = 0x85;

const DATA_OK = 0x01;
const DATA_ERR = 0x00;
const ACK1 = 0xFA;

const RSA_HEADER_SIZE = 256;
const HEADER64_SIZE = 64;
const FRAME_DATA_SIZE = 64;
const RX_BUFFER_MAX = 4096;

// ====================== 日志配置（性能优化重点） ======================
const LOG_MAX_LINES = 800;
const LOG_FLUSH_INTERVAL = 50;

// 默认关闭超详细日志
let verboseLog = false;   // true = 打印完整 SEND/RX/RAW HEX
let rawLogEnabled = false; // true = 打印 RAW 分包日志

const logBuffer = [];
let logFlushTimer = null;

// ====================== CRC8 0x2F ======================
const crc_0x2F_table = new Uint8Array([
    0x00,0x2F,0x5E,0x71,0xBC,0x93,0xE2,0xCD,0x57,0x78,0x09,0x26,0xEB,0xC4,0xB5,0x9A,
    0xAE,0x81,0xF0,0xDF,0x12,0x3D,0x4C,0x63,0xF9,0xD6,0xA7,0x88,0x45,0x6A,0x1B,0x34,
    0x73,0x5C,0x2D,0x02,0xCF,0xE0,0x91,0xBE,0x24,0x0B,0x7A,0x55,0x98,0xB7,0xC6,0xE9,
    0xDD,0xF2,0x83,0xAC,0x61,0x4E,0x3F,0x10,0x8A,0xA5,0xD4,0xFB,0x36,0x19,0x68,0x47,
    0xE6,0xC9,0xB8,0x97,0x5A,0x75,0x04,0x2B,0xB1,0x9E,0xEF,0xC0,0x0D,0x22,0x53,0x7C,
    0x48,0x67,0x16,0x39,0xF4,0xDB,0xAA,0x85,0x1F,0x30,0x41,0x6E,0xA3,0x8C,0xFD,0xD2,
    0x95,0xBA,0xCB,0xE4,0x29,0x06,0x77,0x58,0xC2,0xED,0x9C,0xB3,0x7E,0x51,0x20,0x0F,
    0x3B,0x14,0x65,0x4A,0x87,0xA8,0xD9,0xF6,0x6C,0x43,0x32,0x1D,0xD0,0xFF,0x8E,0xA1,
    0xE3,0xCC,0xBD,0x92,0x5F,0x70,0x01,0x2E,0xB4,0x9B,0xEA,0xC5,0x08,0x27,0x56,0x79,
    0x4D,0x62,0x13,0x3C,0xF1,0xDE,0xAF,0x80,0x1A,0x35,0x44,0x6B,0xA6,0x89,0xF8,0xD7,
    0x90,0xBF,0xCE,0xE1,0x2C,0x03,0x72,0x5D,0xC7,0xE8,0x99,0xB6,0x7B,0x54,0x25,0x0A,
    0x3E,0x11,0x60,0x4F,0x82,0xAD,0xDC,0xF3,0x69,0x46,0x37,0x18,0xD5,0xFA,0x8B,0xA4,
    0x05,0x2A,0x5B,0x74,0xB9,0x96,0xE7,0xC8,0x52,0x7D,0x0C,0x23,0xEE,0xC1,0xB0,0x9F,
    0xAB,0x84,0xF5,0xDA,0x17,0x38,0x49,0x66,0xFC,0xD3,0xA2,0x8D,0x40,0x6F,0x1E,0x31,
    0x76,0x59,0x28,0x07,0xCA,0xE5,0x94,0xBB,0x21,0x0E,0x7F,0x50,0x9D,0xB2,0xC3,0xEC,
    0xD8,0xF7,0x86,0xA9,0x64,0x4B,0x3A,0x15,0x8F,0xA0,0xD1,0xFE,0x33,0x1C,0x6D,0x42
]);

function calcCrc8_0x2F(data, len) {
    let crc = 0xFF;
    for (let i = 0; i < len; i++) {
        crc = crc_0x2F_table[(crc ^ data[i]) & 0xFF];
    }
    return (~crc) & 0xFF;
}

function uint8ToHex(arr) {
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ====================== 日志优化 ======================
function flushLogs() {
    const log = document.getElementById('log');
    if (!log || logBuffer.length === 0) {
        logFlushTimer = null;
        return;
    }

    const fragment = document.createDocumentFragment();
    const isNearBottom = (log.scrollHeight - log.scrollTop - log.clientHeight) < 40;

    while (logBuffer.length) {
        const item = logBuffer.shift();
        const line = document.createElement('div');
        line.style.color = item.color;
        line.style.whiteSpace = 'pre';
        line.textContent = item.msg;
        fragment.appendChild(line);
    }

    log.appendChild(fragment);

    while (log.childNodes.length > LOG_MAX_LINES) {
        log.removeChild(log.firstChild);
    }

    if (typeof logAutoScroll !== 'undefined' && logAutoScroll && isNearBottom) {
        log.scrollTop = log.scrollHeight;
    }

    logFlushTimer = null;
}

function logAppend(msg, type = 'info') {
    const color =
        type === 'ok' ? 'green' :
        type === 'err' ? 'red' :
        type === 'warn' ? '#d97706' : '#374151';

    logBuffer.push({ msg, color });

    if (!logFlushTimer) {
        logFlushTimer = setTimeout(flushLogs, LOG_FLUSH_INTERVAL);
    }
}

function setProgress(percent) {
    const textEl = document.getElementById('upgradeProgressText');
    const barEl = document.getElementById('upgradeProgressBar');

    if (textEl) textEl.textContent = `${percent}%`;
    if (barEl) barEl.style.width = `${percent}%`;
}

function updateBtn() {
    const btn = document.getElementById('uartConnectBtn');
    const upgradeBtn = document.getElementById('upgradeBtn');

    if (btn) {
        btn.textContent = isConnected ? "断开连接" : "选择设备并连接";
        btn.style.background = isConnected ? "#dc3545" : "#4b8fd8";
        btn.disabled = isDisconnecting;
    }

    if (upgradeBtn) {
        upgradeBtn.disabled = !isConnected || isDisconnecting || isProcessing;
    }
}

function initUartOptions() {
    const frameLenSel = document.getElementById('upgradeFrameLen');
    if (frameLenSel && !frameLenSel.options.length) {
        frameLenSel.innerHTML = `
            <option value="64" selected>64</option>
            <option value="128">128</option>
        `;
    }
}

// ====================== RX ======================
function clearRxState() {
    rxBuffer = [];
    frameQueue = [];
}

function removeFrames(predicate) {
    frameQueue = frameQueue.filter(f => !predicate(f));
}

function pushRxBytes(bytes) {
    rxBuffer.push(...bytes);
    if (rxBuffer.length > RX_BUFFER_MAX) {
        rxBuffer.splice(0, rxBuffer.length - RX_BUFFER_MAX);
    }
}

function parseFrames() {
    while (rxBuffer.length >= 2) {
        while (rxBuffer.length >= 2 && !(rxBuffer[0] === BOOT_RX_HEAD1 && rxBuffer[1] === BOOT_RX_HEAD2)) {
            rxBuffer.shift();
        }

        if (rxBuffer.length < 4) return;

        const type = rxBuffer[2];
        const len = rxBuffer[3];
        const totalLen = 4 + len + 1;

        if (len < 2) {
            rxBuffer.shift();
            continue;
        }

        if (rxBuffer.length < totalLen) {
            return;
        }

        const frame = rxBuffer.splice(0, totalLen);
        const payload = frame.slice(4, 4 + len);
        const recvCrc = frame[totalLen - 1];
        const calcCrc = calcCrc8_0x2F(payload, payload.length);

        if (calcCrc !== recvCrc) {
            logAppend(`⚠️ 丢弃CRC错误帧: ${uint8ToHex(frame)}`, 'warn');
            continue;
        }

        const module = payload[0];
        const id = payload[1];
        const data = payload.slice(2);
        const status = data.length > 0 ? data[0] : undefined;

        frameQueue.push({
            type,
            len,
            module,
            id,
            data,
            status,
            frame
        });

        // 精简日志：0x84 不打印整帧，只打印页号/状态
        if (id === CMD_WRITE_FLASH && !verboseLog) {
            if (data.length >= 2) {
                const page = (data[0] << 8) | data[1];
                logAppend(`RX <- 0x84 page=${page}`, type === FRAME_TYPE_ACK ? 'info' : 'ok');
            } else if (data.length === 1) {
                logAppend(`RX <- 0x84 status=0x${status.toString(16).toUpperCase().padStart(2, '0')}`, type === FRAME_TYPE_ACK ? 'info' : 'ok');
            } else {
                logAppend(`RX <- 0x84`, type === FRAME_TYPE_ACK ? 'info' : 'ok');
            }
        } else {
            logAppend(`RX <- ${uint8ToHex(frame)}`, type === FRAME_TYPE_ACK ? 'info' : 'ok');
        }

        if (frameQueue.length > 100) {
            frameQueue.splice(0, frameQueue.length - 100);
        }
    }
}

async function startReadLoop() {
    while (isConnected && !isDisconnecting && reader) {
        try {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value || !value.length) continue;

            if (rawLogEnabled) {
                logAppend(`RAW: ${uint8ToHex(value)}`, 'info');
            }

            pushRxBytes(value);
            parseFrames();
        } catch (e) {
            if (!isDisconnecting) {
                logAppend(`⚠️ 串口读取异常: ${e.message}`, 'warn');
            }
            break;
        }
    }
}

async function waitFrame(matcher, timeout = 5000) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        if (!isConnected || isDisconnecting || shouldStopUpgrade) {
            return null;
        }

        for (let i = 0; i < frameQueue.length; i++) {
            const frame = frameQueue[i];
            if (!matcher || matcher(frame)) {
                frameQueue.splice(i, 1);
                return frame;
            }
        }

        await sleep(20);
    }

    return null;
}

async function waitAckFor(hostModule, commandId, timeout = 3000) {
    return await waitFrame(f =>
        f.type === FRAME_TYPE_ACK &&
        f.module === hostModule &&
        f.id === commandId &&
        f.status === ACK1,
        timeout
    );
}

async function waitCmdResult(module, commandId, timeout = 5000) {
    return await waitFrame(f =>
        f.type === FRAME_TYPE_CMD &&
        f.module === module &&
        f.id === commandId,
        timeout
    );
}

async function wait84PageRequest(timeout = 5000) {
    return await waitFrame(f =>
        f.type === FRAME_TYPE_CMD &&
        f.module === MCU_MODULE_SYSTEM &&
        f.id === CMD_WRITE_FLASH &&
        f.data &&
        f.data.length >= 2,
        timeout
    );
}

// ====================== 串口连接/断开 ======================
async function toggleUartConnect() {
    const btn = document.getElementById('uartConnectBtn');
    if (btn) btn.disabled = true;

    try {
        if (isConnected || port) {
            await disconnectSerial();
        } else {
            await connectSerial();
        }
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function connectSerial() {
    if (!navigator.serial) {
        alert("请使用 Chrome / Edge 浏览器");
        return;
    }

    if (isConnected || port) {
        await disconnectSerial();
    }

    try {
        const baudRate = parseInt(document.getElementById('upgradeBaudrate')?.value || '115200', 10);
        const dataBits = parseInt(document.getElementById('upgradeDataBits')?.value || '8', 10);
        const parity = document.getElementById('upgradeParity')?.value || 'none';
        const stopBits = parseInt(document.getElementById('upgradeStopBits')?.value || '1', 10);

        logAppend("打开串口...", "info");

        port = await navigator.serial.requestPort();
        await port.open({
            baudRate,
            dataBits,
            parity,
            stopBits,
            flowControl: 'none'
        });

        reader = port.readable.getReader();
        writer = port.writable.getWriter();

        clearRxState();
        isConnected = true;
        isDisconnecting = false;
        shouldStopUpgrade = false;

        updateBtn();
        logAppend(`✅ 串口已连接 ${baudRate} ${dataBits}${parity === 'none' ? 'N' : parity[0].toUpperCase()}${stopBits}`, "ok");

        readLoopTask = startReadLoop();
    } catch (e) {
        logAppend(`连接失败: ${e.message}`, "err");
        await forceResetState();
    }
}

async function disconnectSerial() {
    if (isDisconnecting) return;

    isDisconnecting = true;
    shouldStopUpgrade = true;
    isUpgrading = false;

    logAppend("断开串口...", "info");

    try {
        isConnected = false;

        if (reader) {
            try { await reader.cancel(); } catch (e) {}
        }

        if (readLoopTask) {
            try { await readLoopTask; } catch (e) {}
        }

        if (reader) {
            try { reader.releaseLock(); } catch (e) {}
            reader = null;
        }

        if (writer) {
            try { writer.releaseLock(); } catch (e) {}
            writer = null;
        }

        if (port) {
            try { await port.close(); } catch (e) {}
            port = null;
        }
    } finally {
        await forceResetState();
        logAppend("✅ 已断开", "info");
    }
}

async function forceResetState() {
    port = null;
    reader = null;
    writer = null;
    readLoopTask = null;
    clearRxState();

    isConnected = false;
    isDisconnecting = false;
    isUpgrading = false;
    isProcessing = false;

    updateBtn();
    await sleep(50);
}

// ====================== TX ======================
async function sendFrame(module, id, data) {
    if (!writer || !isConnected) return false;

    const dataLen = data ? data.length : 0;
    const lenField = 2 + dataLen;

    const crcInput = new Uint8Array(lenField);
    crcInput[0] = module;
    crcInput[1] = id;
    if (dataLen > 0) crcInput.set(data, 2);

    const crc = calcCrc8_0x2F(crcInput, crcInput.length);

    const frame = new Uint8Array(2 + 1 + 1 + lenField + 1);
    frame[0] = BOOT_TX_HEAD1;
    frame[1] = BOOT_TX_HEAD2;
    frame[2] = FRAME_TYPE_CMD;
    frame[3] = lenField;
    frame[4] = module;
    frame[5] = id;
    if (dataLen > 0) frame.set(data, 6);
    frame[frame.length - 1] = crc;

    // 精简日志：0x84 只打页号，不打印整帧HEX
    if (id === CMD_WRITE_FLASH && !verboseLog) {
        const page = data && data.length >= 2 ? ((data[0] << 8) | data[1]) : 0;
        logAppend(`SEND -> 0x84 page=${page}`, 'info');
    } else {
        logAppend(`SEND -> ${uint8ToHex(frame)}`, 'info');
    }

    try {
        await writer.write(frame);
        return true;
    } catch (e) {
        logAppend(`发送失败: ${e.message}`, 'err');
        return false;
    }
}

async function sendEnterBootAA() {
    return await sendFrame(HOST_MODULE_SYSTEM, CMD_START_UPGRADE, new Uint8Array([0xAA]));
}

function padChunk64(chunk) {
    if (chunk.length === FRAME_DATA_SIZE) return chunk;
    const out = new Uint8Array(FRAME_DATA_SIZE);
    out.fill(0xFF);
    out.set(chunk, 0);
    return out;
}

function buildPayload84(pageIndex, chunk64) {
    const data = new Uint8Array(2 + FRAME_DATA_SIZE);
    data[0] = (pageIndex >> 8) & 0xFF;
    data[1] = pageIndex & 0xFF;
    data.set(chunk64, 2);
    return data;
}

// ====================== 升级流程 ======================
async function startUartUpgrade() {
    if (!isConnected || !writer) {
        alert("请先连接串口");
        return;
    }
    if (isUpgrading) {
        alert("当前正在升级中");
        return;
    }

    const verifyFileInput = document.getElementById('verifyBinFile');
    let binFile = null;
    if (verifyFileInput && verifyFileInput.files && verifyFileInput.files[0]) {
        binFile = verifyFileInput.files[0];
    } else if (window.packedBinFile) {
        binFile = window.packedBinFile;
    }

    if (!binFile) {
        alert("请先加载已打包 BIN 文件");
        return;
    }

    const chipSelect = document.getElementById('chipSelect');
    const currentChip = chipSelect?.value || '';
    if (currentChip !== 'R5F10BGG(8368&安卓)') {
        alert("当前仅支持 R5F10BGG(8368&安卓)");
        return;
    }

    isProcessing = true;
    isUpgrading = true;
    shouldStopUpgrade = false;
    clearRxState();
    setProgress(0);
    updateBtn();

    try {
        logAppend("==========================", "ok");
        logAppend("按 iap.c Boot 流程升级", "ok");
        logAppend("==========================", "ok");

        const fullBin = new Uint8Array(await binFile.arrayBuffer());
        logAppend(`原始BIN长度: ${fullBin.length} 字节`, "info");

        if (fullBin.length <= RSA_HEADER_SIZE + HEADER64_SIZE) {
            throw new Error("BIN长度异常，去掉256字节RSA头后不足以升级");
        }

        const binData = fullBin.slice(RSA_HEADER_SIZE);
        logAppend(`去掉RSA头后有效升级数据长度: ${binData.length} 字节`, "info");

        // 0. 发AA进入BOOT
        clearRxState();
        logAppend("先发送 AA 进入BOOT...", "info");

        if (!(await sendEnterBootAA())) {
            throw new Error("发送 AA 进入BOOT 失败");
        }

        const bootAck = await waitAckFor(HOST_MODULE_SYSTEM, CMD_START_UPGRADE, 3000);
        if (bootAck) logAppend("✅ 收到进入BOOT ACK(FA)", "ok");

        const bootCmd = await waitCmdResult(MCU_MODULE_SYSTEM, CMD_START_UPGRADE, 3000);
        if (bootCmd && bootCmd.status === DATA_OK) {
            logAppend("✅ 收到进入BOOT真实成功(01)", "ok");
        } else {
            logAppend("⚠️ 未收到进入BOOT真实成功(01)，按可能已在BOOT中继续", "warn");
        }

        // 1. 发0x82正式开始升级
        removeFrames(f => f.id === CMD_START_UPGRADE);

        if (!(await sendFrame(HOST_MODULE_SYSTEM, CMD_START_UPGRADE, new Uint8Array([0x01])))) {
            throw new Error("0x82 发送失败");
        }

        const ack82 = await waitAckFor(HOST_MODULE_SYSTEM, CMD_START_UPGRADE, 3000);
        if (!ack82) throw new Error("0x82 未收到 ACK(FA)");
        logAppend("✅ 0x82 ACK通过", "ok");

        const cmd82 = await waitCmdResult(MCU_MODULE_SYSTEM, CMD_START_UPGRADE, 5000);
        if (!cmd82 || cmd82.status !== DATA_OK) {
            throw new Error("0x82 未收到真实成功(01)");
        }
        logAppend("✅ 0x82 真实成功(01)", "ok");
        setProgress(5);

        // 2. 发0x83
        removeFrames(f => f.id === CMD_ERASE_FLASH || f.id === CMD_WRITE_FLASH);

        const header64 = binData.slice(0, HEADER64_SIZE);
        if (header64.length !== HEADER64_SIZE) {
            throw new Error("0x83 头64字节长度不足");
        }

        if (!(await sendFrame(HOST_MODULE_SYSTEM, CMD_ERASE_FLASH, header64))) {
            throw new Error("0x83 发送失败");
        }

        const ack83 = await waitAckFor(HOST_MODULE_SYSTEM, CMD_ERASE_FLASH, 3000);
        if (!ack83) throw new Error("0x83 未收到 ACK(FA)");
        logAppend("✅ 0x83 ACK通过", "ok");

        const result83 = await waitCmdResult(MCU_MODULE_SYSTEM, CMD_ERASE_FLASH, 15000);
        if (!result83) {
            throw new Error("0x83 超时：未收到 MCU 业务响应");
        }
        if (result83.status !== DATA_OK) {
            throw new Error(`0x83 阶段失败：返回 0x${result83.status.toString(16).toUpperCase().padStart(2, '0')}`);
        }
        logAppend("✅ 0x83 真实成功(01)", "ok");
        setProgress(10);

        // 3. 等MCU主动发首个0x84页请求（应为00 01）
        removeFrames(f => f.id === CMD_WRITE_FLASH);

        const firstReq84 = await wait84PageRequest(5000);
        if (!firstReq84) {
            throw new Error("0x83 后未收到 MCU 首个 0x84 页请求");
        }

        let requestedPage = (firstReq84.data[0] << 8) | firstReq84.data[1];
        if (requestedPage === 0xFFFF) {
            throw new Error("MCU 首个0x84页请求返回 FFFF");
        }

        logAppend(`✅ MCU 首个页请求: ${requestedPage}`, "ok");

        const totalPages = Math.ceil(Math.max(0, binData.length - HEADER64_SIZE) / FRAME_DATA_SIZE);
        const maxPageIndex = totalPages;

        while (true) {
            if (shouldStopUpgrade || !isConnected) {
                throw new Error("升级已中断");
            }

            if (requestedPage === 0xFFFF) {
                throw new Error("MCU 请求页号为 FFFF，表示写入异常");
            }

            if (requestedPage < 1) {
                throw new Error(`MCU 请求非法页号: ${requestedPage}`);
            }

            if (requestedPage > maxPageIndex) {
                logAppend(`✅ MCU 请求页号 ${requestedPage} 超出最大页 ${maxPageIndex}，判定数据页发送完成`, "ok");
                break;
            }

            const pageIndex = requestedPage;
            const chunkOffset = HEADER64_SIZE + (pageIndex - 1) * FRAME_DATA_SIZE;

            let chunk = binData.slice(chunkOffset, chunkOffset + FRAME_DATA_SIZE);
            chunk = padChunk64(chunk);

            const payload84 = buildPayload84(pageIndex, chunk);

            if (verboseLog) {
                logAppend(`📤 发送第 ${pageIndex}/${totalPages} 页，偏移 ${chunkOffset}`, "info");
            }

            removeFrames(f => f.id === CMD_WRITE_FLASH);

            if (!(await sendFrame(HOST_MODULE_SYSTEM, CMD_WRITE_FLASH, payload84))) {
                throw new Error(`0x84 第${pageIndex}页发送失败`);
            }

            const nextReq84 = await wait84PageRequest(5000);
            if (!nextReq84) {
                throw new Error(`0x84 第${pageIndex}页后无响应`);
            }

            const nextPage = (nextReq84.data[0] << 8) | nextReq84.data[1];
            if (nextPage === 0xFFFF) {
                throw new Error(`0x84 第${pageIndex}页后 MCU 返回 FFFF`);
            }

            if (verboseLog) {
                logAppend(`ℹ️ MCU 返回下一页: ${nextPage}`, "info");
            }

            requestedPage = nextPage;

            // 进度条不要每页都频繁刷得太猛
            if (pageIndex % 2 === 0 || pageIndex === totalPages) {
                const percent = Math.min(95, Math.floor(10 + (pageIndex / Math.max(totalPages, 1)) * 85));
                setProgress(percent);
            }

            // 每8页打一条摘要
            if ((pageIndex % 8 === 0) || (pageIndex === totalPages)) {
                logAppend(`✅ 已发送页 ${pageIndex}/${totalPages}`, "ok");
                await sleep(0);
            }
        }

        logAppend("✅ 所有0x84数据页发送完成", "ok");

        if (shouldStopUpgrade) throw new Error("升级已取消");

        // 4. 发0x85结束
        removeFrames(f => f.id === CMD_WRITE_DONE);

        if (!(await sendFrame(HOST_MODULE_SYSTEM, CMD_WRITE_DONE, new Uint8Array([0x01])))) {
            throw new Error("0x85 发送失败");
        }

        const ack85 = await waitAckFor(HOST_MODULE_SYSTEM, CMD_WRITE_DONE, 3000);
        if (ack85) {
            logAppend("✅ 0x85 ACK通过", "ok");
        }

        const cmd85 = await waitCmdResult(MCU_MODULE_SYSTEM, CMD_WRITE_DONE, 10000);
        if (!cmd85 || cmd85.status !== DATA_OK) {
            throw new Error(`0x85 失败，返回 0x${cmd85?.status?.toString(16).toUpperCase().padStart(2, '0') || '??'}`);
        }

        setProgress(100);
        logAppend("✅ 0x85 真实成功(01)", "ok");
        logAppend("==========================", "ok");
        logAppend("🎉 升级成功，MCU 将复位重启", "ok");
        logAppend("==========================", "ok");

    } catch (e) {
        logAppend(`❌ 升级异常: ${e.message}`, "err");
    } finally {
        isProcessing = false;
        isUpgrading = false;
        shouldStopUpgrade = false;
        updateBtn();
    }
}

// 页面关闭时释放串口
window.addEventListener('beforeunload', () => {
    try {
        shouldStopUpgrade = true;
        isConnected = false;

        if (reader) {
            try { reader.cancel(); } catch (e) {}
            try { reader.releaseLock(); } catch (e) {}
        }
        if (writer) {
            try { writer.releaseLock(); } catch (e) {}
        }
        if (port) {
            try { port.close(); } catch (e) {}
        }
    } catch (e) {}
});

// ====================== 启动 ======================
document.addEventListener('DOMContentLoaded', () => {
    initUartOptions();
    updateBtn();
    setProgress(0);
});