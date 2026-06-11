from sqlalchemy.orm import Session
from sqlalchemy import extract, desc
from fastapi import HTTPException
from typing import List, Optional

from api.services.finance_models import Expense, DienNuoc, AnUong, Account, BalanceRecord, SavingsBook, FoodMenu
from api.services.finance_schemas import (
    ExpenseCreate, ExpenseUpdate, 
    DienNuocCreate, DienNuocUpdate, 
    AnUongCreate, AnUongUpdate,
    AccountCreate, AccountUpdate,
    BalanceRecordCreate, BalanceRecordUpdate,
    SavingsBookCreate, SavingsBookUpdate,
    FoodMenuCreate
)

# ============ EXPENSE CRUD ============
def create_expense(db: Session, expense: ExpenseCreate):
    db_expense = Expense(**expense.model_dump())
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    return db_expense

def get_expenses(db: Session, user_id: int, day: int = None, month: int = None, year: int = None):
    query = db.query(Expense).filter(Expense.userid == user_id)
    if year:
        query = query.filter(extract('year', Expense.date) == year)
    if month:
        query = query.filter(extract('month', Expense.date) == month)
    if day:
        query = query.filter(extract('day', Expense.date) == day)
    return query.order_by(desc(Expense.date)).all()

def delete_expense(db: Session, expense_id: int):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(expense)
    db.commit()
    return {"message": "Expense deleted successfully"}

def update_expense(db: Session, expense_id: int, expense_data: ExpenseUpdate):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    for key, value in expense_data.model_dump().items():
        setattr(expense, key, value)
    db.commit()
    db.refresh(expense)
    return expense

# ============ DIEN NUOC CRUD ============
def get_diennuoc_list(db: Session, user_id: int):
    query = db.query(DienNuoc).filter(DienNuoc.user_id == user_id)
    return query.order_by(DienNuoc.date.desc()).all()

def create_diennuoc(db: Session, diennuoc: DienNuocCreate):
    db_diennuoc = DienNuoc(**diennuoc.model_dump())
    db.add(db_diennuoc)
    db.commit()
    db.refresh(db_diennuoc)
    return db_diennuoc

def update_diennuoc(db: Session, diennuoc_id: int, diennuoc_data: DienNuocUpdate):
    db_diennuoc = db.query(DienNuoc).filter(DienNuoc.id == diennuoc_id).first()
    if not db_diennuoc:
        return None
    for key, value in diennuoc_data.model_dump(exclude_unset=True).items():
        setattr(db_diennuoc, key, value)
    db.commit()
    db.refresh(db_diennuoc)
    return db_diennuoc

def delete_diennuoc(db: Session, diennuoc_id: int):
    db_diennuoc = db.query(DienNuoc).filter(DienNuoc.id == diennuoc_id).first()
    if db_diennuoc:
        db.delete(db_diennuoc)
        db.commit()
        return {"message": "Dien nuoc deleted successfully"}
    return None

# ============ AN UONG CRUD ============
def get_anuong_list(db: Session, user_id: int):
    return (
        db.query(AnUong)
        .filter(AnUong.user_id == user_id)
        .order_by(AnUong.date.desc())
        .all()
    )

