#!/usr/bin/env python3
"""
Script thay thế "Hạt Nguyễn" bằng "Hạt Nguyễn" trong toàn bộ dự án.
Quy tắc: Không thay path chứa Hạt Nguyễn/, chỉ thay tên riêng và references khác.
"""

import os

# Danh sách file cần xử lý (không bao gồm thư mục chính Hạt Nguyễn/)
TARGET_DIR = '/Users/nguyenhat/Hạt Nguyễn/backend'

def should_skip_file(file_path, content):
    """Quy tắc: không thay trong đường dẫn chứa Hạt Nguyễn/"""
    if 'Hạt Nguyễn/' in content:
        return True
    return False


def replace_in_files():
    """Thay thế tất cả file"""
    
    # Các file chính cần thay
    files = [
        f'telegram_bot.py',
        f'agent/prompt_builder.py',
        f'memories/hagent/profiles/system_profile.txt',
    ]
    
    for filename in files:
        file_path = os.path.join(TARGET_DIR, filename)
        
        if not os.path.exists(file_path):
            print(f"⚠️  Không tìm thấy {filename}")
            continue
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            old_count = content.count('Hạt Nguyễn')
            new_content = content.replace('Hạt Nguyễn', 'Hạt Nguyễn')
            new_count = new_content.count('Hạt Nguyễn')
            
            # Chỉ ghi lại nếu có thay đổi (và không chứa đường dẫn Hạt Nguyễn/)
            if old_count != new_count and not should_skip_file(file_path, new_content):
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                
                changed = old_count - new_count
                print(f"✅ Đã thay {changed} occurrences trong {filename}")
            elif old_count == new_count:
                print(f"⚠️  Không có thay đổi hoặc chứa đường dẫn: {filename}")
                
        except Exception as e:
            print(f"❌ Lỗi khi xử lý {filename}: {e}")


def replace_all_recursive():
    """Thay thế tất cả file trong thư mục (không bao gồm backend/)"""
    
    # Danh sách các extension cần kiểm tra
    extensions = ['.py', '.md', '.txt', '.json', '.yaml', '.yml']
    
    for root, dirs, files in os.walk(TARGET_DIR):
        # Bỏ qua thư mục backend/ và __pycache__
        if '/backend/' in root or '__pycache__' in root:
            continue
        
        for filename in files:
            file_path = os.path.join(root, filename)
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                if 'Hạt Nguyễn' in content and '/backend/' not in root.lower():
                    new_content = content.replace('Hạt Nguyễn', 'Hạt Nguyễn')
                    
                    if new_content != content:
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        
                        print(f"✅ Đã thay trong {file_path}")
                    else:
                        print(f"⚪ Không thay đổi: {file_path}")
                        
            except Exception as e:
                print(f"❌ Lỗi khi xử lý {file_path}: {e}")


if __name__ == '__main__':
    print("=" * 60)
    print("🔄 Thay thế toàn bộ Hạt Nguyễn -> Hạt Nguyễn")
    print("=" * 60)
    print()
    
    replace_all_recursive()
    
    print()
    print("=" * 60)
    print("✅ Hoàn tất!")
    print("=" * 60)
