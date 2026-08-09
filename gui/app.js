let simRunning = true;
let tpsHistory = [];
let bloodHistory = [];
const maxPoints = 80;
let selectedChars = []; // array of {char, tick, pattern, index}
let outputData = []; // full output history from server
let filterType = 'all';

// helpers
async function fetchJson(url, opts={}) {
  const r = await fetch(url, opts);
  return await r.json();
}
function safeText(s){ return (s||'').toString(); }

function renderOutputChars(recentOutput, rawHistory) {
  // recentOutput is string, but we have rawHistory array with tick/pattern/char for better selection
  const container = document.getElementById('outputDisplay');
  // keep raw data globally
  outputData = rawHistory || [];

  // if rawHistory provided, render from it for better click data
  // else fallback to recentOutput string
  container.innerHTML = '';
  const source = (outputData.length ? outputData : recentOutput.split('').map((c,i)=>({char:c, tick:0, pattern:0, index:i})));

  source.forEach((item, idx) => {
    const ch = item.char || item;
    if (!ch) return;
    const span = document.createElement('span');
    span.className = 'char';
    span.textContent = ch;
    span.dataset.index = item.index !== undefined ? item.index : idx;
    span.dataset.tick = item.tick || 0;
    span.dataset.pattern = item.pattern || 0;
    span.dataset.char = ch;
    span.title = `تیک ${item.tick||0} الگو ${item.pattern||0} — کلیک برای نمره`;
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      // toggle selection
      if (span.classList.contains('selected')) {
        span.classList.remove('selected');
        selectedChars = selectedChars.filter(s => s.element !== span);
      } else {
        span.classList.add('selected');
        selectedChars.push({char: ch, tick: item.tick||0, pattern: item.pattern||0, element: span, index: idx});
      }
      updateSelectionBar();
    });
    // double click = quick +5
    span.addEventListener('dblclick', async () => {
      await scoreChars([{char: ch, tick: item.tick, pattern: item.pattern}], 5);
    });
    container.appendChild(span);
  });
}

function updateSelectionBar() {
  const bar = document.getElementById('selectionInfo');
  const selTextEl = document.getElementById('selText');
  const selCountEl = document.getElementById('selCount');
  if (selectedChars.length === 0) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  const txt = selectedChars.map(s=>s.char).join('');
  selTextEl.textContent = txt;
  selCountEl.textContent = selectedChars.length;
}

async function scoreChars(chars, score) {
  if (!chars || chars.length===0) return;
  const text = chars.map(c=>c.char).join('');
  // call API
  try {
    // score = 1,5,10,-5
    if (score > 0) {
      await fetchJson('/api/inject_blood', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({amount: score*2})});
      // also inject to output neurons that produced this
      // find ticks
      const ticks = [...new Set(chars.map(c=>c.tick))];
      await fetchJson('/api/score', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text, score, ticks})});
    } else {
      await fetchJson('/api/score', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text, score})});
    }
    // visual feedback
    chars.forEach(c => {
      if (c.element) {
        c.element.classList.remove('selected');
        c.element.classList.add(score>0?'meaningful':'');
        setTimeout(()=>{ c.element.classList.remove('meaningful'); }, 1500);
      }
    });
    selectedChars = selectedChars.filter(s => !chars.includes(s));
    updateSelectionBar();
    refresh();
  } catch(e){ console.error(e); }
}

function renderRawList(raw) {
  const div = document.getElementById('outputRaw');
  div.innerHTML = '';
  // show last 100 in reverse
  const last = raw.slice(-100).reverse();
  last.forEach(item => {
    const el = document.createElement('div');
    el.className = 'raw-item';
    el.innerHTML = `<span class="t">تیک ${item.tick}</span> <span class="p">الگو ${item.pattern}</span> <span class="c">${item.char}</span>`;
    el.addEventListener('click', async () => {
      // quick score this single
      await scoreChars([{char:item.char, tick:item.tick, pattern:item.pattern}], 5);
    });
    div.appendChild(el);
  });
}

