import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Giải pháp thay thế SAP2000 miễn phí, mã nguồn mở để phân tích, ngay trong trình duyệt",
  "description": "Stabileo: phân tích kết cấu miễn phí, mã nguồn mở trong trình duyệt. Khung 2D/3D, vỏ, P-Delta, dao động riêng và phổ; kiểm tra tiêu chuẩn trả phí.",
  "eyebrow": "Giải pháp thay thế SAP2000",
  "lead": "Stabileo là phần mềm phân tích kết cấu miễn phí, mã nguồn mở (AGPL-3.0) chạy trong trình duyệt của bạn, không cần cài đặt, khóa bản quyền hay tài khoản. Bộ giải được viết bằng Rust và biên dịch sang WebAssembly, nên mô hình được giải ngay trên máy tính của bạn. Chế độ Basic mô hình hóa, đặt tải trọng, giải và đọc kết quả cho khung và giàn 2D và 3D; chế độ PRO bổ sung sàn và vách, nhập DXF và IFC, tải trọng theo tiêu chuẩn và kiểm tra thanh. Phân tích miễn phí cho mọi người; các mô-đun thiết kế có tính phí và miễn phí cho các trường đại học.",
  "blocks": [
    {
      "k": "h",
      "t": "Khi nào nó là một giải pháp thay thế tốt"
    },
    {
      "k": "ul",
      "items": [
        "Phân tích khung, giàn và nhà mà không phải trả tiền bản quyền hay cài đặt gì, trên mọi hệ điều hành có trình duyệt hiện đại.",
        "Kiểm tra kết quả từ một chương trình khác: Stabileo được so sánh với bảy chương trình phần tử hữu hạn khác, và mọi dòng mã của nó đều đọc được.",
        "Giảng dạy và học tập: nó trình bày phương pháp độ cứng từng bước.",
        "Kiểm tra các cấu kiện thép và bê tông theo AISC 360, EN 1993-1-1, AISI S100, ACI 318, EN 1992-1-1 và các tiêu chuẩn CIRSOC của Argentina, trong chế độ PRO."
      ]
    },
    {
      "k": "h",
      "t": "Khi nào chưa phải"
    },
    {
      "k": "ul",
      "items": [
        "Nếu bạn cần dải tiêu chuẩn thiết kế rộng và nhiều thập kỷ thành tích của một chương trình thương mại lâu đời: thiết kế theo tiêu chuẩn trong Stabileo vẫn đang phát triển.",
        "Nếu công ty bạn yêu cầu phần mềm được một kỹ sư có chứng chỉ hành nghề rà soát độc lập: việc rà soát đó chưa diễn ra."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Chúng tôi kiểm tra kết quả thế nào, và các kiểm tra dừng ở đâu:"
    }
  ],
  "faqTitle": "Câu hỏi thường gặp",
  "faq": [
    {
      "q": "Giải pháp thay thế miễn phí tốt nhất cho SAP2000 là gì?",
      "a": "Tùy bạn dùng SAP2000 để làm gì. Để phân tích khung, giàn và vỏ 2D và 3D trong trình duyệt mà không phải cài gì, Stabileo miễn phí và mã nguồn mở. Để phân tích nghiên cứu phi tuyến bằng script, OpenSees là lựa chọn mã nguồn mở lâu đời."
    },
    {
      "q": "Tôi có thể dùng Stabileo thay vì trả tiền bản quyền SAP2000 hoặc ETABS không?",
      "a": "Với phân tích khung, giàn và nhiều tòa nhà, và với kiểm tra thanh theo AISC 360, ACI 318, các Eurocode và CIRSOC, được. Phân tích miễn phí; các mô-đun thiết kế chuyên biệt có tính phí và miễn phí cho các trường đại học. Với dải tiêu chuẩn thiết kế đầy đủ và thành tích sản xuất lâu dài, các chương trình thương mại vẫn cung cấp nhiều hơn; thiết kế theo tiêu chuẩn trong Stabileo vẫn đang phát triển."
    },
    {
      "q": "Stabileo có thật sự miễn phí không?",
      "a": "Chương trình lõi, dùng để phân tích kết cấu ngay trong trình duyệt, là mã nguồn mở và miễn phí cho mọi người. Một số mô-đun chuyên biệt là trả phí; các trường đại học được dùng miễn phí các mô-đun đó. Stabileo AI và tính toán đám mây nặng do mọi người trả phí, kể cả các trường đại học, với giá chỉ đủ bù chi phí."
    },
    {
      "q": "Nó có chạy trên Mac hoặc Linux không?",
      "a": "Có. Nó chạy trên mọi trình duyệt hiện đại, trên mọi hệ điều hành."
    }
  ]
};

export default body;
