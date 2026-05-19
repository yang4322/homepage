<?php
session_start();
header("Content-Type: text/html; charset=UTF-8");

// ====================== 数据库配置 ======================
$db_host = "localhost";
$db_port = 3306;
$db_name = "3iuiy4u29i222";
$db_user = "3iuiy4u29i222";
$db_pass = "3iuiy4u29i222";

// ====================== 数据库连接 ======================
$conn = @new mysqli($db_host, $db_user, $db_pass, $db_name, $db_port);
if ($conn->connect_error) {
    die("数据库连接失败：" . $conn->connect_error);
}
$conn->set_charset("utf8mb4");

$is_login = isset($_SESSION['admin_login']) && $_SESSION['admin_login'] === true;

// ====================== AJAX：登录状态 ======================
if (isset($_GET['ajax']) && $_GET['ajax'] === 'login_status') {
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode([
        'ok' => 1,
        'is_login' => $is_login ? 1 : 0
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ====================== AJAX：登录 ======================
if (isset($_POST['ajax']) && $_POST['ajax'] === 'login') {
    header('Content-Type: application/json; charset=UTF-8');

    $user = trim($_POST['username'] ?? '');
    $pwd  = trim($_POST['password'] ?? '');

    if ($user === '' || $pwd === '') {
        echo json_encode([
            'ok' => 0,
            'msg' => '请输入账号和密码'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = $conn->prepare("SELECT password_hash FROM admin_users WHERE username=? LIMIT 1");
    if (!$stmt) {
        echo json_encode([
            'ok' => 0,
            'msg' => '数据库预处理失败'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt->bind_param("s", $user);
    $stmt->execute();
    $res = $stmt->get_result();

    if ($row = $res->fetch_assoc()) {
        if (strtolower(md5($pwd)) === strtolower($row['password_hash'])) {
            $_SESSION['admin_login'] = true;
            $_SESSION['admin_username'] = $user;
            echo json_encode([
                'ok' => 1,
                'msg' => '登录成功'
            ], JSON_UNESCAPED_UNICODE);
        } else {
            echo json_encode([
                'ok' => 0,
                'msg' => '密码错误'
            ], JSON_UNESCAPED_UNICODE);
        }
    } else {
        echo json_encode([
            'ok' => 0,
            'msg' => '用户不存在'
        ], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

// ====================== AJAX：退出 ======================
if (isset($_POST['ajax']) && $_POST['ajax'] === 'logout') {
    header('Content-Type: application/json; charset=UTF-8');
    session_unset();
    session_destroy();
    echo json_encode([
        'ok' => 1,
        'msg' => '已退出登录'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ====================== AJAX：刷新项目列表 ======================
if (isset($_GET['ajax']) && $_GET['ajax'] === 'project_list') {
    header('Content-Type: application/json; charset=UTF-8');

    if (!$is_login) {
        echo json_encode([
            'ok' => 0,
            'msg' => '请登录'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $project_list = [];
    $res = $conn->query("SELECT id, project_name FROM project_keys ORDER BY id DESC");
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $project_list[] = $row;
        }
    }

    echo json_encode([
        'ok' => 1,
        'list' => $project_list
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ====================== AJAX：加载项目密钥 ======================
if (isset($_GET['ajax']) && $_GET['ajax'] === 'load_key' && isset($_GET['pid'])) {
    header('Content-Type: application/json; charset=UTF-8');

    if (!$is_login) {
        echo json_encode([
            'ok' => 0,
            'msg' => '请登录'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $pid = (int)$_GET['pid'];
    $stmt = $conn->prepare("SELECT private_key, public_key, keycode FROM project_keys WHERE id=? LIMIT 1");
    if (!$stmt) {
        echo json_encode([
            'ok' => 0,
            'msg' => '数据库预处理失败'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt->bind_param("i", $pid);
    $stmt->execute();
    $data = $stmt->get_result()->fetch_assoc();

    if ($data) {
        echo json_encode([
            'ok' => 1,
            'pri' => $data['private_key'] ?? '',
            'pub' => $data['public_key'] ?? '',
            'keycode' => base64_encode($data['keycode'] ?? '')
        ], JSON_UNESCAPED_UNICODE);
    } else {
        echo json_encode([
            'ok' => 0,
            'msg' => '未找到该项目密钥'
        ], JSON_UNESCAPED_UNICODE);
    }
    exit;
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>🔐 瑞萨升级加密 / 验证 / 解包工具</title>
<style>
    * { box-sizing: border-box; font-family: "Microsoft YaHei", sans-serif; }
    body { margin: 0; background: #f2f4f7; padding: 18px; }
    .container { max-width: 1260px; margin: auto; padding-left: 70px; padding-right: 20px; }
    .title {
        text-align: center; font-size: 24px; font-weight: bold;
        margin-bottom: 18px; color: #23395d;
    }
    .card {
        background: white; border-radius: 16px; padding: 20px;
        margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .row {
        display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    }
    .row .col {
        display: flex; align-items: center; gap: 8px;
        flex: 1;
        min-width: 300px;
    }
    .label {
        width: 100px;
        font-size: 13px; font-weight: bold; color: #222;
        flex-shrink: 0;
    }
    .label.wide { width: 150px; }

    .row .col input[type="text"],
    .row .col input[type="password"],
    .row .col select {
        flex: 1 1 180px;
        border: 1px solid #d0d5dd; border-radius: 10px;
        padding: 10px 12px; font-size: 13px; background: #fff;
        height: 40px;
    }
    button {
        height: 40px; padding: 0 20px; border: none; border-radius: 10px;
        background: #4b8fd8; color: white; font-size: 13px; cursor: pointer; flex-shrink: 0;
        white-space: nowrap;
    }
    button:hover { background: #3579c7; }

    input[type="text"]:disabled, input[type="password"]:disabled, select:disabled {
        background: #f3f4f6;
        color: #9ca3af;
        cursor: not-allowed;
    }
    textarea {
        min-height: 100px; resize: vertical; line-height: 1.6;
        border: 1px solid #d0d5dd; border-radius: 10px;
        padding: 10px 12px; font-size: 13px; width: 100%;
    }

    .action {
        text-align: center; margin-top: 28px; display: flex;
        justify-content: center; gap: 12px; flex-wrap: wrap;
    }

    .pack-btn { width: 180px; height: 42px; font-size: 15px; font-weight: bold; background: #1d75d8; }
    .verify-btn { width: 240px; height: 42px; font-size: 15px; font-weight: bold; background: #28a745; }
    .extract-btn { width: 180px; height: 42px; font-size: 15px; font-weight: bold; background: #ff9800; }
    .clear-btn { width: 220px; height: 42px; font-size: 15px; font-weight: bold; background: #6b7280; }
    .upgrade-btn { width: 220px; height: 42px; font-size: 15px; font-weight: bold; background: #0ea5e9; }

    .refresh-btn { background: #0ea5e9; }
    .db-load-btn { background: #7c3aed; min-width: 160px; }
    .auth-btn.login { background: #1d75d8; min-width: 100px; }
    .auth-btn.logout { background: #dc3545; min-width: 100px; }
    .clear-key-btn { background: #6b7280; min-width: 140px; }

    .clear-key-btn:hover { background: #4b5563; }

    .pack-btn:hover { background: #1767bf; }
    .verify-btn:hover { background: #218838; }
    .extract-btn:hover { background: #e58b00; }
    .clear-btn:hover { background: #4b5563; }
    .upgrade-btn:hover { background: #0284c7; }

    .section-title {
        font-size: 16px; font-weight: bold; color: #23395d;
        margin: 24px 0 16px; text-align: center;
    }
    .sub-title {
        font-size: 14px; font-weight: bold; color: #344054; margin-bottom: 10px;
    }
    .check-group {
        display: flex; flex-wrap: wrap; gap: 18px; align-items: center;
        padding: 8px 0;
    }
    .check-item {
        display: flex; align-items: center; gap: 6px; font-size: 13px; color: #333;
        white-space: nowrap;
    }
    .check-item input[type="checkbox"] {
        width: 16px; height: 16px;
    }

    /* 日志工具栏 */
    .log-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    }
    .log-toolbar-title {
        font-size: 14px;
        font-weight: bold;
        color: #23395d;
    }
    .log-toolbar-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    /* 优化后的日志框 */
    .log {
        margin-top: 20px;
        background: white;
        border-radius: 12px;
        padding: 16px;
        font-size: 12px;
        line-height: 1.7;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);

        height: 520px;
        overflow-y: auto;
        overflow-x: auto;

        white-space: pre;
        word-break: normal;
        overflow-wrap: normal;

        font-family: Consolas, "Courier New", monospace;
    }

    .ok { color: green; }
    .err { color: red; }
    .warn { color: #d97706; }
    .info { color: #1d4ed8; }

    .chip-desc {
        margin-top: 12px;
        font-size: 12px;
        color: #666;
        line-height: 1.5;
        padding-left: 2px;
    }

    .side-bar {
        position: fixed;
        top: 0;
        left: 0;
        height: 100vh;
        width: 50px;
        background: #fff;
        box-shadow: 2px 0 8px rgba(0,0,0,0.08);
        transition: width 0.3s ease;
        overflow: hidden;
        z-index: 100;
    }
    .side-bar:hover { width: 300px; }
    .side-bar-icon {
        width: 50px;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1d75d8;
        color: #fff;
        font-size: 20px;
    }
    .side-bar-content {
        position: absolute;
        top: 0;
        left: 50px;
        width: 250px;
        height: 100%;
        padding: 20px;
        overflow-y: auto;
        background: #fff;
    }
    .side-bar-title {
        font-size: 15px;
        font-weight: bold;
        color: #23395d;
        margin-bottom: 16px;
    }
    .side-bar-table {
        width: 100%;
        font-size: 11px;
        border-collapse: collapse;
    }
    .side-bar-table th,
    .side-bar-table td {
        border: 1px solid #e5e7eb;
        padding: 6px 4px;
        text-align: left;
        word-break: break-all;
    }
    .side-bar-table th {
        background: #f9fafb;
        font-weight: bold;
        color: #374151;
    }

    .status-pill {
        display: inline-block;
        padding: 8px 16px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: bold;
        margin-bottom: 18px;
    }
    .status-pill.online {
        background: #dcfce7;
        color: #166534;
    }
    .status-pill.offline {
        background: #fee2e2;
        color: #991b1b;
    }

    .hint-text {
        font-size: 12px;
        color: #666;
        margin-top: 10px;
    }

    .key-status-box {
        font-size: 12px;
        padding: 8px 12px;
        border-radius: 8px;
        background: #f3f4f6;
        line-height: 1.6;
        min-height: 40px;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
    }

    .key-chip-tag {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: #dbeafe;
        color: #1d4ed8;
        font-weight: bold;
        font-size: 12px;
    }

    .key-ok {
        color: #16a34a;
        font-weight: bold;
    }

    .key-miss {
        color: #9ca3af;
    }

    .progress-bar-container {
        width: 100%;
        background: #e5e7eb;
        border-radius: 10px;
        height: 16px;
        margin-top: 10px;
        overflow: hidden;
    }
    .progress-bar {
        height: 100%;
        width: 0%;
        background: #1d75d8;
        transition: width 0.2s ease;
        border-radius: 10px;
    }

    @media (max-width: 900px) {
        .container {
            padding-left: 20px;
            padding-right: 10px;
        }
        .row {
            flex-direction: column;
            align-items: stretch;
        }
        .row .col {
            min-width: 100%;
        }
        .label, .label.wide {
            width: 120px;
        }
        .action {
            flex-direction: column;
            align-items: center;
        }
        .pack-btn, .verify-btn, .extract-btn, .clear-btn, .upgrade-btn {
            width: 100%;
            max-width: 300px;
        }
        .side-bar {
            display: none;
        }
        .log {
            height: 420px;
        }
    }
</style>
</head>
<body>

<div class="side-bar">
    <div class="side-bar-icon">ℹ️</div>
    <div class="side-bar-content">
        <div class="side-bar-title">项目-芯片对照表</div>
        <table class="side-bar-table">
            <thead>
                <tr>
                    <th>项目名称</th>
                    <th>适用芯片型号</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>8368/安卓项目_RL78</td><td>R5F10BGG(8368&安卓)</td></tr>
                <tr><td>8368PU_RH850</td><td>R7F7016923AFP</td></tr>
                <tr><td>8268项目_RL78</td><td>R5F10BGG(8268)</td></tr>
                <tr><td>630H项目_RL78</td><td>R5F10BGG(630H)</td></tr>
                <tr><td>8268项目_RL78</td><td>R5F10BGG(8268_CRC)</td></tr>
                <tr><td>MD5校验项目_RL78</td><td>R5F10BGG(MD5)</td></tr>
            </tbody>
        </table>
    </div>
</div>

<div class="container">
    <div class="title">🔐 瑞萨升级加密 / 验证 / 解包工具</div>

    <div class="card">
        <div id="loginStatusPill" class="status-pill <?= $is_login ? 'online' : 'offline' ?>">
            <?= $is_login ? '✅ 已登录，可自动加载数据库密钥' : '❌ 未登录，请手动上传密钥' ?>
        </div>

        <div class="row">
            <div class="col">
                <div class="label">账号</div>
                <input type="text" id="loginUsername" placeholder="请输入管理员账号" <?= $is_login ? 'disabled' : '' ?> value="<?= isset($_SESSION['admin_username']) ? htmlspecialchars($_SESSION['admin_username']) : '' ?>">
            </div>
            <div class="col">
                <div class="label">密码</div>
                <input type="password" id="loginPassword" placeholder="请输入管理员密码" <?= $is_login ? 'disabled' : '' ?>>
            </div>
            <div class="col" style="flex:0 0 auto;">
                <button type="button" id="authToggleBtn" class="auth-btn <?= $is_login ? 'logout' : 'login' ?>" onclick="handleAuthToggle()">
                    <?= $is_login ? '退出' : '登录' ?>
                </button>
            </div>
        </div>

        <div class="row" style="margin-top:12px;">
            <div class="col">
                <div class="label">数据库密钥</div>
                <select id="projectSelect">
                    <option value="">-- 请先登录后刷新数据库 --</option>
                </select>
            </div>

            <div class="col" style="flex:0 0 auto;">
                <button type="button" class="refresh-btn" onclick="refreshProjectList(false)">刷新数据库</button>
            </div>

            <div class="col" style="flex:0 0 auto;">
                <button type="button" class="db-load-btn" onclick="loadKeyFromDB()">加载数据库密钥</button>
            </div>

            <div class="col" style="flex:0 0 auto;">
                <button type="button" class="clear-key-btn" onclick="clearLoadedKeys()">清除已加载密钥</button>
            </div>

            <div class="col" style="min-width: 320px;">
                <div class="label">当前密钥状态</div>
                <div id="keyStatusDisplay" class="key-status-box">
                    <span style="color:#666;">未加载任何密钥</span>
                </div>
            </div>
        </div>

        <div class="hint-text">
            未登录也可以手动选择私钥、公钥、KEYCODE、BIN 进行加密/验证/解包；登录后可从数据库自动加载密钥与 KEYCODE。
        </div>
    </div>

    <div class="card row">
        <div class="col">
            <div class="label">私钥文件</div>
            <input type="text" id="priKeyName" readonly>
            <button onclick="document.getElementById('priKeyFile').click()">选择</button>
            <input type="file" id="priKeyFile" hidden accept=".pem">
        </div>
        <div class="col">
            <div class="label">公钥文件</div>
            <input type="text" id="pubKeyName" readonly>
            <button onclick="document.getElementById('pubKeyFile').click()">选择</button>
            <input type="file" id="pubKeyFile" hidden accept=".pem">
        </div>
    </div>

    <div class="section-title">📦 加密打包</div>

    <div class="card row">
        <div class="col">
            <div class="label">待处理BIN</div>
            <input type="text" id="binName" readonly>
            <button onclick="document.getElementById('binFile').click()">选择</button>
            <input type="file" id="binFile" hidden accept=".bin">
        </div>
        <div class="col">
            <div class="label">KEYCODE</div>
            <input type="text" id="keycodeName" readonly>
            <button onclick="document.getElementById('keycodeFile').click()">选择</button>
            <input type="file" id="keycodeFile" hidden>
        </div>
    </div>

    <div class="card">
        <div class="row">
            <div class="col">
                <div class="label">芯片型号</div>
                <select id="chipSelect"></select>
            </div>
            <div class="col">
                <div class="label wide">零长度检测步长</div>
                <select id="zeroDetectStep"></select>
            </div>
            <div class="col" style="flex:0 0 auto;">
                <button type="button" onclick="autoDetectFileLength()">自动识别文件长度</button>
            </div>
        </div>
        <div class="chip-desc" id="chipDescText">请选择目标芯片以加载说明信息。</div>
    </div>

    <div class="card">
        <div class="row">
            <div class="col">
                <div class="label">版本地址</div>
                <input type="text" id="versionAddr" value="0x3FC0">
            </div>
            <div class="col">
                <div class="label">文件地址</div>
                <input type="text" id="fileAddr" value="0x4000">
            </div>
            <div class="col">
                <div class="label">文件长度</div>
                <input type="text" id="fileLen" value="0x0">
            </div>
        </div>

        <div class="row" style="margin-top:12px;">
            <div class="col">
                <div class="label wide">明文起始偏移</div>
                <input type="text" id="plainStartOffset" value="0">
            </div>
            <div class="col">
                <div class="label wide">明文结束偏移</div>
                <input type="text" id="plainEndOffset" value="0">
            </div>
            <div class="col">
                <div class="label wide">哈希算法</div>
                <select id="hashAlgo" title="默认是当前算法">
                    <option value="SHA256" selected>SHA256</option>
                    <option value="SHA384">SHA384</option>
                    <option value="SHA512">SHA512</option>
                    <option value="SHA3-224">SHA3-224</option>
                    <option value="SHA3-256">SHA3-256</option>
                    <option value="SHA3-384">SHA3-384</option>
                    <option value="SHA3-512">SHA3-512</option>
                    <option value="SM3">SM3</option>
                </select>
            </div>
        </div>

        <div class="row" style="margin-top:12px;">
            <div class="col">
                <div class="label wide">导出方式</div>
                <select id="outputMode">
                    <option value="trimmed-pack" selected>裁切包输出</option>
                    <option value="full-bin">完整BIN输出</option>
                </select>
            </div>
            <div class="col">
                <div class="label wide">打包校验方式</div>
                <select id="packCheckType">
                    <option value="CRC" selected>CRC32</option>
                    <option value="CHECKSUM">CHECKSUM</option>
                    <option value="MD5">MD5</option>
                </select>
            </div>
        </div>
    </div>

    <div class="action">
        <button class="pack-btn" onclick="startPack()">开始加密打包</button>
    </div>

    <div class="section-title">✅ 解密验证 / 🔓 解包</div>

    <div class="card row">
        <div class="col">
            <div class="label">已打包BIN</div>
            <input type="text" id="verifyBinName" readonly>
            <button onclick="document.getElementById('verifyBinFile').click()">选择</button>
            <input type="file" id="verifyBinFile" hidden accept=".bin">
        </div>
    </div>

    <div class="card">
        <div class="sub-title">校验选项</div>
        <div class="check-group">
            <label class="check-item"><input type="checkbox" id="checkStructure" checked>结构校验</label>
            <label class="check-item"><input type="checkbox" id="checkLength" checked>长度校验</label>
            <label class="check-item"><input type="checkbox" id="checkCRC" checked onclick="toggleCheckType('CRC')">CRC32校验</label>
            <label class="check-item"><input type="checkbox" id="checkChecksum" onclick="toggleCheckType('CHECKSUM')">校验和校验</label>
            <label class="check-item"><input type="checkbox" id="checkMD5" onclick="toggleCheckType('MD5')">MD5校验</label>
            <label class="check-item"><input type="checkbox" id="checkRSA" checked>RSA签名/解密校验</label>
        </div>
    </div>

    <div class="card">
        <div class="sub-title">手工输入外部工具解密HEX比对</div>
        <div style="font-size:12px; color:#666; margin-bottom:8px;">
            可使用外部RSA解密工具：
            <a href="https://www.codertools.net/tools/rsa.php?lang=zh" target="_blank" rel="noopener noreferrer" style="color:#1d75d8; text-decoration:none;">
                https://www.codertools.net/tools/rsa.php?lang=zh
            </a>
            （密钥长度：2048位，填充方式：PKCS#1 v1.5）
        </div>
        <div class="row">
            <div class="col" style="min-width:100%;">
                <div class="label wide">外部解密HEX</div>
                <textarea id="manualDecryptedHex" placeholder="粘贴外部网页工具解密得到的HEX。目标：计算明文 == 解析明文 == 外部工具解密明文"></textarea>
            </div>
        </div>
        <div class="action" style="margin-top:12px;">
            <button onclick="startManualHexCompare()">手工HEX比对</button>
        </div>
    </div>

    <div class="action">
        <button class="verify-btn" onclick="startVerifyOnly()">开始解密验证</button>
        <button class="extract-btn" onclick="startExtract()">开始解包导出</button>
        <button class="clear-btn" onclick="clearVerifyInfo()">清除BIN信息及校验信息</button>
    </div>

    <!-- 在线升级 -->
    <div class="section-title">🔌 在线升级（串口）</div>
    <div class="card">
        <div class="row" style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <div class="col" style="flex: 1 1 calc(25% - 12px); min-width: 160px;">
                <div class="label">波特率</div>
                <select id="upgradeBaudrate" style="width: 100%;">
                    <option value="9600">9600</option>
                    <option value="19200">19200</option>
                    <option value="38400" selected>38400</option>
                    <option value="57600">57600</option>
                    <option value="115200">115200</option>
                </select>
            </div>
            <div class="col" style="flex: 1 1 calc(25% - 12px); min-width: 160px;">
                <div class="label">数据位</div>
                <select id="upgradeDataBits" style="width: 100%;">
                    <option value="8" selected>8</option>
                    <option value="7">7</option>
                </select>
            </div>
            <div class="col" style="flex: 1 1 calc(25% - 12px); min-width: 160px;">
                <div class="label">校验位</div>
                <select id="upgradeParity" style="width: 100%;">
                    <option value="none" selected>None</option>
                    <option value="odd">Odd</option>
                    <option value="even">Even</option>
                </select>
            </div>
            <div class="col" style="flex: 1 1 calc(25% - 12px); min-width: 160px;">
                <div class="label">停止位</div>
                <select id="upgradeStopBits" style="width: 100%;">
                    <option value="1" selected>1</option>
                    <option value="2">2</option>
                </select>
            </div>
        </div>

        <div class="row" style="margin-top:12px; align-items: center; gap: 12px; flex-wrap: wrap;">
            <div class="col" style="flex: 1 1 auto; min-width: 200px;">
                <div class="label wide">单帧长度</div>
                <select id="upgradeFrameLen" style="width: 100%;"></select>
            </div>
            <div class="col" style="flex: 0 0 auto;">
                <button type="button" id="uartConnectBtn" onclick="toggleUartConnect()">选择设备并连接</button>
            </div>
            <div class="col" style="flex: 0 0 auto;">
                <button type="button" class="upgrade-btn" id="upgradeBtn" onclick="startUartUpgrade()" disabled>固件升级</button>
            </div>
        </div>

        <div class="progress-bar-container">
            <div id="upgradeProgressBar" class="progress-bar"></div>
        </div>
        <div style="font-size:12px; color:#666; margin-top:6px;">
            进度：<span id="upgradeProgressText">0%</span>
        </div>
    </div>

    <!-- 日志工具栏 -->
    <div class="card" style="padding:12px 16px; margin-top:16px;">
        <div class="log-toolbar">
            <div class="log-toolbar-title">调试日志</div>
            <div class="log-toolbar-actions">
                <button type="button" onclick="toggleLogAutoScroll()" id="logAutoScrollBtn">自动滚动：开</button>
                <button type="button" onclick="clearLog()">清空日志</button>
                <button type="button" onclick="downloadLog()">导出日志</button>
            </div>
        </div>
    </div>

    <div class="log" id="log">等待操作...</div>
</div>

<script>
let logAutoScroll = true;

function toggleLogAutoScroll() {
    logAutoScroll = !logAutoScroll;
    const btn = document.getElementById('logAutoScrollBtn');
    if (btn) {
        btn.textContent = `自动滚动：${logAutoScroll ? '开' : '关'}`;
    }
}

function clearLog() {
    const log = document.getElementById('log');
    if (!log) return;
    log.innerHTML = '';
}

function downloadLog() {
    const log = document.getElementById('log');
    if (!log) return;

    const text = log.innerText || log.textContent || '';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `upgrade_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();

    URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
    const log = document.getElementById('log');
    if (!log) return;

    log.addEventListener('scroll', () => {
        const isNearBottom = (log.scrollHeight - log.scrollTop - log.clientHeight) < 40;
        if (!isNearBottom) {
            logAutoScroll = false;
        }
        const btn = document.getElementById('logAutoScrollBtn');
        if (btn) {
            btn.textContent = `自动滚动：${logAutoScroll ? '开' : '关'}`;
        }
    });
});
</script>

<script src="SA2048_firmwareFile.js"></script>
<script src="mcu_uart_update.js"></script>
</body>
</html>