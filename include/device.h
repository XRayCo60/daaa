#pragma once
// انتزاع دستگاه محاسباتی: CPU + CUDA (حتی روی سخت‌افزار ضعیف کامل باشد ولی dormant)

#include <vector>
#include <cstdint>
#include <string>
#include <memory>

namespace daaa {

struct Neuron; // forward

struct DeviceInfo {
    std::string name;
    bool is_cuda;
    bool available;
    size_t memory_mb;
    std::string reason; // اگر available نیست چرا
};

class IDevice {
public:
    virtual ~IDevice() {}
    virtual DeviceInfo info() const = 0;
    virtual bool available() const = 0;
    // محاسبه دسته‌ای تابع نورون‌ها (بخش قابل انتقال به GPU)
    virtual void computeBatch(std::vector<Neuron>& neurons, float global_noise) = 0;
};

class CpuDevice : public IDevice {
public:
    DeviceInfo info() const override;
    bool available() const override { return true; }
    void computeBatch(std::vector<Neuron>& neurons, float global_noise) override;
};

class CudaDeviceStub : public IDevice {
public:
    DeviceInfo info() const override;
    bool available() const override;
    void computeBatch(std::vector<Neuron>& neurons, float global_noise) override;
    // در آینده اینجا cudaMalloc / kernel launch واقعی می‌آید
    // الان چک می‌کند nvidia-smi وجود دارد یا نه
    static bool checkNvidiaPresent();
};

// DeviceManager: انتخاب بهترین دستگاه
class DeviceManager {
public:
    DeviceManager();
    void detectDevices();
    IDevice* bestDevice(); // اگر CUDA available باشد آن را برمی‌گرداند، وگرنه CPU
    std::vector<DeviceInfo> listDevices() const;
    // تقسیم بار: تصمیمات ساختاری روی CPU، محاسبه تابع روی best device
    void addDevice(std::unique_ptr<IDevice> dev);

private:
    std::vector<std::unique_ptr<IDevice>> devices_;
};

} // namespace daaa
