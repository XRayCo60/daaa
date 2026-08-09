CXX=g++
CXXFLAGS=-std=c++17 -O2 -Wall -Wextra -Iinclude -g -pthread
# برای i7-2670QM بدون AVX2: از -march=sandybridge استفاده می‌کنیم تا مطمئن باشیم AVX2 استفاده نمی‌شود
# روی این سرور Xeon، sandybridge همچنان کار می‌کند ولی می‌توانیم native هم بزنیم
# برای تست روی 2670QM: CXXFLAGS += -march=sandybridge
LDFLAGS=-pthread

SRC=src/codec.cpp src/neuron.cpp src/mana.cpp src/device_cpu.cpp src/device_cuda_stub.cpp src/regions.cpp src/brain.cpp src/afu.cpp
OBJ=$(SRC:.cpp=.o)

all: afu_runner afu_tests afu_gui

afu_runner: $(OBJ) src/runner.cpp
	$(CXX) $(CXXFLAGS) $(OBJ) src/runner.cpp -o afu_runner $(LDFLAGS)

afu_tests: $(OBJ) examples/tests.cpp
	$(CXX) $(CXXFLAGS) $(OBJ) examples/tests.cpp -o afu_tests $(LDFLAGS)

afu_gui: $(OBJ) src/gui_server.cpp
	$(CXX) $(CXXFLAGS) $(OBJ) src/gui_server.cpp -o afu_gui $(LDFLAGS)

clean:
	rm -f src/*.o afu_runner afu_tests afu_gui *.afu

.PHONY: all clean

# نمونه ساخت مدل کوچک
sample: afu_runner
	./afu_runner

gui: afu_gui
	./afu_gui 8080
