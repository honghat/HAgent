---
name: "tin-tuc"
description: "Lấy tin tức hàng ngày từ VnExpress. So sánh với cache, chỉ báo tin mới."
---

# Tin Tức Định Kỳ

## Nhiệm vụ
1. Fetch tin tức từ `https://vnexpress.net/` bằng tool `get_vnexpress_news` (preferred, trả về list headlines có URL+tiêu đề)
2. Đọc cache từ file tuyệt đối `/Users/nguyenhat/HAgent/backend/data/news_cache.json`
3. So sánh URLs tin mới với cache `urls` array; chỉ giữ lại tin chưa có trong cache
4. Cập nhật cache với tin mới
5. Format tin mới thành danh sách để gửi qua Telegram

## Cache Format (`/Users/nguyenhat/HAgent/backend/data/news_cache.json`)
```json
{
  "last_check": "2026-05-15T08:00:00",
  "urls": ["url1", "url2", ...]
}
```

### 🎯 Known-Good Summary Templates (Tested 2026-06-08)

Below are examples of short summaries that were proven to run successfully without triggering HTTP 500 on the local TTS engine. **Word count limits:** Xã hội/Kinh tế: 25-35 từ | Chiến tranh/Quân sự: 15-25 từ | Pháp luật/Công nghệ: 20-30 từ | Quốc tế: 18-28 từ | Thể thao: 15-22 từ.

**✅ Templates:**
1. **Xã hội/Kinh tế (32 từ):** `"Bảo hiểm cho tài xế công nghệ: Nhiều ý kiến cho rằng các nền tảng gọi xe cần có trách nhiệm đóng bảo hiểm xã hội cho tài xế thay vì chỉ coi họ là đối tác."`
2. **Quốc tế/Chiến tranh (25 từ):** `"Israel tập kích Beirut: Quân đội Israel vừa tấn công ngoại ô phía nam thủ đô Lebanon, nhắm vào cứ điểm của Hezbollah khiến hai người tử vong."`
3. **Pháp luật/Công nghệ (29 từ):** `"Bà chủ vải áo dài Đất Lành bị khởi tố: Công an thành phố Hồ Chí Minh cáo buộc bà Hoàng Thị Bích Ngọc dùng công nghệ AI sao chép mẫu thiết kế của thương hiệu khác."`
4. **Quốc tế/An ninh biển (18 từ - AN TOÀN):** `"Quân Hoa Kỳ dùng xuồng không người lái cứu phi công trực thăng rơi gần eo biển Hormuz."`
5. **Thể thao (20 từ):** `"Jose Mourinho trở lại Real với nhiệm vụ xây dựng lực lượng và hoàn thiện ban huấn luyện."`

### 🔧 High-Risk Phrase Substitution Table (Critical!)

⚠️ **LUÔN LUÔN ÁP DỤNG** khi viết summary TTS cho tin có chứa các cụm dưới đây:

| Từ/Cụm NGUY HIỂM | Thay thế an toàn | Ví dụ thực tế từ session 09/06/2026 |
|------------------|-------------------|--------------------------------------|
| "Trump" (cáo) | → bỏ hoặc viết "Tổng thống" thay vì tên riêng cụ thể | `"Netanyahu hủy tấn công Iran sau lời khuyên của Tổng thống."` ✅ (thay vì `"Trump thuyết phục Netanyahu..."` ❌) |
| "Mỹ" (trong câu dài/chi tiết) | → dùng "Hoa Kỳ", "Lục quân Mỹ", hoặc "Hải quân Mỹ" + rút text xuống dưới 25 từ | `"Quân Hoa Kỳ dùng xuồng không người lái cứu phi công trực thăng."` ✅ (thay vì `"Mỹ dùng xuồng không người lái giải cứu..."` ❌) |
| "Hội đồng Bảo an" (ngay cả text ngắn) | → viết tắt: "HĐBA LHQ", hoặc đơn giản hơn là bỏ cụm này khỏi summary | `"Đức thua tranh cử HĐBA LHQ"` ✅ (THAY vì giữ nguyên 5 từ đầy đủ - vẫn gây lỗi!) |
| "thẻ xanh" | → thay thế bằng "giấy phép cư trú" hoặc tóm tắt sang chủ đề chính khác | *(High-risk: cần rút xuống còn 8-10 từ tối đa nếu MUST mention)* |

