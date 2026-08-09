#include "../include/afu.h"
#include <fstream>
#include <cstring>
#include <iostream>

namespace daaa {

static uint32_t crc32_simple(const uint8_t* data, size_t len) {
    uint32_t crc = 0xFFFFFFFF;
    for (size_t i=0;i<len;++i){
        crc ^= data[i];
        for (int j=0;j<8;++j){
            if (crc & 1) crc = (crc >> 1) ^ 0xEDB88320;
            else crc >>= 1;
        }
    }
    return ~crc;
}

bool AfuFile::save(const std::string& path,
                   const std::vector<Neuron>& neurons,
                   const std::vector<Region>& regions,
                   const PersianCodec& codec,
                   double blood_mana,
                   uint64_t tick) {
    std::ofstream out(path, std::ios::binary);
    if (!out) return false;

    uint32_t total_syn = 0;
    for (auto &n : neurons) total_syn += n.outputs.size();

    AfuHeader hdr{};
    hdr.magic = AFU_MAGIC;
    hdr.version = AFU_VERSION;
    hdr.neuron_count = neurons.size();
    hdr.synapse_count_total = total_syn;
    hdr.region_count = regions.size();
    hdr.codec_entry_count = codec.entries().size();
    hdr.blood_mana = blood_mana;
    hdr.tick_counter = tick;
    hdr.flags = 0;
    // crc از بقیه هدر بدون خودش
    hdr.header_crc = 0;
    hdr.header_crc = crc32_simple((uint8_t*)&hdr, sizeof(hdr) - 4);

    out.write((char*)&hdr, sizeof(hdr));

    // نوشتن نورون‌ها به صورت packed + سیناپس‌ها + local_memory
    for (auto &n : neurons) {
        NeuronPacked p{};
        p.id = n.id;
        p.type = (uint8_t)n.type;
        p.state = (uint8_t)n.state;
        p.is_input = n.is_input_neuron ? 1 : 0;
        p.is_output = n.is_output_neuron ? 1 : 0;
        p.external_writable = n.external_writable ? 1 : 0;
        p.a = n.a; p.b = n.b; p.c = n.c; p.d = n.d;
        p.v = n.v; p.u = n.u;
        p.mana = n.mana;
        p.mana_threshold_sprout = n.mana_threshold_sprout;
        p.spontaneous_rate = n.spontaneous_rate;
        p.storage_arch_id = n.storage_arch_id;
        p.ticks_since_arch_change = n.ticks_since_arch_change;
        p.soft_timer = n.soft_timer;
        p.is_soft = n.is_soft ? 1 : 0;
        p.last_soft_choice = (uint8_t)n.last_soft_choice;
        p.ignore_timer = (uint8_t)std::min<uint32_t>(n.ignore_timer, 255);
        p.seizure_timer = (uint8_t)std::min<uint32_t>(n.seizure_timer, 255);
        p.consecutive_failures = n.consecutive_failures;
        p.spike_count = n.spike_count;
        p.output_count = n.outputs.size();
        p.input_count = n.input_ids.size();

        out.write((char*)&p, sizeof(p));

        // سیناپس‌ها
        for (auto &s : n.outputs) {
            out.write((char*)&s, sizeof(Synapse));
        }
        // input_ids (برای بازسازی سریع)
        if (!n.input_ids.empty()) {
            out.write((char*)n.input_ids.data(), n.input_ids.size()*sizeof(uint32_t));
        }
        // personal_memory (96KB برای همه)
        uint32_t personal_size = n.personal_memory.size();
        out.write((char*)&personal_size, sizeof(personal_size));
        if (personal_size>0) out.write((char*)n.personal_memory.data(), personal_size);
        // storage_memory (فقط برای MEMORY: 512KB)
        uint32_t storage_size = n.storage_memory.size();
        out.write((char*)&storage_size, sizeof(storage_size));
        if (storage_size>0) out.write((char*)n.storage_memory.data(), storage_size);
    }

    // مناطق
    for (auto &r : regions) {
        uint8_t kind = (uint8_t)r.kind;
        out.write((char*)&kind, 1);
        uint8_t meaningful = r.meaningful ? 1 : 0;
        out.write((char*)&meaningful, 1);
        uint32_t name_len = r.name.size();
        out.write((char*)&name_len, sizeof(name_len));
        out.write(r.name.c_str(), name_len);
        uint32_t note_len = r.meaningful_note.size();
        out.write((char*)&note_len, sizeof(note_len));
        if (note_len>0) out.write(r.meaningful_note.c_str(), note_len);
        float share = r.mana_share;
        out.write((char*)&share, sizeof(share));
        uint32_t nid_count = r.neuron_ids.size();
        out.write((char*)&nid_count, sizeof(nid_count));
        if (nid_count>0) out.write((char*)r.neuron_ids.data(), nid_count*sizeof(uint32_t));
    }

    // کدک
    for (auto &e : codec.entries()) {
        uint8_t pat = e.pattern;
        out.write((char*)&pat, 1);
        uint32_t len = e.persian_char_utf8.size();
        out.write((char*)&len, sizeof(len));
        out.write(e.persian_char_utf8.c_str(), len);
    }

    // footer CRC
    out.flush();
    // برای سادگی، CRC کل فایل را حساب نمی‌کنیم، فقط هدر CRC داشت

    return out.good();
}

bool AfuFile::load(const std::string& path,
                   std::vector<Neuron>& out_neurons,
                   std::vector<Region>& out_regions,
                   PersianCodec& out_codec,
                   double& out_blood,
                   uint64_t& out_tick,
                   std::string& error_msg) {
    std::ifstream in(path, std::ios::binary);
    if (!in) { error_msg = "فایل باز نشد: " + path; return false; }

    AfuHeader hdr{};
    in.read((char*)&hdr, sizeof(hdr));
    if (!in) { error_msg = "هدر خوانده نشد"; return false; }
    if (hdr.magic != AFU_MAGIC) { error_msg = "magic اشتباه - فایل afu نیست"; return false; }
    if (hdr.version != 1 && hdr.version != 2 && hdr.version != AFU_VERSION) { error_msg = "ورژن پشتیبانی نمی‌شود: " + std::to_string(hdr.version); return false; }

    // چک CRC هدر
    uint32_t saved_crc = hdr.header_crc;
    hdr.header_crc = 0;
    uint32_t calc_crc = crc32_simple((uint8_t*)&hdr, sizeof(hdr)-4);
    if (calc_crc != saved_crc) { error_msg = "CRC هدر خراب"; return false; }
    hdr.header_crc = saved_crc;

    out_blood = hdr.blood_mana;
    out_tick = hdr.tick_counter;

    out_neurons.clear();
    out_neurons.reserve(hdr.neuron_count);
    for (uint32_t i=0;i<hdr.neuron_count;++i){
        NeuronPacked p{};
        in.read((char*)&p, sizeof(p));
        if (!in) { error_msg = "خوانش نورون packed خراب"; return false; }

        Neuron n(p.id, (NeuronType)p.type);
        n.state = (NeuronState)p.state;
        n.is_input_neuron = p.is_input != 0;
        n.is_output_neuron = p.is_output != 0;
        n.external_writable = p.external_writable != 0;
        n.a = p.a; n.b = p.b; n.c = p.c; n.d = p.d;
        n.v = p.v; n.u = p.u;
        n.mana = p.mana;
        n.mana_threshold_sprout = p.mana_threshold_sprout;
        n.spontaneous_rate = p.spontaneous_rate;
        n.storage_arch_id = p.storage_arch_id;
        n.ticks_since_arch_change = p.ticks_since_arch_change;
        n.soft_timer = p.soft_timer;
        n.is_soft = p.is_soft != 0;
        n.last_soft_choice = (SoftnessChoice)p.last_soft_choice;
        n.ignore_timer = p.ignore_timer;
        n.seizure_timer = p.seizure_timer;
        n.consecutive_failures = p.consecutive_failures;
        n.spike_count = p.spike_count;

        n.outputs.clear();
        n.outputs.reserve(p.output_count);
        for (uint32_t j=0;j<p.output_count;++j){
            Synapse s{};
            in.read((char*)&s, sizeof(s));
            if (!in) { error_msg = "سیناپس خراب"; return false; }
            n.outputs.push_back(s);
        }
        n.input_ids.clear();
        n.input_ids.resize(p.input_count);
        if (p.input_count>0){
            in.read((char*)n.input_ids.data(), p.input_count*sizeof(uint32_t));
            if (!in) { error_msg = "input_ids خراب"; return false; }
        }
        uint32_t personal_size=0;
        in.read((char*)&personal_size, sizeof(personal_size));
        if (!in) { error_msg = "personal_size خراب"; return false; }
        n.personal_memory.assign(personal_size,0);
        if (personal_size>0){
            in.read((char*)n.personal_memory.data(), personal_size);
            if (!in) { error_msg = "personal_memory خراب"; return false; }
        }
        // برای سازگاری با v2: اگر ورژن 2 باشد storage هم بخوان
        if (hdr.version >= 2) {
            uint32_t storage_size=0;
            in.read((char*)&storage_size, sizeof(storage_size));
            if (!in) { error_msg = "storage_size خراب"; return false; }
            n.storage_memory.assign(storage_size,0);
            if (storage_size>0){
                in.read((char*)n.storage_memory.data(), storage_size);
                if (!in) { error_msg = "storage_memory خراب"; return false; }
            }
        } else {
            // v1 قدیمی: یک mem_size بود که personal بود
            n.storage_memory.clear();
        }

        out_neurons.push_back(std::move(n));
    }

    out_regions.clear();
    for (uint32_t i=0;i<hdr.region_count;++i){
        uint8_t kind, meaningful;
        in.read((char*)&kind,1);
        in.read((char*)&meaningful,1);
        uint32_t name_len;
        in.read((char*)&name_len, sizeof(name_len));
        std::string name(name_len, '\0');
        if (name_len>0) in.read(name.data(), name_len);
        uint32_t note_len;
        in.read((char*)&note_len, sizeof(note_len));
        std::string note(note_len, '\0');
        if (note_len>0) in.read(note.data(), note_len);
        float share;
        in.read((char*)&share, sizeof(share));
        uint32_t nid_count;
        in.read((char*)&nid_count, sizeof(nid_count));
        std::vector<uint32_t> ids(nid_count);
        if (nid_count>0) in.read((char*)ids.data(), nid_count*sizeof(uint32_t));

        Region r(name, (RegionKind)kind);
        r.meaningful = meaningful !=0;
        r.meaningful_note = note;
        r.mana_share = share;
        r.neuron_ids = std::move(ids);
        out_regions.push_back(std::move(r));
    }

    // کدک
    PersianCodec codec;
    for (uint32_t i=0;i<hdr.codec_entry_count;++i){
        uint8_t pat;
        in.read((char*)&pat,1);
        uint32_t len;
        in.read((char*)&len, sizeof(len));
        std::string ch(len,'\0');
        if (len>0) in.read(ch.data(), len);
        codec.addEntry(ch, pat);
    }
    if (!codec.verifyBijection()) {
        error_msg = "کدک bijection نیست - فایل خراب";
        return false;
    }
    out_codec = std::move(codec);

    return true;
}

bool AfuFile::verifyFile(const std::string& path) {
    std::vector<Neuron> neurons;
    std::vector<Region> regions;
    PersianCodec codec;
    double blood; uint64_t tick; std::string err;
    return load(path, neurons, regions, codec, blood, tick, err);
}

} // namespace daaa
