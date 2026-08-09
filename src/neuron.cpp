#include "../include/neuron.h"
#include <cmath>
#include <algorithm>

namespace daaa {

Neuron::Neuron(uint32_t nid, NeuronType t) : id(nid), type(t) {
    state = NeuronState::NORMAL;
    // پارامترهای پیش‌فرض Izhikevich برای رفتار Regular Spiking
    if (t == NeuronType::MEMORY) {
        a = 0.02f; b = 0.2f; c = -65.0f; d = 8.0f;
    } else {
        a = 0.02f; b = 0.2f; c = -65.0f; d = 6.0f;
    }
    v = -65.0f;
    u = b * v;
    I_input = 0.0f;
    mana = 20.0f; // اولیه
    mana_threshold_sprout = 100.0f;
    if (t == NeuronType::MEMORY) {
        local_memory.resize(8192, 0);
        mana_threshold_sprout = 200.0f;
    } else {
        local_memory.resize(256, 0);
    }
    storage_arch_id = 0;
    ticks_since_arch_change = 0;
    is_soft = false;
    soft_timer = 0;
    last_soft_choice = SoftnessChoice::NONE;
    ignore_timer = 0;
    seizure_timer = 0;
    consecutive_failures = 0;
    spike_count = 0;
    spontaneous_rate = 0.01f; // 1% احتمال فایر خودجوش هر تیک
    is_input_neuron = false;
    is_output_neuron = false;
    external_writable = false;
}

bool Neuron::consumeManaForSpike() {
    const float COST = (type == NeuronType::MEMORY) ? 1.2f : 0.7f;
    if (mana >= COST) {
        mana -= COST;
        return true;
    }
    return false;
}

bool Neuron::tick(std::mt19937& rng) {
    if (state == NeuronState::DEAD || state == NeuronState::IGNORE_PERMANENT) return false;
    if (state == NeuronState::IGNORE_TEMP) {
        if (ignore_timer > 0) { ignore_timer--; return false; }
        else state = NeuronState::NORMAL;
    }
    if (state == NeuronState::SEIZURE) {
        if (seizure_timer > 0) {
            // در تشنج، doSeizure جدا صدا زده می‌شود؟ ولی اینجا هم اسپایک می‌کنیم
            seizure_timer--;
            if (seizure_timer == 0) state = NeuronState::NORMAL;
            // تشنج اسپایک بدون مانا ولی قبلاً در doSeizure مدیریت شد
            return true;
        } else {
            state = NeuronState::NORMAL;
        }
    }

    // نرمی تایمر
    if (is_soft && soft_timer > 0) {
        soft_timer--;
        if (soft_timer == 0) is_soft = false;
    }

    // Izhikevich integration (یک قدم ساده Euler)
    // I = جمع ورودی سیناپسی + خودجوش + نویز کوچک
    float I = I_input;

    // خودجوش: اگر تیک بگذرد و نورون فعال است، کمی جریان خودجوش
    // این شبیه spontaneous firing است
    std::uniform_real_distribution<float> dist01(0.0f, 1.0f);
    if (dist01(rng) < spontaneous_rate) {
        I += 18.0f; // پالس خودجوش - برای اینکه با Izhikevich به آستانه برسد (نیاز به I~10-20)
    }

    // معادلات Izhikevich
    // v' = 0.04 v^2 + 5v + 140 - u + I
    // u' = a(bv - u)
    // با dt=1 (هر تیک یک میلی‌ثانیه فرضی)
    v += 0.5f * (0.04f*v*v + 5.0f*v + 140.0f - u + I);
    v += 0.5f * (0.04f*v*v + 5.0f*v + 140.0f - u + I); // دو نیم‌قدم برای پایداری
    u += a * (b * v - u);

    // آستانه اسپایک
    if (v >= 30.0f) {
        // اسپایک!
        if (!consumeManaForSpike()) {
            // مانا کافی نیست -> نمی‌تواند فایر کند، v را نگه دار ولی اسپایک نکن
            v = c;
            // u را هم کمی افزایش بده؟
            u += d * 0.5f;
            I_input = 0; // ریست ورودی
            return false;
        }
        // ریست
        v = c;
        u += d;
        spike_count++;
        I_input = 0; // بعد از اسپایک، ورودی ریست
        // حافظه محلی: ثبت اینکه اسپایک شد
        if (!local_memory.empty()) {
            local_memory[0] = (local_memory[0] + 1) & 0xFF;
        }
        return true;
    }

    // اگر اسپایک نکرد، ورودی را کمی decay کن (leak)
    I_input *= 0.9f;
    return false;
}

void Neuron::doSeizure(std::mt19937& rng) {
    // تشنج: بدون مصرف مانا، به ۳-۵ مسیر رندوم اسپم بفرست
    // هزینه از ساختار فیزیکی: integrity کم می‌شود
    if (outputs.empty()) return;
    std::uniform_int_distribution<int> cnt_dist(3, std::min(5, (int)outputs.size()));
    int cnt = cnt_dist(rng);
    std::uniform_int_distribution<int> idx_dist(0, (int)outputs.size()-1);
    for (int i=0;i<cnt;++i){
        int idx = idx_dist(rng);
        outputs[idx].integrity -= 0.1f;
        if (outputs[idx].integrity < 0) outputs[idx].integrity = 0;
    }
    // همچنین از مانا نه، ولی یک هزینه ساختاری از خود نورون؟
    // در سند: هزینه از ساختار فیزیکی خودش می‌پردازد
}

void Neuron::checkFailureModes(std::mt19937& rng, float global_noise) {
    if (state != NeuronState::NORMAL) return;
    float stress = global_noise + (1.0f - std::min(1.0f, mana / 20.0f));
    // اگر استرس بالا + نویز زیاد
    if (stress > 0.8f) {
        std::uniform_real_distribution<float> d01(0,1);
        float r = d01(rng);
        if (r < 0.10f) { // 10% احتمال بدقلقی
            if (r < 0.05f) {
                // کر شدن
                state = NeuronState::IGNORE_TEMP;
                ignore_timer = 10 + (rng() % 20);
                consecutive_failures++;
            } else {
                // تشنج
                state = NeuronState::SEIZURE;
                seizure_timer = 5 + (rng() % 10);
                consecutive_failures++;
                doSeizure(rng);
            }
            // اگر چند بار متوالی بدقلقی تکرار شود -> ignore دائمی
            if (consecutive_failures >= 3) {
                state = NeuronState::IGNORE_PERMANENT;
            }
        } else {
            // اگر استرس کم شد، consecutive_failures را کاهش بده (خودتنظیمی)
            if (consecutive_failures > 0 && d01(rng) < 0.1f) consecutive_failures--;
        }
    }
}

void Neuron::mutateFunction(std::mt19937& rng) {
    // تغییر خود تابع ریاضی: a,b,c,d را جهش بده
    std::uniform_real_distribution<float> da(-0.01f, 0.01f);
    std::uniform_real_distribution<float> db(-0.05f, 0.05f);
    std::uniform_real_distribution<float> dc(-2.0f, 2.0f);
    std::uniform_real_distribution<float> dd(-1.0f, 1.0f);
    a = std::clamp(a + da(rng), 0.001f, 0.2f);
    b = std::clamp(b + db(rng), 0.05f, 0.5f);
    c = std::clamp(c + dc(rng), -70.0f, -40.0f);
    d = std::clamp(d + dd(rng), 1.0f, 15.0f);
    last_soft_choice = SoftnessChoice::CHANGE_FUNCTION;
    is_soft = false; // پایان نرمی بعد از استفاده
}

void Neuron::writeLocalMemory(size_t offset, uint8_t value) {
    if (offset < local_memory.size()) local_memory[offset] = value;
}
uint8_t Neuron::readLocalMemory(size_t offset) const {
    if (offset < local_memory.size()) return local_memory[offset];
    return 0;
}

} // namespace daaa
