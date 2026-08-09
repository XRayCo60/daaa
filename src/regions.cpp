#include "../include/regions.h"

namespace daaa {

void EfferenceBuffer::push(uint64_t tick, uint8_t pattern, const std::string& ch) {
    Slot s;
    s.tick = tick;
    s.pattern = pattern;
    s.persian_char = ch;
    s.valid = true;
    slots[write_ptr] = s;
    write_ptr = (write_ptr + 1) % CAPACITY;
}

std::vector<EfferenceBuffer::Slot> EfferenceBuffer::getDelayed(uint64_t current_tick) const {
    std::vector<Slot> out;
    for (auto &s : slots) {
        if (!s.valid) continue;
        if (current_tick >= s.tick + delay_ticks) {
            out.push_back(s);
        }
    }
    return out;
}

void EfferenceBuffer::clear() {
    for (auto &s : slots) s.valid = false;
    write_ptr = 0;
}

} // namespace daaa
