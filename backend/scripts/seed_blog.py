import os
import sys
import re
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parents[1]
sys.path.append(str(backend_dir))

from api.services.db import get_connection

def markdown_to_html(md_text: str) -> str:
    html = []
    lines = md_text.split('\n')
    in_list = False
    in_code_block = False
    in_table = False
    
    for line in lines:
        # Xử lý khối code blocks
        if line.strip().startswith('```'):
            if in_code_block:
                html.append('</code></pre>')
                in_code_block = False
            else:
                html.append('<pre class="bg-slate-50 border border-slate-100 rounded-xl p-4 overflow-x-auto text-xs font-mono my-4 text-slate-800"><code>')
                in_code_block = True
            continue
            
        if in_code_block:
            html.append(line)
            continue
            
        # Xử lý lists
        if line.strip().startswith('- ') or line.strip().startswith('* '):
            if not in_list:
                html.append('<ul class="list-disc pl-6 space-y-2 text-slate-700 my-4">')
                in_list = True
            content = line.strip()[2:]
            # Bold
            content = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', content)
            # Inline code
            content = re.sub(r'`(.*?)`', r'<code class="px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded text-xs text-slate-800 font-mono">\1</code>', content)
            # Links
            content = re.sub(r'\[(.*?)\]\((.*?)\)', r'<a href="\2" class="text-indigo-600 hover:underline font-semibold">\1</a>', content)
            # Escapes
            content = content.replace('&rarr;', '→')
            html.append(f'  <li>{content}</li>')
            continue
        elif in_list:
            html.append('</ul>')
            in_list = False
            
        # Xử lý Tables
        if '|' in line:
            parts = [p.strip() for p in line.split('|')[1:-1]]
            if not parts or all(p == '' or set(p) == {'-'} for p in parts):
                # Đây là dòng phân cách table header (---|---)
                continue
            if not in_table:
                html.append('<div class="overflow-x-auto my-6"><table class="w-full text-left text-xs border-collapse border border-slate-200">')
                html.append('<thead><tr class="bg-slate-50 border-b border-slate-200">')
                for p in parts:
                    p = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', p)
                    html.append(f'<th class="px-4 py-2 font-bold border-r border-slate-200">{p}</th>')
                html.append('</tr></thead><tbody>')
                in_table = True
                continue
            else:
                html.append('<tr class="border-b border-slate-100 hover:bg-slate-50/50">')
                for p in parts:
                    p = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', p)
                    p = re.sub(r'`(.*?)`', r'<code class="px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded text-xs text-slate-800 font-mono">\1</code>', p)
                    p = re.sub(r'\[(.*?)\]\((.*?)\)', r'<a href="\2" class="text-indigo-600 hover:underline font-semibold">\1</a>', p)
                    html.append(f'<td class="px-4 py-2 border-r border-slate-200">{p}</td>')
                html.append('</tr>')
                continue
        elif in_table:
            html.append('</tbody></table></div>')
            in_table = False
            
        # Xử lý Headings
        if line.startswith('# '):
            content = line[2:].strip()
            # Bỏ tiêu đề lớn h1 vì bài viết đã có tiêu đề riêng ở trang blog
            continue
        elif line.startswith('## '):
            content = line[3:].strip()
            html.append(f'<h2 class="text-lg sm:text-xl font-black text-slate-800 mt-8 mb-4 border-b border-slate-100 pb-2">{content}</h2>')
            continue
        elif line.startswith('### '):
            content = line[4:].strip()
            html.append(f'<h3 class="text-sm sm:text-base font-black text-slate-800 mt-6 mb-3">{content}</h3>')
            continue
            
        # Xử lý Horizontal rule
        if line.strip() == '---':
            html.append('<hr class="my-6 border-slate-100" />')
            continue
            
        # Dòng trống
        if not line.strip():
            continue
            
        # Paragraph bình thường
        content = line.strip()
        # Bold
        content = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', content)
        # Inline code
        content = re.sub(r'`(.*?)`', r'<code class="px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded text-xs text-slate-800 font-mono">\1</code>', content)
        # Links
        content = re.sub(r'\[(.*?)\]\((.*?)\)', r'<a href="\2" class="text-indigo-600 hover:underline font-semibold">\1</a>', content)
        # Escapes
        content = content.replace('&rarr;', '→')
        html.append(f'<p class="text-justify leading-relaxed text-xs sm:text-sm text-slate-700 mb-4">{content}</p>')
        
    # Đóng các tag còn mở
    if in_list:
        html.append('</ul>')
    if in_code_block:
        html.append('</code></pre>')
    if in_table:
        html.append('</tbody></table></div>')
        
    return '\n'.join(html)

def main():
    project_root = backend_dir.parent
    readme_path = project_root / "README.md"
    
    if not readme_path.exists():
        print(f"Lỗi: Không tìm thấy file README.md tại {readme_path}")
        return
        
    with open(readme_path, "r", encoding="utf-8") as f:
        md_content = f.read()
        
    content_html = markdown_to_html(md_content)
    
    with get_connection() as conn:
        user_row = conn.execute("SELECT id FROM hagent_users LIMIT 1").fetchone()
        if not user_row:
            print("Lỗi: Không tìm thấy người dùng nào trong hagent_users!")
            return
        
        uid = user_row["id"]
        
        conn.execute("DELETE FROM blog_posts")
        print("Đã xoá tất cả bài viết cũ trong blog_posts.")
        
        conn.execute(
            """INSERT INTO blog_posts
                   (user_id, title, description, category, read_time, date, image, author_title, content, pinned)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                uid,
                "HAgent - Trợ lý AI tự trị & Bộ não thứ hai toàn diện",
                "Tài liệu giới thiệu tổng quan, kiến trúc, tính năng và hướng dẫn cài đặt HAgent bằng tiếng Việt.",
                "Hướng dẫn",
                "10 phút đọc",
                "2026-06-12",
                None,
                "Nguyễn Hồng Hạt",
                content_html,
                True
            )
        )
        print("Đã đọc từ README.md và nạp bài viết giới thiệu vào DB thành công!")

if __name__ == "__main__":
    main()
