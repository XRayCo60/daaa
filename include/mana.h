#pragma once
// سیستم اقتصاد مانا: blood pool + P2P + تزریق بیرونی

#include <cstdint>
#include <mutex>
#include <vector>

namespace daaa {

struct ManaPool {
    double blood; // استخر مشترک
    double total_injected_external;
    double total_injected_meaningful; // از کلمات معنادار
    std::mutex mtx;

    ManaPool(): blood(100.0), total_injected_external(0), total_injected_meaningful(0) {}
    // mutex قابل کپی نیست، پس کپی را حذف و move را دستی تعریف می‌کنیم
    ManaPool(const ManaPool& other): blood(other.blood), total_injected_external(other.total_injected_external), total_injected_meaningful(other.total_injected_meaningful) {}
    ManaPool& operator=(const ManaPool& other) {
        if (this != &other) {
            blood = other.blood;
            total_injected_external = other.total_injected_external;
            total_injected_meaningful = other.total_injected_meaningful;
            // mtx را دست نزن - یک قفل جدید می‌ماند
        }
        return *this;
    }
    ManaPool(ManaPool&& other) noexcept : blood(other.blood), total_injected_external(other.total_injected_external), total_injected_meaningful(other.total_injected_meaningful) {}
    ManaPool& operator=(ManaPool&& other) noexcept {
        blood = other.blood;
        total_injected_external = other.total_injected_external;
        total_injected_meaningful = other.total_injected_meaningful;
        return *this;
    }

    void injectBlood(double amount);
    void injectMeaningfulWord(double amount = 5.0); // وقتی کلمه معنادار تولید شد
    bool withdraw(uint32_t neuron_id, double amount, double& out_remaining); // نورون برمی‌دارد

    // بدون قفل برای سرعت در حلقه اصلی (وقتی تک‌نخی هستیم)
    void injectBloodNoLock(double amount) { blood += amount; total_injected_meaningful += amount; }
    double getBloodNoLock() const { return blood; }
};

// اقتصاد P2P: هدیه مستقیم
struct ManaGift {
    uint32_t from;
    uint32_t to;
    float amount;
    uint64_t tick;
};

} // namespace daaa
