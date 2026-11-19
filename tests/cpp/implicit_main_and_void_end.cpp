#include <iostream>
using namespace std;

void greet(int n) {
    int sq = n * n;
    cout << "sq=" << sq << endl;
}

int main() {
    greet(4);
    int done = 1;
    cout << "done " << done << endl;
}
// EXPECT done=1
// EXPECT_LINE return;=7
// EXPECT_LINE end of main=13
