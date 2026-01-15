// ==========================================
//  Sonic Racing CW 構成ツール - Main Logic
// ==========================================

const ROW_CAPACITY = 3;
let currentSetup = { upper: [], lower: [], charId: "", machineType: "", part1: "", part2: "", part3: "" };
let customGadgets = [];
let savedMemos = [];
let isSortedByUsage = false;
let isCost1Limit = false; // ★追加: コスト1限定モードフラグ

// グローバル管理変数
let currentRankingId = "";
let currentRankingCategory = "legend"; // 'world' or 'legend'
let currentSeasonFilter = null;
let usageStats = {}; 
let currentTotalPlayers = 0; // 母数管理用

// --- 初期化処理 ---
window.onload = () => {
    if (typeof defaultGadgets === 'undefined') {
        console.error("Error: data.js is not loaded!");
        return;
    }

    loadCustomGadgets();
    loadMemosFromStorage();
    initCharSelect();
    
    // 全画面共通データバーの初期化
    initGlobalDataBar();
    
    updateSelectOptions();

    const params = new URLSearchParams(window.location.search);
    if (params.has('s')) {
        loadFromUrlNew(params.get('s'));
    } else if (params.has('data')) {
        loadFromUrlV6(params.get('data'));
    } else {
        render();
    }

    showPage('main');
};

// --- 画面切り替え ---
function showPage(pageId) {
    document.getElementById('page-main').style.display = 'none';
    document.getElementById('page-ranking-list').style.display = 'none';
    document.getElementById('page-ranking-stats').style.display = 'none';
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`nav-${pageId}`);
    if(activeBtn) activeBtn.classList.add('active');

    const targetPage = document.getElementById(`page-${pageId}`);
    if(targetPage) targetPage.style.display = 'block';
    
    window.scrollTo(0, 0);
}

// ==========================================
//  1. グローバルデータ管理ロジック (自動集計版)
// ==========================================

function initGlobalDataBar() {
    if (typeof rankingArchives === 'undefined') return;
    switchGlobalCategory('legend');
}

function switchGlobalCategory(category) {
    currentRankingCategory = category;
    document.querySelectorAll('.g-cat-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`g-btn-${category}`).classList.add('active');

    const seasonSelect = document.getElementById('globalSeasonSelect');
    if (category === 'legend') {
        seasonSelect.style.display = 'inline-block';
        initGlobalSeasonSelect();
    } else {
        seasonSelect.style.display = 'none';
        currentSeasonFilter = null;
        rebuildGlobalArchiveSelect();
    }
}

function initGlobalSeasonSelect() {
    const select = document.getElementById('globalSeasonSelect');
    select.innerHTML = "";
    const legendArchives = rankingArchives.filter(a => a.type === 'legend');
    const seasons = [...new Set(legendArchives.map(a => a.season).filter(s => s !== null && s !== undefined))];
    seasons.sort((a, b) => b - a);

    if (seasons.length === 0) {
        select.innerHTML = "<option>データなし</option>";
    } else {
        seasons.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = `シーズン ${s}`;
            select.appendChild(opt);
        });
        select.selectedIndex = 0;
    }
    
    currentSeasonFilter = parseInt(select.value) || null;
    rebuildGlobalArchiveSelect();
}

function onGlobalSeasonChange() {
    const select = document.getElementById('globalSeasonSelect');
    currentSeasonFilter = parseInt(select.value) || null;
    rebuildGlobalArchiveSelect();
}

function rebuildGlobalArchiveSelect() {
    const select = document.getElementById('globalArchiveSelect');
    select.innerHTML = "";

    let targets = [];
    if (currentRankingCategory === 'legend') {
        targets = rankingArchives.filter(a => a.type === 'legend' && a.season === currentSeasonFilter);
    } else {
        targets = rankingArchives.filter(a => a.type === 'world');
    }
    targets.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (targets.length === 0) {
        const opt = document.createElement('option');
        opt.text = "データなし";
        select.appendChild(opt);
        currentRankingId = "";
    } else {
        targets.forEach(arc => {
            const opt = document.createElement('option');
            opt.value = arc.id;
            opt.textContent = (currentRankingCategory === 'legend') 
                ? `${arc.title} (${arc.date})`
                : `${arc.date} 集計 (${arc.title})`;
            select.appendChild(opt);
        });
        select.selectedIndex = 0;
        currentRankingId = select.value;
    }

    applyGlobalDataChange();
}

function onGlobalArchiveChange() {
    currentRankingId = document.getElementById('globalArchiveSelect').value;
    applyGlobalDataChange();
}

// データ変更の適用（全画面更新・自動集計）
function applyGlobalDataChange() {
    if (!currentRankingId) return;

    const arc = rankingArchives.find(a => a.id === currentRankingId);
    if (!arc) return;

    // 1. データ情報の更新
    const noteEl = document.getElementById('globalDataNote');
    if (noteEl) noteEl.textContent = arc.note || "";

    // 統計情報を動的に生成
    const computedStats = calculateStatsFromPlayers(arc.playerList);

    // 2. メイン画面: 使用率データの反映
    usageStats = {}; // リセット
    computedStats.gadgets.forEach(stat => {
        const gadgetDef = defaultGadgets.find(d => d.name === stat.name);
        if (gadgetDef) usageStats[gadgetDef.id] = stat.count;
    });
    currentTotalPlayers = arc.playerList.length;
    
    updateSelectOptions();
    
    const btnSort = document.getElementById('btnSort');
    if(btnSort && isSortedByUsage) {
        const title = (arc.type === 'legend') ? `Season ${arc.season}` : "World";
        btnSort.textContent = `📊 使用率順 (${title})`;
    }

    // 3. ランキング画面: リスト更新
    renderRankingList(arc.playerList);

    // 4. 分析画面: グラフ更新 (計算済みの統計データを渡す)
    renderRankingStats(arc.playerList, computedStats);
}

