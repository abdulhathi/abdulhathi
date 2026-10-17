"""Runs a learner's Python code for the in-browser editor.

Input: a JSON job file {mode, prelude, code, tests}. mode is "run" (just run the code), "asserts" (run the code,
then each top-level test statement separately, reporting every failure with expected and actual values) or
"script" (run prelude + code + tests as one __main__ file, for tests such as pytest.main([__file__])).
Output: one line "@@RESULT@@<json>" on stdout.
"""
import ast
import contextlib
import io
import json
import os
import runpy
import sys
import traceback

LIMIT = 20_000


def short(value, n=300):
    text = repr(value)
    return text if len(text) <= n else text[: n - 1] + "…"


def user_traceback(exc: BaseException) -> str:
    """The traceback without harness frames, so line numbers point at the learner's code."""
    if isinstance(exc, SyntaxError):
        where = f'line {exc.lineno}' if exc.lineno else ''
        line = (exc.text or '').rstrip('\n')
        caret = ' ' * max((exc.offset or 1) - 1, 0) + '^' if line else ''
        return f"SyntaxError: {exc.msg} ({exc.filename} {where})\n    {line}\n    {caret}".rstrip()
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename.startswith('<') or f.filename.endswith('solution.py')]
    lines = [f'  {f.filename}, line {f.lineno}, in {f.name}' for f in frames]
    return '\n'.join(['Traceback (most recent call last):', *lines, f'{type(exc).__name__}: {exc}'])


def run_tests(tests: str, ns: dict) -> dict:
    tree = ast.parse(tests, '<tests>')
    passed, total, failures = 0, 0, []
    has_assert = lambda node: any(isinstance(n, ast.Assert) for n in ast.walk(node))  # noqa: E731
    defs = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
    # Defining a helper is setup; calling a helper that asserts is a test.
    checkers = {stmt.name for stmt in tree.body if isinstance(stmt, defs) and has_assert(stmt)}
    for stmt in tree.body:
        code = ast.get_source_segment(tests, stmt) or ''
        line = stmt.lineno
        is_test = not isinstance(stmt, defs) and (
            has_assert(stmt) or any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in checkers for n in ast.walk(stmt))
        )
        try:
            if isinstance(stmt, ast.Assert) and isinstance(stmt.test, ast.Compare) and len(stmt.test.ops) == 1 and isinstance(stmt.test.ops[0], ast.Eq):
                total += 1
                got = eval(compile(ast.Expression(stmt.test.left), '<tests>', 'eval'), ns)
                want = eval(compile(ast.Expression(stmt.test.comparators[0]), '<tests>', 'eval'), ns)
                if got == want:
                    passed += 1
                else:
                    failures.append({'line': line, 'code': code, 'expected': short(want), 'got': short(got)})
                continue
            if is_test:
                total += 1
            exec(compile(ast.Module([stmt], []), '<tests>', 'exec'), ns)
            if is_test:
                passed += 1
        except AssertionError as e:
            if not is_test:
                total += 1
            failures.append({'line': line, 'code': code, 'message': str(e) or 'assertion failed'})
        except Exception as e:  # noqa: BLE001 - every error is reported to the learner
            if not is_test:
                total += 1
            failures.append({'line': line, 'code': code, 'message': f'{type(e).__name__}: {e}'})
    return {'passed': passed, 'total': total, 'failures': failures[:20]}


def main() -> None:
    job = json.load(open(sys.argv[1], encoding='utf-8'))
    mode, prelude, code, tests = job['mode'], job.get('prelude') or '', job['code'], job.get('tests') or ''
    out, err = io.StringIO(), io.StringIO()
    result: dict = {'ok': False, 'error': None, 'tests': None}
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        if mode == 'script':
            path = os.path.abspath('solution.py')
            with open(path, 'w', encoding='utf-8') as f:
                f.write('\n\n'.join(p for p in (prelude, code, tests) if p))
            try:
                runpy.run_path(path, run_name='__main__')
                result['ok'] = True
            except SystemExit as e:
                result['ok'] = e.code in (0, None)
                if not result['ok']:
                    result['error'] = f'The tests exited with status {e.code}.'
            except BaseException as e:  # noqa: BLE001
                result['error'] = user_traceback(e)
            result['tests'] = {'passed': 1 if result['ok'] else 0, 'total': 1, 'failures': [] if result['ok'] else [{'line': 0, 'code': 'the test file', 'message': result['error'] or 'failed'}]}
        else:
            ns: dict = {'__name__': '__main__'}
            try:
                if prelude:
                    exec(compile(prelude, '<given code>', 'exec'), ns)
                exec(compile(code, '<your code>', 'exec'), ns)
                result['ok'] = True
            except SystemExit:
                result['ok'] = True
            except BaseException as e:  # noqa: BLE001
                result['error'] = user_traceback(e)
            if mode == 'asserts' and result['error'] is None:
                result['tests'] = run_tests(tests, ns)
                t = result['tests']
                result['ok'] = t['total'] > 0 and t['passed'] == t['total']
    result['stdout'] = out.getvalue()[-LIMIT:]
    result['stderr'] = err.getvalue()[-LIMIT:]
    sys.__stdout__.write('\n@@RESULT@@' + json.dumps(result) + '\n')


main()
