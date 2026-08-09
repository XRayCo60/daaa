#pragma once
// مغز: گراف نامنظم نورون‌ها + ناحیه‌ها + مانا + efference + VM mode

#include "neuron.h"
#include "regions.h"
#include "mana.h"
#include "codec.h"
#include "device.h"
#include <vector>
#include <random>
#include <cstdint>
#include <string>

namespace daaa {

struct BrainConfig {
    size_t initial_neurons = 256; // برای تست اولیه، بعداً 10k..100k
    size_t initial_memory_neurons = 4;
    float connection_prob = 0.05f; // احتمال اتصال بین دو نورون
    uint64_t seed = 42;
    float noise_level = 0.01f;
};

class Brain {
public:
    Brain(const BrainConfig& cfg = BrainConfig{});
    ~Brain();

    // ساخت گراف اولیه
    void initialize();

    // یک تیک کامل: محاسبه نورون‌ها + انتشار سیگنال + اقتصاد مانا + efference
    void tick();

    // گرفتن چند تیک با کنترل سرعت
    void tickMany(uint64_t n);

    // ورودی خارجی: متن فارسی -> بیت 0/1 -> تزریق به نورون‌های InputRegion
    void injectExternalText(const std::string& persian_text);

    // خروجی: آخرین حروف تولید شده
    std::string getRecentOutput(size_t last_n_chars = 100) const;

    // دسترسی‌ها
    std::vector<Neuron>& neurons() { return neurons_; }
    const std::vector<Neuron>& neurons() const { return neurons_; }
    ManaPool& manaPool() { return mana_pool_; }
    EfferenceBuffer& efference() { return efference_; }
    PersianCodec& codec() { return codec_; }
    std::vector<Region>& regions() { return regions_; }

    uint64_t currentTick() const { return current_tick_; }
    double getBlood() const { return mana_pool_.blood; }

    // ناحیه‌بندی
    Region* findRegion(const std::string& name);
    void markRegionMeaningful(const std::string& name, bool meaningful, const std::string& note="");

    // جوانه‌زنی دستی
    uint32_t sproutNeuron(uint32_t parent_id);

    // آمار
    struct Stats {
        uint64_t total_spikes = 0;
        uint64_t alive_neurons = 0;
        uint64_t dead_neurons = 0;
        uint64_t ignore_neurons = 0;
        uint64_t seizure_neurons = 0;
        double blood = 0;
        uint64_t tick = 0;
        float tps = 0; // تیک بر ثانیه
    };
    Stats getStats() const;

    void reinit(const BrainConfig& cfg) {
        config_ = cfg;
        initialize();
    }

    // VM mode
    bool vm_mode = false;
    void setVmMode(bool v) { vm_mode = v; }

    // نویز سراسری (برای تنبیه نویز)
    void setNoise(float f) { global_noise_ = f; }

    // Device manager
    DeviceManager& deviceManager() { return device_manager_; }

    // کلمه معنادار: چک ساده با دیکشنری کوچک
    bool isMeaningfulWord(const std::string& word) const;
    void onMeaningfulOutput(const std::string& word);

private:
    BrainConfig config_;
    std::vector<Neuron> neurons_;
    std::vector<Region> regions_;
    ManaPool mana_pool_;
    EfferenceBuffer efference_;
    PersianCodec codec_;
    DeviceManager device_manager_;

    uint64_t current_tick_;
    float global_noise_;
    std::mt19937 rng_;

    // بافر سیگنال‌های رسیده به هر نورون در تیک جاری
    std::vector<float> input_accumulator_;

    // خروجی‌های اخیر به صورت pattern
    struct OutputHistory {
        uint64_t tick;
        uint8_t pattern;
        std::string persian_char;
    };
    std::vector<OutputHistory> output_history_;

    // متدهای داخلی
    void buildRegions();
    void connectRandom();
    void propagateSpikes(const std::vector<uint32_t>& spiked_ids);
    uint8_t collectOutputPattern(const std::vector<uint32_t>& spiked_ids); // از OutputRegion الگو بساز
    void handlePruning();
    void handleGarbageCollect();
};

} // namespace daaa
