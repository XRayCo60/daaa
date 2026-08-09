#include "../include/mana.h"

namespace daaa {

void ManaPool::injectBlood(double amount) {
    std::lock_guard<std::mutex> lock(mtx);
    blood += amount;
    total_injected_meaningful += amount;
}

void ManaPool::injectMeaningfulWord(double amount) {
    std::lock_guard<std::mutex> lock(mtx);
    blood += amount;
    total_injected_meaningful += amount;
}

bool ManaPool::withdraw(uint32_t neuron_id, double amount, double& out_remaining) {
    // neuron_id فعلاً استفاده نمی‌شود ولی برای لاگ آینده نگه داشته شده
    (void)neuron_id;
    std::lock_guard<std::mutex> lock(mtx);
    if (blood >= amount) {
        blood -= amount;
        out_remaining = blood;
        return true;
    }
    out_remaining = blood;
    return false;
}

} // namespace daaa
