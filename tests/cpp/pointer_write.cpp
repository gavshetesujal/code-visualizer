// EXPECT sum=38
#include <iostream>
using namespace std;
int main() {
    int sum = 26;
    int* p = &sum;
    *p = *p + 1;
    (*p)++;
    *p += 10;
    cout << sum << endl;
    return 0;
}
