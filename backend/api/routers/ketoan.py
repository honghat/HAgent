import os
import logging
import subprocess
import shutil
from datetime import datetime, timezone
from urllib.parse import quote_plus
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, or_, func, text
from sqlalchemy.orm import sessionmaker, declarative_base, Session

from api.routers.auth import _get_user_id
from api.services.user_store import get_user_by_id
from api.services import rbac

# --- Logger ---
logger = logging.getLogger(__name__)

# --- Router ---
router = APIRouter(prefix="", tags=["Ketoan"])

# --- MS SQL Database Setup via pyodbc for anonymity ---
db_user = os.getenv("DB_USERNAME1", "bravoDev")
db_password = os.getenv("DB_PASSWORD1", "b8@Consolidation#20II")
db_host = os.getenv("DB_SERVER1", "bravo8group.thaco.com.vn")
db_port = os.getenv("DB_PORT1", "7474")
db_database = os.getenv("DB_DATABASE1", "B8R2_THACOGroup")

def get_freetds_driver_path() -> str:
    brew_path = shutil.which("brew")
    if brew_path:
        try:
            prefix = subprocess.check_output([brew_path, "--prefix", "freetds"]).decode().strip()
            so_path = os.path.join(prefix, "lib", "libtdsodbc.so")
            if os.path.exists(so_path):
                return so_path
        except Exception:
            pass
    for path in [
        "/opt/homebrew/opt/freetds/lib/libtdsodbc.so",
        "/opt/homebrew/lib/libtdsodbc.so",
        "/usr/local/opt/freetds/lib/libtdsodbc.so",
        "/usr/local/lib/libtdsodbc.so",
    ]:
        if os.path.exists(path):
            return path
    return "libtdsodbc.so"

# Create a local odbcinst.ini in HAgent's data/odbc directory to register FreeTDS
odbc_dir = "/Users/nguyenhat/HAgent/data/odbc"
os.makedirs(odbc_dir, exist_ok=True)
odbcinst_path = os.path.join(odbc_dir, "odbcinst.ini")

driver_path = get_freetds_driver_path()
odbcinst_content = f"""[FreeTDS]
Description = FreeTDS ODBC Driver
Driver = {driver_path}
Setup = {driver_path}
UsageCount = 1
"""

with open(odbcinst_path, "w") as f:
    f.write(odbcinst_content)

os.environ["ODBCSYSINI"] = odbc_dir

# Connection parameters for pyodbc
connection_params = (
    f"DRIVER=FreeTDS;"
    f"SERVER={db_host};"
    f"PORT={db_port};"
    f"DATABASE={db_database};"
    f"UID={db_user};"
    f"PWD={db_password};"
    f"WSID=WORKSTATION-SSMS;"
    f"APP=Microsoft SQL Server Management Studio;"
    f"TDS_Version=7.4;"
)

database_url = f"mssql+pyodbc:///?odbc_connect={quote_plus(connection_params)}"

