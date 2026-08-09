#include "../include/codec.h"
#include <algorithm>
#include <cassert>

namespace daaa {

// تقسیم UTF-8 به کاراکترهای جدا (ساده، فرض بر این که ورودی درست است)
std::vector<std::string> PersianCodec::splitUtf8(const std::string& s) {
    std::vector<std::string> out;
    size_t i = 0;
    while (i < s.size()) {
        unsigned char c = s[i];
        size_t len = 0;
        if ((c & 0x80) == 0) len = 1;
        else if ((c & 0xE0) == 0xC0) len = 2;
        else if ((c & 0xF0) == 0xE0) len = 3;
        else if ((c & 0xF8) == 0xF0) len = 4;
        else len = 1; // خطا، ولی ادامه
        if (i + len > s.size()) len = s.size() - i;
        out.push_back(s.substr(i, len));
        i += len;
    }
    return out;
}

PersianCodec::PersianCodec() {}

void PersianCodec::rebuildMaps() {
    char_to_pattern_.clear();
    pattern_to_char_.clear();
    for (auto &e : table_) {
        char_to_pattern_[e.persian_char_utf8] = e.pattern;
        pattern_to_char_[e.pattern] = e.persian_char_utf8;
    }
}

PersianCodec PersianCodec::createDefault() {
    PersianCodec codec;
    // الفبای پایه: ۳۲ حرف فارسی رایج + چند اضافه تا ۴۰، رزرو تا ۶۴
    // مهم: هر کاراکتر یک الگوی ۶ بیتی یکتا داشته باشد -> bijection
    std::vector<std::string> base = {
        "ا","ب","پ","ت","ث","ج","چ","ح","خ","د","ذ","ر","ز","ژ","س","ش","ص","ض","ط","ظ","ع","غ","ف","ق","ک","گ","ل","م","ن","و","ه","ی",
        " ",".","،","؟","!","\n","آ","ء","ئ","ؤ"
    };
    // base size = 42
    for (size_t i = 0; i < base.size(); ++i) {
        codec.table_.push_back({base[i], static_cast<uint8_t>(i)}); // pattern = i (0..41)
    }
    // رزرو بقیه تا 64 برای توسعه آینده (مثلاً اعداد)
    // فعلاً خالی می‌گذاریم ولی می‌توان "۰".."۹" را هم اضافه کرد
    std::vector<std::string> extra = {"۰","۱","۲","۳","۴","۵","۶","۷","۸","۹","a","b","c","d","e","f","g","h","i","j","k","l"};
    for (size_t i = 0; i < extra.size() && (base.size()+i) < 64; ++i) {
        codec.table_.push_back({extra[i], static_cast<uint8_t>(base.size()+i)});
    }
    codec.rebuildMaps();
    assert(codec.verifyBijection());
    return codec;
}

void PersianCodec::addEntry(const std::string& ch, uint8_t pattern) {
    if (pattern > 63) throw std::runtime_error("pattern باید 0..63 باشد (۶ بیت)");
    // حذف قبلی اگر وجود داشت
    table_.erase(std::remove_if(table_.begin(), table_.end(), [&](const CodecEntry& e){
        return e.persian_char_utf8 == ch || e.pattern == pattern;
    }), table_.end());
    table_.push_back({ch, pattern});
    rebuildMaps();
}

uint8_t PersianCodec::encode(const std::string& persian_char) const {
    auto it = char_to_pattern_.find(persian_char);
    if (it == char_to_pattern_.end()) {
        // اگر کاراکتر ناشناس بود، به فاصله نگاشت کن (یا خطا)
        // برای سادگی: اگر ناشناس، pattern 0 (ا) برگردان ولی در لاگ هشدار
        // اینجا exception می‌دهیم تا تست bijection دقیق بماند
        auto sp = char_to_pattern_.find(" ");
        if (sp != char_to_pattern_.end()) return sp->second;
        throw std::runtime_error("کاراکتر ناشناس در encode: " + persian_char);
    }
    return it->second;
}

std::vector<uint8_t> PersianCodec::encodeString(const std::string& utf8_text) const {
    std::vector<uint8_t> out;
    auto chars = splitUtf8(utf8_text);
    for (auto &ch : chars) {
        // نادیده گرفتن کاراکترهای خالی؟
        if (ch.empty()) continue;
        try {
            out.push_back(encode(ch));
        } catch (...) {
            // ناشناس ها را به space تبدیل کن
            out.push_back(encode(" "));
        }
    }
    return out;
}

std::string PersianCodec::decode(uint8_t pattern) const {
    if (pattern > 63) throw std::runtime_error("pattern out of range");
    auto it = pattern_to_char_.find(pattern);
    if (it == pattern_to_char_.end()) {
        return " "; // رزرو شده ولی تعریف نشده -> space
    }
    return it->second;
}

std::string PersianCodec::decodeToString(const std::vector<uint8_t>& patterns) const {
    std::string out;
    for (auto p : patterns) out += decode(p);
    return out;
}

std::vector<int> PersianCodec::patternToBits(uint8_t pattern) {
    if (pattern > 63) pattern &= 0x3F; // فقط ۶ بیت پایین
    std::vector<int> bits(6);
    // MSB first: bit 5 .. bit 0
    for (int i = 0; i < 6; ++i) {
        bits[i] = (pattern >> (5 - i)) & 1;
    }
    return bits;
}

uint8_t PersianCodec::bitsToPattern(const std::vector<int>& bits) {
    if (bits.size() != 6) throw std::runtime_error("bits باید دقیقاً ۶ تایی باشد");
    uint8_t p = 0;
    for (int i = 0; i < 6; ++i) {
        if (bits[i] != 0 && bits[i] != 1) throw std::runtime_error("bit باید ۰ یا ۱ باشد");
        p = (p << 1) | (bits[i] & 1);
    }
    return p;
}

std::vector<int> PersianCodec::externalInputToBits(const std::string& utf8_text) const {
    auto patterns = encodeString(utf8_text);
    std::vector<int> bits;
    bits.reserve(patterns.size()*6);
    for (auto pat : patterns) {
        auto b = patternToBits(pat);
        bits.insert(bits.end(), b.begin(), b.end());
    }
    return bits;
}

std::string PersianCodec::bitsToPersian(const std::vector<int>& bits) const {
    if (bits.size() % 6 != 0) throw std::runtime_error("تعداد بیت‌ها باید مضرب ۶ باشد");
    std::vector<uint8_t> patterns;
    for (size_t i = 0; i < bits.size(); i += 6) {
        std::vector<int> chunk(bits.begin()+i, bits.begin()+i+6);
        patterns.push_back(bitsToPattern(chunk));
    }
    return decodeToString(patterns);
}

bool PersianCodec::verifyBijection() const {
    // بررسی یک به یک بودن: هر pattern یکتا، هر char یکتا
    std::map<std::string, int> char_count;
    std::map<uint8_t, int> pat_count;
    for (auto &e : table_) {
        char_count[e.persian_char_utf8]++;
        pat_count[e.pattern]++;
        if (e.pattern > 63) return false;
    }
    for (auto &kv : char_count) if (kv.second != 1) return false;
    for (auto &kv : pat_count) if (kv.second != 1) return false;

    // بررسی معکوس‌پذیری: برای هر entry decode(encode(c)) == c
    for (auto &e : table_) {
        try {
            uint8_t p = encode(e.persian_char_utf8);
            if (p != e.pattern) return false;
            std::string c2 = decode(p);
            if (c2 != e.persian_char_utf8) return false;
        } catch (...) { return false; }
    }
    // و برای هر pattern: encode(decode(p)) == p
    for (auto &e : table_) {
        std::string ch = decode(e.pattern);
        uint8_t p2 = encode(ch);
        if (p2 != e.pattern) return false;
    }
    return true;
}

} // namespace daaa
