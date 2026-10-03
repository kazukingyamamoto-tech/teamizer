// ==========================================
// 1. 変数定義と初期化
// ==========================================
let members = JSON.parse(localStorage.getItem('badmintonMembers')) || [];
let matchHistory = JSON.parse(localStorage.getItem('badmintonMatchHistory')) || [];

// コート設定（使用コート数と、コートごとの奥側・手前側の選出人数 0〜4）
const MAX_PLAYERS_PER_SIDE = 4;
const SIDES = [
    { key: 'far', label: '奥側' },
    { key: 'near', label: '手前側' }
];
const DEFAULT_COURT_SETTINGS = { courtCount: 1, sides: [[2, 2], [2, 2], [2, 2]] };
let courtSettings = JSON.parse(localStorage.getItem('badmintonCourtSettings'));
if (!courtSettings || !Array.isArray(courtSettings.sides)) courtSettings = structuredClone(DEFAULT_COURT_SETTINGS);

// メンバー表プリセット [{ name, members: [...] }]
let memberPresets = JSON.parse(localStorage.getItem('badmintonPresets')) || [];
// これまでに使ったメンバーと参加・待機回数 { 名前: { games, waits } }
let memberStats = JSON.parse(localStorage.getItem('badmintonMemberStats')) || {};

let currentMatchData = { courts: [], waiting: [] };
let selectedInfo = null;

let timerInterval = null;
let timeLeft = 60;
let isRunning = false;

// ★追加：スリープ防止用変数
let wakeLock = null;

const alarmAudio = new Audio('alarm.mp3'); 

window.onload = () => {
    migrateLegacyData();
    renderMasterList();
    updateTimerDisplay();
    updateDrawButton();
    initCourtSettings();
};

// ==========================================
// 2. スリープ防止機能 (Screen Wake Lock API) ★追加部分
// ==========================================
async function requestWakeLock() {
    try {
        // ブラウザが対応しているか確認
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('スリープ防止モード: ON');
        }
    } catch (err) {
        console.error(`スリープ防止エラー: ${err.name}, ${err.message}`);
    }
}

async function releaseWakeLock() {
    if (wakeLock !== null) {
        await wakeLock.release();
        wakeLock = null;
        console.log('スリープ防止モード: OFF');
    }
}

// アプリがバックグラウンドから復帰した時にロックを再取得する処理
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

// ==========================================
// 3. 音声再生機能
// ==========================================
function playAlarm() {
    alarmAudio.currentTime = 0;
    alarmAudio.play().catch(e => console.log("再生失敗:", e));
    setTimeout(() => stopAlarm(), 10000); 
}

function stopAlarm() {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
}

// ==========================================
// 4. メンバー管理・データ保存
// ==========================================
function saveToLocalStorage() {
    localStorage.setItem('badmintonMembers', JSON.stringify(members));
    localStorage.setItem('badmintonMatchHistory', JSON.stringify(matchHistory));
    localStorage.setItem('badmintonCourtSettings', JSON.stringify(courtSettings));
    localStorage.setItem('badmintonPresets', JSON.stringify(memberPresets));
    localStorage.setItem('badmintonMemberStats', JSON.stringify(memberStats));
}

// 旧「登録」機能のデータをプリセットへ引き継ぐ
function migrateLegacyData() {
    const legacy = localStorage.getItem('badmintonBaseMembers');
    if (legacy) {
        const list = JSON.parse(legacy);
        if (Array.isArray(list) && list.length > 0 && !memberPresets.some(p => p.name === '登録メンバー')) {
            memberPresets.push({ name: '登録メンバー', members: list });
        }
        localStorage.removeItem('badmintonBaseMembers');
    }
    // 現在のメンバーを使用履歴に取り込む
    members.forEach(touchMember);
    saveToLocalStorage();
}