**⚠️ Quy tắc rút ngắn text theo ngữ cảnh:**
- **Trump/Thủ lĩnh quốc gia cụ thể:** Chỉ giữ lại **"Tổng thống"** + hành động chính (max 15 từ) hoặc bỏ name riêng khỏi summary
- **Mỹ trong câu dài (>25 từ):** Rút xuống còn **under 20 words** và đổi tên gọi an toàn ("Hoa Kỳ" thay vì "Mỹ")
- **Hội đồng Bảo an:** Chỉ giữ **8-10 từ TỐI ĐA** nếu MUST có, hoặc bỏ hoàn toàn khỏi text (high-risk nhất - lỗi ngay cả khi text rất ngắn!)

---

### ✅ File Naming & FFMPEG Concat Safety Checklist

⚠️ **CRITICAL:** Tất cả file TTS outputs phải sử dụng naming pattern thống nhất:
- `tmp/<tin_topic>.mp3` (chứa dấu gạch ngang)
- **KHÔNG** dùng `tmp_<topic>.mp3` (thiếu gạch ngang - ffmpeg concat sẽ KHÔNG tìm thấy!)

**❌ Sai:** `-o /tmp_news_mourinho.mp3` → FFmpeg báo: `Impossible to open '/tmp_news_mourinho.mp3'`
**✅ Đúng:** `-o /tmp/news_mourinho.mp3` → FFmpeg tìm thấy và concat thành công!

---

## Output Format

### Text (Telegram / chat)
```
📰 Tin tức mới [ngày]:

1. [Tiêu đề](url)
2. [Tiêu đề](url)
...
```

### Speech (macOS TTS)
Khi output cần đọc bằng âm thanh, dùng TTS server tại port 5002.

**Phương pháp khuyến nghị: Chia nhỏ từng tin → gọi TTS riêng → ffmpeg concat**

TTS server trên macmini hay bị 500 với text dài hoặc một số từ/cụm từ nhất định (ví dụ "thẻ xanh", "Mỹ" trong câu dài). Chiến lược an toàn nhất:

1. Gọi TTS cho **từng tin riêng lẻ** bằng `curl` (text ngắn, ~20-40 từ), mỗi lần timeout 30s
2. Nếu một tin bị lỗi 500 → bỏ qua tin đó, ghi chú cho user
3. Ghép các file .mp3 lại bằng ffmpeg concat
4. Phát toàn bộ bằng `afplay`

```bash
# Gọi từng tin riêng
curl -s -X POST "http://localhost:5002/tts" \
  -H "Content-Type: application/json" \
  -d '{"text":"<tóm tắt ngắn từng tin>","voice":"vi-VN-HoaiMyNeural","rate":"+0%"}' \
  -o /tmp/news_1.mp3 -w "%{http_code}" -s

# Ghép các file
echo "file '/tmp/news_1.mp3'" > /tmp/concat.txt
echo "file '/tmp/news_2.mp3'" >> /tmp/concat.txt
ffmpeg -f concat -safe 0 -i /tmp/concat.txt -c copy /tmp/news_final.mp3 -y

# Phát
afplay /tmp/news_final.mp3
```

- Giọng: `vi-VN-HoaiMyNeural` (Hoài My) — giọng nữ tự nhiên
- Phát bằng `afplay`
- Mỗi tin tóm tắt ~20-40 từ, không đọc URL
- **Không dùng Python `execute_code` để gọi TTS** — sandbox không thể kết nối tới localhost:5002 (lỗi HTTP 500), trong khi `bash` + `curl` hoạt động bình thường.

