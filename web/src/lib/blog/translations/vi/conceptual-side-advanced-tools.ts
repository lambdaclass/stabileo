import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Phần mềm miễn phí tính được gì và không giải thích được gì",
  "excerpt": "Có phần mềm kết cấu miễn phí, và nó tốt: nó mô hình hóa, nó giải, nó hiển thị kết quả. Điều chúng tôi không tìm thấy là một phần mềm tiếp cận các công cụ nâng cao từ phía khái niệm.",
  "blocks": [
    {
      "k": "p",
      "t": "Nên bắt đầu bằng những gì đã có: có rất nhiều, và chúng tốt. Bất kỳ ai dạy kết cấu ngày nay đều có sẵn các công cụ miễn phí hạng nhất, và vài công cụ trong số đó làm việc của chúng tốt hơn chúng tôi."
    },
    {
      "k": "h",
      "t": "Các công cụ miễn phí thực sự bao phủ những gì"
    },
    {
      "k": "table",
      "caption": "Các công cụ phân tích kết cấu miễn phí, và những gì chúng cho thấy ngoài kết quả.",
      "head": [
        "Công cụ",
        "Miễn phí",
        "Làm rất tốt điều gì",
        "Phương diện khái niệm"
      ],
      "rows": [
        [
          "Ftool",
          "Có",
          "Mô hình hóa khung phẳng, đọc biểu đồ và đường ảnh hưởng với sự lưu loát ít ai sánh được",
          "Cho thấy ứng xử, không phải lập luận đằng sau nó"
        ],
        [
          "MASTAN2",
          "Có (trên MATLAB hoặc môi trường chạy của nó)",
          "Phân tích ma trận tuyến tính và phi tuyến, gắn với McGuire, Gallagher và Ziemian",
          "Lý thuyết nằm trong sách; chương trình chạy phân tích"
        ],
        [
          "SkyCiv",
          "Gói miễn phí",
          "Tính tay từng bước: vật thể tự do, phương trình cân bằng trước khi thay số, phân phối mô men cho dầm siêu tĩnh",
          "Thay số vào công thức, cho tĩnh học cơ bản"
        ],
        [
          "sectionproperties",
          "Có, mã nguồn mở",
          "Vênh, tâm uốn và hằng số Saint-Venant bằng phần tử hữu hạn",
          "Một thư viện Python: nó trả về các con số, không có giao diện và không có giải thích"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Trong danh sách đó, SkyCiv gần nhất với điều chúng ta thường gọi là “trình bày lời giải”, và cần nói thẳng: các bản tính tay của nó rất tốt. Nó vẽ vật thể tự do, viết ΣM = 0 trước khi thay bất kỳ số nào, và giải bằng phân phối mô men khi dầm siêu tĩnh. Ai khẳng định không chương trình miễn phí nào trình bày các bước của nó đều có thể bị bác bỏ bằng SkyCiv trong chừng một phút."
    },
    {
      "k": "h",
      "t": "Trình bày các bước là chưa đủ nếu chương trình không cho bạn biết khi nào công thức hết áp dụng được"
    },
    {
      "k": "p",
      "t": "Thay số vào một công thức đúng và giải thích vì sao công thức đó là công thức đúng là hai việc khác nhau. Việc thứ nhất giúp bạn khỏi phải tính. Việc thứ hai giúp bạn khỏi một sai lầm mà phép tính không thể bắt được, vì sai lầm nằm ở một tầng phía trên nó."
    },
    {
      "k": "p",
      "t": "Các máy tính xoắn bạn tìm thấy trên mạng minh họa điểm này theo chiều ngược lại: bạn chọn loại tiết diện (đặc, ống kín, chữ nhật) và chương trình áp dụng công thức tương ứng. Không cái nào chúng tôi đã xem cho bạn biết rằng bạn chọn sai, lý thuyết còn lại sẽ cho kết quả gì, hay bạn đang ở phía nào của sai số."
    },
    {
      "k": "quote",
      "t": "Một chương trình chỉ biết tính sẽ không bao giờ cảnh báo bạn rằng bạn đang tính sai thứ."
    },
    {
      "k": "h",
      "t": "Ba tính năng mà chúng tôi không tìm thấy tính năng tương đương"
    },
    {
      "k": "ul",
      "items": [
        "Phân tích động học, có giải thích. Chúng tôi đã tìm và không thấy công cụ miễn phí nào làm việc này: những gì xuất hiện là tài liệu bài giảng dạng PDF. “Phần mềm giáo dục cho phân tích động học” mà chúng tôi tìm thấy là dành cho cơ cấu máy (các cơ cấu thanh nối và tay quay), không phải để phân loại kết cấu.",
        "Bố trí cốt thép. Lựa chọn miễn phí duy nhất chúng tôi tìm thấy là AutoRebar, và nó là một phần bổ trợ của AutoCAD, nên dùng phần miễn phí đòi hỏi một giấy phép đắt tiền. Nó cũng làm việc từ bản vẽ của bạn: bạn đặt các thanh, nó lập bảng thống kê. Mọi thứ còn lại là bản dùng thử bảy ngày hoặc phần mềm thương mại. Chúng tôi không tìm thấy lựa chọn mã nguồn mở nào.",
        "Phân tích tiết diện, có trình bày lời giải. Ở đây có một lựa chọn miễn phí đáng kể, sectionproperties, và về vênh bằng phần tử hữu hạn nó có lẽ hơn chúng tôi. Nhưng đó là một thư viện không có giao diện: nó cho bạn tâm uốn mà không giải thích vì sao nó nằm ở chỗ đó."
      ]
    },
    {
      "k": "p",
      "t": "Trong các công cụ chúng tôi đã xem, không công cụ nào bao phủ hai trong ba tính năng, và chúng tôi không tìm thấy công cụ nào tiếp cận dù chỉ một tính năng từ phía khái niệm. Đó là khoảng trống chúng tôi thấy, và nó hẹp hơn và chính xác hơn “chúng tôi là những người duy nhất dạy”."
    },
    {
      "k": "h",
      "t": "Một màn hình cho thấy toàn bộ sự khác biệt"
    },
    {
      "k": "p",
      "t": "Dưới đây là một dầm hai nhịp trên ba gối tựa. Cả ba chỉ ngăn chuyển vị thẳng đứng. Đó là ví dụ kinh điển trong sách giáo khoa, và cũng là ví dụ tôi thường thấy được chấp nhận là đúng nhất trong một bài thi."
    },
    {
      "k": "p",
      "t": "Công thức bậc siêu tĩnh cho GH = 3·m + r − 3·n − c = 3×2 + 3 − 3×3 − 0 = 0. Số không nghĩa là tĩnh định, và mọi chương trình dừng ở công thức sẽ báo đúng như vậy. Nhưng không có gì giữ dầm theo phương ngang: nó là một cơ cấu và không thể giải được."
    },
    {
      "k": "table",
      "caption": "Phân tích động học trả về gì trên dầm đó, từng bước.",
      "head": [
        "Bước",
        "Xét điều gì",
        "Kết quả"
      ],
      "rows": [
        [
          "2 · Bậc siêu tĩnh",
          "GH = 3·m + r − 3·n − c",
          "0"
        ],
        [
          "3 · Ma trận độ cứng",
          "Phát hiện các dạng cơ cấu",
          "1"
        ],
        [
          "3 · Ma trận độ cứng",
          "Các bậc tự do không bị ngăn",
          "1"
        ],
        [
          "4 · Gợi ý",
          "Kết luận trên màn hình",
          "Không thể giải"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Ứng dụng không chỉ báo con số không rồi phủi tay. Nó phản bác chính con số đó ngay trong bước 2 đã tạo ra nó: “Công thức cho GH = 0 (điều kiện cần của tĩnh định), nhưng KHÔNG đủ”. Bước 3 lắp ghép ma trận độ cứng tổng thể, ở đây là 6×6, và báo “Phát hiện 1 dạng cơ cấu” bất chấp GH = 0 ≥ 0. Nó nêu tên nút 3 và chuyển vị ngang của nút, chỉ ra rằng phương trình ở bước 2 đếm liên kết mà không kiểm tra chúng đặt ở đâu, và kết thúc bằng “✗ Cơ cấu — không thể giải”."
    },
    {
      "k": "img",
      "base": "blog/hidden-mechanism",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic với dầm hai nhịp trên ba gối di động ngang, chịu 10 kN/m. Bảng phân tích động học cho GH = 3·2 + 3 − 3·3 = 0, và một thông báo ghi “Kết cấu không ổn định (cơ cấu): không có liên kết ngang ở bất kỳ gối tựa nào”.",
      "caption": "Cùng dầm đó trong ứng dụng: công thức cho số không, và bộ giải vẫn từ chối nó vì là cơ cấu."
    },
    {
      "k": "embed",
      "query": "example=hidden-mechanism&kin=1",
      "label": "Dầm trên ba gối tựa đứng, với bảng phân tích động học đang mở. Hãy đi qua bốn bước: bước thứ hai cho GH = 0 và bước thứ ba tìm ra cơ cấu mà số không đó đang che giấu. Thử đổi một gối thành gối cố định rồi chạy lại: bậc trở thành 1 và cơ cấu biến mất."
    },
    {
      "k": "h",
      "t": "Vì sao một khoa có thể quan tâm"
    },
    {
      "k": "p",
      "t": "Một sinh viên học công thức bậc mà không bao giờ thấy điều kiện đủ bị phá vỡ sẽ ra về với một quy tắc không đầy đủ mà không biết. Điều này khó trình bày trên bảng đen, vì ví dụ phá vỡ nó trông như một lỗi gõ. Ở đây nó nằm trên một màn hình, với con số và mâu thuẫn cạnh nhau."
    },
    {
      "k": "p",
      "t": "Không cần cài đặt hay mua giấy phép, và khoa không phải mua gì. Nó mở trong trình duyệt, và mô hình được chia sẻ bằng một đường liên kết."
    },
    {
      "k": "note",
      "t": "Nói cho rõ: không điều nào ở trên có nghĩa chúng tôi tốt hơn. Ftool mô hình hóa nhanh hơn và ít vướng hơn chúng tôi. MASTAN2 có một cuốn sách đứng sau mà chúng tôi không viết. Các bản tính tay của SkyCiv được trình bày đẹp hơn vài bảng của chúng tôi. Và sectionproperties giải bài toán vênh bằng phần tử hữu hạn trong khi chúng tôi xấp xỉ. Điều chúng tôi khẳng định hẹp hơn và khá cụ thể: trong các công cụ miễn phí đã xem, không công cụ nào tiếp cận các công cụ nâng cao từ phía khái niệm. Nếu bạn biết một công cụ miễn phí giải thích phân tích động học, lập bảng thống kê cốt thép hoặc trình bày phân tích tiết diện, hãy viết cho chúng tôi và chúng tôi sẽ sửa bài này."
    }
  ]
};

export default body;
