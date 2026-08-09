let simRunning = true;
let tpsHistory = [];
let bloodHistory = [];
const maxPoints = 80;
let selectedChars = [];
let outputData = [];
let filterType = 'all';
let currentSelectionText = '';
let currentSelectionMeta = []; // array of {char,tick,pattern}
let isUserSelecting = false;

async function fetchJson(url, opts={}) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error('HTTP '+r.status);
  return await r.json();
}

// Render output as clickable spans, preserving selection if user is selecting
function renderOutputChars(recentOutput, rawHistory) {
  const container = document.getElementById('outputDisplay');
  const selectionBar = document.getElementById('selectionInfo');
  // If user is actively selecting (bar visible), don't re-render to avoid losing selection
  if (!selectionBar.classList.contains('hidden')) {
    return;
  }

  outputData = rawHistory && rawHistory.length ? rawHistory : null;

  // Build source: prefer rawHistory (with tick) if available
  let source;
  if (outputData && outputData.length) {
    source = outputData;
  } else {
    // fallback from string
    source = recentOutput.split('').map((c,i)=>({char:c, tick:0, pattern:0, index:i}));
  }

  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  source.forEach((item, idx) => {
    const ch = item.char;
    if (!ch) return;
    const span = document.createElement('span');
    span.className = 'char';
    span.textContent = ch;
    span.dataset.index = idx;
    span.dataset.tick = item.tick||0;
    span.dataset.pattern = item.pattern||0;
    span.dataset.char = ch;
    span.title = `تیک ${item.tick||0} | الگو ${item.pattern||0} — دابل‌کلیک +5`;
    // Click to toggle selection
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      // If user has native selection, clear it
      window.getSelection().removeAllRanges();
      if (span.classList.contains('selected')) {
        span.classList.remove('selected');
        selectedChars = selectedChars.filter(s => s.element !== span);
      } else {
        span.classList.add('selected');
        selectedChars.push({char: ch, tick: item.tick||0, pattern: item.pattern||0, element: span, index: idx});
      }
      updateSelectionBarFromClicks();
    });
    span.addEventListener('dblclick', async (e) => {
      e.stopPropagation();
      await scoreChars([{char: ch, tick: item.tick, pattern: item.pattern}], 5);
      // remove selection after double click
      span.classList.remove('selected');
      selectedChars = selectedChars.filter(s=>s.element!==span);
      updateSelectionBarFromClicks();
    });
    frag.appendChild(span);
  });
  container.appendChild(frag);
}

function updateSelectionBarFromClicks() {
  const bar = document.getElementById('selectionInfo');
  const selTextEl = document.getElementById('selText');
  const selCountEl = document.getElementById('selCount');
  if (selectedChars.length === 0) {
    // Check if there's native selection as fallback
    const nativeSel = window.getSelection().toString();
    if (nativeSel && nativeSel.length>0) {
      bar.classList.remove('hidden');
      selTextEl.textContent = nativeSel;
      selCountEl.textContent = nativeSel.length;
      currentSelectionText = nativeSel;
      currentSelectionMeta = [];
      return;
    }
    bar.classList.add('hidden');
    currentSelectionText = '';
    currentSelectionMeta = [];
    return;
  }
  bar.classList.remove('hidden');
  const txt = selectedChars.map(s=>s.char).join('');
  selTextEl.textContent = txt;
  selCountEl.textContent = selectedChars.length;
  currentSelectionText = txt;
  currentSelectionMeta = selectedChars.map(s=>({char:s.char, tick:s.tick, pattern:s.pattern}));
}

