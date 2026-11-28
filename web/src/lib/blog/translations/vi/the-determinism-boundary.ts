import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Ranh giới tất định: vì sao tác tử AI không được tự làm phép tính",
  "excerpt": "Một mô hình ngôn ngữ không thể bảo đảm một con số là đúng. Trong kiến trúc chúng tôi đề xuất cho kỹ thuật kết cấu, tác tử diễn giải và đề xuất, còn mọi con số đều đến từ một bộ giải đã được kiểm chứng.",
  "blocks": [
    {
      "k": "p",
      "t": "Hàng chục năm phần mềm thương mại đã khiến phần thuần số của bài toán phân tích kết cấu trở nên nhanh chóng. Lắp ghép một ma trận độ cứng và giải một hệ phương trình tuyến tính là bài toán đã được hiểu rõ và tính toán rất rẻ. Thời gian của kỹ sư dành cho những việc khác: xây dựng mô hình, dựng lại mỗi khi kiến trúc thay đổi, định nghĩa tải trọng và tổ hợp, kiểm tra từng phần tử theo tiêu chuẩn thiết kế, rồi lập thuyết minh tính toán và bản vẽ."
    },
    {
      "k": "p",
      "t": "Nút thắt nằm ở phần việc thủ công xung quanh phép tính. Xây dựng, sửa đổi, kiểm tra và lập tài liệu cho mô hình là nơi một tác tử AI có thể giúp, với một điều kiện: nó không bao giờ được đụng vào chính phép tính."
    },
    {
      "k": "h",
      "t": "Điều mà một mô hình ngôn ngữ không thể bảo đảm"
    },
    {
      "k": "p",
      "t": "Một mô hình ngôn ngữ sinh văn bản theo xác suất. Nó không có hiểu biết về vật lý hay về cách các hệ thống thực hành xử, và nó có thể “ảo giác”: đưa ra những câu trả lời nghe có vẻ hợp lý nhưng vô nghĩa. Trong phân tích kết cấu, rủi ro này rất cụ thể. Mô hình hóa đòi hỏi suy luận không gian và tính nhất quán về tô pô, và khi một mô hình được xây qua nhiều bước, sai sót sẽ cộng dồn."
    },
    {
      "k": "p",
      "t": "Tuy nhiên, ràng buộc mạnh nhất đến từ thực tiễn nghề nghiệp. Mọi kết quả kết cấu đều được ký, kèm theo quyền tác giả và trách nhiệm pháp lý của chữ ký. Con số quyết định kích thước một cột là cam kết của kỹ sư hành nghề đã ký xác nhận nó. Một tác tử giao ra những kết quả chưa được kiểm tra sẽ để người làm nghề gánh rủi ro khi ký một bản tính mà không ai đã kiểm chứng."
    },
    {
      "k": "quote",
      "t": "Tính đúng đắn phải là thuộc tính của bộ giải, không phải của ngôn ngữ."
    },
    {
      "k": "h",
      "t": "Ranh giới tất định"
    },
    {
      "k": "p",
      "t": "Kiến trúc này tách suy luận bằng ngôn ngữ tự nhiên khỏi tính toán số. Tác tử đề xuất các phương án và kịch bản, nhưng một kết quả chỉ được tính khi nó xuất ra từ một chương trình mà tác tử không thể sửa đổi, một chương trình mã hóa vật lý của bài toán. Mô hình chọn gọi công cụ tất định nào và với tham số nào, rồi làm việc với những gì công cụ trả về. Nó không bao giờ tự tạo ra một con số và không bao giờ bịa ra hình học."
    },
    {
      "k": "p",
      "t": "Trong thực tế, điều này gồm ba lớp. Lớp ý định là tác tử: nó diễn giải ngôn ngữ tự nhiên, đặt câu hỏi làm rõ và phát ra các hành động có kiểu. Lớp tính toán tất định chứa mọi thứ tạo ra dữ liệu kỹ thuật: bộ giải, các mô-đun CIRSOC chạy kiểm tra theo tiêu chuẩn thiết kế, và các bộ sinh mô hình triển khai một loại hình kết cấu thành mô hình hoàn chỉnh. Lớp tài liệu tạo ra thuyết minh, bản vẽ và bảng bóc tách khối lượng từ những kết quả đã được tính."
    },
    {
      "k": "p",
      "t": "Đây không phải là một mẫu hình mới. Nó chiếm ưu thế trong các tài liệu gần đây về tác tử kỹ thuật và xuất hiện ở các lĩnh vực lân cận: các tác tử lập trình hoạt động được vì trình biên dịch và bộ kiểm thử cho chúng biết mã có biên dịch và vượt qua hay không, còn AlphaProof chứng minh được định lý vì một bộ kiểm chứng hình thức không cho lọt một sai sót nào. Chúng tôi chủ động áp dụng nó như một nguyên tắc thiết kế."
    },
    {
      "k": "h",
      "t": "Ranh giới này bảo đảm điều gì và điều gì nằm ngoài nó"
    },
    {
      "k": "p",
      "t": "Cần nói cụ thể ranh giới này bảo đảm điều gì và bỏ ngỏ điều gì. Điều nó bảo đảm:"
    },
    {
      "k": "ul",
      "items": [
        "Mọi con số tác tử nêu ra đều có thể truy về một kết quả cụ thể của bộ giải: tổ hợp, mặt cắt, phần tử.",
        "Mọi đầu ra của AI đều được kiểm tra theo lược đồ mô hình trước khi nhập vào, và bị từ chối nếu sai định dạng hoặc chứa trường không xác định.",
        "Nếu dịch vụ AI ngừng hoạt động, bộ giải, trình soạn thảo và các kiểm tra theo tiêu chuẩn thiết kế vẫn tiếp tục chạy."
      ]
    },
    {
      "k": "p",
      "t": "Điều nó không bảo đảm: rằng mô hình lý tưởng hóa là mô hình đúng cho bài toán thực (đó là quyết định kỹ thuật), rằng thiết kế là tối ưu, rằng tải trọng và các giả thiết đã đầy đủ, hoặc rằng cách đọc tiêu chuẩn không cần rà soát."
    },
    {
      "k": "note",
      "t": "Ranh giới cho phép bạn kiểm soát mọi kết quả đến từ đâu; nó không bảo đảm rằng mô hình bạn thiết lập biểu diễn đúng bài toán thực. Tác tử làm việc như một trợ lý vẽ kỹ thuật: nó đề xuất một thay đổi, người dùng xem bản tóm tắt những gì sẽ bị sửa và có thể áp dụng, thử lại hoặc hủy. Mỗi thay đổi đã áp dụng là một bước hoàn tác duy nhất."
    },
    {
      "k": "h",
      "t": "Một trường hợp phải giải lại mô hình"
    },
    {
      "k": "p",
      "t": "Kỹ sư mô tả một khung ngang bê tông cốt thép nhịp 6 m, cao 4 m, chân cột ngàm và có tải trọng phân bố trên dầm. Tác tử hỏi những gì còn thiếu: thép hay bê tông? Chân cột ngàm hay khớp? Có tải trọng ngang không? Sau đó nó phát ra hành động tạo khung. Phần máy chủ triển khai nó một cách tất định thành mô hình có 4 nút, 3 phần tử và 6 bậc tự do chưa bị ngăn. Thiết kế dùng bê tông H-21, dầm 25×40 cm làm phương án đầu, cột 30×30 cm và tải 30 kN/m trên dầm."
    },
    {
      "k": "p",
      "t": "Khi mô hình đã được giải, mỗi cột chịu một phản lực thẳng đứng 90 kN và cân bằng tổng thể được thỏa mãn chính xác: ΣRz = 180 kN = q·L. Mô men dầm chi phối là Mu = 80,8 kN·m ở giữa nhịp. Kiểm tra uốn theo CIRSOC 201 cho dầm 25×40 với 3Ø16 cho khả năng chịu lực φMn = 73,3 kN·m, nên dầm không đạt."
    },
    {
      "k": "img",
      "base": "blog/determinism-portal",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic với khung ngang bê tông rộng 6 m, cao 4 m, chân cột ngàm, được giải dưới tải 30 kN/m trên dầm. Biểu đồ mô men uốn cho 80,8 kN·m ở giữa nhịp, −54,2 kN·m ở hai đầu dầm và 27,0 kN·m ở chân cột.",
      "caption": "Khung của phần này trong Stabileo (H-21, cột 30×30, dầm 25×40): bộ giải cho mô men giữa nhịp 80,8 kN·m nêu ở trên."
    },
    {
      "k": "table",
      "caption": "Kiểm tra uốn của dầm khung, trước và sau khi hiệu chỉnh.",
      "head": [
        "Trạng thái",
        "Tiết diện",
        "Cốt thép",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "D/C",
        "Đạt"
      ],
      "rows": [
        [
          "Ban đầu",
          "25×40 cm",
          "3Ø16",
          "80.8",
          "73.3",
          "1.10",
          "Không"
        ],
        [
          "Đã hiệu chỉnh",
          "30×55 cm",
          "3Ø16",
          "105.6",
          "108.6",
          "0.97",
          "Có"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Hãy nhìn cột Mu. Tăng dầm từ 25×40 lên 30×55 làm nội lực tăng từ 80,8 lên 105,6 kN·m. Trong một khung siêu tĩnh, tĩnh học cố định tổng của mô men đầu dầm và mô men giữa nhịp; độ cứng chỉ thay đổi cách chia tổng đó. Một dầm cứng hơn so với các cột của nó nhận được ít ngàm đàn hồi hơn từ cột và làm việc giống dầm đơn giản hơn, nên mô men giữa nhịp, vốn chi phối ở đây, tăng lên."
    },
    {
      "k": "quote",
      "t": "Một tác tử ước lượng ảnh hưởng mà không giải lại sẽ cho kết quả sai, và nghe vẫn thuyết phục không kém."
    },
    {
      "k": "p",
      "t": "Ví dụ cho thấy vì sao phải giải lại mô hình, ngoài việc tính lại khả năng chịu lực của tiết diện mới. Trong kết cấu siêu tĩnh, tăng kích thước một tiết diện làm thay đổi cách phân bố nội lực, và nhu cầu có thể tăng đúng ở cấu kiện mà bạn muốn giảm tải."
    },
    {
      "k": "h",
      "t": "Bỏ một cột khỏi tòa nhà đã được thiết kế"
    },
    {
      "k": "p",
      "t": "Trường hợp thứ hai bắt đầu từ một khung có bốn nhịp 5 m và ba tầng cao 3 m, chân cột ngàm, dầm 25×50 cm (4Φ16), cột 35×35 cm và tải 25 kN/m trên mọi dầm: 20 nút, 27 phần tử và 45 bậc tự do chưa bị ngăn. Sau khi giải và kiểm tra, mọi dầm đều đạt với biên độ dư thoải mái."
    },
    {
      "k": "p",
      "t": "Một thay đổi kiến trúc bỏ đi một cột bên trong ở tầng trệt. Hành động chỉnh sửa xóa nó kèm kiểm tra tính toàn vẹn kết cấu, và mô hình được giải lại; cân bằng tổng thể được thỏa mãn trước và sau (ΣRz = 1500 kN). Các dầm trước đây được cột đó đỡ nay vượt nhịp 10 m và, cùng với các dầm thẳng hàng phía trên, gánh phần gối đã mất. Sáu dầm vượt D/C = 1."
    },
    {
      "k": "table",
      "caption": "Dầm chi phối của tòa nhà trong ba trạng thái.",
      "head": [
        "Trạng thái",
        "Tiết diện",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "D/C",
        "Đạt"
      ],
      "rows": [
        [
          "Nguyên vẹn",
          "25×50 (4Φ16)",
          "54.2",
          "125.3",
          "0.43",
          "Có"
        ],
        [
          "Đã bỏ cột",
          "25×50 (4Φ16)",
          "203.9",
          "125.3",
          "1.63",
          "Không"
        ],
        [
          "Đã đổi kích thước",
          "30×65 (5Φ20)",
          "189.8",
          "313.7",
          "0.61",
          "Có"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Mô men của dầm chi phối tăng gần gấp bốn. Với 30×65 cm và 5Φ20 ở các dầm bị ảnh hưởng và một lần giải mới, mọi dầm lại đạt. Trường hợp này cũng cho thấy một thay đổi mà làm tay nghĩa là mô hình hóa lại, phân tích lại, kiểm tra lại và bố trí cốt thép lại cho nhiều cấu kiện có thể được xử lý trong một cuộc trò chuyện ngắn, với mọi con số truy được về bộ giải và chịu sự phê duyệt của kỹ sư."
    },
    {
      "k": "h",
      "t": "Bốn quyết định thiết kế đằng sau ranh giới"
    },
    {
      "k": "ol",
      "items": [
        "Hành động có kiểu thay vì sinh mã tự do. Trong nhiều hệ thống trước đây, mô hình viết các script Python rồi chạy trên một bộ giải bên ngoài. Ở đây, đầu ra của tác tử bị giới hạn trong một tập đóng các lời gọi với hợp đồng đầu vào và đầu ra tường minh, mỗi lời gọi được kiểm tra theo lược đồ trước khi chạy. Ranh giới đó hẹp hơn mã tùy ý và dễ kiểm toán hơn.",
        "Bộ giải của riêng chúng tôi, thay vì một lớp phủ lên bộ giải của người khác. Động cơ được viết từ đầu bằng Rust, không phụ thuộc thư viện đại số tuyến tính bên ngoài, và có bộ kiểm chứng riêng đối chiếu với các lời giải giải tích và các bài chuẩn tham chiếu: khoảng 6.800 bài kiểm thử đạt, cùng các phép so sánh với một chương trình thương mại trên cùng các mô hình, với chênh lệch dưới 0,1%.",
        "Tuân thủ tiêu chuẩn thiết kế một cách nguyên bản. Các kiểm tra theo CIRSOC 201 và 301, mà chúng tôi chưa thấy được triển khai nguyên bản trong phần mềm mã nguồn mở nào. Mô-đun bê tông đã được triển khai và kiểm thử; mô-đun thép hiện vẫn chỉ nằm ở phần giao diện và chưa có bộ kiểm thử riêng. Chúng tôi nói rõ điều này để không phóng đại mức độ hoàn thiện của nó.",
        "Chạy trong trình duyệt. Động cơ được biên dịch sang WebAssembly và chạy cục bộ trên máy của người dùng, không cần máy chủ tính toán và không phải cài đặt gì."
      ]
    },
    {
      "k": "note",
      "t": "Cập nhật, ngày 20 tháng 10 năm 2026: từ phiên bản 0.2.0, động cơ kiểm tra lại mọi kiểm tra thép theo CIRSOC 301 (kết quả mà nó không xác nhận được sẽ hiển thị là không đạt hoặc chưa được kiểm chứng), và mô-đun được kiểm thử theo các ví dụ tính toán đã công bố; chúng vẫn được gắn nhãn thử nghiệm cho đến khi có đánh giá độc lập. Các số liệu trong bài này là của bài báo đã công bố, được tính với phiên bản tháng 8 năm 2026, trước các sửa lỗi 0.2.0 cho kiểm tra bê tông (thông báo an toàn SA-2026-002); chúng được trích nguyên như trong đó."
    },
    {
      "k": "h",
      "t": "Từ bộ giải đã được kiểm thử đến bộ giải đã được chứng minh"
    },
    {
      "k": "p",
      "t": "Ranh giới bảo đảm rằng mọi khẳng định của tác tử đều truy được về một đầu ra của bộ giải. Sự bảo đảm đó kế thừa một giới hạn: bộ giải đáng tin vì được kiểm thử rộng rãi, nhưng tính đúng đắn của nó chưa được chứng minh hình thức. Một bộ kiểm thử, dù kỹ lưỡng đến đâu, cũng chỉ bao phủ những trường hợp mà các tác giả của nó nghĩ tới."
    },
    {
      "k": "p",
      "t": "Điều này càng quan trọng hơn trong bối cảnh này. Một tác tử xây dựng mô hình, sửa đổi chúng qua nhiều bước và đọc kết quả để đề xuất các hành động mới; trên đường đi, bộ giải nhận những đầu vào mà không kỹ sư nào xem xét trước khi chúng tới động cơ. Nếu động cơ hoạt động sai ở một trường hợp biên (ma trận độ cứng gần suy biến, hình học suy biến, tổ hợp tải cực đoan), tác tử có thể trích dẫn kết quả đó mà không kèm cảnh báo nào."
    },
    {
      "k": "p",
      "t": "Hai kỹ thuật có thể thu hẹp khoảng cách đó. Kiểm thử ngẫu nhiên dựa trên thuộc tính (fuzzing) sinh hàng nghìn mô hình ngẫu nhiên hợp lệ và kiểm tra các bất biến phải đúng với mọi đầu vào:"
    },
    {
      "k": "ul",
      "items": [
        "Cân bằng tổng thể: ΣR = P, bất kể hình học, vật liệu hay liên kết.",
        "Tính đối xứng của ma trận độ cứng: K = Kᵀ theo cách xây dựng.",
        "K xác định dương với mọi kết cấu không có cơ cấu.",
        "Bất biến dưới các phép biến đổi vật rắn: tịnh tiến hoặc xoay một mô hình không làm thay đổi nội lực."
      ]
    },
    {
      "k": "p",
      "t": "Kiểm chứng hình thức tiếp cận cùng khoảng trống đó từ phía bên kia: viết một đặc tả toán học cho các thuộc tính ấy và chứng minh, bằng một trợ lý chứng minh như Lean 4, rằng phần triển khai thỏa mãn nó. Kiểm thử có thể tìm ra sai sót; kiểm chứng hình thức có thể chỉ ra rằng chúng không tồn tại trong miền đã đặc tả. Hai cách bổ sung cho nhau: khi bộ fuzzing tìm ra một đầu vào phá vỡ một thuộc tính, thuộc tính đó trở thành ứng viên cho một chứng minh."
    },
    {
      "k": "note",
      "t": "Mục tiêu là một bộ giải có phần lõi số học then chốt được kiểm chứng hình thức. Khi đó ranh giới tất định sẽ trở thành một bảo đảm toán học: mọi con số trích trong một bản thuyết minh tính toán đều truy về một phép tính đã được chứng minh là đúng."
    },
    {
      "k": "h",
      "t": "Hiện trạng ngày nay"
    },
    {
      "k": "p",
      "t": "Để kết, đây là những gì đã có và chưa có. Bộ giải, trình soạn thảo, các kiểm tra CIRSOC, chế độ giáo dục cùng việc tạo thuyết minh và bản vẽ hiện chạy ngay trong trình duyệt tại stabileo.com, không cần cài đặt và không cần tài khoản. Lớp tác tử đang được phát triển tích cực: các tuyến của nó chạy trong môi trường phát triển và thử nghiệm với máy chủ của chúng tôi, trên cùng bộ giải và cùng các con số như mọi thứ khác, nhưng máy chủ đó chưa thuộc trang công khai."
    },
    {
      "k": "p",
      "t": "Chu trình khép kín với bộ giải trong vòng lặp, trong đó tác tử đề xuất, giải, đánh giá và sửa đổi mà không cần con người can thiệp, nằm trong lộ trình và chưa được triển khai. Phạm vi tiêu chuẩn thiết kế nguyên bản giới hạn ở CIRSOC 201 và 301; phần còn lại là việc tương lai."
    },
    {
      "k": "p",
      "t": "CAD đã đảm nhận phần cơ học của việc vẽ kỹ thuật và bảng tính đã đảm nhận phép tính số học lặp lại, trong khi phán đoán kỹ thuật vẫn thuộc về kỹ sư. Tác tử là bước tiếp theo trên con đường đó: nó đảm nhận việc xây dựng và sửa đổi mô hình, nhập tải trọng, chạy các kiểm tra và chuẩn bị tài liệu. Không điều gì trong số này chuyển giao trách nhiệm: con số được ký vẫn là của kỹ sư."
    },
    {
      "k": "note",
      "t": "Bài này được chuyển thể từ “Desarrollo de un agente estructural de cálculo sobre un solver verificado” (Chesta, Bertero, Carrone và Kingston), trình bày tại JAIE 2026. Các số liệu trích dẫn là đầu ra của bộ giải Stabileo và mô-đun CIRSOC 201 của nó, lấy từ bài báo đó."
    }
  ]
};

export default body;