// 使用履歴に名前を登録する（既にあれば何もしない）
function touchMember(name) {
    if (!memberStats[name]) memberStats[name] = { games: 0, waits: 0 };
}

// ==========================================
// 4-2. コート設定（コート数・コートごとの人数）
// ==========================================
function initCourtSettings() {
    const radio = document.querySelector(`input[name="courtCount"][value="${courtSettings.courtCount}"]`);
    if (radio) radio.checked = true;
    renderMatchBoard();
}

function onCourtCountChange() {
    courtSettings.courtCount = parseInt(document.querySelector('input[name="courtCount"]:checked').value);
    saveToLocalStorage();
    hideDrawError();
    renderMatchBoard();
}

function onSideSizeChange(courtIdx, sideIdx, value) {
    courtSettings.sides[courtIdx][sideIdx] = parseInt(value);
    saveToLocalStorage();
    hideDrawError();
    renderMatchBoard();
}

// 使用中コートの [奥側, 手前側] 人数配列（例: [[2,2], [1,1]]）
function getCourtSizes() {
    return courtSettings.sides.slice(0, courtSettings.courtCount);
}

function showDrawError(msg) {
    const div = document.getElementById('drawError');
    if (!div) return;
    div.innerText = msg;
    div.style.display = 'block';
}

function hideDrawError() {
    const div = document.getElementById('drawError');
    if (div) div.style.display = 'none';
}

function updateDrawButton() {
    const btn = document.getElementById('drawBtn');
    if (btn) {
        btn.innerText = `組み合わせ作成！（${members.length}名）`;
    }
}

function addMember() {
    const input = document.getElementById('nameInput');
    const name = input.value.trim();
    if (name && !members.includes(name)) {
        members.push(name);
        touchMember(name);
        input.value = '';
        saveToLocalStorage();
        renderMasterList();
        updateDrawButton();
    }
}

// 名前の配列を今日のメンバーに追加する（重複は無視）
function addMembers(names) {
    let added = 0;
    names.forEach(name => {
        if (!members.includes(name)) {
            members.push(name);
            added++;
        }
        touchMember(name);
    });
    saveToLocalStorage();
    renderMasterList();
    updateDrawButton();
    return { added, skipped: names.length - added };
}

function renderMasterList() {
    const listDiv = document.getElementById('memberList');
    if (!listDiv) return;
    listDiv.innerHTML = '';
    members.forEach(name => {
        const chip = document.createElement('div');
        chip.className = 'member-chip';
        chip.innerText = name;
        chip.onclick = () => {
            members = members.filter(m => m !== name);
            saveToLocalStorage();
            renderMasterList();
            updateDrawButton();
        };
        listDiv.appendChild(chip);
    });
    if (isManagePanelOpen()) renderManagePanel();
}

// ==========================================
// 5. 組み合わせ抽選
// ==========================================

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function isSamePair(pair1, pair2) {
    const s1 = [...pair1].sort().join(',');
    const s2 = [...pair2].sort().join(',');
    return s1 === s2;
}

// プレイヤー配列をコートごと・側ごとの人数で切り分け、
// コート配列（{far: [...], near: [...]}）と2人組ペア一覧を返す
function buildCourts(playing, courtSizes) {
    let courts = [];
    let pairs = [];
    let offset = 0;
    for (const sizes of courtSizes) {
        const court = {};
        SIDES.forEach((side, sIdx) => {
            const team = playing.slice(offset, offset + sizes[sIdx]);
            offset += sizes[sIdx];
            court[side.key] = team;
            if (team.length === 2) pairs.push(team);
        });
        courts.push(court);
    }
    return { courts, pairs };
}

function hasDuplicatePair(pairs) {
    for (const h of matchHistory) {
        for (const oldPair of h.pairs) {
            if (pairs.some(pair => isSamePair(pair, oldPair))) return true;
        }
    }
    return false;
}

