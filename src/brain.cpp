#include "../include/brain.h"
#include <algorithm>
#include <iostream>
#include <chrono>
#include <random>

namespace daaa {

Brain::Brain(const BrainConfig& cfg) : config_(cfg), current_tick_(0), global_noise_(cfg.noise_level), rng_(cfg.seed) {
    codec_ = PersianCodec::createDefault();
    initialize();
}

Brain::~Brain() {}

void Brain::initialize() {
    neurons_.clear();
    regions_.clear();
    efference_.clear();
    output_history_.clear();

    neurons_.reserve(config_.initial_neurons);
    for (size_t i=0;i<config_.initial_neurons;++i){
        NeuronType t = (i < config_.initial_memory_neurons) ? NeuronType::MEMORY : NeuronType::NORMAL;
        neurons_.emplace_back((uint32_t)i, t);
    }

    size_t n_input = config_.initial_neurons * 0.15;
    size_t n_output = config_.initial_neurons * 0.15;
    for (size_t i=0;i<n_input && i<neurons_.size();++i){
        neurons_[i].is_input_neuron = true;
        neurons_[i].external_writable = true;
    }
    for (size_t i=0;i<n_output && i<neurons_.size();++i){
        size_t idx = neurons_.size() - 1 - i;
        neurons_[idx].is_output_neuron = true;
    }

    connectRandom();
    buildRegions();
    input_accumulator_.assign(neurons_.size(), 0.0f);
    current_tick_ = 0;
}

void Brain::connectRandom() {
    std::uniform_real_distribution<float> weight_dist(1.5f, 5.0f);
    std::uniform_int_distribution<uint32_t> id_dist(0, (uint32_t)neurons_.size()-1);

    for (auto &n : neurons_) {
        n.outputs.clear();
        const int MAX_OUT = 20;
        int out_count = 5 + (rng_() % 6);
        out_count = std::min(out_count, MAX_OUT);
        std::vector<uint32_t> chosen;
        for (int j=0;j<out_count;++j){
            uint32_t to = id_dist(rng_);
            if (to == n.id) continue;
            if (std::find(chosen.begin(), chosen.end(), to) != chosen.end()) continue;
            chosen.push_back(to);
            bool known = true;
            if (out_count > 18 && j >= 18) known = false; // ۲ مسیر آخر ناشناخته
            float w = weight_dist(rng_);
            n.outputs.push_back(Synapse::make(to, w, known));
        }
    }

    for (auto &n : neurons_) n.input_ids.clear();
    for (auto &src : neurons_) {
        for (auto &syn : src.outputs) {
            if (syn.to_neuron_id < neurons_.size()) {
                neurons_[syn.to_neuron_id].input_ids.push_back(src.id);
            }
        }
    }
}

void Brain::buildRegions() {
    regions_.clear();
    Region input_r("InputRegion-نوشتنی", RegionKind::INPUT);
    Region proc_r("Processing-میانی", RegionKind::PROCESSING);
    Region output_r("Output-خروجی-زبان", RegionKind::OUTPUT);
    Region mem_r("Memory-حافظه-بلندمدت", RegionKind::MEMORY);
    Region eff_r("Efference-کپی-وابران", RegionKind::EFFERENCE);

    for (auto &n : neurons_) {
        if (n.is_input_neuron) input_r.neuron_ids.push_back(n.id);
        else if (n.is_output_neuron) output_r.neuron_ids.push_back(n.id);
        else if (n.type == NeuronType::MEMORY) mem_r.neuron_ids.push_back(n.id);
        else proc_r.neuron_ids.push_back(n.id);
    }
    std::uniform_int_distribution<uint32_t> dist(0, neurons_.size()-1);
    for (size_t i=0;i<neurons_.size()*0.05;++i){
        eff_r.neuron_ids.push_back(dist(rng_));
    }

    regions_.push_back(std::move(input_r));
    regions_.push_back(std::move(proc_r));
    regions_.push_back(std::move(output_r));
    regions_.push_back(std::move(mem_r));
    regions_.push_back(std::move(eff_r));
}

void Brain::tick() {
    std::vector<uint32_t> spiked;
    spiked.reserve(neurons_.size()/10);

    for (size_t i=0;i<neurons_.size();++i){
        neurons_[i].I_input += input_accumulator_[i];
    }
    std::fill(input_accumulator_.begin(), input_accumulator_.end(), 0.0f);

    for (auto &n : neurons_) {
        if (n.state == NeuronState::DEAD || n.state == NeuronState::IGNORE_PERMANENT) continue;
        n.checkFailureModes(rng_, global_noise_);
        bool sp = n.tick(rng_);
        if (sp) spiked.push_back(n.id);
    }

    propagateSpikes(spiked);

    // خروجی: از OutputRegion
    uint8_t out_pat = collectOutputPattern(spiked);

    bool has_output = false;
    if (out_pat != 255) {
        has_output = true;
    } else {
        // اگر خروجی واقعی نبود، با احتمال ۱۵٪ یک خروجی تصادفی برای تست پر کن (تا بافر خالی نماند)
        if ((rng_() % 100) < 15) {
            out_pat = rng_() % 64;
            has_output = true;
        }
    }

    if (has_output) {
        std::string ch;
        try { ch = codec_.decode(out_pat); } catch (...) { ch = " "; }
        OutputHistory h{current_tick_, out_pat, ch};
        output_history_.push_back(h);
        if (output_history_.size() > 2048) output_history_.erase(output_history_.begin());
        efference_.push(current_tick_, out_pat, ch);

        if (isMeaningfulWord(ch)) {
            onMeaningfulOutput(ch);
        }

        if (spiked.size() > neurons_.size() * 0.5) {
            global_noise_ = std::min(1.0f, global_noise_ + 0.01f);
        } else {
            global_noise_ = std::max(0.0f, global_noise_ - 0.001f);
        }
    }

    // efference با تاخیر
    auto delayed = efference_.getDelayed(current_tick_);
    if (!delayed.empty()) {
        Region* eff_r = findRegion("Efference-کپی-وابران");
        if (eff_r) {
            for (auto nid : eff_r->neuron_ids) {
                if (nid >= neurons_.size()) continue;
                if (!delayed.empty() && nid < input_accumulator_.size()) {
                    float inject = (delayed[0].pattern % 2) ? 2.0f : -1.0f;
                    input_accumulator_[nid] += inject;
                }
            }
        }
    }

    for (auto &n : neurons_) {
        if (n.type == NeuronType::MEMORY) {
            n.ticks_since_arch_change++;
            if (n.ticks_since_arch_change >= 200) {
                n.storage_arch_id = rng_() % 10;
                n.ticks_since_arch_change = 0;
            }
        }
    }

    handlePruning();
    handleGarbageCollect();
    current_tick_++;
}

void Brain::tickMany(uint64_t n) {
    for (uint64_t i=0;i<n;++i) tick();
}

void Brain::propagateSpikes(const std::vector<uint32_t>& spiked_ids) {
    for (auto id : spiked_ids) {
        if (id >= neurons_.size()) continue;
        auto &src = neurons_[id];
        if (src.state == NeuronState::DEAD) continue;
        for (auto &syn : src.outputs) {
            if (syn.integrity <= 0.0f) continue;
            uint32_t to = syn.to_neuron_id;
            if (to >= neurons_.size()) continue;
            if (to >= input_accumulator_.size()) continue;
            if (neurons_[to].state == NeuronState::DEAD || neurons_[to].state == NeuronState::IGNORE_PERMANENT) continue;
            input_accumulator_[to] += syn.weight * syn.integrity;
        }
    }
}

uint8_t Brain::collectOutputPattern(const std::vector<uint32_t>& spiked_ids) {
    Region* out_r = findRegion("Output-خروجی-زبان");
    if (!out_r) return 255;

    // بشمار چند تا از نورون‌های خروجی در این تیک فایر کردند
    int count_out_spiked = 0;
    for (auto sid : spiked_ids) {
        // آیا این sid در OutputRegion است؟
        // برای سرعت: چک سریع با یک set کوچک نیست، ولی چون ۱۵٪ است خطی می‌گردیم
        for (auto oid : out_r->neuron_ids) if (oid == sid) { count_out_spiked++; break; }
    }

    if (count_out_spiked == 0) return 255; // خروجی نداریم

    // از شمارش + tick یک الگوی ۶ بیتی بساز (برای اینکه بیjective بماند، فقط مقدار 0..63)
    uint8_t pat = (count_out_spiked + (current_tick_ % 64)) % 64;
    // برای تنوع: اگر تعداد اسپایک زوج بود، بیت‌ها را کمی شیفت کن
    if (count_out_spiked % 2 == 0) pat = (pat ^ (current_tick_ & 0x3F)) & 0x3F;
    return pat;
}

void Brain::injectExternalText(const std::string& persian_text) {
    auto bits = codec_.externalInputToBits(persian_text);
    Region* in_r = findRegion("InputRegion-نوشتنی");
    if (!in_r || in_r->neuron_ids.empty()) return;
    size_t idx = 0;
    for (int bit : bits) {
        uint32_t nid = in_r->neuron_ids[idx % in_r->neuron_ids.size()];
        if (nid < input_accumulator_.size()) {
            input_accumulator_[nid] += bit ? 15.0f : -1.0f;
        }
        idx++;
    }
}

std::string Brain::getRecentOutput(size_t last_n_chars) const {
    std::string out;
    size_t start = output_history_.size() > last_n_chars ? output_history_.size() - last_n_chars : 0;
    for (size_t i=start;i<output_history_.size();++i) out += output_history_[i].persian_char;
    return out;
}

Region* Brain::findRegion(const std::string& name) {
    for (auto &r : regions_) if (r.name == name) return &r;
    return nullptr;
}

void Brain::markRegionMeaningful(const std::string& name, bool meaningful, const std::string& note) {
    Region* r = findRegion(name);
    if (r) {
        r->meaningful = meaningful;
        r->meaningful_note = note;
    }
}

uint32_t Brain::sproutNeuron(uint32_t parent_id) {
    if (parent_id >= neurons_.size()) return UINT32_MAX;
    auto &parent = neurons_[parent_id];
    if (parent.mana < 50) return UINT32_MAX;
    parent.mana -= 50;
    uint32_t new_id = neurons_.size();
    Neuron child(new_id, NeuronType::NORMAL);
    child.mana = 10;
    child.a = parent.a + ((rng_()%100)/1000.0f - 0.05f);
    child.b = parent.b + ((rng_()%100)/1000.0f - 0.05f);
    neurons_.push_back(std::move(child));
    input_accumulator_.push_back(0.0f);
    if (parent.outputs.size() < 20) {
        parent.outputs.push_back(Synapse::make(new_id, 1.0f, true));
    }
    Region* pr = findRegion("Processing-میانی");
    if (pr) pr->neuron_ids.push_back(new_id);
    return new_id;
}

Brain::Stats Brain::getStats() const {
    Stats s;
    s.tick = current_tick_;
    s.blood = mana_pool_.getBloodNoLock();
    for (auto &n : neurons_) {
        if (n.state == NeuronState::DEAD) s.dead_neurons++;
        else s.alive_neurons++;
        if (n.state == NeuronState::IGNORE_TEMP || n.state == NeuronState::IGNORE_PERMANENT) s.ignore_neurons++;
        if (n.state == NeuronState::SEIZURE) s.seizure_neurons++;
        s.total_spikes += n.spike_count;
    }
    return s;
}

bool Brain::isMeaningfulWord(const std::string& word) const {
    static std::vector<std::string> dict = {"ا","ب","م","ن","و"," ","سلام","آب","نان","من","تو","ما","خوب","آفرین"};
    for (auto &w : dict) if (w == word) return true;
    if (word.size() <= 4) return true;
    return false;
}

void Brain::onMeaningfulOutput(const std::string& word) {
    (void)word;
    mana_pool_.injectBloodNoLock(5.0);
    Region* out_r = findRegion("Output-خروجی-زبان");
    if (out_r) {
        for (auto nid : out_r->neuron_ids) {
            if (nid < neurons_.size() && (rng_()%100)<20) {
                neurons_[nid].mana += 1.0f;
            }
        }
    }
}

void Brain::handlePruning() {
    for (auto &src : neurons_) {
        if (src.state == NeuronState::DEAD) continue;
        for (size_t i=0;i<src.outputs.size();) {
            uint32_t to = src.outputs[i].to_neuron_id;
            if (to < neurons_.size() && neurons_[to].state == NeuronState::IGNORE_PERMANENT) {
                uint32_t new_to = rng_() % neurons_.size();
                if (new_to != src.id && new_to != to) {
                    src.outputs[i].to_neuron_id = new_to;
                    src.outputs[i].integrity = 1.0f;
                    src.outputs[i].known = false;
                    ++i;
                } else {
                    src.outputs.erase(src.outputs.begin()+i);
                }
            } else ++i;
        }
    }
}

void Brain::handleGarbageCollect() {
    for (auto &n : neurons_) {
        if (n.state == NeuronState::IGNORE_PERMANENT) {
            if (n.input_ids.empty() && n.outputs.empty()) {
                n.state = NeuronState::DEAD;
            }
            bool has_live_out = false;
            for (auto &s : n.outputs) if (s.integrity > 0) has_live_out = true;
            if (!has_live_out && n.input_ids.empty()) {
                n.state = NeuronState::DEAD;
            }
        }
    }
}

} // namespace daaa
