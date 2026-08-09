#pragma once
// فرمت فایل .afu - خودکفا، مثل GGUF/Safetensors ولی سفارشی
// فایل مدل و runner جداست: این فایل فقط مدل است

#include <cstdint>
#include <string>
#include <vector>
#include "neuron.h"
#include "regions.h"
#include "codec.h"

namespace daaa {

constexpr uint32_t AFU_MAGIC = 0x31465541; // "AFU1" little endian: 0x41='A',0x55='U',0x46='F',0x31='1' -> در حافظه "AFU1"
constexpr uint32_t AFU_VERSION = 1;

#pragma pack(push,1)
struct AfuHeader {
    uint32_t magic; // AFU_MAGIC
    uint32_t version;
    uint32_t neuron_count;
    uint32_t synapse_count_total;
    uint32_t region_count;
    uint32_t codec_entry_count;
    double blood_mana;
    uint64_t tick_counter;
    uint32_t flags;
    uint32_t header_crc; // crc ساده از بقیه هدر
};
#pragma pack(pop)

class AfuFile {
public:
    static bool save(const std::string& path,
                     const std::vector<Neuron>& neurons,
                     const std::vector<Region>& regions,
                     const PersianCodec& codec,
                     double blood_mana,
                     uint64_t tick);

    static bool load(const std::string& path,
                     std::vector<Neuron>& out_neurons,
                     std::vector<Region>& out_regions,
                     PersianCodec& out_codec,
                     double& out_blood,
                     uint64_t& out_tick,
                     std::string& error_msg);

    // برای تست
    static bool verifyFile(const std::string& path);
};

} // namespace daaa
