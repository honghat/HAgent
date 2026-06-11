import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UnicodeText, Float, Date, Boolean, Unicode
from sqlalchemy.orm import relationship
from api.services.finance_db import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String)
    email = Column(String, unique=True, index=True)
    full_name = Column(Unicode(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    role_id = Column(Integer, default=4)
    is_active = Column(Boolean, default=True)

class Expense(Base):
    __tablename__ = "expenses"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False)
    description = Column(UnicodeText, nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(UnicodeText, nullable=False)
    payment_method = Column(UnicodeText, nullable=False)
    expense_type = Column(UnicodeText, nullable=False)
    userid = Column(Integer, ForeignKey('users.id'), nullable=False)

class DienNuoc(Base):
    __tablename__ = "diennuoc"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    date = Column(Date, nullable=False)
    water_old = Column(Integer, default=0)
    water_new = Column(Integer, default=0)
    electric_old = Column(Integer, default=0)
    electric_new = Column(Integer, default=0)

class AnUong(Base):
    __tablename__ = "anuong"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer)
    date = Column(Date)
    sang = Column(String)
    tien_sang = Column(Integer)
    sang_paid = Column(Boolean)
    trua = Column(String)
    tien_trua = Column(Integer)
    trua_paid = Column(Boolean)
    toi = Column(String)
    tien_toi = Column(Integer)
    toi_paid = Column(Boolean)

class Account(Base):
    __tablename__ = "accounts"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    balance = Column(Float, default=0.0)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=True)
    balance_records = relationship("BalanceRecord", back_populates="account", cascade="all, delete-orphan")

class BalanceRecord(Base):
    __tablename__ = "balance_records"
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    balance = Column(Float, nullable=False)
    note = Column(String, nullable=True)
    account = relationship("Account", back_populates="balance_records")

class SavingsBook(Base):
    __tablename__ = "savings_books"
    id = Column(Integer, primary_key=True, index=True)
    book_number = Column(String, nullable=False, unique=True)
    bank_name = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    interest_rate = Column(Float, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String, default="active")
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=True)

class ExpenseCategory(Base):
    """Danh mục chi tiêu — lưu tên, màu sắc, icon và thứ tự hiển thị"""
    __tablename__ = "expense_categories"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    name = Column(Unicode(100), nullable=False)
    color = Column(String(20), nullable=False, default="#6366f1")
    icon = Column(String(10), nullable=True, default="📦")
    sort_order = Column(Integer, default=0)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class FoodMenu(Base):
    """Thực đơn món ăn của user"""
    __tablename__ = "food_menu"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    name = Column(Unicode(100), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