function drawMatches() {
    const mode = document.querySelector('input[name="drawMode"]:checked').value;
    const courtSizes = getCourtSizes();
    const playersNeeded = courtSizes.flat().reduce((sum, n) => sum + n, 0);

    if (playersNeeded === 0) {
        showDrawError("コートの人数がすべて0人です。いずれかのコートに人数を設定してください。");
        return;
    }
    if (members.length < playersNeeded) {
        showDrawError(`メンバーが足りません。コート設定では${playersNeeded}名必要ですが、現在${members.length}名です。`);
        return;
    }
    hideDrawError();
    document.getElementById('instruction').style.display = 'block';

    let finalCourts = [];
    let finalWaiting = [];
    let finalPairs = [];

    // A. 通常モード
    if (mode === 'normal') {
        let shuffled = shuffle([...members]);
        if (members.length > playersNeeded) {
            finalWaiting = shuffled.slice(playersNeeded);
        }
        let playing = shuffled.slice(0, playersNeeded);
        const built = buildCourts(playing, courtSizes);
        finalCourts = built.courts;
        finalPairs = built.pairs;
    } 
    // B. スマートモード
    else {
        // Step 1: 待機メンバー決定
        let numWaiting = Math.max(0, members.length - playersNeeded);
        
        if (numWaiting > 0) {
            let lastWaiters = [];
            let prevWaiters = [];
            if (matchHistory.length > 0) lastWaiters = matchHistory[0].waiting;
            if (matchHistory.length > 1) prevWaiters = matchHistory[1].waiting;

            let groupA = []; // 未待機
            let groupB = []; // 2回前待機
            let groupC = []; // 直前待機

            members.forEach(m => {
                if (lastWaiters.includes(m)) groupC.push(m);
                else if (prevWaiters.includes(m)) groupB.push(m);
                else groupA.push(m);
            });

            groupA = shuffle(groupA);
            groupB = shuffle(groupB);
            groupC = shuffle(groupC);

            let candidates = [...groupA, ...groupB, ...groupC];
            finalWaiting = candidates.slice(0, numWaiting);
        }

        // Step 2: ペア決定
        let playingMembers = members.filter(m => !finalWaiting.includes(m));
        
        let bestPairs = [];
        let bestCourts = [];
        let success = false;

        for (let attempt = 0; attempt < 500; attempt++) {
            let shuffled = shuffle([...playingMembers]);
            const built = buildCourts(shuffled, courtSizes);

            if (!hasDuplicatePair(built.pairs)) {
                success = true;
                bestPairs = built.pairs;
                bestCourts = built.courts;
                break; 
            }
        }

        if (!success) {
            console.log("ペア重複回避失敗。待機優先で生成します。");
            let shuffled = shuffle([...playingMembers]);
            const built = buildCourts(shuffled, courtSizes);
            bestCourts = built.courts;
            bestPairs = built.pairs;
        }

        finalCourts = bestCourts;
        finalPairs = bestPairs;
    }

    // 結果反映
    currentMatchData.courts = finalCourts;
    currentMatchData.waiting = finalWaiting;

    recordStats(finalCourts, finalWaiting);

    matchHistory.unshift({
        waiting: finalWaiting,
        pairs: finalPairs
    });

    if (matchHistory.length > 2) matchHistory.pop();

    saveToLocalStorage();
    selectedInfo = null;
    renderMatchBoard();
}

// 抽選結果を各メンバーの参加・待機回数に反映する
function recordStats(courts, waiting) {
    courts.forEach(court => {
        SIDES.forEach(side => {
            court[side.key].forEach(name => {
                touchMember(name);
                memberStats[name].games++;
            });
        });
    });
    waiting.forEach(name => {
        touchMember(name);
        memberStats[name].waits++;
    });
}

