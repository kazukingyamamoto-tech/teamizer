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

let currentMatchData = { courts: [], waiting: [] };
let selectedInfo = null;

let timerInterval = null;
let timeLeft = 60;
let isRunning = false;

// ★追加：スリープ防止用変数
let wakeLock = null;

const alarmAudio = new Audio('alarm.mp3'); 

window.onload = () => {
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
        input.value = '';
        saveToLocalStorage();
        renderMasterList();
        updateDrawButton();
    }
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
}

function registerBaseMembers() {
    if (members.length === 0) { alert("登録するメンバーがいません。"); return; }
    if (confirm("現在のメンバーを登録しますか？")) {
        localStorage.setItem('badmintonBaseMembers', JSON.stringify(members));
        alert(members.length + "名を登録しました！");
    }
}

function applyBaseMembers() {
    const baseData = localStorage.getItem('badmintonBaseMembers');
    if (!baseData) { alert("登録がありません。"); return; }
    if (confirm("登録したメンバーを適用しますか？\n(履歴もリセットされます)")) {
        members = JSON.parse(baseData);
        matchHistory = []; 
        saveToLocalStorage();
        renderMasterList();
        updateDrawButton();
    }
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

    matchHistory.unshift({
        waiting: finalWaiting,
        pairs: finalPairs
    });

    if (matchHistory.length > 2) matchHistory.pop();

    saveToLocalStorage();
    selectedInfo = null;
    renderMatchBoard();
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