// プレイヤーリストから統計データを自動計算する関数
function calculateStatsFromPlayers(playerList) {
    if (!playerList || playerList.length === 0) return { gadgets: [], charTypes: [], machines: [], synergy: [] };

    const total = playerList.length;
    const gadgetCounts = {};
    const charTypeCounts = {};
    const machineCounts = {};
    const synergyCounts = {}; // 構成パターンのカウント

    playerList.forEach(p => {
        // ガジェット集計
        if (p.gadgets) {
            // シナジー用にソートして文字列化
            const sortedGadgets = [...p.gadgets].sort();
            const comboKey = sortedGadgets.join(" / ");
            if (comboKey) {
                synergyCounts[comboKey] = (synergyCounts[comboKey] || 0) + 1;
            }

            p.gadgets.forEach(gName => {
                gadgetCounts[gName] = (gadgetCounts[gName] || 0) + 1;
            });
        }
        // キャラタイプ集計
        if (p.charType) charTypeCounts[p.charType] = (charTypeCounts[p.charType] || 0) + 1;
        // マシンタイプ集計
        if (p.machineType) machineCounts[p.machineType] = (machineCounts[p.machineType] || 0) + 1;
    });

    // 配列に変換してソートするヘルパー
    const toSortedArray = (counts) => {
        return Object.keys(counts).map(key => ({
            name: key,
            count: counts[key],
            percent: ((counts[key] / total) * 100).toFixed(1)
        })).sort((a, b) => b.count - a.count);
    };

    return {
        gadgets: toSortedArray(gadgetCounts),
        charTypes: toSortedArray(charTypeCounts),
        machines: toSortedArray(machineCounts),
        synergy: toSortedArray(synergyCounts)
    };
}

// ==========================================
//  2. 基本構成ツール (Calculator) ロジック
// ==========================================

