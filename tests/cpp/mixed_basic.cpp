// EXPECT sum=27
#include <iostream>
#include <vector>
using namespace std;

class Account {
private:
    int balance;
public:
    Account(int b) : balance(b) {}
    void deposit(int x) { balance += x; }
    int get() const { return balance; }
};

int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    int arr[5] = {5, 3, 8, 1, 9};
    int sum = 0;
    for (int i = 0; i < 5; i++) {
        sum += arr[i];
    }
    cout << "sum=" << sum << endl;
    int* p = &sum;
    *p = *p + 1;
    Account acc(100);
    acc.deposit(50);
    cout << "balance=" << acc.get() << endl;
    cout << "fact=" << factorial(4) << endl;
    return 0;
}
