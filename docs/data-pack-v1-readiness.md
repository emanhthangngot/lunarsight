> Archived readiness report for the separately prepared complete data pack. Counts and relative paths below describe that pack, not the contents of a fresh Git clone.

# LunarSight Data Pack v1

**Bộ dữ liệu đã tải và xử lý theo LunarSight V2 Product Proposal của nhóm, ngày 05/11/2026.** Bản này chuẩn bị dữ liệu cho 6 tọa độ, 5 profile nhiệm vụ và 5 ngày bắt đầu trong proposal. Có dữ liệu gốc chọn lọc, vùng raster đã cắt, dữ liệu dẫn xuất, bảng dùng cho ứng dụng, mã tái tạo và hồ sơ kiểm tra. Ngày chuẩn bị: **13/11/2026**.

## 1. Bắt đầu sử dụng

Sau khi giải nén, đọc **`data/app_bootstrap.json`**. File này tập hợp catalog, profile, dossier, danh mục raster và đường dẫn dữ liệu để đội frontend/backend có một điểm bắt đầu thống nhất. File không tự tải toàn bộ raster hoặc chuỗi thời gian vào bộ nhớ trình duyệt.

| Nhu cầu | File hoặc thư mục nên đọc |
|---|---|
| Danh sách điểm, tọa độ, cấu hình nhiệm vụ | `data/catalog/sites.json`, `mission_profiles.json`, `scenario_presets.json` |
| Bảng tổng hợp 6 điểm | `data/catalog/site_summary.csv` |
| Dossier có nguồn, trạng thái thiếu và đường dẫn | `data/catalog/site_dossiers.json` |
| DEM, slope, mask slope >15°, chân trời | `data/terrain/` |
| Ánh sáng/Earth visibility dài hạn và PSR | `data/environment/visibility/` |
| Nhiệt độ Diviner và các facet địa hình gốc | `data/environment/thermal/` |
| Hydrogen theo vùng và phần trăm băng còn thiếu | `data/environment/resources/` |
| Góc Mặt Trời/Trái Đất theo UTC | `data/ephemeris/` |
| 150 cấu hình so sánh và timeline mẫu | `data/scenarios/` |
| Quy ước đơn vị, tọa độ và nối dữ liệu | `docs/integration_contract.md` |
| Phương pháp của từng nhóm dữ liệu | `docs/terrain.md`, `docs/ephemeris.md`, `docs/environment.md` |
| Danh mục file và xác minh nguyên vẹn | `dataset_manifest.json`, `checksums.sha256`, `metadata/pack_validation.json` |

Ví dụ dùng chuỗi thời gian trong Python:

```python
import pandas as pd

geometry = pd.read_parquet("data/ephemeris/A_hourly.parquet")
timeline = pd.read_parquet("data/scenarios/A_timeline_clps_2p2m_hourly.parquet")
comparisons = pd.read_csv("data/scenarios/scenario_comparison_presets.csv")
```

Frontend có thể bắt đầu bằng `data/scenarios/A_timeline_frontend_week.json` và `data/ephemeris/A_sample.json`. Các mẫu tuần chứa khoảng 01–08/01/2026. Khi chọn ngày khác, dùng cache đầy đủ hoặc tính lại từ nguồn; không lặp lại tuần mẫu cho các thời điểm khác. Raster là GeoTIFF có tọa độ, phù hợp cho backend tạo tiles/mesh hoặc trình đọc raster của ứng dụng.

## 2. Dữ liệu đã chuẩn bị

### Catalog và cấu hình

Có 6 site, 5 profile, các ngưỡng của profile, 5 ngày bắt đầu, miền custom coordinate, các bước sensitivity và chiều cao cột quan sát từ proposal. Đây là **cấu hình của ứng dụng**, không phải tiêu chuẩn nhiệm vụ chính thức.

Đã tải snapshot danh mục địa danh USGS/IAU: 9.087 feature toàn Mặt Trăng trong nguồn KMZ; bản trích phía Nam 60°S có 509 feature. Tọa độ trong proposal được giữ nguyên. Tên địa điểm được kiểm tra riêng, không dùng tên để âm thầm di chuyển điểm lấy mẫu.

