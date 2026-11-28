import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.3.0: thêm mười sáu bản sửa và công bố mọi thông báo an toàn",
  "excerpt": "Những thay đổi kể từ 0.2.0: mười sáu lỗi có thể cho kết quả sai đã được sửa và công bố thành thông báo an toàn; các chứng nhận kiểm tra kết quả so với mô hình; và cùng một kết quả số ở mọi lần giải.",
  "blocks": [
    {
      "k": "p",
      "t": "Phiên bản 0.3.0 ra mắt ngày 21 tháng 10 năm 2026. Kể từ 0.2.0, chúng tôi tiếp tục kiểm tra bộ giải bằng nhiều cách độc lập và tìm ra thêm mười sáu lỗi có thể cho kết quả sai. Các lỗi này đã được sửa, và mỗi lỗi đều có một thông báo an toàn đã công bố, nêu rõ điều gì sai, ai bị ảnh hưởng và cần kiểm tra lại những gì."
    },
    {
      "k": "note",
      "t": "stabileo.com công bố mọi thay đổi ngay khi nó được hợp nhất, nên các bản sửa này đã chạy từ ngày 19, 20 hoặc 21 tháng 10. Ứng dụng thông báo một lần rằng kết quả có thể đã thay đổi, và các dự án được lưu trước một thay đổi liên quan đến chúng sẽ yêu cầu kiểm tra lại khi mở."
    },
    {
      "k": "h",
      "t": "Hãy chạy lại các dự án của bạn"
    },
    {
      "k": "p",
      "t": "Đây là những trường hợp có thể làm thay đổi kết quả thiết kế nhiều nhất. Mỗi thông báo có đầy đủ trường hợp minh họa và việc cần làm với các kết quả bạn đã giao."
    },
    {
      "k": "img",
      "base": "blog/recheck-notice",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO mở một khung bê tông được lưu hồi tháng 9. Một hộp thoại có tiêu đề “Kết quả đã thay đổi kể từ lần giải gần nhất của dự án này” liệt kê các thay đổi liên quan đến mô hình, trong đó có các bản sửa bộ giải được phát hiện nhờ chứng nhận kết quả và tương thích biến dạng theo CIRSOC 201, và yêu cầu đánh dấu “Tôi đã đọc các thay đổi này” trước khi tiếp tục với kết quả đã lỗi thời hoặc chạy lại.",
      "caption": "Mở một dự án đã giải trước một bản sửa liên quan đến nó: ứng dụng liệt kê các thay đổi đó và giữ kết quả ở trạng thái lỗi thời cho đến khi giải lại."
    },
    {
      "k": "table",
      "caption": "Một số bản sửa của 0.3.0: giá trị đúng và giá trị mà phiên bản trước đã cho.",
      "head": [
        "Thông báo",
        "Trường hợp",
        "Đúng",
        "Trước đây"
      ],
      "rows": [
        [
          "SA-2026-005",
          "Kèo mái dốc hai mái: lực dọc tại chân kèo (kN)",
          "-56.67",
          "-41.67"
        ],
        [
          "SA-2026-007",
          "Cột chữ thập 1,5 m: lực tới hạn (kN)",
          "2993",
          "5860"
        ],
        [
          "SA-2026-014",
          "Khung không gian được đánh số lại: hệ số phá hoại dẻo",
          "176.47",
          "424.3"
        ],
        [
          "SA-2026-015",
          "Cột anten có dây neo: lực căng trong dây neo (kN)",
          "5.18",
          "4.34"
        ],
        [
          "SA-2026-013",
          "Công xôn gồm các vỏ cong: mô men tại ngàm (kN·m/m)",
          "35.0",
          "0"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Các thông báo còn lại gồm phổ phản ứng với CQC, mô hình phẳng được giải trong 3D với mô men tại nút, gối tựa đổi từ lò xo sang cứng, vòm nằm ngoài mặt phẳng X–Z, các đường cong đất p-y, t-z và q-z, vỏ khối đặc trong các tấm mỏng và, dành cho những ai dùng trực tiếp bộ máy tính toán hoặc API của nó, phân tích phi tuyến vật liệu, phần tử MITC9 cong và tải trọng nhiệt độ trên thanh."
    },
    {
      "k": "h",
      "t": "Cảnh báo thay vì sai một cách âm thầm"
    },
    {
      "k": "ul",
      "items": [
        "Một kết quả mà một lỗi còn mở có thể ảnh hưởng sẽ mang một cảnh báo nêu tên lỗi đó, bằng ngôn ngữ của bạn. Còn lại một trường hợp: phân tích phi tuyến vật liệu là mô hình độ cứng cát tuyến cho toàn thanh.",
        "Khi một tải trọng nhiệt độ không nêu hệ số giãn nở hoặc chiều cao tiết diện, kết quả sẽ cho biết giá trị nào đã được giả định.",
        "Những gì không có nghiệm sẽ bị từ chối: một mô men đặt lên một nút mà không gì có thể xoay, một tải trọng vỏ đặt lên phần tử thuộc loại khác, một đường cong đất thiếu các đầu vào mà tài liệu tham chiếu của nó cần."
      ]
    },
    {
      "k": "h",
      "t": "Kiểm tra sâu hơn"
    },
    {
      "k": "ul",
      "items": [
        "Chứng nhận đầu cuối cho khung và giàn: một bộ kiểm tra độc lập dựng lại độ cứng và tải trọng từ mô hình và chứng nhận các chuyển vị so với mô hình, không chỉ so với các ma trận mà bộ máy tính toán đã lắp ghép. Nó đã tìm ra ba trường hợp trong đó bộ máy tính toán và mô hình không khớp nhau.",
        "Cùng một mô hình luôn cho cùng các con số, từng bit một, và mỗi báo cáo, bảng tính và CSV đều ghi lại phiên bản nào và dữ liệu nào đã tạo ra nó.",
        "Thiết kế bê tông theo CIRSOC 201 đến từ một cách triển khai duy nhất trong bộ máy tính toán.",
        "Ước lượng sai số lưới cho tấm và vỏ, hiển thị là ước lượng, không bao giờ là đã chứng nhận."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Danh sách đầy đủ các thông báo an toàn, kèm những gì cần kiểm tra lại cho từng thông báo:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.3.0.md",
      "label": "Ghi chú phát hành 0.3.0",
      "t": "Ghi chú đầy đủ, kèm các hạn chế đã biết:"
    }
  ]
};

export default body;
