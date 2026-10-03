// ==========================================
// 共有データ層
//   ページ間で共通のデータと、その保存・読み込みを担当する。
//   index.html と manage.html の両方から読み込まれる。
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

// データが変わったことを現在のページに知らせる
// （各ページが onAppDataChanged() を定義する）
function notifyDataChanged() {
    if (typeof onAppDataChanged === 'function') onAppDataChanged();
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
    notifyDataChanged();
    return { added, skipped: names.length - added };
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
        notifyDataChanged();
        alert("バックアップを読み込みました。");
    };
    reader.readAsText(file);
    event.target.value = '';
}
