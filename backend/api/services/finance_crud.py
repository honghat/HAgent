from sqlalchemy.orm import Session
from sqlalchemy import extract, desc
from fastapi import HTTPException
from typing import List, Optional

from api.services.finance_models import Expense, DienNuoc, AnUong, Account, BalanceRecord, SavingsBook
from api.services.finance_schemas import (
    ExpenseCreate, ExpenseUpdate, 
    DienNuocCreate, DienNuocUpdate, 
    AnUongCreate, AnUongUpdate,
    AccountCreate, AccountUpdate,
    BalanceRecordCreate, BalanceRecordUpdate,
    SavingsBookCreate, SavingsBookUpdate
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
    db_item = AnUong(**anuong_data.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

def update_anuong(db: Session, anuong_id: int, data: AnUongUpdate):
    rec = db.query(AnUong).filter(AnUong.id == anuong_id).first()
    if not rec:
        raise HTTPException(404, "Record not found")
    for key, value in data.model_dump(exclude_unset=True).items():
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
