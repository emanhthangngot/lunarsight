# Site04 — review observer thử nghiệm và datum

Trạng thái: **review có điều kiện, 14 November 2026**. Người dùng yêu cầu review điểm thử, xác minh frame/datum, rồi mới dùng observer cho Horizons và tái lập horizon. Kết quả dưới đây chưa đủ đóng điều kiện datum.

## Review điểm

Điểm kỹ thuật từ [ROI review](site04-roi-coverage.md): lat −89,7850916577°, lon −155,9817172329° east, projected X −2652,5 m / Y −5952,5 m. Đây là tâm pixel nằm trong polygon record 3 (index 0-based), theo phép chiếu được diễn giải. Nó cách biên union khoảng 15 m và là pixel có margin lớn nhất trong tập 58 tâm pixel ROI có LDEC > 0. Giá trị tại pixel: Z 1737,1783447 m, LDEC 1, slope 2,284°, Z RMS 0,136 m, slope RMS 1,071°.

**Đề xuất:** dùng điểm này như observer kỹ thuật *tạm thời* để xây case tái lập sau khi datum được xác nhận. Không thay điểm Site04 Data Book trong pilot-v1; không gọi điểm này là tọa độ hạ cánh hay coi 15 m margin là đủ cho phương tiện. Các dữ liệu ảnh, vật cản nhỏ, footprint đáp, ánh sáng và visibility của điểm chưa được đánh giá. ROI CRS có PROJ parameters khớp raster nhưng semantic CRS equality là false; cần provenance gốc trước khi coi frame identity đã được kiểm chứng.

## Bằng chứng datum: khớp có điều kiện, chưa xác minh độc lập PGDA 78

1. [Barker et al. 2021](https://ntrs.nasa.gov/api/citations/20205009660/downloads/Mike%20Barker_%20Paper_%20Improved%20Lola.pdf), phần 3.1, mô tả surface height là elevation above reference sphere. Bản được kiểm tra không nêu số bán kính của sphere trong đoạn đó.
2. [LOLA PDS SIS](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/document/rdrsis.htm), sample label LDEM_64, ghi height so với radius 1737,4 km và frame ME/polar axis DE421. Đây là sản phẩm LOLA khác, không phải metadata trực tiếp của `Site04_final_adj_5mpp_surf.tif`.
3. [PGDA 78](https://pgda.gsfc.nasa.gov/products/78) ghi Z là surface height mét và `MOON_ME` / DE421; GeoTIFF map CRS có sphere 1737,4 km. [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html#center) yêu cầu altitude theo reference ellipsoid; header mẫu trước đó cho lunar center báo radius 1737,4 km và `Center pole/equ` MEAN_ME high precision.

**Suy luận:** khả năng cao hai nguồn dùng reference sphere/frame tương thích cho kịch bản này. Tuy nhiên tài liệu đã tìm chưa gắn rõ bán kính vertical reference của Z **riêng GeoTIFF PGDA 78** với sphere của Horizons. Không suy từ map CRS hoặc label LDEM_64 sang chứng nhận datum Z của PGDA 78. Cần metadata/paper nguồn trực tiếp hoặc xác nhận curator, và kiểm tra header của query 2027. Khi chưa có bằng chứng đó, `ellipsoid_altitude_m` trong cấu hình pilot vẫn là null.

Phép tính sensitivity không được dùng như input đã xác minh: nếu và chỉ nếu hai bề mặt tham chiếu đúng là một, lấy nearest-cell Z 1737,1783447 m tại điểm thử và 1 m AGL sẽ cho altitude giả định 1738,1783447 m = 1,7381783447 km. Nó không giải quyết uncertainty của Z hoặc CRS.

## Điều kiện thực hiện tiếp

- Xác minh vertical datum PGDA 78 trực tiếp với nguồn phát hành; lưu bằng chứng và header `Center pole/equ`/radii cho 2027. Nếu dữ liệu nguồn khác sphere Horizons, xác định phép biến đổi trước khi dùng.
- Chốt observer kỹ thuật hoặc giữ observer Data Book; ghi phương pháp sampling Z, AGL, lat/lon, frame và trạng thái. Đây là quyết định cấu hình có thể sửa lại, không phải landing approval.
- Sau khi hai điều kiện trên được đáp ứng, query Sun 10/Earth 399 cho 2027-01-01 đến 2027-02-01 UTC theo pilot; lưu response đầy đủ, settings và hashes.
- Tái lập horizon với observer và cao độ cố định, dùng cùng grid/mask/bins/rules cho các bán kính lồng nhau. Lưu profile per-azimuth và khoảng cách cực đại, kiểm tra tính không giảm của maximum khi tăng bán kính, nodata/empty bins, và so sánh với reference độc lập. Thử 25 km chỉ để chẩn đoán; không dùng p95 lịch sử để chọn scale.

Trong lượt review này chưa gọi Horizons cho điểm trên và chưa tái lập horizon vì điều kiện datum chưa được xác nhận. Bounded sample cũ không thể thay thế profile mới.
