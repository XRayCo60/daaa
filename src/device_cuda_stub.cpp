#include "../include/device.h"
#include "../include/neuron.h"
#include <cstdlib>

namespace daaa {

bool CudaDeviceStub::checkNvidiaPresent() {
    // چک ساده: آیا nvidia-smi وجود دارد؟ یا /proc/driver/nvidia ?
    int ret = std::system("nvidia-smi > /dev/null 2>&1");
    return ret == 0;
    // یا چک /dev/nvidia0 وجود دارد
}

DeviceInfo CudaDeviceStub::info() const {
    DeviceInfo inf;
    inf.name = "CUDA Device (Dormant on Intel HD 3000, active on NVIDIA)";
    inf.is_cuda = true;
    bool present = checkNvidiaPresent();
    inf.available = present;
    inf.memory_mb = 0;
    if (present) inf.reason = "NVIDIA GPU شناسایی شد - آماده مشارکت";
    else inf.reason = "روی این سیستم (i7-2670QM + Intel HD 3000) CUDA هرگز فعال نیست چون CUDA فقط NVIDIA است؛ سیستم سهیم کردن کامل ولی dormant است تا روی سیستم قوی (GTX 1050/T4...) بدون تغییر کد فعال شود";
    return inf;
}

bool CudaDeviceStub::available() const {
    return checkNvidiaPresent();
}

void CudaDeviceStub::computeBatch(std::vector<Neuron>& neurons, float global_noise) {
    if (!available()) {
        // fallback به CPU: هیچ کاری نکن، Brain از CPU استفاده خواهد کرد
        // ولی برای completeness می‌توانیم لاگ بزنیم
        return;
    }
    // اینجا در آینده kernel واقعی CUDA می‌آید:
    // - تخصیص بافر v,u,I روی GPU
    // - اجرای kernel Izhikevich برای هر نورون به صورت موازی
    // - برگرداندن نتایج
    // چون فعلاً stub است، کاری نمی‌کنیم و Brain CPU را صدا می‌زند
    (void)neurons;
    (void)global_noise;
}

// DeviceManager

DeviceManager::DeviceManager() {
    detectDevices();
}

void DeviceManager::detectDevices() {
    devices_.clear();
    devices_.push_back(std::make_unique<CpuDevice>());
    devices_.push_back(std::make_unique<CudaDeviceStub>());
}

void DeviceManager::addDevice(std::unique_ptr<IDevice> dev) {
    devices_.push_back(std::move(dev));
}

IDevice* DeviceManager::bestDevice() {
    // اگر CUDA available بود، آن را انتخاب کن، وگرنه CPU
    for (auto &d : devices_) {
        if (d->info().is_cuda && d->available()) return d.get();
    }
    for (auto &d : devices_) {
        if (!d->info().is_cuda && d->available()) return d.get();
    }
    return devices_.empty() ? nullptr : devices_[0].get();
}

std::vector<DeviceInfo> DeviceManager::listDevices() const {
    std::vector<DeviceInfo> out;
    for (auto &d : devices_) out.push_back(d->info());
    return out;
}

} // namespace daaa
