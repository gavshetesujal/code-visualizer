#include <iostream>
using namespace std;
class Account {
private:
    int balance;
public:
    Account(int b) : balance(b) {}
    void deposit(int x) { balance += x; }
    int get() const { return balance; }
};
int main() {
    Account acc(100);
    acc.deposit(50);
    cout << "balance=" << acc.get() << endl;
    return 0;
}