⚠️ **afplay timeout cho audio dài**: Nếu file tổng >60 giây phát, chạy `afplay` background:
```bash
bash(background=true, command="afplay /tmp/news_final.mp3")
```

## Execution Modes
## Execution Modes

#### Cron job (tự động) ⚠️

Cron chạy skill này lúc 8:00 sáng mỗi ngày (`0 8 * * *`).

**⚠️ CẠM BẢY CRITICAL — `cronjob(action=run)` KHÔNG tự spawn agent con!**

- `cronjob(action=run, job_id=...)` chỉ **đánh dấu job đã chạy trong DB**, KHÔNG tự động spawn agent con để thực thi skill.
- Nếu user yêu cầu nghe tin tức → **CẦN CHẠY THỦ CÔNG** các bước: fetch VnExpress → so sánh cache → đọc TTS.
- Cache cập nhật sau mỗi lần read để lần sau không lặp tin cũ.

**Cách hoạt động thực tế**:
1. Cron tick (scheduler) pick job lên → call `cronjob(action=run, job_id=...)`
2. DB mark → `last_status` = "running" → xong ngay
3. Agent **không spawn** → skill content không thực thi → user không nghe tin

**Fix**: Nếu user muốn nghe tin tức RIGHT NOW → trigger thủ công qua chat hoặc thiết lập cron với prompt rõ ràng hơn.
- Cron sử dụng `cronjob(action=run, job_id=...)` để trigger.

---

## Tin Mới vs Cache: Detection Pattern

### ✅ Workflow Xác Định Tin Mới:

**Bước 1:** Fetch toàn bộ headlines từ VnExpress (`get_vnexpress_news` hoặc `web_extract`)

**Bước 2:** Đọc cache cũ:
- Path bắt buộc: `/Users/nguyenhat/HAgent/backend/data/news_cache.json`
- ⚠️ **PITFALL**: Không dùng relative path `backend/data/news_cache.json`. Khi agent chạy với cwd `/Users/nguyenhat/HAgent/backend`, path đó sẽ tạo sai `/Users/nguyenhat/HAgent/backend/backend/data/news_cache.json`.

**Bước 3:** So sánh URLs:
- Lấy `urls` array từ cache cũ
- Lọc tin mới = tin có URL trong danh sách fetch **nhưng KHÔNG có trong cache.urls**
- Lần đầu tiên (cache chưa tồn tại): xem TẤT CẢ là tin mới

**Bước 4:** Chọn 3-5 tin nổi bật nhất để báo cáo (ưu tiên: quốc tế, thời tiết, tai nạn/ẩn kiến)

**Bước 5:** Cập nhật cache với timestamps mới (`last_check` = hiện tại) và URLs mới

---

## TTS Troubleshooting & Output Strategy

### ⚠️ Lỗi HTTP 500 Phổ Biến:

**Triệu chứng**: TTS trả về `{"output": "500"}` khi gọi curl tới `http://localhost:5002/tts`

**Nguyên nhân thường gặp**:
1. **Text quá dài** (>80 từ) hoặc chứa cụm nhạy cảm ("thẻ xanh", "Mỹ", "yếu tố con người")
2. TTS server Edge trên Mac Mini bị overheat/overload
3. Service không chạy hoặc đang restart

---

### ✅ Chiến Lược Xử Lý An Toàn:

**Pattern**: **Chia nhỏ từng tin → gọi riêng biệt → retry ngắn → skip nếu vẫn lỗi**

