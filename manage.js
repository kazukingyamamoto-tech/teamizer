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
    const sortDiv = document.getElementById('archiveSort');
    sortDiv.innerHTML = '';
    sortDiv.appendChild(createSortControl());
    const archived = getArchivedMembers();
    document.getElementById('archiveCount').innerText = Object.keys(memberStats).length;
    listDiv.innerHTML = '';
    if (archived.length === 0) {
        listDiv.innerHTML = '<div class="empty-note">今日のメンバー以外に記録はありません。</div>';
        return;
    }
    archived.forEach(name => {
        const chip = createMemberChip(name, 'archive-chip');
        chip.onclick = () => addMembers([name]);

        const remove = document.createElement('button');
        remove.className = 'chip-remove';
        remove.innerText = '✕';
        remove.onclick = (e) => {
            e.stopPropagation();   // チップ側の「追加」を起こさない
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
