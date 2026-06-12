from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from api.routers.auth import _get_user_id
from api.services.finance_db import get_finance_db, get_psql_user_id
from api.services.finance_models import Account, BalanceRecord, SavingsBook
from api.services.finance_schemas import (
    AccountCreate, AccountUpdate, AccountResponse,
    BalanceRecordCreate, BalanceRecordUpdate, BalanceRecordResponse,
    SavingsBookCreate, SavingsBookUpdate, SavingsBookResponse
)
from api.services.finance_crud import (
    get_accounts, create_account, update_account, get_account, delete_account,
    get_balance_records, create_balance_record, get_balance_record, update_balance_record, delete_balance_record,
    get_savings_books, create_savings_book, get_savings_book, update_savings_book, delete_savings_book
)

router = APIRouter(prefix="/balance", tags=["balance"])

# ============ ACCOUNT ROUTES ============
@router.get("/accounts", response_model=List[AccountResponse])
async def get_all_accounts(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    try:
        psql_uid = get_psql_user_id(db, hagent_uid)
        accounts = get_accounts(db, user_id=psql_uid, skip=skip, limit=limit)
        if not accounts:
            return []
        return accounts
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/accounts", response_model=AccountResponse)
async def create_new_account(
    account: AccountCreate, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    try:
        psql_uid = get_psql_user_id(db, hagent_uid)
        return create_account(db, account, user_id=psql_uid)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating account: {str(e)}")

@router.get("/accounts/{account_id}", response_model=AccountResponse)
async def get_account_by_id(
    account_id: int, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    account = get_account(db, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    psql_uid = get_psql_user_id(db, hagent_uid)
    if account.user_id != psql_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    return account

@router.put("/accounts/{account_id}", response_model=AccountResponse)
async def update_account_by_id(
    account_id: int, 
    account: AccountUpdate, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    db_account = get_account(db, account_id)
    if not db_account:
        raise HTTPException(status_code=404, detail="Account not found")
    psql_uid = get_psql_user_id(db, hagent_uid)
    if db_account.user_id != psql_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    updated_account = update_account(db, account_id, account)
    return updated_account

@router.delete("/accounts/{account_id}")
async def delete_account_by_id(
    account_id: int, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    db_account = get_account(db, account_id)
    if not db_account:
        raise HTTPException(status_code=404, detail="Account not found")
    psql_uid = get_psql_user_id(db, hagent_uid)
    if db_account.user_id != psql_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not delete_account(db, account_id):
        raise HTTPException(status_code=404, detail="Account not found")
    return {"message": "Account deleted successfully"}

# ============ BALANCE RECORD ROUTES ============
@router.get("/balance-records", response_model=List[BalanceRecordResponse])
async def get_all_balance_records(
    account_id: Optional[int] = None,
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    try:
        psql_uid = get_psql_user_id(db, hagent_uid)
        records = get_balance_records(db, user_id=psql_uid, account_id=account_id, skip=skip, limit=limit)
        if not records:
            return []
        return records
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/balance-records", response_model=BalanceRecordResponse)
async def create_new_balance_record(
    record: BalanceRecordCreate, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    try:
        psql_uid = get_psql_user_id(db, hagent_uid)
        account = get_account(db, record.account_id)
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        if account.user_id != psql_uid:
            raise HTTPException(status_code=403, detail="Forbidden")
        return create_balance_record(db, record)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating balance record: {str(e)}")

@router.get("/balance-records/{record_id}", response_model=BalanceRecordResponse)
async def get_balance_record_by_id(
    record_id: int, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    record = get_balance_record(db, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Balance record not found")
    psql_uid = get_psql_user_id(db, hagent_uid)
    if record.account.user_id != psql_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    return record

@router.put("/balance-records/{record_id}", response_model=BalanceRecordResponse)
async def update_balance_record_by_id(
    record_id: int, 
    record: BalanceRecordUpdate, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    db_record = get_balance_record(db, record_id)
    if not db_record:
        raise HTTPException(status_code=404, detail="Balance record not found")
    psql_uid = get_psql_user_id(db, hagent_uid)
    if db_record.account.user_id != psql_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    if record.account_id is not None:
        dest_account = get_account(db, record.account_id)
        if not dest_account or dest_account.user_id != psql_uid:
            raise HTTPException(status_code=403, detail="Forbidden destination account")
    updated_record = update_balance_record(db, record_id, record)
    return updated_record

@router.delete("/balance-records/{record_id}")
async def delete_balance_record_by_id(
    record_id: int, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    db_record = get_balance_record(db, record_id)
    if not db_record:
        raise HTTPException(status_code=404, detail="Balance record not found")
    psql_uid = get_psql_user_id(db, hagent_uid)
    if db_record.account.user_id != psql_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not delete_balance_record(db, record_id):
        raise HTTPException(status_code=404, detail="Balance record not found")
    return {"message": "Balance record deleted successfully"}

# ============ SAVINGS BOOK ROUTES ============
@router.get("/savings-books", response_model=List[SavingsBookResponse])
async def get_all_savings_books(
    status: Optional[str] = None,
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    try:
        psql_uid = get_psql_user_id(db, hagent_uid)
        books = get_savings_books(db, user_id=psql_uid, status=status, skip=skip, limit=limit)
        if not books:
            return []
        return books
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/savings-books", response_model=SavingsBookResponse)
async def create_new_savings_book(
    book: SavingsBookCreate, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    try:
        psql_uid = get_psql_user_id(db, hagent_uid)
        return create_savings_book(db, book, user_id=psql_uid)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating savings book: {str(e)}")

@router.get("/savings-books/{book_id}", response_model=SavingsBookResponse)
async def get_savings_book_by_id(
    book_id: int, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    book = get_savings_book(db, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Savings book not found")
    psql_uid = get_psql_user_id(db, hagent_uid)
    if book.user_id != psql_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    return book

@router.put("/savings-books/{book_id}", response_model=SavingsBookResponse)
async def update_savings_book_by_id(
    book_id: int, 
    book: SavingsBookUpdate, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    db_book = get_savings_book(db, book_id)
    if not db_book:
        raise HTTPException(status_code=404, detail="Savings book not found")
    psql_uid = get_psql_user_id(db, hagent_uid)
    if db_book.user_id != psql_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    updated_book = update_savings_book(db, book_id, book)
    return updated_book

@router.delete("/savings-books/{book_id}")
async def delete_savings_book_by_id(
    book_id: int, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    db_book = get_savings_book(db, book_id)
    if not db_book:
        raise HTTPException(status_code=404, detail="Savings book not found")
    psql_uid = get_psql_user_id(db, hagent_uid)
    if db_book.user_id != psql_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not delete_savings_book(db, book_id):
        raise HTTPException(status_code=404, detail="Savings book not found")
    return {"message": "Savings book deleted successfully"}
