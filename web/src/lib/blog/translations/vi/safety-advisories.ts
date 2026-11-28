import type { PostBody } from '../../types';
import { nextReleaseAdvisoryBlocks } from '../../next-release-advisories';

const body: PostBody = {
  "title": "Thông báo an toàn: kết quả nào đã thay đổi và cần làm gì",
  "excerpt": "Các lỗi của Stabileo có thể cho kết quả sai hoặc thiên về phía không an toàn: ai bị ảnh hưởng, cách nhận biết mô hình có bị ảnh hưởng hay không, cần làm gì trong thời gian chờ và khi nào chúng được sửa.",
  "blocks": [
    {
      "k": "p",
      "t": "Kết quả của Stabileo được dùng để thiết kế các công trình thực tế. Khi phát hiện một lỗi có thể đã tạo ra kết quả sai, nhất là kết quả thiên về phía không an toàn, chúng tôi công bố lỗi đó dưới dạng thông báo an toàn: lỗi là gì, ảnh hưởng đến những mô hình nào, cách nhận biết chúng, cần làm gì cho đến khi bản sửa được đưa lên, và cần kiểm tra lại gì trong những kết quả đã dùng."
    },
    {
      "k": "p",
      "t": "Hầu hết các lỗi này do chương trình kiểm chứng của chính chúng tôi phát hiện: so sánh với bảy chương trình phần tử hữu hạn khác, các ví dụ tính toán đã công bố, các phép thử bất biến vật lý và việc rà soát lại cách suy ra của từng phần tử. Công bố chúng là một phần của công việc đó: một lỗi không được báo cáo sẽ vẫn nằm trong các tính toán đã giao."
    },
    {
      "k": "note",
      "t": "Trạng thái tính đến ngày 12 tháng 11 năm 2026: SA-2026-001 đến 020 đã được sửa trong phiên bản 0.3.0, SA-2026-021 đến 024 trong phiên bản 0.4.0 và SA-2026-025 đến 047 trong phiên bản 0.5.0 (SA-2026-040 đã được hạn chế: phép kiểm tra được đánh dấu là chưa đầy đủ), trừ SA-2026-044: phá hoại dẻo 2D vẫn bị từ chối cho đến khi #758 được đóng. SA-2026-048 được sửa sau phiên bản 0.5.0 và có trên stabileo.com từ ngày 8 tháng 11 năm 2026. SA-2026-049, SA-2026-050, SA-2026-051, SA-2026-052 và SA-2026-053 được sửa sau phiên bản 0.5.0 và có trên stabileo.com từ ngày 9 tháng 11 năm 2026. Công bố chúng là một phần cách chúng tôi kiểm chứng kết quả, không phải dấu hiệu cho thấy chúng vẫn còn mở. Một thông báo được coi là đã sửa khi bản sửa đã có trên stabileo.com, chứ không phải khi thay đổi đã tồn tại. Khi một thông báo còn mở, hãy dùng cách khắc phục tạm thời của nó và tự kiểm tra kết quả bị ảnh hưởng bằng tay trước khi ký. SA-2026-054 — Bản nháp: bản sửa chưa được hợp nhất hoặc triển khai. SA-2026-055 — Bản nháp: bản sửa chưa được hợp nhất hoặc triển khai. SA-2026-056 — Bản nháp: chưa giải quyết; chưa có bản sửa nào được hợp nhất hoặc triển khai. SA-2026-057 — Bản nháp: bản sửa chưa được hợp nhất hoặc triển khai. SA-2026-059 — Đã sửa trong PR #1921, chờ phát hành. SA-2026-060 — Bản nháp: bản sửa cục bộ đang chờ rà soát và phát hành. SA-2026-062 — Bản nháp: bản sửa cục bộ đang chờ rà soát và phát hành."
    },
    {
      "k": "note",
      "t": "SA-2026-058 — Đã sửa trong PR #1922, chờ phát hành."
    },
    {
      "k": "note",
      "t": "SA-2026-061 — Đã sửa trong PR #1952, chờ phát hành."
    },
    {
      "k": "note",
      "t": "SA-2026-063 — Đã sửa trong PR #2009, chờ phát hành."
    },
    {
      "k": "note",
      "t": "SA-2026-064 — Đã sửa trong 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-064-steel-cb-combination.md",
      "label": "SA-2026-064",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-065 — Đã sửa trong 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-065-snow-roof-step.md",
      "label": "SA-2026-065",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-066 — Đã sửa trong 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-066-cirsoc201-transverse-cm.md",
      "label": "SA-2026-066",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-067 — Đã sửa trong 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-067-snow-roof-rotation.md",
      "label": "SA-2026-067",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-068 — Đã sửa trong 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-068-provided-torsion-stirrups.md",
      "label": "SA-2026-068",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-069 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-069-torsion-secondary-shear.md",
      "label": "SA-2026-069",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-070 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-070-interior-member-couples.md",
      "label": "SA-2026-070",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-071 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-071-incomplete-concurrent-demands.md",
      "label": "SA-2026-071",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-072 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-072-snow-ridge-subdivision.md",
      "label": "SA-2026-072",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-073 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-073-snow-crossing-moment.md",
      "label": "SA-2026-073",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-074 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-074-snow-panel-subdivision.md",
      "label": "SA-2026-074",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-075 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-075-cirsoc201-secondary-stirrup-legs.md",
      "label": "SA-2026-075",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-076 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-076-wind-enclosure.md",
      "label": "SA-2026-076",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-077 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-077-wind-wall-height-transfer.md",
      "label": "SA-2026-077",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-078 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-078-wind-roof-pressure-zones.md",
      "label": "SA-2026-078",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-079 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-079-gravity-shell-coverage.md",
      "label": "SA-2026-079",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-080 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-080-floor-zone-eccentricity.md",
      "label": "SA-2026-080",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-082 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-082-snow-companion-basis.md",
      "label": "SA-2026-082",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-083 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-083-concentrated-live-actions.md",
      "label": "SA-2026-083",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-084 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-fillet-weld-physical-runs.md",
      "label": "SA-2026-084",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-085 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-fillet-weld-physical-runs.md",
      "label": "SA-2026-085",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-086 — Đã sửa trong #2316, chờ phát hành."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-086-seismic-static-story-forces.md",
      "label": "SA-2026-086",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-087 — Việc tạo tự động bị từ chối trong #2316, chờ phát hành."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-087-seismic-modal-load-generation.md",
      "label": "SA-2026-087",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-088 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-gravity-core.md#combined-member-diagram-extrema",
      "label": "SA-2026-088",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-089 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-089-roller-z-fixed.md",
      "label": "SA-2026-089",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-090 — Đã sửa trong 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-gravity-core.md#width-mode-level-mass-follows-loaded-carriers",
      "label": "SA-2026-090",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-091 — Đã hạn chế trong #2338, chờ phát hành."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-091-rc-torsion-shear-verification.md",
      "label": "SA-2026-091",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-092 — Trường hợp tổ hợp bị từ chối trong #2372 và các mặt cắt được sửa trong #2382, chờ phát hành."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-092-section-stress-shear.md",
      "label": "SA-2026-092",
      "t": "Ví dụ ống thành mỏng đặt thớ trong hệ trục địa phương của thanh (y = 0,0995 m, z = 0). Phép tính cũ cho tổng ứng suất cắt 4,5697 MPa và ứng suất von Mises 7,9149 MPa, và phép kiểm tra cho đạt với cả hai dấu của mô men xoắn. Khi các thành phần cắt cộng hưởng, tổng ứng suất cắt có dấu là 6,4625 MPa. Ứng suất von Mises tương ứng là 11,1934 MPa, vượt giới hạn chảy 9 MPa. Khi các thành phần triệt tiêu nhau, ứng suất von Mises gần bằng không và phép kiểm tra cho đạt."
    },
    {
      "k": "note",
      "t": "SA-2026-093 — Đã sửa trong #2381, chờ phát hành."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-093-plane-moving-load-axial-force.md",
      "label": "SA-2026-093",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-094 — Đã sửa trong #2364, chờ phát hành."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-094-plane-free-body-end-moments.md",
      "label": "SA-2026-094",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-095 — Đã sửa trong #2364, chờ phát hành."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-095-plane-signed-scoped-self-weight.md",
      "label": "SA-2026-095",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-096 — Đã sửa trong 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-096-static-seismic-stories-and-rafters.md",
      "label": "SA-2026-096",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-097 — Đã sửa trong 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-097-workbook-inputs-and-plane-springs.md",
      "label": "SA-2026-097",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-098 — Đã sửa trong 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-098-rc-drawn-reinforcement-verification.md",
      "label": "SA-2026-098",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-099 — Đã hạn chế trong 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-099-gravity-and-roof-step-loads.md",
      "label": "SA-2026-099",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-100 — Bản phát hành tiếp theo (0.6.4)."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-100-result-display-signs.md",
      "label": "SA-2026-100",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-101 — Bản phát hành tiếp theo (0.6.4)."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-101-plate-analysis-conformity.md",
      "label": "SA-2026-101",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-102 — Bản phát hành tiếp theo (0.6.4)."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-102-diagram-extrema-and-span-demands.md",
      "label": "SA-2026-102",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-103 — Bản phát hành tiếp theo (0.6.4)."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-103-rc-torsion-evidence.md",
      "label": "SA-2026-103",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-104 — Bản phát hành tiếp theo (0.6.4)."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-104-member-load-reversal-and-planar-couples.md",
      "label": "SA-2026-104",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-105 — Bản phát hành sau 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-105-restored-planar-moment-edits.md",
      "label": "SA-2026-105",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-106 — Bản phát hành sau 0.6.3 (hạn chế)."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-106-complementary-plate-remesh-arc.md",
      "label": "SA-2026-106",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    {
      "k": "note",
      "t": "SA-2026-107 — Bản phát hành sau 0.6.3 (hạn chế)."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-107-plate-remesh-shell-edits.md",
      "label": "SA-2026-107",
      "t": "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."
    },
    ...nextReleaseAdvisoryBlocks("Bản phát hành sau 0.6.4.", "Dữ liệu đầu vào bị ảnh hưởng và việc người dùng cần làm."),
    {
      "k": "img",
      "base": "blog/recheck-stale",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO với một khung bê tông được lưu trước khi kết quả có phiên bản. Một biểu ngữ ở phía dưới ghi “Kết quả đã lỗi thời: dự án này được tính lần cuối bằng một phiên bản cũ hơn, và có 19 thay đổi đã ghi nhận liên quan đến nó”, kèm các nút “Có gì thay đổi” và “Chạy lại”.",
      "caption": "Cách một bản sửa đến được một dự án đã lưu: cho đến khi được tính lại, kết quả của dự án vẫn được đánh dấu là đã lỗi thời, và các thay đổi liên quan chỉ cách một lần nhấp chuột."
    },
    {
      "k": "h",
      "t": "Tóm tắt"
    },
    {
      "k": "table",
      "caption": "Các thông báo an toàn đã công bố. Mức độ nghiêm trọng: nghiêm trọng khi khả năng chịu lực hoặc nhu cầu có thể lệch xa về phía không an toàn mà không có dấu hiệu nào nhìn thấy được.",
      "head": [
        "Thông báo",
        "Nội dung",
        "Mức độ",
        "Trạng thái"
      ],
      "rows": [
        [
          "SA-2026-001",
          "Các tổ hợp và tải trọng được tạo tự động (CIRSOC 101, 102, 103) thiên về phía không an toàn",
          "Cao",
          "Đã sửa trong 0.2.0"
        ],
        [
          "SA-2026-002",
          "Các kiểm tra bê tông (CIRSOC 201, ACI 318) đánh giá khả năng chịu lực cao hơn thực tế",
          "Nghiêm trọng",
          "Đã sửa trong 0.2.0"
        ],
        [
          "SA-2026-003",
          "Các kiểm tra thép, thép tạo hình nguội và mối nối đánh giá khả năng chịu lực cao hơn thực tế",
          "Nghiêm trọng",
          "Đã sửa trong 0.2.0"
        ],
        [
          "SA-2026-004",
          "Các phân tích bỏ qua một phần của mô hình (dao động, mất ổn định, phá hoại dẻo)",
          "Nghiêm trọng",
          "Đã sửa trong 0.2.0"
        ],
        [
          "SA-2026-005",
          "Thanh xiên 2D: lực dọc thiếu thành phần tải trọng dọc theo thanh",
          "Cao",
          "Đã sửa ngày 2026-10-21"
        ],
        [
          "SA-2026-006",
          "Mô hình phẳng được tính trong 3D: mô men nút và góc xoay cưỡng bức bị đảo dấu",
          "Cao",
          "Đã sửa ngày 2026-10-21"
        ],
        [
          "SA-2026-007",
          "Mất ổn định 3D thiếu các dạng xoắn hoặc uốn xoắn",
          "Cao",
          "Đã sửa ngày 2026-10-21"
        ],
        [
          "SA-2026-008",
          "Phổ phản ứng: lực cắt đáy tổ hợp theo SRSS khi dùng CQC; hệ số tham gia thiếu khối lượng liên kết với gối tựa",
          "Cao",
          "Đã sửa ngày 2026-10-21"
        ],
        [
          "SA-2026-009",
          "Vỏ khối SHB8 cứng hơn thực tế 22% khi uốn tấm mỏng (độ võng thấp hơn 18%)",
          "Trung bình (cao hơn ở kết cấu siêu tĩnh)",
          "Đã sửa ngày 2026-10-19"
        ],
        [
          "SA-2026-010",
          "Chứng nhận của phân tích phổ cho qua các kết quả không hữu hạn",
          "Trung bình",
          "Đã sửa ngày 2026-10-19"
        ],
        [
          "SA-2026-011",
          "Gối tựa 3D đổi từ lò xo sang ngàm hoặc gối cố định nhưng vẫn được tính như lò xo",
          "Cao",
          "Đã sửa ngày 2026-10-20"
        ],
        [
          "SA-2026-012",
          "Phân tích phi tuyến vật liệu (chỉ động cơ tính và WASM): nội lực thanh tính theo độ cứng đàn hồi sau khi chảy dẻo",
          "Trung bình",
          "Đã sửa trong 0.3.0"
        ],
        [
          "SA-2026-013",
          "Vỏ cong: mô men uốn được báo cáo bằng không; ứng suất giữ nguyên biến dạng nhiệt tự do",
          "Cao",
          "Đã sửa trong 0.3.0"
        ],
        [
          "SA-2026-014",
          "Phá hoại dẻo 3D: hệ số phụ thuộc vào cách đánh số phần tử (lên đến 2,4 lần tải trọng phá hoại)",
          "Cao",
          "Đã sửa trong 0.3.0"
        ],
        [
          "SA-2026-015",
          "Dây cáp có trọng lượng bản thân nhận lực căng quá nhỏ trong kết cấu siêu tĩnh",
          "Cao",
          "Đã sửa trong 0.3.0"
        ],
        [
          "SA-2026-016",
          "Cung (dầm cong của động cơ tính, công cụ vẽ cung của ứng dụng): Iy và Iz bị hoán đổi ở các đoạn gần thẳng đứng",
          "Trung bình",
          "Đã sửa trong 0.3.0"
        ],
        [
          "SA-2026-017",
          "Tương tác đất và kết cấu: các đường cong p-y, t-z và q-z lệch khỏi tài liệu tham chiếu",
          "Cao",
          "Đã sửa trong 0.3.0"
        ],
        [
          "SA-2026-018",
          "Vỏ MITC9 (chỉ động cơ tính và WASM) trên hình học cong bị biến dạng do chuyển động vật rắn",
          "Trung bình",
          "Đã sửa trong 0.3.0"
        ],
        [
          "SA-2026-019",
          "Tải trọng nhiệt độ trên thanh (động cơ tính và WASM; ứng dụng đã bù từ 2026-10-07): hệ số α của thép và chiều cao của hình chữ nhật đặc",
          "Trung bình",
          "Đã sửa trong 0.3.0"
        ],
        [
          "SA-2026-020",
          "Phân tích phi tuyến vật liệu 3D (chỉ động cơ tính và WASM): mặt chảy dẻo kém thiên về an toàn hơn so với 2D",
          "Trung bình",
          "Đã sửa trong 0.3.0"
        ],
        [
          "SA-2026-021",
          "Mái tự do: không có gió dọc theo đỉnh mái và, theo phương vuông góc với đỉnh mái, nhỏ hơn mức tối thiểu của §2.1.5 (17% mức đó ở 20 m/s)",
          "Cao",
          "Đã sửa trong 0.4.0"
        ],
        [
          "SA-2026-022",
          "Khi có áp lực đất H, tổ hợp mà tĩnh tải chống lại áp lực đó bị thiếu (thấp hơn 27 đến 45% trong một ví dụ)",
          "Cao",
          "Đã sửa trong 0.4.0"
        ],
        [
          "SA-2026-023",
          "Cột bê tông cốt thép: phép kiểm tra chỉ đọc một dấu của mô men; cách bố trí thanh không đối xứng (6, 10, 14…) được cho đạt theo phía mạnh hơn",
          "Nghiêm trọng",
          "Đã sửa trong 0.4.0"
        ],
        [
          "SA-2026-024",
          "Móng, nút khung, sàn, tường và bộ tối ưu thép được thiết kế theo tải trọng chưa nhân hệ số khi các tổ hợp đã được định nghĩa nhưng chưa được tính (tính toán trực tiếp, tính tổ hợp thất bại, hoặc danh sách tổ hợp đang dùng bị rỗng)",
          "Cao",
          "Đã sửa trong 0.4.0"
        ],
        [
          "SA-2026-025",
          "Lực cắt AISC 360 G2 (chỉ động cơ tính và WASM): khi thiếu diện tích bụng, phép kiểm tra cho đạt với hệ số 0 và còn được chứng nhận",
          "Trung bình",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-026",
          "Lực cắt EC3 6.2.6 (chỉ động cơ tính và WASM): khi thiếu diện tích chịu cắt, phép kiểm tra lấy Av = 0.5·A, Vpl,Rd cao hơn 57% trên một HEB 300 và còn được chứng nhận",
          "Trung bình",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-027",
          "Biểu đồ bao của vỏ: giữ tổ hợp có ứng suất Von Mises lớn nhất, chứ không phải giá trị cực trị của từng thành phần (mx thấp hơn 14% trong một ví dụ)",
          "Cao",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-028",
          "Uốn theo EN 1992-1-1 (các tiêu chuẩn khác của PRO, có chứng nhận): giả định cốt thép chịu kéo đã chảy dẻo và không lặp lại cho các thanh phía trên; MRd cao hơn thực tế đến 22%",
          "Cao",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-029",
          "3D: các cột CIRSOC 201 trong ứng dụng được thiết kế với Mz theo chiều cao tiết diện (thiếu 36% cốt thép trong một ví dụ); các kiểm tra 3D có chứng nhận của động cơ tính đọc lực cắt ngang Vy như lực cắt của bụng",
          "Nghiêm trọng",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-030",
          "Nén theo CIRSOC 301: một tiết diện có diện tích nhỏ hơn diện tích các bản của nó nhận Qa âm và khả năng chịu lực vượt quá tải chảy dẻo toàn tiết diện, và được cho đạt",
          "Cao",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-031",
          "Lịch sử thời gian: tải trọng đặt tại t = 0 lên một bậc tự do không có khối lượng bị mất ở bước đầu tiên (tính tương hỗ sai lệch đến 33 lần, một chuỗi hai bậc tự do lệch 24% so với nghiệm giải tích)",
          "Trung bình",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-032",
          "Phân tích dao động riêng: dạng dao động có tần số bằng không của một cơ cấu bị bỏ đi và các dạng còn lại được trả về như thể đầy đủ",
          "Trung bình",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-033",
          "Bộ tạo tải trọng: một sàn có một thanh thấp nằm dưới một phần của nó bị mất toàn bộ tải trọng diện tích (36 m² của một sàn 6 × 6 m trong một ví dụ); giàn không được tính là kết cấu mái",
          "Cao",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-034",
          "Phép kiểm tra cân bằng báo tải trọng và phản lực khớp nhau ở những trường hợp mà phép kiểm tra đã bỏ sót tải trọng; các chỉnh sửa trên tầng tương tự lan sang các thanh thuộc loại khác và các bản sao mất giải phóng đầu thanh",
          "Trung bình",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-035",
          "Chuyển từ 3D sang 2D: phép cắt làm các thanh uốn quanh sai trục tiết diện (một khung cổng trong mặt phẳng Y–Z cứng hơn thực tế 13,5 lần)",
          "Cao",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-036",
          "Chuyển từ 3D sang 2D trên mặt phẳng Y–Z hoặc X–Y: các liên kết được đọc như thể khung nằm trong mặt phẳng X–Z (các giằng chuyển vị ngang bị bỏ hoặc đặt ngoài mặt phẳng)",
          "Cao",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-037",
          "Phân tích đồng xoay 3D: các vectơ góc xoay bị trừ trực tiếp (bài toán uốn Bathe–Bolourchi lệch 1,3%, không giảm khi chia lưới mịn hơn)",
          "Trung bình",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-038",
          "Mất ổn định 3D: hệ số của các thanh có lực nén tăng dần dọc theo thanh dưới tải trọng dọc trục cho kết quả cao (+43% với một thanh), và một thanh chỉ chịu nén giữa hai đầu bị từ chối",
          "Cao",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-039",
          "Nhập Excel và IFC: Iy và Iz của tiết diện chữ nhật và ống bị hoán đổi (một công xôn 20 × 40 mềm hơn thực tế 4 lần, một công xôn 40 × 20 cứng hơn thực tế 4 lần)",
          "Cao",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-040",
          "Các kiểm tra ACI 318 và EN 1992: các cấu kiện bê tông cốt thép được cho đạt mà không kiểm tra xoắn",
          "Cao",
          "Đã hạn chế trong 0.5.0"
        ],
        [
          "SA-2026-041",
          "Cột bê tông cốt thép: mô men lớn nhất chỉ được kiểm tra dưới lực nén lớn nhất",
          "Cao",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-042",
          "Mất ổn định 2D: hệ số của các thanh có lực nén tăng dần dọc theo thanh dưới tải trọng dọc trục cho kết quả cao (+43% đến +68% với một thanh)",
          "Cao",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-043",
          "Phân tích điều hòa: phần hiệu chỉnh cho các dạng dao động bị bỏ qua mất chữ số có nghĩa khi một dạng mềm hơn hẳn các dạng còn lại (79 lần ở 2,3 Hz trong một ví dụ)",
          "Cao",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-044",
          "Phá hoại dẻo 2D: hệ số phá hoại thay đổi theo cách đánh số nút, hướng thanh và đơn vị (lên đến 4,6 lần trên cùng một kết cấu)",
          "Cao",
          "Chưa sửa trong 0.5.0: phá hoại dẻo 2D bị giữ lại cho đến khi #758 được đóng; phân tích giới hạn có trong 0.5.0"
        ],
        [
          "SA-2026-045",
          "Phá hoại dẻo 3D: một thanh không có mô men dẻo dùng được bị coi như thanh không bao giờ chảy dẻo (cao hơn 6 lần trong một ví dụ, và còn được chứng nhận)",
          "Cao",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-046",
          "Phân tích điều hòa: chọn giữa chồng chất dạng dao động và giải trực tiếp cho từng tải trọng, nên nguyên lý chồng chất và tính tương hỗ bị phá vỡ (107% tại một nút trong một ví dụ); stabileo.com và các bản dựng động cơ tính/WASM của nhánh main, từ ngày 5 tháng 11 năm 2026 cho đến khi sửa",
          "Cao",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-047",
          "Vỏ: một trường hợp tải áp đặt chuyển vị gối tựa bị mất ứng suất vỏ, và các tổ hợp cùng biểu đồ bao chỉ cộng ứng suất vỏ của các trường hợp khác (có thể thiên về phía không an toàn, không có cảnh báo); 0.2.0 đến 0.4.0",
          "Cao",
          "Đã sửa trong 0.5.0"
        ],
        [
          "SA-2026-048",
          "Thép theo CIRSOC 301: Cb bỏ sót sự đổi dấu ở hai đầu của một chiều dài không giằng được khai báo ngắn hơn thanh (một thép chữ C uốn hai chiều cong nhận Cb = 2,55 thay vì 1, làm tăng khả năng chịu mất ổn định xoắn ngang); 0.2.0 đến 0.5.0, các bản alpha cho máy tính để bàn và stabileo.com cho đến ngày 8 tháng 11 năm 2026",
          "Cao",
          "Đã sửa sau 0.5.0; có trên stabileo.com từ ngày 8 tháng 11 năm 2026"
        ],
        [
          "SA-2026-049",
          "Gối tựa có lò xo dương và liên kết cứng trên cùng một bậc tự do: trong 3D, lò xo làm nhả liên kết và thay đổi điều kiện biên; mã của động cơ tính trong 0.2.0 đến 0.5.0",
          "Cao",
          "Đã sửa sau 0.5.0; có trên stabileo.com từ ngày 9 tháng 11 năm 2026"
        ],
        [
          "SA-2026-050",
          "Phân tích mất ổn định có thể biến một phép tính độ mảnh thất bại thành giá trị không, và phân tích nhiều trường hợp có thể trả về các giá trị không hữu hạn bên trong một kết quả thành công",
          "Trung bình",
          "Đã sửa sau 0.5.0; có trên stabileo.com từ ngày 9 tháng 11 năm 2026"
        ],
        [
          "SA-2026-051",
          "Tải trọng di động 3D: biểu đồ bao bỏ sót các đỉnh nội lực ở bên trong và mất thành phần dọc trục của trọng lượng trục xe trên các thanh xiên, có thể đánh giá thấp nhu cầu mà không có cảnh báo; 0.2.0 đến 0.5.0 và desktop-v0.1.0-alpha.1 đến alpha.3",
          "Cao",
          "Đã sửa sau 0.5.0; có trên stabileo.com từ ngày 9 tháng 11 năm 2026"
        ],
        [
          "SA-2026-052",
          "Tải trọng di động của động cơ tính 2D và 3D: biểu đồ bao lực dọc khi có tải trọng phân bố dọc trục một phần cố định đã bỏ sót các cực trị tại biên của vùng tải giữa các mặt cắt, có thể đánh giá thấp nhu cầu mà không có cảnh báo; không xác định ranh giới phiên bản đã phát hành",
          "Cao",
          "Đã sửa sau 0.5.0; có trên stabileo.com từ ngày 9 tháng 11 năm 2026"
        ],
        [
          "SA-2026-053",
          "Tải trọng di động 2D và 3D: các tải trọng tập trung tại đầu mút đưa vào biểu đồ bao cả những lực nằm ngoài thanh, thêm các cực trị lực dọc và lực cắt giả và đánh giá cao nhu cầu; không xác định ranh giới phiên bản đã phát hành",
          "Thấp",
          "Đã sửa sau 0.5.0; có trên stabileo.com từ ngày 9 tháng 11 năm 2026"
        ],
        [
          "SA-2026-054",
          "Phân tích tuyến tính có thể âm thầm trả về kết quả không chính xác do độ cứng chưa được xử lý hoặc bỏ sót các thành phần tải trọng của PCG",
          "Cao",
          "Bản nháp: bản sửa chưa được hợp nhất hoặc triển khai"
        ],
        [
          "SA-2026-055",
          "P-Delta 2D và 3D có thể đánh giá thấp hệ số khuếch đại và báo là ổn định khi lực dọc thay đổi dưới tải trọng phân bố hoặc tải trọng tập trung dọc theo một thanh khung",
          "Cao",
          "Bản nháp: bản sửa chưa được hợp nhất hoặc triển khai"
        ],
        [
          "SA-2026-056",
          "Mô hình khung và vỏ 3D có liên kết ràng buộc: kết quả phân tích điều hòa và lịch sử thời gian cưỡng bức thay đổi khi mô tả tương đương; phạm vi ảnh hưởng ngoài mô hình đã giữ lại chưa được xác định",
          "Cao",
          "Bản nháp: chưa giải quyết; chưa có bản sửa nào được hợp nhất hoặc triển khai"
        ],
        [
          "SA-2026-057",
          "Phần hiển thị chứng nhận dẻo có thể ghi các hệ số nằm ngoài khoảng đã chứng nhận là nằm trong khoảng; việc trích xuất cơ cấu chính xác đã bỏ qua các từ chối do giới hạn tài nguyên trong các bản dựng PR #1888 trước khi sửa",
          "Trung bình",
          "Bản nháp: bản sửa chưa được hợp nhất hoặc triển khai"
        ],
        [
          "SA-2026-058",
          "Các mô hình điều hòa 2D/3D lớn với trên 3000 bậc tự do tự do độc lập có thể giữ lại đáp ứng không chính xác của các dạng dao động bị bỏ qua ngoài q ≤ 1/16 ở những tần số nằm ngoài phạm vi của cảnh báo cắt cụt (đo được sai số mục tiêu phức 8,079%)",
          "Cao",
          "Đã sửa trong PR #1922, chờ phát hành"
        ],
        [
          "SA-2026-059",
          "Các phân tích nâng cao trên web có thể cho dây cáp khả năng chịu nén mà không có cảnh báo (phát lại P-Delta: −4.599884347090908 kN); hãy rà soát lại nhu cầu của các mô hình cáp từ các phân tích nâng cao, phân tích trực tiếp và các trình hướng dẫn giảng dạy",
          "Cao",
          "Đã sửa trong PR #1921, chờ phát hành"
        ],
        [
          "SA-2026-060",
          "Phân tích theo giai đoạn có thể âm thầm làm cứng các góc xoay thực sau khi đổi đơn vị hoặc tại các đầu được giải phóng có lò xo gối tựa; hãy kiểm tra lại các mô hình theo giai đoạn có giải phóng đầu thanh",
          "Cao",
          "Bản nháp: bản sửa cục bộ đang chờ rà soát và phát hành"
        ],
        [
          "SA-2026-061",
          "Điều khiển theo chiều dài cung và điều khiển theo chuyển vị đã bỏ sót phản lực và dùng tải trọng thanh chưa được nhân tỷ lệ; các thiếu sót kết quả của liên kết ràng buộc 2D/3D, Guyan, giai đoạn và lịch sử thời gian cũng cần được rà soát. Hãy chạy lại các kết quả bị ảnh hưởng hoặc kiểm chứng độc lập; 0.2.0–0.5.0 và các bản dựng main bị ảnh hưởng sau đó.",
          "Cao",
          "Đã sửa trong PR #1952, chờ phát hành"
        ],
        [
          "SA-2026-062",
          "Phân tích dẻo 3D thô có thể âm thầm báo về giá trị không khi trạng thái đàn hồi ban đầu thất bại; các bản dựng có chứng nhận cũ hơn vẫn giữ hệ số đó. Nhánh main đã trả về một cận dương có chứng nhận kèm cảnh báo; PR #1943 chuyển tiếp sự từ chối ban đầu",
          "Cao",
          "Bản nháp: bản sửa cục bộ đang chờ rà soát và phát hành"
        ],
        [
          "SA-2026-063",
          "Các phân tích theo giai đoạn và phi tuyến có liên kết ràng buộc đã bỏ qua chuyển động cưỡng bức của nút chủ; phân tích cáp và lịch sử thời gian hiện từ chối chuyển động gối tựa không được hỗ trợ. Các cảnh báo động lực học chung hiện có vẫn tách biệt với thiếu sót này",
          "Cao",
          "Đã sửa trong PR #2009, chờ phát hành"
        ],
        [
          "SA-2026-064",
          "Cb của thép có thể lấy từ một tổ hợp khác hoặc từ một đoạn không giằng ngắn không xác định được vị trí (#1316, #2088). Hãy chạy lại các kiểm tra thép CIRSOC 301 và rà soát khả năng chịu uốn, hệ số sử dụng tương tác và các tổ hợp quyết định.",
          "Cao",
          "Đã sửa trong 0.6.1"
        ],
        [
          "SA-2026-065",
          "Tuyết tích tụ tại bậc mái có thể bị bỏ sót trên mái dốc đón tuyết (#2082). Hãy tạo lại tải trọng tuyết CIRSOC 104 và chạy lại các phân tích và kiểm tra thiết kế bị ảnh hưởng.",
          "Cao",
          "Đã sửa trong 0.6.1"
        ],
        [
          "SA-2026-066",
          "Cm của bê tông có thể được tính lợi do mô men đầu khi có tải trọng ngang giữa các gối tựa (#2089). Hãy kiểm tra lại các cột và tường bê tông mảnh, mô men đã khuếch đại và cốt thép.",
          "Cao",
          "Đã sửa trong 0.6.1"
        ],
        [
          "SA-2026-067",
          "Việc xoay mặt bằng có thể làm thay đổi tải trọng tuyết được tạo tự động (#2093). Hãy tạo lại tải trọng theo hình học mái thực tế, rồi chạy lại các phân tích và kiểm tra; xoay mô hình cũ trở lại không phải là cách khắc phục.",
          "Cao",
          "Đã sửa trong 0.6.1"
        ],
        [
          "SA-2026-068",
          "Kiểm tra xoắn có thể cho đạt dù cốt đai thiết kế không đủ (#2141). Hãy chạy lại các kiểm tra thiết kế bê tông và rà soát khả năng chịu lực ngang thực tế, bước cốt đai và các trường hợp không đạt về xoắn. Cốt dọc chưa được kiểm tra không thể coi là một khung cốt thép đạt yêu cầu.",
          "Cao",
          "Đã sửa trong 0.6.1"
        ],
        [
          "SA-2026-069",
          "Giới hạn tiết diện về xoắn đã bỏ sót lực cắt thứ cấp đồng thời (#2142). Hãy chạy lại các thiết kế bê tông và rà soát các tiết diện không đạt cùng cốt đai bị thiếu; thêm cốt đai không thể khắc phục việc vượt giới hạn tiết diện.",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-070",
          "Độ võng và góc xoay bên trong thanh đã bỏ sót các tải trọng trên nhịp (#2143). Hãy rà soát hình dạng biến dạng, các giá trị hiển thị ở chế độ giáo dục và các kiểm tra sử dụng bình thường của thép và bê tông, kể cả tải hình thang đầy đủ và một phần. Việc khôi phục có tải mà thiếu EI hiện từ chối một cách rõ ràng.",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-071",
          "Kiểm tra thanh có thể cho đạt khi các nhu cầu đồng thời chưa đầy đủ (#2096). Hãy chạy lại các thiết kế bê tông và thép và rà soát các tổ hợp, thanh, mặt cắt và chứng nhận.",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-072",
          "Việc chia nhỏ mép mái không đều có thể làm dịch chuyển đường đỉnh tuyết và thay đổi tải trọng được tạo tự động (#2144). Hãy tạo lại tải trọng tuyết, rồi chạy lại các phân tích, tổ hợp và kiểm tra thiết kế. Chỉ tính lại các tải trọng đã lưu thì không sửa được chúng.",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-073",
          "Các thanh cắt qua đỉnh mái tuyết nhận một áp lực đều duy nhất và mất mô men tải trọng vật lý. Tải trọng nay được tách tại đỉnh mái vật lý. Hãy tạo lại mọi tải trọng diện tích đã tạo bị ảnh hưởng, rồi chạy lại các phân tích, tổ hợp và phép kiểm tra thiết kế. Chỉ giải lại các tải trọng đã tạo và lưu thì không sửa được chúng. (#2176).",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-074",
          "Việc chia nhỏ một kèo dốc có thể phân loại một tấm mái tường minh là sàn và âm thầm loại bỏ tuyết ở mép mái của nó. Việc phân loại mái của tấm nay dùng vùng chiếm chỗ vật lý của tấm. Hãy tạo lại mọi tải trọng diện tích đã tạo bị ảnh hưởng, rồi chạy lại các phân tích, tổ hợp và phép kiểm tra thiết kế. Chỉ giải lại các tải trọng đã lưu thì không sửa được chúng. (#2172). Một kèo dốc không bị tách nằm trên một tấm thấp hơn riêng biệt cũng có thể phân loại nhầm tấm đó là mái, làm thay đổi các tải trọng diện tích mái/sàn và âm thầm thêm tuyết ở chế độ bề rộng.",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-075",
          "Các kiểm tra lực cắt thứ cấp và xoắn theo CIRSOC 201-2005 và 2025 có thể tính nhánh cốt đai và bề rộng của phương chính. Dầm và cột có thể được cho đạt mà không có cảnh báo dù cốt thép thứ cấp quá ít (#2171). Sau khi cập nhật, hãy chạy lại thiết kế bê tông cốt thép và xem thông báo kiểm tra lại của dự án đã lưu.",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-076",
          "Một bức tường hở có thể làm công trình bị phân loại là hở và loại bỏ áp lực bên trong (#2203). Hãy rà soát từng bản ghi lỗ mở của tường và mái, phân loại lại lớp bao che, tạo lại W và Wa, rồi chạy lại các phân tích, tổ hợp và kiểm tra thiết kế. Chỉ tính lại các tải trọng đã lưu thì không sửa được chúng.",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-077",
          "Gió lên tường đã bỏ sót các lực lên móng và thay đổi khi chia nhỏ (#2204). Hãy rà soát từng bản ghi lỗ mở của tường và mái, phân loại lại lớp bao che, tạo lại W và Wa, rồi chạy lại các phân tích, tổ hợp và kiểm tra thiết kế. Chỉ tính lại các tải trọng đã lưu thì không sửa được chúng.",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-078",
          "Các vùng áp lực mái và mô men bậc nhất của chúng phụ thuộc vào cách chia nhỏ (#2205). Hãy rà soát từng bản ghi lỗ mở của tường và mái, phân loại lại lớp bao che, tạo lại W và Wa, rồi chạy lại các phân tích, tổ hợp và kiểm tra thiết kế. Chỉ tính lại các tải trọng đã lưu thì không sửa được chúng.",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-079",
          "Vỏ phủ một phần có thể làm mất tải trọng trọng lực hoặc đặt nó sai mặt cắt. Hãy tạo lại tải trọng trọng lực ở chế độ ô sàn cùng với vỏ, rồi chạy lại phân tích và thiết kế. (#2199, #2200)",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-080",
          "Các vùng sàn đòi hỏi tải trọng lệch tâm lên thanh bị từ chối. Hãy xem lại định nghĩa tải trọng sàn trước khi tính. Một vùng phủ trọn một ô sàn áp dụng các phản lực thông thường của ô sàn. (#2201)",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-082",
          "Các tổ hợp đi kèm đã âm thầm dùng tuyết đã giảm theo độ dốc thay cho tải trọng tuyết mái phẳng lên thanh. Các đặc tả động đất cũ cũng có thể lẫn lộn tuyết thực với tuyết mái phẳng. Hãy tạo lại các tải trọng tuyết và các tổ hợp, rồi chạy lại các phân tích và phép kiểm tra thiết kế. (#2211).",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-083",
          "SA-2026-083: chức năng tự động tạo tải trọng theo CIRSOC 101 chặn các tác động tập trung của công năng sử dụng và của mái mà vị trí đặt bất lợi nhất chưa được đánh giá (§4.4). Các tải trọng phân bố đều đã tạo trước đây có thể bỏ sót các tác động bất lợi nhất. Hãy rà soát các mô hình bị ảnh hưởng và kiểm tra thủ công các tác động tập trung trước khi chạy lại phân tích và thiết kế. (#2207).",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-084",
          "Việc chia nhỏ một đường hàn góc chịu tải ở đầu có thể làm mất hệ số giảm chiều dài hiệu quả của nó (#2243). Hãy chạy lại các kiểm tra nhóm đường hàn bị ảnh hưởng.",
          "—",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-085",
          "Một đường hàn góc ngắn có thể được tính cạnh hiệu quả quá lớn (#2244). Hãy chạy lại các kiểm tra nhóm đường hàn bị ảnh hưởng.",
          "—",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-086",
          "Các tải trọng động đất tĩnh được tạo tự động có thể cho lực tầng và tác động lên thanh không chính xác. Hãy tạo lại các tải trọng bị ảnh hưởng và chạy lại các phân tích và thiết kế.",
          "Cao",
          "Đã sửa trong #2316, chờ phát hành"
        ],
        [
          "SA-2026-087",
          "Việc tạo tải trọng động đất theo dạng dao động có thể cho nội lực thanh không chính xác. Hãy tạo lại các tải trọng bị ảnh hưởng bằng phương pháp tĩnh nếu áp dụng được, hoặc chờ #2319.",
          "Cao",
          "Việc tạo tự động bị từ chối trong #2316, chờ phát hành"
        ],
        [
          "SA-2026-088",
          "Các biểu đồ thanh ABS và SRSS bao gồm các cực trị của hàm tổ hợp giữa các biên tải. Hãy chạy lại các tổ hợp, biểu đồ và các kiểm tra phụ thuộc (#2273).",
          "—",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-089",
          "Một gối tựa 3D loại rollerZ hoặc custom3d không có liên kết khai báo rõ, hoặc một loại gối tựa không xác định, đã được phân tích như ngàm hoàn toàn mà không có cảnh báo. Hãy xem lại các liên kết dự định của gối tựa, rồi chạy lại phân tích, tổ hợp và thiết kế. (#2276).",
          "Cao",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-090",
          "Diện tích mỗi cao độ và trọng lượng động đất ở chế độ bề rộng có thể không khớp với tải trọng lên thanh được tạo tự động vì chúng dùng phạm vi của các nút hoặc đòi hỏi một vùng kín. Nay chúng dùng diện tích truyền tải của các cấu kiện nhận tải. Hãy tạo lại các phương án tải trọng lực, trọng lượng động đất và tải trọng động đất, rồi chạy lại các phân tích, tổ hợp và kiểm tra thiết kế phụ thuộc. Chỉ tính lại các tải trọng đã lưu thì không sửa được các tác động động đất (#2269). (#2210)",
          "—",
          "Đã sửa trong 0.6.2"
        ],
        [
          "SA-2026-091",
          "Các kiểm tra cắt, xoắn và đai kín chịu động đất của bê tông có thể cho đạt mà không có bằng chứng về cốt thép. Hãy chạy lại các thiết kế có chứng nhận và rà soát các mặt cắt quyết định, bản vẽ cốt thép và báo cáo.",
          "Cao",
          "Đã hạn chế trong #2338, chờ phát hành"
        ],
        [
          "SA-2026-092",
          "Ứng suất chi tiết trong tiết diện có thể đánh giá thấp tổng ứng suất cắt và von Mises và cho kết quả đạt. Hãy tính lại các ứng suất bị ảnh hưởng và rà soát các biểu đồ, kiểm tra và báo cáo.",
          "Cao",
          "Trường hợp tổ hợp bị từ chối trong #2372 và các mặt cắt được sửa trong #2382, chờ phát hành"
        ],
        [
          "SA-2026-093",
          "Tải trọng di động phẳng có thể làm nhòe các bước nhảy lực dọc tại các trục xe tập trung. Hãy chạy lại các biểu đồ bao và đường ảnh hưởng lực dọc bị ảnh hưởng, và rà soát các báo cáo đã dựa vào chúng.",
          "Cao",
          "Đã sửa trong #2381, chờ phát hành"
        ],
        [
          "SA-2026-094",
          "Công cụ xem vật thể tự do 2D có thể hiển thị các mô men đầu thanh trong hệ tọa độ tổng thể với sai dấu. Kết quả phân tích không bị ảnh hưởng. Hãy xem lại các thanh, đồng thời tạo lại và rà soát các báo cáo bị ảnh hưởng.",
          "Trung bình",
          "Đã sửa trong #2364, chờ phát hành"
        ],
        [
          "SA-2026-095",
          "Các dự án 2D đã lưu có quy tắc trọng lượng bản thân theo dấu hoặc theo phạm vi có thể trả về phản lực sai mà không có cảnh báo. Một thông báo kiểm tra lại xuất hiện khi mở các dự án bị ảnh hưởng. Hãy tính lại kết quả, rồi tạo lại và rà soát các báo cáo bị ảnh hưởng.",
          "Cao",
          "Đã sửa trong #2364, chờ phát hành"
        ],
        [
          "SA-2026-096",
          "Việc tạo tải trọng động đất tĩnh có thể đếm các nút giằng hoặc nút lưới như các tầng và đặt quán tính của kèo tại các nút đầu. Hãy kiểm tra cao độ các tầng và tải trọng lên kèo. Hãy tạo lại các trường hợp tải trước khi chạy lại phân tích và kiểm tra thiết kế.",
          "Cao",
          "Đã sửa trong 0.6.3"
        ],
        [
          "SA-2026-097",
          "Việc nhập sổ làm việc có thể bỏ sót dữ liệu mô hình và các tệp xuất 2D có thể ghi một lò xo xoay là lò xo tịnh tiến. Hãy so sánh mô hình đã nhập với sổ làm việc gốc. Hãy sửa và nhập lại, kiểm tra các gối tựa và tải trọng, rồi chạy lại các phân tích bị ảnh hưởng và tạo lại các tệp xuất.",
          "Cao",
          "Đã sửa trong 0.6.3"
        ],
        [
          "SA-2026-098",
          "Các kiểm tra bê tông có thể chấp nhận bước cốt đai quá lớn hoặc tính cả cốt thép không có tại tiết diện. Bản vẽ cột có thể hiển thị sai đường kính thanh. Hãy kiểm tra lại theo cốt thép đã bố trí và các nhu cầu đồng thời, rồi rà soát các bản vẽ, bảng thống kê và báo cáo bị ảnh hưởng.",
          "Cao",
          "Đã sửa trong 0.6.3"
        ],
        [
          "SA-2026-099",
          "Việc tạo tải trọng lực có thể đặt tải lên các vùng vỏ và dầm hai lần hoặc thay đổi việc gán cấu kiện nhận tải sau khi xoay hoặc chia nhỏ. Việc truyền tuyết tại bậc mái có thể làm mất lực và mô men. Hãy tạo lại các tải trọng và dùng các trường hợp tải đã được kiểm chứng độc lập ở những nơi việc tạo tự động bị từ chối.",
          "Cao",
          "Đã hạn chế trong 0.6.3"
        ],
        [
          "SA-2026-100",
          "Mô men phản lực, các giá trị hiển thị của vật thể tự do và bảng liệt kê tải trọng tập trung có thể hiện sai dấu hoặc sai trục. Hãy kiểm chứng các giá trị hiển thị với điều kiện cân bằng và hướng tải trọng dự định. Hãy xem lại các kết quả bị ảnh hưởng và tạo lại báo cáo.",
          "Trung bình",
          "Bản phát hành tiếp theo (0.6.4)"
        ],
        [
          "SA-2026-101",
          "PRO có thể tính khi thiếu các tấm, với lưới dựa trên dữ liệu đầu vào chưa đầy đủ hoặc với các mối nối tường–sàn không liên thông. Hãy so sánh lưới với hình học dự định, sửa các tấm và các chỗ nối bị ảnh hưởng, rồi chạy lại phân tích và kiểm tra thiết kế.",
          "Cao",
          "Bản phát hành tiếp theo (0.6.4)"
        ],
        [
          "SA-2026-102",
          "Các biểu đồ có thể cho đỉnh hoặc nội lực mặt cắt sai gần các tác động tập trung, và các đoạn nhịp bị đảo chiều có thể làm hoán đổi các mặt thiết kế bê tông. Hãy kiểm tra các nội lực quyết định, các mặt đặt cốt thép và dữ liệu đầu vào về građien mô men của thép. Hãy chạy lại các phân tích và kiểm tra bị ảnh hưởng.",
          "Cao",
          "Bản phát hành tiếp theo (0.6.4)"
        ],
        [
          "SA-2026-103",
          "Các kiểm tra xoắn và cắt của bê tông có thể chấp nhận cốt thép ngang không đủ hoặc tính cả các thanh chu vi hay thanh chịu kéo chưa được kiểm chứng. Hãy lặp lại việc kiểm tra theo cốt thép thực tế và các nhu cầu đồng thời, và rà soát các báo cáo bị ảnh hưởng.",
          "Cao",
          "Bản phát hành tiếp theo (0.6.4)"
        ],
        [
          "SA-2026-104",
          "Việc đảo chiều thanh có thể làm đổi hướng tải trọng phân bố, và phân tích có thể bỏ sót các ngẫu lực tập trung phẳng của phiên bản cũ. Hãy kiểm tra hướng tải trọng đã lưu, tung độ tại hai đầu và các trường ngẫu lực. Hãy sửa các tải trọng và chạy lại các phân tích và kiểm tra thiết kế bị ảnh hưởng.",
          "Cao",
          "Bản phát hành tiếp theo (0.6.4)"
        ],
        [
          "SA-2026-105",
          "Sửa một ngẫu lực tập trung phẳng đã khôi phục về không có thể khiến mô men cũ vẫn còn tác dụng. Hãy kiểm tra và nhập lại các mô men dự định, rồi chạy lại các phân tích và kiểm tra thiết kế bị ảnh hưởng.",
          "Cao",
          "Bản phát hành sau 0.6.3"
        ],
        [
          "SA-2026-106",
          "Việc chia lưới lại có thể dùng cung bù của biên tấm cong. Hãy kiểm tra lưới so với góc quét đã chỉ định, dựng lại các lưới bị ảnh hưởng, rồi chạy lại phân tích và kiểm tra thiết kế.",
          "Cao",
          "Bản phát hành sau 0.6.3 (hạn chế)"
        ],
        [
          "SA-2026-107",
          "Việc chia lưới lại có thể làm mất độ lệch của vỏ và các chỉnh sửa độ cong. Hãy kiểm tra và khôi phục các đặc trưng vỏ dự định trước khi chạy lại phân tích và kiểm tra thiết kế.",
          "Cao",
          "Bản phát hành sau 0.6.3 (hạn chế)"
        ],
        [
          "SA-2026-108",
          "Phép chiếu lên mặt phẳng XZ hoặc YZ có thể âm thầm bỏ mất thành phần lực nút vuông góc với mặt phẳng phân tích. Hãy kiểm tra các lực nút trong từng trường hợp tải và chạy lại các phân tích và kiểm tra thiết kế bị ảnh hưởng bằng mô hình không gian.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-109",
          "Các nhãn gối tựa phẳng không xác định trong DXF có thể âm thầm được nhập thành gối cố định. Hãy so sánh các gối tựa đã nhập với bản vẽ gốc, sửa các chỗ không khớp và chạy lại các phân tích bị ảnh hưởng.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-110",
          "Phân tích trên web có thể âm thầm bỏ sót một lò xo có độ cứng không hữu hạn hoặc một trường hợp tải trong một tổ hợp. Hãy kiểm tra độ cứng lò xo, tên các trường hợp tải và hệ số thực, rồi chạy lại các phân tích và tổ hợp bị ảnh hưởng.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-111",
          "Việc tạo tải trọng lực tự động theo ô sàn có thể đếm cùng một tải trọng sàn hai lần. Hãy kiểm tra các vỏ chồng lên nhau và các ô dầm liên thông, tạo lại các phương án tải trọng lực đã lưu bị ảnh hưởng và chạy lại các phân tích bị ảnh hưởng.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-112",
          "Basic 3D có thể âm thầm bỏ qua toàn bộ phần tử vỏ. Hãy chạy lại các trường hợp tải và tổ hợp bị ảnh hưởng trong PRO 3D với lưới vỏ đầy đủ, rồi lặp lại các kiểm tra thiết kế phụ thuộc.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-113",
          "API Rust gốc có thể chứng nhận các kết quả tuyến tính được cung cấp cho một trường hợp tải mà bộ giải đã từ chối. Hãy chạy lại các phân tích và việc chứng nhận bị ảnh hưởng, kể cả các tổ hợp và biểu đồ bao phụ thuộc.",
          "Trung bình",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-114",
          "Các quy tắc tổ hợp đã lưu có thể áp dụng hệ số cho sai nhóm tải trọng mà không có cảnh báo. Hãy khôi phục các nhóm dự định, tạo lại các tổ hợp và trường hợp tải tổ hợp bị ảnh hưởng, rồi chạy lại các phân tích và biểu đồ bao của chúng.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-115",
          "Việc tạo tải trọng lực theo ô sàn có thể đặt tải lên cùng một vùng sàn qua nhiều cấu kiện nhận tải. Hãy tạo lại các phương án tải trọng lực bị ảnh hưởng, xử lý các tải trọng hoặc hình học mâu thuẫn, rồi chạy lại các phân tích bị ảnh hưởng.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-116",
          "Các bộ giải phi tuyến có thể chấp nhận một đường đi theo chiều dài cung không đúng hoặc bỏ sót lực tiếp tuyến tại gối di động nghiêng. Hãy chạy lại các phân tích phi tuyến phẳng và đồng xoay không gian bị ảnh hưởng, kể cả các khung cong có tâm uốn lệch.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-117",
          "Khối lượng riêng của vỏ âm hoặc bằng không có thể làm đảo chiều hoặc bỏ mất trọng lượng bản thân. Hãy khôi phục các khối lượng riêng dự định, chạy lại các trường hợp tải tĩnh và tổ hợp bị ảnh hưởng, rồi lặp lại các kiểm tra phụ thuộc.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-118",
          "Một đối tượng nhóm trọng lượng bản thân không hợp lệ có thể làm mất trọng lượng của nhóm. Hãy sửa đối tượng đó, chạy lại các trường hợp tải và tổ hợp bị ảnh hưởng, rồi dựng lại các biểu đồ bao của chúng.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-119",
          "Một khối lượng riêng vật liệu bị bỏ sót có thể cho tần số dao động riêng không chính xác. Hãy khôi phục khối lượng riêng, dựng lại nguồn khối lượng và chạy lại các phân tích dao động bị ảnh hưởng.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-120",
          "Tải trọng lực tự động có thể nhân đôi tải trọng của bản sàn, truyền tải sang các ô vượt quá giới hạn nhịp tự động, hoặc phân loại sai điều kiện tiếp xúc của mái và sàn. Hãy tạo lại các phương án tải trọng lực, tuyết và gió bị ảnh hưởng, kiểm tra các tải trọng, rồi chạy lại các phân tích phụ thuộc.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-121",
          "Phân tích phi tuyến phẳng có thể trả về kết quả không chính xác đối với tải trọng lên thanh. Hãy chạy lại các phân tích bị ảnh hưởng, kể cả những phân tích dùng để bắt đầu một phép tiếp diễn, và rà soát chuyển vị, phản lực và nội lực đầu thanh.",
          "Trung bình",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-122",
          "Các tổ hợp được tạo tự động có thể bỏ sót các phương án bắt buộc hoặc hoạt tải mái nhập thủ công, dùng sai cơ sở tính tuyết, hoặc bao gồm các trường hợp gió đã lỗi thời. Hãy rà soát các tải trọng, hệ số quy tắc và thành phần của biểu đồ bao. Hãy xóa khỏi mô hình các trường hợp tải rỗng đã lỗi thời được xác nhận, kể cả những trường hợp đã rỗng từ 0.6.4. Hãy tạo lại các tổ hợp và kiểm tra rằng chúng loại trừ các mã trường hợp tải đó trước khi chạy lại các phân tích bị ảnh hưởng.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-123",
          "Tải trọng lực tự động có thể giữ lại các tải trọng bên dưới bản sàn có khoảng hở thấp hoặc gán tải ở nơi không xác định được phần che phủ. Hãy tạo lại các tải trọng lực, gió mái và tuyết bị ảnh hưởng, kiểm tra các phép gán, rồi chạy lại các phân tích phụ thuộc.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-124",
          "Trọng lượng bản thân theo phạm vi có thể bỏ sót các đối tượng bị thiếu hoặc chỉ gán trọng lượng của một thanh được chọn cho một đoạn. Hãy sửa phạm vi, kiểm tra trọng lượng đã áp dụng, rồi chạy lại các phân tích bị ảnh hưởng và các đáp ứng của bài học động lực học phẳng đã chia nhỏ.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-125",
          "Các báo cáo động học gốc và WASM có thể đếm một liên kết cứng dùng chung hai lần. Hãy kiểm tra lại bậc siêu tĩnh, phân loại và chẩn đoán, và cập nhật các báo cáo bị ảnh hưởng.",
          "Trung bình",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-126",
          "Các số hạng lặp lại có thể bỏ sót các sơ đồ tải trọng quyết định hoặc tạo ra một phương án không có tuyết. Hãy rà soát các quy tắc, tạo lại các tổ hợp và trường hợp tải tổ hợp bị ảnh hưởng, rồi chạy lại các phân tích, biểu đồ bao và kiểm tra thiết kế.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-127",
          "Sàn có thể không truyền tải trọng nào sang tường ở những chỗ liên kết lưới chưa đầy đủ. Hãy chia lưới lại cả hai bề mặt với các cạnh lưới dùng chung dọc toàn bộ chỗ nối dự định, kiểm tra đường truyền lực, rồi chạy lại các phân tích không gian, biểu đồ bao và kiểm tra thiết kế bị ảnh hưởng.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-128",
          "Việc chuyển đổi có thể bỏ sót các tải trọng dọc trục đổi dấu trên thanh phẳng hoặc giàn không gian. Hãy kiểm tra các tải trọng phân bố và các lực đầu thanh tương đương của chúng, rồi chạy lại các phân tích, biểu đồ bao và kiểm tra thiết kế bị ảnh hưởng.",
          "Trung bình",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-129",
          "Các lượt quét tải trọng di động có thể báo sai lực cắt hoặc lực dọc, và các vị trí xe đã lưu có thể bỏ sót các bước nhảy lực dọc trên giàn không gian. Khi trùng khớp chính xác, trục xe và tải trọng tập trung cố định tạo ra một bước nhảy lực cắt gộp duy nhất. Lực cắt giữa hai tải có các giới hạn một phía khi trục xe tiến đến hoặc đi qua tải trọng. Hãy kiểm tra cả hai giới hạn khi trục xe ở ngay trước và ngay sau tải trọng. Hãy chạy lại các lượt quét bị ảnh hưởng, tạo lại các trường hợp đã lưu và lặp lại các phân tích và kiểm tra thiết kế phụ thuộc.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-130",
          "Phân tích đàn hồi phẳng có thể trả về chuyển vị bằng không toàn bộ đối với một cơ cấu mà không có cảnh báo. Hãy kiểm tra các khớp giải phóng uốn và các liên kết, xử lý mọi cơ cấu không mong muốn và chạy lại các phân tích và kiểm tra thiết kế bị ảnh hưởng.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-131",
          "Phân tích có thể âm thầm bỏ sót hoặc đọc sai các trường dữ liệu kết cấu, liên kết ràng buộc, phương pháp tổ hợp, chuyển động nền hoặc tải trọng của giai đoạn. Hãy sửa dữ liệu đầu vào và chạy lại các phân tích, tổ hợp và kiểm tra thiết kế bị ảnh hưởng.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ],
        [
          "SA-2026-132",
          "Các dự án Basic được mở lại mà không có mặt phẳng vẽ đã lưu có thể được tính trong sai mặt phẳng. Hãy xác nhận mặt phẳng dự định, hướng tải trọng và các liên kết, rồi chạy lại các phân tích, tổ hợp và kiểm tra thiết kế bị ảnh hưởng.",
          "Cao",
          "Bản phát hành sau 0.6.4"
        ]
      ]
    },
    {
      "k": "table",
      "caption": "Các trường hợp được ghi lại trong từng thông báo: giá trị đúng và giá trị mà Stabileo đã báo cáo.",
      "head": [
        "Thông báo",
        "Trường hợp",
        "Đúng",
        "Đã báo cáo",
        "Đơn vị"
      ],
      "rows": [
        [
          "SA-2026-024",
          "Khung cổng 6 × 4 m, tĩnh tải 20 kN/m trên dầm, gió 15 kN, 1.2D + 1.6W, sau một chỉnh sửa khi bật tính toán trực tiếp: phản lực đứng của móng phía đón gió",
          "65.61",
          "56.01",
          "kN"
        ],
        [
          "SA-2026-023",
          "Cột 30×30 cm, 6 Ø20 (ba thanh ở mặt dưới), Nu = 100 kN: φMn khi mặt có ba thanh chịu nén",
          "78.57",
          "101.57",
          "kN·m"
        ],
        [
          "SA-2026-013",
          "Công xôn gồm bốn vỏ cong, 4 × 1 × 0,2 m, 10 kN ở đầu mút: mx tại phần tử ngàm",
          "35.0",
          "0",
          "kN·m/m"
        ],
        [
          "SA-2026-014",
          "Khung không gian 10 thanh (frame3d-2), đã đánh số lại: hệ số phá hoại dẻo",
          "176.47",
          "424.3",
          "—"
        ],
        [
          "SA-2026-015",
          "Cột có dây neo cao 20 m, dây neo thép 1 cm², 5 kN ở đỉnh: lực căng dây neo",
          "5.18",
          "4.34",
          "kN"
        ],
        [
          "SA-2026-011",
          "Dầm tại 0, 4 và 8 m, gối tựa vẽ là ngàm tại 8 m: độ võng tại gối tựa đó",
          "0",
          "-14.4",
          "mm"
        ],
        [
          "SA-2026-017",
          "Đất sét yếu c = 20 kPa, D = 1 m, z = 4 m: sức kháng giới hạn của đất p_u",
          "124",
          "84",
          "kN/m"
        ],
        [
          "SA-2026-008",
          "Hai dạng dao động tại ω và 1.1ω: lực cắt đáy so với giá trị CQC",
          "1.00",
          "0.81",
          "—"
        ],
        [
          "SA-2026-007",
          "Cột tiết diện chữ thập 200×10 mm, 1,5 m: lực tới hạn",
          "2993",
          "5860",
          "kN"
        ],
        [
          "SA-2026-006",
          "Khung cổng có mô men và lực nút: chuyển vị ngang",
          "0.92",
          "2.52",
          "mm"
        ],
        [
          "SA-2026-005",
          "Kèo mái hai dốc: lực dọc tại chân kèo",
          "-56.67",
          "-41.67",
          "kN"
        ],
        [
          "SA-2026-019",
          "IPE 300 ngàm hai đầu, građien 20 °C: mô men đầu thanh",
          "14.04",
          "9.76",
          "kN·m"
        ],
        [
          "SA-2026-012",
          "Công xôn dài 4 m đã chảy dẻo, tải ở đầu mút 1.2·Mp/L: mô men tại đầu ngàm",
          "1012.5",
          "101250",
          "kN·m"
        ],
        [
          "SA-2026-016",
          "Vòm nửa tròn 5 m trong mặt phẳng Y–Z, 40 đoạn: độ võng tại đỉnh vòm",
          "-7.29",
          "-6.18",
          "mm"
        ],
        [
          "SA-2026-018",
          "Mảnh trụ MITC9 2×2 m, độ võng 0,2 m, thép, 50 mm, xoay vật rắn 1 mrad: ứng suất von Mises lớn nhất tại nút",
          "0",
          "101",
          "MPa"
        ],
        [
          "SA-2026-020",
          "Công xôn 3D dài 4 m, N = 0.5·Np, tải ở đầu mút: tải trọng tại thời điểm chảy dẻo đầu tiên",
          "158.2",
          "182.7",
          "kN"
        ],
        [
          "SA-2026-009",
          "Tấm mỏng chịu uốn, ν = 0.3: độ cứng so với giá trị đúng",
          "1.000",
          "1.225",
          "—"
        ]
      ]
    },
    {
      "k": "h",
      "t": "SA-2026-021: gió tối thiểu lên mái tự do"
    },
    {
      "k": "p",
      "t": "Một mái tự do (nhà kho hở, chỗ đậu xe có mái, mái hiên) chỉ nhận các áp lực thực của Hình 2.4-4 đến 2.4-7, vuông góc với mái. CIRSOC 102-2025 §2.1.5 còn yêu cầu lực gió lên công trình hở tối thiểu bằng 0,75 kN/m² × Af, như một trường hợp tải ngang riêng. Khi thiếu mức tối thiểu đó, với gió dọc theo đỉnh mái thì lực ngang bằng không, và với gió vuông góc với đỉnh mái thì lực nhỏ hơn mức tối thiểu ở tốc độ thấp và trung bình. Nay mỗi hướng đều có trường hợp tải đó."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-021-free-roof-wind-minimum.md",
      "label": "Toàn văn SA-2026-021",
      "t": "Thông báo, kèm các số đo:"
    },
    {
      "k": "h",
      "t": "SA-2026-022: áp lực đất được tĩnh tải chống lại"
    },
    {
      "k": "p",
      "t": "Với tải trọng H, CIRSOC 101-2025 yêu cầu xét tác dụng của các tải trọng không tác dụng. Các tổ hợp 0.9 D + 1.6 H và 1.2 D + 1.6 H chưa bao giờ được tạo ra, nên ở nơi tĩnh tải chống lại áp lực đất (lật hoặc trượt của một bức tường) thì tác dụng cho kết quả thấp. Nay chúng được tạo ra, dù mô hình có gió hoặc động đất hay không."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-022-earth-pressure-dead-load-resisting.md",
      "label": "Toàn văn SA-2026-022",
      "t": "Thông báo, kèm ví dụ:"
    },
    {
      "k": "h",
      "t": "SA-2026-023: cột bê tông cốt thép có cách bố trí thanh không đối xứng"
    },
    {
      "k": "p",
      "t": "Các mô men tại mặt cắt đi vào phép kiểm tra cột dưới dạng độ lớn, nhưng khả năng chịu lực dưới lực dọc và uốn quanh một trục chỉ được tính cho một dấu, với mặt trên chịu nén. Với 6, 10, 14, 18 hoặc 22 thanh, trình thiết kế đặt các thanh thừa ở mặt dưới và mặt phải, nên đó là dấu mạnh: khi mô men đảo chiều thì khả năng chịu lực thấp hơn và điều đó chưa bao giờ được kiểm tra. Một cột 30×30 cm với 6 Ø20 chịu nén 100 kN chịu được 101,57 kN·m theo một chiều và 78,57 theo chiều kia, và đã cho đạt với Mu = 100 kN·m. Lỗi ảnh hưởng đến phép kiểm tra cột CIRSOC 201 khi uốn quanh một trục (với các thanh mà cấu kiện có, với trình thiết kế và với phép kiểm tra lại của động cơ tính); phép kiểm tra hai phương đã lấy góc phần tư bất lợi nhất."
    },
    {
      "k": "ul",
      "items": [
        "Cách nhận biết bạn có bị ảnh hưởng hay không: mô hình có các cột bê tông được kiểm tra theo CIRSOC 201 mà cốt thép không đối xứng qua trục uốn: 6, 10, 14, 18 hoặc 22 thanh do trình thiết kế đặt, hoặc các mặt nhập tay có số thanh khác nhau ở hai mặt đối diện.",
        "Việc cần làm: ở phiên bản trước khi sửa, hãy dùng cách bố trí đối xứng (4, 8, 12, 16, 20 hoặc 24 thanh, hoặc các mặt đối diện bằng nhau), hoặc kiểm tra cột thêm một lần nữa với cốt thép đảo gương: khả năng chịu lực nhỏ hơn trong hai giá trị sẽ quyết định.",
        "Trạng thái: đã sửa trong 0.4.0, có trên stabileo.com từ ngày 25 tháng 10 năm 2026. Động cơ tính tính cả hai dấu và lấy giá trị yếu hơn; các cách bố trí đối xứng cho đúng kết quả như trước."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-023-column-moment-sign.md",
      "label": "Toàn văn SA-2026-023",
      "t": "Thông báo, kèm ca thử:"
    },
    {
      "k": "h",
      "t": "SA-2026-024: móng, nút khung, sàn và tường được thiết kế theo tải trọng chưa nhân hệ số"
    },
    {
      "k": "p",
      "t": "Khi các tổ hợp đã được định nghĩa nhưng chưa có tổ hợp nào được tính, móng và nút khung đọc kết quả đang hiển thị trên màn hình, lúc đó là mọi tải trọng với hệ số 1: chúng được thiết kế theo tải trọng sử dụng thay vì các tổ hợp có hệ số. Điều này xảy ra khi bật tính toán trực tiếp (sau một chỉnh sửa, nó chỉ tính lại “Tất cả tải trọng” khi chế độ xem đơn đang hiển thị) hoặc khi việc tính tổ hợp thất bại và phép tính đơn thay thế. Trong một khung cổng chịu 1.2D + 1.6W, phản lực của móng thấp hơn 15%; với tĩnh tải và hoạt tải, thấp hơn 29 đến 38%. Điều tương tự xảy ra với sàn và tường, với bộ tối ưu thép và khi danh sách tổ hợp đang dùng bị rỗng. Nay mọi thiết kế đều từ chối và nêu lý do cho đến khi các tổ hợp được tính."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-024-design-on-unfactored-results.md",
      "label": "Toàn văn SA-2026-024",
      "t": "Thông báo, kèm ví dụ:"
    },
    {
      "k": "h",
      "t": "SA-2026-014: phá hoại dẻo 3D phụ thuộc vào cách đánh số"
    },
    {
      "k": "p",
      "t": "Khi uốn hai phương, các phép kiểm tra đóng một khớp đang quay ngược và mở lại một khớp đã đóng bị đẩy ra ngoài mặt chảy dẻo có thể lặp vòng. Bộ giải tiếp tục từ trạng thái mà thứ tự phần tử để lại và đẩy một tiết diện đã đóng xuyên qua mặt chảy dẻo: cùng một kết cấu, đánh số lại, cho các hệ số phá hoại từ 75,9 đến 424,3, so với giá trị đã chứng nhận là 176,47. Phân tích nay dừng ở trạng thái nhất quán cuối cùng và báo hệ số đó như một cận dưới, kèm cảnh báo, giống nhau với mọi cách đánh số. Lỗi ảnh hưởng đến phân tích đẩy dần 3D của thẻ Pro."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-014-plastic-3d-element-order.md",
      "label": "Toàn văn SA-2026-014",
      "t": "Thông báo, kèm mô hình thử và giá trị đã chứng nhận:"
    },
    {
      "k": "h",
      "t": "SA-2026-011: gối tựa 3D đổi từ lò xo sang ngàm"
    },
    {
      "k": "p",
      "t": "Việc đổi loại của một gối tựa đã có lò xo vẫn giữ lại các hằng số lò xo. Ở chế độ 3D, chúng được gửi đến bộ giải cùng với liên kết, và bộ giải coi bậc tự do đó là đàn hồi: gối tựa được vẽ là ngàm lại được tính như một lò xo. Lỗi ảnh hưởng đến các mô hình được tính ở chế độ 3D, kể cả mô hình phẳng được tính trong 3D; chế độ 2D không bị ảnh hưởng."
    },
    {
      "k": "ul",
      "items": [
        "Cách nhận biết bạn có bị ảnh hưởng hay không: một gối tựa ban đầu là lò xo (hoặc có các hằng số lò xo) rồi được đổi thành ngàm, gối cố định hoặc gối di động, hoặc có một bậc tự do được đánh dấu là bị ngăn. Trong kết quả, gối tựa đó có chuyển vị hoặc góc xoay khác không.",
        "Việc cần làm: hãy tính lại trên stabileo.com các mô hình 3D có gối tựa được sửa từ lò xo sang cứng, và so sánh kết quả gần các gối tựa đó với những kết quả bạn đã dùng.",
        "Trạng thái: đã sửa trên stabileo.com vào ngày 20 tháng 10 năm 2026. Mọi bậc tự do bị ngăn đều được tính là bị ngăn, kể cả trong các dự án đã lưu trước đó."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-011-springs-on-fixed-supports.md",
      "label": "Toàn văn SA-2026-011",
      "t": "Thông báo, kèm cách tái hiện và mô hình thử:"
    },
    {
      "k": "h",
      "t": "SA-2026-013: mô men và ứng suất nhiệt của vỏ cong"
    },
    {
      "k": "p",
      "t": "Các vỏ cong (phần tử tứ giác được đánh dấu là cong) báo mx = my = mxy = 0 bất kể uốn thế nào, và dưới tải trọng nhiệt độ, ứng suất của chúng giữ nguyên biến dạng nhiệt tự do: một vỏ được tự do giãn nở báo E·α·ΔT/(1−ν), còn một vỏ bị ngăn thì không báo gì. Ứng dụng cũng gửi nhiệt độ của một tứ giác cong như của một tứ giác phẳng, và động cơ tính đã bỏ qua: vỏ được phân tích như không bị nung nóng. Các kết quả này được đọc bởi các biểu đồ đường đồng mức của vỏ (cả trong các hình xuất ra), bảng kết quả và báo cáo PDF của Pro, và thiết kế sàn khi một ô là tứ giác cong; sổ kết quả và CSV vốn đã để trống các mô men đó."
    },
    {
      "k": "ul",
      "items": [
        "Cách nhận biết bạn có bị ảnh hưởng hay không: mô hình có các tứ giác cong và bạn đã dùng mô men của chúng (đường đồng mức, bảng hoặc báo cáo của Pro, thiết kế sàn), hoặc có tải trọng nhiệt độ trên một tứ giác cong.",
        "Việc cần làm: hãy chạy lại các mô hình đó và lặp lại mọi thiết kế hoặc kiểm tra đã đọc mô men hoặc ứng suất của chúng dưới tác dụng nhiệt độ. Trong thời gian chờ, hãy mô hình hóa bề mặt bằng các tứ giác phẳng (MITC4).",
        "Trạng thái: đã sửa trong 0.3.0, có trên stabileo.com từ ngày 21 tháng 10 năm 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-013-curved-shell-moments-and-thermal.md",
      "label": "Toàn văn SA-2026-013",
      "t": "Thông báo, kèm công xôn thử và các trường hợp nhiệt:"
    },
    {
      "k": "h",
      "t": "SA-2026-017: các đường cong đất trong tương tác đất và kết cấu"
    },
    {
      "k": "p",
      "t": "Các đường cong đất không tuân theo các tài liệu tham chiếu mà chúng viện dẫn. Đất sét yếu bỏ sót số hạng J của Matlock (sức kháng giới hạn thấp hơn một phần ba đến một nửa gần bề mặt); cát luôn dùng hệ số chu kỳ A = 0.9 và một bảng k theo bậc; đất sét cứng nhảy từ một nửa lên toàn bộ sức kháng tại y50 và giảm xuống 70% sau đó. Các đường cong t-z và q-z (chỉ động cơ tính và WASM) thiếu chu vi thân cọc và diện tích mũi cọc. Lỗi liên quan đến PRO → Nâng cao → Tương tác đất và kết cấu. Bảng điều khiển nay hỏi J và kiểu tải của cát, và động cơ tính từ chối một đường cong thiếu dữ liệu đầu vào thay vì tự giả định. Việc cần làm: hãy chạy lại các mô hình đó và kiểm tra lại độ võng và mô men của cọc."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-017-soil-curves.md",
      "label": "Toàn văn SA-2026-017",
      "t": "Thông báo, kèm giá trị trước và sau cho từng đường cong:"
    },
    {
      "k": "h",
      "t": "SA-2026-019: tải trọng nhiệt độ trên thanh"
    },
    {
      "k": "p",
      "t": "Động cơ tính đã tính tải trọng nhiệt của mọi thanh với α = 12·10⁻⁶ /°C (của thép) và với chiều cao của hình chữ nhật đặc tương đương, √(12·I/A). Trên một IPE, mô men do građien thấp hơn 30%, còn trên nhôm, lực dọc do nhiệt độ gần như chỉ bằng một nửa. Ứng dụng đã bù cả hai từ ngày 7 tháng 10 năm 2026, nên lỗi này ảnh hưởng đến việc dùng trực tiếp động cơ tính hoặc API WASM của nó, và các mô hình nhiệt được tính trong ứng dụng trước ngày đó."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-019-frame-thermal-alpha-depth.md",
      "label": "Toàn văn SA-2026-019",
      "t": "Thông báo, kèm các ca thử:"
    },
    {
      "k": "h",
      "t": "SA-2026-012: nội lực thanh trong phân tích phi tuyến vật liệu"
    },
    {
      "k": "p",
      "t": "Sau khi một thanh chảy dẻo, bộ giải cân bằng các tải trọng với độ cứng đã giảm nhưng báo cáo các nội lực được tính với độ cứng đàn hồi. Chuyển vị và phản lực đúng; nội lực thanh và hệ số sử dụng thì không: trong một công xôn, mô men báo cáo gấp 100 lần giá trị thực. Bộ giải này chỉ truy cập được từ động cơ tính hoặc API WASM của nó: không có màn hình nào trong ứng dụng gọi đến nó, nên kết quả thu được trên stabileo.com không bị ảnh hưởng."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-012-material-nonlinear-member-forces.md",
      "label": "Toàn văn SA-2026-012",
      "t": "Thông báo, kèm công xôn thử:"
    },
    {
      "k": "h",
      "t": "SA-2026-016: trục tiết diện trên các đoạn gần thẳng đứng của một vòm"
    },
    {
      "k": "p",
      "t": "Các đoạn thẳng của một cung nhận các trục địa phương mặc định của một thanh thẳng, mà với thanh nằm trong phạm vi 2,56° so với phương thẳng đứng thì lấy trục X tổng thể làm tham chiếu. Trong một vòm nằm ngoài mặt phẳng X–Z, điều đó xoay tiết diện của các đoạn gần thẳng đứng tại chân vòm đi 90°: Iy và Iz bị hoán đổi ở đó. Trong một nửa đường tròn 40 đoạn nằm trong mặt phẳng Y–Z, độ võng tại đỉnh vòm thấp hơn 15%. Lỗi ảnh hưởng đến dầm cong của động cơ tính và các cung vẽ bằng công cụ vẽ cung của thẻ Thanh (PRO) khi một đoạn gần thẳng đứng; các đường cong trên mặt bằng không bị ảnh hưởng. Các cung đã lưu trước đó nhận các trục đã sửa khi mở dự án."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-016-curved-member-axes.md",
      "label": "Toàn văn SA-2026-016",
      "t": "Thông báo, kèm vòm thử:"
    },
    {
      "k": "h",
      "t": "SA-2026-015: lực căng của dây cáp có trọng lượng bản thân"
    },
    {
      "k": "p",
      "t": "Phân tích cáp dùng mô đun Ernst, tức là tiếp tuyến của quy luật dây cung của một dây cáp treo dưới trọng lượng bản thân, như thể nó là một cát tuyến từ dây cung thẳng. Độ võng chiếm bớt chiều dài dây cung, nên một dây cáp cần lực căng lớn hơn EA·ε với một độ giãn nhất định, chứ không phải nhỏ hơn. Ở nơi chỉ cần cân bằng là xác định được lực cáp thì lực căng đúng; ở nơi dây cáp cùng chịu tải với các thanh khác (cột có dây neo, dây cáp giằng một khung) thì dây cáp nhận lực căng quá nhỏ và các thanh bên cạnh nhận quá lớn: trong cột thử, 4,34 kN thay vì 5,18 kN, và với các tải nhỏ hơn thì phép lặp không hội tụ. Trong ứng dụng, lỗi ảnh hưởng đến các mô hình 3D có các thanh với ứng xử là \"cáp\" và vật liệu có khối lượng riêng."
    },
    {
      "k": "ul",
      "items": [
        "Cách nhận biết: mô hình có các thanh với ứng xử \"cáp\", vật liệu của chúng có khối lượng riêng, và dây cáp không phải là đường truyền lực duy nhất.",
        "Việc cần làm: hãy kiểm chứng độc lập các lực quyết định của cáp và neo có kể đến trọng lượng bản thân của cáp. Hãy chạy lại phân tích trong một phiên bản đã sửa.",
        "Trạng thái: đã sửa trong 0.3.0. Phân tích cáp nay giải chính quy luật dây cung bằng phép lặp Newton."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-015-cable-tension-chord-law.md",
      "label": "Toàn văn SA-2026-015",
      "t": "Thông báo, kèm cột thử và nghiệm giải tích của nó:"
    },
    {
      "k": "h",
      "t": "SA-2026-018: vỏ MITC9 trên hình học cong"
    },
    {
      "k": "p",
      "t": "Phần tử MITC9 là phẳng: nó chiếu chín nút của mình lên một mặt phẳng. Khi các nút giữa cạnh hoặc nút tâm nằm lệch khỏi mặt phẳng đó (mọi lưới MITC9 cong), phép chiếu thiếu phần hiệu chỉnh liên kết cứng của MITC4, nên một chuyển động xoay vật rắn làm phần tử bị biến dạng: một lưới cong chống lại các góc xoay của các phần tử của nó và báo ứng suất cho chúng (101 MPa trên một mảnh thử xoay 1 mrad). Phần tử này chỉ được dùng từ động cơ tính hoặc API WASM của nó: ứng dụng không tạo ra phần tử chín nút nào, nên kết quả thu được trên stabileo.com không bị ảnh hưởng."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-018-mitc9-curved-rigid-motion.md",
      "label": "Toàn văn SA-2026-018",
      "t": "Thông báo, kèm mảnh thử và bán cầu:"
    },
    {
      "k": "h",
      "t": "SA-2026-020: mặt chảy dẻo của phân tích phi tuyến vật liệu 3D"
    },
    {
      "k": "p",
      "t": "Trong 2D, một thanh chảy dẻo khi (N/Np)² + |M|/Mp vượt quá 1. Trong 3D, bộ giải dùng (N/Np)² + (My/Mpy)² + (Mz/Mpz)², với các tỷ số mô men được bình phương, nên khi có lực dọc hoặc uốn quanh cả hai trục, một thanh 3D chảy dẻo muộn hơn cùng thanh đó trong 2D và hệ số sử dụng báo cáo thấp: với N = 0.5·Np, tải trọng tại thời điểm chảy dẻo đầu tiên cao hơn 15%. 3D nay dùng (N/Np)² + |My|/Mpy + |Mz|/Mpz, mà với uốn quanh một trục chính là mặt chảy 2D. Bộ giải này chỉ truy cập được từ động cơ tính hoặc API WASM của nó: không có màn hình nào của ứng dụng gọi đến nó, nên kết quả thu được trên stabileo.com không bị ảnh hưởng."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-020-material-nonlinear-3d-yield-surface.md",
      "label": "Toàn văn SA-2026-020",
      "t": "Thông báo, kèm các ca thử:"
    },
    {
      "k": "h",
      "t": "SA-2026-008: lực cắt đáy và hệ số tham gia dao động trong phân tích phổ"
    },
    {
      "k": "p",
      "t": "Với quy tắc CQC, lực cắt đáy báo cáo vẫn được tổ hợp theo SRSS. Các lực cắt đáy của từng dạng dao động theo một phương cùng dấu, nên CQC cho giá trị lớn hơn SRSS: với hai dạng dao động gần nhau, giá trị báo cáo thấp hơn 19%. Các hệ số tham gia cũng bỏ sót khối lượng mà ma trận khối lượng nhất quán liên kết với các gối tựa, làm đánh giá thấp đáp ứng trong các mô hình có ít phần tử trên mỗi cột."
    },
    {
      "k": "ul",
      "items": [
        "Cách nhận biết bạn có bị ảnh hưởng hay không: bạn đã chạy phân tích phổ với CQC và dùng lực cắt đáy báo cáo (ví dụ để quy đổi về lực cắt đáy tĩnh), hoặc bạn đã dùng khối lượng nhất quán với các cột có một hoặc hai phần tử.",
        "Việc cần làm: hãy tính lại các mô hình bị ảnh hưởng trên stabileo.com và so sánh với những kết quả bạn đã dùng. Cách khắc phục tạm thời mà thông báo này đưa ra trước khi sửa không còn áp dụng nữa.",
        "Trạng thái: đã sửa trên stabileo.com vào ngày 21 tháng 10 năm 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-008-spectral-combination.md",
      "label": "Toàn văn SA-2026-008",
      "t": "Thông báo, trình bày riêng hai lỗi:"
    },
    {
      "k": "h",
      "t": "SA-2026-007: mất ổn định xoắn và uốn xoắn trong 3D"
    },
    {
      "k": "p",
      "t": "Độ cứng hình học của các thanh 3D chỉ có các số hạng uốn: không có số hạng Wagner và không có liên kết với tâm uốn. Mất ổn định xoắn và uốn xoắn không bao giờ xuất hiện, và thay vào đó báo lực Euler. Với cột tiết diện chữ thập, lực báo cáo cao hơn lực quyết định 96%."
    },
    {
      "k": "ul",
      "items": [
        "Cách nhận biết bạn có bị ảnh hưởng hay không: bạn đã dùng hệ số mất ổn định 3D hoặc P-Delta 3D cho các kết cấu có tiết diện hở thành mỏng với độ cứng xoắn thấp: tiết diện chữ thập, thép góc đơn hoặc đôi, thép chữ T, thép chữ C. Các tiết diện chữ I đối xứng hai trục, nơi mất ổn định uốn quyết định, không bị ảnh hưởng. Các kiểm tra thiết kế tự tính mất ổn định xoắn (CIRSOC 301 E.4, từ 0.2.0) cũng không bị ảnh hưởng.",
        "Việc cần làm: hãy tính lại các mô hình bị ảnh hưởng trên stabileo.com và so sánh với những kết quả bạn đã dùng. Cách khắc phục tạm thời mà thông báo này đưa ra trước khi sửa không còn áp dụng nữa.",
        "Trạng thái: đã sửa trên stabileo.com vào ngày 21 tháng 10 năm 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-007-torsional-buckling.md",
      "label": "Toàn văn SA-2026-007",
      "t": "Thông báo, kèm lời giải cho cột tiết diện chữ thập:"
    },
    {
      "k": "h",
      "t": "SA-2026-006: mô hình phẳng được tính trong 3D có mô men nút"
    },
    {
      "k": "p",
      "t": "Một mô hình phẳng được bộ giải 3D tính nằm trong mặt phẳng X–Z, nơi góc xoay trong mặt phẳng là góc xoay quanh −Y. Các mô men nút và góc xoay cưỡng bức lẽ ra phải đổi dấu nhưng không đổi, nên chúng tác dụng như ảnh phản chiếu của chính mình. Khi kết hợp với các lực, chúng có thể cộng lại thay vì triệt tiêu."
    },
    {
      "k": "ul",
      "items": [
        "Cách nhận biết bạn có bị ảnh hưởng hay không: mô hình là phẳng (mọi nút nằm trong một mặt phẳng), đã được tính ở chế độ 3D và có các mô men nút hoặc góc xoay cưỡng bức ở gối tựa. Các lò xo xoay không bị ảnh hưởng.",
        "Việc cần làm: hãy tính lại các mô hình bị ảnh hưởng trên stabileo.com và so sánh với những kết quả bạn đã dùng. Cách khắc phục tạm thời mà thông báo này đưa ra trước khi sửa không còn áp dụng nữa.",
        "Trạng thái: đã sửa trên stabileo.com vào ngày 21 tháng 10 năm 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-006-mirrored-moments-2d-in-3d.md",
      "label": "Toàn văn SA-2026-006",
      "t": "Thông báo, kèm ba ca thử:"
    },
    {
      "k": "h",
      "t": "SA-2026-005: lực dọc trong các thanh xiên 2D"
    },
    {
      "k": "p",
      "t": "Bộ dựng tải trọng 2D đã chuyển thành phần dọc theo thanh của một tải trọng đặt trên thanh xiên về các nút đầu của nó. Phản lực và chuyển vị đúng, nhưng thanh không nhận thấy tải trọng đó trên nhịp của mình, nên lực dọc của nó giữ không đổi bằng giá trị trung bình của hai giá trị đầu thanh thực: thấp hơn 26% ở chân một thanh kèo. Biểu đồ, công cụ xem, báo cáo, tệp xuất Excel và thiết kế đều dùng giá trị đó. Một ngẫu lực đặt trên thanh cũng bị bỏ khi một mô hình phẳng được tính trong 3D."
    },
    {
      "k": "ul",
      "items": [
        "Cách nhận biết bạn có bị ảnh hưởng hay không: một mô hình 2D được tính từ 25/09/2026 có các thanh xiên (kèo, cầu thang, giằng, vòm vẽ bằng các đoạn thẳng) chịu tải trọng phân bố, tải trọng tập trung hoặc trọng lượng bản thân có thành phần dọc theo thanh; hoặc một mô hình phẳng có ngẫu lực trên một thanh được tính trong 3D. Các thanh được thiết kế chịu nén là những thanh bị ảnh hưởng nhiều nhất.",
        "Việc cần làm: hãy tính lại các mô hình bị ảnh hưởng trên stabileo.com và so sánh với những kết quả bạn đã dùng. Cách khắc phục tạm thời mà thông báo này đưa ra trước khi sửa không còn áp dụng nữa.",
        "Trạng thái: đã sửa trên stabileo.com vào ngày 21 tháng 10 năm 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-005-inclined-member-loads.md",
      "label": "Toàn văn SA-2026-005",
      "t": "Thông báo, kèm thanh kèo và thanh 3-4-5:"
    },
    {
      "k": "h",
      "t": "Đã sửa vào ngày 19 tháng 10 năm 2026"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-009: phần tử vỏ khối SHB8 cứng hơn thực tế 22% khi uốn tấm mỏng (hiện tượng khóa chiều dày Poisson), nên đánh giá thấp độ võng khoảng 18%. Hãy kiểm tra lại các kết luận về độ võng và dao động đối với các mô hình có tấm vỏ khối được tính trước ngày đó; MITC4, MITC9, DKT và vỏ cong không bị ảnh hưởng.",
        "SA-2026-010: chứng nhận của phân tích phổ có thể cho qua các kết quả không hữu hạn (NaN). Các con số rõ ràng không hợp lệ; cái sai là tuyên bố kiểm chứng. Không cần kiểm tra lại gì trừ khi một kết quả đã giao có hiển thị các giá trị không hữu hạn."
      ]
    },
    {
      "k": "h",
      "t": "Đã sửa trong phiên bản 0.2.0"
    },
    {
      "k": "p",
      "t": "Phiên bản 0.2.0, ngày 18 tháng 10 năm 2026, đã sửa bốn thông báo hồi tố. Tất cả đều ảnh hưởng đến các dự án được tính trước ngày 17 tháng 10 năm 2026, và lời khuyên là như nhau cho từng thông báo: tạo lại tải trọng và tổ hợp, tính và rà soát các kiểm tra thiết kế, và kiểm tra lại mọi sản phẩm đã giao được lập bằng phiên bản cũ hơn."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001: các tổ hợp và tải trọng CIRSOC 101, 102 và 103 được tạo tự động thiên về phía không an toàn (trong một ví dụ, lực dọc của một cột thấp hơn 29%).",
        "SA-2026-002: các kiểm tra bê tông CIRSOC 201 và ACI 318 đánh giá khả năng chịu lực cao hơn thực tế (φMn cao hơn đến 18%).",
        "SA-2026-003: các kiểm tra thép, thép tạo hình nguội và mối nối đánh giá khả năng chịu lực cao hơn thực tế (lực cắt của bụng cao hơn đến 60%).",
        "SA-2026-004: các phân tích bỏ qua một phần của mô hình (lịch sử thời gian theo chuyển động nền mất tới một nửa tải trọng động đất; phá hoại dẻo 3D không an toàn tới 2,3 lần)."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Tất cả thông báo",
      "t": "Danh sách đầy đủ, với từng thông báo, bản sửa và mức độ nghiêm trọng của nó:"
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Cách chúng tôi tìm ra các lỗi này, và những gì không phép kiểm chứng nào có thể đảm bảo:"
    }
  ]
};

export default body;
