# Bộ chuẩn bị để nhóm quyết định dữ liệu

Trạng thái: **đề xuất để review**, không phải quyết định chọn site hay tải bộ dữ liệu hoàn chỉnh. Người dùng đã yêu cầu chuẩn bị hình địa hình thực, bảng so sánh và đầu vào quyết định trước khi nhóm chốt. PR #1 và #2 đã được merge; bộ này là công việc tiếp theo trên branch riêng từ `main`.

## Mở gì trong buổi review

1. Mở [notebook địa hình thực](../notebooks/terrain-predecision-review.ipynb): xem bảng chất lượng mẫu, ba bảng hình so sánh và panel chi tiết. Output được nhúng để xem trên GitHub; không cần tải raster để đọc hình.
2. Dùng [notebook vị trí/ROI](../notebooks/candidate-site-visual-review.ipynb) để xem các vùng tương đối với cực Nam. Các số p95 cũ trong notebook đó chưa đủ bằng chứng tái lập, không dùng để chọn site/ngưỡng.
3. Điền bảng quyết định bên dưới và ghi người chịu trách nhiệm cho câu hỏi chưa giải quyết. Các lựa chọn đã thực sự thống nhất sẽ được ghi trong ADR mới.

Gợi ý buổi review 30 phút: 5 phút mục tiêu demo; 10 phút xem hình; 10 phút chọn danh sách cần khảo sát sâu và kịch bản; 5 phút giao người phụ trách. Thời lượng là đề xuất tổ chức buổi họp.

## Cách đọc hình và giới hạn

- Mỗi mẫu là 500×500 pixel native 5 m, tức 2,5×2,5 km quanh tâm Data Book; đọc thêm halo 1 pixel để tính đạo hàm. Đó là khung khảo sát, không phải footprint cuối cùng hay vùng hạ cánh.
- Hình độ cao tương đối trừ median riêng của từng khung, với cùng thang màu giữa các site. Bảng vẫn giữ cao độ tuyệt đối theo sản phẩm; các màu tương đối không so sánh cao độ tuyệt đối.
- Hillshade dùng góc chiếu sáng tổng hợp cố định. Hình này không cho biết có nắng trong nhiệm vụ, không thay thế ephemeris/chân trời, và không xác định PSR.
- Độ dốc là proxy tính bằng sai phân trung tâm trên DEM 5 m. Chưa đọc lớp slope/RMS/count chính thức; không xem proxy là độ dốc đã được chứng nhận cho hạ cánh.
- Mask/nodata hiển thị tách biệt; tỷ lệ pixel hợp lệ chỉ áp dụng cho khung mẫu. Pixel nội suy vẫn có thể hợp lệ: pixel scale không đồng nghĩa với effective resolution.
- Đường ROI lấy từ bốn archive đã kiểm tra, giản lược 10 m để hiển thị. Một số ROI bị cắt hoặc nằm ngoài khung (đặc biệt Site04); không suy ra rằng ROI không tồn tại từ hình zoom. ID và geometry gốc cần xác minh trước khi chọn điểm.
- Không xếp hạng site theo một chỉ số tổng hợp tự đặt. Địa hình, ánh sáng, độ tin cậy và mục tiêu demo cần được xem cùng nhau.

