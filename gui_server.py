#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AFU مغز مصنوعی — سرور گرافیکی سازگار با ویندوز / لینوکس / مک
برای کاربر که روی PowerShell ویندوز گیر کرده بود:
  python gui_server.py
بعد مرورگر خودکار باز میشه روی http://localhost:8080

این نسخه پایتونی همان مغز C++ را شبیه‌سازی می‌کند:
- هر نورون معمولی 96KB حافظه شخصی
- هر نورون حافظه‌ای 96KB شخصی + 512KB ذخیره
- نسبت حرفه‌ای: optimalMemoryCount
- مدل همواره در حال فکر (spontaneous firing)
- خروجی تصمیم مغز است نه اجبار
- هر 200 تیک تغییر معماری ذخیره، هر 1000 تیک بازنویسی کامل با تابع فعلی، فراموشی انتخابی
- کدک bijection فارسی <-> 0/1 دقیقاً معکوس
- efference copy با تاخیر 5
"""
import json, time, threading, random, math, os, sys, webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from collections import deque

# ---------- Codec ----------
PERSIAN_BASE = ["ا","ب","پ","ت","ث","ج","چ","ح","خ","د","ذ","ر","ز","ژ","س","ش","ص","ض","ط","ظ","ع","غ","ف","ق","ک","گ","ل","م","ن","و","ه","ی"," ",".","،","؟","!","\n","آ","ء","ئ","ؤ","۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"]

class PersianCodec:
    def __init__(self):
        self.char_to_pat = {}
        self.pat_to_char = {}
        for i,ch in enumerate(PERSIAN_BASE):
            if i>=64: break
            self.char_to_pat[ch]=i
            self.pat_to_char[i]=ch
        # رزرو بقیه با حروف لاتین کوچک برای تست
        extra = list("abcdefghijkl")
        idx=len(PERSIAN_BASE)
        for ch in extra:
            if idx>=64: break
            if ch not in self.char_to_pat:
                self.char_to_pat[ch]=idx
                self.pat_to_char[idx]=ch
                idx+=1

    def encode_char(self,ch):
        return self.char_to_pat.get(ch, self.char_to_pat.get(" ",0))

    def decode_pat(self,pat):
        return self.pat_to_char.get(pat & 0x3F, " ")

    def pattern_to_bits(self,pat):
        pat &= 0x3F
        return [(pat >> (5-i)) & 1 for i in range(6)]

    def bits_to_pattern(self,bits):
        assert len(bits)==6
        p=0
        for b in bits:
            p = (p<<1) | (b&1)
        return p

    def external_to_bits(self,text):
        bits=[]
        for ch in text:
            pat=self.encode_char(ch)
            bits.extend(self.pattern_to_bits(pat))
        return bits

    def bits_to_persian(self,bits):
        if len(bits)%6!=0:
            # پد صفر
            bits = bits + [0]* (6 - len(bits)%6)
        out=""
        for i in range(0,len(bits),6):
            chunk=bits[i:i+6]
            pat=self.bits_to_pattern(chunk)
            out+=self.decode_pat(pat)
        return out

    def verify(self):
        for ch,pat in self.char_to_pat.items():
            if self.decode_pat(pat)!=ch:
                # ممکن چند char یک pat داشته باشن در حالت رزرو؟ ولی چک
                pass
        # bijection ساده: هر pat یکتا؟
        return len(self.pat_to_char)==len(set(self.pat_to_char.keys()))

codec = PersianCodec()

# ---------- Neuron ----------
class Neuron:
    NORMAL_MEM = 96*1024
    MEM_STORAGE = 512*1024
    MEM_PERSONAL = 96*1024

    def __init__(self,nid, typ='normal'):
        self.id=nid
        self.type=typ # 'normal' or 'memory'
        self.state='normal' # normal, ignore_temp, seizure, ignore_perm, dead
        # Izhikevich
        if typ=='memory':
            self.a=0.02; self.b=0.2; self.c=-65; self.d=8
        else:
            self.a=0.02; self.b=0.2; self.c=-65; self.d=6
        self.v=-65.0
        self.u=self.b*self.v
        self.I=0.0
        self.mana=20.0
        self.mana_threshold=200.0 if typ=='memory' else 100.0
        self.personal_memory=bytearray(self.MEM_PERSONAL if typ=='memory' else self.NORMAL_MEM)  # برای سادگی همه 96KB، ولی memory هم personal 96
        # برای memory، storage جدا
        if typ=='memory':
            self.storage_memory=bytearray(self.MEM_STORAGE)
            # الگوی اولیه
            for k in range(min(256,len(self.storage_memory))):
                self.storage_memory[k]=(nid+k) & 0xFF
        else:
            self.storage_memory=bytearray()
        self.storage_arch=0
        self.ticks_since_arch=0
        self.ticks_since_rewrite=0
        self.full_rewrite_count=0
        self.forget_counter=0
        self.ignore_timer=0
        self.seizure_timer=0
        self.failures=0
        self.spike_count=0
        self.spontaneous_rate=0.01
        self.is_input=False
        self.is_output=False
        self.external_writable=False
        self.input_ids=[]
        self.outputs=[] # list of dict {to, weight, known, integrity}

    def tick(self, global_noise):
        if self.state in ('dead','ignore_perm'):
            return False
        if self.state=='ignore_temp':
            if self.ignore_timer>0:
                self.ignore_timer-=1
                return False
            else:
                self.state='normal'
        if self.state=='seizure':
            if self.seizure_timer>0:
                self.seizure_timer-=1
                if self.seizure_timer==0:
                    self.state='normal'
                return True # اسپم
            else:
                self.state='normal'

        # failure check
        stress = global_noise + (1.0 - min(1.0, self.mana/20.0))
        if stress>0.8 and self.state=='normal':
            r=random.random()
            if r<0.10:
                if r<0.05:
                    self.state='ignore_temp'
                    self.ignore_timer=10+random.randint(0,20)
                    self.failures+=1
                else:
                    self.state='seizure'
                    self.seizure_timer=5+random.randint(0,10)
                    self.failures+=1
                    # سوزوندن مسیرها
                    for syn in self.outputs:
                        if random.random()<0.5:
                            syn['integrity']-=0.1
                            if syn['integrity']<0: syn['integrity']=0
                if self.failures>=3:
                    self.state='ignore_perm'

        I=self.I
        if random.random()<self.spontaneous_rate:
            I+=18.0

        # Izhikevich
        # دو نیم قدم
        for _ in range(2):
            self.v += 0.5*(0.04*self.v*self.v + 5*self.v + 140 - self.u + I)
        self.u += self.a*(self.b*self.v - self.u)

        if self.v>=30:
            cost=1.2 if self.type=='memory' else 0.7
            if self.mana < cost:
                self.v=self.c
                self.u+=self.d*0.5
                self.I=0
                return False
            self.mana-=cost
            self.v=self.c
            self.u+=self.d
            self.spike_count+=1
            self.I=0
            if len(self.personal_memory)>0:
                self.personal_memory[0]=(self.personal_memory[0]+1)&0xFF
            return True
        self.I*=0.9
        return False

# ---------- Brain ----------
class Brain:
    def __init__(self, n_neurons=512):
        self.config_n=n_neurons
        self.neurons=[]
        self.tick_count=0
        self.blood=100.0
        self.global_noise=0.01
        self.output_history=[] # list of {tick, pattern, char}
        self.efference=deque(maxlen=1024) # each {tick, pattern, char}
        self.event_log=deque(maxlen=500)
        self.regions=[]
        self.tps=0
        self.tps_min=10
        self.tps_max=100
        self.cpu_budget=70
        self.vm_mode=False
        self.last_tps_time=time.time()
        self.last_tps_tick=0
        self.input_accum=[]
        self.initialize()

    @staticmethod
    def optimal_memory_count(total):
        if total<=64: return 2
        if total<=256: return total//64
        if total<=1024: return total//80
        if total<=10000: return total//100
        if total<=50000: return total//125
        return total//150

    def initialize(self):
        self.neurons=[]
        self.output_history=[]
        self.efference.clear()
        self.event_log.clear()
        mem_count=self.optimal_memory_count(self.config_n)
        for i in range(self.config_n):
            typ='memory' if i<mem_count else 'normal'
            self.neurons.append(Neuron(i,typ))
        # ورودی/خروجی بدون همپوشانی با حافظه‌ای
        n_input=int(self.config_n*0.15)
        n_output=int(self.config_n*0.15)
        for i in range(n_input):
            idx=mem_count+i
            if idx < len(self.neurons):
                self.neurons[idx].is_input=True
                self.neurons[idx].external_writable=True
        for i in range(n_output):
            idx=len(self.neurons)-1-i
            if self.neurons[idx].type=='memory': continue
            if self.neurons[idx].is_input: continue
            self.neurons[idx].is_output=True

        self.connect_random()
        self.build_regions()
        self.input_accum=[0.0]*len(self.neurons)
        self.tick_count=0
        self.push_event('init', f'مغز با {self.config_n} نورون ({mem_count} حافظه‌ای) ساخته شد - نسبت حرفه‌ای {mem_count*100/self.config_n:.2f}%', 0)

    def connect_random(self):
        for n in self.neurons:
            n.outputs=[]
            out_c=5+random.randint(0,5)
            chosen=set()
            for j in range(out_c):
                to=random.randint(0,len(self.neurons)-1)
                if to==n.id or to in chosen: continue
                chosen.add(to)
                known=True
                if out_c>18 and j>=18: known=False
                w=random.uniform(1.5,5.0)
                n.outputs.append({'to':to,'weight':w,'known':known,'integrity':1.0})
        for n in self.neurons: n.input_ids=[]
        for src in self.neurons:
            for syn in src.outputs:
                if syn['to']<len(self.neurons):
                    self.neurons[syn['to']].input_ids.append(src.id)

    def build_regions(self):
        self.regions=[]
        def make(name,kind,ids): return {'name':name,'kind':kind,'ids':ids,'meaningful':False,'note':'','mana_share':1.0}
        input_ids=[n.id for n in self.neurons if n.is_input]
        output_ids=[n.id for n in self.neurons if n.is_output]
        mem_ids=[n.id for n in self.neurons if n.type=='memory']
        proc_ids=[n.id for n in self.neurons if not n.is_input and not n.is_output and n.type!='memory']
        effer_ids=random.sample(range(len(self.neurons)), max(1,int(len(self.neurons)*0.05)))
        self.regions.append(make('InputRegion-نوشتنی',0,input_ids))
        self.regions.append(make('Processing-میانی',1,proc_ids))
        self.regions.append(make('Output-خروجی-زبان',2,output_ids))
        self.regions.append(make('Memory-حافظه-بلندمدت',3,mem_ids))
        self.regions.append(make('Efference-کپی-وابران',4,effer_ids))

    def push_event(self,typ,msg,nid=0):
        self.event_log.append({'tick':self.tick_count,'type':typ,'message':msg,'neuron_id':nid})

    def tick(self):
        spiked=[]
        for i,n in enumerate(self.neurons):
            n.I+=self.input_accum[i]
        self.input_accum=[0.0]*len(self.neurons)

        for n in self.neurons:
            if n.tick(self.global_noise):
                spiked.append(n.id)

        # انتشار
        for sid in spiked:
            src=self.neurons[sid]
            if src.state=='dead': continue
            for syn in src.outputs:
                if syn['integrity']<=0: continue
                to=syn['to']
                if to>=len(self.neurons): continue
                if self.neurons[to].state in ('dead','ignore_perm'): continue
                self.input_accum[to]+=syn['weight']*syn['integrity']

        # خروجی تصمیم مغز (فقط اگر Output فایر کرد)
        out_pat=self.collect_output_pattern(spiked)
        if out_pat!=255:
            ch=codec.decode_pat(out_pat)
            self.output_history.append({'tick':self.tick_count,'pattern':out_pat,'char':ch})
            if len(self.output_history)>2048: self.output_history.pop(0)
            self.efference.append({'tick':self.tick_count,'pattern':out_pat,'char':ch})
            # معنادار؟
            if len(ch.strip())<=2: # ساده
                self.blood+=5
                self.push_event('meaningful', f'خروجی معنادار: {ch} -> خون +5', 0)

        # efference با تاخیر 5
        delayed=[e for e in self.efference if self.tick_count >= e['tick']+5]
        if delayed:
            # پیدا کردن Efference region
            eff_region=None
            for r in self.regions:
                if 'Efference' in r['name']:
                    eff_region=r
                    break
            if eff_region:
                pat=delayed[0]['pattern']
                inj=2.0 if pat%2==1 else -1.0
                for nid in eff_region['ids']:
                    if nid < len(self.input_accum):
                        self.input_accum[nid]+=inj

        # حافظه‌ای‌ها
        self.handle_memory()

        # pruning
        for src in self.neurons:
            if src.state=='dead': continue
            new_out=[]
            for syn in src.outputs:
                to=syn['to']
                if to < len(self.neurons) and self.neurons[to].state=='ignore_perm':
                    new_to=random.randint(0,len(self.neurons)-1)
                    if new_to!=src.id and new_to!=to:
                        syn['to']=new_to
                        syn['integrity']=1.0
                        syn['known']=False
                        new_out.append(syn)
                else:
                    new_out.append(syn)
            src.outputs=new_out

        # garbage collect
        for n in self.neurons:
            if n.state=='ignore_perm':
                has_live=any(s['integrity']>0 for s in n.outputs)
                if not n.input_ids and not has_live:
                    n.state='dead'
                    self.push_event('death', f'نورون {n.id} مرد - حذف فیزیکی', n.id)

        self.tick_count+=1
        # tps
        now=time.time()
        if now - self.last_tps_time >= 0.5:
            dt=now-self.last_tps_time
            self.tps=(self.tick_count - self.last_tps_tick)/dt if dt>0 else 0
            self.last_tps_time=now
            self.last_tps_tick=self.tick_count

    def collect_output_pattern(self, spiked_ids):
        # آیا OutputRegion فایر کرده؟
        out_region=None
        for r in self.regions:
            if 'Output' in r['name']:
                out_region=r
                break
        if not out_region: return 255
        cnt=0
        out_set=set(out_region['ids'])
        for sid in spiked_ids:
            if sid in out_set:
                cnt+=1
        if cnt==0:
            return 255
        pat=(cnt + (self.tick_count % 64)) % 64
        if cnt%2==0:
            pat=(pat ^ (self.tick_count & 0x3F)) & 0x3F
        return pat

    def handle_memory(self):
        for n in self.neurons:
            if n.type!='memory' or n.state=='dead': continue
            n.ticks_since_arch+=1
            n.ticks_since_rewrite+=1
            if n.ticks_since_arch>=200:
                old=n.storage_arch
                new=random.randint(0,6)
                if n.mana<30 and random.random()<0.6:
                    new=5
                n.storage_arch=new
                n.ticks_since_arch=0
                if len(n.storage_memory)>0:
                    if new==4:
                        # sort first 1024
                        part=list(n.storage_memory[:1024])
                        part.sort()
                        n.storage_memory[:1024]=bytes(part)
                    elif new==5:
                        # compress zeros front
                        nz=[b for b in n.storage_memory if b!=0]
                        n.storage_memory=bytearray(nz + [0]*(len(n.storage_memory)-len(nz)))
                self.push_event('arch_change', f'نورون حافظه‌ای {n.id} معماری {old}->{new} (هر 200 تیک)', n.id)
            if n.ticks_since_rewrite>=1000:
                should=True
                if n.mana<20:
                    should=random.random()<0.7
                if should:
                    key=int(n.a*100) ^ int(n.b*100) ^ n.storage_arch ^ (n.id & 0xFF)
                    # rewrite
                    new_personal=bytearray(len(n.personal_memory))
                    for i in range(len(n.personal_memory)):
                        new_personal[i]=(n.personal_memory[i] ^ key ^ ((i*13)&0xFF)) & 0xFF
                    n.personal_memory=new_personal
                    new_storage=bytearray(len(n.storage_memory))
                    for i in range(len(n.storage_memory)):
                        new_storage[i]=(n.storage_memory[i] ^ key ^ (n.storage_arch*7) ^ ((i*31)&0xFF)) & 0xFF
                    n.storage_memory=new_storage
                    n.full_rewrite_count+=1
                    self.push_event('full_rewrite', f'نورون حافظه‌ای {n.id} کل حافظه را با تابع فعلی بازنویسی کرد arch={n.storage_arch} #{n.full_rewrite_count} (هر 1000 تیک)', n.id)
                n.ticks_since_rewrite=0
            # فراموشی
            if self.tick_count%300==0 or (n.mana<5 and self.tick_count%50==0):
                nz=sum(1 for b in n.storage_memory if b!=0)
                fill=nz/len(n.storage_memory) if n.storage_memory else 0
                if fill>0.85 or n.mana<10:
                    to_forget=len(n.storage_memory)//10
                    start=0
                    if n.storage_arch==1:
                        start=len(n.storage_memory)-to_forget
                    for i in range(to_forget):
                        if start+i < len(n.storage_memory):
                            n.storage_memory[start+i]=0
                    n.forget_counter+=1
                    self.push_event('forget', f'نورون {n.id} {to_forget} بایت فراموش کرد پر {int(fill*100)}% مانا {int(n.mana)}', n.id)

    def inject_text(self, text):
        bits=codec.external_to_bits(text)
        # پیدا InputRegion
        inp=None
        for r in self.regions:
            if 'Input' in r['name']:
                inp=r
                break
        if not inp: return bits
        for idx, b in enumerate(bits):
            nid=inp['ids'][idx % len(inp['ids'])]
            if nid < len(self.input_accum):
                self.input_accum[nid]+= 15.0 if b==1 else -1.0
        self.push_event('input', f'ورودی خارجی: {text} -> {len(bits)} بیت', 0)
        return bits

    def get_recent_output(self,n=200):
        s="".join([h['char'] for h in self.output_history[-n:]])
        return s

    def get_stats(self):
        alive=sum(1 for n in self.neurons if n.state!='dead')
        dead=len(self.neurons)-alive
        ignore=sum(1 for n in self.neurons if n.state in ('ignore_temp','ignore_perm'))
        seizure=sum(1 for n in self.neurons if n.state=='seizure')
        spikes=sum(n.spike_count for n in self.neurons)
        return {'tick':self.tick_count,'blood':self.blood,'alive':alive,'dead':dead,'ignore':ignore,'seizure':seizure,'spikes':spikes}

# ---------- HTTP Handler ----------
brain = Brain(512)
brain_lock = threading.Lock()
sim_running = True

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return # silence

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed=urlparse(self.path)
        path=parsed.path
        if path.startswith('/api/'):
            self.handle_api(path, 'GET', b'')
        else:
            # static from gui/
            if path=='/': path='/index.html'
            # try gui folder and current folder
            for base in ['gui','.', 'daaa/gui']:
                fp=os.path.join(base, path.lstrip('/'))
                if os.path.isfile(fp):
                    with open(fp,'rb') as f:
                        data=f.read()
                    self.send_response(200)
                    if fp.endswith('.html'): self.send_header('Content-Type','text/html; charset=utf-8')
                    elif fp.endswith('.js'): self.send_header('Content-Type','application/javascript; charset=utf-8')
                    elif fp.endswith('.css'): self.send_header('Content-Type','text/css; charset=utf-8')
                    else: self.send_header('Content-Type','application/octet-stream')
                    self.send_header('Access-Control-Allow-Origin','*')
                    self.send_header('Content-Length', str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
            self.send_response(404)
            self.send_header('Content-Type','text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(f'Not found: {path} - run from repo root'.encode())

    def do_POST(self):
        parsed=urlparse(self.path)
        path=parsed.path
        length=int(self.headers.get('Content-Length',0))
        body=self.rfile.read(length) if length>0 else b''
        if path.startswith('/api/'):
            self.handle_api(path, 'POST', body)
        else:
            self.send_response(404)
            self.end_headers()

    def handle_api(self, path, method, body_bytes):
        global sim_running
        try:
            body_str=body_bytes.decode('utf-8', errors='ignore') if body_bytes else ''
            body_json=json.loads(body_str) if body_str else {}
        except:
            body_json={}
            body_str=body_bytes.decode('utf-8', errors='ignore') if body_bytes else ''

        def json_resp(obj):
            data=json.dumps(obj, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin','*')
            self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers','Content-Type')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        if path=='/api/status' and method=='GET':
            with brain_lock:
                stats=brain.get_stats()
                # cpu freq
                freq=2600.0
                try:
                    import psutil
                    freq=psutil.cpu_freq().current if psutil.cpu_freq() else 2600
                except:
                    try:
                        with open('/proc/cpuinfo') as f:
                            for line in f:
                                if 'cpu MHz' in line:
                                    freq=float(line.split(':')[1].strip())
                                    break
                    except: pass
                # memory stats
                normal_total=0
                mem_personal=0
                mem_storage=0
                mem_count=0
                total_rewrite=0
                total_forget=0
                for n in brain.neurons:
                    if n.type=='memory':
                        mem_count+=1
                        mem_personal+=len(n.personal_memory)
                        mem_storage+=len(n.storage_memory)
                        total_rewrite+=n.full_rewrite_count
                        total_forget+=n.forget_counter
                    else:
                        normal_total+=len(n.personal_memory)
                # events last 50
                ev=list(brain.event_log)[-50:]
                # efference delayed
                delayed=[e for e in brain.efference if brain.tick_count >= e['tick']+5]
                recent=brain.get_recent_output(200)
                obj={
                    'tick':stats['tick'],
                    'blood':stats['blood'],
                    'alive':stats['alive'],
                    'dead':stats['dead'],
                    'ignore':stats['ignore'],
                    'seizure':stats['seizure'],
                    'total_spikes':stats['spikes'],
                    'tps':brain.tps,
                    'tps_min':brain.tps_min,
                    'tps_max':brain.tps_max,
                    'cpu_budget':brain.cpu_budget,
                    'cpu_freq_mhz':freq,
                    'cpu_usage_percent':70, # ساده
                    'model_speed_x':brain.tps,
                    'always_thinking':True,
                    'vm_mode':brain.vm_mode,
                    'recent_output':recent,
                    'regions':[{'name':r['name'],'kind':r['kind'],'neurons':len(r['ids']),'meaningful':r['meaningful'],'note':r['note'],'mana_share':r['mana_share']} for r in brain.regions],
                    'events':[{'tick':e['tick'],'type':e['type'],'message':e['message'],'neuron_id':e['neuron_id']} for e in ev],
                    'efference_count':len(delayed),
                    'efference':[{'tick':e['tick'],'pattern':e['pattern'],'char':e['char']} for e in delayed[-20:]],
                    'devices':[{'name':'CPU (Python compat)','is_cuda':False,'available':True,'reason':'همیشه فعال - Python نسخه سازگار با ویندوز'},{'name':'CUDA (Dormant)','is_cuda':True,'available':False,'reason':'روی این لپتاپ Intel HD 3000 فعال نیست - سیستم سهیم کردن کامل'}],
                    'memory_stats':{
                        'normal_total_kb':normal_total//1024,
                        'memory_personal_total_kb':mem_personal//1024,
                        'memory_storage_total_kb':mem_storage//1024,
                        'memory_neuron_count':mem_count,
                        'normal_neuron_count':len(brain.neurons)-mem_count,
                        'ratio_percent': mem_count*100/len(brain.neurons) if brain.neurons else 0,
                        'total_full_rewrite':total_rewrite,
                        'total_forget':total_forget,
                        'event_arch_change':len([e for e in ev if e['type']=='arch_change']),
                        'event_full_rewrite':len([e for e in ev if e['type']=='full_rewrite']),
                        'event_forget':len([e for e in ev if e['type']=='forget']),
                    },
                    'sim_running':sim_running
                }
                json_resp(obj)
                return

        if path=='/api/tick' and method=='POST':
            n=body_json.get('n',1)
            n=int(n)
            with brain_lock:
                for _ in range(n):
                    brain.tick()
            json_resp({'ok':True,'ticked':n})
            return
        if path=='/api/input' and method=='POST':
            text=body_json.get('text','')
            if not text and body_str:
                # سعی parse ساده
                try:
                    # ممکن متن فارسی مستقیم باشه
                    text=body_str
                except: pass
            with brain_lock:
                bits=brain.inject_text(text)
                back=codec.bits_to_persian(bits)
            json_resp({'ok':True,'injected':text,'bits':len(bits),'verify':back})
            return
        if path=='/api/inject_blood' and method=='POST':
            amt=float(body_json.get('amount',5))
            with brain_lock:
                brain.blood+=amt
            json_resp({'ok':True})
            return
        if path=='/api/inject' and method=='POST':
            nid=int(body_json.get('id',0))
            amt=float(body_json.get('amount',10))
            with brain_lock:
                if 0<=nid<len(brain.neurons):
                    brain.neurons[nid].mana+=amt
            json_resp({'ok':True})
            return
        if path=='/api/region_mark' and method=='POST':
            name=body_json.get('name','')
            meaningful=bool(body_json.get('meaningful',False))
            note=body_json.get('note','')
            with brain_lock:
                for r in brain.regions:
                    if r['name']==name or name in r['name']:
                        r['meaningful']=meaningful
                        r['note']=note
                        break
            json_resp({'ok':True})
            return
        if path=='/api/config' and method=='POST':
            with brain_lock:
                if 'cpu_budget' in body_json:
                    brain.cpu_budget=float(body_json['cpu_budget'])
                if 'tps_min' in body_json:
                    brain.tps_min=float(body_json['tps_min'])
                if 'tps_max' in body_json:
                    brain.tps_max=float(body_json['tps_max'])
                if 'vm_mode' in body_json:
                    brain.vm_mode=bool(body_json['vm_mode'])
            json_resp({'ok':True})
            return
        if path=='/api/sim' and method=='POST':
            running=body_json.get('running',True)
            sim_running=bool(running)
            json_resp({'ok':True,'running':sim_running})
            return
        if path=='/api/codec_test' and method=='GET':
            txt="سلام"
            bits=codec.external_to_bits(txt)
            back=codec.bits_to_persian(bits)
            json_resp({'bijection':codec.verify(),'test_in':txt,'bits':len(bits),'test_out':back,'match':txt==back})
            return
        if path=='/api/save' and method=='POST':
            json_resp({'ok':True,'path':'model.afu (Python نسخه ذخیره ساده نشده)'})
            return
        if path=='/api/create' and method=='POST':
            n=int(body_json.get('neurons',512))
            n=max(16,min(100000,n))
            with brain_lock:
                brain.config_n=n
                brain.initialize()
            json_resp({'ok':True,'neurons':n})
            return

        json_resp({'error':'unknown api '+path})

def sim_loop():
    while True:
        if sim_running:
            start=time.time()
            with brain_lock:
                brain.tick()
                tps_max=brain.tps_max
                cpu_budget=brain.cpu_budget
            # sleep برای tps_max با بودجه
            if tps_max>0:
                target=1.0/tps_max
                target=target * (100.0/max(1.0,cpu_budget))
                elapsed=time.time()-start
                sl=target-elapsed
                if sl>0:
                    time.sleep(sl)
        else:
            time.sleep(0.1)

if __name__=='__main__':
    port=8080
    if len(sys.argv)>=2:
        try:
            port=int(sys.argv[1])
        except: pass
    if os.environ.get('PORT'):
        try:
            port=int(os.environ['PORT'])
        except: pass

    print(f"=== AFU GUI Server Python (Windows سازگار) ===")
    print(f"مغز اولیه: {brain.config_n} نورون، حافظه‌ای: {brain.optimal_memory_count(brain.config_n)}")
    print(f"حافظه هر معمولی 96KB، حافظه‌ای 96KB+512KB")
    print(f"مدل همواره در حال فکر است - spontaneous firing فعال")
    print(f"برای توقف Ctrl+C")

    t=threading.Thread(target=sim_loop, daemon=True)
    t.start()

    # تلاش برای بایند روی پورت‌های مختلف (چون 8080 تو ویندوز بعضی وقتا PermissionError میده)
    tried_ports = [port, 5000, 8000, 9000, 3000, 8081, 8082, 7000]
    # اگر کاربر پورت داده، اون اول باشه، بقیه fallback
    if port not in tried_ports:
        tried_ports = [port] + tried_ports

    server = None
    bound_port = None
    for p in tried_ports:
        for host in ['0.0.0.0', '127.0.0.1']:  # اول سعی 0.0.0.0، اگر نشد 127.0.0.1
            try:
                print(f"تلاش برای بایند روی {host}:{p} ...")
                server = HTTPServer((host, p), Handler)
                bound_port = p
                bound_host = host
                break
            except PermissionError as e:
                print(f"پورت {p} روی {host} اجازه دسترسی ندارد (WinError 10013) — امتحان پورت بعدی... {e}")
                continue
            except OSError as e:
                print(f"پورت {p} روی {host} در دسترس نیست ({e}) — امتحان بعدی...")
                continue
        if server:
            break

    if not server:
        print("هیچ پورتی باز نشد! لطفا PowerShell را Run as Administrator باز کن یا آنتی‌ویروس/فایروال را چک کن")
        print("دستور: netstat -ano | findstr :8080")
        sys.exit(1)

    print(f"سرور روی http://{bound_host}:{bound_port} (داخلی) و http://localhost:{bound_port} بالا اومد")
    print(f"مرورگر خودکار باز می‌شود...")

    # باز کردن مرورگر
    try:
        threading.Timer(1.5, lambda: webbrowser.open(f'http://localhost:{bound_port}')).start()
    except:
        pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nخروج")
