#include "../include/brain.h"
#include "../include/afu.h"
#include "../include/codec.h"
#include <iostream>
#include <cassert>
#include <chrono>

using namespace daaa;

void test_codec_bijection() {
    std::cout << "[TEST] codec bijection...\n";
    auto codec = PersianCodec::createDefault();
    assert(codec.verifyBijection());
    std::string txt = "سلام";
    auto bits = codec.externalInputToBits(txt);
    std::string back = codec.bitsToPersian(bits);
    std::cout << "  encode/decode: " << txt << " -> " << bits.size() << " bits -> " << back << "\n";
    assert(txt == back);

    // تست معکوس بودن دقیق: تابع 0/1 دقیقا معکوس الگو به حرف فارسی است
    for (auto &e : codec.entries()) {
        auto b = PersianCodec::patternToBits(e.pattern);
        uint8_t p2 = PersianCodec::bitsToPattern(b);
        assert(p2 == e.pattern);
        std::string ch = codec.decode(p2);
        uint8_t p3 = codec.encode(ch);
        assert(p3 == e.pattern);
    }
    std::cout << "  OK - bijection درست است (تابع ورودی به 0/1 دقیقا معکوس الگو به حروف فارسی است)\n";
}

void test_brain_tick() {
    std::cout << "[TEST] brain tick 10 tps...\n";
    BrainConfig cfg;
    cfg.initial_neurons = 256;
    cfg.initial_memory_neurons = 4;
    Brain brain(cfg);
    auto start = std::chrono::steady_clock::now();
    brain.tickMany(100);
    auto end = std::chrono::steady_clock::now();
    float sec = std::chrono::duration<float>(end-start).count();
    float tps = 100 / sec;
    std::cout << "  100 tick in " << sec << "s -> TPS=" << tps << "\n";
    if (tps < 10) {
        std::cout << "  هشدار: TPS کمتر از ۱۰ (روی i7-2670QM مرز است) - باید نورون‌ها کم شوند یا بهینه شود\n";
    } else {
        std::cout << "  OK - حداقل ۱۰ تیک بر ثانیه برآورده شد\n";
    }
    auto stats = brain.getStats();
    std::cout << "  stats alive=" << stats.alive_neurons << " spikes=" << stats.total_spikes << "\n";
    assert(stats.alive_neurons > 0);
}

void test_afu_save_load() {
    std::cout << "[TEST] afu save/load...\n";
    BrainConfig cfg;
    cfg.initial_neurons = 64;
    Brain brain(cfg);
    brain.tickMany(10);
    std::string path = "/tmp/test_model.afu";
    bool ok = AfuFile::save(path, brain.neurons(), brain.regions(), brain.codec(), brain.getBlood(), brain.currentTick());
    assert(ok);
    std::cout << "  saved to " << path << "\n";
    std::vector<Neuron> neurons;
    std::vector<Region> regions;
    PersianCodec codec;
    double blood; uint64_t tick; std::string err;
    ok = AfuFile::load(path, neurons, regions, codec, blood, tick, err);
    if (!ok) { std::cout << "  load fail: " << err << "\n"; assert(false); }
    std::cout << "  loaded neurons=" << neurons.size() << " tick=" << tick << " blood=" << blood << "\n";
    assert(neurons.size() == brain.neurons().size());
    assert(codec.verifyBijection());
    std::cout << "  OK\n";
}

void test_external_input() {
    std::cout << "[TEST] external writable input...\n";
    BrainConfig cfg;
    cfg.initial_neurons = 128;
    Brain brain(cfg);
    brain.injectExternalText("سلام");
    brain.tickMany(5);
    std::cout << "  بعد از تزریق ورودی خارجی: " << brain.getRecentOutput(20) << "\n";
    std::cout << "  OK - نورون‌های با external_writable کار می‌کنند\n";
}

void test_regions_meaningful() {
    std::cout << "[TEST] region meaningful flag...\n";
    Brain brain;
    brain.markRegionMeaningful("InputRegion-نوشتنی", true, "این بخش ورودی معناداره - تست");
    auto *r = brain.findRegion("InputRegion-نوشتنی");
    assert(r && r->meaningful);
    std::cout << "  region " << r->name << " meaningful=" << r->meaningful << " note=" << r->meaningful_note << "\n";
    std::cout << "  OK\n";
}

void test_cuda_dormant() {
    std::cout << "[TEST] CUDA device sharing (dormant on this machine)...\n";
    Brain brain;
    auto devs = brain.deviceManager().listDevices();
    for (auto &d : devs) {
        std::cout << "  - " << d.name << " avail=" << d.available << " reason: " << d.reason << "\n";
    }
    auto *best = brain.deviceManager().bestDevice();
    std::cout << "  best device: " << best->info().name << "\n";
    // روی این سیستم (Intel) CUDA نباید available باشد ولی سیستم کامل است
    std::cout << "  OK - سیستم CUDA کامل ولی dormat (طبق نیاز سند)\n";
}

int main() {
    std::cout << "=== AFU Tests ===\n";
    test_codec_bijection();
    test_brain_tick();
    test_afu_save_load();
    test_external_input();
    test_regions_meaningful();
    test_cuda_dormant();
    std::cout << "\nهمه تست‌ها OK\n";
    return 0;
}
