import sqlite3
import re
from pathlib import Path

def translate_sqlite_to_pg(name, sql):
    if name.startswith("sqlite_"):
        return ""

    # Quoted table name to preserve case
    quoted_name = f'"{name}"'
    
    # Rename 'users' to 'hagent_users'
    if name == "users":
        quoted_name = '"hagent_users"'
        sql = re.sub(r'\bCREATE\s+TABLE\s+users\b', 'CREATE TABLE hagent_users', sql, flags=re.IGNORECASE)
    else:
        # Quote table name in CREATE TABLE statement if it's not already quoted
        sql = re.sub(rf'\bCREATE\s+TABLE\s+{re.escape(name)}\b', f'CREATE TABLE {quoted_name}', sql, flags=re.IGNORECASE)

    # Rename references to users in foreign keys
    sql = re.sub(r'REFERENCES\s+users\s*\(', 'REFERENCES hagent_users(', sql, flags=re.IGNORECASE)

    # Convert SQLite autoincrement PK to SERIAL PK
    def replace_autoincrement(m):
        col_def = m.group(0)
        col_def = re.sub(r'\bAUTOINCREMENT\b', '', col_def, flags=re.IGNORECASE)
        col_def = re.sub(r'\bINTEGER\b', 'SERIAL', col_def, flags=re.IGNORECASE)
        # Remove DEFAULT value constraint if it's a SERIAL column (PostgreSQL doesn't allow both)
        col_def = re.sub(r'\bDEFAULT\s+[^,)]+', '', col_def, flags=re.IGNORECASE)
        return col_def

    sql = re.sub(r'[^,)]+\bAUTOINCREMENT\b[^,)]*', replace_autoincrement, sql, flags=re.IGNORECASE)

    # Convert SQLite boolean defaults (DEFAULT 0 / DEFAULT 1) to PostgreSQL format
    def replace_boolean_default(m):
        col_def = m.group(0)
        col_def = re.sub(r'\bDEFAULT\s+0\b', 'DEFAULT FALSE', col_def, flags=re.IGNORECASE)
        col_def = re.sub(r'\bDEFAULT\s+1\b', 'DEFAULT TRUE', col_def, flags=re.IGNORECASE)
        return col_def

    sql = re.sub(r'\bBOOLEAN\b[^,)]*', replace_boolean_default, sql, flags=re.IGNORECASE)

    # Convert INTEGER columns holding timestamps or big numbers to BIGINT
    def replace_integer_to_bigint(m):
        col_name = m.group(1) or m.group(2)
        col_lower = col_name.lower()
        if any(x in col_lower for x in ['at', 'time', 'bytes', 'size', 'duration']):
            return m.group(0).replace('INTEGER', 'BIGINT').replace('integer', 'BIGINT')
        return m.group(0)

    sql = re.sub(r'(?:"([^"]+)"|(\w+))\s+INTEGER', replace_integer_to_bigint, sql, flags=re.IGNORECASE)

    # Replace defaults
    sql = re.sub(r"DEFAULT\s*\(datetime\('now'\)\)", "DEFAULT NOW()", sql, flags=re.IGNORECASE)
    sql = re.sub(r"DEFAULT\s*\(datetime\('now',\s*'localtime'\)\)", "DEFAULT NOW()", sql, flags=re.IGNORECASE)
    sql = re.sub(r"DEFAULT\s*\(date\('now',\s*'localtime'\)\)", "DEFAULT CURRENT_DATE", sql, flags=re.IGNORECASE)
    sql = re.sub(r"DEFAULT\s*datetime\('now'\)", "DEFAULT NOW()", sql, flags=re.IGNORECASE)
    sql = re.sub(r"DEFAULT\s*CURRENT_TIMESTAMP", "DEFAULT NOW()", sql, flags=re.IGNORECASE)
    
    # Convert DEFAULT "string" to DEFAULT 'string' (critical for PostgreSQL)
    sql = re.sub(r'DEFAULT\s*"([^"]*)"', r"DEFAULT '\1'", sql, flags=re.IGNORECASE)
    
    # Map types
    sql = re.sub(r'\bDATETIME\b', 'TIMESTAMPTZ', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bREAL\b', 'DOUBLE PRECISION', sql, flags=re.IGNORECASE)

    # Remove check constraints on primary key
    sql = re.sub(r'PRIMARY\s+KEY\s+CHECK\s*\(\s*\w+\s*=\s*\d+\s*\)', 'PRIMARY KEY', sql, flags=re.IGNORECASE)
    sql = re.sub(r'CHECK\s*\(\s*\w+\s*=\s*\d+\s*\)', '', sql, flags=re.IGNORECASE)

    return sql

def get_table_name(stmt):
    m = re.search(r'CREATE\s+TABLE\s+(?:"([^"]+)"|(\w+))', stmt, re.IGNORECASE)
    if m:
        return m.group(1) or m.group(2)
    return None

def get_referenced_tables(stmt):
    refs = re.findall(r'REFERENCES\s+(?:"([^"]+)"|(\w+))', stmt, re.IGNORECASE)
    return {r[0] or r[1] for r in refs}

def topological_sort(statements):
    table_stmts = []
    other_stmts = []
    for stmt in statements:
        if stmt.strip().upper().startswith("CREATE TABLE"):
            table_stmts.append(stmt)
        else:
            other_stmts.append(stmt)

    table_map = {}
    dependencies = {}
    for stmt in table_stmts:
        tbl = get_table_name(stmt)
        if tbl:
            table_map[tbl] = stmt
            dependencies[tbl] = get_referenced_tables(stmt)

    visited = {}
    sorted_tables = []

    def visit(node):
        if node in visited:
            if visited[node] == 1:  # Cycle detected
                return
            return  # Already sorted

        visited[node] = 1
        if node in dependencies:
            for dep in dependencies[node]:
                if dep != node and dep in table_map:
                    visit(dep)
        visited[node] = 2
        sorted_tables.append(node)

    for tbl in table_map:
        visit(tbl)

    sorted_table_stmts = [table_map[tbl] for tbl in sorted_tables if tbl in table_map]
    return sorted_table_stmts + other_stmts

def main():
    db_path = Path("data/hagent.db")
    if not db_path.exists():
        print("SQLite database not found!")
        return

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # Get tables
    cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    tables = cursor.fetchall()

    # Get indexes
    cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name")
    indexes = cursor.fetchall()

    conn.close()

    statements = []
    
    # Translate tables
    for name, sql in tables:
        translated = translate_sqlite_to_pg(name, sql)
        if translated:
            statements.append(translated.strip())

    # Translate indexes
    for name, sql in indexes:
        sql = re.sub(r'\bON\s+users\b', 'ON hagent_users', sql, flags=re.IGNORECASE)
        statements.append(sql.strip())

    # Sort topologically to satisfy foreign key dependencies
    statements = topological_sort(statements)

    # Generate the pg_schema.py content
    output_path = Path("backend/api/services/pg_schema.py")
    
    content = f'''"""
Auto-generated PostgreSQL Schema translated from SQLite.
Generated by scripts/generate_pg_schema.py. Do not edit directly.
"""

SCHEMA_STATEMENTS = [
'''
    for stmt in statements:
        escaped_stmt = stmt.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
        content += f'    "{escaped_stmt}",\n'
    content += "]\n"

    output_path.write_text(content)
    print(f"Generated {output_path} with {len(statements)} DDL statements.")

if __name__ == "__main__":
    main()
