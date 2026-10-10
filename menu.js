// ==========================================
// 練習メニューの抽選
//   メニューは Swings アプリで登録・編集し、ここでは公開一覧を読むだけ。
//   電波がなくても使えるよう、最後に読み込んだ一覧を端末に保存しておく。
// ==========================================

// 開発中は ?menusUrl=... で読み込み先を差し替えられる
const MENUS_URL = new URLSearchParams(location.search).get('menusUrl')
    || 'https://asia-northeast1-swingsgoodminton.cloudfunctions.net/publicMenus';
const SWINGS_MENU_URL = 'https://miniapp.line.me/2011916354-7IBwxZu9/menus/';
const MENU_CACHE_KEY = 'badmintonMenusCache';
const MENU_STATE_KEY = 'badmintonMenuState';

let menus = [];
let menusFetchedAt = 0;
// mode: 'theme' | 'next'、scope: 'all' | 'court'
// current: 全体モードの今のメニュー、courtCurrent: コートごとの今のメニュー
// drawn: 今日出たメニュー（date が変わったら空にする）
let menuState = loadMenuState();
let selectedThemes = new Set();

function loadMenuState() {
    const fallback = { mode: 'theme', scope: 'all', current: null, courtCurrent: [], drawn: { date: '', ids: [] } };
    try {
        return { ...fallback, ...JSON.parse(localStorage.getItem(MENU_STATE_KEY)) };
    } catch {
        return fallback;
    }
}

function saveMenuState() {
    localStorage.setItem(MENU_STATE_KEY, JSON.stringify(menuState));
}

function todayKey() {
    return new Date().toLocaleDateString('sv-SE');
}

function drawnToday() {
    if (menuState.drawn.date !== todayKey()) menuState.drawn = { date: todayKey(), ids: [] };
    return menuState.drawn.ids;
}

// --- 読み込み ---
async function loadMenus() {
    try {
        const cached = JSON.parse(localStorage.getItem(MENU_CACHE_KEY));
        if (cached) { menus = cached.menus; menusFetchedAt = cached.fetchedAt; }
    } catch { /* 保存がなければ取りに行く */ }
    renderMenuSection();

    try {
        const res = await fetch(MENUS_URL);
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        menus = data.menus;
        menusFetchedAt = Date.now();
        localStorage.setItem(MENU_CACHE_KEY, JSON.stringify({ menus, fetchedAt: menusFetchedAt }));
    } catch (e) {
        console.log('メニューの読み込みに失敗（保存済みの一覧を使います）:', e);
    }
    renderMenuSection();
}

function toggleMenuView() {
    const section = document.getElementById('menuSection');
    const show = section.style.display === 'none';
    section.style.display = show ? 'block' : 'none';
    if (show) loadMenus();
}

// --- 抽選 ---
function menuById(id) {
    return menus.find(m => m.id === id) || null;
}

// コートの人数（奥側 + 手前側）
function courtPlayerCounts() {
    return getCourtSizes().map(([far, near]) => far + near);
}

// コートの人数以下で始められるメニューなら出す（4人のコートで2人用のメニューを2組でやる、など）
function fitsPlayers(menu, counts) {
    return counts.every(n => menu.players.some(p => p <= n));
}

function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

// 1つのメニューを選ぶ。選べなければ { error } を返す
function pickMenu(base, counts, exclude) {
    const done = drawnToday();
    let pool;
    if (menuState.mode === 'next') {
        if (!base) return { error: '最初の1つは「テーマで選ぶ」で選んでください。' };
        pool = base.nextMenuIds.map(menuById).filter(Boolean);
        if (pool.length === 0) return { error: `「${base.name}」には次のメニューが登録されていません。`, suggestTheme: true };
    } else {
        pool = selectedThemes.size === 0 ? menus : menus.filter(m => m.themes.some(t => selectedThemes.has(t)));
    }
    pool = pool.filter(m => fitsPlayers(m, counts));
    if (pool.length === 0) return { error: `${counts.join('・')}人のコートでできるメニューがありません。`, suggestTheme: menuState.mode === 'next' };
    const fresh = pool.filter(m => !done.includes(m.id) && !exclude.includes(m.id));
    if (fresh.length === 0) return { error: '条件に合うメニューは今日すべて出ました。「今日の記録をリセット」で最初からにできます。', suggestTheme: menuState.mode === 'next' };
    return { menu: pickRandom(fresh) };
}

