# LunarSight

## Khám phá địa điểm hạ cánh và lập kế hoạch nhiệm vụ Mặt Trăng

**Trạng thái: mã nguồn đã tích hợp các sửa lỗi pilot/backend được review và giao diện Three.js tập trung so sánh Site01/Site04; kiểm chứng phần mềm trong phạm vi task42 đã PASS.** Dữ liệu pilot đã xử lý được giữ nguyên và kết nối qua static provider hoặc FastAPI cục bộ. [Trạng thái dự án](docs/project-state.md) và [handoff nghiệm thu](docs/handoffs/current.md#final-bounded-acceptance-round42) phân biệt kết quả đã quan sát, raw log bị mất và bằng chứng được tái sử dụng; đây không phải xác nhận độ chính xác khoa học.

Three.js địa hình cục bộ thay Cesium toàn cầu; giao diện hiện đại và mô hình mock 1.1.0 được giữ lại. Vercel vẫn phục vụ **snapshot mock cũ**, không phải mã nguồn pilot/backend vừa được nghiệm thu. Push/merge Git không tự triển khai lại. Phạm vi sản phẩm rộng hơn, datum/frame, hội tụ horizon và hosting vẫn cần quyết định riêng; không tự tải raster hoặc tái sinh dữ liệu khoa học.

Tên **LunarSight** giữ sự nhất quán với proposal: Lunar là Mặt Trăng; Sight gợi việc quan sát và hiểu điều kiện tại một địa điểm.

## Các tài liệu đã tổ chức

| Nhóm | Đọc ở đâu |
| --- | --- |
| Tổng quan, mục tiêu, tính năng | [Product](docs/product.md), [Requirements](docs/requirements.md) |
| Kiến trúc và mô hình hệ thống đề xuất | [Architecture](docs/architecture.md), [Domain model](docs/domain-model.md), [API design](docs/api-design.md) |
| Nguồn dữ liệu ứng viên | [Data sources](docs/data-sources.md), [Data quality](docs/data-quality.md) |
| Vận hành và kiểm chứng trong tương lai | [Operations](docs/operations.md), [Verification plan](docs/verification-plan.md) |
| Trạng thái và các quyết định chưa chốt | [Project state](docs/project-state.md), [Open decisions](docs/open-decisions.md), [ADRs](docs/decisions/README.md) |
| Làm việc với agent | [AGENTS.md](AGENTS.md), [Agent workflow](docs/agent-workflow.md), [mẫu giao việc](docs/templates/task-brief.md) |
| Bản proposal tham chiếu | [Proposal V2](docs/reference/proposal-v2.md) |

Xem toàn bộ trong [mục lục tài liệu](docs/README.md).

## Phân biệt đề xuất và quyết định

- Các phương án 0–90°S, 60–90°S và 80–90°S là lựa chọn để nhóm cân nhắc.
- Khoảng **56,2 GB** chỉ là một kịch bản dữ liệu minh họa chưa được nhóm thông qua.
- Các nguồn NASA/PDS được ghi là ứng viên; việc xác minh nguồn không đồng nghĩa nhóm đã chọn hoặc đã tải nguồn đó cho repo.
- Stack Vite + React + TypeScript + Three.js cục bộ + pnpm + Vitest và backend FastAPI cục bộ đã có triển khai; kiến trúc rộng hơn, hosted backend, storage/provider và ngân sách vẫn là quyết định mở. Không có CI.
- Những quan sát và số liệu demo trong proposal gốc không phải kết quả đã triển khai trong repo.

## Bắt đầu làm việc

```bash
git clone https://github.com/emanhthangngot/lunarsight.git
cd lunarsight
```

Mở thư mục bằng IDE hoặc agent đang dùng. Yêu cầu agent đọc `AGENTS.md`, `docs/project-state.md` và mục liên quan trong `docs/README.md`. Có [prompt khởi động](docs/agent-workflow.md#starter-prompt) để dùng trực tiếp.

Lệnh ứng dụng nằm trong [hướng dẫn web](web/README.md#run-locally) và [backend](backend/README.md#run-locally). Việc tiếp theo là người dùng review trải nghiệm hai địa điểm và chốt phạm vi sản phẩm/hosting/khoa học, không chạy lại các gate đã hoàn tất chỉ để dựng lại log bị mất. Boss giữ quyền Git/merge/triển khai; không biến các lựa chọn chưa chốt thành quyết định của nhóm.
