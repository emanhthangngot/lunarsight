# LunarSight

## Khám phá địa điểm hạ cánh và lập kế hoạch nhiệm vụ Mặt Trăng

**LunarSight** kết nối tọa độ, cấu hình nhiệm vụ và bằng chứng từ dữ liệu thật để hỗ trợ khám phá, sàng lọc và so sánh địa điểm trên Mặt Trăng.

Tên dự án giữ sự nhất quán với proposal của nhóm: **Lunar** là Mặt Trăng, **Sight** gợi việc quan sát và hiểu điều kiện tại một địa điểm.

## Trạng thái hiện tại

- Đã chuẩn bị riêng bộ dữ liệu thật cho **6 tọa độ**, với **41 raster**, **219.318 dòng hình học theo thời gian** và **150 kịch bản mẫu**.
- Repo chứa tài liệu, bảng mẫu nhỏ, mã xử lý của bộ dữ liệu hiện có và kế hoạch phát triển.
- Bộ nguồn mở rộng khoảng **56,2 GB** là cấu hình thu thập đã khảo sát; chưa được tải, chuẩn hóa và kiểm chứng đầy đủ.
- Ứng dụng web tích hợp và khả năng xử lý mọi tọa độ trên toàn vùng là các hạng mục tiếp theo.

## Phạm vi phát triển

| Phạm vi | Mục đích |
| --- | --- |
| 0–90°S | Bản đồ nền và bối cảnh toàn bán cầu Nam |
| 60–90°S | Sàng lọc khu vực và chất lượng địa hình |
| 80–90°S | Phân tích chi tiết hơn ở cực Nam |

Mỗi lớp giữ độ phân giải, phạm vi quan trắc và độ bất định riêng. Không đổi dữ liệu thiếu thành 0, không dùng số demo làm dữ liệu khoa học, và không đổi hydrogen thành phần trăm băng nước.

## Đọc theo thứ tự

1. [README chính](README.md): mục tiêu, cấu trúc repo và cách bắt đầu.
2. [Nguồn dữ liệu](docs/data-sources.md): kho dữ liệu chính thức, định nghĩa và phạm vi.
3. [Quy ước tích hợp](docs/integration-contract.md): hệ tọa độ Mặt Trăng, đơn vị, cách nối và hiển thị kết quả.
4. [Roadmap](docs/roadmap.md): các giai đoạn và điều kiện hoàn thành.
5. [Pipeline tham chiếu](pipelines/site_pack_v1/README.md): mã xử lý cho bộ 6 địa điểm.

## Bắt đầu nhanh

```bash
git clone https://github.com/emanhthangngot/lunarsight.git
cd lunarsight
python3 pipelines/site_pack_v1/scripts/prepare_catalog.py --inputs-only
```

Lệnh cuối tạo catalog đầu vào bằng thư viện chuẩn Python, không tải các raster lớn. Các kết quả sinh ra được loại khỏi Git bằng `.gitignore`.

Gói dữ liệu đầy đủ và các file nguồn lớn được quản lý riêng. Tài liệu [trạng thái v1](docs/data-pack-v1-readiness.md) mô tả bộ dữ liệu đã chuẩn bị; các đường dẫn trong tài liệu đó thuộc thư mục gói đã giải nén.

**Lưu ý catalog:** nhãn “Faustini” của điểm C chưa khớp tọa độ; repo giữ tọa độ gốc và ghi rõ vấn đề. Kết quả hiện tại phục vụ sàng lọc và nghiên cứu, chưa phải đánh giá an toàn hạ cánh được chứng nhận.
