// ==========================================
// 1. 変数定義と初期化
// ==========================================
let members = JSON.parse(localStorage.getItem('badmintonMembers')) || [];
let matchHistory = JSON.parse(localStorage.getItem('badmintonMatchHistory')) || [];

let currentMatchData = { courts: [], waiting: [] };
let selectedInfo = null;

let timerInterval = null;
let timeLeft = 60;
let isRunning = false;

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
    alarmAudio.currentTime = 0;
    alarmAudio.play().catch(e => console.log("再生失敗:", e));
    setTimeout(() => stopAlarm(), 10000); 
}

function stopAlarm() {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
}

// ==========================================
// 3. メンバー管理・データ保存
// ==========================================
function saveToLocalStorage() {
    localStorage.setItem('badmintonMembers', JSON.stringify(members));
    localStorage.setItem('badmintonMatchHistory', JSON.stringify(matchHistory));
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
// 4. 組み合わせ抽選（★ここを修正）
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

function drawMatches() {
    const courtCount = parseInt(document.querySelector('input[name="courtCount"]:checked').value);
    const mode = document.querySelector('input[name="drawMode"]:checked').value;
    const playersNeeded = courtCount * 4;

    if (members.length < 4) {
        alert("メンバーが4人以上必要です。");
        return;
    }
    document.getElementById('instruction').style.display = 'block';

    let finalCourts = [];
    let finalWaiting = [];
    let finalPairs = [];

    // ============================
    // A. 通常モード (完全ランダム)
    // ============================
    if (mode === 'normal') {
        let shuffled = shuffle([...members]);
        if (members.length > playersNeeded) {
            finalWaiting = shuffled.slice(playersNeeded);
        }
        let playing = shuffled.slice(0, playersNeeded);
        
        for (let i = 0; i < playing.length; i += 4) {
            if (i + 3 < playing.length) {
                let p = playing.slice(i, i + 4);
                finalCourts.push(p);
                finalPairs.push([p[0], p[1]]);
                finalPairs.push([p[2], p[3]]);
            }
        }
    } 
    // ============================
    // B. スマートモード (重み付け抽選)
    // ============================
    else {
        // --- Step 1: 待機メンバーの決定 (優先度付き) ---
        let numWaiting = Math.max(0, members.length - playersNeeded);
        
        if (numWaiting > 0) {
            // 履歴から「最近待機した人」を取得
            // matchHistory[0] が直前、matchHistory[1] が2回前
            let lastWaiters = []; // 直前に休んだ人（絶対休ませたくない）
            let prevWaiters = []; // 2回前に休んだ人（できれば休ませたくない）

            if (matchHistory.length > 0) {
                lastWaiters = matchHistory[0].waiting;
            }
            if (matchHistory.length > 1) {
                prevWaiters = matchHistory[1].waiting;
            }

            // グループ分け
            let groupA = []; // 優先度高：履歴なし（休んでいない）
            let groupB = []; // 優先度中：2回前に休んだ
            let groupC = []; // 優先度低：直前に休んだ

            members.forEach(m => {
                if (lastWaiters.includes(m)) {
                    groupC.push(m);
                } else if (prevWaiters.includes(m)) {
                    groupB.push(m);
                } else {
                    groupA.push(m);
                }
            });

            // 各グループ内でシャッフル
            groupA = shuffle(groupA);
            groupB = shuffle(groupB);
            groupC = shuffle(groupC);

            // 結合順：A -> B -> C
            // これにより「休んでいない人」が枯渇しない限り、休んだ人は選ばれない
            let candidates = [...groupA, ...groupB, ...groupC];

            // 上から必要な人数だけ取る
            finalWaiting = candidates.slice(0, numWaiting);
        }

        // --- Step 2: ペアの決定 (残りのメンバーでシャッフル) ---
        // 待機以外のメンバー
        let playingMembers = members.filter(m => !finalWaiting.includes(m));
        
        let bestPairs = [];
        let bestCourts = [];
        let success = false;

        for (let attempt = 0; attempt < 500; attempt++) {
            let shuffled = shuffle([...playingMembers]);
            let tempPairs = [];
            let tempCourts = [];
            let isPairDuplicate = false;

            for (let i = 0; i < shuffled.length; i += 4) {
                if (i + 3 >= shuffled.length) break;
                
                let p = shuffled.slice(i, i + 4);
                let pair1 = [p[0], p[1]];
                let pair2 = [p[2], p[3]];
                
                tempPairs.push(pair1, pair2);
                tempCourts.push(p);

                // 履歴チェック
                for (let h of matchHistory) {
                    for (let oldPair of h.pairs) {
                        if (isSamePair(pair1, oldPair) || isSamePair(pair2, oldPair)) {
                            isPairDuplicate = true; break;
                        }
                    }
                    if (isPairDuplicate) break;
                }
                if (isPairDuplicate) break;
            }

            if (!isPairDuplicate) {
                success = true;
                bestPairs = tempPairs;
                bestCourts = tempCourts;
                break; 
            }
        }

        // 500回失敗時のフォールバック（待機メンバーはStep1の結果を維持）
        if (!success) {
            console.log("ペア生成失敗。待機優先でランダムペアを作成します。");
            let shuffled = shuffle([...playingMembers]);
            bestCourts = [];
            bestPairs = [];
            for (let i = 0; i < shuffled.length; i += 4) {
                if (i + 3 < shuffled.length) {
                    let p = shuffled.slice(i, i + 4);
                    bestCourts.push(p);
                    bestPairs.push([p[0], p[1]]);
                    bestPairs.push([p[2], p[3]]);
                }
            }
        }

        finalCourts = bestCourts;
        finalPairs = bestPairs;
    }

    // ============================
    // 結果反映 & 履歴保存
    // ============================
    currentMatchData.courts = finalCourts;
    currentMatchData.waiting = finalWaiting;

    matchHistory.unshift({
        waiting: finalWaiting,
        pairs: finalPairs
    });

    if (matchHistory.length > 2) {
        matchHistory.pop();
    }

    saveToLocalStorage();

    selectedInfo = null;
    renderMatchBoard();
}

// ==========================================
// 5. 以下、変更なしの機能
// ==========================================
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
                playAlarm(); 
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
}

function resetTimer() {
    stopTimer();
    updateTimerSetting();
}