import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Học phân tích kết cấu từng bước trong Stabileo Basic",
  "excerpt": "Basic nay có một khóa học: chọn một phương pháp và ứng dụng giải kết cấu của bạn, hoặc một ví dụ, từng bước như trên giấy. Tĩnh học, đường ảnh hưởng, bậc hai, phân tích dẻo và dao động. Miễn phí.",
  "blocks": [
    {
      "k": "p",
      "t": "Phần mềm phân tích đưa cho bạn toàn bộ kết quả cùng một lúc. Việc học cần điều ngược lại: thấy mỗi con số đến từ đâu, theo thứ tự làm trên bảng đen. Đó là “Giải thích từng bước”, khóa học nay nằm ngay trong Stabileo Basic. Bạn chọn một phương pháp, ứng dụng áp dụng nó vào kết cấu của bạn và giải từng bước, với các phương trình, hình vẽ và con số của chính mô hình đó, và kết thúc bằng việc so sánh kết quả với phương pháp ma trận."
    },
    {
      "k": "p",
      "t": "Khóa học do Bautista Chesta, kỹ sư xây dựng (FIUBA), biên soạn, và gồm sáu phần: nền tảng chung, tĩnh học và các phương pháp cổ điển, đường ảnh hưởng, bậc hai và mất ổn định, phân tích dẻo và dao động. Khóa học miễn phí, như toàn bộ Basic: mở ngay trong trình duyệt, không cần cài đặt và không cần tài khoản, và các văn bản có bằng tiếng Tây Ban Nha, Anh, Bồ Đào Nha, Đức, Pháp và Thổ Nhĩ Kỳ."
    },
    {
      "k": "h",
      "t": "Cách mở"
    },
    {
      "k": "ol",
      "items": [
        "Vào stabileo.com/app/basic.",
        "Nhấn Nâng cao. Trên điện thoại, nó nằm ở thanh ribbon phía dưới.",
        "Trong mục “Khám phá và học”, nhấn Giải thích từng bước. Danh mục các phương pháp mở ra, được nhóm theo chủ đề.",
        "Mỗi phương pháp cho biết kết cấu phải như thế nào để thử nó và mô hình của bạn có đủ điều kiện hay không; dấu ? giải thích nó làm gì. “Mở một ví dụ” nạp một mô hình đủ điều kiện và mở phương pháp; “Mở” áp dụng nó vào mô hình đang hiển thị.",
        "Tiếp và Trước di chuyển qua các bước, và các thẻ đánh số nhảy tới một bước. Phương pháp quay về danh mục."
      ]
    },
    {
      "k": "img",
      "base": "blog/course-catalog",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic với danh mục “Giải thích từng bước” mở trong bảng bên: các phương pháp thuộc phương pháp độ cứng, phương pháp độ mềm và dầm liên tục, mỗi phương pháp kèm kết cấu cần có và các nút Mở và Mở một ví dụ.",
      "caption": "Danh mục: mỗi phương pháp cho biết mô hình cần gì và đi kèm một ví dụ đáp ứng điều đó."
    },
    {
      "k": "note",
      "t": "Các phương pháp được giải thích áp dụng cho mô hình phẳng. Trong không gian làm việc 3D chỉ hai trình hướng dẫn mở được, độ cứng và độ mềm; “Mở một ví dụ” ở bất kỳ phương pháp nào khác sẽ chuyển về mô hình phẳng trước."
    },
    {
      "k": "h",
      "t": "Tĩnh học, phương pháp lực và phương pháp chuyển vị"
    },
    {
      "k": "p",
      "t": "Đây là phần lớn nhất: dầm liên tục với phương trình ba mô men và phân phối mô men, khung với phương pháp góc xoay - độ võng, phân phối mô men có và không có chuyển vị ngang và phương pháp chuyển vị, giàn theo phương pháp tách nút, mặt cắt (Ritter) và ma trận tương thích, và độ võng theo tích phân hai lần, diện tích mô men, công khả dĩ và Castigliano. Bậc siêu tĩnh được đếm giống nhau ở mọi nơi (GH = 3·m + r − 3·n − c cho khung phẳng, GH = m + r − 2·n cho giàn), với các khớp trong được viết rõ và tách thành phần ngoài và phần trong."
    },
    {
      "k": "p",
      "t": "Trong phương pháp lực, bạn chọn hệ cơ bản: bạn giải phóng các gối tựa hoặc đầu thanh cho đến khi số ẩn số thừa bằng bậc siêu tĩnh, và nếu lựa chọn của bạn để lại một cơ cấu, ứng dụng giải thích vì sao thay vì giải. Sau đó nó đi qua chín bước, có hoặc không có độ cứng dọc trục, với các thanh và lò xo được viết từng số hạng. Công khả dĩ tính chuyển vị, góc xoay và chuyển dịch tương đối, kể cả với lò xo, lún gối và nhiệt độ. Để thử: Ví dụ → Khung cổng, Nâng cao → Giải thích từng bước → Phương pháp lực → Mở."
    },
    {
      "k": "img",
      "base": "blog/course-force-method",
      "w": 1600,
      "h": 1000,
      "alt": "Trình hướng dẫn phương pháp lực trên ví dụ Khung cổng, ở bước hệ cơ bản: ba phản lực của gối bên phải được giải phóng và ứng dụng liệt kê ba ẩn số thừa đã chọn.",
      "caption": "Phương pháp lực: bạn chọn hệ cơ bản, và ứng dụng cho biết lựa chọn đó có dùng được không."
    },
    {
      "k": "h",
      "t": "Đường ảnh hưởng"
    },
    {
      "k": "p",
      "t": "Ví dụ → Dầm liên tục, rồi Nâng cao → Đường ảnh hưởng, và chạm vào một mặt cắt của dầm. Có các đường cho phản lực, mô men, lực cắt, lực dọc, chuyển vị và góc xoay, tại mọi mặt cắt, kể cả đầu thanh, và sau đó có thể di chuyển mặt cắt. Bảng đặt tải lên đường ảnh hưởng với tĩnh tải g, hoạt tải q và một tải trọng tập trung P cho các cực trị của nó, vẽ biểu đồ bao dọc thanh và mở phần giải thích từng bước với các hình Müller-Breslau. “Trường hợp tải và biểu đồ bao” tìm các tác dụng lớn nhất và nhỏ nhất. Đường ảnh hưởng mô men dương ở phía căng thớ dưới, giống như biểu đồ tĩnh học."
    },
    {
      "k": "img",
      "base": "blog/course-influence",
      "w": 1600,
      "h": 1000,
      "alt": "Ví dụ Dầm liên tục với biểu đồ bao mô men thu được bằng cách đặt tải lên các đường ảnh hưởng, màu đỏ cho cực đại và xanh dương cho cực tiểu, và bảng đặt tải lên đường ảnh hưởng mô men cách gối trái 2 m với g = 10 và q = 5 kN/m: cực đại 20,00 kN·m và cực tiểu 10,00 kN·m, mỗi giá trị được xác nhận bằng một lần giải trực tiếp.",
      "caption": "Đường ảnh hưởng mô men được đặt tải cho các cực trị của nó, và biểu đồ bao dọc dầm."
    },
    {
      "k": "h",
      "t": "Bậc hai và mất ổn định"
    },
    {
      "k": "p",
      "t": "Với một khung có tải, Nâng cao → P-Δ (bậc 2) hoặc Pcr (Euler). Trong mục “Cách tính”, bạn chọn phương pháp, với hàm ổn định φ, ma trận hình học hoặc ma trận dây cung (P/L), và số phần tử của mỗi thanh. P-Δ hiển thị các vòng lặp của nó, và B₂ = 1/(1 − 1/λ₁) đến từ bài toán mất ổn định của cùng mô hình với cùng cách rời rạc hóa, bên cạnh hệ số khuếch đại chuyển vị tại nút dịch chuyển nhiều nhất ở bậc một. Mất ổn định dùng bốn phần tử cho mỗi thanh theo mặc định, và khi cách rời rạc hóa không biểu diễn được hệ số, nó từ chối thay vì báo cáo hệ số đó. Trong danh mục, nhóm “Bậc hai và mất ổn định” đi kèm một khung được chuẩn bị cho cả bốn phương pháp."
    },
    {
      "k": "h",
      "t": "Phân tích dẻo"
    },
    {
      "k": "p",
      "t": "Ví dụ → Khung cổng, rồi Nâng cao → Phá hoại dẻo. Phần này được viết đầy đủ: từng bước tải, đường cong λ–chuyển vị, các góc xoay dẻo, cơ cấu được vẽ trên mô hình và kiểm tra bằng công khả dĩ, và một cơ cấu bạn chọn bằng cách chạm vào nơi đặt các khớp. Kết quả của nó hiện đang bị giữ lại. Chúng tôi phát hiện phân tích giới hạn đằng sau nó có thể cho hệ số phá hoại chênh lệch tới 4,6 lần khi các thanh được đánh số lại hoặc đảo chiều, hoặc khi đổi đơn vị (#758). Cho đến khi lỗi này được sửa, bảng nói rõ điều đó và dẫn liên kết tới vấn đề, và các phương pháp tĩnh và động học trong danh mục bị vô hiệu hóa với cùng lý do: không có con số nào còn hơn một con số phụ thuộc vào cách vẽ mô hình."
    },
    {
      "k": "img",
      "base": "blog/course-plastic",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic với ví dụ Khung cổng và Nâng cao → Phá hoại dẻo được chọn: không hiển thị đường cong hay cơ cấu nào; một thông báo có khung nói rằng kết quả bị giữ lại vì hệ số phá hoại dẻo 2D có thể thay đổi tới 4,6 lần theo cách đánh số, chiều thanh hoặc đơn vị, và dẫn liên kết tới vấn đề #758.",
      "caption": "Phá hoại dẻo của khung cổng, bị giữ lại cho đến khi #758 được sửa."
    },
    {
      "k": "h",
      "t": "Dao động"
    },
    {
      "k": "p",
      "t": "Nâng cao → Động lực học mở bảng dao động. Một hệ một bậc tự do được lấy từ mô hình, với dao động tự do và đáp ứng cưỡng bức dưới tải trọng điều hòa; một hệ nhiều bậc tự do được giải bằng chồng chất dạng dao động, kể cả nhà khung cắt. Các mô hình khối lượng, tập trung hoặc nhất quán và có ngưng tụ, được so sánh với các tần số của bộ máy tính toán, và các khối lượng điểm có thể đặt tại các nút, cùng quán tính quay của chúng, mà phân tích dao động riêng cũng dùng. Trong nhóm “Dao động kết cấu” của danh mục, “Mở một ví dụ” nạp một cột có khối lượng ở đầu, một khung cắt hai tầng hoặc, với khối lượng phân bố, một công xôn."
    },
    {
      "k": "img",
      "base": "blog/course-dynamics",
      "w": 1600,
      "h": 1000,
      "alt": "Một cột công xôn có khối lượng ở đầu và bảng dao động mở trên hệ một bậc tự do lấy từ mô hình: k = 2250 kN/m, m = 5 t, ω = 21,21 rad/s, dao động tự do có cản và đáp ứng với lực điều hòa cùng hệ số β của nó.",
      "caption": "Một bậc tự do: cột có khối lượng ở đầu dưới lực điều hòa."
    },
    {
      "k": "h",
      "t": "Mọi thứ trong danh mục"
    },
    {
      "k": "table",
      "caption": "Các phương pháp trong “Giải thích từng bước”, theo nhóm, theo thứ tự danh mục.",
      "head": [
        "Nhóm",
        "Số lượng",
        "Phương pháp"
      ],
      "rows": [
        [
          "Phương pháp độ cứng",
          "1",
          "Phương pháp ma trận, dạng trình hướng dẫn"
        ],
        [
          "Phương pháp độ mềm",
          "1",
          "Phương pháp lực, dạng trình hướng dẫn"
        ],
        [
          "Dầm liên tục",
          "2",
          "Ba mô men (Clapeyron); phân phối mô men (Hardy Cross)"
        ],
        [
          "Khung",
          "4",
          "Ẩn số động học; phân phối mô men không và có chuyển vị ngang; phương pháp góc xoay - độ võng"
        ],
        [
          "Giàn",
          "3",
          "Nút; mặt cắt (Ritter); ma trận tương thích"
        ],
        [
          "Biến dạng và năng lượng",
          "5",
          "Tích phân hai lần; diện tích mô men; công khả dĩ; Castigliano; nội lực theo mặt cắt"
        ],
        [
          "Đường ảnh hưởng",
          "1",
          "Đường ảnh hưởng"
        ],
        [
          "Bậc hai và mất ổn định",
          "2",
          "Bậc hai với hàm φ và với ma trận hình học; mất ổn định theo số dạng và theo trị riêng"
        ],
        [
          "Phân tích dẻo",
          "2",
          "Phương pháp động học; phương pháp tĩnh (bị giữ lại cho đến #758)"
        ],
        [
          "Dao động kết cấu",
          "3",
          "Một bậc tự do; nhiều bậc tự do bằng phân tích dạng dao động; khối lượng phân bố"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Nếu bạn dạy kết cấu, bạn có thể dùng nó trên lớp nguyên như vậy: một mô hình được chia sẻ bằng liên kết và mỗi sinh viên mở nó trong trình duyệt của mình, bằng ngôn ngữ của mình. Nếu một bước chưa rõ hoặc một con số không khớp với con số bạn tính tay, hãy viết cho chúng tôi: đó chính xác là điều chúng tôi cần biết."
    },
    {
      "k": "link",
      "slug": "conceptual-side-advanced-tools",
      "t": "Một công cụ khác được làm cho lớp học, phân tích động học giải thích vì sao một kết cấu là cơ cấu:"
    }
  ]
};

export default body;
