public class Main {
    // Nested class representing a data structure node for future visualization
    static class VisualNode {
        private final int id;
        private final String name;
        private double weight;

        public VisualNode(int id, String name, double weight) {
            this.id = id;
            this.name = name;
            this.weight = weight;
        }

        public void scaleWeight(double factor) {
            this.weight *= factor;
        }

        public void display() {
            System.out.printf("  VisualNode [id=%d, name='%s', weight=%.2f]%n", id, name, weight);
        }
    }

    public static void main(String[] args) {
        System.out.println("=== Java Environment Verification ===");

        // Objects, methods, and output
        VisualNode node1 = new VisualNode(101, "SourceNode", 1.5);
        VisualNode node2 = new VisualNode(102, "TargetNode", 2.0);

        System.out.println("Initial Nodes:");
        node1.display();
        node2.display();

        System.out.println("Scaling weights by factor 2.5:");
        node1.scaleWeight(2.5);
        node2.scaleWeight(2.5);

        node1.display();
        node2.display();

        System.out.println("Java program executed successfully.");
    }
}

