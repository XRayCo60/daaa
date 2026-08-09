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
#include <chrono>

namespace daaa {

struct BrainConfig {
    size_t initial_neurons = 4096; // طبق درخواست کاربر: تعداد شروع تا 4096
    size_t initial_memory_neurons = 0; // اگر 0 باشد، اتومات حرفه‌ای محاسبه می‌شود
    float connection_prob = 0.05f; // احتمال اتصال بین دو نورون
    uint64_t seed = 42;
    float noise_level = 0.01f;

    // محاسبه حرفه‌ای نسبت نورون حافظه‌ای به معمولی
    // بر اساس سند: باید خیلی حرفه‌ای تنظیم شه
    // ایده: مغز انسان هیپوکامپ ~1%، برای شبکه مصنوعی کوچکتر درصد بیشتر، با رشد درصد کمتر می‌شود تا مقیاس‌پذیر بماند
    static size_t optimalMemoryCount(size_t total) {
        if (total <= 64) return 2;
        if (total <= 256) return total / 64; // 1.5%
        if (total <= 1024) return total / 80; // 1.25%
        if (total <= 10000) return total / 100; // 1%
        if (total <= 50000) return total / 125; // 0.8%
        return total / 150; // 0.66% برای خیلی بزرگ
    }
    size_t effectiveMemoryCount() const {
        if (initial_memory_neurons != 0) return initial_memory_neurons;
        return optimalMemoryCount(initial_neurons);
    }
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

    // لاگ رویدادهای داخلی برای نمایش گرافیکی
    struct Event {
        uint64_t tick;
        std::string type; // مثلاً "seizure", "death", "sprout", "forget", "rewrite", "meaningful"
        std::string message;
        uint32_t neuron_id;
    };
    const std::vector<Event>& eventLog() const { return event_log_; }
    void pushEvent(const std::string& type, const std::string& msg, uint32_t nid=UINT32_MAX);
    void clearEvents() { event_log_.clear(); }

    // آمار CPU واقعی
    struct CpuStats {
        double freq_mhz = 0;
        double usage_percent = 0;
    };
    CpuStats getCpuStats();
    float currentTps() const { return last_tps_; }
    void setCpuBudget(float p) { cpu_budget_percent_ = p; }
    float cpuBudget() const { return cpu_budget_percent_; }
    void setTpsLimits(float min_, float max_) { tps_min_ = min_; tps_max_ = max_; }
    float tpsMin() const { return tps_min_; }
    float tpsMax() const { return tps_max_; }
    float modelSpeedMultiplier() const { return last_tps_; } // چون هر تیک = 1 ثانیه زمان مدل

    // آیا مدل همواره در حال فکر است؟ (طبق سند)
    bool isAlwaysThinking() const { return true; } // spontaneous firing همیشه فعال است حتی بدون ورودی
    

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

    // لاگ رویداد داخلی
    std::vector<Event> event_log_;
    static constexpr size_t MAX_EVENTS = 500;

    // آمار سرعت
    float last_tps_ = 0;
    float cpu_budget_percent_ = 70.0f;
    float tps_min_ = 10.0f;
    float tps_max_ = 100.0f;
    std::chrono::steady_clock::time_point last_tps_time_;
    uint64_t last_tps_tick_ = 0;

    // متدهای داخلی
    void buildRegions();
    void connectRandom();
    void propagateSpikes(const std::vector<uint32_t>& spiked_ids);
    uint8_t collectOutputPattern(const std::vector<uint32_t>& spiked_ids); // از OutputRegion الگو بساز
    void handlePruning();
    void handleGarbageCollect();
    void handleMemoryNeurons(); // مدیریت 200 و 1000 تیکی نورون‌های حافظه‌ای
    void updateTps();
};

} // namespace daaa
