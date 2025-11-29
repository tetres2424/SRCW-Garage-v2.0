const ROW_CAPACITY = 3;
let currentSetup = { upper: [], lower: [], charId: "", machineType: "", part1: "", part2: "", part3: "" };
let customGadgets = [];
let savedMemos = [];
let isSortedByUsage = false;

window.onload = () => {
    loadCustomGadgets();
    loadMemosFromStorage();
    initCharSelect();
    updateSelectOptions();
    
    const params = new URLSearchParams(window.location.search);
    if (params.has('s')) loadFromUrlNew(params.get('s'));
    else if (params.has('data')) loadFromUrlV6(params.get('data'));
    else render();
};

function initCharSelect() {
    const cSelect = document.getElementById('charSelect');
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

    addOpts(p1); addOpts(p2);

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
    } else { cSpecDiv.textContent = ""; }

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
    } else { mSpecDiv.textContent = ""; }

    const tDiv = document.getElementById('totalStats');
    if(char) {
        let finalS = { 
            s: char.speed + mStats.s, 
            a: char.accel + mStats.a, 
            h: char.handling + mStats.h, 
            p: char.power + mStats.p, 
            d: char.dash + mStats.d 
        };
        
        // ガジェット補正
        const activeGadgets = [...currentSetup.upper, ...currentSetup.lower];
        const context = { mT: mType, cT: char.type };
        activeGadgets.forEach(g => { if (g.calc) g.calc(finalS, context); });

        // 0-100制限
        const clamp = (val) => Math.max(0, Math.min(100, val));
        finalS.s = clamp(finalS.s); finalS.a = clamp(finalS.a);
        finalS.h = clamp(finalS.h); finalS.p = clamp(finalS.p); finalS.d = clamp(finalS.d);

        const totalLabelStyle = "font-size:0.75rem; color:#666; display:block;";
        const totalValStyle = "font-size:1.1rem; font-weight:bold; color:#0055ff; display:block;";
        const boxStyle = "display:inline-block; width:18%; text-align:center;";

        tDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <div style="${boxStyle}"><span style="${totalLabelStyle}">スピード</span><span style="${totalValStyle}">${finalS.s}</span></div>
                <div style="${boxStyle}"><span style="${totalLabelStyle}">アクセル</span><span style="${totalValStyle}">${finalS.a}</span></div>
                <div style="${boxStyle}"><span style="${totalLabelStyle}">ハンドリング</span><span style="${totalValStyle}">${finalS.h}</span></div>
                <div style="${boxStyle}"><span style="${totalLabelStyle}">パワー</span><span style="${totalValStyle}">${finalS.p}</span></div>
                <div style="${boxStyle}"><span style="${totalLabelStyle}">ダッシュ</span><span style="${totalValStyle}">${finalS.d}</span></div>
            </div>`;
    } else {
        tDiv.innerHTML = `<div style="color:#aaa; text-align:center;">S:- A:- H:- P:- D:-</div>`;
    }
}

function toggleSort() {
    isSortedByUsage = !isSortedByUsage;
    const btn = document.getElementById('btnSort');
    if (isSortedByUsage) {
        btn.textContent = "↩️ 分類順に戻す"; btn.style.backgroundColor = "#e91e63";
    } else {
        btn.textContent = "📊 使用率順に並べ替え"; btn.style.backgroundColor = "#607d8b";
    }
    updateSelectOptions();
}

function updateSelectOptions() {
    const select = document.getElementById('gadgetSelect');
    const currentVal = select.value;
    select.innerHTML = '<option value="" disabled selected>ガジェットを選択してください</option>';
    let listToRender = [...defaultGadgets];
    if (isSortedByUsage) {
        listToRender.sort((a, b) => {
            const countA = usageStats[a.id] || 0;
            const countB = usageStats[b.id] || 0;
            return countB - countA || a.id.localeCompare(b.id);
        });
    } 
    const createOpt = (g) => {
        const opt = document.createElement('option');
        opt.value = g.id;
        const count = usageStats[g.id] || 0;
        const countText = count > 0 ? `【Top50:${count}】` : "";
        if (isSortedByUsage && count > 0) {
            opt.textContent = `${countText} ${g.name} (コスト${g.cost})`;
            opt.style.fontWeight = "bold"; opt.style.color = "#d32f2f";
        } else {
            opt.textContent = `${g.name} (コスト${g.cost}) ${countText}`;
        }
        select.appendChild(opt);
    };
    listToRender.forEach(createOpt);
    if(customGadgets.length > 0) {
        const sep = document.createElement('option');
        sep.disabled = true; sep.textContent = "--- オリジナル ---";
        select.appendChild(sep);
        customGadgets.forEach(createOpt);
    }
    renderCustomList();
}

function showGadgetDescription() {
    const select = document.getElementById('gadgetSelect');
    const preview = document.getElementById('gadgetDescPreview');
    const gId = select.value;
    if (!gId) { preview.textContent = "（ここにガジェットの効果が表示されます）"; return; }
    const g = defaultGadgets.find(item => item.id === gId) || customGadgets.find(item => item.id === gId);
    if (g) {
        let html = `<div style="margin-bottom:8px;">${g.desc ? g.desc : "（説明文が登録されていません）"}</div>`;
        const synergyIds = synergyData[g.id];
        if (synergyIds && synergyIds.length > 0) {
            const names = synergyIds.map(id => {
                const target = defaultGadgets.find(d => d.id === id);
                return target ? target.name : "";
            }).filter(n => n).join("、");
            if (names) {
                html += `
                <div style="border-top:1px dashed #ccc; padding-top:6px; margin-top:6px; font-size:0.8rem; color:#00695c;">
                    <strong>💡 Top50プレイヤーの併用例:</strong><br>${names}
                </div>`;
            }
        }
        preview.innerHTML = html;
    }
}

function tryAddGadget() {
    const gId = document.getElementById('gadgetSelect').value;
    if (!gId) return;
    let gadget = defaultGadgets.find(g => g.id === gId) || customGadgets.find(g => g.id === gId);
    if(!gadget) return;
    const allCurrent = [...currentSetup.upper, ...currentSetup.lower];
    if (allCurrent.some(item => item.id === gadget.id)) {
        showMessage("⚠️ 同じガジェットは2つセットできません", true);
        return;
    }
    const newItem = { ...gadget, uid: Date.now() + Math.random(), calc: gadget.calc };
    if (getRowCost(currentSetup.upper) + newItem.cost <= ROW_CAPACITY) {
        currentSetup.upper.push(newItem); render();
    } else if (getRowCost(currentSetup.lower) + newItem.cost <= ROW_CAPACITY) {
        currentSetup.lower.push(newItem); render();
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
        if (getRowCost(newUpper) + item.cost <= ROW_CAPACITY) newUpper.push(item);
        else if (getRowCost(newLower) + item.cost <= ROW_CAPACITY) newLower.push(item);
        else return false;
    }
    currentSetup.upper = newUpper; currentSetup.lower = newLower;
    return true;
}

function setRandomGadgets() {
    if(!confirm("現在のガジェット構成を破棄して、ランダムに再生成しますか？")) return;
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
    const pool = [...defaultGadgets, ...customGadgets];
    const fill = () => {
        let r=[], c=0, s=0;
        while(c < ROW_CAPACITY && s<200) {
            const g = pool[Math.floor(Math.random()*pool.length)];
            // シンプルにID重複チェックなしで埋める（仕様に合わせて調整可）
            const isDup = r.some(item => item.id === g.id); 
            if(!isDup && c+g.cost<=ROW_CAPACITY) {
                r.push({...g, uid:Date.now(), calc:g.calc}); c+=g.cost;
            } s++;
        } return r;
    };
    currentSetup.upper = fill();
    currentSetup.lower = fill();
}

function setAiOriginalSetup() {
    if(!confirm("現在の構成を破棄して、AIが考案した戦術を展開しますか？")) return;
    // (簡易AIロジック: ランダムにキャラを決めてガジェットを組む)
    setRandomFull();
    showMessage("🧠 AI生成完了");
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
        btnD.onclick=()=>{if(confirm('削除?')){savedMemos=savedMemos.filter(x=>x.id!==m.id);localStorage.setItem('sonicCW_memos',JSON.stringify(savedMemos));renderMemoList();}};
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
    currentSetup.upper = des(u); currentSetup.lower = des(l);
    render();
}

function registerCustomGadget() { /* ... */ }
function deleteCustomGadget(id) { /* ... */ }
function renderCustomList() { /* ... */ }

function render() {
    renderRow('visualUpper', 'costUpper', currentSetup.upper);
    renderRow('visualLower', 'costLower', currentSetup.lower);
}

function renderRow(elId, costId, data) {
    const el = document.getElementById(elId); el.innerHTML = '';
    data.forEach(item => {
        const div = document.createElement('div');
        div.className = `slot-block type-${item.type || 'custom'}`;
        div.style.flexGrow = item.cost;
        div.textContent = item.name;
        div.onclick = () => { 
            currentSetup.upper = currentSetup.upper.filter(i => i.uid !== item.uid);
            currentSetup.lower = currentSetup.lower.filter(i => i.uid !== item.uid);
            render();
        };
        el.appendChild(div);
    });
    // 空き枠
    const cost = getRowCost(data);
    if(cost < ROW_CAPACITY) {
        const empty = document.createElement('div');
        empty.className = 'slot-block block-empty';
        empty.style.flexGrow = (ROW_CAPACITY - cost);
        empty.textContent = "Empty";
        el.appendChild(empty);
    }
}

function showMessage(msg, err=false) { const e=document.getElementById('message'); e.textContent=msg; e.style.color=err?'red':'#0055ff'; setTimeout(()=>e.textContent='',3000); }
function resetCurrent() { if(confirm("リセットしますか？")){
    currentSetup={upper:[],lower:[],charId:"",machineType:"",part1:"",part2:"",part3:""}; 
    document.getElementById('charSelect').value = "";
    document.getElementById('machineTypeSelect').value = "";
    changeMachineType();
    document.getElementById('charSpec').textContent = "";
    document.getElementById('machineSpec').textContent = "";
    document.getElementById('totalStats').innerHTML = "S:- A:- H:- P:- D:-";
    render(); document.getElementById('shareArea').style.display='none';
}}

// --- 画像保存機能 ---
function saveAsImage() {
    const target = document.getElementById('setup-card');
    if (!target) { alert("撮影対象が見つかりません"); return; }
    if (typeof html2canvas === 'undefined') { alert("html2canvasが読み込まれていません"); return; }

    html2canvas(target, { backgroundColor: "#ffffff", scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'srcw_setup.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        showMessage("📸 画像を保存しました！");
    });
}
