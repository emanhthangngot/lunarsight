# Pilot: kiểm tra ROI và tham chiếu độ cao

Ngày kiểm tra: 14 November 2026. Phạm vi: hai điểm tham chiếu và cửa sổ preview của pilot-v1; đây là kiểm tra hình học để lập kế hoạch, không chọn tọa độ hạ cánh.

## Kết quả ROI

Đọc các polygon gốc trong `Site01_ROIs.tgz` và `Site04_ROIs.tgz` đã tải tạm từ [PGDA 78](https://pgda.gsfc.nasa.gov/products/78), chưa dùng polygon giản lược trong notebook. Chuyển lat/lon pilot sang spherical south-polar stereographic, bán kính 1.737.400 m, kinh tuyến giữa 0°, dùng tham số `.prj`; tính khoảng cách Euclid từ tâm đến polygon gần nhất và diện tích giao của union polygon với `display_bounds_m` trong [sample evidence](../notebooks/evidence/pilot-v1-samples.json). CRS identifier trong shapefile chưa được xác nhận authoritative với raster: kết quả cần đối chiếu lại metadata trước khi dùng trong xử lý chính thức.

| Site | Polygon | Tâm chiếu X/Y (m) | Tâm trong ROI? | Khoảng cách đến polygon gần nhất | Diện tích ROI trong preview / tổng union |
| --- | ---: | --- | --- | ---: | --- |
| Site01 | 7 | −10.999,145 / −11.999,255 | Không | 91,3 m | 52.825 / 52.825 m² (100%) |
| Site04 | 4 | −1.000,037 / −7.000,346 | Không | 1.814,4 m | 0 / 13.037,5 m² (0%) |

Các giá trị là khoảng cách/diện tích trên mặt phẳng chiếu, không phải khoảng cách trắc địa hoặc mức an toàn. Site01 ROI nằm trong bounds preview, còn Site04 ROI nằm ngoài. Cần đọc/kiểm tra coverage của raster **trong ROI thực** trước khi đánh giá nó; các polygon có thể bị chia nhỏ và khung reference không tương đương landing zone. Chưa có điểm ROI cụ thể được nhóm chọn.

Tính toàn vẹn archive đã đọc (SHA-256): Site01 `40b961417a344ce0274aecbab522e171a22f658507d82e8fb4d7bc97526ffc4f`; Site04 `8e8b788f9fdf6400f23fd36dad02138102bd1a905b4b71a5739a9a4fd8a0e07a`. Chỉ là hash archive tạm đã kiểm tra, không phải checksum do NASA công bố.

## Độ cao DEM và Horizons

Giá trị pixel chứa tọa độ tham chiếu trong cache 5 m là Site01 **1944,633 m**, Site04 **771,043 m**. Đây là giá trị pixel chứa điểm (nearest-cell), không phải độ cao được nội suy tại tọa độ chính xác hoặc tại ROI; input và hash cửa sổ nằm trong sample evidence. Không dùng min/max cửa sổ làm cao độ điểm quan sát.

PGDA 78 mô tả giá trị LDEM là surface height Z (m), CRS dạng cầu và frame `MOON_ME`/DE421. Header Horizons kiểm tra trước đây báo bán kính tham chiếu 1737,4 km và `Center pole/equ: MEAN_ME (high precision)`; [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html#center) yêu cầu altitude theo ellipsoid của observer. Tên frame và bán kính phù hợp là bằng chứng thuận lợi, nhưng WKT mô tả **map CRS** không đủ chứng minh datum của giá trị Z hoặc quy ước độ cao của cả hai nguồn giống nhau. Chưa xác minh authoritative vertical datum cụ thể của PGDA 78 trong bước này.

**Quy tắc có điều kiện:** chỉ khi đối chiếu tài liệu nguồn xác nhận Z là độ cao so với cùng bề mặt tham chiếu Horizons, và chọn/quy định phương pháp lấy độ cao tại điểm, mới dùng `ellipsoid_altitude_km = (DEM_height_m + 1 m AGL) / 1000`. Nếu chưa xác minh, để `ellipsoid_altitude_m` là null và trạng thái chưa sẵn sàng cho chuỗi Horizons pilot. Không dùng 0,001 km như một mét trên mặt đất.

## Bàn giao tiếp theo

1. Nhóm chọn giữ điểm tham chiếu cho kiểm thử hay chọn điểm cụ thể bên trong ROI; điểm reference và ROI là hai đối tượng riêng.
2. Kiểm tra raster valid mask/coverage và lớp quality/uncertainty trên ROI gốc, đặc biệt Site04 ngoài preview; không coi phép giao bounds là kiểm tra pixel.
3. Tìm xác nhận vertical datum trực tiếp cho PGDA 78 và lưu header Horizons cho kịch bản 2027. Nếu chưa xác minh, giữ altitude thiếu; không xuất kết quả khoa học như đã xác nhận.
4. Tái lập horizon với observer/datum, input, bins và per-azimuth evidence trước khi dùng p95 hoặc chọn bán kính cuối cùng.