function drawMenu() {
    const counts = courtPlayerCounts();
    const results = [];
    if (menuState.scope === 'all') {
        const r = pickMenu(menuById(menuState.current), [...new Set(counts)], []);
        results.push({ label: '全体', ...r });
        if (r.menu) menuState.current = r.menu.id;
    } else {
        const picked = [];
        counts.forEach((n, i) => {
            // ほかのコートと同じメニューはなるべく避ける
            let r = pickMenu(menuById(menuState.courtCurrent[i]), [n], picked);
            if (!r.menu) r = pickMenu(menuById(menuState.courtCurrent[i]), [n], []);
            results.push({ label: `コート${i + 1}`, ...r });
            if (r.menu) { menuState.courtCurrent[i] = r.menu.id; picked.push(r.menu.id); }
        });
    }
    results.forEach(r => { if (r.menu && !drawnToday().includes(r.menu.id)) drawnToday().push(r.menu.id); });
    saveMenuState();
    renderMenuSection();
    renderMenuResults(results);
}

function resetDrawnMenus() {
    menuState.drawn = { date: todayKey(), ids: [] };
    menuState.current = null;
    menuState.courtCurrent = [];
    saveMenuState();
    document.getElementById('menuResults').innerHTML = '';
    renderMenuSection();
}

function setMenuMode(mode) { menuState.mode = mode; saveMenuState(); renderMenuSection(); }
function setMenuScope(scope) { menuState.scope = scope; saveMenuState(); renderMenuSection(); }

function toggleTheme(theme) {
    if (selectedThemes.has(theme)) selectedThemes.delete(theme); else selectedThemes.add(theme);
    renderMenuSection();
}