// ==========================================
// 6. 表示・入れ替え機能
// ==========================================
function renderMatchBoard() {
    const container = document.getElementById('courtsContainer');
    const waitingListDiv = document.getElementById('waitingList');
    const waitingRoom = document.getElementById('waitingRoom');
    container.innerHTML = '';
    waitingListDiv.innerHTML = '';
    // 抽選前でもコートは常に表示し、各側に人数セレクトを置く
    for (let cIdx = 0; cIdx < courtSettings.courtCount; cIdx++) {
        const courtDiv = document.createElement('div');
        courtDiv.className = 'court-wrapper';
        courtDiv.innerHTML = `<div class="court-label">コート ${cIdx + 1}</div>`;
        SIDES.forEach((side, sIdx) => {
            if (sIdx > 0) {
                const net = document.createElement('div'); net.className = 'net-line';
                courtDiv.appendChild(net);
            }
            courtDiv.appendChild(createCourtSide(cIdx, sIdx));
        });
        container.appendChild(courtDiv);
    }
    if (currentMatchData.waiting.length > 0) {
        waitingRoom.style.display = 'block';
        currentMatchData.waiting.forEach((name, pIdx) => {
            waitingListDiv.appendChild(createPlayerButton(name, 'waiting', null, null, pIdx));
        });
    } else { waitingRoom.style.display = 'none'; }
}

// コートの片側（奥側 / 手前側）: ヘッダー（ラベル + 人数セレクト）と選手枠
function createCourtSide(courtIdx, sideIdx) {
    const side = SIDES[sideIdx];
    const wrapper = document.createElement('div');
    wrapper.className = 'court-side';

    const header = document.createElement('div');
    header.className = 'court-side-header';
    header.innerText = side.label;
    const select = document.createElement('select');
    for (let n = 0; n <= MAX_PLAYERS_PER_SIDE; n++) {
        const opt = document.createElement('option');
        opt.value = n;
        opt.innerText = `${n}人`;
        if (n === courtSettings.sides[courtIdx][sideIdx]) opt.selected = true;
        select.appendChild(opt);
    }
    select.onchange = () => onSideSizeChange(courtIdx, sideIdx, select.value);
    header.appendChild(select);

    const slot = document.createElement('div');
    slot.className = 'player-slot';
    const court = currentMatchData.courts[courtIdx];
    if (court) {
        court[side.key].forEach((name, pIdx) => {
            slot.appendChild(createPlayerButton(name, 'court', courtIdx, side.key, pIdx));
        });
    } else {
        // 抽選前は設定人数ぶんの空枠を表示
        for (let i = 0; i < courtSettings.sides[courtIdx][sideIdx]; i++) {
            const empty = document.createElement('div');
            empty.className = 'member-chip empty';
            empty.innerText = '?';
            slot.appendChild(empty);
        }
    }

    wrapper.appendChild(header);
    wrapper.appendChild(slot);
    return wrapper;
}

function isSameSlot(a, b) {
    return a.type === b.type && a.courtIdx === b.courtIdx && a.side === b.side && a.pIdx === b.pIdx;
}

function createPlayerButton(name, type, courtIdx, side, pIdx) {
    const btn = document.createElement('div');
    btn.className = 'member-chip';
    btn.innerText = name;
    const info = { type, courtIdx, side, pIdx };
    if (selectedInfo && isSameSlot(selectedInfo, info)) {
        btn.classList.add('selected');
    }
    btn.onclick = () => {
        if (!selectedInfo) {
            selectedInfo = info;
            renderMatchBoard();
        } else {
            const src = selectedInfo; const dest = info;
            if (isSameSlot(src, dest)) {
                selectedInfo = null; renderMatchBoard(); return;
            }
            let v1 = getValue(src); let v2 = getValue(dest);
            setValue(src, v2); setValue(dest, v1);
            selectedInfo = null; renderMatchBoard();
        }
    };
    return btn;
}