// Also handle native drag selection
document.addEventListener('mouseup', () => {
  setTimeout(()=>{
    const sel = window.getSelection();
    const text = sel ? sel.toString() : '';
    const container = document.getElementById('outputDisplay');
    if (!container) return;
    // Check if selection is inside outputDisplay
    if (text && text.length>0 && sel.rangeCount>0) {
      const range = sel.getRangeAt(0);
      if (container.contains(range.commonAncestorContainer) || container.contains(range.startContainer) || container.contains(range.endContainer)) {
        // Native selection inside output
        isUserSelecting = true;
        const bar = document.getElementById('selectionInfo');
        bar.classList.remove('hidden');
        document.getElementById('selText').textContent = text;
        document.getElementById('selCount').textContent = text.length;
        currentSelectionText = text;
        // Try to get meta for selected text from spans overlapped
        currentSelectionMeta = [];
        // Find spans that are in selection
        const spans = container.querySelectorAll('.char');
        spans.forEach(span=>{
          if (sel.containsNode(span, true)) {
            currentSelectionMeta.push({char: span.dataset.char, tick: parseInt(span.dataset.tick)||0, pattern: parseInt(span.dataset.pattern)||0});
          }
        });
        // If no meta found (selection via text nodes), use text only
        if (currentSelectionMeta.length===0) {
          currentSelectionMeta = text.split('').map(c=>({char:c, tick:0, pattern:0}));
        }
        return;
      }
    }
    // If no native selection and no clicked selection, keep bar as is if click selection exists
    if (selectedChars.length===0) {
      // Don't auto hide if user just clicked outside - but if selection collapsed, hide after short delay unless click selection exists
      const bar = document.getElementById('selectionInfo');
      if (bar && !bar.classList.contains('hidden') && selectedChars.length===0) {
        // Check if mouseup was outside output - then clear after delay
        // We keep bar visible for a moment to allow scoring
      }
    }
  }, 50);
});

document.addEventListener('mousedown', (e)=>{
  // If mousedown outside outputDisplay and outside selection bar, clear click selections
  const output = document.getElementById('outputDisplay');
  const bar = document.getElementById('selectionInfo');
  if (!output.contains(e.target) && !bar.contains(e.target)) {
    // Don't clear immediately, let mouseup handle
  }
});

async function scoreChars(chars, score, extra={}) {
  if (!chars || chars.length===0) {
    // Fallback to currentSelection
    if (currentSelectionText) {
      chars = currentSelectionMeta.length ? currentSelectionMeta : currentSelectionText.split('').map(c=>({char:c}));
    } else {
      return;
    }
  }
  const text = chars.map(c=>c.char).join('') || currentSelectionText;
  if (!text) return;

  // Disable buttons temporarily to prevent double click spam
  document.querySelectorAll('.score').forEach(b=>b.disabled=true);
  try {
    if (score>0) {
      await fetchJson('/api/inject_blood', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({amount: score*2})});
    }
    await fetchJson('/api/score', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text, score, ticks: chars.map(c=>c.tick), meaningful: extra.meaningful||false})});

    // Visual feedback: flash
    chars.forEach(c=>{
      if (c.element) {
        c.element.classList.add(score>0?'meaningful':'');
        c.element.style.transition='all .3s';
        c.element.style.transform='scale(1.2)';
        setTimeout(()=>{
          c.element.style.transform='';
          c.element.classList.remove('meaningful');
          c.element.classList.remove('selected');
        }, 800);
      }
    });

    // Clear selection
    selectedChars = [];
    currentSelectionText = '';
    currentSelectionMeta = [];
    document.getElementById('selectionInfo').classList.add('hidden');
    window.getSelection().removeAllRanges();
    document.querySelectorAll('.char.selected').forEach(el=>el.classList.remove('selected'));

  } catch(e){
    console.error(e);
    alert('خطا در نمره‌دهی: '+e.message);
  } finally {
    document.querySelectorAll('.score').forEach(b=>b.disabled=false);
    refresh();
  }
}

function renderRawList(raw) {
  const div = document.getElementById('outputRaw');
  if (!div) return;
  div.innerHTML = '';
  const last = (raw||[]).slice(-120).reverse();
  last.forEach(item=>{
    const el = document.createElement('div');
    el.className = 'raw-item';
    el.innerHTML = `<span class="t">تیک ${item.tick}</span> <span class="p">الگو ${item.pattern}</span> <span class="c">${item.char}</span>`;
    el.addEventListener('click', async ()=>{
      await scoreChars([{char:item.char, tick:item.tick, pattern:item.pattern}], 5);
    });
    div.appendChild(el);
  });
}

