#include "../include/device.h"
#include "../include/neuron.h"

namespace daaa {

DeviceInfo CpuDevice::info() const {
    DeviceInfo inf;
    inf.name = "CPU (SandyBridge compatible, no AVX2 required)";
    inf.is_cuda = false;
    inf.available = true;
    inf.memory_mb = 0; // سیستم
    inf.reason = "همیشه فعال، بهینه برای i7-2670QM بدون AVX2";
    return inf;
}

void CpuDevice::computeBatch(std::vector<Neuron>& neurons, float global_noise) {
    // در نسخه CPU، محاسبه قبلاً در Brain::tick انجام می‌شود؟
    // اینجا فقط برای یکسان‌سازی اینترفیس است
    // ولی می‌توانیم اینجا هم tick صدا بزنیم اگر بخواهیم جداسازی کنیم
    // فعلاً خالی - Brain خودش tick نورون‌ها را مدیریت می‌کند
    (void)neurons;
    (void)global_noise;
}

} // namespace daaa