def create_anuong(db: Session, anuong_data: AnUongCreate):
    # Enforce 0đ default is paid
    if anuong_data.tien_sang is None or anuong_data.tien_sang == 0:
        anuong_data.sang_paid = True
    if anuong_data.tien_trua is None or anuong_data.tien_trua == 0:
        anuong_data.trua_paid = True
    if anuong_data.tien_toi is None or anuong_data.tien_toi == 0:
        anuong_data.toi_paid = True

    db_item = AnUong(**anuong_data.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

def update_anuong(db: Session, anuong_id: int, data: AnUongUpdate):
    rec = db.query(AnUong).filter(AnUong.id == anuong_id).first()
    if not rec:
        raise HTTPException(404, "Record not found")
    
    # Enforce 0đ default is paid
    update_data = data.model_dump(exclude_unset=True)
    if "tien_sang" in update_data:
        if update_data["tien_sang"] is None or update_data["tien_sang"] == 0:
            update_data["sang_paid"] = True
    if "tien_trua" in update_data:
        if update_data["tien_trua"] is None or update_data["tien_trua"] == 0:
            update_data["trua_paid"] = True
    if "tien_toi" in update_data:
        if update_data["tien_toi"] is None or update_data["tien_toi"] == 0:
            update_data["toi_paid"] = True

    for key, value in update_data.items():
        setattr(rec, key, value)
    db.commit()
    db.refresh(rec)
    return rec


def delete_anuong(db: Session, anuong_id: int):
    item = db.query(AnUong).filter(AnUong.id == anuong_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ăn uống record not found")
    db.delete(item)
    db.commit()
    return {"message": "Deleted successfully"}

# ============ ACCOUNT CRUD ============
def get_accounts(db: Session, skip: int = 0, limit: int = 100) -> List[Account]:
    return db.query(Account).offset(skip).limit(limit).all()

def get_account(db: Session, account_id: int) -> Optional[Account]:
    return db.query(Account).filter(Account.id == account_id).first()

def create_account(db: Session, account: AccountCreate) -> Account:
    db_account = Account(
        name=account.name,
        balance=account.balance
    )
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account

def update_account(db: Session, account_id: int, account: AccountUpdate) -> Optional[Account]:
    db_account = get_account(db, account_id)
    if db_account:
        db_account.name = account.name
        db_account.balance = account.balance
        db.commit()
        db.refresh(db_account)
    return db_account

def delete_account(db: Session, account_id: int) -> bool:
    db_account = get_account(db, account_id)
    if db_account:
        db.delete(db_account)
        db.commit()
        return True
    return False

# ============ BALANCE RECORD CRUD ============
def get_balance_records(
    db: Session, 
    account_id: Optional[int] = None, 
    skip: int = 0, 
    limit: int = 100
) -> List[BalanceRecord]:
    query = db.query(BalanceRecord)
    if account_id:
        query = query.filter(BalanceRecord.account_id == account_id)
    return query.order_by(BalanceRecord.date.desc()).offset(skip).limit(limit).all()

def get_balance_record(db: Session, record_id: int) -> Optional[BalanceRecord]:
    return db.query(BalanceRecord).filter(BalanceRecord.id == record_id).first()

def create_balance_record(db: Session, record: BalanceRecordCreate) -> BalanceRecord:
    db_record = BalanceRecord(
        account_id=record.account_id,
        date=record.date,
        balance=record.balance,
        note=record.note
    )
    db.add(db_record)
    
    # Update account balance
    db_account = get_account(db, record.account_id)
    if db_account:
        db_account.balance = record.balance
    
    db.commit()
    db.refresh(db_record)
    return db_record

def update_balance_record(
    db: Session, 
    record_id: int, 
    record: BalanceRecordUpdate
) -> Optional[BalanceRecord]:
    db_record = get_balance_record(db, record_id)
    if db_record:
        if record.date is not None:
            db_record.date = record.date
        if record.balance is not None:
            db_record.balance = record.balance
        if record.note is not None:
            db_record.note = record.note
        db.commit()
        db.refresh(db_record)
    return db_record

def delete_balance_record(db: Session, record_id: int) -> bool:
    db_record = get_balance_record(db, record_id)
    if db_record:
        db.delete(db_record)
        db.commit()
        return True
    return False

# ============ SAVINGS BOOK CRUD ============
def get_savings_books(
    db: Session, 
    status: Optional[str] = None, 
    skip: int = 0, 
    limit: int = 100
) -> List[SavingsBook]:
    query = db.query(SavingsBook)
    if status:
        query = query.filter(SavingsBook.status == status)
    return query.order_by(SavingsBook.start_date.desc()).offset(skip).limit(limit).all()

def get_savings_book(db: Session, book_id: int) -> Optional[SavingsBook]:
    return db.query(SavingsBook).filter(SavingsBook.id == book_id).first()

def create_savings_book(db: Session, book: SavingsBookCreate) -> SavingsBook:
    db_book = SavingsBook(
        book_number=book.book_number,
        bank_name=book.bank_name,
        amount=book.amount,
        interest_rate=book.interest_rate,
        start_date=book.start_date,
        end_date=book.end_date,
        status=book.status
    )
    db.add(db_book)
    db.commit()
    db.refresh(db_book)
    return db_book

def update_savings_book(
    db: Session, 
    book_id: int, 
    book: SavingsBookUpdate
) -> Optional[SavingsBook]:
    db_book = get_savings_book(db, book_id)
    if db_book:
        if book.book_number is not None:
            db_book.book_number = book.book_number
        if book.bank_name is not None:
            db_book.bank_name = book.bank_name
        if book.amount is not None:
            db_book.amount = book.amount
        if book.interest_rate is not None:
            db_book.interest_rate = book.interest_rate
        if book.start_date is not None:
            db_book.start_date = book.start_date
        if book.end_date is not None:
            db_book.end_date = book.end_date
        if book.status is not None:
            db_book.status = book.status
        db.commit()
        db.refresh(db_book)
    return db_book

def delete_savings_book(db: Session, book_id: int) -> bool:
    db_book = get_savings_book(db, book_id)
    if db_book:
        db.delete(db_book)
        db.commit()
        return True
    return False

# ============ EXPENSE CATEGORY CRUD ============

DEFAULT_CATEGORIES = [
    {"name": "Ăn uống",           "color": "#22c55e", "icon": "🍜", "sort_order": 1},
    {"name": "Đi lại",            "color": "#f59e0b", "icon": "🚗", "sort_order": 2},
    {"name": "Tiền nhà",          "color": "#3b82f6", "icon": "🏠", "sort_order": 3},
    {"name": "Mua sắm",           "color": "#ec4899", "icon": "🛍️", "sort_order": 4},
    {"name": "Vệ sinh-Sức khỏe",  "color": "#06b6d4", "icon": "💊", "sort_order": 5},
    {"name": "Tiền internet",     "color": "#8b5cf6", "icon": "🌐", "sort_order": 6},
    {"name": "Sinh nhật",         "color": "#f97316", "icon": "🎂", "sort_order": 7},
    {"name": "Đám cưới",          "color": "#db2777", "icon": "💍", "sort_order": 8},
    {"name": "Biếu tặng",         "color": "#e11d48", "icon": "🎁", "sort_order": 9},
    {"name": "Hớt tóc",           "color": "#0891b2", "icon": "✂️", "sort_order": 10},
    {"name": "Lương",             "color": "#16a34a", "icon": "💰", "sort_order": 11},
    {"name": "Lãi",               "color": "#15803d", "icon": "📈", "sort_order": 12},
    {"name": "Tiết kiệm",         "color": "#7c3aed", "icon": "🏦", "sort_order": 13},
    {"name": "Rút tiền",          "color": "#9333ea", "icon": "💸", "sort_order": 14},
    {"name": "Khác",              "color": "#6b7280", "icon": "📦", "sort_order": 15},
    {"name": "XL",                "color": "#374151", "icon": "⚙️", "sort_order": 16},
]

from api.services.finance_models import ExpenseCategory
from api.services.finance_schemas import (
    ExpenseCategoryCreate, ExpenseCategoryUpdate
)

def seed_default_categories(db: Session, user_id: int):
    """Tạo danh mục mặc định cho user mới nếu chưa có, và đồng bộ các danh mục từ giao dịch cũ"""
    existing_cats = db.query(ExpenseCategory).filter(ExpenseCategory.user_id == user_id).all()
    existing_names = {c.name for c in existing_cats}
    
    cat_map = {cat["name"]: cat for cat in DEFAULT_CATEGORIES}
    has_changes = False
    
    # 1. Thêm các danh mục mặc định nếu chưa có
    for default_cat in DEFAULT_CATEGORIES:
        if default_cat["name"] not in existing_names:
            db.add(ExpenseCategory(
                user_id=user_id,
                name=default_cat["name"],
                color=default_cat["color"],
                icon=default_cat["icon"],
                sort_order=default_cat["sort_order"],
                is_default=True,
            ))
            existing_names.add(default_cat["name"])
            has_changes = True
            
    # 2. Thêm các danh mục hiện có từ bảng Expense (giao dịch cũ của user)
    from api.services.finance_models import Expense
    expense_cats = [x[0] for x in db.query(Expense.category).filter(Expense.userid == user_id).distinct().all() if x[0]]
    for ec in expense_cats:
        if ec not in existing_names:
            color = "#6b7280"
            icon = "📦"
            sort_order = 99
            if ec in cat_map:
                color = cat_map[ec]["color"]
                icon = cat_map[ec]["icon"]
                sort_order = cat_map[ec]["sort_order"]
            
            db.add(ExpenseCategory(
                user_id=user_id,
                name=ec,
                color=color,
                icon=icon,
                sort_order=sort_order,
                is_default=False,
            ))
            existing_names.add(ec)
            has_changes = True
            
    if has_changes:
        db.commit()

def get_categories(db: Session, user_id: int):
    seed_default_categories(db, user_id)
    return (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.user_id == user_id)
        .order_by(ExpenseCategory.sort_order, ExpenseCategory.name)
        .all()
    )

def create_category(db: Session, data: ExpenseCategoryCreate) -> ExpenseCategory:
    cat = ExpenseCategory(**data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat

def update_category(db: Session, cat_id: int, user_id: int, data: ExpenseCategoryUpdate) -> ExpenseCategory:
    from fastapi import HTTPException
    cat = db.query(ExpenseCategory).filter(
        ExpenseCategory.id == cat_id,
        ExpenseCategory.user_id == user_id
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat

def delete_category(db: Session, cat_id: int, user_id: int) -> bool:
    from fastapi import HTTPException
    cat = db.query(ExpenseCategory).filter(
        ExpenseCategory.id == cat_id,
        ExpenseCategory.user_id == user_id
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()
    return True

# ============ FOOD MENU CRUD ============
DEFAULT_FOOD_ITEMS = [
    "Trứng chiên", "Trứng luộc", "Ốp la", "Mì tôm", "Cháo", "Miến",
    "Nui", "Hủ tiếu", "Cơm tấm", "Bún thịt nướng", "Thịt kho", "Bún bò",
    "Bún đậu", "Bánh mì trứng", "Gà xối mỡ"
]

def seed_default_food_items(db: Session, user_id: int):
    """Seed danh sách món ăn mặc định cho user nếu chưa có món nào"""
    existing_count = db.query(FoodMenu).filter(FoodMenu.user_id == user_id).count()
    if existing_count == 0:
        for name in DEFAULT_FOOD_ITEMS:
            db.add(FoodMenu(
                user_id=user_id,
                name=name
            ))
        db.commit()

def get_food_menu(db: Session, user_id: int) -> List[FoodMenu]:
    seed_default_food_items(db, user_id)
    return (
        db.query(FoodMenu)
        .filter(FoodMenu.user_id == user_id)
        .order_by(FoodMenu.name.asc())
        .all()
    )

def create_food_item(db: Session, data: FoodMenuCreate) -> FoodMenu:
    # Check duplicate
    existing = db.query(FoodMenu).filter(
        FoodMenu.user_id == data.user_id,
        FoodMenu.name == data.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Món ăn này đã tồn tại trong thực đơn")
        
    db_item = FoodMenu(**data.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

def delete_food_item(db: Session, item_id: int, user_id: int) -> bool:
    item = db.query(FoodMenu).filter(
        FoodMenu.id == item_id,
        FoodMenu.user_id == user_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Món ăn không tìm thấy")
    db.delete(item)
    db.commit()
    return True