function initCharSelect() {
    const cSelect = document.getElementById('charSelect');
    if(!cSelect) return;
    characterData.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} [${c.type}]`;
        cSelect.appendChild(opt);
    });
}

function changeMachineType() {
    const type = document.getElementById('machineTypeSelect').value;
    const p1 = document.getElementById('part1Select');
    const p2 = document.getElementById('part2Select');
    const p3 = document.getElementById('part3Select');

    p1.innerHTML = '<option value="">フロント</option>'; p1.disabled = false;
    p2.innerHTML = '<option value="">リア</option>';     p2.disabled = false;
    p3.innerHTML = '<option value="">タイヤ</option>';   p3.disabled = false;

    const parts = machineParts.filter(m => m.type === type);
    const addOpts = (sel) => {
        parts.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            sel.appendChild(opt);
        });
    };

    addOpts(p1);
    addOpts(p2);

    if (type === "ダッシュ") {
        p3.innerHTML = '<option value="">(なし)</option>';
        p3.disabled = true;
        p3.style.backgroundColor = "#eee";
    } else {
        addOpts(p3);
        p3.style.backgroundColor = "#fff";
    }
    updateCharMachineInfo();
}

function updateCharMachineInfo() {
    const cId = document.getElementById('charSelect').value;
    const mType = document.getElementById('machineTypeSelect').value;
    const p1Id = document.getElementById('part1Select').value;
    const p2Id = document.getElementById('part2Select').value;
    const p3Id = document.getElementById('part3Select').value;

    currentSetup.charId = cId;
    currentSetup.machineType = mType;
    currentSetup.part1 = p1Id;
    currentSetup.part2 = p2Id;
    currentSetup.part3 = p3Id;

    const char = characterData.find(c => c.id === cId);
    const p1 = machineParts.find(p => p.id === p1Id);
    const p2 = machineParts.find(p => p.id === p2Id);
    const p3 = machineParts.find(p => p.id === p3Id);

    const labelStyle = "display:inline-block; width:80px; font-weight:bold; color:#555;";
    const valStyle = "display:inline-block; width:30px; text-align:right; margin-right:10px;";
    const cSpecDiv = document.getElementById('charSpec');
    
    if(char) {
        cSpecDiv.innerHTML = `
            <div style="margin-bottom:2px;"><strong>${char.name}</strong> [${char.type}]</div>
            <div style="font-size:0.8rem; color:#333; line-height:1.4;">
                <span style="${labelStyle}">スピード</span><span style="${valStyle}">${char.speed}</span>
                <span style="${labelStyle}">アクセル</span><span style="${valStyle}">${char.accel}</span>
                <span style="${labelStyle}">ハンドリング</span><span style="${valStyle}">${char.handling}</span><br>
                <span style="${labelStyle}">パワー</span><span style="${valStyle}">${char.power}</span>
                <span style="${labelStyle}">ダッシュ</span><span style="${valStyle}">${char.dash}</span>
            </div>`;
    } else {
        cSpecDiv.textContent = "";
    }

    let mStats = { s:0, a:0, h:0, p:0, d:0 };
    let partsList = [];
    if(p1) partsList.push(p1);
    if(p2) partsList.push(p2);
    if(mType !== "ダッシュ" && p3) partsList.push(p3);

    partsList.forEach(part => {
        mStats.s += part.s; mStats.a += part.a; mStats.h += part.h; mStats.p += part.p; mStats.d += part.d;
    });

    const mSpecDiv = document.getElementById('machineSpec');
    if(partsList.length > 0) {
        mSpecDiv.innerHTML = `
            <div style="font-size:0.8rem; color:#d32f2f; line-height:1.4;">
                <span style="${labelStyle}">スピード</span><span style="${valStyle}">+${mStats.s}</span>
                <span style="${labelStyle}">アクセル</span><span style="${valStyle}">+${mStats.a}</span>
                <span style="${labelStyle}">ハンドリング</span><span style="${valStyle}">+${mStats.h}</span><br>
                <span style="${labelStyle}">パワー</span><span style="${valStyle}">+${mStats.p}</span>
                <span style="${labelStyle}">ダッシュ</span><span style="${valStyle}">+${mStats.d}</span>
            </div>`;
    } else {
        mSpecDiv.textContent = "";
    }

    const tDiv = document.getElementById('totalStats');
    if(char) {
        let finalS = { 
            s: char.speed + mStats.s, 
            a: char.accel + mStats.a, 
            h: char.handling + mStats.h, 
            p: char.power + mStats.p, 
            d: char.dash + mStats.d 
        };

        const activeGadgets = [...currentSetup.upper, ...currentSetup.lower];
        const context = { mT: mType, cT: char.type };

        activeGadgets.forEach(g => {
            if (g.calc) {
                g.calc(finalS, context);
            }
        });

        let warnings = [];
        const clamp = (val, name) => {
            if(val > 100) { warnings.push(`⚠️ ${name}が100を超えています (${val})`); return 100; }
            if(val < 0) { warnings.push(`⚠️ ${name}が0を下回っています (${val})`); return 0; }
            return val;
        };

        finalS.s = clamp(finalS.s, "スピード");
        finalS.a = clamp(finalS.a, "アクセル");
        finalS.h = clamp(finalS.h, "ハンドリング");
        finalS.p = clamp(finalS.p, "パワー");
        finalS.d = clamp(finalS.d, "ダッシュ");

        const totalLabelStyle = "font-size:0.75rem; color:#666; display:block;";
        const totalValStyle = "font-size:1.1rem; font-weight:bold; color:#0055ff; display:block;";
        const boxStyle = "display:inline-block; width:18%; text-align:center;";

        let html = `
            <div style="display:flex; justify-content:space-between;">
                <div style="${boxStyle}"><span style="${totalLabelStyle}">スピード</span><span style="${totalValStyle}">${finalS.s}</span></div>
                <div style="${boxStyle}"><span style="${totalLabelStyle}">アクセル</span><span style="${totalValStyle}">${finalS.a}</span></div>
                <div style="${boxStyle}"><span style="${totalLabelStyle}">ハンドリング</span><span style="${totalValStyle}">${finalS.h}</span></div>
                <div style="${boxStyle}"><span style="${totalLabelStyle}">パワー</span><span style="${totalValStyle}">${finalS.p}</span></div>
                <div style="${boxStyle}"><span style="${totalLabelStyle}">ダッシュ</span><span style="${totalValStyle}">${finalS.d}</span></div>
            </div>`;
        
        if(warnings.length > 0) {
            html += `<div style="margin-top:8px; color:#d32f2f; font-size:0.8rem; font-weight:bold;">${warnings.join("<br>")}</div>`;
        }
        tDiv.innerHTML = html;

    } else {
        tDiv.innerHTML = `<div style="color:#aaa; text-align:center;">(キャラクターを選択すると合計値が表示されます)</div>`;
    }
}

function toggleSort() {
    isSortedByUsage = !isSortedByUsage;
    const btn = document.getElementById('btnSort');
    if (isSortedByUsage) {
        btn.textContent = "↩️ 分類順に戻す"; btn.style.backgroundColor = "#e91e63";
    } else {
        const arc = rankingArchives.find(a => a.id === currentRankingId);
        const title = arc ? (arc.type === 'legend' ? `Season ${arc.season}` : "World") : "Current";
        btn.textContent = `📊 使用率順 (${title})`; 
        btn.style.backgroundColor = "#607d8b";
    }
    updateSelectOptions();
}

// ★追加：コスト1限定モードの切り替え
function toggleCost1Limit() {
    isCost1Limit = !isCost1Limit;
    const btn = document.getElementById('btnCost1Limit');
    if (btn) {
        if (isCost1Limit) {
            btn.textContent = "🔒 コスト1限定 ON";
            btn.style.backgroundColor = "#ff9800"; // ONのときはオレンジ色など目立つ色に
        } else {
            btn.textContent = "🔓 コスト1限定 OFF";
            btn.style.backgroundColor = "#607d8b"; // 元の色
        }
    }
    updateSelectOptions(); // リストを更新
}

// ★修正：リスト生成時にフィルタリングを行う
function updateSelectOptions() {
    const select = document.getElementById('gadgetSelect');
    select.innerHTML = '<option value="" disabled selected>ガジェットを選択してください</option>';
    let listToRender = [...defaultGadgets];
    
    if (isSortedByUsage) {
        // 使用率が高い順にソート
        listToRender.sort((a, b) => {
            const countA = usageStats[a.id] || 0;
            const countB = usageStats[b.id] || 0;
            return countB - countA || a.id.localeCompare(b.id);
        });
    } 
    
    const createOpt = (g) => {
        // ★ここに追加：コスト1限定モードなら、コスト1以外は表示しない
        if (isCost1Limit && g.cost > 1) return;

        const opt = document.createElement('option');
        opt.value = g.id;
        
        const count = usageStats[g.id] || 0;
        const countText = (count > 0 && currentTotalPlayers > 0) 
            ? `【${count}/${currentTotalPlayers}人】` 
            : (count > 0 ? `【${count}人】` : "");

        if (isSortedByUsage && count > 0) {
            opt.textContent = `${countText} ${g.name} (コスト${g.cost})`;
            opt.style.fontWeight = "bold"; opt.style.color = "#d32f2f";
        } else {
            opt.textContent = `${g.name} (コスト${g.cost}) ${countText}`;
        }
        select.appendChild(opt);
    };
    
    listToRender.forEach(createOpt);
    
    // カスタムガジェットも同様にフィルタリング
    if(customGadgets.length > 0) {
        // 表示するカスタムガジェットがあるか確認
        const visibleCustoms = customGadgets.filter(g => !isCost1Limit || g.cost === 1);
        
        if (visibleCustoms.length > 0) {
            const sep = document.createElement('option');
            sep.disabled = true;
            sep.textContent = "--- オリジナル ---";
            select.appendChild(sep);
            customGadgets.forEach(createOpt);
        }
    }
    
    renderCustomList();
}

function showGadgetDescription() {
    const select = document.getElementById('gadgetSelect');
    const preview = document.getElementById('gadgetDescPreview');
    const gId = select.value;
    
    if (!gId) { 
        preview.textContent = "（ここにガジェットの効果が表示されます）"; 
        return; 
    }
    
    const g = defaultGadgets.find(item => item.id === gId) || customGadgets.find(item => item.id === gId);
    if (!g) return;

    let html = `<div style="margin-bottom:8px;">${g.desc ? g.desc : "（説明文が登録されていません）"}</div>`;

    // 動的併用データの集計
    let synergyText = "";
    const arc = rankingArchives.find(a => a.id === currentRankingId);
    
    if (arc && arc.playerList) {
        const users = arc.playerList.filter(p => p.gadgets && p.gadgets.includes(g.name));
        
        if (users.length > 0) {
            const partnerCounts = {};
            users.forEach(p => {
                p.gadgets.forEach(otherName => {
                    if (otherName !== g.name) {
                        partnerCounts[otherName] = (partnerCounts[otherName] || 0) + 1;
                    }
                });
            });

            const sortedPartners = Object.keys(partnerCounts).map(name => ({
                name: name,
                count: partnerCounts[name]
            })).sort((a, b) => b.count - a.count);

            if (sortedPartners.length > 0) {
                const topPartners = sortedPartners.slice(0, 5).map(item => {
                    const pct = Math.round((item.count / users.length) * 100);
                    return `<span style="display:inline-block; margin-right:8px; white-space:nowrap;">${item.name} <span style="color:#e91e63; font-weight:bold; font-size:0.85em;">(${pct}%)</span></span>`;
                });
                
                const dataLabel = arc.type === 'legend' ? `Season ${arc.season}` : "World";

                synergyText = `
                <div style="border-top:1px dashed #ccc; padding-top:8px; margin-top:8px; font-size:0.85rem; color:#00695c;">
                    <div style="margin-bottom:4px; font-weight:bold;">
                        💡 併用トレンド <span style="font-size:0.8em; color:#666; font-weight:normal;">(参照: ${dataLabel})</span>
                    </div>
                    <div style="line-height:1.6;">
                        ${topPartners.join(" ")}
                    </div>
                    <div style="font-size:0.75rem; color:#888; margin-top:4px; text-align:right;">
                        ※採用者 ${users.length}人のデータを分析
                    </div>
                </div>`;
            }
        } else {
            synergyText = `
            <div style="border-top:1px dashed #ccc; padding-top:8px; margin-top:8px; font-size:0.8rem; color:#999;">
                💡 このデータでは採用者がいません
            </div>`;
        }
    }

    html += synergyText;
    preview.innerHTML = html;
}

// -----------------------------------------------------
// ★ここから修正箇所：整形してバグを取り除いた追加・表示処理
// -----------------------------------------------------

function tryAddGadget() {
    const gId = document.getElementById('gadgetSelect').value;
    if (!gId) return;
    
    let gadget = defaultGadgets.find(g => g.id === gId) || customGadgets.find(g => g.id === gId);
    if (!gadget) return;
    
    // ★追加：コスト1限定モードの場合のチェック
    if (isCost1Limit && gadget.cost > 1) {
        showMessage("⚠️ コスト1限定モード中です", true);
        return;
    }

    const allCurrent = [...currentSetup.upper, ...currentSetup.lower];
    if (allCurrent.some(item => item.id === gadget.id)) {
        showMessage("⚠️ 同じガジェットは2つセットできません", true);
        return;
    }
    
    const newItem = { ...gadget, uid: Date.now() + Math.random(), calc: gadget.calc };
    
    if (getRowCost(currentSetup.upper) + newItem.cost <= ROW_CAPACITY) {
        currentSetup.upper.push(newItem);
        render();
    } else if (getRowCost(currentSetup.lower) + newItem.cost <= ROW_CAPACITY) {
        currentSetup.lower.push(newItem);
        render();
    } else if (smartAdd(newItem)) {
        render();
        showMessage(`自動整理して「${gadget.name}」を追加しました`);
    } else {
        showMessage("コスト不足で入りません", true);
    }
}

function smartAdd(newItem) {
    const allItems = [...currentSetup.upper, ...currentSetup.lower, newItem];
    if (allItems.reduce((s, i) => s + i.cost, 0) > ROW_CAPACITY * 2) return false;
    
    allItems.sort((a, b) => b.cost - a.cost); 
    
    let newUpper = [], newLower = [];
    for (let item of allItems) {
        if (getRowCost(newUpper) + item.cost <= ROW_CAPACITY) {
            newUpper.push(item);
        } else if (getRowCost(newLower) + item.cost <= ROW_CAPACITY) {
            newLower.push(item);
        } else {
            return false;
        }
    }
    
    currentSetup.upper = newUpper;
    currentSetup.lower = newLower;
    return true;
}

function render() {
    if (currentSetup.charId) document.getElementById('charSelect').value = currentSetup.charId;
    if (currentSetup.machineType) document.getElementById('machineTypeSelect').value = currentSetup.machineType || ""; 
    
    updateCharMachineInfo();
    
    renderRow('visualUpper', 'costUpper', currentSetup.upper);
    renderRow('visualLower', 'costLower', currentSetup.lower);
}

function renderRow(elId, costId, data) {
    const el = document.getElementById(elId);
    el.innerHTML = '';
    
    data.forEach(item => {
        const div = document.createElement('div');
        div.className = `slot-block type-${item.type || 'custom'}`;
        div.style.flexGrow = item.cost;
        div.textContent = item.name;
        div.title = item.desc || item.name;
        div.onclick = () => { 
            currentSetup.upper = currentSetup.upper.filter(i => i.uid !== item.uid);
            currentSetup.lower = currentSetup.lower.filter(i => i.uid !== item.uid);
            render();
        };
        el.appendChild(div);
    });
    
    const cost = getRowCost(data);
    if (cost < ROW_CAPACITY) {
        const empty = document.createElement('div');
        empty.className = 'slot-block block-empty';
        empty.style.flexGrow = (ROW_CAPACITY - cost);
        empty.textContent = "Empty";
        el.appendChild(empty);
    }
    
    document.getElementById(costId).textContent = cost;
    document.getElementById(costId).style.color = (cost === ROW_CAPACITY) ? '#d32f2f' : 'inherit';
}

function getRowCost(arr) {
    return arr.reduce((s, i) => s + i.cost, 0);
}

// -----------------------------------------------------
// その他のユーティリティ関数
// -----------------------------------------------------

function setRandomGadgets() {
    if(!confirm("現在のガジェット構成を破棄して、ランダムに再生成しますか？\n（キャラ・マシンは維持されます）")) return;
    generateRandomGadgets();
    render();
    showMessage("🎲 ガジェットをランダム生成しました！");
}

function setRandomFull() {
    if(!confirm("現在の構成を全て破棄して、キャラ・マシン含めて完全にランダム生成しますか？")) return;
    const randChar = characterData[Math.floor(Math.random() * characterData.length)];
    document.getElementById('charSelect').value = randChar.id;
    
    const types = ["スピード", "アクセル", "ハンドリング", "パワー", "ダッシュ"];
    const randType = types[Math.floor(Math.random() * types.length)];
    document.getElementById('machineTypeSelect').value = randType;
    changeMachineType();
    
    const parts = machineParts.filter(m => m.type === randType);
    if (parts.length > 0) {
        const p1 = parts[Math.floor(Math.random() * parts.length)].id;
        const p2 = parts[Math.floor(Math.random() * parts.length)].id;
        document.getElementById('part1Select').value = p1;
        document.getElementById('part2Select').value = p2;
        if (randType !== "ダッシュ") {
            const p3 = parts[Math.floor(Math.random() * parts.length)].id;
            document.getElementById('part3Select').value = p3;
        }
    }
    
    generateRandomGadgets();
    updateCharMachineInfo();
    render();
    showMessage("🎲 完全ランダム構成を生成しました！");
}

function generateRandomGadgets() {
    // ★修正: コスト1モードなら、ランダム生成の対象もコスト1のみに限定
    let pool = [...defaultGadgets, ...customGadgets];
    if (isCost1Limit) {
        pool = pool.filter(g => g.cost === 1);
    }

    const usedIds = new Set();
    const fill = () => {
        let r=[], c=0, s=0;
        while(c < ROW_CAPACITY && s<200) {
            const g = pool[Math.floor(Math.random()*pool.length)];
            if(!usedIds.has(g.id) && c+g.cost<=ROW_CAPACITY) {
                r.push({...g, uid:Date.now(), calc:g.calc}); c+=g.cost; usedIds.add(g.id);
            } s++;
        } return r;
    };
    currentSetup.upper = fill();
    currentSetup.lower = fill();
}

function setAiOriginalSetup() {
    if(!confirm("現在の構成を破棄して、AIが考案した戦術を展開しますか？")) return;
    
    let charId = document.getElementById('charSelect').value;
    let machType = document.getElementById('machineTypeSelect').value;

    if (!charId) {
        const randChar = characterData[Math.floor(Math.random() * characterData.length)];
        charId = randChar.id;
        document.getElementById('charSelect').value = charId;
    }

    if (!machType) {
        const types = ["スピード", "アクセル", "ハンドリング", "パワー", "ダッシュ"];
        machType = types[Math.floor(Math.random() * types.length)];
        document.getElementById('machineTypeSelect').value = machType;
        changeMachineType();
        
        const p1Opts = document.getElementById('part1Select').options;
        const p2Opts = document.getElementById('part2Select').options;
        const p3Opts = document.getElementById('part3Select').options;
        if(p1Opts.length > 1) document.getElementById('part1Select').selectedIndex = Math.floor(Math.random() * (p1Opts.length - 1)) + 1;
        if(p2Opts.length > 1) document.getElementById('part2Select').selectedIndex = Math.floor(Math.random() * (p2Opts.length - 1)) + 1;
        if(machType !== "ダッシュ" && p3Opts.length > 1) document.getElementById('part3Select').selectedIndex = Math.floor(Math.random() * (p3Opts.length - 1)) + 1;
    }
    
    updateCharMachineInfo();
    
    const charInfo = characterData.find(c => c.id === charId);
    const context = { charType: charInfo ? charInfo.type : null, isDashMachine: machType === "ダッシュ" };
    const check = (g, keywords) => { const text = (g.name + (g.desc || "")).toLowerCase(); return keywords.some(k => text.includes(k)); };

    const tactics = [
        { name: "暴走特急", desc: "速さと攻撃こそ正義。", scoreBonus: (ctx) => (ctx.charType === "スピード" || ctx.charType === "パワー") ? 2 : 0, priority: g => check(g, ["スピード", "ダッシュ", "ぶつかり", "攻撃", "加速"]) && !check(g, ["防御"]) },
        { name: "不沈艦", desc: "絶対に倒れない鉄壁構成。", scoreBonus: (ctx) => (ctx.charType === "パワー" || ctx.charType === "ハンドリング") ? 2 : 0, priority: g => check(g, ["ガード", "リカバー", "防御", "無敵", "復帰"]) },
        { name: "テクニカル・ダンサー", desc: "エアトリック特化。", scoreBonus: (ctx) => (ctx.isDashMachine) ? 3 : 0, priority: g => check(g, ["エアトリック", "ジャンプ", "チャージ", "空中"]) },
        { name: "ドリフトマスター", desc: "チャージ系で常に加速。", scoreBonus: (ctx) => (ctx.charType === "スピード" || ctx.charType === "ハンドリング") ? 2 : 0, priority: g => check(g, ["チャージ", "ドリフト", "カーブ"]) },
        { name: "バランス型", desc: "誰でも扱いやすい構成。", scoreBonus: () => 1, priority: g => check(g, ["スタート", "確率", "リング"]) }
    ];

    let weightedTactics = [];
    tactics.forEach(t => {
        const weight = 1 + (t.scoreBonus ? t.scoreBonus(context) : 0);
        for(let i=0; i<weight; i++) weightedTactics.push(t);
    });
    const tactic = weightedTactics[Math.floor(Math.random() * weightedTactics.length)];

    let allGadgets = [...defaultGadgets, ...customGadgets];
    // ★追加：コスト1限定モード対応
    if (isCost1Limit) {
        allGadgets = allGadgets.filter(g => g.cost === 1);
    }

    const usedIds = new Set(); 
    const highPriority = allGadgets.filter(tactic.priority);
    const fillers = allGadgets.filter(g => g.cost === 1 && !tactic.priority(g)); // fillersは元々コスト1のみ

    const createRow = () => {
        let row = []; let cost = 0; let safety = 0;
        while(cost < ROW_CAPACITY && safety < 200) {
            const validHigh = highPriority.filter(g => !usedIds.has(g.id));
            const validFill = fillers.filter(g => !usedIds.has(g.id));
            let source = (Math.random() < 0.9 && validHigh.length > 0) ? validHigh : validFill;
            if(source.length > 0) {
                const g = source[Math.floor(Math.random() * source.length)];
                if (!usedIds.has(g.id) && cost + g.cost <= ROW_CAPACITY) {
                    row.push({ ...g, uid: Date.now() + Math.random(), calc: g.calc });
                    cost += g.cost; usedIds.add(g.id);
                }
            } safety++;
        } return row;
    };
    currentSetup.upper = createRow();
    currentSetup.lower = createRow();
    render();
    alert(`🧠 AI戦術構築完了\n\nキャラ: ${charInfo ? charInfo.name : "未選択"}\n戦術: 「${tactic.name}」\n${tactic.desc}`);
}

function registerCustomGadget() {
    const name = document.getElementById('customName').value.trim();
    const cost = parseInt(document.getElementById('customCost').value);
    if(!name) return;
    customGadgets.push({ id: "c_" + Date.now(), name, cost, type: "custom", desc: "" });
    localStorage.setItem('sonicCW_customs', JSON.stringify(customGadgets));
    updateSelectOptions();
    document.getElementById('customName').value = '';
}

function deleteCustomGadget(id) {
    if(!confirm("削除しますか？")) return;
    customGadgets = customGadgets.filter(g => g.id !== id);
    localStorage.setItem('sonicCW_customs', JSON.stringify(customGadgets));
    updateSelectOptions();
}

function renderCustomList() {
    const container = document.getElementById('customListContainer');
    container.innerHTML = '';
    if(customGadgets.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; margin:5px;">登録なし</p>'; return;
    }
    customGadgets.forEach(g => {
        const div = document.createElement('div');
        div.className = 'custom-item';
        div.innerHTML = `<span>${g.name} <small>(コスト${g.cost})</small></span>`;
        const btn = document.createElement('button');
        btn.textContent = '削除'; btn.className = 'btn-delete-custom';
        btn.onclick = () => deleteCustomGadget(g.id);
        div.appendChild(btn); container.appendChild(div);
    });
}

function loadCustomGadgets() { const j = localStorage.getItem('sonicCW_customs'); if(j) customGadgets = JSON.parse(j); }
function loadMemosFromStorage() { const j = localStorage.getItem('sonicCW_memos'); if(j) savedMemos = JSON.parse(j); renderMemoList(); }

function saveMemo() {
    const t = document.getElementById('memoTitle').value.trim() || `無題 ${new Date().toLocaleTimeString()}`;
    savedMemos.unshift({ id: Date.now(), title: t, data: JSON.parse(JSON.stringify(currentSetup)) });
    localStorage.setItem('sonicCW_memos', JSON.stringify(savedMemos));
    renderMemoList();
}

function renderMemoList() {
    const l = document.getElementById('memoList'); l.innerHTML = '';
    savedMemos.forEach(m => {
        const d = document.createElement('div'); d.className = 'memo-item';
        d.innerHTML = `<span>${m.title}</span>`;
        
        const bg = document.createElement('div'); bg.style.display='flex'; bg.style.gap='5px';
        const btnL = document.createElement('button'); btnL.textContent='読込'; btnL.className='btn-save'; btnL.style.padding='4px 8px';
        btnL.onclick=()=>{
            const savedData = JSON.parse(JSON.stringify(m.data));
            document.getElementById('charSelect').value = savedData.charId || "";
            if(savedData.machineType) {
                document.getElementById('machineTypeSelect').value = savedData.machineType;
                changeMachineType();
                if(savedData.part1) document.getElementById('part1Select').value = savedData.part1;
                if(savedData.part2) document.getElementById('part2Select').value = savedData.part2;
                if(savedData.part3) document.getElementById('part3Select').value = savedData.part3;
            }
            updateCharMachineInfo();
            const restoreCalc = (list) => list.map(item => {
                const orig = defaultGadgets.find(d => d.id === item.id);
                return orig ? { ...item, calc: orig.calc } : item;
            });
            currentSetup.upper = restoreCalc(savedData.upper);
            currentSetup.lower = restoreCalc(savedData.lower);
            render();
            showMessage(`「${m.title}」を読み込みました`);
        };
        
        const btnD = document.createElement('button'); btnD.textContent='削除'; btnD.className='btn-delete-memo';
        btnD.onclick=()=>{
            if(confirm('削除?')){
                savedMemos=savedMemos.filter(x=>x.id!==m.id);
                localStorage.setItem('sonicCW_memos',JSON.stringify(savedMemos));
                renderMemoList();
            }
        };
        bg.appendChild(btnL); bg.appendChild(btnD); d.appendChild(bg); l.appendChild(d);
    });
}

function generateShareUrl() {
    const ser = i => `${encodeURIComponent(i.name)}:${i.cost}:${i.type||'custom'}`;
    const data = currentSetup.upper.map(ser).join(',') + '|' + currentSetup.lower.map(ser).join(',');
    const pStr = `${currentSetup.part1||''},${currentSetup.part2||''},${currentSetup.part3||''}`;
    const url = new URL(window.location.href);
    url.searchParams.set('s', `c=${currentSetup.charId||''}&mt=${currentSetup.machineType||''}&p=${pStr}&d=${encodeURIComponent(data)}`);
    url.searchParams.delete('data');
    document.getElementById('shareArea').style.display = 'block';
    document.getElementById('shareUrl').value = url.href;
}

function loadFromUrlNew(str) {
    const params = new URLSearchParams(str);
    if(params.has('c')) currentSetup.charId = params.get('c');
    if(params.has('mt')) {
        currentSetup.machineType = params.get('mt');
        setTimeout(() => {
            document.getElementById('charSelect').value = currentSetup.charId || "";
            document.getElementById('machineTypeSelect').value = currentSetup.machineType;
            changeMachineType();
            if(params.has('p')) {
                const parts = params.get('p').split(',');
                currentSetup.part1 = parts[0]; currentSetup.part2 = parts[1]; currentSetup.part3 = parts[2];
                if(parts[0]) document.getElementById('part1Select').value = parts[0];
                if(parts[1]) document.getElementById('part2Select').value = parts[1];
                if(parts[2]) document.getElementById('part3Select').value = parts[2];
                updateCharMachineInfo();
            }
        }, 200);
    }
    if(params.has('d')) loadFromUrlV6(decodeURIComponent(params.get('d')));
    else render();
}

function loadFromUrlV6(str) {
    const [u, l] = str.split('|');
    const des = s => {
        if(!s) return [];
        return s.split(',').map(x => {
            const [n, c, t] = x.split(':');
            const found = defaultGadgets.find(d => d.name === decodeURIComponent(n));
            return { id: found ? found.id : "share"+Math.random(), name: decodeURIComponent(n), cost: parseInt(c), type: t, uid: Math.random(), calc: found ? found.calc : null };
        });
    };
    currentSetup.upper = des(u);
    currentSetup.lower = des(l);
    render();
}

function showMessage(msg, err=false) {
    const e = document.getElementById('message');
    e.textContent = msg;
    e.style.color = err ? 'red' : '#0055ff';
    setTimeout(() => e.textContent='', 3000);
}

function resetCurrent() {
    if(confirm("リセットしますか？")){
        currentSetup={upper:[],lower:[],charId:"",machineType:"",part1:"",part2:"",part3:""};
        document.getElementById('charSelect').value = "";
        document.getElementById('machineTypeSelect').value = "";
        changeMachineType();
        document.getElementById('charSpec').textContent = "";
        document.getElementById('machineSpec').textContent = "";
        document.getElementById('totalStats').innerHTML = "S:- A:- H:- P:- D:-";
        render();
        document.getElementById('shareArea').style.display='none';
    }
}

// --- 統計画面描画 ---
function renderRankingList(playerList) {
    const pContainer = document.getElementById('player-list-container');
    if (!pContainer) return;
    pContainer.innerHTML = "";
    if (!playerList || playerList.length === 0) {
        pContainer.innerHTML = "<p style='padding:10px; color:#666;'>データがありません。</p>";
        return;
    }
    playerList.forEach(p => {
        const div = document.createElement('div');
        div.className = "player-row";
        div.onclick = () => openModal(p);
        let rankClass = "";
        if (p.rank === 1) rankClass = "rank-1";
        else if (p.rank === 2) rankClass = "rank-2";
        else if (p.rank === 3) rankClass = "rank-3";
        const rateHtml = p.rate ? `<div style="font-size:0.85rem; color:#0055ff; font-weight:bold; margin-right:15px;">★${p.rate}</div>` : "";
        div.innerHTML = `<div class="rank-num ${rankClass}" style="margin-right:10px;">#${p.rank}</div><div style="flex:1;"><div class="p-name">${p.name}</div><div class="p-char">${p.char}</div></div>${rateHtml}`;
        pContainer.appendChild(div);
    });
}