```bash
# 1. Gọi TTS cho từng TIN RIÊNG (text ~20-40 từ, timeout 30s)
curl -s -X POST "http://localhost:5002/tts" \
  -H "Content-Type: application/json" \
  -d '{"text":"<tóm tắt ngắn từng tin>","voice":"vi-VN-HoaiMyNeural","rate":"+0%"}' \
  -o /tmp/news_1.mp3 -w "%{http_code}" -s

# 2. Nếu HTTP code là 500:
#    → retry với text rút ngắn xuống còn 15-20 từ (nếu vẫn lỗi mới skip)

# 3. Ghép audio files bằng ffmpeg concat
echo "file '/tmp/news_1.mp3'" > /tmp/concat.txt
echo "file '/tmp/news_2.mp3'" >> /tmp/concat.txt
ffmpeg -f concat -safe 0 -i /tmp/concat.txt -c copy /tmp/news_final.mp3 -y

# 4. Phát audio (background nếu >60s):
bash(background=true, command="afplay /tmp/news_final.mp3")
```

---

### 🔄 Retry Text Truncation Pattern:

**Khi TTS trả về HTTP 500**:
- **Lần 1**: Text ~20-40 từ (tóm tắt đầy đủ tin)
- **Lần 2**: Rút ngắn xuống còn 15-20 từ, giữ lại CẤU TRÚC CHÍNH (subject + key fact)
- **Lần 3**: Nếu vẫn 500 → bỏ qua tin, ghi chú cho user

**Ví dụ rút ngắn**:
```
# Original (45 từ):
"Đức thất bại trước Áo và Bồ Đào Nha khi tranh cử ghế ủy viên không thường trực Hội đồng Bảo an Liên Hợp Quốc, có thể do Berlin ủng hộ Israel và Ukraine."

# Retry 1 (20 từ - giữ cấu trúc chính):
"Đức tranh cử HĐBA LHQ thất bại."

# Retry 2 (15 từ - nếu vẫn lỗi):
"Đức thua cuộc tranh cử."
```

**⚠️ CRITICAL**: Nếu chứa cụm "**Hội đồng Bảo an**" (5 từ), "Mỹ" (trong câu dài), "thẻ xanh" → text ngắn xuống còn **8-10 từ** ngay lần đầu (KHÔNG được 15-20 như với các từ khác).

**Pattern rút ngắn AN TOÀN NHẤT**:
- Với "Hội đồng Bảo an": chỉ giữ lại 8-10 từ, ví dụ: `"Đức thua tranh cử HĐBA LHQ"` (THAY vì `"Đức thua cuộc tranh cử."`)
- Cụm này gây lỗi HTTP 500 **ngay cả với text rất ngắn** → phải báo cho user biết rõ tin vẫn có trên VNExpress

---

### 📋 Error Reporting Pattern:

**Báo cáo tin lỗi TTS cho user**:
- ✅ **Bao gồm** trong danh sách tin mới (để user biết tin vẫn có ở VNExpress)
- ⚠️ **Ghi chú rõ ràng**: *(TTS lỗi - bỏ qua do chứa từ nhạy cảm)*
- ❌ **Không ẩn tin đi** → giữ nguyên số lượng tin báo cáo

**Template error note**:
```markdown
*[Tin bị lỗi]*  https://vnexpress.net/duc-that-bai-cay-dang-khi-tranh-cu-ghe-hoi-dong-bao-an-lhq-5081792.html  
*(TTS lỗi - từ "Hội đồng Bảo an" gây issue, em đã bỏ qua)*
```


---

### 🧪 Test & Output Verification Pattern

**TRƯỚC KHI BÁO CÁO** (kiểm tra workflow):

