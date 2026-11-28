import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Khi một kết quả thay đổi: phiên bản kết quả, kiểm tra lại và thông báo an toàn",
  "excerpt": "Cách Stabileo cho bạn biết một bản sửa liên quan đến những dự án nào của bạn, cách nó giữ lại một kết quả mà nó biết có thể sai cho đến khi có bản sửa, và cách bản sửa được công bố, cùng mười bốn phiên bản kết quả được hợp nhất ngày 4 và 5 tháng 11.",
  "blocks": [
    {
      "k": "p",
      "t": "Mỗi bản sửa cho một bộ giải kết cấu đều làm thay đổi một con số mà ai đó có thể đã dùng. Một hệ số mất ổn định từng quá cao nay thấp hơn; một mô hình từng giải được nay bị từ chối. Một bản sửa đến với ứng dụng trong im lặng sẽ để lại con số cũ trong các tính toán đã nộp, và kỹ sư tạo ra chúng không có lý do gì để xem lại."
    },
    {
      "k": "p",
      "t": "Bài viết này mô tả Stabileo làm gì về việc đó, từ lúc một lỗi được tìm thấy đến lúc bản sửa của nó được công bố. Các ví dụ là có thật: ngày 4 và 5 tháng 11 năm 2026, mười bốn phiên bản kết quả, từ 16 đến 29, đã lên stabileo.com."
    },
    {
      "k": "h",
      "t": "Phiên bản kết quả là gì"
    },
    {
      "k": "p",
      "t": "Phiên bản kết quả là một số nguyên, tách biệt với phiên bản ứng dụng. Nó tăng lên một mỗi khi một thay đổi đến trang web làm cùng một mô hình đã lưu cho ra các con số khác, hoặc từ chối một mô hình từng giải được. Mỗi thay đổi như vậy được đăng ký kèm theo:"
    },
    {
      "k": "ul",
      "items": [
        "phiên bản mà nó đi vào, ngày của nó và các pull request của nó;",
        "nó liên quan đến những mô hình nào, viết dưới dạng các tính năng của mô hình: một mô hình phẳng có ràng buộc, một phân tích mất ổn định 2D có tải trọng dọc theo thanh, một thanh bê tông được kiểm tra theo CIRSOC 201;",
        "một tiêu đề và một lời giải thích cho kỹ sư bằng mỗi một trong sáu ngôn ngữ của ứng dụng, kèm những gì cần kiểm tra lại;",
        "một liên kết tới bản mô tả đầy đủ: một thông báo an toàn, một ghi chú thay đổi kết quả hoặc nhật ký thay đổi."
      ]
    },
    {
      "k": "p",
      "t": "Mỗi lần giải đóng dấu lên dự án phiên bản kết quả đã tạo ra nó, cùng phiên bản ứng dụng, commit, phiên bản bộ máy tính toán, mã băm của tệp nhị phân bộ máy tính toán và các phân tích đã chạy. Dấu đi cùng dự án: một tệp đã lưu, một bản tự lưu, một thẻ đang mở hay một liên kết chia sẻ đều mang nó."
    },
    {
      "k": "note",
      "t": "Một phiên bản kết quả không bao giờ được dùng lại. Mỗi lần hợp nhất vào nhánh chính đều được triển khai và đóng dấu những gì nó giải bằng phiên bản hiện tại, nên một mục thêm vào một phiên bản đã có trên trang web sẽ không bao giờ đến được các dự án mà phiên bản đó đã đóng dấu. Một phép thử thất bại khi có sự bổ sung như vậy."
    },
    {
      "k": "h",
      "t": "Vì sao một phiên bản thay đổi"
    },
    {
      "k": "p",
      "t": "Hầu hết các thay đổi là bản sửa: một kết quả từng sai và nay đúng. Một số là từ chối: một mô hình từng cho ra một con số nay cho một thông báo rõ ràng, vì con số đó không có ý nghĩa. Và một phiên bản cũng có thể hoàn tác: phiên bản 15 đã rút lại ba thay đổi của phiên bản 14 mà các bản sửa rà soát của chúng chưa lên trang web cùng chúng, và các phiên bản 27 đến 29 đưa chúng trở lại, đã được rà soát. Một dự án đã giải bằng phiên bản 14 được thông báo về cả hai."
    },
    {
      "k": "table",
      "caption": "Các phiên bản kết quả 16 đến 29, được hợp nhất ngày 4 và 5 tháng 11 năm 2026.",
      "head": [
        "Phiên bản",
        "Thay đổi",
        "Loại"
      ],
      "rows": [
        [
          "16",
          "Nhôm: lực cắt theo trục yếu được kiểm tra",
          "Sửa"
        ],
        [
          "17",
          "Mối nối thép: mô men theo trục yếu không còn bị bỏ qua",
          "Từ chối"
        ],
        [
          "18",
          "ACI 318 và EN 1992: các thanh bê tông chịu xoắn được đánh dấu là chưa kiểm tra",
          "Từ chối"
        ],
        [
          "19",
          "Cột BTCT cũng được kiểm tra dưới lực nén nhỏ nhất của chúng (SA-2026-041)",
          "Sửa"
        ],
        [
          "20",
          "Bộ tạo tải trọng: một sàn nằm một phần dưới kết cấu mái thấp vẫn giữ các tải trọng diện tích của nó (SA-2026-033)",
          "Sửa"
        ],
        [
          "21",
          "Hình vỏ được xuất hiển thị trường và tỷ lệ của màn hình",
          "Sửa"
        ],
        [
          "22",
          "2D: một cơ cấu phía sau liên kết cứng hoặc vách cứng ngang bị từ chối",
          "Từ chối"
        ],
        [
          "23",
          "Mất ổn định 2D của các thanh có lực dọc thay đổi dọc theo chúng (SA-2026-042)",
          "Sửa"
        ],
        [
          "24",
          "Phân tích đồng xoay 3D với các góc xoay lớn quanh nhiều trục (SA-2026-037)",
          "Sửa"
        ],
        [
          "25",
          "Các ràng buộc của một mô hình 2D cắt từ mặt phẳng Y–Z hoặc X–Y (SA-2026-036)",
          "Sửa"
        ],
        [
          "26",
          "Giá trị khống chế của một thanh và biểu đồ bao 2D đọc đúng đỉnh thực",
          "Sửa"
        ],
        [
          "27–29",
          "Ba thay đổi của Basic bị phiên bản 15 rút lại nay trở về, đã rà soát: phá hoại dẻo, P-Δ và dấu của đường ảnh hưởng mô men",
          "Sửa"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Thông báo kiểm tra lại"
    },
    {
      "k": "p",
      "t": "Khi một dự án được mở, ứng dụng so sánh dấu của nó với sổ đăng ký và liệt kê các thay đổi đã thực hiện từ đó liên quan đến mô hình đó. Một khung phẳng có phân tích mất ổn định được thông báo về bản sửa mất ổn định 2D; một khung thép không có bê tông thì không được thông báo về kiểm tra cột BTCT. Danh sách này không phải là một thông báo nhanh rồi biến mất: hộp thông báo không có nút đóng, bỏ qua phím Escape và các cú nhấp bên ngoài, và chỉ được đóng bằng cách đánh dấu “Tôi đã đọc các thay đổi này” rồi chọn tiếp tục hoặc chạy lại."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic mở một khung phẳng từ các ví dụ, được lưu là đã giải với phiên bản kết quả 15. Một hộp thoại có tiêu đề “Kết quả đã thay đổi kể từ lần giải gần nhất của dự án này” liệt kê các thay đổi liên quan đến nó, trong đó có bản sửa mất ổn định 2D cho các thanh có lực dọc thay đổi và giá trị khống chế được đọc tại đỉnh thực, mỗi thay đổi kèm lời giải thích, và yêu cầu đánh dấu “Tôi đã đọc các thay đổi này” trước khi tiếp tục hoặc chạy lại phân tích.",
      "caption": "Một khung phẳng đã giải với phiên bản 15, mở hôm nay: chỉ các thay đổi liên quan đến mô hình này được liệt kê, mỗi thay đổi kèm những gì cần kiểm tra lại."
    },
    {
      "k": "p",
      "t": "Cho đến khi mô hình được giải lại, kết quả của nó được đánh dấu là đã lỗi thời: một biểu ngữ nói rõ điều đó, và mọi báo cáo, bảng tính và CSV được xuất trong thời gian đó đều in cảnh báo STALE trong phần nguồn gốc. “Chạy lại phân tích và thiết kế” giải lại và, trong PRO, kiểm tra lại các thanh bê tông với cốt thép đã chọn; nó không thiết kế lại chúng, vì như vậy sẽ ghi đè các thanh thép của kỹ sư."
    },
    {
      "k": "p",
      "t": "Từ ngày 4 tháng 11 (#1406), thông báo giải thích từng thay đổi bằng ngôn ngữ của người đọc trong cả sáu ngôn ngữ của ứng dụng. Trước đó, người đọc tiếng Đức, Pháp và Thổ Nhĩ Kỳ nhận tiêu đề và lời giải thích bằng tiếng Anh: 66 trong 72 thay đổi đã đăng ký không có văn bản ở các ngôn ngữ đó. Mỗi bản dịch được kiểm tra bằng cách dịch ngược sang tiếng Anh mà không có bản gốc và so sánh ý nghĩa: các con số, dấu, tải trọng nào, kiểm tra nào, phía an toàn hay không an toàn. Phép kiểm tra đó đã sửa các câu ở cả ba ngôn ngữ, và cho thấy bốn lời giải thích tiếng Anh mơ hồ ngay từ nguồn; chúng đã được sửa ở cả sáu ngôn ngữ."
    },
    {
      "k": "h",
      "t": "Trước khi sửa: cảnh báo hoặc từ chối"
    },
    {
      "k": "p",
      "t": "Một lỗi thường được tìm thấy trước khi được sửa, đôi khi trước nhiều ngày. Trong thời gian đó, kết quả bị ảnh hưởng vẫn hiện trên màn hình. Quy tắc chúng tôi theo là ngăn chặn trước và sửa sau (issue #447): mọi lỗi còn mở có thể cho kết quả sai đều nhận, tại mỗi điểm vào mà nó ảnh hưởng, hoặc một cảnh báo hoặc một từ chối."
    },
    {
      "k": "ul",
      "items": [
        "Một cảnh báo giữ nguyên kết quả và hiển thị, bên cạnh nó, vấn đề đã biết nào có thể ảnh hưởng đến nó và cần kiểm tra tay những gì.",
        "Một từ chối không đưa ra kết quả và nói rõ lý do, khi con số có thể sai theo một hệ số lớn mà không có cách nào nhận ra từ đầu ra, chẳng hạn một hệ số thay đổi gấp nhiều lần theo cách đánh số các thanh."
      ]
    },
    {
      "k": "img",
      "base": "blog/results-refusal",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic với ví dụ cơ cấu ẩn: một dầm hai nhịp trên ba gối tựa đều di động theo phương ngang, chịu tải trọng phân bố đều 10 kN/m. Sau khi Tính toán, không có biểu đồ nào được vẽ; một thông báo màu đỏ ở góc ghi “Kết cấu không ổn định (cơ cấu): không có liên kết ngang ở bất kỳ gối tựa nào.” kèm một nút để xem phân tích động học.",
      "caption": "Cùng quy tắc đó bên ngoài sổ theo dõi: một mô hình là cơ cấu nhận được một thông báo nói rõ lý do, và không có con số nào."
    },
    {
      "k": "p",
      "t": "Việc ngăn chặn được lưu trong một sổ theo dõi liệt kê mọi vấn đề an toàn còn mở, cảnh báo hoặc từ chối của nó, điều kiện kích hoạt nó và phép thử cho thấy nó kích hoạt, hoặc bằng chứng rằng không cần ngăn chặn. Một phép thử giữ cho sổ theo dõi và danh sách các lỗi đã biết của bộ máy tính toán khớp nhau, và một tác vụ theo lịch so sánh sổ theo dõi với các issue đang mở trên GitHub. Các điều kiện được cố ý đặt hẹp: trên 39 mô hình của kho kết quả, mỗi cảnh báo kích hoạt nhiều nhất ở hai mô hình. Pull request hoàn thiện sổ theo dõi này cho mọi issue đang mở (#807) đã được đưa vào ngày 5 tháng 11, trước bản phát hành 0.5.0."
    },
    {
      "k": "p",
      "t": "Một biện pháp ngăn chặn kết thúc khi bản sửa của nó được đưa vào, và kết thúc trong cùng pull request. Tuần này #1295 đã gỡ bỏ việc từ chối các phép cắt 3D sang 2D làm thanh uốn quanh sai trục, vì phép cắt nay đã đúng; #1301 thay một cảnh báo trên mọi lần giải đồng xoay 3D bằng một cảnh báo chỉ kích hoạt khi đầu một thanh xoay quá 0,02 rad so với dây cung của nó, nơi phép xấp xỉ còn lại có thể có ý nghĩa."
    },
    {
      "k": "h",
      "t": "Các bản sửa của tuần này"
    },
    {
      "k": "p",
      "t": "Mất ổn định 2D với tải trọng dọc theo thanh (#1324, phiên bản 23). Độ cứng hình học của mỗi thanh dùng lực dọc trung bình của nó. Ở nơi lực nén tăng về phía đầu xoay nhiều nhất, như dưới trọng lực trên một kèo hoặc một tải trọng dọc tập trung trong nhịp, hệ số mất ổn định ra quá cao và không có gì cảnh báo. Nay mỗi thanh lấy tích phân lực dọc biến thiên của nó."
    },
    {
      "k": "table",
      "caption": "Một thanh, λP·L²/EI. Nguồn: SA-2026-042.",
      "head": [
        "Trường hợp",
        "Chính xác",
        "Trước đây",
        "Nay"
      ],
      "rows": [
        [
          "Công xôn, lực nén tăng từ 0 tại ngàm đến P ở đầu mút",
          "3.477",
          "4.972 (+43 %)",
          "3.542 (+1.9 %)"
        ],
        [
          "Công xôn, lực đẩy P ở đầu mút và một tải trọng dọc ngược chiều P ở giữa nhịp: lực nén P chỉ từ giữa nhịp đến đầu mút",
          "2.961",
          "4.972 (+68 %)",
          "3.056 (+3.2 %)"
        ],
        [
          "Cột nặng của Euler, lực nén lớn nhất tại ngàm",
          "7.837",
          "4.972 (−37 %)",
          "7.889 (+0.7 %)"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Vài phần trăm còn lại là sai số rời rạc hóa thông thường của một phần tử cho mỗi thanh, và nó giảm khi thanh được chia nhỏ. P-Delta vẫn dùng lực dọc trung bình, và mất ổn định 3D với tải trọng dọc theo thanh giữ cảnh báo của nó cho đến khi có bản sửa riêng."
    },
    {
      "k": "p",
      "t": "Phân tích đồng xoay 3D (#1301, phiên bản 24). Các góc xoay đầu thanh bị trừ dưới dạng vectơ xoay, điều này chỉ chính xác khi mọi góc xoay có cùng một trục. Bài toán uốn 45° của Bathe–Bolourchi ra lệch 1,3 % so với nghiệm đã công bố, và việc làm mịn lưới đưa nó ra xa các tham chiếu chứ không lại gần. Nay các góc xoay được hợp thành dưới dạng ma trận xoay: cùng bài toán uốn đó nằm trong 0,4 % so với hai nghiệm đã công bố độc lập và hội tụ ở giữa chúng. Một thanh có hai đầu xoay tương đối quá 0,9π bị từ chối, vì kết quả không thể cho biết đó là vòng xoay nguyên nào."
    },
    {
      "k": "p",
      "t": "Một cơ cấu ẩn trong 2D (#1298, phiên bản 22). Một liên kết cứng hoặc một vách cứng ngang từ một nút mà các thanh đều có khớp tới đầu một thanh giàn là một cơ cấu, nhưng bộ giải giữ nó bằng một lò xo giả rất nhỏ và trả về các chuyển vị hàng trăm kilômét, mà chứng nhận sau đó đã chứng nhận. Một mô hình như vậy nay bị từ chối. Bản sửa không đề xuất thông báo an toàn nào cho trường hợp này: trong các trường hợp tìm thấy, các chuyển vị là vô lý, cỡ 10⁵ m, và đi kèm cảnh báo của ứng dụng về khả năng có cơ cấu. Đó là một đánh giá về các trường hợp ấy, không phải một chứng minh rằng không có kết quả bị ảnh hưởng nào trông hợp lý. Điều sai là khẳng định của chứng nhận, và mục phiên bản thông báo cho các dự án liên quan. Một trường hợp tương tự qua một bộ nối thay vì liên kết cứng được tìm thấy sau đó (#1414); bản sửa của nó (#1415) đã được đưa vào ngày 5 tháng 11."
    },
    {
      "k": "p",
      "t": "Cắt một mô hình 3D sang 2D (#1295). Phép cắt dùng mô men quán tính theo trục mạnh của mỗi tiết diện cho mọi thanh, nên cột trong phép cắt Y–Z, dầm trong phép cắt X–Y và các thanh xoay 90° uốn quanh sai trục: một khung cổng IPN 300 đứng trong Y–Z chuyển vị ngang 0,96 mm trong 2D so với 13,0 mm trong 3D. Nay mỗi thanh uốn trong 2D quanh trục mà nó uốn trong 3D, và các phép cắt mà mô hình phẳng không biểu diễn được bị từ chối. Bản sửa này không có phiên bản kết quả, và đó là có chủ ý: một mô hình 2D đã lưu giải đúng như trước, vì điều sai là mô hình do phép cắt tạo ra. Thông báo kiểm tra lại không thể đến được các tệp đó, nên thông báo an toàn (SA-2026-035) là kênh: cắt lại mô hình từ 3D, hoặc giải nó trong 3D."
    },
    {
      "k": "h",
      "t": "Sau khi sửa: các thông báo an toàn"
    },
    {
      "k": "p",
      "t": "Một lỗi có thể đã tạo ra kết quả sai hoặc không an toàn trong một phiên bản đã phát hành nhận một thông báo an toàn: điều gì sai, nó ảnh hưởng đến những mô hình nào, cách nhận biết chúng, cần kiểm tra lại gì trong các kết quả đã giao, và trường hợp tái hiện nó. Các thông báo cho các bản sửa của tuần này hiện đã được soạn trong kho mã và sẽ được công bố cùng bản phát hành 0.5.0, như SA-2026-001 đến 024 đã được công bố cùng 0.3.0 và 0.4.0."
    },
    {
      "k": "table",
      "caption": "Các thông báo an toàn được soạn cho các bản sửa hợp nhất ngày 4 và 5 tháng 11 năm 2026.",
      "head": [
        "Thông báo",
        "Điều gì đã sai",
        "Mức độ nghiêm trọng"
      ],
      "rows": [
        [
          "SA-2026-033",
          "Bộ tạo tải trọng bỏ sót các tải trọng diện tích của một sàn khi một thanh thấp nằm trên một phần của nó",
          "Cao"
        ],
        [
          "SA-2026-034",
          "Kiểm tra cân bằng khớp ở các trường hợp mà phép kiểm tra đã bỏ sót tải trọng",
          "Trung bình"
        ],
        [
          "SA-2026-035",
          "Phép cắt 3D sang 2D làm các thanh uốn quanh sai trục tiết diện",
          "Cao"
        ],
        [
          "SA-2026-036",
          "Phép cắt 3D sang 2D trên Y–Z hoặc X–Y đọc các ràng buộc như thể khung đứng trong X–Z",
          "Cao"
        ],
        [
          "SA-2026-037",
          "Phân tích đồng xoay 3D đã trừ các vectơ xoay",
          "Trung bình"
        ],
        [
          "SA-2026-040",
          "Các kiểm tra ACI 318 và EN 1992 cho đạt các thanh bê tông mà không kiểm tra xoắn của chúng",
          "Cao"
        ],
        [
          "SA-2026-041",
          "Kiểm tra cột BTCT chỉ ghép mô men lớn nhất với lực nén lớn nhất",
          "Cao"
        ],
        [
          "SA-2026-042",
          "Mất ổn định 2D đánh giá quá cao hệ số của các thanh có lực nén tăng dọc theo chúng",
          "Cao"
        ]
      ]
    },
    {
      "k": "img",
      "base": "blog/results-changelog",
      "w": 1600,
      "h": 1000,
      "alt": "Trang nhật ký thay đổi của Stabileo trên trang web: mục mới nhất đứng đầu, ngày 6 tháng 11, có tiêu đề “Đã sửa các kết quả sai trong kiểm tra thiết kế và dao động, sửa các tải trọng được tạo ra, và hoàn thiện chế độ phân tích của PRO”, mở đầu bằng các thay đổi của bộ máy tính toán, và có bộ lọc theo lĩnh vực ở bên trái.",
      "caption": "Trang nhật ký thay đổi, mới nhất trước, mở đầu bằng các bản sửa của tuần này làm thay đổi kết quả."
    },
    {
      "k": "h",
      "t": "Những gì việc này không làm"
    },
    {
      "k": "ul",
      "items": [
        "Thông báo chỉ biết về các thay đổi đã đăng ký. Một lỗi chưa được tìm thấy không nằm trong sổ đăng ký nào; đó là việc của phần xác minh đằng sau bộ giải, và là điều việc ngăn chặn bao quát khi đã tìm thấy.",
        "Nó đọc các tính năng của mô hình từ tệp đã lưu, và khi không xác định được, nó coi tính năng đó là có mặt: thừa một thông báo còn hơn để một thay đổi bị che khỏi mô hình mà nó liên quan.",
        "Nó không thể theo dõi một con số khi con số rời khỏi ứng dụng, trong một bản vẽ, một bảng tính hay một báo cáo đã giao. Đó là việc của thông báo an toàn.",
        "Dù được ngăn chặn, bị từ chối hay đã sửa, kết quả vẫn thuộc về kỹ sư kiểm tra trước khi ký."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Mọi thông báo an toàn đã công bố, kèm những gì cần kiểm tra lại cho từng thông báo:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/PROVENANCE.md",
      "label": "Lời nhắc kiểm tra lại, nguồn gốc và khả năng tái tạo",
      "t": "Cách các phiên bản kết quả, dấu và thông báo hoạt động, chi tiết:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Chỉ mục thông báo an toàn",
      "t": "Các thông báo an toàn, kể cả các bản nháp cho 0.5.0:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/issues/447",
      "label": "Issue #447: ngăn chặn trước, sửa sau",
      "t": "Chính sách ngăn chặn và tiến độ của nó:"
    }
  ]
};

export default body;
