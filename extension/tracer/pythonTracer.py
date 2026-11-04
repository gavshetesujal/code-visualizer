"""
Python Real Execution Tracer for Code Visualizer
Captures actual line-by-line execution steps, stack frames, variables,
objects, memory IDs, and console output.
Outputs JSON formatted trace data.
"""

import sys
import os
import json
import inspect
import io
import traceback

class ExecutionTracer:
    def __init__(self, target_filepath, user_inputs=None):
        self.target_filepath = os.path.abspath(target_filepath)
        self.target_dir = os.path.dirname(self.target_filepath)
        self.target_filename = os.path.basename(self.target_filepath)
        self.steps = []
        self.step_limit = 2000 # guard against infinite loops
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
        if depth > 3:
            return repr(val)
        if val is None:
            return "None"
        if isinstance(val, (int, float, bool, str)):
            return repr(val) if isinstance(val, str) else str(val)
        if isinstance(val, (list, tuple)):
            items = [self.serialize_value(x, depth + 1) for x in val[:15]]
            if len(val) > 15:
                items.append(f"... (+{len(val)-15} more)")
            return "[" + ", ".join(items) + "]" if isinstance(val, list) else "(" + ", ".join(items) + ")"
        if isinstance(val, dict):
            entries = [f"{self.serialize_value(k, depth+1)}: {self.serialize_value(v, depth+1)}" for k, v in list(val.items())[:10]]
            return "{" + ", ".join(entries) + "}"
        # Objects / Custom instances
        cls_name = getattr(type(val), '__name__', 'object')
        return f"<{cls_name} at {hex(id(val))}>"

    def inspect_object_fields(self, val):
        fields = {}
        # Try vars or dict
        if hasattr(val, '__dict__'):
            for k, v in list(val.__dict__.items())[:12]:
                if not k.startswith('_'):
                    fields[k] = self.serialize_value(v, depth=1)
        return fields

    def build_visual_structures(self, local_vars, heap_objects, step_idx):
        """
        Dynamically analyzes real variables to construct adaptive visual structures:
        - Detects linked-lists (objects with .next, .prev, .val, .data)
        - Detects arrays / lists
        - Detects stacks / queues
        - Detects tree nodes (objects with .left, .right)
        - Detects general objects & pointers
        """
        structures = []

        # 1. Detect Linked-Lists or Trees
        candidate_nodes = {}
        for name, var_info in local_vars.items():
            raw_obj = var_info.get('_raw_obj')
            if raw_obj is not None and hasattr(raw_obj, '__dict__'):
                candidate_nodes[name] = raw_obj

        # Check for Linked-List pattern: has 'next' attribute
        visited_nodes = {}
        head_name = None
        for name, obj in candidate_nodes.items():
            if hasattr(obj, 'next') or hasattr(obj, 'val') or hasattr(obj, 'data'):
                head_name = name
                break

        if head_name:
            curr = candidate_nodes[head_name]
            chain = []
            visited_ids = set()
            while curr is not None and id(curr) not in visited_ids and len(chain) < 20:
                visited_ids.add(id(curr))
                val_attr = getattr(curr, 'val', getattr(curr, 'data', getattr(curr, 'value', None)))
                next_attr = getattr(curr, 'next', None)
                addr = hex(id(curr))[-4:].upper()
                chain.append({
                    'id': f"node_{id(curr)}",
                    'address': f"0x{addr}",
                    'value': self.serialize_value(val_attr) if val_attr is not None else "Node",
                    'subLabel': f"Node {len(chain)+1}",
                    'type': type(curr).__name__,
                    'next_id': f"node_{id(next_attr)}" if next_attr is not None else None,
                    'is_null': next_attr is None
                })
                curr = next_attr

            if len(chain) > 0:
                blocks = []
                connections = []
                for i, node_data in enumerate(chain):
                    blocks.append({
                        'id': node_data['id'],
                        'address': node_data['address'],
                        'value': node_data['value'],
                        'subLabel': node_data['subLabel'],
                        'type': node_data['type'],
                        'isActive': (i == 0 or i == len(chain)-1)
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
                    'callout': {'targetBlockId': blocks[0]['id'], 'text': f"Active: {head_name}"}
                })

        # 2. Detect Lists / Arrays
        for name, var_info in local_vars.items():
            raw_obj = var_info.get('_raw_obj')
            if isinstance(raw_obj, list) and len(raw_obj) > 0:
                blocks = []
                for idx, elem in enumerate(raw_obj[:12]):
                    blocks.append({
                        'id': f"{name}_{idx}",
                        'address': f"[{idx}]",
                        'value': self.serialize_value(elem),
                        'subLabel': f"{name}[{idx}]",
                        'type': type(elem).__name__,
                        'isActive': False
                    })
                structures.append({
                    'id': f"struct-arr-{name}",
                    'title': f"Array: {name} (length {len(raw_obj)})",
                    'kind': 'array',
                    'blocks': blocks,
                    'pointers': [{'targetBlockId': blocks[0]['id'], 'label': name, 'color': '#38bdf8', 'direction': 'down'}]
                })

        # 3. Default adaptive blocks from primitive variables
        if not structures:
            blocks = []
            for name, var_info in local_vars.items():
                if name.startswith('__'):
                    continue
                blocks.append({
                    'id': f"var_{name}",
                    'address': var_info['address'],
                    'value': var_info['value'],
                    'subLabel': f"{name} ({var_info['type']})",
                    'type': var_info['type'],
                    'isActive': True
                })
            if blocks:
                structures.append({
                    'id': 'struct-vars',
                    'title': 'Active Execution Variables',
                    'kind': 'variables',
                    'blocks': blocks,
                    'callout': {'targetBlockId': blocks[0]['id'], 'text': f"Line step"}
                })

        return structures

    def trace_callback(self, frame, event, arg):
        if event != 'line':
            return self.trace_callback

        co = frame.f_code
        curr_file = os.path.abspath(co.co_filename)
        
        # Only trace the user's target file
        if curr_file != self.target_filepath:
            return self.trace_callback

        if len(self.steps) >= self.step_limit:
            return None # Stop tracing if limit reached

        line_num = frame.f_lineno
        stmt_text = self.source_lines.get(line_num, "").strip()

        # Capture Call Stack
        stack_frames = []
        f = frame
        frame_id = 1
        while f:
            if os.path.abspath(f.f_code.co_filename) == self.target_filepath:
                stack_frames.append({
                    'id': frame_id,
                    'name': f"{f.f_code.co_name}()",
                    'file': os.path.basename(f.f_code.co_filename),
                    'line': f.f_lineno,
                    'variables': []
                })
                frame_id += 1
            f = f.f_back

        # Capture Real Variables
        local_vars = {}
        var_states = []
        heap_objects = []

        for k, v in frame.f_locals.items():
            if k.startswith('__') and k.endswith('__'):
                continue
            
            str_val = self.serialize_value(v)
            addr = f"0x{hex(id(v))[-6:].upper()}"
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

            # If it's a custom class object or list, add to heap
            if hasattr(v, '__dict__') or isinstance(v, (list, dict)):
                fields = self.inspect_object_fields(v) if hasattr(v, '__dict__') else None
                elements = [self.serialize_value(x) for x in v[:10]] if isinstance(v, list) else None
                heap_objects.append({
                    'id': f"heap_{id(v)}",
                    'type': type_str,
                    'address': addr,
                    'label': k,
                    'fields': fields,
                    'elements': elements
                })

        # Generate Adaptive Visual Representation
        visual_structs = self.build_visual_structures(local_vars, heap_objects, len(self.steps))

        current_output = self.output_capture.getvalue()

        self.steps.append({
            'stepIndex': len(self.steps),
            'totalSteps': 0, # will set at end
            'line': line_num,
            'statement': stmt_text or f"Line {line_num}",
            'explanation': f"Executed: {stmt_text}" if stmt_text else f"Execution at line {line_num}",
            'callStack': stack_frames,
            'heap': heap_objects,
            'variables': var_states,
            'memoryDump': [],
            'output': current_output,
            'visualStructures': visual_structs
        })

        return self.trace_callback

    def run(self):
        # Redirect stdout to capture prints
        old_stdout = sys.stdout
        sys.stdout = self.output_capture

        # Prepare execution globals
        exec_globals = {
            '__file__': self.target_filepath,
            '__name__': '__main__',
            '__builtins__': __builtins__
        }

        # Override input() if user inputs provided
        if self.user_inputs:
            def mock_input(prompt=""):
                if self.output_capture:
                    self.output_capture.write(prompt)
                if self.input_index < len(self.user_inputs):
                    val = str(self.user_inputs[self.input_index])
                    self.input_index += 1
                    if self.output_capture:
                        self.output_capture.write(val + "\n")
                    return val
                return ""
            exec_globals['input'] = mock_input

        # Read target source
        with open(self.target_filepath, 'r', encoding='utf-8') as f:
            code = compile(f.read(), self.target_filepath, 'exec')

        # Install trace
        sys.settrace(self.trace_callback)
        try:
            exec(code, exec_globals)
        except Exception as e:
            self.output_capture.write(f"\nRuntime Exception: {traceback.format_exc()}\n")
        finally:
            sys.settrace(None)
            sys.stdout = old_stdout

        # Update total steps
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
        print(json.dumps({'error': 'No target file provided'}))
        sys.exit(1)

    target_file = sys.argv[1]
    inputs = sys.argv[2].split('|||') if len(sys.argv) > 2 and sys.argv[2] else []
    tracer = ExecutionTracer(target_file, inputs)
    result = tracer.run()
    print(json.dumps(result))