```bash
# 1. Fetch tin mới từ VnExpress
get_vnexpress_news

# 2. Đọc cache cũ bằng PATH TUYỆT ĐỐI (KHÔNG DÙNG RELATIVE PATH!)
cat /Users/nguyenhat/HAgent/backend/data/news_cache.json

# 3. So sánh URLs và chọn TOP 3-5 tin nổi bật nhất
#    - Ưu tiên: quốc tế, kinh tế, thời sự, công nghệ
#    - Lọc bỏ tin đã có trong cache.urls array

# 4. Gọi TTS cho từng tin RIÊNG (text ngắn ~20-40 từ)
curl -s -X POST "http://localhost:5002/tts" \
  -H "Content-Type: application/json" \
### 🧪 Test & Output Verification Pattern

**TRƯỚC KHI BÁO CÁO** (kiểm tra workflow):
- Fetch tin mới từ VnExpress (`get_vnexpress_news` hoặc `web_extract`)
- Đọc cache cũ bằng PATH TUYỆT ĐỐI `/Users/nguyenhat/HAgent/backend/data/news_cache.json`
- So sánh URLs và chọn TOP 3-5 tin nổi bật nhất (ưu tiên: quốc tế, kinh tế, thời sự, công nghệ)
- Gọi TTS cho từng tin RIÊNG (text ngắn ~20-40 từ, timeout 30s mỗi lần)
- Ghép audio bằng ffmpeg concat với file naming chuẩn `tmp/<topic>.mp3`
- Phát audio (background nếu >60s: `bash(background=true, command="afplay /tmp/news_final.mp3")`)

**OUTPUT FORMAT FLEXIBLE**: Không bắt buộc phải dùng template cứng nhắc. Em có thể:
- ✅ Báo cáo ngắn gọn (nếu user muốn nhanh)
- ✅ Báo cáo chi tiết với emoji và format đẹp (như session này)
- ✅ Chỉ gửi tin nổi bật nhất (TOP 1-2 tin quan trọng nhất)

**💡 LƯU Ý**: Luôn kết thúc báo cáo bằng lời mời tiếp tục! 🌱

**Chào hỏi**: Mở đầu bằng **lời chào tự nhiên theo giờ**:
- 6h-12h: "Sáng hôm nay..." hoặc "Chào buổi sáng!"
- 12h-17h: "Trưa rồi, anh Hạt nghe nè..."  
- 17h-23h: "Chiều nay..." hoặc "Tối nay..."
- 23h-6h: "Chào buổi tối/đêm khuya..."

**❌ CẤM**: Bắt đầu bằng "Chào buổi sáng" cứng nhắc, không phân tích dài dòng trước khi báo cáo.

---

### 📋 Session Log: TTS Patterns from 09/06/2026 (Embedded Reference)

#### Tin 1: Israel-Iran Conflict (Trump involvement)
- **Original:** `"Trump thuyết phục Netanyahu hủy tấn công Iran sau lời khuyên của Tổng thống."` ❌ (500 - chứa "Trump")
- **Retry 1 (remove name):** `"Netanyahu hủy tấn công Iran sau lời khuyên của Tổng thống."` ✅ (20 từ)

#### Tin 2: US UAV Rescue Near Hormuz
- **Original:** `"Mỹ dùng xuồng không người lái giải cứu phi công trực thăng rơi gần Hormuz."` ❌ (500 - "Mỹ" trong câu dài)
- **Retry 1 (replace + shorten):** `"Quân Hoa Kỳ dùng xuồng không người lái cứu phi công trực thăng rơi gần Hormuz."` ✅ (18 từ - "Hoa Kỳ")

#### Tin 3: Chành Cua Fraud [TP HCM]
- **Original:** `"Bà chủ Chành cua bị cáo buộc dàn cảnh tai nạn ép phí, hưởng lợi 40 tỷ."` ✅ (20 từ)

#### Tin 4: Fire in TP HCM House
- **Original:** `"Cháy nhà ở TP HCM, cụ bà 76 tuổi tử vong."` ✅ (13 từ - rất ngắn an toàn!)

#### Tin 5: Mourinho at Real Madrid
- **Original (too long):** `"Jose Mourinho bắt đầu nhiệm vụ xây dựng lực lượng tại Real Madrid."` ❌ (500)
- **Retry 1 (shorten):** `"Jose Mourinho trở lại Real với nhiệm vụ xây dựng lực lượng."` ✅ (15 từ)

---

### 📝 Summary Word Count Limits by Topic

| Chủ đề | Range an toàn | Max tuyệt đối |
|--------|---------------|---------------|
| Xã hội/Kinh tế | 25-35 từ | 40 từ |
| Chiến tranh/Quân sự | 15-25 từ | 30 từ |
| Pháp luật/Công nghệ | 20-30 từ | 35 từ |
| Quốc tế/An ninh biển | 18-28 từ | 32 từ |
| Thể thao | 15-22 từ | 26 từ |
| Công nghệ/AI | 22-32 từ | 38 từ |

---

### 🔍 Best Practices Summary for Future Sessions

1. **LUÔN** bắt đầu với text ngắn nhất có thể (~15-20 từ cho tin nhạy cảm, ~20-30 từ cho tin thông thường)
2. **THAY THẾ NGAY** các cụm high-risk ở bước đầu tiên (không đợi retry lần sau)
3. **LUÔN** dùng file naming `tmp/<topic>.mp3` (có gạch ngang) cho ffmpeg concat
4. Nếu text > 35 từ: Tự động rút xuống còn max 28-30 từ trước khi gọi TTS
5. Với cụm "Hội đồng Bảo an": Chỉ mention nếu MUST có và giữ dưới 10 từ

**References**: Xem `tin-tuc/references/vnexpress-tts-error-phrases.md` cho đầy đủ chi tiết các cụm từ gây lỗi, retry strategies, và session logs! 📚

---
```
[Chào theo giờ] 🌱

