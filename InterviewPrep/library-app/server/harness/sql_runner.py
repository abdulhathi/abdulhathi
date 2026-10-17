"""Runs a learner's SQL for the in-browser editor, against SQLite or a throwaway local PostgreSQL database.

Input: a JSON job {flavor, mode, setup, code, check, expect, ordered, tag}. The learner's code may hold several
statements; the result is the last statement's rows, or the rows of `check` when given (for problems that change
data). In "test" mode the rows are compared with `expect`, in order when `ordered` is true.
Output: one line "@@RESULT@@<json>".
"""
import datetime
import decimal
import json
import re
import sys

MAX_ROWS = 200


def norm(v):
    if isinstance(v, decimal.Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    if isinstance(v, (datetime.date, datetime.datetime, datetime.time)):
        return v.isoformat()
    if isinstance(v, datetime.timedelta):
        return str(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return bytes(v).hex()
    return v


def split_statements(sql: str) -> list[str]:
    """Split on semicolons outside quotes and comments."""
    out, cur, quote, i = [], [], None, 0
    while i < len(sql):
        c = sql[i]
        if quote:
            cur.append(c)
            if c == quote:
                quote = None
        elif c in ("'", '"'):
            quote = c
            cur.append(c)
        elif sql.startswith('--', i):
            j = sql.find('\n', i)
            j = len(sql) if j < 0 else j
            cur.append(sql[i:j])
            i = j
            continue
        elif c == ';':
            out.append(''.join(cur))
            cur = []
        else:
            cur.append(c)
        i += 1
    out.append(''.join(cur))
    return [s.strip() for s in out if re.sub(r'--[^\n]*', '', s).strip()]


def run(cur_exec, statements, check):
    """Run statements; return (columns, rows) of the last one (or of check)."""
    columns, rows = [], []
    for s in statements:
        columns, rows = cur_exec(s)
    if check:
        columns, rows = cur_exec(check)
    return columns, rows


def drop_orphans(admin) -> None:
    """Drop databases left by runs that were killed at the time limit (their server process has gone)."""
    import os

    for (name,) in admin.execute("SELECT datname FROM pg_database WHERE datname ~ '^library_run_[0-9]+_[0-9]+$'").fetchall():
        pid = int(name.split('_')[2])
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            admin.execute(f'DROP DATABASE IF EXISTS {name} WITH (FORCE)')
        except PermissionError:
            pass


def main() -> None:
    job = json.load(open(sys.argv[1], encoding='utf-8'))
    result = {'ok': False, 'error': None}
    statements = split_statements(job['code'])
    if not statements:
        result['error'] = 'Write a query first.'
        print('@@RESULT@@' + json.dumps(result))
        return
    try:
        if job['flavor'] == 'postgres':
            import psycopg

            name = f"library_run_{job['tag']}"
            admin = psycopg.connect('dbname=postgres', autocommit=True, connect_timeout=3)
            drop_orphans(admin)
            admin.execute(f'DROP DATABASE IF EXISTS {name}')
            admin.execute(f'CREATE DATABASE {name}')
            try:
                with psycopg.connect(f'dbname={name}', autocommit=True) as db:
                    if job.get('setup'):
                        db.execute(job['setup'])

                    def ex(s):
                        c = db.execute(s)
                        if c.description is None:
                            return [], []
                        return [d.name for d in c.description], [[norm(v) for v in r] for r in c.fetchall()]

                    columns, rows = run(ex, statements, job.get('check'))
            finally:
                admin.execute(f'DROP DATABASE IF EXISTS {name} WITH (FORCE)')
        else:
            import sqlite3

            db = sqlite3.connect(':memory:')
            if job.get('setup'):
                db.executescript(job['setup'])

            def ex(s):
                c = db.execute(s)
                if c.description is None:
                    return [], []
                return [d[0] for d in c.description], [[norm(v) for v in r] for r in c.fetchall()]

            columns, rows = run(ex, statements, job.get('check'))
    except Exception as e:  # noqa: BLE001 - reported to the learner
        result['error'] = f'{type(e).__name__}: {e}'.strip()
        print('@@RESULT@@' + json.dumps(result))
        return

    result['table'] = {'columns': columns, 'rows': rows[:MAX_ROWS], 'count': len(rows)}

    def row_key(row):
        # A whole-number float (SQLite's 100.0) equals the integer 100 when rows are compared without order.
        return json.dumps([int(v) if isinstance(v, float) and v.is_integer() else v for v in row], default=str)

    if job['mode'] == 'test':
        want = [list(r) for r in job.get('expect') or []]
        got = [list(r) for r in rows]
        same = got == want if job.get('ordered') else sorted(map(row_key, got)) == sorted(map(row_key, want))
        result['ok'] = same
        result['expected'] = {'columns': columns if len(columns) == len(want[0] if want else columns) else [], 'rows': want[:MAX_ROWS], 'count': len(want)}
        result['tests'] = {'passed': 1 if same else 0, 'total': 1, 'failures': [] if same else [{
            'line': 0, 'code': 'your result rows',
            'message': ('Same rows, wrong order: the problem asks for a specific order.'
                        if not same and job.get('ordered') and sorted(map(row_key, got)) == sorted(map(row_key, want))
                        else f'Expected {len(want)} row(s), got {len(got)}; compare the two tables.'),
        }]}
    else:
        result['ok'] = True
    print('@@RESULT@@' + json.dumps(result, default=str))


main()