// メニューの目安時間をタイマーにセットする
function setTimerFromMenu(minutes) {
    document.querySelector('input[name="timePreset"][value="custom"]').checked = true;
    document.getElementById('customMin').value = minutes;
    updateTimerSetting();
    document.getElementById('timerSection').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- 表示 ---
function renderMenuSection() {
    const section = document.getElementById('menuSection');
    if (!section) return;
    document.querySelectorAll('input[name="menuMode"]').forEach(r => { r.checked = r.value === menuState.mode; });
    document.querySelectorAll('input[name="menuScope"]').forEach(r => { r.checked = r.value === menuState.scope; });

    const themeBox = document.getElementById('menuThemes');
    themeBox.style.display = menuState.mode === 'theme' ? 'flex' : 'none';
    themeBox.innerHTML = '';
    const themes = [...new Set(menus.flatMap(m => m.themes))];
    themes.forEach(t => {
        const chip = document.createElement('button');
        chip.className = 'theme-chip' + (selectedThemes.has(t) ? ' on' : '');
        chip.innerText = t;
        chip.onclick = () => toggleTheme(t);
        themeBox.appendChild(chip);
    });

    const base = menuState.scope === 'all' ? menuById(menuState.current) : null;
    document.getElementById('menuNextHint').innerText =
        menuState.mode === 'next'
            ? (menuState.scope === 'all'
                ? (base ? `「${base.name}」の次のメニューから選びます` : '今のメニューがありません。最初は「テーマで選ぶ」で選んでください')
                : 'コートごとに、今のメニューの次のメニューから選びます')
            : (selectedThemes.size === 0 ? 'テーマを選ばないと、すべてのメニューから選びます' : 'どれかのテーマを含むメニューから選びます');

    const status = document.getElementById('menuStatus');
    status.innerText = menus.length === 0
        ? 'メニューを読み込めませんでした。電波のある場所で開き直してください。'
        : `${menus.length}件のメニュー・今日出たメニュー ${drawnToday().length}件` +
          (menusFetchedAt ? `（${new Date(menusFetchedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 取得）` : '');
}

function renderMenuResults(results) {
    const box = document.getElementById('menuResults');
    box.innerHTML = '';
    results.forEach(r => {
        const card = document.createElement('div');
        card.className = 'menu-card';
        const label = document.createElement('div');
        label.className = 'menu-card-label';
        label.innerText = r.label;
        card.appendChild(label);

        if (!r.menu) {
            const err = document.createElement('p');
            err.className = 'menu-error';
            err.innerText = r.error;
            card.appendChild(err);
            if (r.suggestTheme) {
                const btn = document.createElement('button');
                btn.className = 'btn-quick';
                btn.innerText = 'テーマで選ぶに切り替える';
                btn.onclick = () => { setMenuMode('theme'); drawMenu(); };
                card.appendChild(btn);
            }
            box.appendChild(card);
            return;
        }
        card.appendChild(menuCardBody(r.menu));
        box.appendChild(card);
    });
}

function menuCardBody(m) {
    const body = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'menu-name';
    title.innerText = m.name;
    body.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'menu-meta';
    meta.innerText = `${m.players.join('・')}人 / 目安${m.minutes}分` + (m.themes.length ? ` / ${m.themes.join('・')}` : '');
    body.appendChild(meta);

    if (m.summary) {
        const summary = document.createElement('p');
        summary.className = 'menu-summary';
        summary.innerText = m.summary;
        body.appendChild(summary);
    }

    m.notes.forEach(n => body.appendChild(noteElement(n)));

    const actions = document.createElement('div');
    actions.className = 'menu-actions';
    const timerBtn = document.createElement('button');
    timerBtn.className = 'btn-quick';
    timerBtn.innerText = `⏰ ${m.minutes}分をタイマーにセット`;
    timerBtn.onclick = () => setTimerFromMenu(m.minutes);
    actions.appendChild(timerBtn);
    const edit = document.createElement('a');
    edit.className = 'menu-link';
    edit.href = SWINGS_MENU_URL + encodeURIComponent(m.id);
    edit.target = '_blank';
    edit.rel = 'noopener';
    edit.innerText = 'Swingsで説明を見る・書き足す';
    actions.appendChild(edit);
    body.appendChild(actions);
    return body;
}

function noteElement(n) {
    if (n.type === 'text') {
        const p = document.createElement('p');
        p.className = 'menu-note';
        p.innerText = n.text;
        return p;
    }
    if (n.type === 'youtube') {
        const yt = parseYouTube(n.text);
        if (yt) return videoPlaceholder(
            `https://i.ytimg.com/vi/${yt.id}/hqdefault.jpg`,
            `https://www.youtube-nocookie.com/embed/${yt.id}?autoplay=1&playsinline=1&rel=0` + (yt.start ? `&start=${yt.start}` : ''),
            'video-frame',
        );
    }
    if (n.type === 'instagram') {
        const code = parseInstagram(n.text);
        if (code) return videoPlaceholder(null, `https://www.instagram.com/${code.kind}/${code.id}/embed`, 'instagram-frame', '▶ Instagramのリールを見る');
    }
    const a = document.createElement('a');
    a.href = n.text;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'menu-note-link ' + n.type;
    a.innerText = n.text;
    return a;
}

// タップするまではサムネイル（またはボタン）だけを出し、タップでその場にプレーヤーを埋め込む
function videoPlaceholder(thumbnail, embedUrl, frameClass, label) {
    const box = document.createElement('div');
    box.className = 'menu-video';
    const btn = document.createElement('button');
    btn.className = thumbnail ? 'video-thumb' : 'btn-quick video-open';
    if (thumbnail) {
        const img = document.createElement('img');
        img.src = thumbnail;
        img.loading = 'lazy';
        img.alt = '';
        btn.appendChild(img);
        const play = document.createElement('span');
        play.className = 'video-play';
        play.innerText = '▶';
        btn.appendChild(play);
    } else {
        btn.innerText = label;
    }
    btn.onclick = () => {
        const frame = document.createElement('iframe');
        frame.src = embedUrl;
        frame.className = frameClass;
        frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        frame.allowFullscreen = true;
        box.replaceChildren(frame);
    };
    box.appendChild(btn);
    return box;
}

// YouTube の URL から動画IDと開始秒を取り出す（youtu.be / watch / shorts / live / embed、t=90 や t=1m30s）
function parseYouTube(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.split('/')[1];
    else if (host === 'youtube.com') {
        id = u.pathname === '/watch' ? u.searchParams.get('v') : (u.pathname.match(/^\/(shorts|live|embed)\/([^/?#]+)/) || [])[2];
    }
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    const t = u.searchParams.get('t') || u.searchParams.get('start') || '';
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    const start = m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
    return { id, start };
}

// Instagram の URL からリール / 投稿のコードを取り出す
function parseInstagram(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    const m = u.pathname.match(/^\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    if (!m) return null;
    return { kind: m[1] === 'reels' ? 'reel' : m[1], id: m[2] };
}