📰 Tin mới cập nhật hôm nay:

1. [Tiêu đề](url) - Tóm tắt ngắn gọn...
2. [Tiêu đề](url) - Tóm tắt ngắn gọn...
...

🔍 Tóm tắt nhanh:
✅ Đã fetch: X tin từ VnExpress
✅ Tin mới: Y tin chưa từng báo
✅ Cache update: ✅ Đã ghi đè timestamps mới

💡 Lưu ý: TTS hiện đang [trạng thái]...
[Giải pháp đề xuất nếu cần]
```

**❌ CẤM**: Bắt đầu bằng "Chào buổi sáng" cứng nhắc, không phân tích dài dòng trước khi báo cáo.

---

### 🚨 Pitfall: Không Báo "[SILENT]" Khi Có Tin Mới!

- Nếu có tin mới → **Báo đầy đủ như bình thường**
- Chỉ dùng `[SILENT]` khi thực sự KHÔNG CÓ TIN MỚI nào so với cache (ví dụ chạy 2 lần liên tiếp cùng 10 tin)
- **NEVER**: "[SILENT]" kết hợp với content — phải chọn MỘT trong hai

---

### 📋 Checklist Trước Khi Báo Cáo:

- [ ] Đã fetch tin từ VnExpress thành công
- [ ] Đã so sánh URLs với cache cũ
- [ ] Đã xác định đúng tin mới (không lặp)
- [ ] Đã cập nhật cache với timestamp mới nhất
- [ ] Đã chọn 3-5 tin nổi bật nhất
- [ ] TTS server đang hoạt động hoặc đã ghi chú trạng thái
- [ ] Output có chào tự nhiên theo giờ
- [ ] Không dùng "[SILENT]" khi có tin

- Cron sử dụng `cronjob(action=run, job_id=...)` để trigger.

### Thủ công
Khi user yêu cầu "chưa nghe tin tức" hoặc tương tự:
1. Dùng `get_vnexpress_news` hoặc `web_extract` trên `https://vnexpress.net/` để lấy tin mới
2. Đọc cache cũ bằng path tuyệt đối `/Users/nguyenhat/HAgent/backend/data/news_cache.json`.

   - Ghi vào file ở `/Users/nguyenhat/HAgent/backend/data/news_cache.json`
   - Format: `{"last_check": "<ISO datetime>", "urls": [tất cả URLs cũ + mới]}`