function updateUI(data){
  // Header
  document.getElementById('headerTick').textContent = data.tick;
  document.getElementById('headerTps').textContent = data.tps.toFixed(1)+' TPS';
  document.getElementById('statTick').textContent = data.tick;
  document.getElementById('statBlood').textContent = data.blood.toFixed(1);
  document.getElementById('statTps').textContent = data.tps.toFixed(1);
  document.getElementById('statSpeed').textContent = data.model_speed_x.toFixed(1)+'x';
  document.getElementById('statSpikes').textContent = data.total_spikes;
  document.getElementById('statAlive').textContent = data.alive;
  document.getElementById('statDead').textContent = data.dead;
  document.getElementById('statIgnore').textContent = data.ignore;
  document.getElementById('statSeizure').textContent = data.seizure;
  document.getElementById('statCpuFreq').textContent = data.cpu_freq_mhz.toFixed(0)+' MHz';
  document.getElementById('statCpuBudget').textContent = data.cpu_budget+'%';
  document.getElementById('statCpuUsage').textContent = data.cpu_usage_percent.toFixed(1)+'%';
  document.getElementById('toolbarCpu').textContent = data.cpu_usage_percent.toFixed(1)+'%';
  document.getElementById('toolbarBlood').textContent = data.blood.toFixed(0);
  const totalKb = data.memory_stats.normal_total_kb + data.memory_stats.memory_personal_total_kb + data.memory_stats.memory_storage_total_kb;
  document.getElementById('toolbarMem').textContent = (totalKb/1024).toFixed(1)+' MB';
  document.getElementById('cpuBar').style.width = Math.min(100, data.cpu_usage_percent)+'%';
  document.getElementById('statRatio').textContent = data.memory_stats.ratio_percent.toFixed(2)+'%';
  document.getElementById('statMemCount').textContent = `(${data.memory_stats.memory_neuron_count} از ${data.memory_stats.memory_neuron_count + data.memory_stats.normal_neuron_count})`;
  document.getElementById('statRewrite').textContent = data.memory_stats.total_full_rewrite + ` (رویداد ${data.memory_stats.event_full_rewrite})`;
  document.getElementById('statForget').textContent = data.memory_stats.total_forget + ` (رویداد ${data.memory_stats.event_forget})`;
  document.getElementById('memStats').innerHTML = `معمولی: ${data.memory_stats.normal_total_kb}KB (${data.memory_stats.normal_neuron_count}×96KB)<br>شخصی حافظه‌ای: ${data.memory_stats.memory_personal_total_kb}KB<br>ذخیره حافظه‌ای: ${data.memory_stats.memory_storage_total_kb}KB<br>کل حافظه منطقی: ${totalKb}KB (${(totalKb/1024).toFixed(1)}MB)<br>فیزیکی (تخمینی): ${(totalKb/1024*1.1).toFixed(1)}MB`;

  // Render output only if not actively selecting (to keep selection)
  const bar = document.getElementById('selectionInfo');
  const isSelecting = bar && !bar.classList.contains('hidden');
  if (!isSelecting) {
    renderOutputChars(data.recent_output, data.output_history);
  }

  if (data.output_history) {
    renderRawList(data.output_history);
  }

  // Regions
  const regionsDiv = document.getElementById('regionsList');
  regionsDiv.innerHTML = data.regions.map(r=> `
    <div class="region-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="name">${r.name}</span>
        <span style="font-size:11px;background:#111a2e;padding:2px 8px;border-radius:12px;border:1px solid #243052">${r.neurons} نورون ${r.meaningful?'✅ معنادار':''}</span>
      </div>
      <div style="margin-top:6px" class="hint">${r.note||'بدون یادداشت'} | سهم مانا ${r.mana_share}</div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <label style="font-size:12px;display:flex;gap:4px;align-items:center"><input type="checkbox" ${r.meaningful?'checked':''} onchange="toggleMeaning('${r.name.replace(/'/g,"\\'")}', this.checked)"> معنادار</label>
        <button class="btn small" onclick="scoreRegion('${r.name.replace(/'/g,"\\'")}',5)">+5</button>
        <button class="btn small ghost" onclick="scoreRegion('${r.name.replace(/'/g,"\\'")}',-5)">-5</button>
      </div>
    </div>
  `).join('');

  // Efference
  document.getElementById('efferenceInfo').textContent = `با تاخیر 5 تیک: ${data.efference_count} اسلات`;
  document.getElementById('efferenceList').innerHTML = data.efference.map(e=> `<div>تیک ${e.tick} | الگو ${e.pattern} | <b>${e.char}</b></div>`).join('');

  // Devices
  document.getElementById('deviceList').innerHTML = data.devices.map(d=> `<div><b>${d.name}</b> ${d.available?'✅':'❌ Dormant'}<br><small>${d.reason}</small></div>`).join('');

  // Events with filter
  const logDiv = document.getElementById('eventLog');
  let events = data.events;
  if (filterType!=='all') events = events.filter(e=>e.type===filterType);
  logDiv.innerHTML = events.slice().reverse().map(ev=> `<div class="ev ${ev.type}"><span class="t">[${ev.tick}] ${ev.type}</span> ${ev.message}</div>`).join('');

  // Status
  document.getElementById('simStatus').textContent = data.sim_running ? `در حال فکر... ${data.tick}` : 'متوقف';
  document.getElementById('simStatus').className = 'status ' + (data.sim_running?'running':'paused');
  document.getElementById('btnToggleSim').textContent = data.sim_running ? '⏸ توقف' : '▶️ ادامه';

  // Charts
  tpsHistory.push(data.tps);
  bloodHistory.push(data.blood);
  if (tpsHistory.length>maxPoints) tpsHistory.shift();
  if (bloodHistory.length>maxPoints) bloodHistory.shift();
  drawCharts();
}

