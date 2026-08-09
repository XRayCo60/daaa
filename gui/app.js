let simRunning = true;
let tpsHistory = [];
const maxTpsPoints = 60;

async function fetchJson(url, opts={}) {
  const r = await fetch(url, opts);
  return await r.json();
}

function updateUI(data){
  document.getElementById('statTick').textContent = data.tick;
  document.getElementById('statBlood').textContent = data.blood.toFixed(1);
  document.getElementById('statTps').textContent = data.tps.toFixed(1);
  document.getElementById('statTpsMin').textContent = data.tps_min;
  document.getElementById('statTpsMax').textContent = data.tps_max;
  document.getElementById('statSpeed').textContent = data.model_speed_x.toFixed(1) + 'x';
  document.getElementById('statSpikes').textContent = data.total_spikes;
  document.getElementById('statAlive').textContent = data.alive;
  document.getElementById('statDead').textContent = data.dead;
  document.getElementById('statIgnore').textContent = data.ignore;
  document.getElementById('statSeizure').textContent = data.seizure;

  document.getElementById('statCpuFreq').textContent = data.cpu_freq_mhz.toFixed(0) + ' MHz';
  document.getElementById('statCpuBudget').textContent = data.cpu_budget + '%';
  document.getElementById('statCpuUsage').textContent = data.cpu_usage_percent.toFixed(1) + '%';
  document.getElementById('cpuBar').style.width = Math.min(100, data.cpu_usage_percent) + '%';

  document.getElementById('statBestDevice').textContent = data.devices.find(d=>d.available && !d.is_cuda)?.name || data.devices[0]?.name || 'CPU';
  document.getElementById('deviceList').innerHTML = data.devices.map(d=> `<div>${d.name} | ${d.available?'✅':'❌ دورمانت'}<br><small>${d.reason}</small></div>`).join('');

  // memory
  if (data.memory_stats){
    document.getElementById('statRatio').textContent = data.memory_stats.ratio_percent.toFixed(2) + '%';
    document.getElementById('statMemCount').textContent = `(${data.memory_stats.memory_neuron_count} از ${data.memory_stats.memory_neuron_count + data.memory_stats.normal_neuron_count})`;
    document.getElementById('memStats').innerHTML = `معمولی: ${data.memory_stats.normal_total_kb}KB (${data.memory_stats.normal_neuron_count} نورون × 96KB)<br>حافظه‌ای شخصی: ${data.memory_stats.memory_personal_total_kb}KB<br>حافظه‌ای ذخیره: ${data.memory_stats.memory_storage_total_kb}KB<br>کل: ${(data.memory_stats.normal_total_kb + data.memory_stats.memory_personal_total_kb + data.memory_stats.memory_storage_total_kb)}KB`;
  }

  // output
  const outBox = document.getElementById('outputDisplay');
  if (data.recent_output) {
    outBox.textContent = data.recent_output;
    // auto scroll? keep at bottom? it's rtl so top.
  } else {
    outBox.textContent = '(خروجی نداریم — مغز تصمیم گرفته سکوت کنه، چون خروجی یک تصمیمه)';
  }

  // efference
  document.getElementById('efferenceInfo').textContent = `تعداد اسلات با تاخیر: ${data.efference_count} — تاخیر ۵ تیک`;
  document.getElementById('efferenceList').innerHTML = data.efference.map(e=> `<div>تیک ${e.tick} | الگو ${e.pattern} | حرف ${e.char}</div>`).join('');

  // regions
  const regionsDiv = document.getElementById('regionsList');
  regionsDiv.innerHTML = data.regions.map(r=> `
    <div style="border:1px solid #2a3555;border-radius:8px;padding:6px;margin:6px 0;background:#0c0f18">
      <div><b>${r.name}</b> (${r.neurons} نورون) — ${r.kind}</div>
      <div>معنادار: <input type="checkbox" ${r.meaningful?'checked':''} onchange="toggleMeaning('${r.name}', this.checked)"></div>
      <div class="small">یادداشت: ${r.note || '(ندارد)'} | سهم مانا: ${r.mana_share}</div>
    </div>
  `).join('');

  // events
  const logDiv = document.getElementById('eventLog');
  logDiv.innerHTML = data.events.slice().reverse().map(ev=> `
    <div class="ev ${ev.type}"><span class="t">[${ev.tick}] ${ev.type}</span> ${ev.message}</div>
  `).join('');

  // sim status badge
  simRunning = data.sim_running;
  const badge = document.getElementById('simStatus');
  badge.textContent = simRunning ? 'در حال اجرا — مدل همواره در حال فکر است' : 'متوقف (دخالت دستی)';
  badge.className = 'badge ' + (simRunning?'running':'paused');
  document.getElementById('btnToggleSim').textContent = simRunning ? '⏸ توقف شبیه‌سازی' : '▶️ ادامه فکر کردن';

  // tps history
  tpsHistory.push(data.tps);
  if (tpsHistory.length > maxTpsPoints) tpsHistory.shift();
  drawChart();
}

