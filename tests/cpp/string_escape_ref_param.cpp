#include <iostream>
#include <string>
using namespace std;

class Node {
public:
    int id;
    std::string label;
    Node(int id, const std::string& label) : id(id), label(label) {}
    void describe() const {
        cout << "  Node[id=" << id << ", label=\"" << label << "\"]" << endl;
    }
};

int main() {
    Node a(1, "Root");
    Node b(2, "LeftChild");
    a.describe();
    b.describe();
    cout << "tab\there" << endl;
    return 0;
}