### Địa hình, slope và chân trời

- 6 vùng DEM khoảng **40 × 40 km**: A–E ở grid 80 m, SHIV ở grid 240 m.
- Riêng C nằm trong footprint Site04: thêm vùng khoảng **6 × 6 km ở grid 5 m**, slope gốc và RMS height error gốc. Đây là dữ liệu tại tọa độ C, không xác nhận tên “Faustini” trong demo.
- 6 raster slope và 6 mask **slope >15°** sẵn cho lớp hiển thị. C dùng slope nguồn 5 m; những điểm khác dùng gradient từ DEM 80/240 m. Mask chỉ đánh dấu ngưỡng theo grid, chưa đánh giá chân đáp hoặc đá tảng.
- Raster địa hình context khoảng 960 m bao phủ vùng cực Nam rộng hơn; chỉ dùng xem tổng thể.
- **12.960 dòng chân trời**: 6 điểm × 360 phương vị × 6 chiều cao 1,2 / 2,0 / 2,2 / 2,5 / 3,5 / 10 m. Tính bằng địa hình 80/240 m, có độ cong Mặt Trăng, bán kính tìm kiếm 200 km. Mỗi hướng có bước 1°.

Nguồn DEM là [NASA PGDA sản phẩm 90](https://pgda.gsfc.nasa.gov/products/90) và [sản phẩm 78](https://pgda.gsfc.nasa.gov/products/78). Pixel spacing không đồng nghĩa độ chính xác. Nguồn 5 m có nhiều pixel nội suy; các sai số theo nguồn được giữ trong metadata. Bản 20 m toàn vùng được khảo sát nhưng đọc window từ xa không thành công; **gói này không tuyên bố có DEM 20 m**.

### Ánh sáng, Earth visibility và PSR

Có 15 raster 60 m cho A–E: tỷ lệ nhìn thấy một phần đĩa Mặt Trời trung bình dài hạn, tỷ lệ nhìn thấy một phần đĩa Trái Đất trung bình dài hạn và mặt nạ PSR. Có thêm 3 raster context, bảng lấy mẫu tại site và khoảng cách tới tâm pixel PSR gần nhất.

Các lớp này là sản phẩm mô hình dài hạn, không phải kết quả của ngày hạ cánh cụ thể. SHIV nằm ngoài vùng phủ, nên các trường tương ứng để `null`. Nhãn và phép scale/offset gốc được lưu; 5 pixel PSR bất định trong nguồn được mask thay vì tự phân loại. Nguồn: [LOLA/MIT numeric archive](https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/) và [mô tả PGDA](https://pgda.gsfc.nasa.gov/products/69).

### Thiên văn và benchmark

Có **219.318 dòng site–thời gian**, tức 36.553 mẫu/điểm, từ **2025-12-01T00:00:00Z đến 2030-02-01T00:00:00Z**, bước 1 giờ, gồm cả mẫu cuối. Thêm 36.553 dòng context Mặt Trăng. Phạm vi này bao phủ các ngày preset, thay đổi ±30 ngày và duration tới 36 tháng trong proposal.

Mỗi mẫu có phương vị, góc cao, khoảng cách và kích thước góc Mặt Trời/Trái Đất; dùng SPICE với bộ kernel DE440 phù hợp, MOON_ME và chiều cao nền lấy từ DEM. Có Parquet, CSV nén, mẫu CSV/JSON và 5 kernel gốc để chạy offline. Cache chính dùng mast = 0 m; script tính scenario dịch vector tới chiều cao mast được chọn bằng phép xấp xỉ đã đối chiếu riêng với SPICE.

Đã lưu **13 phản hồi Horizons thật** cùng tham số truy vấn: 36 dòng kiểm tra vị trí quan sát và 12 giá trị benchmark subpoint tại 3 epoch. Các kiểm tra đều đạt ngưỡng số đã công bố trong báo cáo. Chúng kiểm chứng những trường hợp cụ thể; không chứng nhận mô hình che khuất địa hình hoặc toàn bộ ứng dụng. Context hàng giờ dùng hướng hình học `NONE`, tách khỏi benchmark subpoint biểu kiến.

Nguồn: [JPL Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html), [NAIF generic kernels](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/).

### Nhiệt độ và tài nguyên

Với A–E, đã lấy facet gần nhất và các facet trong bán kính 3 km từ **Diviner PRP V2**. Có nhiệt độ trung bình năm ở **độ sâu 2 cm**, nhiệt độ **cực đại bề mặt** trong năm và độ sâu băng ổn định theo mô hình. Những biến này có định nghĩa khác nhau; không ghép thành một cặp surface min–max.

Có 72 hàng seasonal từ 12 sản phẩm được chọn: 6 bin mùa × 2 bin kinh độ điểm dưới Mặt Trời × 6 site. **38 mẫu hợp lệ, 34 hàng thiếu có lý do**, gồm 12 hàng SHIV ngoài vùng phủ. Các bin chỉ là một phần của tập nguồn; không dùng cực trị của chúng làm cực trị năm.

Lớp tài nguyên chứa toàn bộ **11.306 bin hydrogen** của Lunar Prospector, đơn vị ppm, bin danh nghĩa khoảng 60 × 60 km, cùng bản tra cho 6 site. Đây là sản phẩm đặc biệt do PDS lưu trữ, được nguồn ghi rõ chưa thuộc kho PDS qua peer review. Gói sử dụng lớp này làm thông tin theo vùng; **không gọi nó là LEND và không đổi thành băng nước wt%**. Việc tải/xử lý một sản phẩm LEND phù hợp vẫn là công việc riêng nếu nhóm muốn giữ nhãn LEND trong app.

Nguồn: [Diviner PRP V2, DOI 10.17189/1520650](https://pds.nasa.gov/ds-view/pds/viewDataset.jsp?dsid=LRO-L-DLRE-5-PRP-V2.0), [seasonal Diviner](https://www.diviner.ucla.edu/single-post/new-diviner-south-polar-data-products-released-on-pds), [Lunar Prospector special products](https://pds-geosciences.wustl.edu/missions/lunarp/reduced_special.html).

### Basemap và scenario mẫu

Có WAC global GeoTIFF **5.760 × 2.880 pixel**, 16 pixel/degree, và cấu hình 3 WMTS NASA Trek kèm capabilities. Đây là ảnh hiển thị, không phải DEM hoặc dữ liệu định lượng nhiệt/ánh sáng. Nguồn: [LROC WAC product](https://data.lroc.im-ldi.com/lroc/view_rdr_product/WAC_GLOBAL_E000N0000_016P).

Có **150 scenario** = 6 site × 5 profile × 5 ngày bắt đầu, và **219.312 hàng timeline** cho cấu hình mast CLPS 2,2 m. Scenario dùng tháng lịch và khoảng `[start,end)`, không đếm trùng mẫu cuối. Có Sun/Earth center visibility, giao của hai trạng thái, số giờ, khoảng tối/blackout dài nhất trong cửa sổ và kiểm tra ngưỡng slope. Các transition có khoảng kẹp 1 giờ, không giả định chính xác tới phút.

Đây là kết quả sàng lọc theo mẫu: chưa có mô hình eclipse, công suất pin, năng lượng tích trữ, trạm mặt đất, antenna/link budget, hoặc vật cản nhỏ hơn DEM. Các cột upper-limb chỉ là proxy theo chân trời tại phương vị tâm, không phải phép che khuất đầy đủ cả đĩa thiên thể.

## 3. Những điểm proposal cần điều chỉnh

**Tên và tọa độ:** C tại −89,62°, 178,30°E cách tâm Faustini trong USGS khoảng **86,98 km**, trong khi đường kính hố khoảng **42,48 km**. A cách tâm Shackleton khoảng 26,28 km trong khi đường kính hố khoảng 20,92 km. Nhãn C không phù hợp; A và các nhãn ridge/rim/massif khác cần đối chiếu bản đồ địa hình. SHIV khớp tọa độ Statio Shiv Shakti khi làm tròn 0,01°. Chi tiết trong `coordinate_review.json` và `site_name_audit.csv`.

**Độ cao và % ánh sáng demo:** số gốc được giữ riêng trong `data/catalog/proposal_snapshot/` với trạng thái chưa kiểm chứng. Không dùng chúng làm fallback cho dữ liệu khoa học. Kết quả lấy mẫu tại đúng tọa độ proposal:

| Site | Cao độ tốt nhất, m | Grid độ cao | Solar mean dài hạn | Earth mean dài hạn | Annual surface max, K |
|---|---:|---:|---:|---:|---:|
| A | −755,95 | 80 m | 16,608% | 32,824% | 227,853 |
| B | −367,32 | 80 m | 5,472% | 25,940% | 234,720 |
| C | 865,19 | 5 m | 12,568% | 41,524% | 315,482 |
| D | 83,96 | 80 m | 21,248% | 75,300% | 242,654 |
| E | 6.712,30 | 80 m | 14,160% | 51,536% | 227,267 |
| SHIV | 528,50 | 240 m | Chưa có | Chưa có | Chưa có |

Các cột được lấy từ những sản phẩm khác nhau với độ phân giải và định nghĩa riêng; chúng không cùng là một phép đo tại thiết bị. Riêng C, chân trời và ephemeris dùng nền 80 m cao **866,39056 m** để nhất quán hình học; cao độ 5 m tốt hơn được giữ riêng trong dossier.

**Hai trường phải để trống:** `water_ice_wt_pct` và `thermal_annual_surface_min_K`. Thiếu dữ liệu được biểu diễn bằng `null` kèm lý do, không đổi thành 0. PSR không xác nhận băng; hydrogen không xác nhận lượng băng có thể khai thác.

## 4. Phạm vi chưa đóng gói

Chưa có toàn bộ grid sensitivity theo lat/lon/mast; chưa có DEM native cho mọi custom coordinate từ 60–90°S; chưa có bộ bin nhiệt đầy đủ; chưa có trạm thu trên Trái Đất hoặc bộ lập tuyến rover. Cache thiên văn và các nguồn gốc cho phép mở rộng, nhưng phải tính lại khi đổi tọa độ. Raster context giảm độ phân giải không thay thế native DEM trong phép đánh giá địa hình.

Các tham số nguồn, checksum và metadata cho phép đội phát triển mở rộng đúng sản phẩm. Dữ liệu gốc lớn được tải để xử lý nhưng chỉ các crop, bản trích và nguồn nhỏ cần thiết được đóng gói; không phải toàn bộ kho dữ liệu NASA.

## 5. Tái tạo và kiểm tra

Muốn chỉ dùng dữ liệu đã chuẩn bị, không cần chạy lại bước tải. Muốn tái tạo, dùng Python 3.12 và `requirements.txt`; các lệnh dưới đây chạy từ thư mục đã giải nén:

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python scripts/prepare_catalog.py
python scripts/prepare_terrain.py --help
python scripts/prepare_environment.py --help
python scripts/prepare_ephemeris.py --help
```

Chỉ định cache nằm ngoài thư mục gói theo hướng dẫn từng component. Lần tái tạo đầu cần tải khoảng vài GB vì Diviner được cắt từ các bảng gốc lớn. Các truy vấn Horizons thực hiện tuần tự và tái dùng phản hồi đã cache. Sau khi các component hoàn tất:

```bash
python scripts/prepare_scenarios.py
python scripts/prepare_hazard_masks.py
python scripts/build_pack_index.py
python scripts/prepare_preview.py
python scripts/validate_pack.py
```

`validate_pack.py` kiểm tra cấu trúc và tính nhất quán dữ liệu; `checksums.sha256` xác minh byte của bản phát hành đã nhận. Chạy lại pipeline sẽ có thể thay đổi metadata thời gian và checksum; giữ bản phát hành gốc nếu cần đối chiếu.

Nguồn dữ liệu thuộc các nhóm NASA LRO LOLA/Diviner/LROC, NASA JPL NAIF/SSD, Lunar Prospector, PDS Geosciences và USGS/IAU được ghi nhận theo từng file. Các kết quả dẫn xuất của gói không phải sản phẩm được NASA/JPL chứng nhận hoặc khuyến nghị địa điểm hạ cánh.
