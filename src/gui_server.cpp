#include "../include/brain.h"
#include "../include/afu.h"
#include <iostream>
#include <thread>
#include <mutex>
#include <atomic>
#include <chrono>
#include <string>
#include <vector>
#include <sstream>
#include <fstream>
#include <cstring>
#include <cstdlib>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <fcntl.h>
#include <map>

using namespace daaa;

static Brain* g_brain = nullptr;
static std::mutex g_brain_mtx;
static std::atomic<bool> g_running{true};
static std::atomic<bool> g_sim_running{true};
static std::atomic<bool> g_gui_verbose{false};

// برای خواندن فایل استاتیک
std::string readFile(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    if (!f) return "";
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

std::string jsonEscape(const std::string& s) {
    std::string out;
    out.reserve(s.size()+10);
    for (unsigned char c : s) {
        if (c == '"') out += "\\\"";
        else if (c == '\\') out += "\\\\";
        else if (c == '\n') out += "\\n";
        else if (c == '\r') out += "\\r";
        else if (c == '\t') out += "\\t";
        else if (c < 0x20) {
            char buf[10];
            snprintf(buf, sizeof(buf), "\\u%04x", c);
            out += buf;
        } else out += c;
    }
    return out;
}

// ساخت JSON وضعیت
std::string makeStatusJson() {
    std::lock_guard<std::mutex> lock(g_brain_mtx);
    if (!g_brain) return "{\"error\":\"brain null\"}";

    auto stats = g_brain->getStats();
    auto cpu = g_brain->getCpuStats();
    auto regions = g_brain->regions();
    auto events = g_brain->eventLog();
    auto effer = g_brain->efference().getDelayed(g_brain->currentTick());
    std::string recent = g_brain->getRecentOutput(200);

    std::ostringstream oss;
    oss << "{";
    oss << "\"tick\":" << stats.tick << ",";
    oss << "\"blood\":" << stats.blood << ",";
    oss << "\"alive\":" << stats.alive_neurons << ",";
    oss << "\"dead\":" << stats.dead_neurons << ",";
    oss << "\"ignore\":" << stats.ignore_neurons << ",";
    oss << "\"seizure\":" << stats.seizure_neurons << ",";
    oss << "\"total_spikes\":" << stats.total_spikes << ",";
    oss << "\"tps\":" << g_brain->currentTps() << ",";
    oss << "\"tps_min\":" << g_brain->tpsMin() << ",";
    oss << "\"tps_max\":" << g_brain->tpsMax() << ",";
    oss << "\"cpu_budget\":" << g_brain->cpuBudget() << ",";
    oss << "\"cpu_freq_mhz\":" << cpu.freq_mhz << ",";
    oss << "\"cpu_usage_percent\":" << cpu.usage_percent << ",";
    oss << "\"model_speed_x\":" << g_brain->modelSpeedMultiplier() << ",";
    oss << "\"always_thinking\":" << (g_brain->isAlwaysThinking() ? "true" : "false") << ",";
    oss << "\"vm_mode\":" << (g_brain->vm_mode ? "true" : "false") << ",";
    oss << "\"recent_output\":\"" << jsonEscape(recent) << "\",";

    // regions
    oss << "\"regions\":[";
    for (size_t i=0;i<regions.size();++i){
        auto &r = regions[i];
        if (i) oss << ",";
        oss << "{";
        oss << "\"name\":\"" << jsonEscape(r.name) << "\",";
        oss << "\"kind\":" << (int)r.kind << ",";
        oss << "\"neurons\":" << r.neuron_ids.size() << ",";
        oss << "\"meaningful\":" << (r.meaningful?"true":"false") << ",";
        oss << "\"note\":\"" << jsonEscape(r.meaningful_note) << "\",";
        oss << "\"mana_share\":" << r.mana_share;
        oss << "}";
    }
    oss << "],";

    // events last 50
    oss << "\"events\":[";
    size_t start = events.size() > 50 ? events.size()-50 : 0;
    for (size_t i=start;i<events.size();++i){
        if (i!=start) oss << ",";
        auto &e = events[i];
        oss << "{";
        oss << "\"tick\":" << e.tick << ",";
        oss << "\"type\":\"" << jsonEscape(e.type) << "\",";
        oss << "\"message\":\"" << jsonEscape(e.message) << "\",";
        oss << "\"neuron_id\":" << e.neuron_id;
        oss << "}";
    }
    oss << "],";

    // efference delayed
    oss << "\"efference_count\":" << effer.size() << ",";
    oss << "\"efference\":[";
    for (size_t i=0;i<std::min<size_t>(effer.size(), 20); ++i){
        if (i) oss << ",";
        oss << "{\"tick\":" << effer[i].tick << ",\"pattern\":" << (int)effer[i].pattern << ",\"char\":\"" << jsonEscape(effer[i].persian_char) << "\"}";
    }
    oss << "],";

    // devices
    auto devs = g_brain->deviceManager().listDevices();
    oss << "\"devices\":[";
    for (size_t i=0;i<devs.size();++i){
        if (i) oss << ",";
        oss << "{\"name\":\"" << jsonEscape(devs[i].name) << "\",\"is_cuda\":" << (devs[i].is_cuda?"true":"false") << ",\"available\":" << (devs[i].available?"true":"false") << ",\"reason\":\"" << jsonEscape(devs[i].reason) << "\"}";
    }
    oss << "],";

    // memory stats
    size_t normal_mem = 0, memory_personal = 0, memory_storage = 0, count_mem = 0;
    uint64_t total_full_rewrite = 0, total_arch_change = 0, total_forget = 0;
    for (auto &n : g_brain->neurons()){
        if (n.type == NeuronType::MEMORY){
            count_mem++;
            memory_personal += n.personal_memory.size();
            memory_storage += n.storage_memory.size();
            total_full_rewrite += n.full_rewrite_count;
            total_forget += n.forget_counter;
            total_arch_change += (n.ticks_since_arch_change == 0 ? 1 : 0); // تقریبی
        } else {
            normal_mem += n.personal_memory.size();
        }
    }
    // arch_change واقعی از event log بشمار
    size_t ev_arch=0, ev_rew=0, ev_forget=0;
    for (auto &e : events){ if(e.type=="arch_change") ev_arch++; else if(e.type=="full_rewrite") ev_rew++; else if(e.type=="forget") ev_forget++; }
    oss << "\"memory_stats\":{";
    oss << "\"normal_total_kb\":" << (normal_mem/1024) << ",";
    oss << "\"memory_personal_total_kb\":" << (memory_personal/1024) << ",";
    oss << "\"memory_storage_total_kb\":" << (memory_storage/1024) << ",";
    oss << "\"memory_neuron_count\":" << count_mem << ",";
    oss << "\"normal_neuron_count\":" << (g_brain->neurons().size()-count_mem) << ",";
    oss << "\"ratio_percent\":" << (g_brain->neurons().size()? (count_mem*100.0/g_brain->neurons().size()) : 0) << ",";
    oss << "\"total_full_rewrite\":" << total_full_rewrite << ",";
    oss << "\"event_arch_change\":" << ev_arch << ",";
    oss << "\"event_full_rewrite\":" << ev_rew << ",";
    oss << "\"event_forget\":" << ev_forget << ",";
    oss << "\"total_forget\":" << total_forget;
    oss << "},";

    oss << "\"sim_running\":" << (g_sim_running?"true":"false");
    oss << "}";
    return oss.str();
}

// هندل API
std::string handleApi(const std::string& method, const std::string& path, const std::string& body) {
    if (path == "/api/status" && method=="GET") {
        return makeStatusJson();
    }
    if (path == "/api/tick" && method=="POST") {
        // body: {"n":10}
        int n=1;
        // parse ساده
        auto pos = body.find("\"n\"");
        if (pos!=std::string::npos){
            auto colon = body.find(":", pos);
            if (colon!=std::string::npos) n = atoi(body.c_str()+colon+1);
        }
        if (n<=0) n=1;
        if (n>10000) n=10000;
        {
            std::lock_guard<std::mutex> lock(g_brain_mtx);
            g_brain->tickMany(n);
        }
        return "{\"ok\":true,\"ticked\":"+std::to_string(n)+"}";
    }
    if (path == "/api/input" && method=="POST") {
        // body: {"text":"سلام"}
        std::string text;
        auto pos = body.find("\"text\"");
        if (pos!=std::string::npos){
            auto colon = body.find(":", pos);
            auto q1 = body.find("\"", colon);
            auto q2 = body.find("\"", q1+1);
            // نیاز به parse درست utf8 با escape - ساده
            // برای سادگی کل body را بعد از text: می‌گیریم؟
            // اینجا فرض می‌کنیم بدون escape پیچیده
            if (q1!=std::string::npos && q2!=std::string::npos){
                text = body.substr(q1+1, q2-q1-1);
            }
        }
        if (!text.empty()){
            std::lock_guard<std::mutex> lock(g_brain_mtx);
            g_brain->injectExternalText(text);
            // همچنین بافر بیت برای نمایش
            auto bits = g_brain->codec().externalInputToBits(text);
            std::string back = g_brain->codec().bitsToPersian(bits);
            return "{\"ok\":true,\"injected\":\""+jsonEscape(text)+"\",\"bits\":"+std::to_string(bits.size())+",\"verify\":\""+jsonEscape(back)+"\"}";
        }
        return "{\"ok\":false,\"error\":\"no text\"}";
    }
    if (path == "/api/inject_blood" && method=="POST") {
        double amt=5;
        auto pos = body.find("\"amount\"");
        if (pos!=std::string::npos){ auto colon=body.find(":",pos); amt=atof(body.c_str()+colon+1); }
        {
            std::lock_guard<std::mutex> lock(g_brain_mtx);
            g_brain->manaPool().injectBlood(amt);
            g_brain->pushEvent("inject_blood", "تزریق خارجی خون: "+std::to_string(amt), 0);
        }
        return "{\"ok\":true}";
    }
    if (path == "/api/inject" && method=="POST") {
        uint32_t id=0; float amt=10;
        auto p1 = body.find("\"id\""); if (p1!=std::string::npos){ auto c=body.find(":",p1); id=atoi(body.c_str()+c+1); }
        auto p2 = body.find("\"amount\""); if (p2!=std::string::npos){ auto c=body.find(":",p2); amt=atof(body.c_str()+c+1); }
        {
            std::lock_guard<std::mutex> lock(g_brain_mtx);
            if (id < g_brain->neurons().size()){
                g_brain->neurons()[id].mana += amt;
                g_brain->pushEvent("inject", "تزریق مانا "+std::to_string(amt)+" به نورون "+std::to_string(id), id);
            }
        }
        return "{\"ok\":true}";
    }
    if (path == "/api/region_mark" && method=="POST") {
        std::string name; bool meaningful=false; std::string note;
        auto p1 = body.find("\"name\""); if (p1!=std::string::npos){ auto c1=body.find("\"", body.find(":",p1)+1); auto c2=body.find("\"", c1+1); if(c1!=std::string::npos) name=body.substr(c1+1,c2-c1-1); }
        auto p2 = body.find("\"meaningful\""); if (p2!=std::string::npos){ auto c=body.find(":",p2); auto v=body.substr(c+1,10); meaningful = (v.find("true")!=std::string::npos || v.find("1")!=std::string::npos); }
        auto p3 = body.find("\"note\""); if (p3!=std::string::npos){ auto c1=body.find("\"", body.find(":",p3)+1); auto c2=body.find("\"", c1+1); if(c1!=std::string::npos) note=body.substr(c1+1,c2-c1-1); }
        {
            std::lock_guard<std::mutex> lock(g_brain_mtx);
            // چون name ممکن url escape باشد، ساده نگه می‌داریم
            // برای تست InputRegion-نوشتنی
            g_brain->markRegionMeaningful(name, meaningful, note);
            g_brain->pushEvent("region_mark", "ناحیه "+name+" meaningful="+std::to_string(meaningful), 0);
        }
        return "{\"ok\":true}";
    }
    if (path == "/api/config" && method=="POST") {
        float cpu=70, tmin=10, tmax=100; int vm=-1;
        auto getFloat = [&](const std::string& key)->float{
            auto p=body.find("\""+key+"\""); if(p==std::string::npos) return -1; auto c=body.find(":",p); return atof(body.c_str()+c+1);
        };
        float v;
        v=getFloat("cpu_budget"); if(v>=1) { std::lock_guard<std::mutex> lock(g_brain_mtx); g_brain->setCpuBudget(v); }
        v=getFloat("tps_min"); if(v>0) { std::lock_guard<std::mutex> lock(g_brain_mtx); g_brain->setTpsLimits(v, g_brain->tpsMax()); }
        v=getFloat("tps_max"); if(v>0) { std::lock_guard<std::mutex> lock(g_brain_mtx); g_brain->setTpsLimits(g_brain->tpsMin(), v); }
        auto pvm=body.find("\"vm_mode\""); if(pvm!=std::string::npos){ auto c=body.find(":",pvm); int vv=atoi(body.c_str()+c+1); std::lock_guard<std::mutex> lock(g_brain_mtx); g_brain->setVmMode(vv!=0); }
        return "{\"ok\":true}";
    }
    if (path == "/api/sim" && method=="POST") {
        bool run=true;
        auto p=body.find("\"running\""); if(p!=std::string::npos){ auto c=body.find(":",p); std::string vv=body.substr(c+1,10); run = (vv.find("true")!=std::string::npos || vv.find("1")!=std::string::npos); }
        g_sim_running = run;
        return "{\"ok\":true,\"running\":"+(run?std::string("true"):std::string("false"))+"}";
    }
    if (path == "/api/codec_test" && method=="GET") {
        std::lock_guard<std::mutex> lock(g_brain_mtx);
        bool bij = g_brain->codec().verifyBijection();
        std::string txt="سلام";
        auto bits = g_brain->codec().externalInputToBits(txt);
        std::string back = g_brain->codec().bitsToPersian(bits);
        std::ostringstream oss;
        oss << "{\"bijection\":" << (bij?"true":"false") << ",\"test_in\":\"" << jsonEscape(txt) << "\",\"bits\":" << bits.size() << ",\"test_out\":\"" << jsonEscape(back) << "\",\"match\":" << (txt==back?"true":"false") << "}";
        return oss.str();
    }
    if (path == "/api/save" && method=="POST") {
        std::string filepath="model.afu";
        auto p=body.find("\"path\""); if(p!=std::string::npos){ auto c1=body.find("\"", body.find(":",p)+1); auto c2=body.find("\"", c1+1); if(c1!=std::string::npos) filepath=body.substr(c1+1,c2-c1-1); }
        bool ok=false;
        {
            std::lock_guard<std::mutex> lock(g_brain_mtx);
            ok = AfuFile::save(filepath, g_brain->neurons(), g_brain->regions(), g_brain->codec(), g_brain->getBlood(), g_brain->currentTick());
        }
        return std::string("{\"ok\":")+ (ok?"true":"false") +",\"path\":\""+jsonEscape(filepath)+"\"}";
    }
    if (path == "/api/create" && method=="POST") {
        int n=256;
        auto p=body.find("\"neurons\""); if(p!=std::string::npos){ auto c=body.find(":",p); n=atoi(body.c_str()+c+1); }
        if (n<16) n=16; if (n>100000) n=100000;
        {
            std::lock_guard<std::mutex> lock(g_brain_mtx);
            BrainConfig cfg; cfg.initial_neurons=n; cfg.initial_memory_neurons=0; // اتومات حرفه‌ای
            g_brain->reinit(cfg);
        }
        return "{\"ok\":true,\"neurons\":"+std::to_string(n)+"}";
    }
    return "{\"error\":\"unknown api\"}";
}

// سرور ساده
void handleClient(int client_fd) {
    char buffer[16384];
    ssize_t len = recv(client_fd, buffer, sizeof(buffer)-1, 0);
    if (len<=0){ close(client_fd); return; }
    buffer[len]='\0';
    std::string req(buffer);

    // خط اول
    std::istringstream first(req);
    std::string method, path, httpver;
    first >> method >> path >> httpver;

    std::string body;
    auto header_end = req.find("\r\n\r\n");
    if (header_end != std::string::npos){
        body = req.substr(header_end+4);
        // اگر Content-Length بزرگتر از body باشد، بقیه را بخوان
        auto cl_pos = req.find("Content-Length:");
        if (cl_pos != std::string::npos){
            auto cl_end = req.find("\r\n", cl_pos);
            int cl = atoi(req.c_str()+cl_pos+15);
            while ((int)body.size() < cl){
                char extra[4096];
                ssize_t r = recv(client_fd, extra, sizeof(extra),0);
                if (r<=0) break;
                body.append(extra, r);
            }
        }
    }

    // جدا کردن query
    std::string base_path = path;
    auto qpos = path.find("?");
    if (qpos!=std::string::npos) base_path = path.substr(0,qpos);

    std::string response_body;
    std::string content_type = "application/json";
    int status_code = 200;

    if (base_path.rfind("/api/",0)==0){
        response_body = handleApi(method, base_path, body);
    } else {
        // فایل استاتیک
        std::string file_path = base_path;
        if (file_path=="/") file_path="/index.html";
        // امنیت: فقط از gui/
        std::string full = "gui" + file_path;
        std::string content = readFile(full);
        if (content.empty()){
            // اگر نبود، سعی کن dist یا همین پوشه
            content = readFile("." + file_path);
        }
        if (content.empty() && file_path=="/index.html"){
            response_body = "<h1>GUI not found</h1> put files in gui/";
            content_type="text/html";
        } else if (!content.empty()){
            response_body = content;
            if (file_path.find(".html")!=std::string::npos) content_type="text/html; charset=utf-8";
            else if (file_path.find(".js")!=std::string::npos) content_type="application/javascript; charset=utf-8";
            else if (file_path.find(".css")!=std::string::npos) content_type="text/css; charset=utf-8";
            else if (file_path.find(".json")!=std::string::npos) content_type="application/json";
            else content_type="text/plain";
        } else {
            status_code=404;
            response_body="Not found: "+file_path;
            content_type="text/plain";
        }
        // اگر از قبل پر نشده
        if (response_body.empty() && !content.empty()) response_body=content;
    }

    std::ostringstream resp;
    resp << "HTTP/1.1 " << status_code << (status_code==200?" OK":" Not Found") << "\r\n";
    resp << "Content-Type: " << content_type << "\r\n";
    resp << "Access-Control-Allow-Origin: *\r\n";
    resp << "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n";
    resp << "Access-Control-Allow-Headers: Content-Type\r\n";
    resp << "Content-Length: " << response_body.size() << "\r\n";
    resp << "Connection: close\r\n";
    resp << "\r\n";
    resp << response_body;

    std::string rs = resp.str();
    send(client_fd, rs.c_str(), rs.size(), 0);
    close(client_fd);
}

void serverLoop(int port) {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd<0){ perror("socket"); return; }
    int opt=1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    sockaddr_in addr{};
    addr.sin_family=AF_INET;
    addr.sin_addr.s_addr=INADDR_ANY;
    addr.sin_port=htons(port);
    if (bind(server_fd, (sockaddr*)&addr, sizeof(addr))<0){ perror("bind"); return; }
    if (listen(server_fd, 64)<0){ perror("listen"); return; }
    std::cout << "GUI Server listening on 0.0.0.0:" << port << " (preview: https://"<<port<<"-...) \n";

    while (g_running){
        sockaddr_in client_addr{};
        socklen_t clen=sizeof(client_addr);
        int client = accept(server_fd, (sockaddr*)&client_addr, &clen);
        if (client<0){ if (g_running) perror("accept"); continue; }
        std::thread(handleClient, client).detach();
    }
    close(server_fd);
}

