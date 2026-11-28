import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.1: sửa kiểm tra thanh và tải trọng tuyết",
  "excerpt": "Hãy chạy lại các kiểm tra thiết kế bê tông và thép bị ảnh hưởng. Với tải trọng tuyết được tạo tự động, hãy tạo lại tải trọng trước, rồi chạy lại các trường hợp tải, tổ hợp, biểu đồ bao và các kiểm tra thiết kế phái sinh bị ảnh hưởng.",
  "blocks": [
    {
      "k": "p",
      "t": "Hãy chạy lại các kiểm tra thiết kế bê tông và thép bị ảnh hưởng. Với tải trọng tuyết được tạo tự động, hãy tạo lại tải trọng trước, rồi chạy lại các trường hợp tải, tổ hợp, biểu đồ bao và các kiểm tra thiết kế phái sinh bị ảnh hưởng. Chỉ giải lại các tải trọng đã lưu trước đó thì không sửa được chúng. So sánh nhu cầu, khả năng chịu lực, cốt thép, hệ số sử dụng, các tổ hợp quyết định và chứng nhận với những kết quả đã dùng. Hãy rà soát các bản tính đã giao và việc chọn kích thước dựa trên chúng. Một sự từ chối, một đại lượng không có sẵn hoặc cốt thép chưa được kiểm tra không cho câu trả lời đạt và không phải là nhu cầu bằng không."
    },
    {
      "k": "note",
      "t": "Năm thông báo mức Cao sau đây đã được sửa trong 0.6.1. Hãy làm theo từng thông báo về các đầu vào bị ảnh hưởng và hành động của người dùng, ngay cả khi các kết quả trước đó đạt hoặc đã được chứng nhận."
    },
    {
      "k": "h",
      "t": "Thông báo an toàn"
    },
    {
      "k": "table",
      "caption": "Thông báo an toàn",
      "head": [
        "Thông báo an toàn",
        "Mức độ",
        "Điều gì đã thay đổi và cần làm gì"
      ],
      "rows": [
        [
          "SA-2026-064",
          "Cao",
          "Hệ số Cb của thép có thể lấy từ một tổ hợp khác hoặc từ một nhịp không giằng ngắn không được xác định vị trí (#1316, #2088). Chạy lại các kiểm tra thép CIRSOC 301 và rà soát khả năng chịu uốn, hệ số sử dụng tương tác và các tổ hợp quyết định."
        ],
        [
          "SA-2026-065",
          "Cao",
          "Tuyết tích tụ ở bậc mái có thể bị bỏ sót trên mái dốc tiếp nhận (#2082). Tạo lại tải trọng tuyết CIRSOC 104 và chạy lại các phân tích và kiểm tra thiết kế bị ảnh hưởng."
        ],
        [
          "SA-2026-066",
          "Cao",
          "Hệ số Cm của bê tông có thể được tính ưu đãi mô men đầu thanh khi có tải trọng ngang giữa các gối (#2089). Kiểm tra lại các cột và vách bê tông mảnh, mô men đã khuếch đại và cốt thép."
        ],
        [
          "SA-2026-067",
          "Cao",
          "Việc xoay mặt bằng có thể làm thay đổi tải trọng tuyết được tạo (#2093). Tạo lại tải trọng bằng hình học mái thực tế, rồi chạy lại các phân tích và kiểm tra; xoay mô hình cũ trở lại không phải là cách sửa."
        ],
        [
          "SA-2026-068",
          "Cao",
          "Xoắn có thể đạt với cốt đai thiết kế không đủ (#2141). Chạy lại các kiểm tra thiết kế bê tông và rà soát khả năng chịu cắt ngang thực tế, bước cốt đai và các trường hợp hỏng do xoắn. Cốt dọc chưa được kiểm tra không phải là một khung cốt thép đạt."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Danh mục thông báo an toàn",
      "t": "Các thông báo an toàn:"
    },
    {
      "k": "h",
      "t": "Mọi thông báo thay đổi kết quả kể từ v0.6.0"
    },
    {
      "k": "p",
      "t": "Sổ đăng ký tại v0.6.0 kết thúc ở phiên bản kết quả 78; bản phát hành này đạt 80. Bảng liệt kê tất cả 24 thông báo mới. Một số thông báo dùng chung một phiên bản. Hãy chạy lại mọi kiểm tra áp dụng; với các thông báo về tuyết, hãy sinh lại tải trọng trước khi giải lại."
    },
    {
      "k": "table",
      "caption": "Mọi thông báo thay đổi kết quả kể từ v0.6.0",
      "head": [
        "Phiên bản kết quả",
        "Kết quả thay đổi"
      ],
      "rows": [
        [
          "79",
          "Phạm vi tuyết tích tụ theo các mép mái liên tục"
        ],
        [
          "79",
          "Việc ghi đè tuyết giữ nguyên các phía không cân bằng và các đoạn tiết diện"
        ],
        [
          "79",
          "Khung tuyết phẳng theo các đoạn mái liên thông"
        ],
        [
          "79",
          "Tải trọng tuyết tôn trọng vị trí cục bộ và ranh giới tuyết tích tụ"
        ],
        [
          "79",
          "Hệ số tuyết theo hướng của từng mái"
        ],
        [
          "79",
          "Các trường hợp tuyết bao phủ mọi hướng của đỉnh mái"
        ],
        [
          "79",
          "Chiều dài đón tuyết theo các mái liên tục và hình học đã chọn"
        ],
        [
          "79",
          "Tải trọng tuyết giữ nguyên độ lớn khi xoay mặt bằng"
        ],
        [
          "79",
          "Tuyết tích tụ ở bậc mái dùng mặt phẳng mái tiếp nhận"
        ],
        [
          "79",
          "Tải trọng tuyết theo từng mặt mái liên thông"
        ],
        [
          "79",
          "Diện tích truyền tải của tuyết dùng các mặt mái bên trong"
        ],
        [
          "80",
          "Kiểm tra thanh đòi hỏi mọi tổ hợp đang hoạt động"
        ],
        [
          "80",
          "Kiểm tra thanh đòi hỏi dữ liệu mặt cắt đầy đủ"
        ],
        [
          "80",
          "Các kiểm tra đồng thời giữ lại nhu cầu quyết định"
        ],
        [
          "80",
          "Thiết kế dùng các thanh cốt thép đã chọn và tải trọng nhịp đã biết"
        ],
        [
          "80",
          "Kiểm tra tương tác dùng các lực mặt cắt đồng thời"
        ],
        [
          "80",
          "Kiểm tra bê tông giữ lại độ mảnh thứ cấp"
        ],
        [
          "80",
          "Các trường hợp đồng thời giữ lại toàn bộ cốt thép xoắn cần thiết"
        ],
        [
          "80",
          "Cốt thép cố định giữ lại kiểm tra giới hạn tối đa thực tế"
        ],
        [
          "80",
          "Nhu cầu thiết kế tôn trọng ứng xử và nhịp cánh"
        ],
        [
          "80",
          "Kiểm tra xoắn xét mọi khung cốt đai được trả về"
        ],
        [
          "80",
          "Các dầm dùng chung giữ lại trục của chúng; phải nêu rõ cốt thép chịu xoắn"
        ],
        [
          "80",
          "Cb của tương tác thép dùng biểu đồ tổ hợp riêng của nó"
        ],
        [
          "80",
          "Các mặt cắt thép dùng chiều dài vật lý và giữ lại nhu cầu cắt"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.1.vi.md",
      "label": "Ghi chú phát hành 0.6.1 đầy đủ",
      "t": "Mọi thông báo thay đổi kết quả kể từ v0.6.0:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Hộp thoại kiểm tra lại kết quả trong Stabileo Basic, liệt kê các thay đổi ảnh hưởng đến một dự án đã lưu cũ hơn.",
      "caption": "Kết quả của bạn có thể thay đổi: hãy chạy lại các dự án bị ảnh hưởng"
    },
    {
      "k": "h",
      "t": "Các thay đổi khác"
    },
    {
      "k": "p",
      "t": "Các kiểm tra bê tông và thép giữ lại các lực từ cùng một tổ hợp và cùng một mặt cắt. Dữ liệu tổ hợp hoặc mặt cắt không đầy đủ nay bị từ chối thay vì mượn kết quả ở một đầu mút. Các trạng thái cốt thép yêu cầu và cốt thép bố trí vẫn tách biệt, và việc thiếu cốt thép dọc chịu xoắn được báo cáo rõ ràng."
    },
    {
      "k": "h",
      "t": "Các hạn chế đã biết"
    },
    {
      "k": "ul",
      "items": [
        "Các kết quả sai đã biết vẫn còn mở: #2096, #2142, #2143 và #2144. Bản phát hành này không sửa chúng. Hãy xem phạm vi bị ảnh hưởng của chúng và tự kiểm chứng độc lập các kết quả bị ảnh hưởng trước khi dùng.",
        "SA-2026-056 vẫn chưa được sửa: hãy tự kiểm chứng độc lập các nhu cầu động đối với các mô hình hỗn hợp khung và vỏ có liên kết ràng buộc mà thay đổi đáng kể sau khi đánh số lại, xoay hoặc đổi đơn vị. Chưa có hệ số hiệu chỉnh thiên về an toàn nào được xác lập.",
        "Sự phá hoại dẻo 2D vẫn bị từ chối cho đến khi giải quyết #758, như mô tả trong SA-2026-044. Một cận dưới 3D đã được chứng nhận không chứng nhận lịch sử khớp thô.",
        "Phân tích lịch sử thời gian không cung cấp tổng nhu cầu động tại gối tựa. Hãy dùng một phân tích độc lập có kể đến quán tính, cản và tải trọng tại gối. Các phân tích dây cáp không được hỗ trợ và chuyển động cưỡng bức khác không của gối trong các quy trình dây cáp/lịch sử thời gian bị từ chối một cách rõ ràng.",
        "Các bộ giải chiều dài cung không gian và điều khiển chuyển vị chưa được bổ sung. Các cảnh báo và hạn chế hiện có vẫn áp dụng."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Nhật ký thay đổi",
      "t": "Nhật ký thay đổi:"
    }
  ]
};

export default body;
