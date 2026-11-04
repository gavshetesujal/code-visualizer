#!/usr/bin/env python3
"""
Code Visualizer - Python Environment Verification
"""

def generate_fibonacci(n: int):
    sequence = []
    a, b = 0, 1
    for _ in range(n):
        sequence.append(a)
        a, b = b, a + b
    return sequence

def main():
    print("=== Python Environment Verification ===")

    # Variables
    count = 8
    framework_name = "Code Visualizer"
    print(f"Project: {framework_name}")
    print(f"Generating first {count} Fibonacci numbers:")

    # Function call and loop
    fib_series = generate_fibonacci(count)
    for idx, num in enumerate(fib_series):
        print(f"  Step {idx}: {num}")

    print("Python program executed successfully.")

if __name__ == "__main__":
    main()

