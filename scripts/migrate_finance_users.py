#!/usr/bin/env python3
"""
Add user_id column to accounts and savings_books tables and update existing records to point to user 'hat' (ID 15).
"""
import sys
import os

# Add HAgent backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))

from api.services.db import get_raw_connection

def migrate():
    print("Starting finance user association migration...")
    
    conn = get_raw_connection()
    cur = conn.cursor()
    
    try:
        # 1. Check if user 'hat' (id=15) exists, if not find the first user ID
        cur.execute("SELECT id FROM users WHERE username = 'hat'")
        row = cur.fetchone()
        if row:
            hat_id = row[0]
        else:
            cur.execute("SELECT id FROM users LIMIT 1")
            row_fallback = cur.fetchone()
            hat_id = row_fallback[0] if row_fallback else 15
        
        print(f"Target user ID for existing finance records: {hat_id}")

        # 2. Check and migrate 'accounts'
        cur.execute("""
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'accounts' AND column_name = 'user_id'
        """)
        if not cur.fetchone():
            print("Adding user_id column to 'accounts' table...")
            cur.execute("ALTER TABLE accounts ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE")
            cur.execute("UPDATE accounts SET user_id = %s WHERE user_id IS NULL", (hat_id,))
            print("Successfully altered 'accounts' table.")
        else:
            print("'accounts' table already has 'user_id' column.")

        # 3. Check and migrate 'savings_books'
        cur.execute("""
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'savings_books' AND column_name = 'user_id'
        """)
        if not cur.fetchone():
            print("Adding user_id column to 'savings_books' table...")
            cur.execute("ALTER TABLE savings_books ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE")
            cur.execute("UPDATE savings_books SET user_id = %s WHERE user_id IS NULL", (hat_id,))
            print("Successfully altered 'savings_books' table.")
        else:
            print("'savings_books' table already has 'user_id' column.")

        conn.commit()
        print("Finance migration completed successfully!")
        
    except Exception as e:
        conn.rollback()
        print("Migration failed:", e)
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
