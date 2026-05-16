---
name: cron-jobs
description: "Tạo và quản lý các tác vụ định kỳ (cron jobs) trong HAgent. Sử dụng skill này khi người dùng muốn: tự động hoá công việc lặp lại, đặt lịch nhắc nhở, kiểm tra định kỳ, theo dõi thông tin theo thời gian, chạy script theo lịch. KHÔNG dùng skill này khi người dùng chỉ hỏi về cron schedule thông thường."
---

# Cron Jobs — Tự động hoá tác vụ định kỳ

Skill này hướng dẫn cách sử dụng tool `cronjob` để tạo và quản lý các tác vụ chạy tự động theo lịch trong HAgent.

## Khi nào nên dùng cron job

- **Theo dõi/giam sát định kỳ**: Check API, kiểm tra giá coin, theo dõi tin tức mỗi giờ/ngày
- **Nhắc nhở**: Deadline, lịch họp, việc cần làm theo ngày
- **Tự động hoá workflow**: Backup, sync dữ liệu, gửi báo cáo mỗi sáng
- **Cào dữ liệu**: Crawl web, lấy thông tin theo lịch
- **Chạy script**: Gọi script shell/python định kỳ

**KHÔNG dùng cron job cho**:
- Việc cần chạy ngay một lần → dùng tool thông thường
- Việc cần tương tác realtime → dùng tool tương ứng
- Việc chạy xong là xong, không cần lặp → chạy trực tiếp

## Cách tạo cron job

Dùng tool `cronjob` với action `"create"`:

```
cronjob("create", {
  "prompt": "Nội dung công việc cần làm",
  "schedule": "every 1h",
  "name": "Tên job",
  "deliver": "origin"
})
```

### Các tham số

| Tham số | Bắt buộc | Mô tả |
|---------|----------|-------|
| `prompt` | ✅ | Nội dung công việc — prompt cho agent khi job chạy |
| `schedule` | ✅ | Lịch chạy (xem bên dưới) |
| `name` | ❌ | Tên hiển thị — nên đặt để dễ quản lý |
| `deliver` | ❌ | Nơi gửi kết quả: `"origin"` (mặc định), `"local"`, `"telegram"`, `"all"` |
| `skills` | ❌ | List skill cần load khi chạy job |
| `model` | ❌ | Model override cho job này |
| `provider` | ❌ | Provider override |
| `workdir` | ❌ | Thư mục làm việc |
| `no_agent` | ❌ | `true` = chỉ chạy script, không dùng LLM |
| `repeat` | ❌ | Số lần chạy (mặc định `None` = vô hạn) |

### Định dạng schedule

| Ví dụ | Kiểu | Ý nghĩa |
|-------|------|---------|
| `"30m"` | once | Chạy 1 lần sau 30 phút |
| `"2h"` | once | Chạy 1 lần sau 2 giờ |
| `"1d"` | once | Chạy 1 lần sau 1 ngày |
| `"2026-05-20T09:00"` | once | Chạy 1 lần vào thời điểm đó |
| `"every 30m"` | interval | Lặp mỗi 30 phút |
| `"every 2h"` | interval | Lặp mỗi 2 giờ |
| `"0 9 * * *"` | cron | Chạy lúc 9h sáng mỗi ngày |
| `"*/30 * * * *"` | cron | Chạy mỗi 30 phút |
| `"0 9 * * 1-5"` | cron | Chạy 9h sáng thứ 2-6 |

## Nguyên tắc khi viết prompt

Khi agent chạy cron job, nó sẽ thực thi các lệnh bash. **Prompt phải hướng dẫn agent làm đúng trình tự:**

1. **Chạy lệnh bash** để lấy dữ liệu / thực thi hành động
2. **Đợi kết quả** từ lệnh (không đoán, không suy luận thay thế)
3. **Đọc và phân tích** kết quả nhận được
4. **Báo cáo cho người dùng** dựa trên kết quả thực tế
5. Nếu cần bước tiếp theo: dùng kết quả vừa lấy để quyết định

**Không được**: tự suy luận kết quả thay vì chạy lệnh, hoặc kết luận trước khi có kết quả thực tế.

## Giao thức [SILENT]

Khi prompt của job kết thúc với `[SILENT]`, hệ thống sẽ **KHÔNG gửi thông báo** cho người dùng. Chỉ gửi thông báo khi có thay đổi thực sự quan trọng.

Ví dụ:
```
cronjob("create", {
  "name": "Theo dõi thời tiết",
  "schedule": "0 7 * * *",
  "prompt": "Kiểm tra thời tiết HCM city hôm nay.
  Nếu có mưa: báo với user chuẩn bị áo mưa.
  Nếu không mưa: [SILENT]"
})
```

## Các thao tác quản lý

### Xem danh sách job
```
cronjob("list")
```

### Xem chi tiết job
```
cronjob("view", {"job_id": "..."})
```

### Cập nhật job
```
cronjob("update", {
  "job_id": "...",
  "schedule": "0 9 * * *",
  "prompt": "nội dung mới"
})
```

### Xoá job
```
cronjob("delete", {"job_id": "..."})
```

### Tạm dừng / Tiếp tục
```
cronjob("pause", {"job_id": "..."})
cronjob("resume", {"job_id": "..."})
```

### Chạy ngay (không đợi lịch)
```
cronjob("trigger", {"job_id": "..."})
```

## Các mẫu hay dùng

### 1. Báo cáo hàng ngày
```
cronjob("create", {
  "name": "Báo cáo sáng",
  "schedule": "0 8 * * *",
  "deliver": "telegram",
  "prompt": "Tổng hợp: thời tiết hôm nay, 1 tin tức công nghệ nổi bật, lịch hôm nay."
})
```

### 2. Theo dõi giá coin
```
cronjob("create", {
  "name": "Giá Bitcoin",
  "schedule": "every 1h",
  "deliver": "origin",
  "prompt": "Kiểm tra giá BTC hiện tại. Nếu biến động >5% so với giá 24h trước: báo cáo chi tiết. Nếu không: [SILENT]"
})
```

### 3. Nhắc nhở deadline
```
cronjob("create", {
  "name": "Nhắc nộp báo cáo",
  "schedule": "0 9 * * 1-5",
  "prompt": "Kiểm tra deadline dự án. Nếu còn <3 ngày: nhắc user. Nếu còn >3 ngày: [SILENT]"
})
```

### 4. Script-only job (không dùng LLM)
```
cronjob("create", {
  "name": "Backup DB",
  "schedule": "0 2 * * *",
  "no_agent": true,
  "prompt": "/Users/nguyenhat/HAgent/scripts/backup.sh",
  "deliver": "local"
})
```

## Lưu ý quan trọng

- **Không tạo job trùng lặp**: Kiểm tra `cronjob("list")` trước khi tạo job mới
- **Đặt tên job rõ ràng**: Giúp dễ tìm và quản lý sau này
- **Dùng [SILENT] hợp lý**: Tránh spam — chỉ gửi thông báo khi có thông tin quan trọng
- **Kiểm tra trước**: Sau khi tạo, dùng `cronjob("list")` để xác nhận job đã được tạo
- **Chọn schedule phù hợp**: Không đặt interval quá dày nếu không cần thiết