void simLoop() {
    auto last = std::chrono::steady_clock::now();
    while (g_running){
        if (g_sim_running){
            auto now = std::chrono::steady_clock::now();
            // محاسبه sleep برای رسیدن به tps_max با بودجه CPU
            float tps_max, cpu_budget;
            {
                std::lock_guard<std::mutex> lock(g_brain_mtx);
                tps_max = g_brain->tpsMax();
                cpu_budget = g_brain->cpuBudget();
            }
            // تیک بزن
            {
                std::lock_guard<std::mutex> lock(g_brain_mtx);
                g_brain->tick();
            }
            // sleep
            if (tps_max>0){
                float target_interval = 1.0f / tps_max;
                // اعمال بودجه: اگر بودجه 70% یعنی 30% باید بیشتر sleep کنی
                target_interval = target_interval * (100.0f / std::max(1.0f, cpu_budget));
                auto after_tick = std::chrono::steady_clock::now();
                float elapsed = std::chrono::duration<float>(after_tick - now).count();
                float sleep_needed = target_interval - elapsed;
                if (sleep_needed>0){
                    std::this_thread::sleep_for(std::chrono::duration<float>(sleep_needed));
                }
            } else {
                std::this_thread::sleep_for(std::chrono::milliseconds(10));
            }
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    }
}

int main(int argc, char* argv[]){
    int port = 8080;
    if (const char* env = std::getenv("PORT")) port = atoi(env);
    if (argc>=2) port = atoi(argv[1]);

    BrainConfig cfg;
    cfg.initial_neurons = 32768;
    cfg.initial_memory_neurons = 0; // اتومات حرفه‌ای 32K
    Brain brain(cfg);
    g_brain = &brain;

    std::cout << "=== AFU GUI Server v2 ===\n";
    std::cout << "مغز اولیه: " << cfg.initial_neurons << " نورون، حافظه‌ای: " << cfg.effectiveMemoryCount() << " (نسبت حرفه‌ای " << (cfg.effectiveMemoryCount()*100.0/cfg.initial_neurons) << "%)\n";
    std::cout << "حافظه هر نورون معمولی: 96KB، حافظه‌ای: 96KB شخصی + 512KB ذخیره\n";
    std::cout << "مدل همواره در حال فکر است (spontaneous firing) حتی بدون ورودی\n";
    std::cout << "نورون حافظه‌ای هر 200 تیک معماری ذخیره‌سازی را تغییر می‌دهد، هر 1000 تیک تمام حافظه را با تابع فعلی بازنویسی می‌کند، و خودش تصمیم می‌گیرد چه چیزی را فراموش کند\n";

    std::thread sim_thread(simLoop);
    serverLoop(port);

    g_running=false;
    sim_thread.join();
    return 0;
}
