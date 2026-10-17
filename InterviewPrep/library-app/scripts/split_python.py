"""Draft exercises from Python reference solutions.

stdin: JSON list of {"key", "code"}  (or {"key", "literal"} to convert a Python literal to JSON)
stdout: JSON {key: {"starter", "tests"}}  (or {key: value} for literals)

Rules: tests are every top-level statement from the first one that contains an assert (or calls a test function)
to the end, plus top-level functions that contain asserts. Everything before is the solution: imports and constants
stay as they are, function and method bodies become `raise NotImplementedError`, docstrings are kept, and plain data
classes and exception classes stay whole.
"""
import ast
import json
import sys


def has_assert(node) -> bool:
    return any(isinstance(n, ast.Assert) for n in ast.walk(node))


def calls(node, names) -> bool:
    return any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in names for n in ast.walk(node))


def is_main_guard(node) -> bool:
    return isinstance(node, ast.If) and 'name' in ast.dump(node.test) and '__main__' in ast.dump(node.test)


def first_line(node) -> int:
    return min([node.lineno] + [d.lineno for d in getattr(node, 'decorator_list', [])])


def stub_function(fn, lines, indent_extra='') -> list[str]:
    head = lines[first_line(fn) - 1 : fn.body[0].lineno - 1]
    body0 = fn.body[0]
    out = list(head)
    indent = ' ' * body0.col_offset
    if isinstance(body0, ast.Expr) and isinstance(getattr(body0, 'value', None), ast.Constant) and isinstance(body0.value.value, str):
        out += lines[body0.lineno - 1 : body0.end_lineno]
    out.append(f'{indent}raise NotImplementedError')
    return out


def keep_class_whole(cls) -> bool:
    bases = [ast.unparse(b) for b in cls.bases]
    if any(b.endswith(('Error', 'Exception')) or b in ('Exception', 'BaseException', 'NamedTuple', 'TypedDict', 'Enum', 'IntEnum', 'StrEnum', 'Protocol') for b in bases):
        return True
    methods = [n for n in cls.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    return not methods


def stub_class(cls, lines) -> list[str]:
    if keep_class_whole(cls):
        return lines[first_line(cls) - 1 : cls.end_lineno]
    out = lines[first_line(cls) - 1 : cls.body[0].lineno - 1]
    for node in cls.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            out += stub_function(node, lines)
        else:
            out += lines[first_line(node) - 1 : node.end_lineno]
    return out


def split(code: str) -> dict:
    tree = ast.parse(code)
    lines = code.split('\n')
    body = tree.body
    test_fns = {n.name for n in body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and has_assert(n)}
    first = len(body)
    for i, node in enumerate(body):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        if has_assert(node) or calls(node, test_fns) or is_main_guard(node):
            first = i
            break
    # Setup lines between the last definition and the first assert (building objects, feeding data) are part of
    # the tests, not the solution.
    defs = [i for i, n in enumerate(body[:first]) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and n.name not in test_fns]
    if defs and first < len(body):
        first = min(first, defs[-1] + 1)
    starter: list[str] = []
    solution: list[str] = []
    tests: list[str] = []
    for i, node in enumerate(body):
        src = lines[first_line(node) - 1 : node.end_lineno]
        if i >= first or (isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in test_fns):
            tests += src
            continue
        solution += src + ['']
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            starter += stub_function(node, lines)
        elif isinstance(node, ast.ClassDef):
            starter += stub_class(node, lines)
        else:
            starter += src
        starter.append('')
    # Keep blank lines readable: collapse runs of more than two.
    def tidy(xs):
        out, blank = [], 0
        for x in xs:
            blank = blank + 1 if not x.strip() else 0
            if blank <= 2:
                out.append(x)
        return '\n'.join(out).strip() + '\n'
    return {'starter': tidy(starter), 'solution': tidy(solution), 'tests': tidy(tests) if tests else ''}


def main() -> None:
    items = json.load(sys.stdin)
    out = {}
    for item in items:
        try:
            if 'literal' in item:
                out[item['key']] = json.loads(json.dumps(ast.literal_eval(item['literal']), default=str))
            else:
                out[item['key']] = split(item['code'])
        except Exception as e:  # noqa: BLE001
            out[item['key']] = {'error': f'{type(e).__name__}: {e}'}
    json.dump(out, sys.stdout)


main()
