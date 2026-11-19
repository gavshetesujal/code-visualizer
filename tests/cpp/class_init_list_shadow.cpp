#include <iostream>
using namespace std;
class Box {
private:
    int w;
    int h;
public:
    Box(int w, int h) : w(w), h(h) {}
    int area() const { return w * h; }
    void grow(int d) { w += d; h += d; }
};
int main() {
    Box b(2, 3);
    cout << b.area() << endl;
    b.grow(1);
    cout << b.area() << endl;
    return 0;
}