function getValue(info) {
    if (info.type === 'court') return currentMatchData.courts[info.courtIdx][info.side][info.pIdx];
    return currentMatchData.waiting[info.pIdx];
}
function setValue(info, val) {
    if (info.type === 'court') currentMatchData.courts[info.courtIdx][info.side][info.pIdx] = val;
    else currentMatchData.waiting[info.pIdx] = val;
}

// ==========================================
// 7. タイマー機能
// ==========================================
function toggleTimerView() {
    const section = document.getElementById('timerSection');
    section.style.display = (section.style.display === 'none') ? 'block' : 'none';
}

function updateTimerSetting() {
    const presets = document.getElementsByName('timePreset');
    const customInput = document.getElementById('customMin');
    let val;
    for (const r of presets) { if (r.checked) { val = r.value; break; } }
    if (val === 'custom') {
        customInput.style.display = 'inline-block';
        timeLeft = parseInt(customInput.value) * 60;
    } else {
        customInput.style.display = 'none';
        timeLeft = parseInt(val);
    }
    stopTimer();
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const display = document.getElementById('timerDisplay');
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    display.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function toggleTimer() {
    const btn = document.getElementById('startBtn');
    if (isRunning) {
        stopTimer();
    } else {
        isRunning = true;
        btn.innerText = "一時停止";
        btn.style.backgroundColor = "#ff5722";
        
        // ★タイマー開始時にスリープ防止をリクエスト
        requestWakeLock();

        timerInterval = setInterval(() => {
            timeLeft--;
            updateTimerDisplay();
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                isRunning = false;
                btn.innerText = "スタート";
                btn.style.backgroundColor = "#00c853";
                
                playAlarm(); 
                releaseWakeLock(); // ★終了時にスリープ防止解除
            }
        }, 1000);
    }
}

function stopTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    const btn = document.getElementById('startBtn');
    if (btn) { btn.innerText = "スタート"; btn.style.backgroundColor = "#00c853"; }
    stopAlarm(); 
    releaseWakeLock(); // ★停止時にスリープ防止解除
}

function resetTimer() {
    stopTimer();
    updateTimerSetting();
}
// ==========================================
// 8. メンバー管理パネル
// ==========================================
function isManagePanelOpen() {
    const overlay = document.getElementById('manageOverlay');
    return !!overlay && overlay.style.display === 'flex';
}

function toggleManagePanel(show) {
    const overlay = document.getElementById('manageOverlay');
    if (!overlay) return;
    overlay.style.display = show ? 'flex' : 'none';
    if (show) renderManagePanel();
}

function renderManagePanel() {
    renderPanelCurrent();
    renderPresets();
    renderArchive();
    renderStats();
}

// --- 現在のメンバー ---
function renderPanelCurrent() {
    const listDiv = document.getElementById('panelCurrentList');
    if (!listDiv) return;
    document.getElementById('panelCurrentCount').innerText = members.length;
    listDiv.innerHTML = '';
    if (members.length === 0) {
        listDiv.innerHTML = '<div class="empty-note">メンバーがいません。</div>';
        return;
    }
    members.forEach(name => {
        const chip = document.createElement('div');
        chip.className = 'member-chip';
        chip.innerText = name;
        chip.onclick = () => {
            members = members.filter(m => m !== name);
            saveToLocalStorage();
            renderMasterList();
            updateDrawButton();
        };
        listDiv.appendChild(chip);
    });
}

// --- プリセット ---
function renderPresets() {
    const listDiv = document.getElementById('presetList');
    if (!listDiv) return;
    document.getElementById('panelPresetCount').innerText = memberPresets.length;
    listDiv.innerHTML = '';
    if (memberPresets.length === 0) {
        listDiv.innerHTML = '<div class="empty-note">プリセットがありません。</div>';
        return;
    }
    memberPresets.forEach((preset, idx) => {
        const row = document.createElement('div');
        row.className = 'preset-row';

        const name = document.createElement('span');
        name.className = 'preset-name';
        name.innerText = `${preset.name}（${preset.members.length}名）`;
        row.appendChild(name);

        const actions = [
            ['適用', 'btn-apply', () => applyPreset(idx)],
            ['上書き', 'btn-add', () => overwritePreset(idx)],
            ['削除', 'btn-danger', () => deletePreset(idx)]
        ];
        actions.forEach(([label, cls, handler]) => {
            const btn = document.createElement('button');
            btn.className = cls;
            btn.innerText = label;
            btn.onclick = handler;
            row.appendChild(btn);
        });
        listDiv.appendChild(row);
    });
}

