from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date

# ================= EXPENSE SCHEMAS =================
class Expense(BaseModel):
    id: int
    date: datetime
    description: str
    amount: float
    category: str
    expense_type: str
    userid: int

class ExpenseCreate(BaseModel):
    date: date
    description: str
    amount: float
    category: str
    payment_method: str
    expense_type: str
    userid: int

class ExpenseResponse(BaseModel):
    id: int
    date: date
    description: str
    amount: float
    category: str
    payment_method: str
    expense_type: str
   
    class Config:
        from_attributes = True

class ExpenseUpdate(BaseModel):
    date: date 
    description: str 
    amount: float 
    category: str 
    payment_method: str
    expense_type: str
    userid: int 

# ================= DIEN NUOC SCHEMAS =================
class DienNuocBase(BaseModel):
    user_id: int
    date: date
    water_old: int = 0
    water_new: int = 0
    electric_old: int = 0
    electric_new: int = 0

class DienNuocCreate(DienNuocBase):
    pass

class DienNuocUpdate(BaseModel):
    date: date
    water_old: Optional[int] = None
    water_new: Optional[int] = None
    electric_old: Optional[int] = None
    electric_new: Optional[int] = None

class DienNuocResponse(DienNuocBase):
    id: int
    
    class Config:
        from_attributes = True

# ================= AN UONG SCHEMAS =================
class AnUongBase(BaseModel):
    user_id: int
    date: date
    sang: Optional[str] = None
    tien_sang: Optional[int] = None
    sang_paid: Optional[bool] = None
    trua: Optional[str] = None
    tien_trua: Optional[int] = None
    trua_paid: Optional[bool] = None
    toi: Optional[str] = None
    tien_toi: Optional[int] = None
    toi_paid: Optional[bool] = None

class AnUongCreate(AnUongBase):
    pass

class AnUongUpdate(BaseModel):
    date: date
    sang: Optional[str] = None
    tien_sang: Optional[int] = None
    sang_paid: Optional[bool] = None
    trua: Optional[str] = None
    tien_trua: Optional[int] = None
    trua_paid: Optional[bool] = None
    toi: Optional[str] = None
    tien_toi: Optional[int] = None
    toi_paid: Optional[bool] = None

class AnUongResponse(AnUongBase):
    id: int

    class Config:
        from_attributes = True

# ================= ACCOUNT SCHEMAS =================
class AccountBase(BaseModel):
    name: str
    balance: float

class AccountCreate(AccountBase):
    pass

class AccountUpdate(AccountBase):
    pass

class AccountResponse(AccountBase):
    id: int
    
    class Config:
        from_attributes = True

# ================= BALANCE RECORD SCHEMAS =================
class BalanceRecordBase(BaseModel):
    account_id: int
    date: date
    balance: float
    note: Optional[str] = None

class BalanceRecordCreate(BalanceRecordBase):
    pass

class BalanceRecordUpdate(BaseModel):
    date: Optional[date] = None
    balance: Optional[float] = None
    note: Optional[str] = None

class BalanceRecordResponse(BalanceRecordBase):
    id: int
    
    class Config:
        from_attributes = True

# ================= SAVINGS BOOK SCHEMAS =================
class SavingsBookBase(BaseModel):
    book_number: str
    bank_name: str
    amount: float
    interest_rate: float
    start_date: date
    end_date: date
    status: str = "active"

class SavingsBookCreate(SavingsBookBase):
    pass

class SavingsBookUpdate(BaseModel):
    book_number: Optional[str] = None
    bank_name: Optional[str] = None
    amount: Optional[float] = None
    interest_rate: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = None

class SavingsBookResponse(SavingsBookBase):
    id: int
    
    class Config:
        from_attributes = True

# ================= EXPENSE CATEGORY SCHEMAS =================
class ExpenseCategoryBase(BaseModel):
    name: str
    color: str = "#6366f1"
    icon: Optional[str] = "📦"
    sort_order: int = 0
    is_default: bool = False

class ExpenseCategoryCreate(ExpenseCategoryBase):
    user_id: int = 0  # sẽ được gán từ token

class ExpenseCategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None

class ExpenseCategoryResponse(ExpenseCategoryBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True
