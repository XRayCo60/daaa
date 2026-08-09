#pragma once
// ناحیه‌بندی مغز: چند بخشی بودن + فلگ معنادار

#include <string>
#include <vector>
#include <cstdint>

namespace daaa {

enum class RegionKind : uint8_t {
    INPUT = 0,
    PROCESSING = 1,
    OUTPUT = 2,
    MEMORY = 3,
    EFFERENCE = 4,
    CUSTOM = 5
};

struct Region {
    std::string name; // نام ناحیه، مثلاً "ورودی-بینایی"
    RegionKind kind;
    std::vector<uint32_t> neuron_ids; // لیست نورون‌های این ناحیه
    bool meaningful; // آیا کاربر گفته این بخش معناداره؟
    std::string meaningful_note; // توضیح کاربر
    float mana_share; // سهم مانا از blood pool (برای تخصیص تمرکز)

    Region(const std::string& n, RegionKind k) : name(n), kind(k), meaningful(false), mana_share(1.0f) {}
};

struct EfferenceBuffer {
    // بافر ترتیب زمانی سراسری: کپی از خروجی‌های تولید شده
    static constexpr size_t CAPACITY = 1024;
    struct Slot {
        uint64_t tick;
        uint8_t pattern; // 6 بیت خروجی
        std::string persian_char;
        bool valid = false;
    };
    std::vector<Slot> slots;
    size_t write_ptr = 0;
    uint32_t delay_ticks = 5; // تاخیر عمدی

    EfferenceBuffer() : slots(CAPACITY) {}

    void push(uint64_t tick, uint8_t pattern, const std::string& ch);
    // گرفتن خروجی‌های با تاخیر (برای تزریق دوباره به مغز)
    std::vector<Slot> getDelayed(uint64_t current_tick) const;
    void clear();
};

} // namespace daaa
