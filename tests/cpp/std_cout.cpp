#include <iostream>
int add(int a, int b) { return a + b; }
int main() {
    int x = 6;
    int* p = &x;
    std::cout << "x=" << x << std::endl;
    *p = add(*p, 4);
    std::cout << "after: " << x << " and " << add(1, 2) << std::endl;
    return 0;
}