function renderRankingStats(playerList, computedStats) {
    const createGraph = (data, containerId, maxValFixed = null) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = "";
        if (!data || data.length === 0) {
            container.innerHTML = "<p style='color:#999; font-size:0.8rem;'>データなし</p>"; return;
        }
        const maxVal = maxValFixed !== null ? maxValFixed : Math.max(...data.map(d => d.count));
        data.forEach((item, i) => {
            const icon = (i===0)?"🥇":(i===1)?"🥈":(i===2)?"🥉":"";
            const div = document.createElement('div');
            div.style.marginBottom = "8px"; div.style.fontSize = "0.9rem";
            div.innerHTML = `<div style="display:flex; justify-content:space-between; margin-bottom:2px;"><span>${icon} ${item.name}</span><span style="color:#666;">${item.count}人 (${item.percent}%)</span></div><div class="rank-bar"><div class="rank-fill" style="width:${(item.count / maxVal) * 100}%;"></div></div>`;
            container.appendChild(div);
        });
    };

    if (computedStats) {
        const total = playerList.length;
        createGraph(computedStats.gadgets, 'rank-gadgets', total);
        createGraph(computedStats.charTypes, 'rank-chartypes', total);
        createGraph(computedStats.machines, 'rank-machines', total);
        
        const synContainer = document.getElementById('rank-synergy');
        if (synContainer) {
            synContainer.innerHTML = "";
            if (computedStats.synergy && computedStats.synergy.length > 0) {
                computedStats.synergy.slice(0, 4).forEach(s => {
                    const div = document.createElement('div');
                    div.className = "synergy-card";
                    div.onclick = () => openSynergyDetail(s, playerList);
                    const gadgetNames = s.name.split(/ \/ | \+ /).map(n => n.trim());
                    let visuals = '<div class="visual-row" style="height:45px; margin-bottom:8px; justify-content:center;">';
                    gadgetNames.forEach(name => {
                        const g = defaultGadgets.find(d => d.name === name) || { name: name, cost: 1, type: 'custom', desc: '' };
                        const typeClass = `type-${g.type || 'custom'}`;
                        const tooltip = g.desc ? `${g.name}\n${g.desc}` : g.name;
                        visuals += `<div class="slot-block ${typeClass}" style="flex-grow:${g.cost}; font-size:0.7rem;" title="${tooltip}">${g.name}</div>`;
                    });
                    visuals += '</div>';
                    div.innerHTML = `<div style="font-size:0.8rem; color:#00695c; margin-bottom:6px; font-weight:bold; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${s.name}">構成パターン (Click詳細)</div>${visuals}<div style="color:#666; font-size:0.85rem; text-align:center;"><span style="font-weight:bold; color:#333;">${s.count}人</span> が採用</div>`;
                    synContainer.appendChild(div);
                });
            } else {
                synContainer.innerHTML = "<p style='text-align:center; color:#999;'>十分なデータがありません</p>";
            }
        }
    }
}

