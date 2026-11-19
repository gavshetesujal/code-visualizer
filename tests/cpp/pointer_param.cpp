// EXPECT value=100
#include <iostream>
using namespace std;
void inc(int* ptr) {
    if (ptr != nullptr) {
        (*ptr)++;
    }
}
void setTo(int* q, int v) {
    *q = v;
}
int main() {
    int value = 41;
    int* ptr = &value;
    inc(ptr);
    setTo(&value, 100);
    cout << value << endl;
    return 0;
}
