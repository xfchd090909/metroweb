// ===================== 全局状态 =====================
let activeTile = null;           // 当前打开的全屏磁贴
let activeMiniTile = null;       // 当前打开的mini磁贴（用于回缩动画）
let isAnimating = false;
let animationTimer = null;
let tileData = [];               // 从config.json加载的磁贴数据
let currentTheme = 'dark';       // 'dark' 或 'light'

// DOM 引用
const tileGrid = document.getElementById('tileGrid');
const searchInput = document.getElementById('searchInput');
const themeToggle = document.getElementById('themeToggle');
const illusionWrapper = document.getElementById('illusion-wrapper');
const illusionCard = document.getElementById('illusion-card');
const illusionFront = document.getElementById('illusion-front');
const illusionBack = document.getElementById('illusion-back');
const appLayer = document.getElementById('app-layer');
const appTitle = document.getElementById('appTitle');
const appIcon = document.getElementById('appIcon');
const appBody = document.getElementById('appBody');
const closeBtn = document.getElementById('closeBtn');
const miniWrapper = document.getElementById('mini-wrapper');
const miniCloseBtn = document.getElementById('miniCloseBtn');
const miniTitle = document.getElementById('miniTitle');
const miniUrlDisplay = document.getElementById('miniUrlDisplay');
const miniCopyBtn = document.getElementById('miniCopyBtn');
const miniExpandBtn = document.getElementById('miniExpandBtn');
const miniFullUrl = document.getElementById('miniFullUrl');
const miniVisitBtn = document.getElementById('miniVisitBtn');
const miniSecurityInfo = document.getElementById('miniSecurityInfo');

// ===================== 工具函数 =====================
const TRANSITION_STYLE = 'top 0.65s cubic-bezier(0.16, 1, 0.3, 1), left 0.65s cubic-bezier(0.16, 1, 0.3, 1), width 0.65s cubic-bezier(0.16, 1, 0.3, 1), height 0.65s cubic-bezier(0.16, 1, 0.3, 1), transform 0.65s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.65s cubic-bezier(0.16, 1, 0.3, 1)';
const TRANSITION_DURATION = 650;

function getTileRect(tile) {
    const origTransform = tile.style.transform;
    const origTransition = tile.style.transition;
    tile.style.transform = 'none';
    tile.style.transition = 'none';
    const rect = tile.getBoundingClientRect();
    tile.style.transform = origTransform;
    tile.style.transition = origTransition;
    return rect;
}

function showError(msg) {
    console.error('[Metro UI]', msg);
}

// ===================== 分辨率自适应 =====================
function adjustRootSize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // 以 1920x1080 为基准，按比例缩放，但限制范围
    const base = Math.min(w / 1920, h / 1080) * 16; // 基准字号16px
    const clamped = Math.min(Math.max(base, 10), 24);
    document.documentElement.style.fontSize = clamped + 'px';
}
window.addEventListener('resize', adjustRootSize);
window.addEventListener('load', adjustRootSize);

// ===================== 主题切换 =====================
function setTheme(theme) {
    currentTheme = theme;
    if (theme === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
        document.body.classList.remove('light-mode');
        themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
}
themeToggle.addEventListener('click', () => {
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
});
// 默认深色
setTheme('dark');

// ===================== 时钟 =====================
function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    const days = ['周日','周一','周二','周三','周四','周五','周六'];
    document.getElementById('clockTime').textContent = `${h}:${m}`;
    document.getElementById('clockDate').textContent = `${months[now.getMonth()]}${now.getDate()}日 ${days[now.getDay()]}`;
}
updateClock();
setInterval(updateClock, 1000);

// ===================== 加载配置 =====================
async function loadConfig() {
    try {
        const resp = await fetch('./config.json');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!Array.isArray(data)) throw new Error('config.json 根必须为数组');
        return data;
    } catch (e) {
        showError(`无法加载 config.json: ${e.message}`);
        return [];
    }
}

// 校验单个磁贴配置
function validateTileConfig(item) {
    const required = ['id', 'icon', 'name', 'contentFile', 'color'];
    for (let key of required) {
        if (!item[key]) {
            showError(`磁贴配置缺少字段 "${key}"，该项将被忽略`);
            return false;
        }
    }
    // 颜色格式简单校验
    if (!/^#[0-9a-fA-F]{6}$/.test(item.color)) {
        showError(`磁贴 "${item.name}" 的颜色格式错误 (应为 #RRGGBB)，忽略`);
        return false;
    }
    return true;
}

