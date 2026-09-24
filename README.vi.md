# Xteink Sync (tiếng Việt)

Gửi note Obsidian sang máy đọc sách **Xteink X3/X4** chạy firmware **CrossPoint**, dưới dạng EPUB. Không cần pandoc, chạy cả trên máy tính lẫn điện thoại. Giao diện tự chuyển tiếng Việt khi Obsidian đang dùng tiếng Việt.

[English](README.md)

## Hai nơi nhận

| | Máy đọc qua WiFi | Kệ Xteink Lover |
| :--- | :--- | :--- |
| Cách chạy | Đẩy thẳng EPUB vào máy | Gửi lên kệ online, máy tự kéo về qua OPDS |
| Cần | Máy ở **File Transfer → Join Network**, cùng mạng | Tài khoản miễn phí ở [Xteink Lover](https://app.xteinklover.workers.dev) (hoặc bản tự cài) và mã ứng dụng |
| Gửi từ bất cứ đâu | Không | Có, máy tắt cũng được |

Chọn trong **Cài đặt → Xteink Sync → Gửi tới**.

## Ba cách gửi

1. **Gửi tay**: chuột phải note hoặc thư mục → *Gửi sang Xteink*, hoặc lệnh *Gửi note đang mở*. Gửi vào máy mà máy chưa bật File Transfer thì EPUB nằm chờ trong hộp thư (`.obsidian/plugins/xteink-sync/outbox`), sau chạy *Gửi hộp thư đang chờ*.
2. **Bấm một cái**: icon trên thanh bên hoặc lệnh *Đồng bộ thư mục và tag*: gửi note mới hoặc đã sửa trong các thư mục và tag đã chọn. Tùy chọn xóa file của note đã ra khỏi phạm vi (chỉ xóa file plugin đã gửi).
3. **Tự gửi note mới**: bật *Tự gửi note mới*, note mới xuất hiện trong thư mục theo dõi sẽ được gửi sau vài giây. Mặc định là `Clippings`, nơi [Obsidian Web Clipper](https://obsidian.md/clipper) lưu bài, nên cắt bài trên trình duyệt là bài tự sang máy đọc. Note cũ và việc sửa note không bị gửi.

Phạm vi tính cả thư mục con. Note nằm ngoài các thư mục đã chọn chỉ được gửi nếu có tag đồng bộ.

Tùy chọn **Giữ cây thư mục của vault** (gửi vào máy): note ở `03 - Resources/Books` lên máy thành `/Obsidian/03-Resources/Books/`.

## Chuyển đổi

Dùng chính bộ hiển thị Markdown của Obsidian nên callout, bảng, nhúng note ra đúng như chế độ đọc. Ảnh được thu nhỏ cho màn e-ink và nén lại thành JPEG baseline (CrossPoint không hiện JPEG progressive/GIF). Mermaid và công thức toán giữ dạng mã nguồn (máy không vẽ được). Chú thích cuối trang vẫn bấm được.

## Nối kệ Xteink Lover

1. Đăng nhập https://app.xteinklover.workers.dev (mật khẩu hoặc Google).
2. **Tài khoản → Mã cho ứng dụng → Tạo mã**, copy mã.
3. Trong Obsidian: *Gửi tới* → *Kệ Xteink Lover*, dán mã, bấm *Thử ngay*.
4. Trên máy: thêm máy chủ OPDS theo hướng dẫn ở **⚡ Nối máy** trên web.

5. Tùy chọn, thay cho bước 4: bật máy ở **File Transfer → Join Network** rồi chạy **Nối máy đọc với kệ Xteink Lover** (hoặc nút *Nối máy đọc* trong cài đặt). Plugin tạo khóa OPDS mới và ghi server "Xteink Lover" vào máy qua WiFi (CrossPoint 1.6 trở lên), không phải gõ gì trên máy. Máy khác còn dùng khóa cũ thì phải cập nhật khóa mới.

Mã xem, gửi, xóa được sách trên kệ và tạo được khóa OPDS mới cho lệnh **Nối máy đọc**; không đổi được mật khẩu hay tài khoản, thu hồi trên web bất cứ lúc nào.

## Kết nối mạng

Plugin chỉ gọi mạng khi bạn gửi, đồng bộ, hoặc bấm *Thử ngay*:

- **Máy đọc qua WiFi**: HTTP thường tới máy trong mạng nhà (`crosspoint.local` hoặc IP đã đặt): `/api/status`, `/api/files`, `/upload`, `/mkdir`, `/delete`. CrossPoint không có mật khẩu, không mã hóa, nên chỉ dùng trong mạng tin cậy. `/delete` chỉ gọi cho file plugin đã gửi, khi bật *Xóa khi note ra khỏi phạm vi đồng bộ*.
- **Kệ Xteink Lover**: HTTPS tới máy chủ đã đặt (mặc định `https://app.xteinklover.workers.dev`) kèm mã ứng dụng. EPUB (nội dung note) được lưu trên máy chủ đó.
- **Ảnh từ web**: mặc định tắt. Bật *Tải ảnh từ web* thì ảnh là link `https://` trong note được tải về lúc chuyển (tối đa 10 MB mỗi ảnh); tắt thì thay bằng chú thích, không tải gì.

Không thu thập số liệu sử dụng. Cài đặt và lịch sử đồng bộ nằm trong `data.json` của plugin trong vault.

## Phát triển

```bash
npm install
npm test                                  # unit test, không cần Obsidian
npm run lint                              # luật duyệt plugin của Obsidian
npm run build                             # main.js
npm run install-vault -- <đường dẫn vault> # chép vào vault và bật
```
