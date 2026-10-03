// ==========================================
// メンバー設定ページ (manage.html)
//   CSV一括登録 / これまでに使ったメンバー / 参加・待機回数 / データ管理
//   データの読み書きは data.js に任せる
// ==========================================

window.onload = () => {
    migrateLegacyData();
    renderManagePage();
};

// データ変更時にこのページを描き直す（data.js から呼ばれる）
function onAppDataChanged() {
    renderManagePage();
}

function renderManagePage() {
    const count = document.getElementById('currentMemberCount');
    if (count) count.innerText = members.length;
    renderArchive();
    renderStats();
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
    const archived = getArchivedMembers();
    document.getElementById('archiveCount').innerText = Object.keys(memberStats).length;
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
            renderManagePage();
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
    renderManagePage();
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
    renderManagePage();
}
