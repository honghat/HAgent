#!/usr/bin/env python3
"""
Migrate EnglishLesson and Lesson user associations from the legacy "User" table (INTEGER ID)
to the active hagent_users table (TEXT ID), then drop the legacy "User" table.
"""
import sys
import os

# Add HAgent backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))

from api.services.db import get_connection

def migrate():
    print("Starting user consolidation migration...")
    
    with get_connection() as conn:
        cur = conn.cursor()
        
        # 1. Fetch legacy users
        try:
            cur.execute('SELECT id, name FROM "User"')
            legacy_users = {r['name'].lower(): r['id'] for r in cur.fetchall()}
            print(f"Found legacy users: {legacy_users}")
        except Exception as e:
            print("Legacy 'User' table might not exist or error reading it:", e)
            conn.rollback()
            return

        # 2. Fetch hagent users
        cur.execute('SELECT id, username FROM hagent_users')
        hagent_users = {r['username'].lower(): r['id'] for r in cur.fetchall()}
        print(f"Found active HAgent users: {hagent_users}")

        # Create mapping
        mapping = {}
        for username, legacy_id in legacy_users.items():
            if username in hagent_users:
                mapping[legacy_id] = hagent_users[username]
            else:
                # If username not in hagent_users, we might want to skip or create it, 
                # but typically 'hat' is present. Let's warn if missing.
                print(f"Warning: Legacy user '{username}' has no corresponding user in 'hagent_users'")
        
        print(f"Mapping legacy ID to active ID: {mapping}")
        if not mapping:
            print("No matching users to migrate. Checking if migration is already done...")
            # If "User" table still exists, let's drop it to cleanup if no mapping.
            try:
                cur.execute('DROP TABLE IF EXISTS "User" CASCADE')
                conn.commit()
                print("Dropped legacy 'User' table.")
            except Exception as e:
                print("Error dropping 'User' table:", e)
                conn.rollback()
            return

        # 3. Drop old foreign key constraints
        print("Dropping old foreign key constraints...")
        try:
            cur.execute('ALTER TABLE "EnglishLesson" DROP CONSTRAINT IF EXISTS "EnglishLesson_userId_fkey"')
            cur.execute('ALTER TABLE "Lesson" DROP CONSTRAINT IF EXISTS "Lesson_userId_fkey"')
            conn.commit()
        except Exception as e:
            print("Error dropping old foreign keys:", e)
            conn.rollback()
            raise

        # 4. Alter userId column type to TEXT
        print("Altering userId columns to TYPE TEXT...")
        try:
            # We use USING "userId"::text to convert INTEGER to TEXT during migration
            cur.execute('ALTER TABLE "EnglishLesson" ALTER COLUMN "userId" TYPE TEXT USING "userId"::text')
            cur.execute('ALTER TABLE "Lesson" ALTER COLUMN "userId" TYPE TEXT USING "userId"::text')
            conn.commit()
        except Exception as e:
            print("Error altering column types:", e)
            conn.rollback()
            raise

        # 5. Update userId values
        print("Updating userId values to active HAgent IDs...")
        try:
            for legacy_id, active_id in mapping.items():
                # Note: legacy_id was converted to string in type alteration, so we update where it matches str(legacy_id)
                cur.execute('UPDATE "EnglishLesson" SET "userId" = %s WHERE "userId" = %s', (active_id, str(legacy_id)))
                cur.execute('UPDATE "Lesson" SET "userId" = %s WHERE "userId" = %s', (active_id, str(legacy_id)))
            conn.commit()
            print("Successfully updated associations.")
        except Exception as e:
            print("Error updating user IDs in lessons:", e)
            conn.rollback()
            raise

        # 6. Add new foreign key constraints
        print("Adding new foreign key constraints pointing to hagent_users...")
        try:
            cur.execute('ALTER TABLE "EnglishLesson" ADD CONSTRAINT "EnglishLesson_userId_fkey" FOREIGN KEY ("userId") REFERENCES hagent_users(id) ON DELETE CASCADE ON UPDATE CASCADE')
            cur.execute('ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_userId_fkey" FOREIGN KEY ("userId") REFERENCES hagent_users(id) ON DELETE CASCADE ON UPDATE CASCADE')
            conn.commit()
            print("Added new foreign keys successfully.")
        except Exception as e:
            print("Error adding new foreign keys:", e)
            conn.rollback()
            raise

        # 7. Drop legacy User table
        print("Dropping legacy 'User' table...")
        try:
            cur.execute('DROP TABLE IF EXISTS "User" CASCADE')
            conn.commit()
            print("Legacy 'User' table dropped.")
        except Exception as e:
            print("Error dropping legacy 'User' table:", e)
            conn.rollback()
            raise

    print("Migration completed successfully!")

if __name__ == "__main__":
    migrate()