function openModal(player) {
    const modal = document.getElementById('player-modal');
    const body = document.getElementById('modal-body');
    const gadgets = (player.gadgets && player.gadgets.length > 0) ? player.gadgets.map(name => { return defaultGadgets.find(d => d.name === name) || { name: name, cost: 1, type: 'custom', desc: '' }; }) : [{ name: "データなし", cost: 3, type: "standard", desc: "詳細情報がありません" }];
    const upper = [];
    const lower = [];
    let upperCost = 0;
    gadgets.forEach(g => {
        if (upperCost + g.cost <= 3) {
            upper.push(g);
            upperCost += g.cost;
        } else {
            lower.push(g);
        }
    });
    const generateVisualRowHTML = (items) => {
        let html = '<div class="visual-row" style="height:50px;">';
        let currentCost = 0;
        items.forEach(g => {
            const typeClass = `type-${g.type || 'custom'}`;
            const tooltip = g.desc ? `${g.name}\n${g.desc}` : g.name;
            html += `<div class="slot-block ${typeClass}" style="flex-grow:${g.cost}; font-size:0.7rem;" title="${tooltip}">${g.name}</div>`;
            currentCost += g.cost;
        });
        if (currentCost < 3) {
            html += `<div class="slot-block block-empty" style="flex-grow:${3 - currentCost}"></div>`;
        }
        html += '</div>';
        return html;
    };
    const rateDisplay = player.rate ? `<span style="background:#e3f2fd; color:#0055ff; padding:2px 8px; border-radius:10px; font-size:0.9rem; margin-left:10px;">Rate: ${player.rate}</span>` : "";
    body.innerHTML = `<h3 style="border-bottom:2px solid #eee; padding-bottom:10px; margin-top:0;"><span style="color:#0055ff;">#${player.rank}</span> ${player.name}${rateDisplay}</h3><div class="m-info"><div style="flex:1; min-width:140px;"><div class="m-label">CHARACTER</div><strong>${player.char}</strong> [${player.charType}]</div><div style="flex:1; min-width:140px;"><div class="m-label">MACHINE</div><strong>${player.machineType}</strong><br><span style="font-size:0.8rem; color:#666;">${player.parts.join(" / ")}</span></div></div><div class="m-label" style="margin-top:15px;">STATS</div><div class="m-stats"><span style="color:#d32f2f; font-weight:bold;">S:${player.stats.speed}</span> <span style="color:#ff9800; font-weight:bold;">A:${player.stats.accel}</span> <span style="color:#2196f3; font-weight:bold;">H:${player.stats.handling}</span> <span style="color:#4caf50; font-weight:bold;">P:${player.stats.power}</span> <span style="color:#9c27b0; font-weight:bold;">D:${player.stats.dash}</span></div><div class="m-label" style="margin-top:15px;">GADGETS CONFIG</div><div class="popup-row-container"><div style="font-size:0.7rem; color:#666; margin-bottom:2px;">Upper</div>${generateVisualRowHTML(upper)}<div style="font-size:0.7rem; color:#666; margin-top:8px; margin-bottom:2px;">Lower</div>${generateVisualRowHTML(lower)}</div><div style="text-align:center; margin-top:20px;"><button onclick="closeModal()" class="btn-modal-close">閉じる</button></div>`;
    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('player-modal').style.display = 'none';
}