engine = create_engine(
    database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
    pool_size=5,
    max_overflow=10,
    echo=False,
    implicit_returning=False 
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

# --- SQLAlchemy Model ---
class B00Command(Base):
    __tablename__ = "B00Command"

    Id = Column(Integer, primary_key=True)
    ParentId = Column(Integer)

    IsGroup = Column(Boolean)

    CommandKey = Column(String(50))
    Text = Column(String(255))
    Text_English = Column(String(255))
    Text_French = Column(String(255))
    Text_Japanese = Column(String(255))
    Text_Chinese = Column(String(255))
    Text_Korean = Column(String(255))
    Text_Custom = Column(String(255))

    DLLName = Column(String(100))
    ClassName = Column(String(100))
    CtorArgs = Column(String(255))
    MethodName = Column(String(100))
    InvokeArgs = Column(String(255))

    CommandType = Column(String(50))

    DefaultEnabledState = Column(Boolean)

    ShortKeyText = Column(String(50))
    ShortKeyValue = Column(String(50))

    Image = Column(String(255))

    CommandClass = Column(String(100))
    AlterCommandClass = Column(String(100))

    CustomFlags = Column(String(50))
    CategoryFlags = Column(String(50))

    IsActive = Column(Boolean)

    CreatedBy = Column(Integer)
    CreatedAt = Column(DateTime)

    ModifiedBy = Column(Integer)
    ModifiedAt = Column(DateTime)
    
    __table_args__ = {"implicit_returning": False}

# --- Database Dependency ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Authorization Dependency ---
def require_ketoan_permission(request: Request) -> str:
    uid = _get_user_id(request)
    user = get_user_by_id(uid)
    if not user or not rbac.can_role(user.get("role", "user"), "automation:ketoan"):
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập chức năng này")
    return uid

# --- Pydantic Schemas ---
class B00CommandBase(BaseModel):
    ParentId: Optional[int] = None
    IsGroup: Optional[bool] = None

    CommandKey: Optional[str] = None
    Text: Optional[str] = None
    Text_English: Optional[str] = None

    DLLName: Optional[str] = None
    ClassName: Optional[str] = None
    MethodName: Optional[str] = None
    CtorArgs: Optional[str] = None

    DefaultEnabledState: Optional[bool] = None
    IsActive: Optional[bool] = None

class B00CommandCreate(B00CommandBase):
    pass

class B00CommandUpdate(BaseModel):
    Text: Optional[str] = None
    Text_English: Optional[str] = None
    IsActive: Optional[bool] = None
    
    DLLName: Optional[str] = None
    ClassName: Optional[str] = None
    MethodName: Optional[str] = None
    CtorArgs: Optional[str] = None
    DefaultEnabledState: Optional[bool] = None

class B00CommandOut(B00CommandBase):
    Id: int
    CreatedAt: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- CRUD Operations ---
def get_command_by_id(db: Session, command_id: int):
    return db.query(B00Command).filter(B00Command.Id == command_id).first()

def get_commands(db: Session, page: int = 1, page_size: int = 50):
    total = db.query(func.count(B00Command.Id)).scalar()
    items = (
        db.query(B00Command)
        .order_by(B00Command.Id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "total":       total,
        "page":        page,
        "page_size":   page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "items":       items,
    }

def search_commands(db: Session, keyword: str):
    kw = f"%{keyword.lower()}%"
    return (
        db.query(B00Command)
        .filter(
            or_(
                func.lower(B00Command.Text).like(kw),
                func.lower(B00Command.Text_English).like(kw),
                func.lower(B00Command.CommandKey).like(kw),
            )
        )
        .order_by(B00Command.Id)
        .all()
    )

def create_command(db: Session, command: B00CommandCreate):
    data = command.model_dump()
    now = datetime.utcnow()

    # check duplicate CommandKey
    existing = db.execute(text("""
        SELECT 1 FROM dbo.B00Command WHERE CommandKey = :key
    """), {"key": data.get("CommandKey")}).fetchone()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"CommandKey '{data.get('CommandKey')}' đã tồn tại"
        )
    data["MethodName"] = data.get("MethodName") or "Show"
    
    db.execute(text("""
        INSERT INTO dbo.B00Command (
            ParentId,
            IsGroup,
            CommandKey,
            Text,
            Text_English,
            DLLName,
            ClassName,
            MethodName,
            CtorArgs,
            DefaultEnabledState,
            IsActive,
            CreatedAt,
            ModifiedAt
        )
        VALUES (
            :ParentId,
            :IsGroup,
            :CommandKey,
            :Text,
            :Text_English,
            :DLLName,
            :ClassName,
            :MethodName,
            :CtorArgs,
            :DefaultEnabledState,
            :IsActive,
            :CreatedAt,
            :ModifiedAt
        )
    """), {
        "ParentId": data.get("ParentId"),
        "IsGroup": data.get("IsGroup"),
        "CommandKey": data.get("CommandKey"),
        "Text": data.get("Text"),
        "Text_English": data.get("Text_English"),

        "DLLName": data.get("DLLName"),
        "ClassName": data.get("ClassName"),
        "MethodName": data.get("MethodName"),
        "CtorArgs": data.get("CtorArgs"),
        "DefaultEnabledState": data.get("DefaultEnabledState"),

        "IsActive": data.get("IsActive", True),
        "CreatedAt": now,
        "ModifiedAt": now
    })

    db.commit()

    row = db.execute(text("""
        SELECT TOP 1 * FROM dbo.B00Command
        ORDER BY Id DESC
    """)).fetchone()

    return dict(row._mapping)

def update_command(db: Session, command_id: int, command: B00CommandUpdate):
    db_obj = get_command_by_id(db, command_id)
    if not db_obj:
        return None

    for key, value in command.model_dump(exclude_unset=True).items():
        setattr(db_obj, key, value)

    db_obj.ModifiedAt = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(db_obj)
    except Exception:
        db.rollback()
        raise

    return db_obj

def delete_command(db: Session, command_id: int):
    db_obj = get_command_by_id(db, command_id)
    if not db_obj:
        return None

    try:
        db.delete(db_obj)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return db_obj

# --- API Endpoints ---
@router.get("/search")
def api_search_commands(
    q: str = Query(...), 
    db: Session = Depends(get_db),
    _uid: str = Depends(require_ketoan_permission)
):
    return search_commands(db, q)

@router.get("")
def api_list_commands(
    page:      int = Query(default=1,  ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _uid: str = Depends(require_ketoan_permission)
):
    return get_commands(db, page=page, page_size=page_size)

@router.get("/{command_id}", response_model=B00CommandOut)
def api_get_command(
    command_id: int, 
    db: Session = Depends(get_db),
    _uid: str = Depends(require_ketoan_permission)
):
    cmd = get_command_by_id(db, command_id)
    if not cmd:
        raise HTTPException(status_code=404, detail="Command not found")
    return cmd

@router.post("", response_model=B00CommandOut)
def api_create_command(
    command: B00CommandCreate,
    db: Session = Depends(get_db),
    _uid: str = Depends(require_ketoan_permission)
):
    created = create_command(db, command)
    if not created:
        raise HTTPException(status_code=400, detail="Tạo command thất bại")
    return created

@router.put("/{command_id}")
def api_update_command(
    command_id: int,
    command: B00CommandUpdate,
    db: Session = Depends(get_db),
    _uid: str = Depends(require_ketoan_permission)
):
    updated = update_command(db, command_id, command)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy")
    return updated

@router.delete("/{command_id}")
def api_delete_command(
    command_id: int,
    db: Session = Depends(get_db),
    _uid: str = Depends(require_ketoan_permission)
):
    deleted = delete_command(db, command_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Không tìm thấy")
    return {"ok": True}
