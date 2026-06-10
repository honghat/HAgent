"""PDF Tool — Agent có thể tạo, merge, trích xuất text, xoá/sắp xếp trang PDF."""

import io
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from .registry import registry, tool_error, tool_result

logger = logging.getLogger(__name__)


def _check_pdf_deps() -> bool:
    """Kiểm tra các thư viện PDF cần thiết."""
    try:
        import pypdf  # noqa: F401
        import reportlab  # noqa: F401
        return True
    except ImportError:
        return False


def _build_text_pdf(text: str, title: str | None = None) -> bytes:
    """Tạo PDF bytes từ text string dùng ReportLab."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    out = io.BytesIO()
    doc = SimpleDocTemplate(
        out, pagesize=A4,
        topMargin=40, bottomMargin=40,
        leftMargin=40, rightMargin=40,
    )
    styles = getSampleStyleSheet()
    body = styles["BodyText"]
    body.fontName = "Helvetica"
    body.fontSize = 11
    body.leading = 16
    story = []
    if title:
        h = styles["Heading2"]
        story.append(Paragraph(title, h))
        story.append(Spacer(1, 12))
    for para in text.split("\n\n"):
        clean = para.replace("\n", "<br/>")
        clean = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", clean)
        story.append(Paragraph(clean or "&nbsp;", body))
        story.append(Spacer(1, 8))
    doc.build(story)
    return out.getvalue()


def _resolve_path(filepath: str) -> Optional[Path]:
    """Resolve đường dẫn file, hỗ trợ ~ và relative path."""
    try:
        p = Path(filepath).expanduser().resolve()
        return p
    except Exception:
        return None


async def _handle_create_pdf(args: Dict[str, Any], **kwargs) -> str:
    """Tạo PDF từ text."""
    text = args.get("text", "")
    output_path = args.get("output_path", "")
    title = args.get("title", "")

    if not text.strip():
        return tool_error("Text rỗng — không thể tạo PDF")
    if not output_path:
        return tool_error("Cần output_path để lưu file PDF")

    resolved = _resolve_path(output_path)
    if not resolved:
        return tool_error(f"Đường dẫn không hợp lệ: {output_path}")

    try:
        buf = _build_text_pdf(text, title=title or None)
        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_bytes(buf)
        return tool_result({
            "success": True,
            "output_path": str(resolved),
            "size_bytes": len(buf),
            "message": f"PDF đã tạo tại {resolved}",
        })
    except Exception as e:
        logger.exception("create_pdf failed")
        return tool_error(f"Lỗi tạo PDF: {e}")


async def _handle_merge_pdfs(args: Dict[str, Any], **kwargs) -> str:
    """Merge nhiều file PDF thành một."""
    input_paths: List[str] = args.get("input_paths", [])
    output_path = args.get("output_path", "")

    if len(input_paths) < 2:
        return tool_error("Cần ít nhất 2 file PDF để merge")
    if not output_path:
        return tool_error("Cần output_path để lưu file PDF")

    from pypdf import PdfReader, PdfWriter

    writer = PdfWriter()
    resolved_inputs = []
    for p in input_paths:
        r = _resolve_path(p)
        if not r or not r.exists():
            return tool_error(f"File không tồn tại: {p}")
        resolved_inputs.append(r)

    try:
        for rp in resolved_inputs:
            reader = PdfReader(str(rp))
            for page in reader.pages:
                writer.add_page(page)

        resolved_out = _resolve_path(output_path)
        if not resolved_out:
            return tool_error(f"Đường dẫn không hợp lệ: {output_path}")
        resolved_out.parent.mkdir(parents=True, exist_ok=True)
        writer.write(str(resolved_out))

        return tool_result({
            "success": True,
            "output_path": str(resolved_out),
            "total_pages": len(writer.pages),
            "source_count": len(resolved_inputs),
            "message": f"Đã merge {len(resolved_inputs)} file PDF thành {resolved_out}",
        })
    except Exception as e:
        logger.exception("merge_pdfs failed")
        return tool_error(f"Lỗi merge PDF: {e}")


async def _handle_extract_pdf_text(args: Dict[str, Any], **kwargs) -> str:
    """Trích xuất text từ PDF."""
    input_path = args.get("input_path", "")
    page_spec = args.get("pages", "")  # e.g. "1,3,5-7" or "" for all

    if not input_path:
        return tool_error("Cần input_path")

    from pypdf import PdfReader

    resolved = _resolve_path(input_path)
    if not resolved or not resolved.exists():
        return tool_error(f"File không tồn tại: {input_path}")

    try:
        reader = PdfReader(str(resolved))
        total = len(reader.pages)

        indices = _parse_page_range(page_spec, total) if page_spec else list(range(total))

        pages_result = []
        for idx in indices:
            if 0 <= idx < total:
                try:
                    text = reader.pages[idx].extract_text() or ""
                except Exception:
                    text = ""
                pages_result.append({"page": idx + 1, "text": text})

        full_text = "\n\n".join(p["text"] for p in pages_result)

        return tool_result({
            "success": True,
            "total_pages": total,
            "extracted_pages": len(pages_result),
            "text_length": len(full_text),
            "text": full_text,
            "pages": pages_result,
            "source": str(resolved),
        })
    except Exception as e:
        logger.exception("extract_pdf_text failed")
        return tool_error(f"Lỗi trích xuất text: {e}")


async def _handle_create_blank_pdf(args: Dict[str, Any], **kwargs) -> str:
    """Tạo PDF trắng với số trang chỉ định."""
    output_path = args.get("output_path", "")
    pages = int(args.get("pages", 1))

    if not output_path:
        return tool_error("Cần output_path để lưu file PDF")
    if pages < 1 or pages > 50:
        return tool_error("Số trang phải từ 1 đến 50")

    from pypdf import PdfWriter

    try:
        writer = PdfWriter()
        for _ in range(pages):
            writer.add_blank_page(width=595, height=842)  # A4

        resolved = _resolve_path(output_path)
        if not resolved:
            return tool_error(f"Đường dẫn không hợp lệ: {output_path}")
        resolved.parent.mkdir(parents=True, exist_ok=True)
        writer.write(str(resolved))

        return tool_result({
            "success": True,
            "output_path": str(resolved),
            "pages": pages,
            "message": f"Đã tạo PDF trắng {pages} trang tại {resolved}",
        })
    except Exception as e:
        logger.exception("create_blank_pdf failed")
        return tool_error(f"Lỗi tạo PDF trắng: {e}")


async def _handle_delete_pdf_pages(args: Dict[str, Any], **kwargs) -> str:
    """Xoá trang khỏi PDF."""
    input_path = args.get("input_path", "")
    output_path = args.get("output_path", "")
    pages = args.get("pages", "")  # "2,5-7"

    if not input_path or not output_path or not pages:
        return tool_error("Cần input_path, output_path và pages")

    from pypdf import PdfReader, PdfWriter

    resolved_in = _resolve_path(input_path)
    if not resolved_in or not resolved_in.exists():
        return tool_error(f"File không tồn tại: {input_path}")

    try:
        reader = PdfReader(str(resolved_in))
        total = len(reader.pages)
        keep = _parse_keep(pages, total)

        if not keep:
            return tool_error("Sau khi xoá không còn trang nào")

        writer = PdfWriter()
        for idx in keep:
            writer.add_page(reader.pages[idx])

        resolved_out = _resolve_path(output_path)
        if not resolved_out:
            return tool_error(f"Đường dẫn không hợp lệ: {output_path}")
        resolved_out.parent.mkdir(parents=True, exist_ok=True)
        writer.write(str(resolved_out))

        return tool_result({
            "success": True,
            "output_path": str(resolved_out),
            "original_pages": total,
            "remaining_pages": len(keep),
            "deleted_pages": total - len(keep),
            "message": f"Đã xoá {total - len(keep)} trang, còn {len(keep)} trang",
        })
    except Exception as e:
        logger.exception("delete_pdf_pages failed")
        return tool_error(f"Lỗi xoá trang PDF: {e}")


async def _handle_reorder_pdf_pages(args: Dict[str, Any], **kwargs) -> str:
    """Sắp xếp lại thứ tự trang PDF."""
    input_path = args.get("input_path", "")
    output_path = args.get("output_path", "")
    order = args.get("order", "")  # "3,1,2,4"

    if not input_path or not output_path or not order:
        return tool_error("Cần input_path, output_path và order")

    from pypdf import PdfReader, PdfWriter

    resolved_in = _resolve_path(input_path)
    if not resolved_in or not resolved_in.exists():
        return tool_error(f"File không tồn tại: {input_path}")

    try:
        reader = PdfReader(str(resolved_in))
        total = len(reader.pages)

        indices = []
        for tok in order.split(","):
            tok = tok.strip()
            if not tok:
                continue
            try:
                n = int(tok)
            except ValueError:
                continue
            if 1 <= n <= total:
                indices.append(n - 1)

        if not indices:
            return tool_error("Thứ tự trang rỗng hoặc không hợp lệ")

        writer = PdfWriter()
        for idx in indices:
            writer.add_page(reader.pages[idx])

        resolved_out = _resolve_path(output_path)
        if not resolved_out:
            return tool_error(f"Đường dẫn không hợp lệ: {output_path}")
        resolved_out.parent.mkdir(parents=True, exist_ok=True)
        writer.write(str(resolved_out))

        return tool_result({
            "success": True,
            "output_path": str(resolved_out),
            "original_pages": total,
            "reordered_pages": len(indices),
            "new_order": [i + 1 for i in indices],
            "message": f"Đã sắp xếp lại thứ tự trang: {order}",
        })
    except Exception as e:
        logger.exception("reorder_pdf_pages failed")
        return tool_error(f"Lỗi sắp xếp trang PDF: {e}")


def _parse_keep(pages: str, total: int) -> List[int]:
    """Parse '2,5-7' (trang cần xoá) → trả về list 0-based index cần giữ."""
    drop: set[int] = set()
    for part in pages.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            try:
                a, b = [int(x) for x in part.split("-", 1)]
            except ValueError:
                continue
            for n in range(min(a, b), max(a, b) + 1):
                drop.add(n - 1)
        else:
            try:
                drop.add(int(part) - 1)
            except ValueError:
                continue
    return [i for i in range(total) if i not in drop]


def _parse_page_range(spec: str, total: int) -> List[int]:
    """Parse '1,3,5-7' → list 0-based indices."""
    result: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            try:
                a, b = [int(x) for x in part.split("-", 1)]
            except ValueError:
                continue
            for n in range(min(a, b), max(a, b) + 1):
                if 1 <= n <= total:
                    result.add(n - 1)
        else:
            try:
                n = int(part)
                if 1 <= n <= total:
                    result.add(n - 1)
            except ValueError:
                continue
    return sorted(result)


# =============================================================================
# OpenAI Function-Calling Schemas
# =============================================================================

CREATE_PDF_SCHEMA = {
    "name": "create_pdf",
    "description": "Tạo file PDF từ nội dung text. Hỗ trợ tiêu đề và xuống dòng tự động.",
    "parameters": {
        "type": "object",
        "properties": {
            "text": {
                "type": "string",
                "description": "Nội dung text cho PDF (dùng \n\n để xuống dòng)",
            },
            "output_path": {
                "type": "string",
                "description": "Đường dẫn lưu file PDF (VD: /path/to/output.pdf)",
            },
            "title": {
                "type": "string",
                "description": "Tiêu đề của tài liệu (không bắt buộc)",
            },
        },
        "required": ["text", "output_path"],
    },
}

MERGE_PDFS_SCHEMA = {
    "name": "merge_pdfs",
    "description": "Gộp nhiều file PDF thành một file PDF duy nhất. Cần ít nhất 2 file.",
    "parameters": {
        "type": "object",
        "properties": {
            "input_paths": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Danh sách đường dẫn các file PDF cần gộp",
            },
            "output_path": {
                "type": "string",
                "description": "Đường dẫn lưu file PDF kết quả",
            },
        },
        "required": ["input_paths", "output_path"],
    },
}

EXTRACT_PDF_TEXT_SCHEMA = {
    "name": "extract_pdf_text",
    "description": "Trích xuất nội dung text từ file PDF. Có thể chọn trang cụ thể hoặc toàn bộ.",
    "parameters": {
        "type": "object",
        "properties": {
            "input_path": {
                "type": "string",
                "description": "Đường dẫn file PDF cần trích xuất",
            },
            "pages": {
                "type": "string",
                "description": "Trang cần trích xuất (VD: '1,3,5-7'). Để trống = lấy toàn bộ.",
            },
        },
        "required": ["input_path"],
    },
}

CREATE_BLANK_PDF_SCHEMA = {
    "name": "create_blank_pdf",
    "description": "Tạo file PDF trắng khổ A4 với số trang chỉ định (1-50).",
    "parameters": {
        "type": "object",
        "properties": {
            "output_path": {
                "type": "string",
                "description": "Đường dẫn lưu file PDF",
            },
            "pages": {
                "type": "integer",
                "description": "Số trang (1-50, mặc định 1)",
                "default": 1,
            },
        },
        "required": ["output_path"],
    },
}

DELETE_PDF_PAGES_SCHEMA = {
    "name": "delete_pdf_pages",
    "description": "Xoá các trang chỉ định khỏi file PDF. VD: '2,5-7' để xoá trang 2,5,6,7.",
    "parameters": {
        "type": "object",
        "properties": {
            "input_path": {
                "type": "string",
                "description": "Đường dẫn file PDF gốc",
            },
            "output_path": {
                "type": "string",
                "description": "Đường dẫn lưu file PDF sau khi xoá",
            },
            "pages": {
                "type": "string",
                "description": "Các trang cần xoá (VD: '2,5-7' xoá trang 2,5,6,7)",
            },
        },
        "required": ["input_path", "output_path", "pages"],
    },
}

REORDER_PDF_PAGES_SCHEMA = {
    "name": "reorder_pdf_pages",
    "description": "Sắp xếp lại thứ tự các trang trong file PDF. VD: '3,1,2,4' để đưa trang 3 lên đầu.",
    "parameters": {
        "type": "object",
        "properties": {
            "input_path": {
                "type": "string",
                "description": "Đường dẫn file PDF gốc",
            },
            "output_path": {
                "type": "string",
                "description": "Đường dẫn lưu file PDF sau khi sắp xếp",
            },
            "order": {
                "type": "string",
                "description": "Thứ tự trang mới (VD: '3,1,2,4' cho file 4 trang)",
            },
        },
        "required": ["input_path", "output_path", "order"],
    },
}

# =============================================================================
# Registry
# =============================================================================

registry.register(
    name="create_pdf",
    toolset="pdf",
    schema=CREATE_PDF_SCHEMA,
    handler=_handle_create_pdf,
    check_fn=_check_pdf_deps,
    is_async=True,
    emoji="📄",
)

registry.register(
    name="merge_pdfs",
    toolset="pdf",
    schema=MERGE_PDFS_SCHEMA,
    handler=_handle_merge_pdfs,
    check_fn=_check_pdf_deps,
    is_async=True,
    emoji="🔀",
)

registry.register(
    name="extract_pdf_text",
    toolset="pdf",
    schema=EXTRACT_PDF_TEXT_SCHEMA,
    handler=_handle_extract_pdf_text,
    check_fn=_check_pdf_deps,
    is_async=True,
    emoji="📝",
)

registry.register(
    name="create_blank_pdf",
    toolset="pdf",
    schema=CREATE_BLANK_PDF_SCHEMA,
    handler=_handle_create_blank_pdf,
    check_fn=_check_pdf_deps,
    is_async=True,
    emoji="📑",
)

registry.register(
    name="delete_pdf_pages",
    toolset="pdf",
    schema=DELETE_PDF_PAGES_SCHEMA,
    handler=_handle_delete_pdf_pages,
    check_fn=_check_pdf_deps,
    is_async=True,
    emoji="🗑️",
)

registry.register(
    name="reorder_pdf_pages",
    toolset="pdf",
    schema=REORDER_PDF_PAGES_SCHEMA,
    handler=_handle_reorder_pdf_pages,
    check_fn=_check_pdf_deps,
    is_async=True,
    emoji="🔃",
)
