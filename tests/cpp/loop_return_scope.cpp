#include <iostream>
using namespace std;

int firstMultiple(int n, int limit) {
    for (int i = 1; i <= limit; i++) {
        if (i % n == 0) {
            return i;
        }
    }
    return -1;
}

int main() {
    int a = firstMultiple(7, 50);
    int b = firstMultiple(60, 50);
    int total = 0;
    for (int i = 0; i < 4; i++) {
        total += i;
    }
    int i = 100;
    cout << a << " " << b << " " << total << " " << i << endl;
    return 0;
}
// EXPECT a=7
// EXPECT b=-1
// EXPECT total=6
// EXPECT i=100
// EXPECT_LINE return 7;=7
