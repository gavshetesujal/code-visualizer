#include <iostream>
#include <string>
using namespace std;

// ==========================================
// 1. NORMAL FUNCTIONS
// ==========================================

int add(int a, int b)
{
    int result = a + b;
    return result;
}

int multiply(int a, int b)
{
    return a * b;
}

// ==========================================
// 2. RECURSION
// ==========================================

int factorial(int n)
{
    if (n <= 1)
        return 1;

    return n * factorial(n - 1);
}

int fibonacci(int n)
{
    if (n <= 1)
        return n;

    return fibonacci(n - 1) + fibonacci(n - 2);
}

// ==========================================
// 3. CLASS WITH PRIVATE AND PUBLIC
// ==========================================

class Student
{
private:
    int age;
    string name;

    void updateAge()
    {
        age = age + 1;
    }

public:
    int rollNo;

    Student(string n, int a, int r)
    {
        name = n;
        age = a;
        rollNo = r;
    }

    void display()
    {
        cout << name << " " << age << " " << rollNo << endl;
    }

    void increaseAge()
    {
        updateAge();
    }

    int getAge()
    {
        return age;
    }
};

// ==========================================
// 4. INHERITANCE
// ==========================================

class Animal
{
public:
    int animalAge = 5;

    void eat()
    {
        cout << "Animal is eating" << endl;
    }
};

class Pet
{
public:
    void play()
    {
        cout << "Pet is playing" << endl;
    }
};

class Dog : public Animal, public Pet
{
private:
    string breed = "Labrador";

public:
    void bark()
    {
        cout << "Dog is barking" << endl;
    }

    void showBreed()
    {
        cout << breed << endl;
    }
};

// ==========================================
// 5. MULTILEVEL INHERITANCE
// ==========================================

class LivingThing
{
public:
    void breathe()
    {
        cout << "Breathing" << endl;
    }
};

class Mammal : public LivingThing
{
public:
    void walk()
    {
        cout << "Walking" << endl;
    }
};

class Human : public Mammal
{
public:
    void think()
    {
        cout << "Thinking" << endl;
    }
};

// ==========================================
// 6. MAIN PROGRAM
// ==========================================

int main()
{
    cout << "\n===== CODE VISUALIZER MASTER TEST =====\n";

    // Variables
    cout << "\n--- VARIABLES ---\n";

    int number = 10;
    float marks = 85.5f;
    double price = 99.99;
    char grade = 'A';
    string name = "Alex";
    bool passed = true;

    number = 20;
    marks = marks + 5.0f;

    cout << number << " " << marks << endl;

    // For loop
    cout << "\n--- FOR LOOP ---\n";

    int sum = 0;

    for (int i = 1; i <= 5; i++)
    {
        sum += i;
    }

    cout << "Sum: " << sum << endl;

    // While loop
    cout << "\n--- WHILE LOOP ---\n";

    int j = 0;

    while (j < 3)
    {
        cout << j << endl;
        j++;
    }

    // Do while
    cout << "\n--- DO WHILE ---\n";

    int k = 0;

    do
    {
        cout << k << endl;
        k++;
    } while (k < 2);

    // Nested loops
    cout << "\n--- NESTED LOOPS ---\n";

    for (int i = 1; i <= 3; i++)
    {
        for (int j = 1; j <= 2; j++)
        {
            cout << i << "," << j << endl;
        }
    }

    // Large loop
    cout << "\n--- LARGE LOOP ---\n";

    int total = 0;

    for (int i = 1; i <= 100; i++)
    {
        total += i;
    }

    cout << "Total: " << total << endl;

    // Functions
    cout << "\n--- FUNCTIONS ---\n";

    int answer = add(10, 20);
    int product = multiply(4, 5);

    cout << answer << " " << product << endl;

    // Recursion
    cout << "\n--- RECURSION ---\n";

    cout << "Factorial: " << factorial(4) << endl;
    cout << "Fibonacci: " << fibonacci(5) << endl;

    // Terminal input
    cout << "\n--- INPUT ---\n";

    int userNumber;

    cout << "Enter a number: ";
    cin >> userNumber;

    int doubled = userNumber * 2;

    cout << "Doubled: " << doubled << endl;

    // Class and objects
    cout << "\n--- CLASSES ---\n";

    Student s1("Alex", 18, 101);
    Student s2("Sam", 20, 102);

    s1.display();
    s2.display();

    s1.increaseAge();

    cout << "Updated age: " << s1.getAge() << endl;
    cout << "Second student age: " << s2.getAge() << endl;

    // Multiple inheritance
    cout << "\n--- MULTIPLE INHERITANCE ---\n";

    Dog d;

    d.eat();
    d.play();
    d.bark();
    d.showBreed();

    cout << "Animal age: " << d.animalAge << endl;

    // Multilevel inheritance
    cout << "\n--- MULTILEVEL INHERITANCE ---\n";

    Human h;

    h.breathe();
    h.walk();
    h.think();

    cout << "\n===== ALL TESTS COMPLETED =====\n";

    return 0;
}
