# LunarSight

## Khám phá địa điểm hạ cánh và lập kế hoạch nhiệm vụ Mặt Trăng

**Trạng thái: khởi tạo dự án bằng tài liệu và chuẩn bị cách làm việc với agent.** Nhóm chưa chốt bộ dữ liệu, dung lượng, độ phân giải, công nghệ hoặc phương án triển khai. Nhánh hiện tại chỉ gồm tài liệu và cấu hình hướng dẫn; chưa triển khai ứng dụng, script xử lý hay pipeline tải dữ liệu.

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
- Kiến trúc, API, cơ sở dữ liệu, framework, hosting và AI provider đều còn là thiết kế đề xuất.
- Những quan sát và số liệu demo trong proposal gốc không phải kết quả đã triển khai trong repo.

## Bắt đầu làm việc

```bash
git clone https://github.com/emanhthangngot/lunarsight.git
cd lunarsight
```

Mở thư mục bằng IDE hoặc agent đang dùng. Yêu cầu agent đọc `AGENTS.md`, `docs/project-state.md` và mục liên quan trong `docs/README.md`. Có [prompt khởi động](docs/agent-workflow.md#starter-prompt) để dùng trực tiếp.

Hiện chưa cần cài runtime, package, dịch vụ hay tải dataset. Khi có yêu cầu triển khai cụ thể tiếp theo, agent sẽ cập nhật trạng thái và thực hiện đúng phạm vi đó; không tự biến các lựa chọn chưa chốt thành quyết định của nhóm.