function savePreset() {
    const input = document.getElementById('presetNameInput');
    const name = input.value.trim();
    if (!name) { alert("プリセット名を入力してください。"); return; }
    if (members.length === 0) { alert("保存するメンバーがいません。"); return; }
    const existing = memberPresets.findIndex(p => p.name === name);
    if (existing >= 0) {
        if (!confirm(`「${name}」は既にあります。上書きしますか？`)) return;
        memberPresets[existing].members = [...members];
    } else {
        memberPresets.push({ name, members: [...members] });
    }
    input.value = '';
    saveToLocalStorage();
    renderPresets();
}

function applyPreset(idx) {
    const preset = memberPresets[idx];
    if (!confirm(`「${preset.name}」を今日のメンバーに適用しますか？\n(試合履歴もリセットされます)`)) return;
    members = [...preset.members];
    members.forEach(touchMember);
    matchHistory = [];
    saveToLocalStorage();
    renderMasterList();
    updateDrawButton();
}

function overwritePreset(idx) {
    const preset = memberPresets[idx];
    if (members.length === 0) { alert("保存するメンバーがいません。"); return; }
    if (!confirm(`「${preset.name}」を現在の${members.length}名で上書きしますか？`)) return;
    preset.members = [...members];
    saveToLocalStorage();
    renderPresets();
}

function deletePreset(idx) {
    if (!confirm(`「${memberPresets[idx].name}」を削除しますか？`)) return;
    memberPresets.splice(idx, 1);
    saveToLocalStorage();
    renderPresets();
}

