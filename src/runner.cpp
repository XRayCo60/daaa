#include "../include/brain.h"
#include "../include/afu.h"
#include "../include/device.h"
#include <iostream>
#include <chrono>
#include <thread>
#include <string>
#include <sstream>
#include <iomanip>
#include <atomic>
#include <csignal>

using namespace daaa;

static std::atomic<bool> g_running{true};

void signalHandler(int) { g_running = false; }

void printHelp() {
    std::cout << R"(
دستورات رانر مغز مصنوعی (AFU Runner):
  help                  - نمایش همین راهنما
  status                - وضعیت مغز: تیک، مانا، نورون‌ها، TPS
  devices               - لیست دستگاه‌ها (CPU/CUDA)
  regions               - لیست ناحیه‌ها و فلگ معنادار
  region mark <name> <0/1> [note] - علامت‌گذاری ناحیه به عنوان معنادار
  run [N]               - اجرای N تیک (پیش‌فرض بی‌نهایت تا Ctrl+C)
  pause                 - توقف حلقه (وقتی run بی‌نهایت است)
  tick [N]              - اجرای دقیقا N تیک و توقف
  input <متن فارسی>     - تزریق ورودی خارجی (تبدیل به 0/1 از طریق کدک معکوس)
  output [N]            - نمایش N حرف آخر خروجی (پیش‌فرض 200)
  efference             - نمایش بافر efference copy
  inject <id> <amount>  - تزریق مانا به نورون خاص
  inject_blood <amount> - تزریق مانا به خون مشترک
  save <file.afu>       - ذخیره مدل در فایل .afu
  load <file.afu>       - بارگذاری مدل از فایل .afu
  cpu <percent>         - تنظیم بودجه CPU (1..100)
  tps <min> <max>       - تنظیم سقف و کف تیک بر ثانیه (مثلاً tps 10 100)
  vm <0/1>              - حالت VM: 0=زبان، 1=کنش به ترمینال VM
  codec_test            - تست bijection کدک (معکوس‌پذیری دقیق)
  create [neurons]      - ساخت مغز جدید با تعداد نورون داده شده
  quit / exit           - خروج

نکته‌ها:
- حداقل ۱۰ تیک بر ثانیه برای حس زمان سریع‌تر (زمان مدل ۱۰ برابر واقعی)
- سقف و کف سرعت + درصد CPU قابل تنظیم است
- سیستم CUDA کامل ولی روی Intel HD 3000 dormat است؛ روی سیستم NVIDIA بدون تغییر کد فعال می‌شود
- کدک: externalInputToBits دقیقا معکوس bitsToPersian است (bijection)
)";
}

