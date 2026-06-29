// ===================== 全局状态 =====================
let activeTile = null;           // 当前打开的全屏磁贴
let activeMiniCard = null;       // 当前 mini 窗口对应的卡片元素
let miniStartRect = null;        // 卡片起始位置（用于回缩动画）
let isAnimating = false;
let animationTimer = null;
let tileData = [];
let currentTheme = 'dark';

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
    const base = Math.min(w / 1920, h / 1080) * 16;
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

function validateTileConfig(item) {
    const required = ['id', 'icon', 'name', 'contentFile', 'color'];
    for (let key of required) {
        if (!item[key]) {
            showError(`磁贴配置缺少字段 "${key}"，该项将被忽略`);
            return false;
        }
    }
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
        tile.style.color = '#fff';
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
    filterTiles('');
}

function adjustColor(hex, amount) {
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
searchInput.addEventListener('input', (e) => filterTiles(e.target.value));

// ===================== 磁贴点击处理 =====================
async function handleTileClick(tile) {
    if (isAnimating) return;
    if (activeTile === tile) return;

    const index = parseInt(tile.dataset.index);
    const config = tileData[index];
    if (!config) return;

    let content;
    try {
        const resp = await fetch(`./${config.contentFile}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        content = await resp.json();
    } catch (e) {
        showError(`无法加载 ${config.contentFile}: ${e.message}`);
        return;
    }

    openApp(tile, content, config);
}

// ===================== 全屏应用（包含嵌入式外链卡片） =====================
function openApp(tile, content, config) {
    if (isAnimating) return;
    if (activeTile) return;

    activeTile = tile;
    isAnimating = true;
    clearTimeout(animationTimer);

    appTitle.textContent = content.title || config.name;
    appIcon.className = `app-title-icon ${config.icon}`;

    let html = '';
    if (content.body) html += `<div>${content.body}</div>`;

    // 嵌入式外部链接卡片
    if (content.externalLinks && content.externalLinks.length) {
        html += `<div style="display:flex;flex-wrap:wrap;gap:1vw;margin-top:2vh;">`;
        content.externalLinks.forEach(link => {
            const safeUrl = encodeURIComponent(link.url);
            const displayUrl = link.url.length > 60 ? link.url.slice(0, 60) + '…' : link.url;
            html += `
                <div class="mini-tile-card" data-url="${safeUrl}" data-label="${link.label}"
                     style="
                         background: var(--card-bg);
                         border: 1px solid var(--card-border);
                         border-radius: 4px;
                         padding: 1.2vh 1.2vw;
                         cursor: pointer;
                         transition: transform 0.2s, box-shadow 0.2s;
                         min-width: 160px;
                         flex: 1 0 auto;
                     "
                     role="button" tabindex="0">
                    <div style="display:flex;align-items:center;gap:0.6vw;">
                        <i class="fa-solid fa-link" style="opacity:0.7;"></i>
                        <span style="font-weight:500;">${link.label}</span>
                    </div>
                    <div style="font-size:0.75em;opacity:0.6;margin-top:0.3vh;word-break:break-all;">
                        ${displayUrl}
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    if (content.buttons && content.buttons.length) {
        html += `<div style="display:flex;gap:1vw;margin-top:2vh;">`;
        content.buttons.forEach(btn => {
            html += `<button style="padding:0.5vh 1vw;background:var(--card-bg);border:1px solid var(--card-border);color:var(--fg);border-radius:4px;cursor:pointer;">${btn.text}</button>`;
        });
        html += `</div>`;
    }

    appBody.innerHTML = html;
    appBody.className = 'app-body';

    // 为卡片绑定点击事件（传递卡片元素）
    appBody.querySelectorAll('.mini-tile-card').forEach(card => {
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = decodeURIComponent(card.dataset.url);
            const label = card.dataset.label;
            openMiniFromApp(card, url, label);
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const url = decodeURIComponent(card.dataset.url);
                const label = card.dataset.label;
                openMiniFromApp(card, url, label);
            }
        });
    });

    // 翻转动画（主页磁贴翻转）
    const rect = getTileRect(tile);
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

    illusionBack.style.background = 'var(--bg)';
    illusionBack.style.color = 'var(--fg)';
    illusionBack.style.padding = '2vh 2vw';
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

// ===================== 从全屏内弹出 Mini 窗口（带动画） =====================
function openMiniFromApp(cardElement, url, label) {
    if (isAnimating) return;
    if (activeMiniCard) return; // 已有一个 mini 打开

    isAnimating = true;
    clearTimeout(animationTimer);

    // 记录卡片元素和起始位置
    activeMiniCard = cardElement;
    miniStartRect = cardElement.getBoundingClientRect();

    // 填充 mini-wrapper 内容（用于翻转完成后显示）
    miniTitle.textContent = label || '即将转至外链';
    miniSecurityInfo.textContent = '您即将访问外部链接，请确认安全。';
    miniUrlDisplay.textContent = url;
    miniFullUrl.textContent = url;
    miniFullUrl.style.display = 'none';

    // 展开/收起
    miniExpandBtn.innerHTML = '展开 <i class="fa-solid fa-chevron-down"></i>';
    let expanded = false;
    miniExpandBtn.onclick = () => {
        expanded = !expanded;
        miniFullUrl.style.display = expanded ? 'block' : 'none';
        miniExpandBtn.innerHTML = expanded ? '收起 <i class="fa-solid fa-chevron-up"></i>' : '展开 <i class="fa-solid fa-chevron-down"></i>';
    };

    // 复制
    miniCopyBtn.onclick = () => {
        navigator.clipboard.writeText(url).then(() => {
            miniCopyBtn.innerHTML = '<i class="fa-regular fa-check"></i> 已复制';
            setTimeout(() => {
                miniCopyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> 复制';
            }, 2000);
        }).catch(() => {});
    };

    // 访问
    miniVisitBtn.onclick = () => window.open(url, '_blank');

    // ---- 构建 illusion 背面内容（与 mini-wrapper 一致） ----
    const backHtml = `
        <div style="display:flex;flex-direction:column;height:100%;padding:1.5vh 1.5vw;background:var(--bg);color:var(--fg);">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--card-border);padding-bottom:1vh;">
                <span style="font-size:clamp(18px,2vw,28px);font-weight:500;">${label || '即将转至外链'}</span>
            </div>
            <div style="margin-top:1.5vh;flex:1;">
                <p style="opacity:0.8;">您即将访问外部链接，请确认安全。</p>
                <div style="display:flex;align-items:center;gap:0.8vw;margin:1vh 0;background:var(--card-bg);padding:0.6vh 0.8vw;border-radius:4px;">
                    <span style="flex:1;font-size:clamp(12px,0.9vw,14px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${url}</span>
                </div>
                <div style="margin-top:0.5vh;font-size:clamp(11px,0.8vw,13px);word-break:break-all;display:none;" id="miniBackFullUrl">${url}</div>
                <button style="margin-top:0.5vh;background:var(--card-bg);border:1px solid var(--card-border);color:var(--fg);padding:0.3vh 0.6vw;border-radius:4px;cursor:default;font-size:clamp(12px,0.8vw,14px);">展开 <i class="fa-solid fa-chevron-down"></i></button>
                <div style="margin-top:1.5vh;display:flex;justify-content:flex-end;">
                    <button style="background:var(--card-bg);border:1px solid var(--card-border);color:var(--fg);padding:0.4vh 0.8vw;border-radius:4px;cursor:default;">继续访问</button>
                </div>
            </div>
        </div>
    `;
    illusionBack.innerHTML = backHtml;
    illusionBack.style.background = 'var(--bg)';
    illusionBack.style.color = 'var(--fg)';
    illusionBack.style.padding = '0'; // 由内部 padding 控制
    illusionBack.style.overflow = 'hidden';

    // ---- 设置 illusion 起始状态（卡片位置） ----
    const rect = miniStartRect;
    illusionCard.style.transition = 'none';
    illusionCard.style.top = rect.top + 'px';
    illusionCard.style.left = rect.left + 'px';
    illusionCard.style.width = rect.width + 'px';
    illusionCard.style.height = rect.height + 'px';
    illusionCard.style.transform = 'rotateY(0deg)';
    illusionCard.style.borderRadius = '4px';

    // 正面：克隆卡片
    illusionFront.innerHTML = '';
    const clone = cardElement.cloneNode(true);
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
    // 保持卡片样式（背景、边框等）
    clone.style.background = getComputedStyle(cardElement).background || 'var(--card-bg)';
    clone.style.border = '1px solid var(--card-border)';
    clone.style.borderRadius = '4px';
    clone.style.padding = '1.2vh 1.2vw';
    clone.style.display = 'flex';
    clone.style.alignItems = 'center';
    clone.style.gap = '0.6vw';
    // 移除内联样式中的背景，防止覆盖
    clone.style.background = getComputedStyle(cardElement).backgroundImage || 'var(--card-bg)';
    // 确保文本可见
    clone.querySelectorAll('*').forEach(el => {
        el.style.color = 'var(--fg)';
    });
    illusionFront.appendChild(clone);

    // 隐藏原卡片（但保留占位，不影响布局）
    cardElement.style.opacity = '0';

    // 显示 illusion
    illusionWrapper.style.visibility = 'visible';
    illusionWrapper.style.zIndex = '150'; // 确保高于全屏

    // ---- 计算终点窗口尺寸 ----
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const miniW = Math.min(winW * 0.5, 700);
    const miniH = Math.min(winH * 0.6, 500);
    const left = (winW - miniW) / 2;
    const top = (winH - miniH) / 2;

    // ---- 执行翻转动画 ----
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

    // ---- 翻转完成后，显示 mini-wrapper 并隐藏 illusion ----
    animationTimer = setTimeout(() => {
        // 定位 mini-wrapper 卡片到相同位置
        const card = document.querySelector('.mini-card');
        card.style.position = 'fixed';
        card.style.top = top + 'px';
        card.style.left = left + 'px';
        card.style.width = miniW + 'px';
        card.style.height = 'auto';
        card.style.borderRadius = '8px';
        card.style.background = 'var(--bg)';
        card.style.color = 'var(--fg)';
        card.style.boxShadow = '0 20px 60px var(--shadow)';

        // 显示 mini-wrapper
        miniWrapper.classList.add('active');
        miniWrapper.style.display = 'flex';
        miniCloseBtn.focus();

        // 隐藏 illusion
        illusionWrapper.style.visibility = 'hidden';

        // 恢复卡片透明度（但卡片仍被 mini 遮罩覆盖，视觉无影响）
        cardElement.style.opacity = '1';

        // 绑定关闭事件
        const closeMini = () => {
            closeMiniWithAnimation();
        };
        const escHandler = (e) => {
            if (e.key === 'Escape') closeMini();
        };
        document.addEventListener('keydown', escHandler);
        document.querySelector('.mini-overlay').onclick = closeMini;
        miniCloseBtn.onclick = closeMini;

        // 保存关闭函数引用以便清理
        window._miniCloseHandler = closeMini;
        window._miniEscHandler = escHandler;

        isAnimating = false;
    }, TRANSITION_DURATION + 30);
}

// ===================== 关闭 Mini 窗口（带反向动画） =====================
function closeMiniWithAnimation() {
    if (!activeMiniCard) return;
    if (isAnimating) return;
    clearTimeout(animationTimer);

    isAnimating = true;

    // 获取当前窗口位置（从 mini-wrapper 卡片读取）
    const card = document.querySelector('.mini-card');
    const rect = card.getBoundingClientRect();

    // 隐藏 mini-wrapper
    miniWrapper.classList.remove('active');
    miniWrapper.style.display = 'none';

    // 准备 illusion 从窗口位置翻转到卡片位置
    illusionWrapper.style.visibility = 'visible';
    illusionCard.style.transition = 'none';
    illusionCard.style.top = rect.top + 'px';
    illusionCard.style.left = rect.left + 'px';
    illusionCard.style.width = rect.width + 'px';
    illusionCard.style.height = rect.height + 'px';
    illusionCard.style.transform = 'rotateY(180deg)';
    illusionCard.style.borderRadius = '8px';

    // 正面：恢复卡片克隆（但此时正面朝向背面，我们不需要显示具体内容，只需保持）
    illusionFront.innerHTML = '';
    // 背面内容保留，但我们会翻转回正面，所以背面会被隐藏

    // 隐藏原卡片（保持隐藏直到动画结束）
    activeMiniCard.style.opacity = '0';

    requestAnimationFrame(() => {
        void illusionCard.offsetHeight;
        getComputedStyle(illusionCard).transform;
        illusionCard.style.transition = TRANSITION_STYLE;
        requestAnimationFrame(() => {
            // 回到卡片起始位置
            const startRect = miniStartRect;
            illusionCard.style.top = startRect.top + 'px';
            illusionCard.style.left = startRect.left + 'px';
            illusionCard.style.width = startRect.width + 'px';
            illusionCard.style.height = startRect.height + 'px';
            illusionCard.style.transform = 'rotateY(0deg)';
            illusionCard.style.borderRadius = '4px';
        });
    });

    animationTimer = setTimeout(() => {
        // 恢复卡片显示
        activeMiniCard.style.opacity = '1';
        illusionWrapper.style.visibility = 'hidden';
        // 重置状态
        activeMiniCard = null;
        miniStartRect = null;
        isAnimating = false;

        // 清理事件监听
        if (window._miniEscHandler) {
            document.removeEventListener('keydown', window._miniEscHandler);
            window._miniEscHandler = null;
        }
        if (window._miniCloseHandler) {
            // 移除 overlay 和 closeBtn 的监听（它们被覆盖，无需额外清理）
            window._miniCloseHandler = null;
        }
    }, TRANSITION_DURATION + 30);
}

// ===================== 关闭全屏应用 =====================
function closeApp() {
    if (!activeTile) return;
    if (isAnimating) return;
    clearTimeout(animationTimer);

    // 如果 mini 窗口打开，先关闭它（强制关闭）
    if (activeMiniCard) {
        // 快速关闭 mini（无动画）或直接重置
        miniWrapper.classList.remove('active');
        miniWrapper.style.display = 'none';
        activeMiniCard.style.opacity = '1';
        activeMiniCard = null;
        miniStartRect = null;
        if (window._miniEscHandler) {
            document.removeEventListener('keydown', window._miniEscHandler);
            window._miniEscHandler = null;
        }
        illusionWrapper.style.visibility = 'hidden';
    }

    isAnimating = true;
    const tile = activeTile;
    const rect = getTileRect(tile);

    appLayer.classList.remove('active');
    appLayer.setAttribute('aria-hidden', 'true');
    appBody.classList.remove('visible');

    illusionWrapper.style.visibility = 'visible';
    illusionCard.style.transition = 'none';
    illusionCard.style.top = '0px';
    illusionCard.style.left = '0px';
    illusionCard.style.width = '100vw';
    illusionCard.style.height = '100vh';
    illusionCard.style.transform = 'rotateY(180deg)';
    illusionCard.style.borderRadius = '0px';

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

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (activeMiniCard) {
            closeMiniWithAnimation();
            return;
        }
        if (activeTile) closeApp();
    }
});

window.addEventListener('resize', () => {
    if (activeTile) closeApp();
    if (activeMiniCard) {
        // 强制关闭 mini 无动画
        miniWrapper.classList.remove('active');
        miniWrapper.style.display = 'none';
        activeMiniCard.style.opacity = '1';
        activeMiniCard = null;
        miniStartRect = null;
        illusionWrapper.style.visibility = 'hidden';
        if (window._miniEscHandler) {
            document.removeEventListener('keydown', window._miniEscHandler);
            window._miniEscHandler = null;
        }
    }
});

// ===================== 初始化 =====================
async function init() {
    const configs = await loadConfig();
    tileData = configs;
    renderTiles(configs);
    if (tileData.length === 0) {
        tileGrid.innerHTML = '<div style="grid-column:1;text-align:center;color:var(--muted);padding:5vh 0;">暂无磁贴，请添加 config.json 配置</div>';
    }
}

init();