function drawChart(){
  const canvas = document.getElementById('tpsChart');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = '#4a8cff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const max = Math.max(...tpsHistory, 10);
  tpsHistory.forEach((v,i)=>{
    const x = (i / maxTpsPoints) * canvas.width;
    const y = canvas.height - (v / max) * canvas.height;
    if (i==0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  ctx.fillStyle='#7a8ab0';
  ctx.font='10px sans-serif';
  ctx.fillText('max '+max.toFixed(0), 2, 12);
}

async function refresh(){
  try{
    const data = await fetchJson('/api/status');
    updateUI(data);
  }catch(e){ console.error(e); }
}

async function toggleMeaning(name, checked){
  await fetchJson('/api/region_mark', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, meaningful: checked, note: checked?'کاربر گفت این بخش معناداره':''})});
  refresh();
}

document.getElementById('btnToggleSim').onclick = async ()=>{
  const newRun = !simRunning;
  await fetchJson('/api/sim', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({running: newRun})});
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
  await fetchJson('/api/config', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({cpu_budget: cpu, tps_min: tmin, tps_max: tmax, vm_mode: vm?1:0})});
  refresh();
};
document.getElementById('inputCpu').oninput = e=>{
  document.getElementById('valCpu').textContent = e.target.value;
};
document.getElementById('btnSendInput').onclick = async ()=>{
  const txt = document.getElementById('inputPersian').value;
  if (!txt) return;
  const res = await fetchJson('/api/input', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text: txt})});
  document.getElementById('inputResult').textContent = `تزریق شد: ${res.injected} -> ${res.bits} بیت -> تایید معکوس: ${res.verify}`;
};
document.getElementById('btnInject').onclick = async ()=>{
  const id = document.getElementById('inputInjectId').value;
  const amt = document.getElementById('inputInjectAmt').value;
  await fetchJson('/api/inject', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id: parseInt(id), amount: parseFloat(amt)})});
};
document.getElementById('btnInjectBlood').onclick = async ()=>{
  const amt = document.getElementById('inputBloodAmt').value;
  await fetchJson('/api/inject_blood', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({amount: parseFloat(amt)})});
};
document.getElementById('btnSave').onclick = async ()=>{
  const res = await fetchJson('/api/save', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({path: 'gui_model.afu'})});
  alert('ذخیره: '+JSON.stringify(res));
};
document.getElementById('btnCodecTest').onclick = async ()=>{
  const res = await fetchJson('/api/codec_test');
  document.getElementById('codecResult').textContent = `bijection: ${res.bijection}, ورودی ${res.test_in} -> ${res.bits} بیت -> خروجی ${res.test_out} | match=${res.match} (تابع ورودی به 0/1 دقیقاً معکوس الگو به حرف فارسی)`;
};
document.getElementById('btnClearOutput').onclick = ()=>{
  document.getElementById('outputDisplay').textContent='';
};
document.getElementById('btnClearEvents').onclick = async ()=>{
  // فقط نمایش پاک می‌شود، سرور هم می‌تواند نگه دارد — فعلاً فقط رفرش
  document.getElementById('eventLog').innerHTML='';
};
document.getElementById('btnCreate').onclick = async ()=>{
  const n = parseInt(document.getElementById('inputCreate').value);
  if (!confirm(`مغز جدید با ${n} نورون؟ (نسبت حافظه‌ای اتومات حرفه‌ای محاسبه می‌شود)`)) return;
  await fetchJson('/api/create', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({neurons: n})});
  refresh();
};

// auto refresh
setInterval(refresh, 800);
refresh();
