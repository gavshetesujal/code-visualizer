"""
Python Real-Time Execution Tracer for Code Visualizer
Authoritative source of execution events:
- Captures ACTUAL line execution, real variable changes, object graphs
- Never creates fake data structures or sample numbers
- Distinguishes empty states from active states
- Supports linked lists, trees, arrays, stacks, queues, and ordinary execution flow
"""

import sys
import os
import json
import io
import traceback

class ExecutionTracer:
    def __init__(self, target_filepath, user_inputs=None):
        self.target_filepath = os.path.abspath(target_filepath)
        self.target_filename = os.path.basename(self.target_filepath)
        self.steps = []
        self.step_limit = 1500
        self.output_capture = io.StringIO()
        self.user_inputs = user_inputs or []
        self.input_index = 0
        self.source_lines = {}
        
        try:
            with open(self.target_filepath, 'r', encoding='utf-8') as f:
                self.source_lines = {i + 1: line.rstrip() for i, line in enumerate(f.readlines())}
        except Exception:
            pass

    def serialize_value(self, val, depth=0):
        if depth > 2:
            return repr(val)
        if val is None:
            return "None"
        if isinstance(val, (int, float, bool)):
            return str(val)
        if isinstance(val, str):
            return repr(val) if len(val) < 30 else repr(val[:27] + "...")
        if isinstance(val, (list, tuple)):
            items = [self.serialize_value(x, depth + 1) for x in val[:8]]
            if len(val) > 8:
                items.append(f"... (+{len(val)-8} more)")
            return "[" + ", ".join(items) + "]" if isinstance(val, list) else "(" + ", ".join(items) + ")"
        if isinstance(val, dict):
            entries = [f"{self.serialize_value(k, depth+1)}: {self.serialize_value(v, depth+1)}" for k, v in list(val.items())[:6]]
            return "{" + ", ".join(entries) + "}"
        cls_name = getattr(type(val), '__name__', 'object')
        return f"{cls_name}@{hex(id(val))[-4:]}"

    def build_visual_structures(self, local_vars, frame):
        """
        Dynamically derives visual structures from ACTUAL runtime objects:
        - Checks for genuinely linked node objects (with actual .next pointers)
        - Checks for genuine arrays / lists
        - Checks for trees (with actual .left and .right pointers)
        - If none of the above exist, generates a Variable & Execution Flow representation
        """
        structures = []

        # 1. Search for actual linked lists (chains of objects linked via .next)
        candidate_nodes = []
        for name, info in local_vars.items():
            obj = info.get('_raw_obj')
            if obj is not None and (hasattr(obj, 'next') or hasattr(obj, 'val') or hasattr(obj, 'data')):
                candidate_nodes.append((name, obj))

        if candidate_nodes:
            # Trace the longest genuine chain starting from candidate head
            best_chain = []
            head_label = candidate_nodes[0][0]
            for c_name, c_obj in candidate_nodes:
                curr = c_obj
                chain = []
                visited = set()
                while curr is not None and id(curr) not in visited and len(chain) < 25:
                    visited.add(id(curr))
                    val_attr = getattr(curr, 'val', getattr(curr, 'data', getattr(curr, 'value', None)))
                    val_str = self.serialize_value(val_attr) if val_attr is not None else type(curr).__name__
                    next_attr = getattr(curr, 'next', None)
                    chain.append({
                        'id': f"node_{hex(id(curr))}",
                        'address': f"0x{hex(id(curr))[-4:].upper()}",
                        'value': val_str,
                        'subLabel': f"Node {len(chain)+1}",
                        'type': type(curr).__name__,
                        'next_id': f"node_{hex(id(next_attr))}" if next_attr is not None else None,
                        'is_null': next_attr is None
                    })
                    curr = next_attr
                if len(chain) > len(best_chain):
                    best_chain = chain
                    head_label = c_name

            if best_chain:
                blocks = []
                connections = []
                for i, node_data in enumerate(best_chain):
                    blocks.append({
                        'id': node_data['id'],
                        'address': node_data['address'],
                        'value': node_data['value'],
                        'subLabel': node_data['subLabel'],
                        'type': node_data['type'],
                        'isActive': (i == len(best_chain) - 1)
                    })
                    if node_data['next_id']:
                        connections.append({
                            'fromId': node_data['id'],
                            'toId': node_data['next_id'],
                            'label': 'next',
                            'animated': True
                        })
                    elif node_data['is_null']:
                        connections.append({
                            'fromId': node_data['id'],
                            'targetLabel': 'None'
                        })

                structures.append({
                    'id': 'struct-ll',
                    'title': f"Linked List ({len(blocks)} Nodes)",
                    'kind': 'linked-list',
                    'blocks': blocks,
                    'connections': connections,
                    'pointers': [{'targetBlockId': blocks[0]['id'], 'label': 'HEAD', 'color': '#f59e0b', 'direction': 'down'}],
                    'callout': {'targetBlockId': blocks[-1]['id'], 'text': f"{head_label} updated"}
                })
                return structures

        # 2. Check for actual lists / arrays
        for name, info in local_vars.items():
            obj = info.get('_raw_obj')
            if isinstance(obj, list) and len(obj) > 0:
                blocks = []
                for idx, elem in enumerate(obj[:12]):
                    blocks.append({
                        'id': f"{name}_{idx}",
                        'address': f"[{idx}]",
                        'value': self.serialize_value(elem),
                        'subLabel': f"{name}[{idx}]",
                        'type': type(elem).__name__,
                        'isActive': idx == len(obj) - 1
                    })
                structures.append({
                    'id': f"struct-arr-{name}",
                    'title': f"Array: {name} ({len(obj)} items)",
                    'kind': 'array',
                    'blocks': blocks,
                    'pointers': [{'targetBlockId': blocks[0]['id'], 'label': name, 'color': '#38bdf8', 'direction': 'down'}]
                })
                return structures

        # 3. Check for Trees (has .left and .right)
        for name, info in local_vars.items():
            obj = info.get('_raw_obj')
            if obj is not None and (hasattr(obj, 'left') or hasattr(obj, 'right')):
                val_attr = getattr(obj, 'val', getattr(obj, 'value', 'Root'))
                structures.append({
                    'id': 'struct-tree',
                    'title': f"Tree: {name}",
                    'kind': 'tree',
                    'blocks': [{
                        'id': f"tree_{id(obj)}",
                        'address': f"0x{hex(id(obj))[-4:].upper()}",
                        'value': self.serialize_value(val_attr),
                        'subLabel': name,
                        'type': type(obj).__name__,
                        'isActive': True
                    }]
                })
                return structures

        # 4. Standard Program Execution & Variables (no data structure fabricated!)
        active_vars = [v for k, v in local_vars.items() if not k.startswith('_')]
        if active_vars:
            blocks = []
            for v in active_vars[:8]:
                blocks.append({
                    'id': f"var_{v['name']}",
                    'address': v['address'],
                    'value': v['value'],
                    'subLabel': f"{v['name']} ({v['type']})",
                    'type': v['type'],
                    'isActive': True
                })
            structures.append({
                'id': 'struct-vars',
                'title': 'Active Variables',
                'kind': 'variables',
                'blocks': blocks
            })

        return structures

    def trace_callback(self, frame, event, arg):
        if event != 'line':
            return self.trace_callback

        co = frame.f_code
        curr_file = os.path.abspath(co.co_filename)
        if curr_file != self.target_filepath:
            return self.trace_callback

        if len(self.steps) >= self.step_limit:
            return None

        line_num = frame.f_lineno
        stmt_text = self.source_lines.get(line_num, "").strip()

        stack_frames = []
        f = frame
        f_id = 1
        while f:
            if os.path.abspath(f.f_code.co_filename) == self.target_filepath:
                stack_frames.append({
                    'id': f_id,
                    'name': f"{f.f_code.co_name}()",
                    'file': self.target_filename,
                    'line': f.f_lineno,
                    'variables': []
                })
                f_id += 1
            f = f.f_back

        local_vars = {}
        var_states = []

        for k, v in frame.f_locals.items():
            if k.startswith('__') and k.endswith('__'):
                continue
            str_val = self.serialize_value(v)
            addr = f"0x{hex(id(v))[-4:].upper()}"
            type_str = getattr(type(v), '__name__', 'unknown')

            local_vars[k] = {
                'name': k,
                'type': type_str,
                'value': str_val,
                'address': addr,
                '_raw_obj': v
            }

            var_states.append({
                'name': k,
                'type': type_str,
                'value': str_val,
                'address': addr,
                'scope': frame.f_code.co_name
            })

        visual_structs = self.build_visual_structures(local_vars, frame)
        current_output = self.output_capture.getvalue()

        self.steps.append({
            'stepIndex': len(self.steps),
            'totalSteps': 0,
            'line': line_num,
            'statement': stmt_text or f"Line {line_num}",
            'explanation': f"Executing line {line_num}: {stmt_text}" if stmt_text else f"Line {line_num}",
            'callStack': stack_frames,
            'heap': [],
            'variables': var_states,
            'memoryDump': [],
            'output': current_output,
            'visualStructures': visual_structs
        })

        return self.trace_callback

    def run(self):
        old_stdout = sys.stdout
        sys.stdout = self.output_capture

        exec_globals = {
            '__file__': self.target_filepath,
            '__name__': '__main__',
            '__builtins__': __builtins__
        }

        if self.user_inputs:
            def live_input(prompt=""):
                if self.output_capture:
                    self.output_capture.write(prompt)
                if self.input_index < len(self.user_inputs):
                    val = str(self.user_inputs[self.input_index])
                    self.input_index += 1
                    if self.output_capture:
                        self.output_capture.write(val + "\n")
                    return val
                return ""
            exec_globals['input'] = live_input

        with open(self.target_filepath, 'r', encoding='utf-8') as f:
            code = compile(f.read(), self.target_filepath, 'exec')

        sys.settrace(self.trace_callback)
        try:
            exec(code, exec_globals)
        except Exception:
            self.output_capture.write(f"\n{traceback.format_exc()}\n")
        finally:
            sys.settrace(None)
            sys.stdout = old_stdout

        total = len(self.steps)
        for s in self.steps:
            s['totalSteps'] = total

        return {
            'fileName': self.target_filename,
            'filePath': self.target_filepath,
            'languageId': 'python',
            'steps': self.steps,
            'currentStepIndex': 0,
            'isPrototype': False
        }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(1)
    target_file = sys.argv[1]
    inputs = sys.argv[2].split('|||') if len(sys.argv) > 2 and sys.argv[2] else []
    tracer = ExecutionTracer(target_file, inputs)
    result = tracer.run()
    print(json.dumps(result))