Nguồn: [PGDA 78](https://pgda.gsfc.nasa.gov/products/78) và [NASA Data Book 2025](https://ntrs.nasa.gov/api/citations/20250002845/downloads/M2M-30044%20Lunar%20Surface%20Data%20Book%20Baseline_Final.pdf). URL, thời gian truy cập, ETag, CRS, crop bounds, nodata, phép scale và checksum mảng mẫu được giữ trong [manifest bằng chứng](../notebooks/evidence/terrain-preview-manifest.json). Manifest mô tả mẫu khảo sát, không phải danh sách phê duyệt acquisition.

## Bảng so sánh mẫu

| Site | Pixel DEM hợp lệ trong mẫu | Min–max cao độ sản phẩm (m) | Tổng 5 file gốc (MB) | ROI |
| --- | --- | --- | ---: | --- |
| Site01 | 250,000/250,000 | 1555.6 đến 1959.5 | 204.9 | Có polygon; cần đối chiếu điểm được chọn |
| Site04 | 250,000/250,000 | -45.0 đến 1586.9 | 204.9 | Có polygon; cần đối chiếu điểm được chọn |
| Site06 | 250,000/250,000 | 5577.2 đến 6058.2 | 320.1 | Link đã liệt kê trả not-found |
| Site07 | 250,000/250,000 | 1241.4 đến 1648.7 | 204.9 | Có polygon; cần đối chiếu điểm được chọn |
| Site11 | 250,000/250,000 | 1406.9 đến 1816.0 | 204.9 | Có polygon; cần đối chiếu điểm được chọn |
| Site20 | 250,000/250,000 | 6126.4 đến 6463.9 | 204.9 | Chưa có ROI hợp lệ |
| Site23 | 250,000/250,000 | 4490.5 đến 4859.6 | 352.9 | Chưa có ROI hợp lệ |
| Site42 | 250,000/250,000 | 2292.9 đến 2760.2 | 320.1 | Không có link ROI trên trang |
| Haworth | 250,000/250,000 | 1464.4 đến 1759.8 | 710.6 | Không có link ROI trên trang |

Dung lượng trong bảng là tổng năm file PGDA gốc đã ghi trong inventory, không phải số byte của mẫu nhỏ hoặc dự toán vùng horizon. ROI availability là kết quả khảo sát trước đó, không được xem như xác nhận lại endpoint trong lần đọc DEM này. Danh sách chín ứng viên là tập so sánh hiện có, không đại diện cho mọi vùng PGDA.

## Phiếu quyết định của nhóm

Giữ `Chưa quyết định` nếu nhóm chưa thống nhất. Dấu chọn ở bảng này chỉ là mẫu điền, không tự phê duyệt phương án nào.

| Nội dung | Nhóm cần ghi cụ thể | Giá trị hiện tại |
| --- | --- | --- |
| Người dùng và mục đích demo | Ai dùng? Cần so sánh những điều gì? | Chưa quyết định |
| Site khảo sát sâu | Site ID, giữ/loại/để sau, lý do từ bằng chứng và mục tiêu | Chưa quyết định |
| Điểm quan sát | Lat/lon, quy ước longitude, frame, nguồn tọa độ; điểm tạm hay được nhóm chọn | Chưa quyết định |
| ROI | Geometry/version/ID; polygon gốc hay vùng do nhóm định nghĩa; nguồn và người xác nhận | Chưa quyết định |
| Chiều cao quan sát | Giá trị m trên mặt đất; nguồn cao độ mặt đất/datum và quy đổi ra ellipsoid altitude | Chưa quyết định |
| Thời gian nhiệm vụ | Bắt đầu/kết thúc UTC, dùng cùng interval khi so sánh site | Chưa quyết định |
| Độ chi tiết thời gian | Bước lấy mẫu ban đầu, cách tinh chỉnh lúc chuyển trạng thái và sai số thời gian chấp nhận | Chưa quyết định |
| Tiêu chí chất lượng | Đại lượng cần đúng, reference case, độ lệch tối đa/p95, cách xử lý ngoại lệ | Chưa quyết định |
| Kịch bản phạm vi chân trời | Giả thiết cần khảo sát, cách xử lý ray chạm biên; bán kính cuối cùng chờ bằng chứng hội tụ | Chưa quyết định |
| Ngân sách dữ liệu | Giới hạn tải, đĩa làm việc/cache/output, thời gian tính toán và máy chạy | Chưa quyết định |
| Người quyết định | Tên, ngày, bằng chứng đã xem, điều kiện cần xem lại | Chưa quyết định |

Có thể chọn danh sách site cần khảo sát sâu và mục tiêu nhiệm vụ ngay. Việc chọn p95 bằng các con số lịch sử, độ phân giải cuối cùng và bán kính chân trời phải chờ khôi phục bằng chứng profile. Các mức 5°/7° hoặc relief 5/10 km không được tự biến thành tiêu chí được chấp nhận.

## Những phần còn thiếu và người cần xử lý

| Việc | Vai trò đề xuất (chưa chỉ định cá nhân) | Đầu ra để đóng việc |
| --- | --- | --- |
| Chọn câu chuyện demo và site khảo sát sâu | Nhóm/product + DE | Phiếu được điền, rationale, người quyết định |
| Xác minh điểm/ROI đã chọn | DE + người review dữ liệu | Polygon/point có nguồn, kiểm tra giao với raster và mask trên toàn ROI |
| Tái lập profile/chân trời | Người phụ trách khoa học/thuật toán + DE | Script có version, input hash, observer/datum, quy tắc mask/bin, profile theo azimuth; kiểm tra tính nhất quán khi mở rộng bán kính |
| Định nghĩa tolerance | Người phụ trách khoa học + nhóm | Reference case và hệ quả đối với timing/visibility; không chọn ngưỡng chỉ để nhiều site vượt qua |
| Truy vấn Horizons đúng observer | DE + người phụ trách khoa học | Độ cao ellipsoid khác AGL; lưu `Center pole/equ`, full response và settings |
| Đề xuất dữ liệu cuối cùng | DE | File/layer/version/footprint, checksum, dung lượng nguồn/cache/output và khoảng trống chất lượng |
| Thống nhất giao diện dữ liệu | DE + người làm ứng dụng | Schema, units, availability/status và ví dụ hợp lệ/thiếu dữ liệu được hai phía đồng ý |

## Hợp đồng dữ liệu tối thiểu để thảo luận

| Đối tượng | Trường bắt buộc | Điều kiện chất lượng cần đáp ứng |
| --- | --- | --- |
| Site/ROI | ID, lat/lon convention, frame, geometry/version/source, trạng thái review | Không đổi tên/di chuyển điểm ngầm; điểm thuộc ROI hay không phải được ghi |
| Raster | URL/version, variable/units, CRS/frame, resolution, bounds, nodata/mask, scale/offset, checksum | Đủ coverage tại điểm/ROI; không thay nodata bằng 0; các lớp phải tương thích grid hoặc ghi rõ phép resample |
| Ephemeris | Site/observer, AGL và ellipsoid altitude riêng, target, UTC/time scale, cadence, query, header | Đúng observer/frame/units; lưu missing/error; có timestamp và version nguồn |
| Derived result | Input IDs/hashes, method/version, observer, azimuth, interval, mask, uncertainty, validation status | Có thể tái lập; chưa validated thì hiển thị đúng trạng thái; không dùng hình hillshade để tính illumination |

## Thứ tự công việc sau buổi review

1. Ghi các lựa chọn thực sự được nhóm chấp nhận vào ADR; cập nhật open decisions, không đánh dấu cả bộ dữ liệu đã được chọn nếu mới chốt shortlist.
2. DE kiểm tra toàn vùng đã chọn, bổ sung quality/count/uncertainty phù hợp và dữ liệu thời gian cho kịch bản thống nhất.
3. Tái lập phương pháp horizon trước khi so độ phân giải; giữ input/per-bin evidence và kiểm tra hội tụ. Chuẩn bị hình kết quả để nhóm review tiếp.
4. Đề xuất footprint, sản phẩm/version và manifest acquisition cùng ngân sách. Sau khi được chấp nhận mới xây pipeline thu nhận/xử lý chính thức.

## Kiểm tra bộ bàn giao

Notebook cần chạy hết, không có cell lỗi; bounds và đơn vị phải khớp raster; hình có thang đo, chú giải và mask; checksum cache phải khớp manifest. Không cần chạy bộ test ứng dụng vì thay đổi này chỉ gồm notebook khảo sát và tài liệu. Kết quả thực thi và kiểm tra hình được ghi trong PR mới và handoff.
