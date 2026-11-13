> Scope: paths in this original contract refer to the separately distributed, fully extracted six-site data pack. A fresh repository clone contains small examples and reference scripts.

# Quy ước tích hợp LunarSight Data Pack v1

## Điểm vào của ứng dụng

Đọc `data/catalog/sites.json`, `mission_profiles.json` và `scenario_presets.json` trước. Đây là cấu hình được chép từ proposal của nhóm. Tọa độ được giữ nguyên để mọi raster, bảng khí hậu và chuỗi thời gian có thể nối bằng `site_id` (`A`, `B`, `C`, `D`, `E`, `SHIV`). Các số hiển thị chưa được kiểm chứng của demo nằm riêng trong `data/catalog/proposal_snapshot/`; không dùng chúng làm fallback khi nguồn khoa học thiếu dữ liệu.

Bảng `site_name_audit.csv` đối chiếu tọa độ với tâm địa danh USGS/IAU. `coordinate_review.json` ghi rõ kết luận và những điểm cần kiểm tra trên bản đồ địa hình. Khoảng cách đến tâm không phải khoảng cách tới vành hố. Bộ dữ liệu không tự đổi tọa độ theo tên, không xem nhãn mission trong demo là quyết định địa điểm chính thức.

## Hệ tọa độ và đơn vị

- Tọa độ địa lý: vĩ độ planetocentric, Bắc dương/Nam âm; kinh độ Đông dương. Chuẩn hóa kinh độ về `[0,360)` trước khi nối dữ liệu. Các raster có thể dùng kinh độ tương đương `[-180,180)`.
- Bán kính tham chiếu của các DEM LOLA trong gói: **1 737 400 m**. Độ cao so với mặt cầu này khác với chiều cao cột quan sát tính từ mặt đất.
- Các DEM cực Nam dùng phép chiếu stereographic Mặt Trăng, đơn vị mét. Đọc WKT/transform được nhúng trong từng GeoTIFF. Không gán EPSG:4326 hoặc EPSG:3857 của Trái Đất cho dữ liệu Mặt Trăng.
- `sites.geojson` chỉ dùng cấu trúc JSON quen thuộc cho ứng dụng. Tọa độ của nó là **Mặt Trăng**, không tuân theo giả định WGS84 của RFC 7946. Map engine phải biết đây là một thiên thể khác; bảng CSV/JSON có khai báo frame là nguồn chính để tránh nhầm.
- Góc phương vị: 0° Bắc, 90° Đông, 180° Nam, 270° Tây. Góc cao: dương phía trên đường ngang địa phương; giữ giá trị âm.
- Nhiệt độ dùng kelvin; độ dốc dùng degree; độ cao/khoảng cách cục bộ dùng metre, trừ trường ghi `_km`; các phân số dùng `[0,1]`, trường `_pct` dùng `[0,100]`.
- Thời gian dùng UTC với `Z`. SPICE tự chuyển UTC sang ET khi tính. Mỗi scenario dùng khoảng nửa mở `[start_utc,end_utc)`, để không đếm trùng mẫu tại điểm cuối.

## Phân biệt các loại dữ liệu

1. **Source:** sản phẩm NASA/PDS/USGS gốc, lưu kèm URL, nhãn hoặc metadata và checksum.
2. **Derived:** crop, tái chiếu, gradient độ dốc, chân trời địa hình, vị trí thiên thể, thống kê tính từ nguồn. Đọc phương pháp của component trước khi dùng.
3. **Proposal preset:** lựa chọn UI, tọa độ đầu vào và ngưỡng nhiệm vụ do nhóm đặt. Các preset không phải yêu cầu do NASA xác nhận.
4. **Unavailable:** dùng `null` và lý do. Không thay bằng 0; 0 là một giá trị vật lý có ý nghĩa.

Một raster bị crop vẫn có cùng pixel spacing với nguồn nếu không resample. Một raster context đã giảm kích thước phải ghi rõ resampling và không dùng để đo độ dốc hoặc threshold hazard. Pixel spacing không đồng nghĩa độ phân giải hữu hiệu hoặc độ chính xác.

## Các đại lượng dễ bị hiểu nhầm

**Illumination/Earth visibility trung bình dài hạn:** lớp LOLA/MIT là tỷ lệ thời gian nhìn thấy ít nhất một phần đĩa thiên thể trong chu kỳ mô hình dài hạn. Nó không phải tỷ lệ của khoảng thời gian do người dùng chọn, không phải công suất pin và không phải radio link budget.

**Hình học động:** ephemeris mô tả vị trí tâm/biên đĩa Mặt Trời và Trái Đất tại từng UTC. Muốn quyết định bị che khuất phải so sánh với chân trời đúng địa điểm và chiều cao. Chuỗi ephemeris không tự chứa núi, vành hố hoặc trạm thu trên Trái Đất.

**Địa hình:** độ dốc theo ô lưới 80 m hoặc 240 m không đủ để kết luận bề mặt an toàn ở thang chân đáp. Ngay cả sản phẩm 5 m cũng có nội suy và sai số. Giữ riêng `map_slope_hazard_threshold_deg=15` của lớp hiển thị và `max_slope_deg` của profile.

**Nhiệt:** cực đại bề mặt hàng năm, nhiệt độ trung bình ở độ sâu 2 cm và quan trắc theo bin thời gian là ba biến khác nhau. Không ghép chúng thành một cặp “surface min–max” nếu thiếu cực tiểu thực sự. Bản đồ climatology không tự cho nhiệt độ ở UTC bất kỳ trong tương lai.

**Tài nguyên:** hydrogen ppm, vùng bóng tối vĩnh cửu và mô hình độ sâu băng ổn định không phải số đo phần trăm băng nước có thể khai thác tại mỗi điểm. Trường `water_ice_wt_pct` phải để `null` nếu chưa có nguồn đủ phù hợp.

## Nối dữ liệu vào UI

Nên để mỗi lớp/cột có tối thiểu: `value`, `unit`, `source_id`, `method`, `coverage_status`, `resolution_or_cadence`, `limitations`. Khi không có dữ liệu, hiển thị “Chưa có dữ liệu trong gói này” thay cho “0”. Khi người dùng thay tọa độ hoặc chiều cao ngoài cache, đánh dấu phải tính lại thay vì dùng kết quả của site cũ.

Các preset ngày trong proposal chỉ là ngày UTC; gói không gán nhãn mùa hoặc chiến dịch chưa được kiểm chứng. `duration_months` được hiểu là tháng lịch, không mặc định 30 ngày. Ví dụ một tháng từ 2026-01-01 kết thúc 2026-02-01; phần mềm phải hiển thị cả điểm đầu và điểm cuối.

## Kiểm tra thống kê availability

Với cùng một khoảng thời gian và cùng mẫu, tỷ lệ đồng thời phải thỏa:

`max(0, sunlight_fraction + earth_fraction - 1) <= overlap_fraction <= min(sunlight_fraction, earth_fraction)`.

Thời lượng bóng tối và blackout liên tục phải được tính từ cùng chuỗi trạng thái dùng cho biểu đồ timeline. Nếu mẫu theo giờ, thời điểm chuyển trạng thái chỉ được xác định trong giới hạn cadence đó; không xuất số phút có độ chính xác giả. Tỷ lệ số constraint đạt chỉ là điểm kiểm tra ngưỡng, không phải xác suất nhiệm vụ thành công.

Đối chiếu Horizons là một kiểm tra cụ thể cho thời điểm, site, frame và mô hình đã nêu. Không suy rộng kết quả đó thành chứng nhận của JPL cho toàn bộ ứng dụng.
