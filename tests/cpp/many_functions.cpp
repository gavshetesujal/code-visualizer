#include <iostream>
#include <vector>
using namespace std;

int f1(int n) {
    int s = 0;
    for (int i = 0; i < n; i++) {
        if (i % 2 == 0) s += i * 1; else s -= 1;
    }
    return s;
}

int f2(int n) {
    int s = 0;
    for (int i = 0; i < n; i++) {
        if (i % 2 == 0) s += i * 2; else s -= 2;
    }
    return s;
}

int f3(int n) {
    int s = 0;
    for (int i = 0; i < n; i++) {
        if (i % 2 == 0) s += i * 3; else s -= 3;
    }
    return s;
}

int f4(int n) {
    int s = 0;
    for (int i = 0; i < n; i++) {
        if (i % 2 == 0) s += i * 4; else s -= 4;
    }
    return s;
}

int f5(int n) {
    int s = 0;
    for (int i = 0; i < n; i++) {
        if (i % 2 == 0) s += i * 5; else s -= 5;
    }
    return s;
}

int f6(int n) {
    int s = 0;
    for (int i = 0; i < n; i++) {
        if (i % 2 == 0) s += i * 6; else s -= 6;
    }
    return s;
}

int f7(int n) {
    int s = 0;
    for (int i = 0; i < n; i++) {
        if (i % 2 == 0) s += i * 7; else s -= 7;
    }
    return s;
}

int f8(int n) {
    int s = 0;
    for (int i = 0; i < n; i++) {
        if (i % 2 == 0) s += i * 8; else s -= 8;
    }
    return s;
}

int main() {
    int total = 0;
    int r1 = f1(3);
    total += r1;
    cout << "r1=" << r1 << endl;
    int r2 = f2(4);
    total += r2;
    cout << "r2=" << r2 << endl;
    int r3 = f3(5);
    total += r3;
    cout << "r3=" << r3 << endl;
    int r4 = f4(6);
    total += r4;
    cout << "r4=" << r4 << endl;
    int r5 = f5(7);
    total += r5;
    cout << "r5=" << r5 << endl;
    int r6 = f6(8);
    total += r6;
    cout << "r6=" << r6 << endl;
    int r7 = f7(9);
    total += r7;
    cout << "r7=" << r7 << endl;
    int r8 = f8(10);
    total += r8;
    cout << "r8=" << r8 << endl;
    vector<int> v;
    for (int j = 0; j < 6; j++) { v.push_back(j*j); }
    while (total > 0) { total -= 7; }
    cout << total << endl;
    return 0;
}
