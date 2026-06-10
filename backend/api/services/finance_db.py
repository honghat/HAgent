import os
from urllib.parse import quote_plus
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

server = os.getenv("DB_SERVER", "localhost")
database = os.getenv("DB_DATABASE", "hagent")
username = os.getenv("DB_USERNAME", "hatnguyen")
password = quote_plus(os.getenv("DB_PASSWORD", "Thaco@2018"))

database_url = f"postgresql://{username}:{password}@{server}:5432/{database}"

engine = create_engine(
    database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
    pool_size=5,
    max_overflow=10,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_finance_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_psql_user_id(db_psql, hagent_user_id: str) -> int:
    """
    Map HAgent user_id (string, e.g. 'hat') to PostgreSQL users.id (integer, e.g. 15)
    by looking up their username. If user doesn't exist in PostgreSQL, create it.
    """
    from api.services.user_store import get_user_by_id
    user = get_user_by_id(hagent_user_id)
    if not user:
        return 15  # Fallback to default user 'hat''s ID in PostgreSQL

    username = user.get("username") or "hat"
    
    # Import locally to avoid circular imports
    from api.services.finance_models import User as PsqlUser
    
    try:
        psql_user = db_psql.query(PsqlUser).filter(PsqlUser.username == username).first()
        if psql_user:
            return psql_user.id
        
        # Create user in PostgreSQL if not present
        new_psql_user = PsqlUser(
            username=username,
            password="",  # HAgent handles actual password auth, this is just for keeping integrity
            email=user.get("email") or f"{username}@gmail.com",
            full_name=user.get("display_name") or username,
            role_id=4,
            is_active=True
        )
        db_psql.add(new_psql_user)
        db_psql.commit()
        db_psql.refresh(new_psql_user)
        return new_psql_user.id
    except Exception as e:
        db_psql.rollback()
        # Log error or default to 15
        import logging
        logging.error(f"Error mapping HAgent user to PostgreSQL: {e}")
        return 15