function updateUI(data){
  document.getElementById('headerTick').textContent = data.tick;
  document.getElementById('headerTps').textContent = data.tps.toFixed(1) + ' TPS';
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
  document.getElementById('toolbarMem').textContent = ((data.memory_stats.normal_total_kb + data.memory_stats.memory_personal_total_kb + data.memory_stats.memory_storage_total_kb)/1024).toFixed(1)+' MB';
  document.getElementById('statTps').textContent = data.tps.toFixed(1);
  document.getElementById('cpuBar').style.width = Math.min(100, data.cpu_usage_percent)+'%';
  document.getElementById('statRatio').textContent = data.memory_stats.ratio_percent.toFixed(2)+'%';
  document.getElementById('statMemCount').textContent = `(${data.memory_stats.memory_neuron_count} از ${data.memory_stats.memory_neuron_count + data.memory_stats.normal_neuron_count})`;
  document.getElementById('statRewrite').textContent = data.memory_stats.total_full_rewrite + ` (رویداد ${data.memory_stats.event_full_rewrite})`;
  document.getElementById('statForget').textContent = data.memory_stats.total_forget + ` (رویداد ${data.memory_stats.event_forget})`;
  document.getElementById('memStats').innerHTML = `معمولی: ${data.memory_stats.normal_total_kb}KB (${data.memory_stats.normal_neuron_count}×96KB)<br>شخصی حافظه‌ای: ${data.memory_stats.memory_personal_total_kb}KB<br>ذخیره حافظه‌ای: ${data.memory_stats.memory_storage_total_kb}KB<br>کل: ${data.memory_stats.normal_total_kb + data.memory_stats.memory_personal_total_kb + data.memory_stats.memory_storage_total_kb}KB`;

  // render output with chars
  // data.recent_output is string, but we also have raw history via separate field? We have output history in raw list? We have efference but not full raw.
  // For professional, we need raw history from server - we have recent_output only, but we can reconstruct from events? Actually we need full output history with tick/pattern.
  // Server returns recent_output string only, but we have efference and also we can use a separate call? Let's use recent_output as fallback, but also use raw list from a global that we build from events? For now, use recent_output as string and also raw list if we store.
  // We have data.efference as delayed, but not full output. We'll request additional API? For now, use recent_output for main display, and use efference for raw? Actually we need output raw history - we have outputRaw div that should show output history with tick.
  // Let's use data.recent_output for display, but also try to get raw from server via a hidden field? We'll just render from recent_output string for now, and raw from efference? Actually we have outputData from previous fetch? We'll keep.

  // Try to build raw from last events of type meaningful? Not good.
  // For now, render recent_output as chars
  renderOutputChars(data.recent_output, data.output_history || null);

  // If server sends output_history, use it for raw list
  if (data.output_history) {
    renderRawList(data.output_history);
  } else if (data.efference) {
    // fallback: use efference as raw (since it contains char+tick)
    renderRawList(data.efference.map(e=>({tick:e.tick, pattern:e.pattern, char:e.char})));
  }

  // regions
  const regionsDiv = document.getElementById('regionsList');
  regionsDiv.innerHTML = data.regions.map(r=> `
    <div class="region-card">
      <div style="display:flex;justify-content:space-between">
        <span class="name">${r.name}</span>
        <span style="font-size:11px;background:#111a2e;padding:2px 6px;border-radius:6px">${r.neurons} نورون</span>
      </div>
      <div style="margin-top:6px;display:flex;gap:6px;align-items:center">
        <label style="font-size:12px"><input type="checkbox" ${r.meaningful?'checked':''} onchange="toggleMeaning('${r.name}', this.checked)"> معنادار</label>
        <span style="font-size:11px;color:#8a94b0">${r.note||''}</span>
      </div>
      <div class="row" style="margin-top:4px">
        <button class="btn small ghost" onclick="scoreRegion('${r.name}',5)">+5 امتیاز</button>
        <button class="btn small ghost" onclick="scoreRegion('${r.name}',-5)">-5</button>
      </div>
    </div>
  `).join('');

  // efference
  document.getElementById('efferenceInfo').textContent = `تعداد با تاخیر: ${data.efference_count} — تاخیر 5 تیک`;
  document.getElementById('efferenceList').innerHTML = data.efference.map(e=> `<div>تیک ${e.tick} | الگو ${e.pattern} | ${e.char}</div>`).join('');

  // devices
  document.getElementById('deviceList').innerHTML = data.devices.map(d=> `<div><b>${d.name}</b> ${d.available?'✅':'❌'}<br><small>${d.reason}</small></div>`).join('');

  // events with filter
  const logDiv = document.getElementById('eventLog');
  let events = data.events;
  if (filterType !== 'all') {
    events = events.filter(e=>e.type===filterType);
  }
  logDiv.innerHTML = events.slice().reverse().map(ev=> `
    <div class="ev ${ev.type}"><span class="t">[${ev.tick}] ${ev.type}</span> ${ev.message}</div>
  `).join('');

  // header badge
  const simRunning = data.sim_running;
  const badge = document.getElementById('simStatus');
  badge.textContent = simRunning ? 'در حال فکر...' : 'متوقف';
  badge.className = 'status ' + (simRunning?'running':'paused');
  document.getElementById('btnToggleSim').textContent = simRunning ? '⏸ توقف' : '▶️ ادامه';

  // charts
  tpsHistory.push(data.tps);
  bloodHistory.push(data.blood);
  if (tpsHistory.length>maxPoints) tpsHistory.shift();
  if (bloodHistory.length>maxPoints) bloodHistory.shift();
  drawCharts();
}

