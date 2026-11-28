import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Cách chúng tôi kiểm tra kết quả của Stabileo và giới hạn của việc kiểm tra",
  "excerpt": "Bộ giải, xác minh hình thức và AI: cách chúng tôi tìm lỗi trong các con số Stabileo đưa ra, chứng nhận chứng minh được gì và điều gì không phép xác minh nào có thể đảm bảo.",
  "blocks": [
    {
      "k": "p",
      "t": "Một chương trình phân tích kết cấu có thể cho ra một con số sai mà không có dấu hiệu nào nhìn thấy được. Trong những tuần qua, chúng tôi đã kiểm thử mọi bộ phận của Stabileo bằng nhiều cách độc lập, tìm ra hàng chục lỗi thực sự, nhiều lỗi trong số đó thiên về không an toàn, và đã sửa phần lớn. Mỗi lỗi đều được phân loại và, nếu có thể đã ảnh hưởng đến các kết quả đang được sử dụng, sẽ được công bố thành thông báo an toàn kèm hướng dẫn cần làm trong thời gian chờ; một số lỗi vẫn đang được phân loại. Bài viết này giải thích cách chúng tôi tìm các lỗi đó, các chứng nhận đi kèm kết quả chứng minh được gì và, cũng rõ ràng không kém, điều gì nằm ngoài mọi phép xác minh."
    },
    {
      "k": "h",
      "t": "Một bộ máy tính toán"
    },
    {
      "k": "p",
      "t": "Bộ giải được viết bằng Rust và biên dịch sang WebAssembly: nó chạy ngay trên máy tính của người dùng, không cần cài đặt và không gửi mô hình tới bất kỳ máy chủ nào. Đó chính là mã chạy trong tích hợp liên tục. Vào tháng 10 năm 2026, chúng tôi đã gỡ bỏ các phép tính TypeScript song song từng âm thầm thay thế bộ máy tính toán khi nó không khả dụng: giờ đây ứng dụng sẽ báo rõ điều đó, thay vì tính bằng một bản sao chưa được xác minh."
    },
    {
      "k": "h",
      "t": "Năm cách tìm lỗi"
    },
    {
      "k": "p",
      "t": "Không một phép thử đơn lẻ nào tìm ra mọi lỗi, vì vậy chúng tôi dùng nhiều phép thử, mỗi phép thử thất bại theo một cách khác nhau:"
    },
    {
      "k": "ul",
      "items": [
        "So sánh với các chương trình khác. Cùng các mô hình, gồm cả mô hình cố định và mô hình ngẫu nhiên được tạo mỗi đêm, được giải bằng OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos và CalculiX. Mọi khác biệt đều được điều tra cho đến khi biết lỗi là của chúng tôi hay hai chương trình mô hình hóa trường hợp đó theo cách khác nhau.",
        "Tài liệu tham chiếu đã công bố. Một bộ kiểm nghiệm gồm các trường hợp có kết quả do chính tác giả công bố, không phải do một chương trình thương mại khác, với dung sai đặt theo độ chính xác in trong nguồn. Các kiểm tra thiết kế được so sánh với các ví dụ tính toán đã công bố (INTI-CIRSOC, AISC và những nguồn khác).",
        "Các bất biến vật lý. Xoay, đối xứng hoặc đánh số lại một mô hình, hoặc đổi đơn vị của nó, phải làm đáp số thay đổi đúng như vật lý quy định; nguyên lý cộng tác dụng, định lý tương hỗ và cân bằng năng lượng phải được thỏa mãn. Các phép thử này hoàn toàn không cần giá trị tham chiếu.",
        "Các phép suy dẫn. Ma trận phần tử khung được suy ra bằng ký hiệu từ các nguyên lý đầu tiên và so sánh từng số hạng với ma trận trong mã; với các phần tử khác có các bản suy dẫn bằng văn bản để một kỹ sư khác rà soát.",
        "Kiểm thử ngẫu nhiên (fuzzing) và kiểm thử đột biến. Hàng triệu đầu vào được tạo ra để tìm các lỗi treo và kết quả không hữu hạn, và các lỗi được cố ý đưa vào mã để kiểm tra xem các phép thử có phát hiện được chúng không."
      ]
    },
    {
      "k": "table",
      "caption": "Một số con số về công việc xác minh, lấy từ các tài liệu trong kho mã.",
      "head": [
        "Nội dung",
        "Số lượng"
      ],
      "rows": [
        [
          "Chương trình phần tử hữu hạn độc lập trong phần so sánh",
          "7"
        ],
        [
          "Trường hợp kiểm nghiệm có kết quả đã công bố",
          "12"
        ],
        [
          "Giá trị tham chiếu đã công bố trong các trường hợp đó",
          "105"
        ],
        [
          "Định lý Lean mà tích hợp liên tục kiểm tra các tiên đề của chúng",
          "37"
        ]
      ]
    },
    {
      "k": "note",
      "t": "105 giá trị tham chiếu chủ yếu là tần số của các khung nhà (SAC, IASC-ASCE, Bathe và Wilson). Chúng bao quát tốt bài toán phân tích dao động và tuyến tính của khung; chúng không phải là bằng chứng cho các loại phân tích khác."
    },
    {
      "k": "h",
      "t": "Chứng nhận: một kết quả kèm cận sai số"
    },
    {
      "k": "p",
      "t": "Với những kết quả hỗ trợ, Stabileo còn cố gắng tạo một chứng nhận chạy nền: một cận, tính bằng số học khoảng, chứa nghiệm chính xác của hệ phương trình đã giải. Khi không làm được, kết quả được đánh dấu là chưa được chứng nhận, kèm lý do. Cận này là cận của sai số số học, không phải sai số rời rạc hóa của lưới hay của bước thời gian. Với phân tích tuyến tính, tổ hợp, dao động riêng và phá hoại dẻo, phần toán học cốt lõi của cận đó được chứng minh trong Lean, một trợ lý chứng minh trong đó máy tính kiểm tra từng bước; một số bước (các liên kết ràng buộc, một điều kiện của phép kiểm tra dao động riêng) vẫn chưa được hình thức hóa. Các phân tích P-Delta, phổ, điều hòa và lịch sử thời gian cũng có chứng nhận, nhưng phần toán học của chúng chưa được hình thức hóa trong Lean. Tích hợp liên tục từ chối mọi chứng minh chưa hoàn chỉnh hoặc tiên đề được thêm vào, và với một số loại chứng nhận, bộ kiểm tra được chạy chính là mã Lean mà các chứng minh nói đến."
    },
    {
      "k": "img",
      "base": "blog/certificate",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic với ví dụ khung cổng đã được giải. Bảng kết quả hiển thị chuyển vị của các nút và, trong mục Kiểm tra kết quả, dòng “Đã chứng nhận: sai số chuyển vị ≤ 3.41e-16” cùng liên kết tải chứng nhận về, và dòng “Đã kiểm tra đầu cuối: việc ghép lại độc lập của mô hình cho kết quả trùng khớp”.",
      "caption": "Một khung đã được giải: cận sai số chuyển vị của chứng nhận và phép kiểm tra đầu cuối, trong mục Kiểm tra kết quả."
    },
    {
      "k": "h",
      "t": "Những điều chứng nhận không nói"
    },
    {
      "k": "ul",
      "items": [
        "Chứng nhận chỉ chặn sai số của việc giải hệ phương trình như nó đã được lắp ghép. Nó không chứng minh rằng hệ đó biểu diễn đúng mô hình: việc lắp ghép ma trận độ cứng và tải trọng được kiểm thử theo các cách nêu trên, nhưng không được chứng nhận. Khi thiếu hiện tượng mất ổn định xoắn (SA-2026-007), chứng nhận đã chứng nhận một bài toán sai. Từ phiên bản 0.3.0, các chứng nhận đầu cuối ghép lại hệ một cách độc lập cho khung và giàn rồi kiểm tra kết quả so với chính mô hình; vỏ, khối đặc và các bộ nối chưa được bao quát.",
        "Lean chứng minh phần toán học; việc mã Rust triển khai đúng thuật toán đó thì không được chứng minh, trừ các bộ kiểm tra là mã Lean.",
        "Các kiểm tra thiết kế được chứng nhận tính công thức của chúng bằng số học khoảng, nhưng bản thân các công thức không được hình thức hóa: chúng được so sánh với các ví dụ tính toán đã công bố khi có, và mức bao quát của từng tiêu chuẩn (điều khoản nào, ví dụ nào) nằm trong ma trận mức độ trưởng thành. Khối xây, mối nối, móng và trạng thái sử dụng không được chứng nhận.",
        "Không phép xác minh nào của chương trình xác minh được mô hình. Tải trọng, liên kết và việc lý tưởng hóa là quyết định của kỹ sư; phần rà soát mô hình cảnh báo các sai sót thường gặp, nhưng không thay thế được phán đoán.",
        "Chưa có đánh giá độc lập của một kỹ sư kết cấu có chứng chỉ hành nghề. Các kết quả CIRSOC 301 vẫn được gắn nhãn thử nghiệm."
      ]
    },
    {
      "k": "h",
      "t": "AI soạn thảo và rà soát, không tính toán"
    },
    {
      "k": "p",
      "t": "Trợ lý AI soạn mô hình từ một mô tả và rà soát các mô hình có sẵn, nhưng không tính kết quả: các con số đến từ bộ giải và các mô-đun kiểm tra thiết kế của ứng dụng. Lời giải thích của nó là văn bản của mô hình ngôn ngữ và có thể sai; giá trị có ý nghĩa là những giá trị trong kết quả. Trước khi áp dụng một thay đổi, nó cho thấy sẽ sửa những gì, và có thể hoàn tác chỉ bằng một bước. Các tính năng AI gửi phần mô tả và mô hình tới một máy chủ truy vấn mô hình ngôn ngữ; bộ giải, kết quả và các kiểm tra không cần đến nó và hoạt động ngoại tuyến."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Vì sao một tác tử AI không nên tính toán, kèm một trường hợp cụ thể:"
    },
    {
      "k": "h",
      "t": "Khi có điều gì đó hỏng"
    },
    {
      "k": "p",
      "t": "Các lỗi có thể đã ảnh hưởng đến những kết quả đang được sử dụng được công bố thành thông báo an toàn, kèm cách nhận biết một mô hình bị ảnh hưởng và việc cần làm trong thời gian chờ; các lỗi an toàn khác đang được phân loại và sẽ được bổ sung khi đủ điều kiện. Các thông báo đang mở được đóng khi bản sửa đã chạy trên stabileo.com."
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Các thông báo an toàn đã công bố và trạng thái của chúng:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/TRUSTED_BASE.md",
      "label": "Nền tảng tin cậy của các chứng nhận",
      "t": "Điều gì được chứng minh, điều gì được kiểm thử và điều gì được tin cậy, theo từng thành phần:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/MATURITY.md",
      "label": "Ma trận mức độ trưởng thành của xác minh",
      "t": "Với mỗi phân tích, phần tử và tiêu chuẩn thiết kế, mức xác minh đã đạt được và bằng chứng:"
    }
  ]
};

export default body;
