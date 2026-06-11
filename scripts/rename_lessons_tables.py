#!/usr/bin/env python3
"""
Rename EnglishLesson and Lesson tables to lowercase english_lesson and lesson,
and rename their indexes accordingly.
"""
import sys
import os

# Add HAgent backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))

from api.services.db import get_raw_connection

def migrate():
    print("Starting table renaming migration...")
    
    conn = get_raw_connection()
    cur = conn.cursor()
    
    try:
        # 1. Rename EnglishLesson to english_lesson
        cur.execute("""
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'EnglishLesson' AND table_schema = 'public'
        """)
        if cur.fetchone():
            print("Renaming table 'EnglishLesson' to 'english_lesson'...")
            cur.execute('ALTER TABLE "EnglishLesson" RENAME TO english_lesson')
            print("Successfully renamed.")
        else:
            print("Table 'EnglishLesson' does not exist or already renamed.")

        # 2. Rename Lesson to lesson
        cur.execute("""
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'Lesson' AND table_schema = 'public'
        """)
        if cur.fetchone():
            print("Renaming table 'Lesson' to 'lesson'...")
            cur.execute('ALTER TABLE "Lesson" RENAME TO lesson')
            print("Successfully renamed.")
        else:
            print("Table 'Lesson' does not exist or already renamed.")

        # 3. Rename indexes
        print("Renaming indexes to lowercase...")
        cur.execute('ALTER INDEX IF EXISTS "EnglishLesson_userId_nextReviewAt_idx" RENAME TO english_lesson_user_id_next_review_at_idx')
        cur.execute('ALTER INDEX IF EXISTS "Lesson_userId_nextReviewAt_idx" RENAME TO lesson_user_id_next_review_at_idx')
        
        conn.commit()
        print("Table renaming migration completed successfully!")
        
    except Exception as e:
        conn.rollback()
        print("Migration failed:", e)
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