function drawCharts(){
  const c1 = document.getElementById('tpsChart');
  const ctx1 = c1.getContext('2d');
  ctx1.clearRect(0,0,c1.width,c1.height);
  ctx1.strokeStyle='#5b8cff'; ctx1.lineWidth=2; ctx1.beginPath();
  const max1 = Math.max(...tpsHistory,10);
  tpsHistory.forEach((v,i)=>{
    const x = (i/maxPoints)*c1.width;
    const y = c1.height - (v/max1)*c1.height;
    if(i===0) ctx1.moveTo(x,y); else ctx1.lineTo(x,y);
  });
  ctx1.stroke();
  // blood
  const c2 = document.getElementById('bloodChart');
  const ctx2 = c2.getContext('2d');
  ctx2.clearRect(0,0,c2.width,c2.height);
  ctx2.strokeStyle='#4ade80'; ctx2.lineWidth=2; ctx2.beginPath();
  const max2 = Math.max(...bloodHistory,100);
  bloodHistory.forEach((v,i)=>{
    const x = (i/maxPoints)*c2.width;
    const y = c2.height - (v/max2)*c2.height;
    if(i===0) ctx2.moveTo(x,y); else ctx2.lineTo(x,y);
  });
  ctx2.stroke();
}

// selection via mouse drag
let isDragging = false;
document.addEventListener('selectionchange', ()=>{
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const text = sel.toString();
  if (text.length>0 && text.length<50) {
    const bar = document.getElementById('selectionInfo');
    bar.classList.remove('hidden');
    document.getElementById('selText').textContent = text;
    document.getElementById('selCount').textContent = text.length;
  }
});

async function toggleMeaning(name, checked){
  await fetchJson('/api/region_mark', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, meaningful:checked, note: checked?'کاربر گفت معناداره':''})});
}
async function scoreRegion(name, score){
  await fetchJson('/api/score_region', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, score})});
}

// scoring from bar
document.addEventListener('click', (e)=>{
  if (e.target.classList.contains('score')) {
    const score = parseInt(e.target.dataset.score);
    scoreChars(selectedChars, score);
  }
});
document.getElementById('btnClearSel').onclick = ()=>{
  selectedChars.forEach(s=>{ if(s.element) s.element.classList.remove('selected'); });
  selectedChars=[];
  document.getElementById('selectionInfo').classList.add('hidden');
  window.getSelection().removeAllRanges();
};
document.getElementById('btnMarkMeaning').onclick = async ()=>{
  const txt = selectedChars.map(s=>s.char).join('');
  if (!txt) return;
  await fetchJson('/api/score', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text:txt, score:10, meaningful:true})});
  selectedChars.forEach(s=>{ if(s.element) s.element.classList.remove('selected'); });
  selectedChars=[];
  document.getElementById('selectionInfo').classList.add('hidden');
  refresh();
};
document.getElementById('btnSelectAll').onclick = ()=>{
  const container = document.getElementById('outputDisplay');
  const spans = container.querySelectorAll('.char');
  selectedChars = [];
  spans.forEach(span=>{
    span.classList.add('selected');
    selectedChars.push({char:span.dataset.char, tick:parseInt(span.dataset.tick), pattern:parseInt(span.dataset.pattern), element:span});
  });
  updateSelectionBar();
};
document.getElementById('btnScoreSelected').onclick = ()=>{
  const modal = document.getElementById('scoreModal');
  const txt = selectedChars.map(s=>s.char).join('');
  document.getElementById('modalText').textContent = txt;
  modal.classList.remove('hidden');
};
document.getElementById('btnCloseModal').onclick = ()=>{
  document.getElementById('scoreModal').classList.add('hidden');
};
document.getElementById('scoreModal').addEventListener('click', (e)=>{
  if (e.target.classList.contains('score')) {
    const score = parseInt(e.target.dataset.score);
    scoreChars(selectedChars, score);
    document.getElementById('scoreModal').classList.add('hidden');
  }
  if (e.target.id==='scoreModal') {
    e.target.classList.add('hidden');
  }
});