function openSynergyDetail(synergy, playerList) {
    const targetGadgets = synergy.name.split(/ \/ | \+ /).map(s => s.trim());
    const matchedPlayers = playerList.filter(p => {
        const pGadgets = p.gadgets || [];
        return targetGadgets.every(gName => pGadgets.includes(gName));
    });
    const total = matchedPlayers.length;
    if (total === 0) return;
    const charCounts = {};
    const machCounts = {};
    matchedPlayers.forEach(p => {
        charCounts[p.charType] = (charCounts[p.charType] || 0) + 1;
        machCounts[p.machineType] = (machCounts[p.machineType] || 0) + 1;
    });
    const modal = document.getElementById('player-modal');
    const body = document.getElementById('modal-body');
    const makeBar = (label, count, max) => `<div class="stat-row"><div class="stat-label">${label}</div><div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${(count/max)*100}%"></div></div><div class="stat-val">${count}人</div></div>`;
    body.innerHTML = `<h3 style="border-bottom:2px solid #009688; padding-bottom:10px; color:#00695c; margin-top:0;">💡 シナジー分析</h3><div style="margin-bottom:15px; font-weight:bold; color:#333; text-align:center;">${synergy.name}</div><p style="text-align:center; font-size:0.9rem; background:#e0f2f1; padding:8px; border-radius:4px;">採用人数: <strong>${total}人</strong></p><h4 style="margin-bottom:10px; color:#555;">👤 キャラタイプの傾向</h4><div style="margin-bottom:20px;">${Object.keys(charCounts).sort((a,b)=>charCounts[b]-charCounts[a]).map(k => makeBar(k, charCounts[k], total)).join('')}</div><h4 style="margin-bottom:10px; color:#555;">🏎️ マシンタイプの傾向</h4><div style="margin-bottom:20px;">${Object.keys(machCounts).sort((a,b)=>machCounts[b]-machCounts[a]).map(k => makeBar(k, machCounts[k], total)).join('')}</div><div style="text-align:center; margin-top:20px;"><button onclick="closeModal()" class="btn-modal-close">閉じる</button></div>`;
    modal.style.display = 'flex';
}