// ===================== 渲染磁贴 =====================
function renderTiles(configs) {
    tileGrid.innerHTML = '';
    configs.forEach((cfg, index) => {
        if (!validateTileConfig(cfg)) return;
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.dataset.app = cfg.id;
        tile.dataset.index = index;
        tile.style.background = `linear-gradient(135deg, ${cfg.color}, ${adjustColor(cfg.color, -20)})`;
        tile.style.color = '#fff'; // 确保文字白色
        tile.innerHTML = `
            <i class="tile-icon ${cfg.icon}"></i>
            <div class="tile-title">${cfg.name}</div>
        `;
        tile.addEventListener('click', () => handleTileClick(tile));
        tile.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTileClick(tile);
            }
        });
        tile.setAttribute('role', 'button');
        tile.setAttribute('tabindex', '0');
        tileGrid.appendChild(tile);
    });
    // 搜索过滤
    filterTiles('');
}

function adjustColor(hex, amount) {
    // 简单变暗
    let r = parseInt(hex.slice(1,3), 16);
    let g = parseInt(hex.slice(3,5), 16);
    let b = parseInt(hex.slice(5,7), 16);
    r = Math.max(0, r + amount);
    g = Math.max(0, g + amount);
    b = Math.max(0, b + amount);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// ===================== 搜索过滤 =====================
function filterTiles(keyword) {
    const tiles = tileGrid.querySelectorAll('.tile');
    const kw = keyword.trim().toLowerCase();
    tiles.forEach(tile => {
        const name = tile.querySelector('.tile-title').textContent.toLowerCase();
        if (!kw || name.includes(kw)) {
            tile.style.display = 'flex';
        } else {
            tile.style.display = 'none';
        }
    });
}
searchInput.addEventListener('input', (e) => {
    filterTiles(e.target.value);
});

// ===================== 磁贴点击处理 =====================
async function handleTileClick(tile) {
    if (isAnimating) return;
    if (activeTile === tile || activeMiniTile === tile) return;

    const index = parseInt(tile.dataset.index);
    const config = tileData[index];
    if (!config) return;

    // 读取内容文件
    let content;
    try {
        const resp = await fetch(`./${config.contentFile}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        content = await resp.json();
    } catch (e) {
        showError(`无法加载 ${config.contentFile}: ${e.message}`);
        return;
    }

    // 判断是否有外部链接
    if (content.externalLink && content.externalLink.url) {
        // 使用 mini 磁贴
        openMini(tile, content, config);
    } else {
        // 使用全屏应用
        openApp(tile, content, config);
    }
}

// ===================== 全屏应用 =====================
function openApp(tile, content, config) {
    if (isAnimating) return;
    if (activeTile) return; // 已有全屏打开

    activeTile = tile;
    isAnimating = true;
    clearTimeout(animationTimer);

    appTitle.textContent = content.title || config.name;
    appIcon.className = `app-title-icon ${config.icon}`;
    // 渲染内容
    let html = '';
    if (content.body) html += `<div>${content.body}</div>`;
    if (content.buttons && content.buttons.length) {
        html += `<div style="display:flex;gap:1vw;margin-top:2vh;">`;
        content.buttons.forEach(btn => {
            html += `<button style="padding:0.5vh 1vw;background:var(--card-bg);border:1px solid var(--card-border);color:var(--fg);border-radius:4px;cursor:pointer;">${btn.text}</button>`;
        });
        html += `</div>`;
    }
    appBody.innerHTML = html;
    appBody.className = 'app-body'; // 重置可见状态

    // 获取磁贴位置
    const rect = getTileRect(tile);
    // 准备克隆
    illusionCard.style.transition = 'none';
    illusionCard.style.top = rect.top + 'px';
    illusionCard.style.left = rect.left + 'px';
    illusionCard.style.width = rect.width + 'px';
    illusionCard.style.height = rect.height + 'px';
    illusionCard.style.transform = 'rotateY(0deg)';
    illusionCard.style.borderRadius = '4px';

    illusionFront.innerHTML = '';
    const clone = tile.cloneNode(true);
    clone.style.position = 'absolute';
    clone.style.top = '0';
    clone.style.left = '0';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.margin = '0';
    clone.style.transform = 'none';
    clone.style.boxShadow = 'none';
    clone.style.transition = 'none';
    clone.style.opacity = '1';
    illusionFront.appendChild(clone);

    // 背面应用内容背景
    illusionBack.style.background = 'var(--bg)';
    illusionBack.style.color = 'var(--fg)';
    illusionBack.style.padding = '2vh 2vw';
    // 为了预览，简单显示标题
    illusionBack.innerHTML = `<div style="font-size:clamp(24px,3vw,40px);">${content.title || config.name}</div>`;

    tile.style.opacity = '0';
    illusionWrapper.style.visibility = 'visible';

    requestAnimationFrame(() => {
        void illusionCard.offsetHeight;
        getComputedStyle(illusionCard).transform;
        illusionCard.style.transition = TRANSITION_STYLE;
        requestAnimationFrame(() => {
            illusionCard.style.top = '0px';
            illusionCard.style.left = '0px';
            illusionCard.style.width = '100vw';
            illusionCard.style.height = '100vh';
            illusionCard.style.transform = 'rotateY(180deg)';
            illusionCard.style.borderRadius = '0px';
        });
    });

    animationTimer = setTimeout(() => {
        appLayer.classList.add('active');
        appLayer.setAttribute('aria-hidden', 'false');
        appBody.classList.add('visible');
        closeBtn.focus();
        setTimeout(() => { isAnimating = false; }, 100);
    }, 280);
}

// ===================== Mini 磁贴（小窗口）=====================
function openMini(tile, content, config) {
    if (isAnimating) return;
    if (activeMiniTile) return;

    activeMiniTile = tile;
    isAnimating = true;
    clearTimeout(animationTimer);

    // 填充mini内容
    miniTitle.textContent = '即将转至外链';
    miniSecurityInfo.textContent = '您即将访问外部链接，请确认安全。';
    const url = content.externalLink.url;
    miniUrlDisplay.textContent = url;
    miniFullUrl.textContent = url;
    miniFullUrl.style.display = 'none';
    miniExpandBtn.querySelector('i').className = 'fa-solid fa-chevron-down';
    miniExpandBtn.textContent = '展开 ';
    miniExpandBtn.appendChild(document.createElement('i'));
    miniExpandBtn.querySelector('i').className = 'fa-solid fa-chevron-down';

    // 设置访问按钮
    miniVisitBtn.onclick = () => {
        window.open(url, '_blank');
    };

    // 复制功能
    miniCopyBtn.onclick = () => {
        navigator.clipboard.writeText(url).then(() => {
            miniCopyBtn.innerHTML = '<i class="fa-regular fa-check"></i> 已复制';
            setTimeout(() => {
                miniCopyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> 复制';
            }, 2000);
        }).catch(() => {});
    };

    // 展开/收起
    let expanded = false;
    miniExpandBtn.onclick = () => {
        expanded = !expanded;
        miniFullUrl.style.display = expanded ? 'block' : 'none';
        miniExpandBtn.textContent = expanded ? '收起 ' : '展开 ';
        const icon = document.createElement('i');
        icon.className = expanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
        miniExpandBtn.appendChild(icon);
        // 动态调整卡片高度（由CSS自动适应）
    };

    // 显示mini wrapper
    miniWrapper.classList.add('active');

    // 获取磁贴位置
    const rect = getTileRect(tile);
    // 计算小窗口位置（居中）
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const miniW = Math.min(winW * 0.5, 700);
    const miniH = Math.min(winH * 0.6, 500);
    const left = (winW - miniW) / 2;
    const top = (winH - miniH) / 2;

    // 设置illusion-card到磁贴位置，然后动画到居中窗口
    illusionCard.style.transition = 'none';
    illusionCard.style.top = rect.top + 'px';
    illusionCard.style.left = rect.left + 'px';
    illusionCard.style.width = rect.width + 'px';
    illusionCard.style.height = rect.height + 'px';
    illusionCard.style.transform = 'rotateY(0deg)';
    illusionCard.style.borderRadius = '4px';

    // 克隆磁贴到正面
    illusionFront.innerHTML = '';
    const clone = tile.cloneNode(true);
    clone.style.position = 'absolute';
    clone.style.top = '0';
    clone.style.left = '0';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.margin = '0';
    clone.style.transform = 'none';
    clone.style.boxShadow = 'none';
    clone.style.transition = 'none';
    clone.style.opacity = '1';
    illusionFront.appendChild(clone);

    // 背面显示mini内容（但mini内容实际在#mini-wrapper中，我们不需要在背面显示，因为mini wrapper覆盖）
    // 为了视觉效果，背面留空或显示提示
    illusionBack.style.background = 'var(--bg)';
    illusionBack.style.color = 'var(--fg)';
    illusionBack.innerHTML = `<div style="padding:2vh;">${content.title || '外链'}</div>`;

    tile.style.opacity = '0';
    illusionWrapper.style.visibility = 'visible';

    requestAnimationFrame(() => {
        void illusionCard.offsetHeight;
        getComputedStyle(illusionCard).transform;
        illusionCard.style.transition = TRANSITION_STYLE;
        requestAnimationFrame(() => {
            illusionCard.style.top = top + 'px';
            illusionCard.style.left = left + 'px';
            illusionCard.style.width = miniW + 'px';
            illusionCard.style.height = miniH + 'px';
            illusionCard.style.transform = 'rotateY(180deg)';
            illusionCard.style.borderRadius = '8px';
        });
    });

    animationTimer = setTimeout(() => {
        // 显示mini wrapper（覆盖在illusion之上，但透明背景，所以我们让mini wrapper显示，但illusion隐藏？）
        // 我们让mini wrapper显示在illusion之上，但illusion要保留用于回缩动画。
        // 为了不遮挡，我们让mini wrapper的背景透明，且卡片样式与illusion一致。
        // 更简单：让mini wrapper显示，同时illusion保持不变，但illusion背面内容不完整，我们用mini wrapper的卡片覆盖。
        // 我们调整mini wrapper的卡片与illusion位置一致，但这样复杂。
        // 替代方案：翻转完成后，隐藏illusion，显示mini wrapper的卡片。
        // 但需求要求回缩动画也使用illusion，所以我们需要在关闭时重新显示illusion并反向动画。
        // 因此我们保留illusion，并在翻转完成后，将mini wrapper的卡片与illusion对齐，或者直接让mini wrapper显示在illusion之上，illusion作为背景。
        // 最简单：mini wrapper的卡片设置与illusion相同位置，并透明背景，只显示内容。
        // 我们让mini wrapper的卡片与illusion位置重叠，但mini wrapper卡片背景透明，内容显示。
        // 但mini wrapper卡片有边框阴影，而illusion也有，可能会重叠。
        // 我们决定：翻转完成后，隐藏illusion（visibility hidden），但我们需要保留illusion的状态以便回缩。
        // 可以保存当前状态，然后隐藏illusion，显示mini wrapper卡片。
        // 为了简化，我们直接显示mini wrapper卡片，并隐藏illusion，但保存参数以便回缩。
        // 由于我们已经有activeMiniTile，回缩时我们重新设置illusion到窗口位置，再动画回磁贴。
        // 我们选择在翻转完成后，隐藏illusion（visibility hidden），显示mini wrapper卡片（覆盖）。
        // 同时记录窗口尺寸和位置。
        illusionWrapper.style.visibility = 'hidden';
        // 显示mini wrapper卡片（已经显示，但之前是隐藏的）
        // mini wrapper已经active，但卡片内容需要更新位置（因为illusion已经定位好，但我们要显示卡片）
        // 我们直接把mini wrapper的卡片定位到illusion位置
        const card = document.querySelector('.mini-card');
        card.style.position = 'fixed';
        card.style.top = top + 'px';
        card.style.left = left + 'px';
        card.style.width = miniW + 'px';
        card.style.height = miniH + 'px';
        card.style.borderRadius = '8px';
        card.style.background = 'var(--bg)';
        card.style.color = 'var(--fg)';
        // 隐藏原有的mini wrapper背景，我们使用overlay
        // 但mini wrapper有一个overlay，我们保留
        // 确保mini wrapper的overlay显示
        miniWrapper.style.display = 'flex';
        // 让卡片可见
        card.style.display = 'flex';
        // 设置焦点
        miniCloseBtn.focus();
        // 保存状态以便回缩
        window._miniState = { top, left, width: miniW, height: miniH };
        setTimeout(() => { isAnimating = false; }, 100);
    }, 280);
}

// 关闭mini磁贴
function closeMini() {
    if (!activeMiniTile) return;
    if (isAnimating) return;
    clearTimeout(animationTimer);

    isAnimating = true;
    const tile = activeMiniTile;
    const rect = getTileRect(tile);
    const state = window._miniState || { top: 0, left: 0, width: 0, height: 0 };

    // 先隐藏mini wrapper
    miniWrapper.classList.remove('active');
    miniWrapper.style.display = 'none';

    // 恢复illusion并设置到窗口位置
    illusionWrapper.style.visibility = 'visible';
    illusionCard.style.transition = 'none';
    illusionCard.style.top = state.top + 'px';
    illusionCard.style.left = state.left + 'px';
    illusionCard.style.width = state.width + 'px';
    illusionCard.style.height = state.height + 'px';
    illusionCard.style.transform = 'rotateY(180deg)';
    illusionCard.style.borderRadius = '8px';

    // 重新设置正面克隆（空）
    illusionFront.innerHTML = '';
    // 背面恢复显示内容（但不需要）
    illusionBack.innerHTML = '';

    // 由于我们之前隐藏了illusion，现在需要恢复，但我们需要保证磁贴隐藏
    tile.style.opacity = '0';

    requestAnimationFrame(() => {
        void illusionCard.offsetHeight;
        getComputedStyle(illusionCard).transform;
        illusionCard.style.transition = TRANSITION_STYLE;
        requestAnimationFrame(() => {
            illusionCard.style.top = rect.top + 'px';
            illusionCard.style.left = rect.left + 'px';
            illusionCard.style.width = rect.width + 'px';
            illusionCard.style.height = rect.height + 'px';
            illusionCard.style.transform = 'rotateY(0deg)';
            illusionCard.style.borderRadius = '4px';
        });
    });

    animationTimer = setTimeout(() => {
        illusionWrapper.style.visibility = 'hidden';
        tile.style.transition = 'none';
        tile.style.opacity = '1';
        void tile.offsetHeight;
        tile.style.transition = '';
        activeMiniTile = null;
        isAnimating = false;
        window._miniState = null;
    }, TRANSITION_DURATION + 30);
}

// ===================== 关闭全屏应用 =====================
function closeApp() {
    if (!activeTile) return;
    if (isAnimating) return;
    clearTimeout(animationTimer);

    isAnimating = true;
    const tile = activeTile;
    const rect = getTileRect(tile);

    appLayer.classList.remove('active');
    appLayer.setAttribute('aria-hidden', 'true');
    appBody.classList.remove('visible');

    // 恢复illusion到全屏状态
    illusionWrapper.style.visibility = 'visible';
    illusionCard.style.transition = 'none';
    illusionCard.style.top = '0px';
    illusionCard.style.left = '0px';
    illusionCard.style.width = '100vw';
    illusionCard.style.height = '100vh';
    illusionCard.style.transform = 'rotateY(180deg)';
    illusionCard.style.borderRadius = '0px';

    // 设置克隆（可选）
    requestAnimationFrame(() => {
        void illusionCard.offsetHeight;
        getComputedStyle(illusionCard).transform;
        illusionCard.style.transition = TRANSITION_STYLE;
        requestAnimationFrame(() => {
            illusionCard.style.top = rect.top + 'px';
            illusionCard.style.left = rect.left + 'px';
            illusionCard.style.width = rect.width + 'px';
            illusionCard.style.height = rect.height + 'px';
            illusionCard.style.transform = 'rotateY(0deg)';
            illusionCard.style.borderRadius = '4px';
        });
    });

    animationTimer = setTimeout(() => {
        illusionWrapper.style.visibility = 'hidden';
        tile.style.transition = 'none';
        tile.style.opacity = '1';
        void tile.offsetHeight;
        tile.style.transition = '';
        activeTile = null;
        isAnimating = false;
    }, TRANSITION_DURATION + 30);
}

// ===================== 全局事件绑定 =====================
closeBtn.addEventListener('click', closeApp);
miniCloseBtn.addEventListener('click', closeMini);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (activeMiniTile) closeMini();
        else if (activeTile) closeApp();
    }
});

// 点击overlay关闭mini
document.querySelector('.mini-overlay').addEventListener('click', closeMini);

// 窗口resize时重置状态（如果打开则关闭）
window.addEventListener('resize', () => {
    if (activeMiniTile) closeMini();
    if (activeTile) closeApp();
});

// ===================== 初始化 =====================
async function init() {
    const configs = await loadConfig();
    tileData = configs;
    renderTiles(configs);
    // 如果没有磁贴，显示空状态
    if (tileData.length === 0) {
        tileGrid.innerHTML = '<div style="grid-column:1;text-align:center;color:var(--muted);padding:5vh 0;">暂无磁贴，请添加 config.json 配置</div>';
    }
}

init();