function drawCharts(){
  const c1=document.getElementById('tpsChart');
  if (!c1) return;
  const ctx1=c1.getContext('2d');
  ctx1.clearRect(0,0,c1.width,c1.height);
  ctx1.strokeStyle='#5b8cff'; ctx1.lineWidth=2; ctx1.beginPath();
  const max1=Math.max(...tpsHistory,10);
  tpsHistory.forEach((v,i)=>{ const x=(i/maxPoints)*c1.width; const y=c1.height-(v/max1)*c1.height; if(i===0) ctx1.moveTo(x,y); else ctx1.lineTo(x,y); });
  ctx1.stroke();
  const c2=document.getElementById('bloodChart');
  const ctx2=c2.getContext('2d');
  ctx2.clearRect(0,0,c2.width,c2.height);
  ctx2.strokeStyle='#4ade80'; ctx2.lineWidth=2; ctx2.beginPath();
  const max2=Math.max(...bloodHistory,100);
  bloodHistory.forEach((v,i)=>{ const x=(i/maxPoints)*c2.width; const y=c2.height-(v/max2)*c2.height; if(i===0) ctx2.moveTo(x,y); else ctx2.lineTo(x,y); });
  ctx2.stroke();
}

async function toggleMeaning(name, checked){
  await fetchJson('/api/region_mark', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, meaningful:checked, note: checked?'کاربر گفت معناداره':''})});
  refresh();
}
async function scoreRegion(name, score){
  await fetchJson('/api/score_region', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, score})});
  refresh();
}

// Delegated scoring buttons (more reliable)
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.score');
  if (btn) {
    e.preventDefault();
    const score = parseInt(btn.dataset.score);
    if (!isNaN(score)) {
      scoreChars(selectedChars.length?selectedChars:currentSelectionMeta, score);
    }
  }
});

document.getElementById('btnClearSel').onclick = ()=>{
  selectedChars.forEach(s=>{ if(s.element) s.element.classList.remove('selected'); });
  selectedChars=[];
  currentSelectionText='';
  currentSelectionMeta=[];
  document.getElementById('selectionInfo').classList.add('hidden');
  window.getSelection().removeAllRanges();
};
document.getElementById('btnMarkMeaning').onclick = async ()=>{
  const txt = currentSelectionText || selectedChars.map(s=>s.char).join('');
  if (!txt) return;
  await fetchJson('/api/score', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text:txt, score:10, meaningful:true})});
  selectedChars.forEach(s=>{ if(s.element) s.element.classList.remove('selected'); });
  selectedChars=[]; currentSelectionText=''; currentSelectionMeta=[];
  document.getElementById('selectionInfo').classList.add('hidden');
  window.getSelection().removeAllRanges();
  refresh();
};
document.getElementById('btnSelectAll').onclick = ()=>{
  const container=document.getElementById('outputDisplay');
  const spans=container.querySelectorAll('.char');
  selectedChars=[];
  spans.forEach(span=>{
    span.classList.add('selected');
    selectedChars.push({char:span.dataset.char, tick:parseInt(span.dataset.tick), pattern:parseInt(span.dataset.pattern), element:span});
  });
  updateSelectionBarFromClicks();
};
document.getElementById('btnScoreSelected').onclick = ()=>{
  const modal=document.getElementById('scoreModal');
  const txt = currentSelectionText || selectedChars.map(s=>s.char).join('');
  document.getElementById('modalText').textContent=txt||'(چیزی انتخاب نشده)';
  modal.classList.remove('hidden');
};
document.getElementById('btnCloseModal').onclick = ()=>{ document.getElementById('scoreModal').classList.add('hidden'); };
document.getElementById('scoreModal').addEventListener('click', (e)=>{
  if (e.target.id==='scoreModal') e.target.classList.add('hidden');
  const btn=e.target.closest('[data-score]');
  if (btn && btn.closest('#scoreModal')) {
    const score=parseInt(btn.dataset.score);
    const modalText=document.getElementById('modalText').textContent;
    const chars = selectedChars.length ? selectedChars : (currentSelectionText?currentSelectionMeta:[]);
    scoreChars(chars, score, {meaningful: score>=10});
    document.getElementById('scoreModal').classList.add('hidden');
  }
});

