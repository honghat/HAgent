from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
from sqlalchemy.orm import Session

from api.routers.auth import _get_user_id
from api.services.finance_db import get_finance_db, get_psql_user_id
from api.services.finance_models import Expense, DienNuoc, AnUong, ExpenseCategory
from api.services.finance_schemas import (
    ExpenseCreate, ExpenseUpdate, ExpenseResponse,
    DienNuocCreate, DienNuocUpdate, DienNuocResponse,
    AnUongCreate, AnUongUpdate, AnUongResponse,
    ExpenseCategoryCreate, ExpenseCategoryUpdate, ExpenseCategoryResponse,
    FoodMenuCreate, FoodMenuResponse
)
from api.services.finance_crud import (
    get_expenses, create_expense, delete_expense, update_expense,
    get_diennuoc_list, create_diennuoc, delete_diennuoc, update_diennuoc,
    get_anuong_list, create_anuong, update_anuong, delete_anuong,
    get_categories, create_category, update_category, delete_category,
    get_food_menu, create_food_item, delete_food_item
)

router = APIRouter(prefix="/expenses", tags=["expenses"])

# ============= ĂN UỐNG APIs =============
@router.post("/anuong", response_model=AnUongResponse)
def add_anuong(
    anuong: AnUongCreate, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Thêm bản ghi ăn uống mới"""
    psql_uid = get_psql_user_id(db, hagent_uid)
    anuong.user_id = psql_uid
    return create_anuong(db, anuong)

@router.get("/anuong", response_model=List[AnUongResponse])
def read_anuong(
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Lấy danh sách ăn uống theo userId"""
    psql_uid = get_psql_user_id(db, hagent_uid)
    return get_anuong_list(db, user_id=psql_uid)

@router.get("/anuong/{anuong_id}", response_model=AnUongResponse)
def get_anuong(
    anuong_id: int, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Lấy chi tiết 1 bản ghi ăn uống"""
    item = db.query(AnUong).filter(AnUong.id == anuong_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ăn uống record not found")
    return item

@router.put("/anuong/{anuong_id}", response_model=AnUongResponse)
def update_anuong_endpoint(
    anuong_id: int, 
    anuong_data: AnUongUpdate, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Cập nhật bản ghi ăn uống"""
    psql_uid = get_psql_user_id(db, hagent_uid)
    item = db.query(AnUong).filter(AnUong.id == anuong_id, AnUong.user_id == psql_uid).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ăn uống record not found or access denied")
    return update_anuong(db, anuong_id, anuong_data)

@router.delete("/anuong/{anuong_id}")
def delete_anuong_endpoint(
    anuong_id: int, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Xóa bản ghi ăn uống"""
    psql_uid = get_psql_user_id(db, hagent_uid)
    item = db.query(AnUong).filter(AnUong.id == anuong_id, AnUong.user_id == psql_uid).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ăn uống record not found or access denied")
    return delete_anuong(db, anuong_id)

# ============= ĐIỆN NƯỚC APIs =============
@router.post("/diennuoc", response_model=DienNuocResponse)
def add_diennuoc(
    diennuoc: DienNuocCreate, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Thêm bản ghi điện nước mới"""
    psql_uid = get_psql_user_id(db, hagent_uid)
    diennuoc.user_id = psql_uid
    return create_diennuoc(db, diennuoc)

@router.get("/diennuoc", response_model=List[DienNuocResponse])
def read_diennuoc(
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Lấy danh sách điện nước"""
    psql_uid = get_psql_user_id(db, hagent_uid)
    return get_diennuoc_list(db, user_id=psql_uid)

@router.get("/diennuoc/{diennuoc_id}", response_model=DienNuocResponse)
def get_diennuoc(
    diennuoc_id: int, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Lấy chi tiết 1 bản ghi điện nước"""
    diennuoc = db.query(DienNuoc).filter(DienNuoc.id == diennuoc_id).first()
    if not diennuoc:
        raise HTTPException(status_code=404, detail="Dien nuoc record not found")
    return diennuoc

@router.put("/diennuoc/{diennuoc_id}", response_model=DienNuocResponse)
def update_diennuoc_endpoint(
    diennuoc_id: int, 
    diennuoc_data: DienNuocUpdate, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Cập nhật bản ghi điện nước"""
    psql_uid = get_psql_user_id(db, hagent_uid)
    # Exclude unset fields so we don't overwrite with default values
    return update_diennuoc(db, diennuoc_id, diennuoc_data)

@router.delete("/diennuoc/{diennuoc_id}")
def delete_diennuoc_endpoint(
    diennuoc_id: int, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Xóa bản ghi điện nước"""
    return delete_diennuoc(db, diennuoc_id)

# ============= EXPENSES GENERAL APIs =============
@router.post("/", response_model=ExpenseResponse)
def add_expense(
    expense: ExpenseCreate, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    psql_uid = get_psql_user_id(db, hagent_uid)
    expense.userid = psql_uid
    return create_expense(db, expense)

@router.get("", response_model=List[ExpenseResponse])
def read_expenses(
    day: int = Query(None),
    month: int = Query(None),
    year: int = Query(None),
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    psql_uid = get_psql_user_id(db, hagent_uid)
    return get_expenses(db, user_id=psql_uid, day=day, month=month, year=year)

# ============= CATEGORY APIs =============
@router.get("/categories", response_model=List[ExpenseCategoryResponse])
def read_categories(
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Lấy danh sách danh mục chi tiêu"""
    psql_uid = get_psql_user_id(db, hagent_uid)
    return get_categories(db, user_id=psql_uid)

@router.post("/categories", response_model=ExpenseCategoryResponse)
def add_category(
    cat_data: ExpenseCategoryCreate,
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Thêm danh mục mới"""
    psql_uid = get_psql_user_id(db, hagent_uid)
    cat_data.user_id = psql_uid
    return create_category(db, cat_data)

@router.put("/categories/{cat_id}", response_model=ExpenseCategoryResponse)
def update_category_endpoint(
    cat_id: int,
    cat_data: ExpenseCategoryUpdate,
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Cập nhật danh mục"""
    psql_uid = get_psql_user_id(db, hagent_uid)
    return update_category(db, cat_id=cat_id, user_id=psql_uid, data=cat_data)

@router.delete("/categories/{cat_id}")
def delete_category_endpoint(
    cat_id: int,
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Xóa danh mục"""
    psql_uid = get_psql_user_id(db, hagent_uid)
    delete_category(db, cat_id=cat_id, user_id=psql_uid)
    return {"detail": "Category deleted successfully"}


# ============= THỰC ĐƠN APIs =============
@router.get("/food-menu", response_model=List[FoodMenuResponse])
def read_food_menu(
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Lấy danh sách thực đơn món ăn"""
    psql_uid = get_psql_user_id(db, hagent_uid)
    return get_food_menu(db, user_id=psql_uid)

@router.post("/food-menu", response_model=FoodMenuResponse)
def add_food_item(
    item_data: FoodMenuCreate,
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Thêm món ăn mới vào thực đơn"""
    psql_uid = get_psql_user_id(db, hagent_uid)
    item_data.user_id = psql_uid
    return create_food_item(db, item_data)

@router.delete("/food-menu/{item_id}")
def delete_food_item_endpoint(
    item_id: int,
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    """Xóa món ăn khỏi thực đơn"""
    psql_uid = get_psql_user_id(db, hagent_uid)
    delete_food_item(db, item_id=item_id, user_id=psql_uid)
    return {"detail": "Món ăn đã được xóa khỏi thực đơn"}


# ============= INDIVIDUAL EXPENSE APIs =============
@router.get("/{expense_id}", response_model=ExpenseResponse)
def get_expense(
    expense_id: int, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense

@router.put("/{expense_id}", response_model=ExpenseResponse)
def update_expense_endpoint(
    expense_id: int, 
    expense_data: ExpenseUpdate, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    psql_uid = get_psql_user_id(db, hagent_uid)
    expense_data.userid = psql_uid
    return update_expense(db, expense_id, expense_data)

@router.delete("/{expense_id}")
def delete_expense_endpoint(
    expense_id: int, 
    db: Session = Depends(get_finance_db),
    hagent_uid: str = Depends(_get_user_id)
):
    return delete_expense(db, expense_id)