// --- CSV一括登録 ---
// カンマ・改行・タブ区切りの名前を取り出す（引用符とヘッダー行は除去）
function parseNames(text) {
    const headers = ['名前', 'なまえ', 'name', 'メンバー', 'member'];
    const seen = new Set();
    const names = [];
    text.split(/[\n,\t]/).forEach(raw => {
        const name = raw.trim().replace(/^["']|["']$/g, '').trim();
        if (!name || seen.has(name)) return;
        if (headers.includes(name.toLowerCase())) return;
        seen.add(name);
        names.push(name);
    });
    return names;
}

function importMembersFromText() {
    const textarea = document.getElementById('csvInput');
    applyCsvNames(parseNames(textarea.value), () => { textarea.value = ''; });
}

function importMembersFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyCsvNames(parseNames(reader.result));
    reader.readAsText(file);
    event.target.value = '';
}

function applyCsvNames(names, onSuccess) {
    const result = document.getElementById('csvResult');
    if (names.length === 0) {
        result.innerText = '読み取れる名前がありませんでした。';
        return;
    }
    const { added, skipped } = addMembers(names);
    result.innerText = `${added}名を追加しました。` + (skipped > 0 ? `（${skipped}名は登録済みのためスキップ）` : '');
    if (onSuccess) onSuccess();
}

// --- これまでに使ったメンバー ---
function renderArchive() {
    const listDiv = document.getElementById('archiveList');
    if (!listDiv) return;
    const archived = Object.keys(memberStats).filter(name => !members.includes(name)).sort();
    document.getElementById('panelArchiveCount').innerText = Object.keys(memberStats).length;
    listDiv.innerHTML = '';
    if (archived.length === 0) {
        listDiv.innerHTML = '<div class="empty-note">今日のメンバー以外に記録はありません。</div>';
        return;
    }
    archived.forEach(name => {
        const chip = document.createElement('div');
        chip.className = 'member-chip archive-chip';

        const label = document.createElement('span');
        label.innerText = name;
        label.onclick = () => addMembers([name]);
        chip.appendChild(label);

        const remove = document.createElement('button');
        remove.className = 'chip-remove';
        remove.innerText = '✕';
        remove.onclick = () => {
            if (!confirm(`${name} を履歴から削除しますか？`)) return;
            delete memberStats[name];
            saveToLocalStorage();
            renderManagePanel();
        };
        chip.appendChild(remove);
        listDiv.appendChild(chip);
    });
}

function clearArchive() {
    if (!confirm("今日のメンバー以外を履歴から削除しますか？\n(その人たちの参加・待機回数も消えます)")) return;
    Object.keys(memberStats).forEach(name => {
        if (!members.includes(name)) delete memberStats[name];
    });
    saveToLocalStorage();
    renderManagePanel();
}

// --- 参加・待機回数 ---
function renderStats() {
    const container = document.getElementById('statsTable');
    if (!container) return;
    const rows = Object.entries(memberStats)
        .filter(([, st]) => st.games > 0 || st.waits > 0)
        .sort((a, b) => (b[1].games - a[1].games) || a[0].localeCompare(b[0], 'ja'));
    if (rows.length === 0) {
        container.innerHTML = '<div class="empty-note">まだ記録がありません。</div>';
        return;
    }
    const table = document.createElement('table');
    table.className = 'stats-table';
    table.innerHTML = '<tr><th>名前</th><th>試合</th><th>待機</th></tr>';
    rows.forEach(([name, st]) => {
        const tr = document.createElement('tr');
        [name, st.games, st.waits].forEach(v => {
            const td = document.createElement('td');
            td.innerText = v;
            tr.appendChild(td);
        });
        table.appendChild(tr);
    });
    container.innerHTML = '';
    container.appendChild(table);
}

function resetStats() {
    if (!confirm("全員の参加・待機回数を0に戻しますか？\n(メンバーと履歴メンバーは残ります)")) return;
    Object.keys(memberStats).forEach(name => { memberStats[name] = { games: 0, waits: 0 }; });
    saveToLocalStorage();
    renderManagePanel();
}

// --- データ管理（バックアップ／復元） ---
function exportData() {
    const data = {
        app: 'badminton-teamizer',
        version: 1,
        exportedAt: new Date().toISOString(),
        members,
        memberPresets,
        memberStats,
        courtSettings,
        matchHistory
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `teamizer-backup-${date}.json`;
    // Firefox はDOMに挿入しないとクリックが効かず、
    // iOS Safari は即座にrevokeすると保存に失敗することがある
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        let data;
        try {
            data = JSON.parse(reader.result);
        } catch (e) {
            alert("ファイルを読み込めませんでした。");
            return;
        }
        if (!data || data.app !== 'badminton-teamizer') {
            alert("このアプリのバックアップファイルではないようです。");
            return;
        }
        if (!confirm("現在のデータをバックアップの内容で置き換えますか？")) return;
        members = Array.isArray(data.members) ? data.members : [];
        memberPresets = Array.isArray(data.memberPresets) ? data.memberPresets : [];
        memberStats = (data.memberStats && typeof data.memberStats === 'object') ? data.memberStats : {};
        if (data.courtSettings && Array.isArray(data.courtSettings.sides)) courtSettings = data.courtSettings;
        matchHistory = Array.isArray(data.matchHistory) ? data.matchHistory : [];
        currentMatchData = { courts: [], waiting: [] };
        members.forEach(touchMember);
        saveToLocalStorage();
        initCourtSettings();
        renderMasterList();
        updateDrawButton();
        renderManagePanel();
        alert("バックアップを読み込みました。");
    };
    reader.readAsText(file);
    event.target.value = '';
}
