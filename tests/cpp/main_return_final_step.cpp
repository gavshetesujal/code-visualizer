#include <iostream>
using namespace std;

int fact(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * fact(n - 1);
}

int add(int a, int b) { return a + b; }

int main() {
    int s = add(2, 3);
    int f = fact(3);
    cout << s << " " << f << endl;
    return 0;
}
// EXPECT s=5
// EXPECT f=6
// EXPECT_LINE return 0;=17
// EXPECT_LINE return 1;=6