function saveAsImage() {
    let target = document.getElementById('capture-target');
    if (!target) target = document.getElementById('setup-card');
    if (!target) {
        alert("エラー: 撮影対象が見つかりません。");
        return;
    }
    if (typeof html2canvas === 'undefined') {
        alert("エラー: 画像生成ライブラリが読み込まれていません。");
        return;
    }
    const titleInput = document.getElementById('memoTitle');
    const titleText = (titleInput && titleInput.value.trim()) ? titleInput.value : "SRCW Custom Setup";
    const titleNode = document.createElement('div');
    titleNode.innerText = titleText;
    titleNode.style.textAlign = "center";
    titleNode.style.fontSize = "1.4rem";
    titleNode.style.fontWeight = "bold";
    titleNode.style.color = "#0055ff";
    titleNode.style.marginBottom = "15px";
    titleNode.style.paddingBottom = "10px";
    titleNode.style.borderBottom = "2px solid #eee";
    titleNode.style.fontFamily = '"Helvetica Neue", Arial, sans-serif';
    target.insertBefore(titleNode, target.firstChild);
    html2canvas(target, {
        backgroundColor: "#ffffff",
        scale: 2
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `srcw_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        titleNode.remove();
        showMessage("📸 画像を保存しました！");
    }).catch(err => {
        console.error(err);
        titleNode.remove();
        alert("画像の保存に失敗しました。");
    });
}
