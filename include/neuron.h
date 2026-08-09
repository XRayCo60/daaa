#pragma once
// مدل نورون Izhikevich + اقتصاد مانا + حافظه محلی + حالت‌های شکست

#include <cstdint>
#include <vector>
#include <array>
#include <string>
#include <random>

namespace daaa {

enum class NeuronType : uint8_t {
    NORMAL = 0,
    MEMORY = 1 // حافظه‌ای: فضای بزرگتر
};

enum class NeuronState : uint8_t {
    NORMAL = 0,
    IGNORE_TEMP = 1,      // کر شدن موقت
    SEIZURE = 2,          // تشنج / اسپم
    IGNORE_PERMANENT = 3, // ignore دائمی -> در آستانه مرگ
    DEAD = 4
};

enum class SoftnessChoice : uint8_t {
    NONE = 0,
    CHANGE_FUNCTION = 1,  // تغییر تابع ریاضی
    CHANGE_CONNECTION = 2,// تغییر اتصال رایگان
    CREATE_21ST_PATH = 3  // ساخت مسیر 21
};

struct Synapse {
    uint32_t to_neuron_id; // مقصد (اگر unknown باشد، مقصد واقعی در جای دیگری نگهداری می‌شود؟ ولی برای شبیه‌سازی مسیر مخفی را هم نگه می‌داریم)
    float weight; // وزن سیناپسی
    bool known; // آیا نورون مبدا می‌داند این مسیر به کجا می‌رود؟ (۱۸ تا true، ۲ تا false)
    float integrity; // 0..1 - در تشنج می‌سوزد، اگر 0 شود مسیر قطع است
    uint32_t _pad = 0;

    static Synapse make(uint32_t to, float w, bool k) {
        return Synapse{to, w, k, 1.0f, 0};
    }
};

struct Neuron {
    uint32_t id;
    NeuronType type;
    NeuronState state;

    // Izhikevich params
    float a, b, c, d;
    float v; // membrane potential
    float u; // recovery
    float I_input; // جمع ورودی جاری

    // اقتصاد مانا
    float mana;
    float mana_threshold_sprout; // آستانه جوانه‌زنی

    // اتصالات
    std::vector<uint32_t> input_ids; // لیست ورودی‌ها (برای راحتی)
    std::vector<Synapse> outputs; // خروجی‌ها: حداکثر ۲۰ (۲۱ در نرمی)

    // حافظه محلی - طبق درخواست جدید کاربر:
// هر نورون معمولی 96 کیلوبایت حافظه داخلی
// هر نورون حافظه‌ای 512 کیلوبایت برای ذخیره‌سازی + 96 کیلوبایت برای شخص خودش
    static constexpr size_t NORMAL_MEM_SIZE = 96 * 1024; // 96KB
    static constexpr size_t MEMORY_STORAGE_SIZE = 512 * 1024; // 512KB
    static constexpr size_t MEMORY_PERSONAL_SIZE = 96 * 1024; // 96KB

    std::vector<uint8_t> personal_memory; // برای همه نورون‌ها 96KB
    std::vector<uint8_t> storage_memory;  // فقط برای MEMORY: 512KB

    // برای backward compat با کد قدیمی که local_memory صدا میزد، یک accessor می‌دهیم
    std::vector<uint8_t>& local_memory() { return personal_memory; }
    const std::vector<uint8_t>& local_memory() const { return personal_memory; }

    // برای نورون حافظه‌ای: معماری ذخیره‌سازی داخلی قابل بازنویسی هر ۲۰۰ تیک
    uint32_t storage_arch_id;
    uint32_t ticks_since_arch_change;
    // برای بازنویسی کامل هر 1000 تیک با تابع فعلی (درخواست جدید کاربر)
    uint32_t ticks_since_full_rewrite;
    uint32_t full_rewrite_count;
    // برای تصمیم حذف: نورون حافظه‌ای خودش تصمیم می‌گیرد چه چیزی پاک شود
    uint32_t forget_counter; // چند بار فراموشی انجام داده

    // نرمی
    bool is_soft;
    uint32_t soft_timer; // چند تیک باقی مانده
    SoftnessChoice last_soft_choice;

    // شکست
    uint32_t ignore_timer;
    uint32_t seizure_timer;
    uint32_t consecutive_failures; // تعداد بدقلقی‌های متوالی

    // آمار
    uint64_t spike_count;
    float spontaneous_rate; // نرخ فایر خودجوش
    bool is_input_neuron; // بخشی از مسیر ورودیش از بیرون است؟
    bool is_output_neuron; // خروجی‌اش به انکودر می‌رود؟
    bool external_writable; // آیا برنامه می‌تواند به ورودیش چیزی بنویسد؟

    // متدها
    Neuron(uint32_t nid, NeuronType t = NeuronType::NORMAL);

    // یک تیک شبیه‌سازی: ورودی‌ها جمع شده در I_input، تصمیم به اسپایک
    bool tick(std::mt19937& rng);

    // مصرف مانا برای اسپایک، برگرداندن اینکه آیا موفق بود
    bool consumeManaForSpike();

    // اعمال تشنج: اسپم بدون مانا ولی سوزاندن مسیرها
    void doSeizure(std::mt19937& rng);

    // بررسی ورود به حالت بدقلقی بر اساس استرس
    void checkFailureModes(std::mt19937& rng, float global_noise);

    // تلاش برای تغییر تابع (در نرمی)
    void mutateFunction(std::mt19937& rng);

    // حافظه: نوشتن چیزی در local_memory
    void writeLocalMemory(size_t offset, uint8_t value);
    uint8_t readLocalMemory(size_t offset) const;
};

// برای سریالایز در .afu - نسخه packed ساده (بدون vector)
struct NeuronPacked {
    uint32_t id;
    uint8_t type;
    uint8_t state;
    uint8_t is_input;
    uint8_t is_output;
    uint8_t external_writable;
    uint8_t _pad[3];
    float a,b,c,d;
    float v,u;
    float mana;
    float mana_threshold_sprout;
    float spontaneous_rate;
    uint32_t storage_arch_id;
    uint32_t ticks_since_arch_change;
    uint32_t soft_timer;
    uint8_t is_soft;
    uint8_t last_soft_choice;
    uint8_t ignore_timer;
    uint8_t seizure_timer;
    uint32_t consecutive_failures;
    uint64_t spike_count;
    uint32_t output_count;
    uint32_t input_count;
    // بعد از این، در فایل .afu: آرایه Synapse و سپس بایت‌های local_memory
};

} // namespace daaa
