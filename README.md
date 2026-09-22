# Xteink Sync — plugin Obsidian

Gửi note Obsidian sang máy đọc sách Xteink X3/X4 chạy firmware CrossPoint, dưới dạng EPUB, qua WiFi. Không cần pandoc, không cần server, chạy cả trên điện thoại.

## Hai chế độ

1. **Gửi tay** — chuột phải note/thư mục → *Gửi sang Xteink*, hoặc lệnh *Gửi note đang mở sang Xteink*. Máy chưa bật File Transfer thì EPUB nằm chờ trong hộp thư (`.obsidian/plugins/xteink-sync/outbox`), sau chạy *Gửi hộp thư*.
2. **Bấm một cái** — icon 📖 trên thanh bên hoặc lệnh *Đồng bộ thư mục/tag sang Xteink*: gửi note mới/đã sửa trong các thư mục hoặc tag đã chọn; tùy chọn xóa trên máy note đã ra khỏi phạm vi.

Tùy chọn **Giữ cây thư mục của vault**: note ở `03 - Resources/Books` lên máy thành `/Obsidian/03-Resources/Books/` (từng cấp bỏ dấu). Máy sắp thư mục trước rồi tên tự nhiên, không có sắp theo ngày.

Máy phải đang ở **File Transfer → Join Network** (cùng WiFi với máy tính). Plugin tìm máy qua `crosspoint.local`, rồi IP nhớ lần trước.

## Chuyển đổi

Dùng chính bộ hiển thị Markdown của Obsidian nên callout, bảng, wikilink, nhúng note ra đúng như chế độ đọc. Ảnh được thu nhỏ cho màn e-ink và luôn nén lại thành JPEG baseline (CrossPoint không hiện JPEG progressive/GIF). Mermaid và toán khối giữ lại dạng mã nguồn (máy không vẽ được).

## Phát triển

```bash
npm install
npm test            # unit test (không cần Obsidian)
npm run build       # main.js
npm run install-vault [đường dẫn vault]   # chép vào vault + bật trong community-plugins.json
```

Endpoint của máy: `docs/webserver-endpoints.md` trong repo [crosspoint-reader](https://github.com/crosspoint-reader/crosspoint-reader).
