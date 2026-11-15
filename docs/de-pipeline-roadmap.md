# Đường đến pipeline dữ liệu pilot

Trạng thái: **kế hoạch triển khai, chưa phải pipeline đã chạy**. Phạm vi tham chiếu là pilot-v1 Site01/Site04. Có thể thay đổi site và kịch bản bằng config version mới; dữ liệu và kết quả phải giữ nguồn gốc.

## Ba chặng để có pipeline DE pilot cho dữ liệu đầu vào

### 1. Chốt hợp đồng đầu vào/đầu ra và manifest

- Từ `config/pilot-v1.json`, chốt site/point hay ROI, khung địa hình, sản phẩm/version, cadence/time và thư mục lưu. Phân biệt preview 2,5 km với ROI và miền horizon.
- Mỗi raster asset cần URL, biến, đơn vị, CRS/frame, datum đứng, pixel scale/effective resolution nếu có, footprint, nodata/mask, scale/offset, phiên bản, timestamp, checksum và trạng thái; Horizon response cần query/header/time scale/observer/target.
- Chọn định dạng và schema bàn giao với người tiêu thụ. Unknown phải có trạng thái và lý do, không điền 0. Lưu dự toán kích thước và ước lượng cache/output.
- **Xong khi:** cấu hình và mẫu schema/manifest được nhóm kỹ thuật review; các trường chưa được xác minh có giá trị `null`/status, không giả là dữ liệu thực.

### 2. Làm pipeline thu nhận và chuẩn hóa có thể chạy lại

- Tách bước đọc nguồn, kiểm fingerprint/version, cắt vùng đã chọn, chuẩn hóa, kiểm tra mask/units/frame và ghi output theo config. Lưu raw cache tách với output; tránh commit raster vào Git.
- Đọc theo vùng có giới hạn, timeout/retry phù hợp và ghi nhận thay đổi nguồn. Idempotent theo config version + source identity; dùng ghi tạm và atomic rename để không coi output dở là thành công.
- Horizons chỉ tạo chuỗi có altitude/observer đủ bằng chứng; có thể dựng/test đường đi dữ liệu với fixture đã gắn nhãn hoặc trạng thái unavailable trong lúc datum chưa xác nhận.
- **Xong khi:** một lệnh cho hai site pilot tạo được catalog, các vùng raster được duyệt, metadata và ephemeris hợp lệ hoặc trạng thái thiếu có lý do; chạy lại không nhân bản hoặc âm thầm đổi nguồn.

### 3. Kiểm tra và bàn giao

- Kiểm lỗi missing/nodata khác 0, CRS/đơn vị, coverage, timestamp đóng–mở, source hash/version, zero observations, idempotency và một reference case độc lập phù hợp. Có smoke run hai site và một trường hợp thiếu dữ liệu.
- Ghi hướng dẫn chạy từ môi trường sạch, dependency/version, output paths/schema, example request, logs và giới hạn. Người nhận kiểm tra một lần trên máy khác hoặc môi trường độc lập.
- **Xong khi:** có run có thể tái lập, manifest và tiêu chí kiểm tra pass cho phạm vi đã chốt, cùng bàn giao cho người làm ứng dụng.

## Những việc khoa học đi song song

Một pipeline ingestion có thể được xây dựng trước khi horizon được xác minh. Để pipeline **xuất kết quả horizon/visibility dùng được về mặt khoa học**, còn cần:

- Đối chiếu trực tiếp datum đứng PGDA 78 và observer altitude Horizons; xác minh frame ROI/raster và góc bắc địa phương.
- Xác nhận cách chọn observer, 5 m/80 m overlap, uncertainty và mask; 80 m area support không bằng effective resolution.
- Định nghĩa reference độc lập, tolerance/use case; mở rộng phạm vi có giới hạn khi bin cực đại còn gần biên, đo hội tụ, kiểm tra near-field và xử lý nodata.
- Chốt geometric/apparent, event timing và so sánh các kết quả với benchmark. Không biến histogram/solar azimuth thành bằng chứng visibility khi horizon chưa validated.

Không thể suy ra ngày hoàn thành chỉ từ số chặng: thời gian phụ thuộc người làm, kết quả review và nguồn datum/reference. Quyết định phạm vi lấy dữ liệu và budget phải được ghi trước khi chuyển từ khảo sát cửa sổ nhỏ sang thu nhận bộ pilot.
