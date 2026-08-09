#pragma once
// کدک برگشت‌پذیر: حرف فارسی <-> الگوی 0/1
// الزام سند: تابع ورودی خارجی به 0/1 دقیقا معکوس سیستم الگو به حرف فارسی باشد
// یعنی یک bijection واقعی، بدون اتلاف: decode(encode(c)) == c

#include <string>
#include <vector>
#include <map>
#include <cstdint>
#include <stdexcept>

namespace daaa {

struct CodecEntry {
    std::string persian_char_utf8; // یک حرف فارسی به صورت UTF-8 (مثلاً "ا")
    uint8_t pattern; // 6 بیت (0..63) - الگوی باینری یکتا
};

class PersianCodec {
public:
    PersianCodec();

    // ساخت جدول پیش‌فرض (۴۰ کاراکتر پایه + رزرو تا ۶۴)
    static PersianCodec createDefault();

    // encode: حرف فارسی -> الگوی ۶ بیتی (0/1)
    uint8_t encode(const std::string& persian_char) const;
    std::vector<uint8_t> encodeString(const std::string& utf8_text) const; // رشته فارسی -> بردار patternها

    // decode: الگوی ۶ بیتی -> حرف فارسی - دقیقا معکوس encode
    std::string decode(uint8_t pattern) const;
    std::string decodeToString(const std::vector<uint8_t>& patterns) const;

    // تبدیل pattern به بیت‌ها: 0/1 vector سایز 6 (MSB first)
    static std::vector<int> patternToBits(uint8_t pattern); // 6 بیت
    static uint8_t bitsToPattern(const std::vector<int>& bits); // باید دقیقا 6 بیت

    // ورودی خارجی به 0/1: متن فارسی -> جریان بیت 0/1 (برای تزریق به نورون‌های ورودی)
    std::vector<int> externalInputToBits(const std::string& utf8_text) const;
    // معکوس: جریان بیت 0/1 -> متن فارسی (برای خروجی نهایی)
    std::string bitsToPersian(const std::vector<int>& bits) const;

    // بررسی bijection: آیا واقعا یک به یک و پوشاست؟
    bool verifyBijection() const;

    // دسترسی به جدول برای ذخیره در .afu
    const std::vector<CodecEntry>& entries() const { return table_; }
    void addEntry(const std::string& ch, uint8_t pattern);

    // برای دیباگ
    size_t size() const { return table_.size(); }

private:
    std::vector<CodecEntry> table_;
    std::map<std::string, uint8_t> char_to_pattern_;
    std::map<uint8_t, std::string> pattern_to_char_;

    void rebuildMaps();
    static std::vector<std::string> splitUtf8(const std::string& s);
};

} // namespace daaa
