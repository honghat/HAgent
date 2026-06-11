import os
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(backend_path))

from api.services.db import get_connection

def migrate():
    conn = get_connection()
    try:
        cursor = conn.cursor()
        
        # Drop table if exists to start clean
        print("Dropping existing blog_posts table...")
        cursor.execute("DROP TABLE IF EXISTS blog_posts CASCADE")
        conn.commit()
        
        # Create table with user_id column
        print("Creating table blog_posts with user_id...")
        cursor.execute("""
            CREATE TABLE blog_posts (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                category TEXT,
                read_time TEXT,
                date TEXT,
                image TEXT,
                likes INTEGER DEFAULT 0,
                comments INTEGER DEFAULT 0,
                author_title TEXT DEFAULT 'Vibe Coder',
                content TEXT,
                pinned BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (user_id) REFERENCES hagent_users(id) ON DELETE CASCADE
            )
        """)
        conn.commit()

        # Check/Ensure user 'hat' exists, and set display_name and avatar
        cursor.execute("SELECT id FROM hagent_users WHERE id = 'hat'")
        user_row = cursor.fetchone()
        if not user_row:
            # Check if user 'hat' exists with username 'hat'
            cursor.execute("SELECT id FROM hagent_users WHERE username = 'hat'")
            user_row = cursor.fetchone()
            
        user_id = user_row[0] if user_row else 'hat'
        print(f"Using user ID: {user_id}")
        
        # Update user profile details
        cursor.execute(
            """UPDATE hagent_users 
               SET display_name = %s, 
                   avatar = %s 
               WHERE id = %s""",
            ("Nguyễn Hồng Hạt", "https://ui-avatars.com/api/?name=Hong+Hat&background=3b82f6&color=fff&size=96", user_id)
        )
        conn.commit()

        print("Seeding blog posts...")
        posts = [
            {
                "id": 1,
                "user_id": user_id,
                "title": "Gemini 1.5 Pro: Kỷ nguyên mới với Ngữ cảnh siêu rộng 2 Triệu Tokens",
                "description": "Google công bố mô hình Gemini 1.5 Pro với khả năng xử lý ngữ cảnh lên tới 2 triệu tokens, mở ra cuộc cách mạng trong phân tích mã nguồn và tài liệu lớn.",
                "category": "Mô hình ngôn ngữ",
                "read_time": "6 phút đọc",
                "date": "2026-06-10",
                "image": "https://images.unsplash.com/photo-1677442136019-21780efad99a?auto=format&fit=crop&q=80&w=800",
                "likes": 142,
                "comments": 28,
                "author_title": "AI Research Lead",
                "pinned": False,
                "content": """
                    <h2>Cuộc cách mạng Context Window</h2>
                    <p>Trong các mô hình ngôn ngữ lớn (LLM), cửa sổ ngữ cảnh (Context Window) quyết định lượng thông tin mà mô hình có thể tiếp nhận và ghi nhớ trong một phiên làm việc. Với bước nhảy vọt lên 2 triệu tokens, Gemini 1.5 Pro có thể xử lý đồng thời:</p>
                    <ul>
                        <li>Hơn 1.5 triệu từ văn bản.</li>
                        <li>Toàn bộ cơ sở mã nguồn (codebase) gồm hàng chục nghìn dòng lệnh.</li>
                        <li>Nhiều giờ video chất lượng cao hoặc các file âm thanh dài.</li>
                    </ul>

                    <div class="highlight-box bg-slate-50 border-l-4 border-indigo-500 p-4 my-6 rounded-r-xl">
                        <p class="font-bold text-slate-800">Thử nghiệm "Kim trong đống cỏ khô" (Needle In A Haystack):</p>
                        <p class="text-sm text-slate-600">Google đã chứng minh Gemini 1.5 Pro có thể tìm thấy một dòng code hoặc thông tin cụ thể được ẩn sâu bên trong tài liệu dài hàng triệu từ với độ chính xác đạt tới 99.7%.</p>
                    </div>

                    <h2>Ứng dụng thực tế trong lập trình và phân tích</h2>
                    <p>Khả năng này thay đổi hoàn toàn cách chúng ta phát triển phần mềm. Thay vì phải chia nhỏ dự án để đưa vào context của AI, nhà phát triển có thể tải toàn bộ repo dự án lên và yêu cầu Gemini giải thích luồng hoạt động, tìm lỗi bảo mật hoặc viết unit test trên diện rộng.</p>
                    <p>Đối với phân tích dữ liệu, Gemini 1.5 Pro có thể đọc hàng trăm bản báo cáo tài chính dày đặc, so sánh các số liệu qua từng năm và đưa ra dự báo chỉ trong vài giây mà không bị mất mát thông tin.</p>
                """
            },
            {
                "id": 2,
                "user_id": user_id,
                "title": "DeepSeek-R1: Mô hình suy luận nguồn mở thách thức các gã khổng lồ",
                "description": "Sự trỗi dậy của DeepSeek-R1 từ Trung Quốc với phương pháp Học tăng cường (Reinforcement Learning) đã làm thay đổi bản đồ AI toàn cầu nhờ hiệu năng vượt trội và chi phí cực thấp.",
                "category": "Suy luận AI",
                "read_time": "8 phút đọc",
                "date": "2026-06-08",
                "image": "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80&w=800",
                "likes": 289,
                "comments": 54,
                "author_title": "Vibe Coder",
                "pinned": False,
                "content": """
                    <h2>Reinforcement Learning (Học tăng cường) làm nên sự khác biệt</h2>
                    <p>Khác với các mô hình truyền thống chủ yếu tối ưu hóa thông qua học có giám sát (Supervised Fine-Tuning), DeepSeek-R1 áp dụng cơ chế suy luận tự động qua học tăng cường (RL). Mô hình tự suy nghĩ, lập luận, kiểm tra chéo các bước giải quyết vấn đề trước khi đưa ra câu trả lời cuối cùng.</p>
                    
                    <blockquote>
                        "DeepSeek-R1 không chỉ trả lời nhanh, nó tạo ra một 'Chuỗi suy nghĩ' (Chain of Thought) nội bộ để phân tích vấn đề đa chiều như cách con người tư duy lập luận toán học và logic."
                    </blockquote>

                    <h2>Chi phí siêu rẻ - Hiệu quả cực cao</h2>
                    <p>Một trong những điểm gây sốc nhất cho cộng đồng công nghệ là chi phí huấn luyện của DeepSeek chỉ bằng một phần nhỏ so với các đối thủ từ Mỹ. Bằng cách tối ưu cấu trúc Mixture-of-Experts (MoE) và thuật toán phân bổ bộ nhớ hiệu quả, DeepSeek-R1 chứng minh rằng không cần phần cứng siêu máy tính nghìn tỷ đô vẫn có thể tạo ra trí tuệ nhân tạo hàng đầu thế giới.</p>

                    <h2>Tác động đến cộng đồng nguồn mở</h2>
                    <p>Việc DeepSeek công bổ mở mã nguồn (open-source) trọng số mô hình đã thúc đẩy hàng ngàn dự án cá nhân và doanh nghiệp tự phát triển trợ lý suy luận riêng tư, giảm sự phụ thuộc vào các API đóng đắt đỏ.</p>
                """
            },
            {
                "id": 3,
                "user_id": user_id,
                "title": "Lập trình tương lai với Agentic Workflows (Quy trình Agent)",
                "description": "Tại sao các chatbot AI thông thường đang nhường chỗ cho hệ thống Multi-Agent có khả năng tự lập kế hoạch, sử dụng công cụ và hợp tác giải quyết tác vụ phức tạp.",
                "category": "Ứng dụng AI",
                "read_time": "5 phút đọc",
                "date": "2026-06-05",
                "image": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800",
                "likes": 95,
                "comments": 12,
                "author_title": "Workflow Automation Dev",
                "pinned": False,
                "content": """
                    <h2>Chatbot thông thường vs Agentic Workflow</h2>
                    <p>Khi sử dụng ChatGPT hay Gemini dạng chat trực tiếp, mô hình sẽ trả lời ngay lập tức (Zero-shot). Tuy nhiên đối với các công việc phức tạp như viết một cuốn sách hay debug hệ thống lớn, cách tiếp cận này dễ gặp lỗi và ảo tưởng (hallucination).</p>
                    <p><strong>Agentic Workflows</strong> chia nhỏ tác vụ và chạy theo một vòng lặp khép kín:</p>
                    <ol>
                        <li><strong>Lập kế hoạch (Planning):</strong> Agent phân tích đề bài và chia nhỏ thành các bước.</li>
                        <li><strong>Sử dụng công cụ (Tool Use):</strong> Agent gọi các API, chạy code terminal, đọc ghi file hoặc tìm kiếm web để thu thập thông tin chính xác.</li>
                        <li><strong>Phản hồi và Sửa lỗi (Reflection/Self-Correction):</strong> Một Agent khác hoặc chính nó sẽ rà soát lại kết quả, chạy thử nghiệm và tự động sửa nếu có lỗi.</li>
                    </ol>

                    <h2>Hệ thống Multi-Agent: Hợp tác như một nhóm chuyên gia</h2>
                    <p>Trong một quy trình tự động hóa nâng cao, nhiều Agent với các vai trò khác nhau (ví dụ: Product Manager Agent, Coder Agent, Tester Agent) sẽ trò chuyện và phối hợp với nhau để xây dựng một sản phẩm hoàn chỉnh mà không cần sự can thiệp liên tục của con người.</p>
                """
            },
            {
                "id": 4,
                "user_id": user_id,
                "title": "Hướng dẫn thực chiến Prompt Engineering dành cho lập trình viên",
                "description": "Tổng hợp các kỹ thuật thiết kế prompt nâng cao như Few-shot, Chain-of-Thought và ReAct để tăng cường độ chính xác của LLM lên gấp nhiều lần.",
                "category": "Hướng dẫn",
                "read_time": "7 phút đọc",
                "date": "2026-05-28",
                "image": "https://images.unsplash.com/photo-1542831371-29b0f74f9713?auto=format&fit=crop&q=80&w=800",
                "likes": 178,
                "comments": 31,
                "author_title": "Vibe Coder",
                "pinned": False,
                "content": """
                    <h2>1. Few-shot Prompting: Dạy AI bằng ví dụ</h2>
                    <p>Đừng chỉ yêu cầu AI thực hiện một việc mơ hồ. Hãy cung cấp cho nó 2-3 ví dụ mẫu về định dạng đầu vào và kết quả mong muốn đầu ra. Kỹ thuật này giúp mô hình hiểu rõ cấu trúc dữ liệu cần phản hồi mà không cần huấn luyện lại.</p>

                    <h2>2. Chain-of-Thought (Chuỗi tư duy)</h2>
                    <p>Thêm câu lệnh đơn giản như <em>"Hãy suy nghĩ từng bước một"</em> (Let's think step by step) sẽ kích hoạt khả năng phân tích logic. AI sẽ đưa ra các bước lập luận trung gian trước khi đưa ra kết luận cuối cùng, hạn chế tối đa các lỗi tính toán toán học đơn giản.</p>

                    <h2>3. ReAct Pattern (Reasoning and Acting)</h2>
                    <p>Đây là cấu trúc nền tảng của các Agent hiện đại. Prompt được thiết kế để yêu cầu AI luân phiên thực hiện <strong>Suy nghĩ (Thought)</strong> -> <strong>Hành động (Action)</strong> -> <strong>Quan sát (Observation)</strong>. Bằng cách này, AI có thể quyết định khi nào cần tìm kiếm Google, khi nào cần đọc tài liệu và phản hồi dựa trên kết quả thực tế.</p>
                """
            },
            {
                "id": 5,
                "user_id": user_id,
                "title": "HAgent: Nền tảng trợ lý AI cá nhân & Tự động hóa quy trình công việc thế hệ mới",
                "description": "Giới thiệu HAgent - trợ lý AI đa năng chạy trực tiếp trên máy của bạn, kết hợp khả năng lập trình, quản lý hệ thống, tự động hóa cron job và theo dõi tài chính thông minh.",
                "category": "Ứng dụng AI",
                "read_time": "4 phút đọc",
                "date": "2026-06-12",
                "image": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800",
                "likes": 312,
                "comments": 45,
                "author_title": "Vibe Coder",
                "pinned": True,
                "content": """
                    <p>HAgent là trợ lý AI cá nhân chạy ngay trên máy của bạn — một "bộ não thứ hai" giúp bạn lập trình, quản lý công việc, tự động hóa quy trình và theo dõi tài chính, tất cả trong một giao diện duy nhất.</p>

                    <h2>HAgent giải quyết điều gì?</h2>
                    <p>Thay vì phải nhảy qua lại giữa hàng chục công cụ rời rạc, bạn chỉ cần trò chuyện với HAgent. Agent tự lập kế hoạch, chọn đúng công cụ và thực thi — từ viết code, chạy lệnh terminal, tra cứu thông tin đến gửi tin nhắn đa nền tảng — luôn dưới sự kiểm soát và cho phép của bạn.</p>

                    <h2>Những năng lực cốt lõi</h2>
                    <ul>
                        <li><strong>Trợ lý lập trình thực chiến:</strong> Hiểu codebase hiện tại, sửa lỗi, viết kiểm thử và chạy lệnh terminal trong môi trường sandbox an toàn.</li>
                        <li><strong>OmniChat đa kênh:</strong> Gộp Telegram, Zalo, Facebook... vào một hộp thư chung, bật/tắt tự động trả lời cho từng hội thoại với mô hình AI riêng.</li>
                        <li><strong>Tự động hóa thông minh:</strong> Lên lịch tác vụ định kỳ (Cron), giám sát dịch vụ, quản lý Docker và sao lưu dữ liệu tự động.</li>
                        <li><strong>Quản lý tài chính cá nhân:</strong> Ghi chép chi tiêu, theo dõi số dư tài khoản và nắm bắt dòng tiền nhanh gọn, bảo mật.</li>
                        <li><strong>Kho tri thức tự tiến hóa:</strong> Tự rút trích và sắp xếp kiến thức sau mỗi cuộc trò chuyện thành Wiki cá nhân của riêng bạn.</li>
                    </ul>

                    <h2>Nhiều mô hình, một trải nghiệm</h2>
                    <p>HAgent tích hợp linh hoạt các mô hình ngôn ngữ hàng đầu như Google Gemini, DeepSeek-R1 hay GPT-4o. Bạn chọn đúng "bộ não" cho từng việc — lập trình, dịch thuật hay sáng tạo nội dung — mà không cần rời khỏi ứng dụng.</p>

                    <blockquote>Mọi dữ liệu cá nhân, nhật ký trò chuyện và thông tin tài chính đều được lưu trên máy của bạn hoặc đồng bộ mã hóa tới tài khoản đám mây riêng — tuyệt đối không chia sẻ cho bên thứ ba.</blockquote>

                    <h2>Tầm nhìn</h2>
                    <p>HAgent hướng tới một "AI OS" thu nhỏ: nơi nhiều agent phối hợp nhịp nhàng để xử lý những luồng công việc phức tạp thay cho bạn. Đăng nhập để bắt đầu trải nghiệm và cùng xây dựng tương lai năng suất vượt trội.</p>
                """
            }
        ]
        
        for post in posts:
            cursor.execute(
                """INSERT INTO blog_posts 
                   (id, user_id, title, description, category, read_time, date, image, likes, comments, author_title, content, pinned)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    post["id"], post["user_id"], post["title"], post["description"], post["category"], post["read_time"],
                    post["date"], post["image"], post["likes"], post["comments"], post["author_title"], post["content"].strip(), post["pinned"]
                )
            )
        conn.commit()
        print("Blog posts migrated successfully!")
    except Exception as e:
        conn.rollback()
        print(f"Migration error: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    migrate()