int main(int argc, char* argv[]) {
    std::signal(SIGINT, signalHandler);
    std::setlocale(LC_ALL, "");

    BrainConfig cfg;
    cfg.initial_neurons = 512;
    cfg.initial_memory_neurons = 8;
    std::cout << "=== AFU Brain Runner v1 ===\n";
    std::cout << "ساخت مغز اولیه با " << cfg.initial_neurons << " نورون...\n";
    Brain brain(cfg);

    float cpu_percent = 70.0f; // بودجه CPU
    float tps_min = 10.0f; // حداقل طبق نیاز شما
    float tps_max = 100.0f; // سقف

    // اگر فایل ورودی از آرگومان داده شده، لود کن
    if (argc >= 2) {
        std::string path = argv[1];
        if (path.size() > 4 && path.substr(path.size()-4) == ".afu") {
            std::vector<Neuron> neurons;
            std::vector<Region> regions;
            PersianCodec codec;
            double blood; uint64_t tick; std::string err;
            if (AfuFile::load(path, neurons, regions, codec, blood, tick, err)) {
                std::cout << "لود شد: " << path << " tick=" << tick << " blood=" << blood << "\n";
                // TODO: جایگزینی مغز با داده لود شده - فعلاً فقط اطلاعات
                // در نسخه کامل Brain::loadFrom
            } else {
                std::cout << "خطا در لود: " << err << "\n";
            }
        }
    }

    printHelp();

    std::string line;
    auto last_tick_time = std::chrono::steady_clock::now();
    uint64_t last_tick_count = brain.currentTick();
    float current_tps = 0;

    while (g_running) {
        std::cout << "\n[AFU:" << brain.currentTick() << " blood:" << std::fixed << std::setprecision(1) << brain.getBlood() << " TPS:" << current_tps << "]> ";
        std::cout.flush();
        if (!std::getline(std::cin, line)) break;
        if (line.empty()) continue;
        std::istringstream iss(line);
        std::string cmd; iss >> cmd;

        if (cmd == "help" || cmd == "h") {
            printHelp();
        } else if (cmd == "status" || cmd == "s") {
            auto stats = brain.getStats();
            std::cout << "تیک: " << stats.tick << "\n";
            std::cout << "خون (blood): " << stats.blood << "\n";
            std::cout << "نورون زنده: " << stats.alive_neurons << " مرده: " << stats.dead_neurons << " ignore: " << stats.ignore_neurons << " seizure: " << stats.seizure_neurons << "\n";
            std::cout << "کل اسپایک: " << stats.total_spikes << "\n";
            std::cout << "TPS جاری: " << current_tps << " (min=" << tps_min << " max=" << tps_max << ")\n";
            std::cout << "CPU budget: " << cpu_percent << "%\n";
            std::cout << "VM mode: " << (brain.vm_mode ? "کنش - VM" : "زبان - فارسی") << "\n";
            std::cout << "خروجی اخیر: " << brain.getRecentOutput(100) << "\n";
        } else if (cmd == "devices") {
            auto devs = brain.deviceManager().listDevices();
            for (auto &d : devs) {
                std::cout << "- " << d.name << " | CUDA=" << d.is_cuda << " available=" << d.available << " | " << d.reason << "\n";
            }
            std::cout << "بهترین دستگاه: " << brain.deviceManager().bestDevice()->info().name << "\n";
        } else if (cmd == "regions") {
            for (auto &r : brain.regions()) {
                std::cout << "- " << r.name << " kind=" << (int)r.kind << " neurons=" << r.neuron_ids.size() << " meaningful=" << r.meaningful;
                if (!r.meaningful_note.empty()) std::cout << " note=" << r.meaningful_note;
                std::cout << " mana_share=" << r.mana_share << "\n";
            }
        } else if (cmd == "region" || cmd == "r") {
            std::string sub; iss >> sub;
            if (sub == "mark") {
                std::string name; iss >> name;
                int m; iss >> m;
                std::string note; std::getline(iss, note);
                brain.markRegionMeaningful(name, m!=0, note);
                std::cout << "ناحیه " << name << " meaningful=" << m << "\n";
            } else {
                std::cout << "زیر-دستور ناشناس: mark\n";
            }
        } else if (cmd == "run") {
            uint64_t n;
            if (iss >> n) {
                // اجرای محدود
                std::cout << "اجرای " << n << " تیک...\n";
                auto start = std::chrono::steady_clock::now();
                for (uint64_t i=0;i<n && g_running;++i) {
                    brain.tick();
                    // کنترل سرعت: tps_max
                    if (tps_max > 0) {
                        float target_frame = 1.0f / tps_max;
                        // ساده: هر چند تیک sleep
                        if (i % 10 == 0) {
                            // محاسبه زمان واقعی و مقایسه با هدف
                            auto now = std::chrono::steady_clock::now();
                            float elapsed = std::chrono::duration<float>(now - start).count();
                            float expected = i / tps_max;
                            if (expected > elapsed) {
                                int sleep_ms = (expected - elapsed)*1000 * (100.0f / cpu_percent);
                                if (sleep_ms > 0) std::this_thread::sleep_for(std::chrono::milliseconds(sleep_ms));
                            }
                        }
                    }
                    if (current_tps < tps_min) {
                        // اگر خیلی کند بود، هشدار
                    }
                }
                auto now = std::chrono::steady_clock::now();
                float el = std::chrono::duration<float>(now - start).count();
                current_tps = n / (el + 0.001f);
                std::cout << "انجام شد. TPS=" << current_tps << "\n";
            } else {
                // بی‌نهایت با کنترل تیک
                std::cout << "اجرای بی‌نهایت (Ctrl+C برای توقف)...\n";
                auto start = std::chrono::steady_clock::now();
                uint64_t ticks = 0;
                g_running = true;
                while (g_running) {
                    brain.tick();
                    ticks++;
                    // کنترل سقف
                    if (tps_max > 0 && ticks % 10 == 0) {
                        auto now = std::chrono::steady_clock::now();
                        float elapsed = std::chrono::duration<float>(now - start).count();
                        float expected = ticks / tps_max;
                        if (expected > elapsed) {
                            int sleep_ms = (expected - elapsed)*1000;
                            // اعمال بودجه CPU
                            sleep_ms = sleep_ms * (100.0f / cpu_percent);
                            // بودجه کم = sleep بیشتر
                            if (sleep_ms > 0) std::this_thread::sleep_for(std::chrono::milliseconds(sleep_ms));
                        }
                        // به‌روزرسانی TPS هر ثانیه
                        if (elapsed > 1.0f) {
                            current_tps = ticks / elapsed;
                            if (current_tps < tps_min) {
                                std::cout << "\n[هشدار] TPS=" << current_tps << " کمتر از حداقل " << tps_min << " - سیستم کند است (مثلاً i7-2670QM در حد مرز)\n";
                            }
                        }
                    }
                    if (ticks % 100 == 0) {
                        std::cout << "\rتیک " << brain.currentTick() << " blood " << brain.getBlood() << " out:" << brain.getRecentOutput(20) << " TPS:" << current_tps << "   " << std::flush;
                    }
                }
                g_running = true;
                std::cout << "\nتوقف.\n";
            }
        } else if (cmd == "tick") {
            uint64_t n=1;
            iss >> n;
            for (uint64_t i=0;i<n;++i) brain.tick();
            std::cout << "تیک شد -> " << brain.currentTick() << " خروجی: " << brain.getRecentOutput(50) << "\n";
        } else if (cmd == "input") {
            std::string rest;
            std::getline(iss, rest);
            if (!rest.empty() && rest[0]==' ') rest = rest.substr(1);
            if (rest.empty()) { std::cout << "متن فارسی وارد کن: input سلام\n"; continue; }
            brain.injectExternalText(rest);
            auto bits = brain.codec().externalInputToBits(rest);
            std::cout << "متن \"" << rest << "\" -> " << bits.size() << " بیت (0/1) -> تزریق به InputRegion\n";
            std::cout << "بررسی معکوس: bitsToPersian = " << brain.codec().bitsToPersian(bits) << " (باید دقیقاً همان ورودی باشد)\n";
        } else if (cmd == "output") {
            size_t n=200; iss >> n;
            std::cout << "خروجی اخیر (" << n << "): " << brain.getRecentOutput(n) << "\n";
        } else if (cmd == "efference") {
            auto delayed = brain.efference().getDelayed(brain.currentTick());
            std::cout << "بافر efference: " << delayed.size() << " اسلات با تاخیر\n";
            for (size_t i=0;i<std::min<size_t>(delayed.size(),20);++i){
                std::cout << " tick " << delayed[i].tick << " pat " << (int)delayed[i].pattern << " char " << delayed[i].persian_char << "\n";
            }
        } else if (cmd == "inject") {
            uint32_t id; float amount;
            iss >> id >> amount;
            if (id < brain.neurons().size()) {
                brain.neurons()[id].mana += amount;
                std::cout << "تزریق " << amount << " به نورون " << id << " -> mana=" << brain.neurons()[id].mana << "\n";
            } else std::cout << "id نامعتبر\n";
        } else if (cmd == "inject_blood") {
            double amount; iss >> amount;
            brain.manaPool().injectBlood(amount);
            std::cout << "خون + " << amount << " -> " << brain.getBlood() << "\n";
        } else if (cmd == "save") {
            std::string path; iss >> path;
            if (path.empty()) path = "model.afu";
            bool ok = AfuFile::save(path, brain.neurons(), brain.regions(), brain.codec(), brain.getBlood(), brain.currentTick());
            std::cout << (ok ? "ذخیره شد: " : "خطا در ذخیره: ") << path << "\n";
        } else if (cmd == "load") {
            std::string path; iss >> path;
            if (path.empty()) { std::cout << "مسیر فایل را بده: load model.afu\n"; continue; }
            std::vector<Neuron> neurons;
            std::vector<Region> regions;
            PersianCodec codec;
            double blood; uint64_t tick; std::string err;
            if (AfuFile::load(path, neurons, regions, codec, blood, tick, err)) {
                std::cout << "لود شد: " << path << " neurons=" << neurons.size() << " tick=" << tick << " blood=" << blood << "\n";
                // TODO: جایگزینی کامل مغز - فعلاً فقط جایگزینی ساده
                brain.neurons() = std::move(neurons);
                brain.regions() = std::move(regions);
                brain.codec() = std::move(codec);
                // blood و tick باید در brain ست شوند - فعلاً از طریق manaPool
                brain.manaPool().blood = blood;
                std::cout << "مغز جایگزین شد.\n";
            } else {
                std::cout << "خطا: " << err << "\n";
            }
        } else if (cmd == "cpu") {
            float p; iss >> p;
            if (p>=1 && p<=100) { cpu_percent = p; std::cout << "CPU budget = " << cpu_percent << "%\n"; }
            else std::cout << "باید 1..100 باشد\n";
        } else if (cmd == "tps") {
            float mn,mx; iss >> mn >> mx;
            if (mn>0 && mx>=mn) { tps_min=mn; tps_max=mx; std::cout << "TPS min=" << tps_min << " max=" << tps_max << "\n"; }
            else std::cout << "مقادیر نامعتبر\n";
        } else if (cmd == "vm") {
            int v; iss >> v;
            brain.setVmMode(v!=0);
            std::cout << "VM mode = " << (brain.vm_mode ? "1 کنش" : "0 زبان") << "\n";
        } else if (cmd == "codec_test") {
            auto &codec = brain.codec();
            bool bij = codec.verifyBijection();
            std::cout << "Bijection: " << (bij ? "OK - یک به یک و پوشا" : "FAIL") << "\n";
            std::string test = "سلام";
            auto bits = codec.externalInputToBits(test);
            std::string back = codec.bitsToPersian(bits);
            std::cout << "تست: \"" << test << "\" -> bits " << bits.size() << " -> \"" << back << "\"\n";
            std::cout << "معکوس دقیق؟ " << (test==back ? "بله" : "خیر") << "\n";
            // تست همه کاراکترها
            bool all_ok = true;
            for (auto &e : codec.entries()) {
                uint8_t p = codec.encode(e.persian_char_utf8);
                std::string dec = codec.decode(p);
                if (dec != e.persian_char_utf8) { all_ok=false; std::cout << "FAIL: " << e.persian_char_utf8 << " != " << dec << "\n"; }
            }
            std::cout << "تست همه حروف: " << (all_ok ? "OK" : "FAIL") << "\n";
        } else if (cmd == "create") {
            size_t n=512; iss >> n;
            BrainConfig newcfg; newcfg.initial_neurons=n; newcfg.initial_memory_neurons = std::max<size_t>(4, n/64);
            brain.reinit(newcfg);
            std::cout << "مغز جدید با " << n << " نورون ساخته شد\n";
        } else if (cmd == "quit" || cmd == "exit" || cmd == "q") {
            break;
        } else {
            std::cout << "دستور ناشناس: " << cmd << " - help را بزن\n";
        }
    }

    std::cout << "خروج.\n";
    return 0;
}