document.getElementById('btnToggleSim').onclick = async ()=>{
  const data=await fetchJson('/api/status');
  await fetchJson('/api/sim', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({running:!data.sim_running})});
  refresh();
};
document.getElementById('btnTick').onclick = async ()=>{
  await fetchJson('/api/tick', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({n:1})});
  refresh();
};
document.getElementById('btnApplyConfig').onclick = async ()=>{
  const cpu=parseFloat(document.getElementById('inputCpu').value);
  const tmin=parseFloat(document.getElementById('inputTpsMin').value);
  const tmax=parseFloat(document.getElementById('inputTpsMax').value);
  const vm=document.getElementById('inputVm').checked;
  await fetchJson('/api/config', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({cpu_budget:cpu, tps_min:tmin, tps_max:tmax, vm_mode:vm?1:0})});
  refresh();
};
document.getElementById('inputCpu').oninput = e=>{ document.getElementById('valCpu').textContent=e.target.value; };
document.getElementById('btnSendInput').onclick = async ()=>{
  const txt=document.getElementById('inputPersian').value;
  if(!txt) return;
  const res=await fetchJson('/api/input', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text:txt})});
  document.getElementById('inputResult').textContent=`${res.bits} بیت → تایید معکوس: ${res.verify}`;
  document.getElementById('inputPersian').value='';
  refresh();
};
document.getElementById('btnInject').onclick = async ()=>{
  const id=document.getElementById('inputInjectId').value;
  const amt=document.getElementById('inputInjectAmt').value;
  await fetchJson('/api/inject', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id:parseInt(id)||0, amount:parseFloat(amt)||10})});
  refresh();
};
document.getElementById('btnInjectBlood').onclick = async ()=>{
  const amt=document.getElementById('inputBloodAmt').value;
  await fetchJson('/api/inject_blood', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({amount:parseFloat(amt)||20})});
  refresh();
};
document.getElementById('btnSave').onclick = async ()=>{
  const res=await fetchJson('/api/save', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({path:'gui_model.afu'})});
  alert('ذخیره: '+JSON.stringify(res));
};
document.getElementById('btnCodecTest').onclick = async ()=>{
  const res=await fetchJson('/api/codec_test');
  document.getElementById('codecResult').textContent=`bijection:${res.bijection} ${res.test_in}->${res.bits}->${res.test_out} match=${res.match}`;
};
document.getElementById('btnClearOutput').onclick = ()=>{ document.getElementById('outputDisplay').innerHTML=''; outputData=[]; };
document.getElementById('btnClearEvents').onclick = ()=>{ document.getElementById('eventLog').innerHTML=''; };
document.getElementById('btnCreate').onclick = async ()=>{
  const n=parseInt(document.getElementById('inputCreate').value);
  if(!confirm(`مغز جدید با ${n} نورون؟\nحافظه مورد نیاز ~${Math.round(n*96/1024)}MB\nبرای 32K حدود 3GB RAM لازم است!`)) return;
  await fetchJson('/api/create', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({neurons:n})});
  tpsHistory=[]; bloodHistory=[]; selectedChars=[]; currentSelectionText=''; document.getElementById('selectionInfo').classList.add('hidden');
  refresh();
};
document.querySelectorAll('.filter').forEach(btn=>{
  btn.onclick=()=>{
    filterType=btn.dataset.filter;
    document.querySelectorAll('.filter').forEach(b=>b.classList.remove('primary'));
    btn.classList.add('primary');
    refresh();
  };
});

async function refresh(){
  try{
    const data=await fetchJson('/api/status');
    updateUI(data);
  }catch(e){ console.error(e); }
}
setInterval(refresh, 900);
refresh();
