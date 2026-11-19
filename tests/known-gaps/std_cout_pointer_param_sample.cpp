#include <iostream>
#include <string>
#include <vector>
#include <memory>

// Class demonstration
class Node {
private:
    int id;
    std::string label;
public:
    Node(int id, const std::string& label) : id(id), label(label) {}

    int getId() const { return id; }
    const std::string& getLabel() const { return label; }

    void describe() const {
        std::cout << "  Node[id=" << id << ", label=\"" << label << "\"]" << std::endl;
    }
};

// Function using pointers and references
void incrementViaPointer(int* ptr) {
    if (ptr != nullptr) {
        (*ptr)++;
    }
}

int main() {
    std::cout << "=== C++ Environment Verification ===" << std::endl;

    // Variables
    int value = 41;
    int* ptr = &value;

    std::cout << "Initial value: " << value << " (at pointer " << ptr << ")" << std::endl;
    incrementViaPointer(ptr);
    std::cout << "Value after pointer increment: " << value << std::endl;

    // Class and object instantiation
    Node nodeA(1, "Root");
    Node nodeB(2, "LeftChild");

    std::cout << "Nodes created:" << std::endl;
    nodeA.describe();
    nodeB.describe();

    // Smart pointer demonstration
    auto dynamicNode = std::make_unique<Node>(3, "RightChild");
    std::cout << "Dynamic node via unique_ptr:" << std::endl;
    dynamicNode->describe();

    std::cout << "C++ program executed successfully." << std::endl;
    return 0;
}

