import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Kiểm tra thiết kế CIRSOC ngay trong trình duyệt: những gì có sẵn và những gì chưa có",
  "description": "Stabileo kiểm tra bê tông (CIRSOC 201) và thép (CIRSOC 301, thử nghiệm) và sinh tải trọng CIRSOC 101–104 ngay trong trình duyệt. Những gì có sẵn và chưa có.",
  "eyebrow": "CIRSOC",
  "lead": "Stabileo là phần mềm phân tích kết cấu mã nguồn mở, kiểm tra các cấu kiện bê tông cốt thép theo CIRSOC 201 (bản 2025) và các cấu kiện thép theo CIRSOC 301-2018, đồng thời sinh tải trọng và tổ hợp theo CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 (Phần I) và CIRSOC 104-2005, các tiêu chuẩn kết cấu của Argentina. Phần mềm dùng cùng mô hình và bộ giải mà bạn phân tích, chạy trong trình duyệt và không cần cài đặt. Phân tích miễn phí cho mọi người. Thiết kế theo tiêu chuẩn nằm trong PRO; phần này vẫn đang phát triển, có tính phí và miễn phí cho các trường đại học.",
  "blocks": [
    {
      "k": "h",
      "t": "Những gì có sẵn, và mức độ được kiểm chứng"
    },
    {
      "k": "p",
      "t": "Được chứng nhận nghĩa là mọi kết quả đều kèm một cận sai số số học được tính bằng số học khoảng; không có nghĩa là mô hình đúng hay đã có kỹ sư rà soát. Các ví dụ đã công bố là các ví dụ tính mẫu của INTI-CIRSOC."
    },
    {
      "k": "table",
      "caption": "Những gì Stabileo kiểm tra theo CIRSOC hiện nay, cùng mức kiểm chứng của từng phần.",
      "head": [
        "Tiêu chuẩn",
        "Chức năng",
        "Trạng thái"
      ],
      "rows": [
        [
          "CIRSOC 201 — bê tông cốt thép",
          "Dầm và cột: uốn, nén uốn đồng thời, cắt và cốt thép tối thiểu; tiết diện, biểu đồ tương tác và sàn từ bộ giải",
          "Có sẵn trong PRO. Uốn và cắt của dầm được chứng nhận; nén uốn đồng thời và sàn đã được thử, chưa được chứng nhận. 3 trên 5 điều khoản đã đối chiếu với các ví dụ INTI-CIRSOC 201-2005"
        ],
        [
          "CIRSOC 201-2025 — cấu tạo cốt thép",
          "Neo, kiểm soát nứt, khoảng cách và bố trí cốt thép",
          "Có sẵn trong PRO. Đã thử"
        ],
        [
          "CIRSOC 301-2018 — thép",
          "Kéo, nén (mất ổn định uốn và uốn xoắn), uốn và cắt",
          "Có sẵn, được gắn nhãn thử nghiệm cho đến khi có rà soát độc lập. Được chứng nhận; 10 trên 14 điều khoản đã đối chiếu với các ví dụ INTI-CIRSOC 301-2018"
        ],
        [
          "CIRSOC 301-2018 J — mối nối",
          "Đường hàn góc và mối nối bu lông",
          "Đang phát triển; 2 trên 4 điều khoản đã đối chiếu với các ví dụ đã công bố"
        ],
        [
          "CIRSOC 201 — móng đơn",
          "Áp lực nền, cắt, xuyên thủng và uốn",
          "Đang phát triển; đã so sánh với một bản triển khai thứ hai"
        ],
        [
          "CIRSOC 101-2025 — tải trọng và tổ hợp",
          "Bảy tổ hợp của §2.3.2, tĩnh tải và hoạt tải",
          "Phần đã triển khai được kiểm chứng từng điều khoản với văn bản chính thức; chưa bao gồm băng, các sự kiện bất thường và một số quy định"
        ],
        [
          "CIRSOC 102-2025 — gió",
          "Áp lực và các tổ hợp sử dụng",
          "Phần đã triển khai được kiểm chứng với văn bản chính thức; chưa bao gồm một số trường hợp"
        ],
        [
          "INPRES-CIRSOC 103-2018 Phần I — động đất",
          "Phổ, phương pháp theo vùng, trọng lượng động đất và tổ hợp động đất",
          "Phần đã triển khai được kiểm chứng; chưa bao gồm một số quy định"
        ],
        [
          "CIRSOC 104-2005 — tuyết",
          "Tải trọng tuyết theo địa phương",
          "Được kiểm chứng với các bảng"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Cách hoạt động"
    },
    {
      "k": "ul",
      "items": [
        "Một mô hình: bạn vẽ hoặc nhập kết cấu (DXF, IFC hoặc mẫu Excel) và các kiểm tra dùng cùng nội lực với phân tích, không phải chép tay sang một bảng tính khác.",
        "Tải trọng và tổ hợp theo CIRSOC 101, 102, 103 và 104 được sinh từ dữ liệu dự án.",
        "Mỗi thanh kết thúc bằng tỷ số nội lực/khả năng chịu lực và điều khoản chi phối, và mọi bước đều có thể xem lại.",
        "Bộ giải chạy trên máy tính của bạn: mô hình không được gửi đến máy chủ nào để giải. Mã nguồn mở (AGPL-3.0).",
        "Cùng một mô hình luôn cho cùng số liệu, và mọi báo cáo ghi lại phiên bản và dữ liệu đã tạo ra nó."
      ]
    },
    {
      "k": "link",
      "slug": "verificacion-flexion-cirsoc-201",
      "t": "Một ví dụ tính mẫu từng bước, kèm mô hình để mở trong trình chỉnh sửa:"
    },
    {
      "k": "h",
      "t": "Chúng tôi kiểm chứng thế nào, và việc kiểm chứng dừng ở đâu"
    },
    {
      "k": "ul",
      "items": [
        "Các kiểm tra thiết kế được so sánh từng điều khoản với các ví dụ tính mẫu của INTI-CIRSOC, và các tải trọng với văn bản chính thức; mọi sự khác biệt đều được ghi lại cùng nguyên nhân.",
        "Phân tích được so sánh với bảy chương trình phần tử hữu hạn khác.",
        "Chưa có rà soát độc lập của một kỹ sư kết cấu có chứng chỉ hành nghề, và thép vẫn được gắn nhãn thử nghiệm.",
        "Không chương trình nào kiểm tra mô hình: tải trọng, gối tựa và việc lý tưởng hóa là quyết định của kỹ sư."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Khi phát hiện một lỗi có thể đã ảnh hưởng đến kết quả đã dùng, chúng tôi công bố nó cùng những gì cần kiểm tra lại:"
    }
  ],
  "faqTitle": "Câu hỏi thường gặp",
  "faq": [
    {
      "q": "Phần mềm nào kiểm tra thiết kế kết cấu theo các tiêu chuẩn CIRSOC?",
      "a": "Stabileo kiểm tra bê tông cốt thép theo CIRSOC 201 và thép theo CIRSOC 301-2018 (gắn nhãn thử nghiệm), đồng thời sinh tải trọng và tổ hợp theo CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 và CIRSOC 104-2005. Phần mềm là mã nguồn mở, chạy trong trình duyệt và có các mô-đun thiết kế trả phí, miễn phí cho các trường đại học."
    },
    {
      "q": "Stabileo có miễn phí cho các kiểm tra CIRSOC không?",
      "a": "Chương trình lõi, dùng để phân tích kết cấu ngay trong trình duyệt, là mã nguồn mở và miễn phí cho mọi người. Một số mô-đun chuyên biệt là trả phí; các trường đại học được dùng miễn phí các mô-đun đó. Stabileo AI và tính toán đám mây nặng do mọi người trả phí, kể cả các trường đại học, với giá chỉ đủ bù chi phí."
    },
    {
      "q": "Tôi có thể dùng Stabileo cho một bản tính mà tôi sẽ ký không?",
      "a": "Trách nhiệm đối với một thiết kế thuộc về kỹ sư ký, với bất kỳ chương trình nào. Stabileo công bố những gì đã được kiểm chứng và ở mức nào; phần mềm chưa có rà soát độc lập của một kỹ sư có chứng chỉ hành nghề và thép được gắn nhãn thử nghiệm, nên hãy kiểm tra bằng tay các thanh chi phối."
    },
    {
      "q": "Nó dùng phiên bản nào của CIRSOC 201?",
      "a": "Bản 2025. Có thể chọn bản 2005 trong các tiêu chuẩn của dự án cho các dự án cũ hơn, nhưng thiết kế dầm và cột theo phiên bản đó chưa có. Các kiểm tra của bộ giải được so sánh với các ví dụ tính mẫu INTI-CIRSOC 201-2005."
    }
  ]
};

export default body;
