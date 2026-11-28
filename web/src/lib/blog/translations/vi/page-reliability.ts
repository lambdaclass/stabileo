import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Stabileo đáng tin cậy đến mức nào? Kết quả của nó được kiểm tra ra sao",
  "description": "Cách Stabileo kiểm tra kết quả: bảy chương trình phần tử hữu hạn khác, ví dụ đã công bố, cận sai số chứng minh trong Lean và thông báo an toàn công khai.",
  "eyebrow": "Độ tin cậy",
  "lead": "Kết quả của Stabileo được kiểm tra theo năm cách độc lập, gồm so sánh với bảy chương trình phần tử hữu hạn khác và các cận sai số mà phần toán cốt lõi được chứng minh trong Lean. Các lỗi có thể đã ảnh hưởng đến kết quả đang dùng được công bố dưới dạng thông báo an toàn (một số phát hiện vẫn đang được phân loại, công khai), và danh sách dưới đây cho biết lỗi nào đã sửa và ở phiên bản nào. Như mọi chương trình phân tích, nó không kiểm tra mô hình của bạn: tải trọng, gối tựa và việc lý tưởng hóa là quyết định của kỹ sư.",
  "blocks": [
    {
      "k": "h",
      "t": "Năm cách tìm lỗi"
    },
    {
      "k": "ul",
      "items": [
        "So sánh với các chương trình khác: cùng các mô hình, cả mô hình cố định lẫn mô hình ngẫu nhiên sinh ra mỗi đêm, được giải bằng OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos và CalculiX, và mọi sự khác biệt đều được điều tra.",
        "Tham chiếu đã công bố: các trường hợp có kết quả do chính tác giả công bố, và các kiểm tra thiết kế được so sánh với các ví dụ tính mẫu đã công bố (INTI-CIRSOC, AISC và các nguồn khác).",
        "Các bất biến vật lý: xoay, đối xứng hoặc đánh số lại một mô hình, hay đổi đơn vị của nó, phải làm đáp án thay đổi đúng như vật lý quy định.",
        "Suy dẫn: các ma trận phần tử khung được suy dẫn bằng ký hiệu và so sánh từng số hạng với mã.",
        "Fuzzing và kiểm thử đột biến: hàng triệu đầu vào sinh ra tìm các lỗi, và các sai sót được cố ý đưa vào để kiểm tra rằng các phép thử bắt được chúng."
      ]
    },
    {
      "k": "h",
      "t": "Kết quả có cận sai số"
    },
    {
      "k": "p",
      "t": "Với các kết quả cho phép, Stabileo tính, bằng số học khoảng, một cận chứa nghiệm chính xác của hệ phương trình đã giải; khi không tính được, kết quả được đánh dấu là chưa chứng nhận, kèm lý do. Phần toán cốt lõi được chứng minh trong Lean cho phân tích tuyến tính, các tổ hợp, phân tích dao động riêng và phá hoại dẻo. Từ 0.3.0, với phân tích tuyến tính của khung và giàn, cận này còn được kiểm tra với chính mô hình, bằng một phép ghép nối độc lập."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "Cách kiểm tra với mô hình hoạt động:"
    },
    {
      "k": "h",
      "t": "Vì sao chúng tôi công bố các thông báo an toàn"
    },
    {
      "k": "p",
      "t": "Việc kiểm chứng này đã phát hiện các lỗi thật, nhiều lỗi thiên về không an toàn. Chúng tôi công bố những lỗi có thể đã ảnh hưởng đến kết quả đang dùng, cùng cách nhận biết một mô hình bị ảnh hưởng và những gì cần kiểm tra lại, vì một lỗi không ai báo sẽ nằm lại trong các bản tính đã giao."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001 đến 004 đã được sửa trong phiên bản 0.2.0.",
        "SA-2026-005 đến 020 đã được sửa trong phiên bản 0.3.0.",
        "SA-2026-021 đến 024 đã được sửa trong phiên bản 0.4.0.",
        "SA-2026-025 đến 047 được công bố cùng phiên bản 0.5.0 và đã sửa trong đó (SA-2026-040 đã được khống chế: kiểm tra được đánh dấu là chưa đầy đủ), trừ SA-2026-044: phá hoại dẻo 2D vẫn bị từ chối cho đến khi #758 đóng.",
        "Ứng dụng báo một lần khi kết quả có thể đã thay đổi, và các dự án được lưu trước một thay đổi liên quan đến chúng sẽ yêu cầu kiểm tra lại khi mở."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Danh sách đầy đủ các thông báo an toàn:"
    },
    {
      "k": "h",
      "t": "Những gì không kiểm tra nào bảo đảm"
    },
    {
      "k": "ul",
      "items": [
        "Một cận sai số chỉ chặn sai số số học; nó không chứng minh mô hình đúng, và không chặn sai số rời rạc hóa của lưới.",
        "Chưa có rà soát độc lập của một kỹ sư kết cấu có chứng chỉ hành nghề, và kết quả thép CIRSOC 301 vẫn được gắn nhãn thử nghiệm.",
        "Phân tích phi tuyến vật liệu là một mô hình cát tuyến cho cả thanh.",
        "Thiết kế theo tiêu chuẩn trong PRO (cốt thép, cấu tạo và mối nối) vẫn đang phát triển và mặc định tắt.",
        "Các vấn đề an toàn còn mở được công khai trên GitHub, và mức kiểm chứng của mọi phân tích, phần tử và tiêu chuẩn nằm trong ma trận mức độ trưởng thành."
      ]
    },
    {
      "k": "p",
      "t": "Tóm lại: Stabileo phù hợp với phân tích bạn có thể đối chiếu chéo, giảng dạy, và công việc thiết kế mà kỹ sư rà soát các kết quả chi phối, như với bất kỳ chương trình nào. Nếu quy trình của bạn đòi hỏi phần mềm thương mại đã được rà soát độc lập hoặc được chứng nhận, Stabileo chưa đạt tới mức đó, và chúng tôi nói rõ điều này."
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Từng kiểm tra chi tiết, và các giới hạn của nó:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/MATURITY.md",
      "label": "Ma trận mức độ trưởng thành",
      "t": "Mức kiểm chứng của từng phần:"
    }
  ],
  "faqTitle": "Câu hỏi thường gặp",
  "faq": [
    {
      "q": "Stabileo có đáng tin cậy cho công việc thiết kế kết cấu thực tế không?",
      "a": "Kết quả của nó được kiểm tra theo năm cách độc lập, gồm so sánh với bảy chương trình phần tử hữu hạn khác và các cận sai số được chứng minh trong Lean, và các lỗi có thể đã ảnh hưởng đến kết quả đang dùng được công bố; những lỗi còn đang phân loại được công khai trên GitHub. Nó chưa có rà soát độc lập của một kỹ sư có chứng chỉ hành nghề và thiết kế theo tiêu chuẩn vẫn đang phát triển, nên, như với bất kỳ chương trình nào, kỹ sư rà soát mô hình và các kết quả chi phối."
    },
    {
      "q": "Vì sao Stabileo công bố các thông báo an toàn?",
      "a": "Vì việc kiểm chứng của nó đã phát hiện các lỗi thật, nhiều lỗi thiên về không an toàn, và một lỗi không ai báo sẽ nằm lại trong các bản tính đã giao. Mỗi thông báo an toàn nêu cách nhận biết một mô hình bị ảnh hưởng và những gì cần kiểm tra lại."
    },
    {
      "q": "Các thông báo an toàn đã công bố đã được sửa chưa?",
      "a": "Tất cả trừ hai. SA-2026-001 đến 004 đã được sửa trong phiên bản 0.2.0, SA-2026-005 đến 020 trong 0.3.0, SA-2026-021 đến 024 trong 0.4.0 và SA-2026-025 đến 047 trong 0.5.0, trừ SA-2026-040 và SA-2026-044. SA-2026-040 đã được khống chế: kiểm tra được đánh dấu là chưa đầy đủ. SA-2026-044 chưa được sửa: phá hoại dẻo 2D vẫn bị từ chối cho đến khi #758 đóng."
    }
  ]
};

export default body;