5. Chọn 3-5 tin nổi bật nhất, viết tóm tắt ngắn gọn
6. Đọc qua TTS server (Hoài My) — luôn dùng `bash` + `curl` (không dùng Python urllib, xem pitfall). Mỗi tin gọi curl riêng, text ngắn ~20-40 từ
7. Báo cáo lại cho user danh sách tin đã đọc

## Pitfalls
- **TTS server 500 với một số cụm từ**: Server Edge TTS trên macmini đôi khi trả 500 với text có chứa "thẻ xanh", "Mỹ", "yếu tố con người" trong câu dài hoặc text >80 từ. Giải pháp: chia nhỏ từng tin gọi riêng. Nếu tin nào lỗi → **thử rút ngắn text xuống còn 15-20 từ và gọi lại trước** trước khi bỏ qua. Chỉ bỏ qua nếu retry vẫn 500.
- **Python sandbox không gọi được localhost:5002**: `execute_code` (sandbox Python) không thể kết nối tới TTS server — bị HTTP 500. Luôn dùng `bash` + `curl` để gọi TTS, không dùng `urllib` trong `execute_code`.
- **Cron không tự chạy skill**: `cronjob(action=run)` không thực thi nội dung skill. Luôn cần chạy thủ công các bước nếu user muốn nghe ngay.
- **Lần chạy đầu tiên (cache chưa tồn tại)**: `/Users/nguyenhat/HAgent/backend/data/news_cache.json` trả về file rỗng 0 byte hoặc "file not found". Cần tự tạo cache mới với `last_check` và đầy đủ URLs. Tất cả tin fetch về đều là "mới".
- **get_vnexpress_news không có sẵn filter**: Tool này trả về toàn bộ headlines. Agent phải tự so sánh với cache URLs để xác định tin mới. Không có cơ chế "chỉ lấy tin mới" built-in.
- **afplay timeout với audio dài**: File TTS cho 5 tin (~1100 chữ) mất >60 giây để phát. Không chạy `afplay` inline với `subprocess.run(..., timeout=60)` — sẽ bị timeout. Thay vào đó: (1) sinh audio bằng Python `urllib` trong `execute_code` timeout 180s, (2) phát bằng `bash(background=true, command="afplay /tmp/news_tin.mp3")`.
- **Cấm tạo cache sai chỗ**: Không đọc/ghi `backend/data/news_cache.json` dưới dạng relative path; tuyệt đối không tạo `/Users/nguyenhat/HAgent/backend/backend/data/`.
- **ffmpeg concat**: File âm thanh phải cùng codec/format để concat được.
- **Provider pinning quyết định job sống hay chết**: Nếu khi tạo cron job bạn set `provider` thành một custom/local provider (ví dụ `pekpik` = LM Studio) mà không có API key, hoặc server backend đó đang down, scheduler sẽ fail ngay từ bước `resolve_runtime_provider` — agent không bao giờ được khởi tạo, không fetch tin, không gọi TTS. `last_status` sẽ là `error` với lỗi "no API key found". **Luôn dùng provider có API key thật (deepseek, anthropic, groq...) cho cron job.** Nếu muốn dùng model local, cài API key placeholder trong config của custom provider đó.
- **Cron lỗi nhưng không có log âm thanh**: Nếu `last_status` là `error` và không nghe được TTS, kiểm tra: `cronjob(action='list')` → xem `last_status`/`last_run_at` → update provider nếu cần.

## Cross-Tab References

**Tab Giải Trí (Manga/Truyện)**: Xem skill [`tab-giatri`](../hagent/tab-giatri) cho API import/truyen Crawling từ sitruyencv.com.

**References**:\n- `references/vnexpress-tts-error-phrases.md` - Chi tiết các cụm từ gây lỗi TTS (Trump, Mỹ, Hội đồng Bảo an, thẻ xanh), retry strategies, và word count limits per topic\n\n## Lưu ý\n- Chỉ báo tin mới, không lặp lại tin cũ
