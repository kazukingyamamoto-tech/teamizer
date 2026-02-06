// ==========================================
// 1. 変数定義と初期化
// ==========================================
let members = JSON.parse(localStorage.getItem('badmintonMembers')) || [];
let currentMatchData = { courts: [], waiting: [] };
let selectedInfo = null;

let timerInterval = null;
let timeLeft = 60;
let isRunning = false;

// 音声ファイルの読み込み（ファイル名を合わせてください）
const alarmAudio = new Audio('alarm.mp3'); 

window.onload = () => {
    renderMasterList();
    updateTimerDisplay();
    updateDrawButton();
};

// ==========================================
// 2. 音声再生機能
// ==========================================
function playAlarm() {
    alarmAudio.currentTime = 0; // 再生位置を先頭に戻す
    alarmAudio.play().catch(e => console.log("オーディオ再生に失敗しました:", e));

    // 10秒後に停止させる
    setTimeout(() => {
        stopAlarm();
    }, 10000); 
}

function stopAlarm() {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
}

// ==========================================
// 3. メンバー管理・ボタン人数更新
// ==========================================
function saveToLocalStorage() {
    localStorage.setItem('badmintonMembers', JSON.stringify(members));
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
    if (confirm("登録したメンバーを適用しますか？")) {
        members = JSON.parse(baseData);
        saveToLocalStorage();
        renderMasterList();
        updateDrawButton();
    }
}

// ==========================================
// 4. 組み合わせ抽選・入れ替え
// ==========================================
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function drawMatches() {
    const courtCount = parseInt(document.querySelector('input[name="courtCount"]:checked').value);
    if (members.length < 4) { alert("4人以上必要です。"); return; }
    document.getElementById('instruction').style.display = 'block';
    let shuffled = shuffle([...members]);
    currentMatchData.courts = [];
    for (let i = 0; i < courtCount; i++) {
        if (shuffled.length >= 4) { currentMatchData.courts.push(shuffled.splice(0, 4)); }
    }
    currentMatchData.waiting = shuffled;
    selectedInfo = null;
    renderMatchBoard();
}

function renderMatchBoard() {
    const container = document.getElementById('courtsContainer');
    const waitingListDiv = document.getElementById('waitingList');
    const waitingRoom = document.getElementById('waitingRoom');
    container.innerHTML = '';
    waitingListDiv.innerHTML = '';
    currentMatchData.courts.forEach((p, cIdx) => {
        const courtDiv = document.createElement('div');
        courtDiv.className = 'court-wrapper';
        courtDiv.innerHTML = `<div class="court-label">コート ${cIdx + 1}</div>`;
        const t1 = document.createElement('div'); t1.className = 'player-slot';
        t1.appendChild(createPlayerButton(p[0], 'court', cIdx, 0));
        t1.appendChild(createPlayerButton(p[1], 'court', cIdx, 1));
        const net = document.createElement('div'); net.className = 'net-line';
        const t2 = document.createElement('div'); t2.className = 'player-slot';
        t2.appendChild(createPlayerButton(p[2], 'court', cIdx, 2));
        t2.appendChild(createPlayerButton(p[3], 'court', cIdx, 3));
        courtDiv.appendChild(t1); courtDiv.appendChild(net); courtDiv.appendChild(t2);
        container.appendChild(courtDiv);
    });
    if (currentMatchData.waiting.length > 0) {
        waitingRoom.style.display = 'block';
        currentMatchData.waiting.forEach((name, pIdx) => {
            waitingListDiv.appendChild(createPlayerButton(name, 'waiting', null, pIdx));
        });
    } else { waitingRoom.style.display = 'none'; }
}

function createPlayerButton(name, type, courtIdx, pIdx) {
    const btn = document.createElement('div');
    btn.className = 'member-chip';
    btn.innerText = name;
    if (selectedInfo && selectedInfo.type === type && selectedInfo.courtIdx === courtIdx && selectedInfo.pIdx === pIdx) {
        btn.classList.add('selected');
    }
    btn.onclick = () => {
        if (!selectedInfo) {
            selectedInfo = { type, courtIdx, pIdx };
            renderMatchBoard();
        } else {
            const src = selectedInfo; const dest = { type, courtIdx, pIdx };
            if (src.type === dest.type && src.courtIdx === dest.courtIdx && src.pIdx === dest.pIdx) {
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
    if (info.type === 'court') return currentMatchData.courts[info.courtIdx][info.pIdx];
    return currentMatchData.waiting[info.pIdx];
}
function setValue(info, val) {
    if (info.type === 'court') currentMatchData.courts[info.courtIdx][info.pIdx] = val;
    else currentMatchData.waiting[info.pIdx] = val;
}

// ==========================================
// 5. タイマー機能
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
        timerInterval = setInterval(() => {
            timeLeft--;
            updateTimerDisplay();
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                isRunning = false;
                btn.innerText = "スタート";
                btn.style.backgroundColor = "#00c853";
                
                playAlarm(); // ここで音声を再生
            }
        }, 1000);
    }
}

function stopTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    const btn = document.getElementById('startBtn');
    if (btn) { btn.innerText = "スタート"; btn.style.backgroundColor = "#00c853"; }
    stopAlarm(); // タイマー停止時に音も止める
}

function resetTimer() {
    stopTimer();
    updateTimerSetting();
}