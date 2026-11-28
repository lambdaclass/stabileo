import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.5.0: thêm 23 thông báo an toàn; mọi lỗi kết quả sai còn mở đều có cảnh báo hoặc bị từ chối",
  "excerpt": "Những thay đổi so với 0.4.0: hai mươi ba lỗi có thể cho kết quả sai hoặc thiên về không an toàn, được viết thành thông báo an toàn và đã sửa hết trừ một lỗi; một cảnh báo hoặc một sự từ chối cho mỗi lỗi còn mở; và khóa học từng bước trong Basic.",
  "blocks": [
    {
      "k": "p",
      "t": "Từ 0.4.0, chúng tôi liên tục kiểm tra Stabileo từ nhiều phía cùng lúc: bộ giải so với các lời giải đã công bố và các chương trình khác, các kiểm tra thiết kế so với các ví dụ tính mẫu, cùng một kết cấu được đánh số lại, đổi tỷ lệ và dời chỗ, và các tệp mà những bản phát hành trước đã lưu. Việc đó phát hiện thêm hai mươi ba lỗi có thể cho kết quả sai hoặc thiên về không an toàn. Mỗi lỗi có một thông báo an toàn nêu lỗi nằm ở đâu, ai bị ảnh hưởng và cần kiểm tra lại gì. Hai mươi hai lỗi đã được sửa; phá hoại dẻo 2D (SA-2026-044) vẫn bị từ chối cho đến khi #758 được sửa."
    },
    {
      "k": "note",
      "t": "stabileo.com công bố mọi thay đổi ngay khi được hợp nhất, nên phần lớn các bản sửa này đã hoạt động, mỗi bản từ ngày được hợp nhất. Các dự án được lưu trước một thay đổi liên quan đến chúng sẽ yêu cầu kiểm tra lại khi mở, bằng ngôn ngữ của người đọc. Có hai bản sửa không làm được như vậy: một mô hình 2D được cắt từ 3D trước #1295 mở ra mà không có thông báo, vì chính mô hình mới là phần sai (SA-2026-035). Hãy cắt lại từ 3D, hoặc tính trong 3D. Điều tương tự áp dụng cho tiết diện chữ nhật hoặc ống được nhập từ Excel hoặc IFC trước #1310 (SA-2026-039): hãy nhập lại."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic mở một khung phẳng từ các ví dụ, được lưu là đã tính với phiên bản kết quả 15. Một hộp thoại có tiêu đề “Kết quả đã thay đổi kể từ lần tính cuối của dự án này” liệt kê các thay đổi liên quan đến dự án, trong đó có bản sửa mất ổn định 2D cho các thanh có lực dọc thay đổi và giá trị chi phối được đọc tại đỉnh thực, mỗi thay đổi kèm lời giải thích, và yêu cầu đánh dấu “Tôi đã đọc các thay đổi này” trước khi tiếp tục hoặc chạy lại phân tích.",
      "caption": "Một dự án được lưu trước một thay đổi liên quan đến nó sẽ yêu cầu kiểm tra lại khi được mở, và liệt kê từng thay đổi."
    },
    {
      "k": "h",
      "t": "Chạy lại các dự án của bạn"
    },
    {
      "k": "p",
      "t": "Đây là những trường hợp làm dịch chuyển kết quả thiết kế nhiều nhất. Mỗi thông báo an toàn có ví dụ cụ thể và hướng dẫn xử lý các kết quả bạn đã giao."
    },
    {
      "k": "table",
      "caption": "Một số bản sửa của 0.5.0, theo mô tả của từng thông báo an toàn, cùng phiên bản kết quả đã đưa từng bản sửa vào; SA-2026-035 không có, nên thông báo an toàn của nó là thông báo duy nhất.",
      "head": [
        "Thông báo an toàn",
        "Phiên bản kết quả",
        "Lỗi gì",
        "Mức độ"
      ],
      "rows": [
        [
          "SA-2026-029",
          "7",
          "Các kiểm tra thiết kế 3D đọc mô men hoặc lực cắt theo phương ngang: một cột CIRSOC 201 chịu uốn quanh Mz bị kiểm tra theo chiều cao tiết diện, thiếu 36 % cốt thép trong một ví dụ",
          "Nghiêm trọng"
        ],
        [
          "SA-2026-028",
          "8",
          "Tính uốn theo EN 1992-1-1 giả định cốt thép chịu kéo đã chảy: MRd cao hơn thực tế tới 22 %",
          "Cao"
        ],
        [
          "SA-2026-030",
          "12",
          "Nén theo CIRSOC 301: một tiết diện có Qa ≤ 0 nhận được khả năng chịu lực vượt tải chảy dẻo toàn tiết diện, và được tính là đạt",
          "Cao"
        ],
        [
          "SA-2026-041",
          "19",
          "Kiểm tra cột bê tông cốt thép chỉ ghép mô men lớn nhất với lực nén lớn nhất: thiên về không an toàn tới 15 % trong một ví dụ",
          "Cao"
        ],
        [
          "SA-2026-042",
          "23",
          "Mất ổn định 2D phóng đại hệ số của các thanh có lực nén tăng dần dọc theo thanh: +43 % đến +68 % cho một thanh",
          "Cao"
        ],
        [
          "SA-2026-038",
          "35",
          "Mất ổn định 3D dùng lực dọc trung bình của từng thanh: +43 % trên hệ số của một thanh có tải trọng dọc theo thanh",
          "Cao"
        ],
        [
          "SA-2026-043",
          "32",
          "Phân tích điều hòa mất hiệu chỉnh của các dạng dao động bị bỏ qua khi một dạng mềm hơn các dạng còn lại nhiều: lệch 79 lần tại 2,3 Hz trong một ví dụ",
          "Cao"
        ],
        [
          "SA-2026-035",
          "—",
          "Một phép cắt từ 3D sang 2D làm các thanh uốn quanh sai trục tiết diện: một khung cổng Y–Z cứng gấp 13,5 lần",
          "Cao"
        ],
        [
          "SA-2026-033",
          "20",
          "Bộ sinh tải trọng bỏ sót toàn bộ tải trọng diện tích của một sàn khi có một thanh thấp nằm dưới một phần của sàn",
          "Cao"
        ],
        [
          "SA-2026-027",
          "11",
          "Biểu đồ bao của vỏ giữ tổ hợp có Von Mises lớn nhất, không phải cực trị của từng thành phần: mx thấp hơn 14 % trong một ví dụ",
          "Cao"
        ],
        [
          "SA-2026-047",
          "49",
          "Trong mô hình có vỏ, một trường hợp tải trọng áp đặt chuyển vị gối tựa mất toàn bộ ứng suất vỏ của nó, nên các tổ hợp và biểu đồ bao chỉ cộng ứng suất vỏ của các trường hợp khác: ứng suất vỏ tổ hợp có thể thiên về không an toàn, không có cảnh báo. Có trong 0.2.0, 0.3.0 và 0.4.0 (#1676)",
          "Cao"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Mọi dự án có vỏ được tính trước #1676 đều nêu SA-2026-047 khi mở (#1691): là bị ảnh hưởng khi mô hình có một trường hợp tải trọng áp đặt chuyển vị gối tựa và có các tổ hợp tải trọng, và nếu không thì là có thể bị ảnh hưởng, vì một dự án đã lưu không thể chứng tỏ rằng nó chưa từng có trường hợp tải trọng như vậy. Tính lại sẽ xóa thông báo; sau đó hãy so sánh ứng suất vỏ của các tổ hợp có chứa trường hợp đó."
    },
    {
      "k": "p",
      "t": "Các thông báo an toàn còn lại gồm: cấu kiện bê tông chịu xoắn theo ACI 318 và EN 1992 (SA-2026-040), các liên kết của mô hình được cắt về 2D từ mặt phẳng Y–Z hoặc X–Y (SA-2026-036), phân tích đồng xoay 3D với góc xoay lớn (SA-2026-037), tải trọng tại t = 0 trên một nút không có khối lượng trong phân tích lịch sử thời gian (SA-2026-031), dạng không của một cơ cấu trong phân tích dao động riêng (SA-2026-032), kiểm tra cân bằng của báo cáo sau phân tích (SA-2026-034), phá hoại dẻo 2D, vẫn bị từ chối cho đến khi #758 được sửa (SA-2026-044), phá hoại dẻo 3D với một thanh không có mô men dẻo dùng được, nay bị từ chối (SA-2026-045), phân tích điều hòa chọn giữa chồng chập dạng dao động và giải trực tiếp theo từng tải trọng, nên phép chồng chập bị hỏng (SA-2026-046), tiết diện chữ nhật và ống nhập từ Excel hoặc IFC với Iy và Iz bị đổi chỗ (SA-2026-039) và, cho những ai gọi trực tiếp bộ giải, kiểm tra cắt thép không có diện tích chịu cắt theo AISC 360 và EN 1993 (SA-2026-025 và 026)."
    },
    {
      "k": "h",
      "t": "Các thay đổi khác làm dịch chuyển kết quả"
    },
    {
      "k": "p",
      "t": "Các thay đổi khác cũng làm thay đổi số liệu, nên mỗi thay đổi đều có trong thông báo kiểm tra lại; phần lớn không có thông báo an toàn riêng, còn dạng không trong phân tích dao động riêng là SA-2026-032 ở trên:"
    },
    {
      "k": "ul",
      "items": [
        "Giá trị chi phối của một thanh và biểu đồ bao 2D đọc tại đỉnh thực của biểu đồ, không phải điểm gần nhất trong 21 mặt cắt: giá trị có thể tăng, 0,23 % với tải trọng tam giác và 1,05 % với tải trọng một phần ngắn trong các trường hợp được ghi nhận, và không bao giờ giảm.",
        "Các cơ cấu bị từ chối thay vì được giải: sau một liên kết cứng hoặc một vách cứng sàn trong 2D, sau một bộ nối trong 2D (#1415), và trong phân tích dao động riêng, vốn từng bỏ dạng không và trả các dạng còn lại như đầy đủ, kể cả một cơ cấu trượt dọc các gối nghiêng.",
        "Phân tích phi tuyến vật liệu 3D giải song song các khung có và không có hằng số vênh, và các nút chỉ được nối bởi giàn, thay vì báo lỗi hoặc từ chối chúng; các mô hình đã giải trước đây cho cùng số liệu.",
        "Các trị riêng lặp giữ nguyên bội của chúng, và các kết quả tĩnh và dao động riêng tự kiểm tra cân bằng và tính trực giao trước khi được hiển thị.",
        "Trong Basic, P-Δ và lực tới hạn chia mỗi thanh thành các phần tử, phá hoại dẻo đóng các khớp đang dỡ tải, và đường ảnh hưởng của mô men uốn lấy chiều võng xuống là dương, như mọi mô men khác trong Basic.",
        "Một kiểm tra thiết kế không thể đánh giá được sẽ bị từ chối thay vì được tính là đạt, và một góc xoay nút mềm nhưng có thật không còn bị khóa khi mô hình có một phần cứng hơn nhiều.",
        "Phân tích tuyến tính cảnh báo khi một góc xoay vượt 0,1 rad, cả bên trong nhịp của thanh (kể cả độ dốc mà biến dạng cắt cộng vào trục của thanh và độ cong của gradien nhiệt tại một đầu được giải phóng, #1569) lẫn trên các chuyển vị riêng của một tổ hợp, và khi lực nén có thể khuếch đại mô men của nó quá 10 %; trong lúc cảnh báo thứ hai này hiển thị, các kiểm tra CIRSOC 301 bị giữ lại. Nơi có cảnh báo góc xoay, hãy chạy phân tích phi tuyến hình học (góc xoay lớn); nơi có cảnh báo khuếch đại, hãy chạy P-Δ hoặc phân tích bậc hai khác."
      ]
    },
    {
      "k": "h",
      "t": "Cảnh báo hoặc từ chối, cho đến khi mỗi bản sửa ra đời"
    },
    {
      "k": "p",
      "t": "Mọi vấn đề còn mở có thể cho kết quả sai nay đều có một cảnh báo hoặc một sự từ chối tại mỗi nơi nó có thể đến tay kỹ sư (#807). Cảnh báo giữ lại kết quả và nêu vấn đề bên cạnh; từ chối giữ lại kết quả và nói lý do. Một sổ đăng ký trong kho mã liệt kê mọi vấn đề an toàn còn mở cùng cảnh báo hoặc sự từ chối của nó, điều kiện kích hoạt và phép thử chứng minh nó được kích hoạt, và một phép thử giữ cho sổ này khớp với bộ giải."
    },
    {
      "k": "ul",
      "items": [
        "Bị từ chối: hệ số phá hoại dẻo 2D, có thể thay đổi tới 4,6 lần tùy theo cách đánh số, chiều của các thanh và đơn vị (#758); một hệ số mất ổn định nằm ngoài giới hạn của chứng chỉ của chính nó (#741); vỏ MITC4 trên lưới méo chịu uốn trong mặt phẳng đáng kể (#798); và vỏ MITC4 và MITC9 trên hình học bị vặn (#1057).",
        "Có cảnh báo: trong số khác, lịch sử thời gian, chồng chập dạng dao động 3D, mô hình gần suy biến, tiếp xúc, phân tích phi tuyến vật liệu và các bộ nối có độ cứng không bằng nhau.",
        "Ngoài những gì bị từ chối, biện pháp ngăn chặn chỉ thay đổi một số liệu: phản lực 2D của một gối lún cũng mang một lò xo theo phương lún nay bao gồm lực của lò xo đó. Mọi giá trị khác trong 145.515 giá trị của tập kết quả đều giống hệt."
      ]
    },
    {
      "k": "note",
      "t": "Hai sự từ chối lấy đi các kết quả mà một số người đọc dùng. Hệ số phá hoại dẻo của khung phẳng bị giữ lại cho đến khi #758 được sửa. Một số lưới vỏ méo có kết quả nằm trong phạm vi 2 % so với tham chiếu cũng bị giữ lại: chúng tôi chọn từ chối thừa một lần hơn là hiển thị một độ cứng sai mà không cảnh báo, và việc thu hẹp phạm vi này nằm trong lộ trình."
    },
    {
      "k": "h",
      "t": "Cũng trong 0.5.0"
    },
    {
      "k": "ul",
      "items": [
        "Basic dạy phân tích kết cấu từng bước: tĩnh học, phương pháp lực và phương pháp chuyển vị, đường ảnh hưởng, bậc hai và mất ổn định, phân tích dẻo và động lực học, mỗi phần được giải thích từng bước trong ứng dụng. Bài phá hoại dẻo của nó bị giữ lại cùng với phần còn lại của phá hoại dẻo 2D cho đến khi #758 được sửa.",
        "Tiếng Đức, tiếng Pháp và tiếng Thổ Nhĩ Kỳ được cung cấp trở lại.",
        "Trợ lý AI hoạt động với khóa Anthropic hoặc OpenAI của chính bạn, chỉ được giữ trong trình duyệt của bạn, và /tools có các mô hình trực tiếp mà bộ giải tính lại khi thanh trượt di chuyển.",
        "PRO: các tầng chủ và tầng tương tự, kết quả tấm theo đơn vị bề rộng với mô men chính và hướng của chúng, báo cáo sau phân tích, một trình xem chỉ đọc với “Nhân bản và chỉnh sửa”, và một IFC được liên kết vẽ dưới dạng tham chiếu 3D.",
        "Các tệp được lưu bởi 0.2.0, 0.3.0 và 0.4.0 mở được, được chuyển đổi và cho cùng kết quả ở mỗi thay đổi, trừ nơi áp dụng một thay đổi kết quả đã đăng ký; một tệp được lưu bởi phiên bản mới hơn bị từ chối kèm một thông báo nói rõ điều đó.",
        "Cùng một kết cấu được đổi tỷ lệ, đánh số lại, đảo chiều hoặc dời chỗ phải cho cùng một đáp án, được kiểm tra trên 17 loại phân tích ở mỗi thay đổi và trên 8.192 mô hình sinh ra mỗi đêm.",
        "Cũng đã sửa: tương tác đất-kết cấu báo các phản lực gối tựa của nó, vốn từng trả về rỗng (#1675); các vỏ của hai họ được đánh số giống nhau bị các tổ hợp và biểu đồ bao từ chối thay vì để một họ được tổ hợp thay cho họ kia (#1669); và ứng suất von Mises và ứng suất chính của vỏ không còn tràn số hoặc tràn dưới ở các độ lớn cực đoan, với kết quả trong phạm vi bình thường giống hệt từng bit (#1688).",
        "Một dự án được tính với một phiên bản có lỗi cho kết quả sai đã biết trong một tính năng mà nó dùng sẽ nêu thông báo an toàn cho đến khi được tính lại (#1657), và các dự án ghi lại mọi phân tích đã chạy, nên một thông báo an toàn về một phân tích vẫn còn cho đến khi phân tích đó chạy lại (#1663).",
        "Nhanh hơn: tự động lưu mỗi 30 giây bỏ qua một dự án không đổi (#1664), một không gian làm việc 3D lớn mở lại với ít rác cần thu gom hơn (#1668), và các kết quả 3D đã công bố được đóng băng nên việc kiểm tra từ chối do lỗi đã biết chỉ chạy một lần cho mỗi kết quả (#1689).",
        "Thêm các kiểm tra bộ giải: tính tương hỗ với mô men, các tổ hợp có hệ số và chồng chập của mọi thành phần ứng suất vỏ (#1665), và một bản ghi kết quả cho mỗi nút, gối tựa, phần tử và vỏ trong mọi phân tích (#1674), đã tìm ra các lỗi SSI và tổ hợp vỏ ở trên.",
        "Stabileo Research và Stabileo Tools: các bản tái lập chạy được của các bài báo và bài đối chuẩn đã công bố, được hiệu chỉnh sau một vòng rà soát của ba người phản biện, và các máy tính miễn phí chạy trên cùng bộ giải."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Các thông báo an toàn hoạt động thế nào, và hai mươi bốn thông báo đầu tiên:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Danh mục thông báo an toàn",
      "t": "Mọi thông báo an toàn, với mức độ, vấn đề và bản sửa của nó:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Nhật ký thay đổi",
      "t": "Toàn bộ hồ sơ kỹ thuật:"
    }
  ]
};

export default body;