document.getElementById('btnToggleSim').onclick = async ()=>{
  const res = await fetchJson('/api/status');
  const newRun = !res.sim_running;
  await fetchJson('/api/sim', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({running:newRun})});
  refresh();
};
document.getElementById('btnTick').onclick = async ()=>{
  await fetchJson('/api/tick', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({n:1})});
  refresh();
};
document.getElementById('btnApplyConfig').onclick = async ()=>{
  const cpu = parseFloat(document.getElementById('inputCpu').value);
  const tmin = parseFloat(document.getElementById('inputTpsMin').value);
  const tmax = parseFloat(document.getElementById('inputTpsMax').value);
  const vm = document.getElementById('inputVm').checked;
  await fetchJson('/api/config', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({cpu_budget:cpu, tps_min:tmin, tps_max:tmax, vm_mode:vm?1:0})});
  refresh();
};
document.getElementById('inputCpu').oninput = e=>{ document.getElementById('valCpu').textContent = e.target.value; };
document.getElementById('btnSendInput').onclick = async ()=>{
  const txt = document.getElementById('inputPersian').value;
  if(!txt) return;
  const res = await fetchJson('/api/input', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text:txt})});
  document.getElementById('inputResult').textContent = `تزریق ${res.bits} بیت، تایید معکوس: ${res.verify}`;
  document.getElementById('inputPersian').value='';
};
document.getElementById('btnInject').onclick = async ()=>{
  const id=document.getElementById('inputInjectId').value;
  const amt=document.getElementById('inputInjectAmt').value;
  await fetchJson('/api/inject', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id:parseInt(id), amount:parseFloat(amt)})});
};
document.getElementById('btnInjectBlood').onclick = async ()=>{
  const amt=document.getElementById('inputBloodAmt').value;
  await fetchJson('/api/inject_blood', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({amount:parseFloat(amt)})});
};
document.getElementById('btnSave').onclick = async ()=>{
  const res=await fetchJson('/api/save', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({path:'gui_model.afu'})});
  alert('ذخیره: '+JSON.stringify(res));
};
document.getElementById('btnCodecTest').onclick = async ()=>{
  const res=await fetchJson('/api/codec_test');
  document.getElementById('codecResult').textContent=`bijection:${res.bijection} ${res.test_in}->${res.bits}->${res.test_out} match=${res.match}`;
};
document.getElementById('btnClearOutput').onclick = ()=>{ document.getElementById('outputDisplay').innerHTML=''; };
document.getElementById('btnClearEvents').onclick = ()=>{ document.getElementById('eventLog').innerHTML=''; };
document.getElementById('btnCreate').onclick = async ()=>{
  const n=parseInt(document.getElementById('inputCreate').value);
  if(!confirm(`مغز جدید با ${n} نورون؟ (حافظه ~${Math.round(n*96/1024)}MB)`)) return;
  await fetchJson('/api/create', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({neurons:n})});
  tpsHistory=[]; bloodHistory=[]; refresh();
};
document.querySelectorAll('.filter').forEach(btn=>{
  btn.onclick=()=>{
    filterType=btn.dataset.filter;
    document.querySelectorAll('.filter').forEach(b=>b.classList.remove('primary'));
    btn.classList.add('primary');
    refresh();
  }
});

async function refresh(){
  try{
    const data=await fetchJson('/api/status');
    updateUI(data);
  }catch(e){ console.error(e); }
}
setInterval(refresh, 700);
refresh();
