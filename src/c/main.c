#include <stdio.h>

// Function declaration
long long calculate_factorial(int n) {
    long long result = 1;
    for (int i = 1; i <= n; i++) {
        result *= i;
    }
    return result;
}

int main(void) {
    // Basic variables
    int count = 5;
    double step = 0.5;
    printf("=== C Environment Verification ===\n");
    printf("Initial count: %d, step: %.1f\n", count, step);

    // Loop
    printf("Running loop from 1 to %d:\n", count);
    for (int i = 1; i <= count; i++) {
        long long fact = calculate_factorial(i);
        printf("  Factorial of %d = %lld\n", i, fact);
    }

    printf("C program executed successfully.\n");
    return 0;
}

