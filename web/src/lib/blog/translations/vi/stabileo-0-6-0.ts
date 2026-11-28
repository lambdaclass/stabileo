import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.0: chạy lại các dự án bị ảnh hưởng",
  "excerpt": "Hãy chạy lại các phân tích bị ảnh hưởng và rà soát các kết quả bạn đã dùng. SA-2026-048 đến SA-2026-063 giải thích cần kiểm tra gì; SA-2026-056 vẫn chưa được sửa.",
  "blocks": [
    {
      "k": "p",
      "t": "Hãy chạy lại các trường hợp tải, tổ hợp và toàn bộ lịch sử phi tuyến hoặc theo giai đoạn bị ảnh hưởng. So sánh chuyển vị, nội lực trong thanh, phản lực và nhu cầu thiết kế với những kết quả đã dùng. Hãy rà soát các bản tính đã giao và việc chọn kích thước dựa trên chúng. Hãy làm theo từng thông báo về các đầu vào bị ảnh hưởng và hành động của người dùng. Một sự từ chối hoặc một đại lượng không có sẵn không đưa ra câu trả lời thay thế: đó không phải là nhu cầu bằng không hay một kiểm tra đạt."
    },
    {
      "k": "note",
      "t": "Các thông báo SA-2026-048 đến SA-2026-063 được thêm sau v0.5.0. Các bản sửa dưới đây nằm trong 0.6.0, trừ SA-2026-056, vẫn chưa được sửa. Hãy kiểm tra lại các tính năng được liệt kê ở đây ngay cả khi phân tích trước đó đã hội tụ hoặc chuyển vị của nó trông hợp lý."
    },
    {
      "k": "h",
      "t": "Thông báo an toàn"
    },
    {
      "k": "table",
      "caption": "Các thông báo an toàn SA-2026-048 đến SA-2026-063",
      "head": [
        "Thông báo an toàn",
        "Mức độ",
        "Điều gì đã thay đổi và cần làm gì"
      ],
      "rows": [
        [
          "SA-2026-048",
          "Cao",
          "CIRSOC 301 bỏ sót mô men đầu thanh trong Mmax với mọi tiết diện có đoạn không giằng được rút ngắn; thép hình chữ C và chữ T chịu uốn hai chiều ngược nhau cũng có thể bỏ sót một lần đổi dấu. Kiểm tra lại mọi thanh CIRSOC 301 có Lb khai báo ngắn hơn thanh, gồm cả các kiểm tra thép và các đề xuất của bộ tối ưu hóa."
        ],
        [
          "SA-2026-049",
          "Cao",
          "Liên kết ngăn cứng cộng với lò xo có thể trở thành một gối đàn hồi trong 3D. Hãy chọn rõ ràng điều kiện biên mong muốn và chạy lại các phân tích bị ảnh hưởng."
        ],
        [
          "SA-2026-050",
          "Trung bình",
          "Độ mảnh bị lỗi có thể trở thành không, và kết quả nhiều trường hợp có thể chứa các số không hữu hạn. Hãy loại bỏ các giá trị đó, rà soát đầu vào và chạy lại."
        ],
        [
          "SA-2026-051",
          "Cao",
          "Tải trọng di động 3D bỏ sót các đỉnh bên trong và trọng lượng trục theo phương dọc. Chạy lại các biểu đồ bao và rà soát việc chọn kích thước thanh và các nhu cầu thiết kế."
        ],
        [
          "SA-2026-052",
          "Cao",
          "Các biểu đồ bao lực dọc của tải trọng di động 2D/3D bỏ sót các biên của tải trọng phân bố. Chạy lại và kiểm tra các cực trị lực dọc bên trong; chỉ giảm bước của đoàn tải là không đủ."
        ],
        [
          "SA-2026-053",
          "Thấp",
          "Các biểu đồ bao của tải trọng di động bao gồm các giới hạn lực phía ngoài tại các tải trọng ở đầu thanh. Chạy lại các biểu đồ bao lực dọc/lực cắt và rà soát việc chọn kích thước, giữ lại các phản lực gối trong các kiểm tra cân bằng."
        ],
        [
          "SA-2026-054",
          "Cao",
          "Các phép giải tuyến tính có thể trả về các đáp ứng độ cứng chưa được giải quyết hoặc bỏ sót một thành phần tải. Chạy lại các trường hợp tĩnh và tổ hợp; tự kiểm chứng độc lập các nhu cầu khi bộ giải đã sửa từ chối."
        ],
        [
          "SA-2026-055",
          "Cao",
          "P-Delta đánh giá thấp hệ số khuếch đại dưới các tải trọng dọc trên nhịp. Chạy lại các phân tích bị ảnh hưởng và các kiểm tra phái sinh, kiểm tra sự hội tụ của lưới và đánh giá lại ổn định."
        ],
        [
          "SA-2026-056",
          "Cao",
          "Chưa sửa: động lực học hỗn hợp khung/vỏ có liên kết ràng buộc thay đổi theo các mô tả mô hình tương đương. Hãy tự kiểm chứng độc lập các nhu cầu bị ảnh hưởng trước khi dùng; chưa có hệ số hiệu chỉnh thiên về an toàn nào được xác lập."
        ],
        [
          "SA-2026-057",
          "Trung bình",
          "Các hiển thị phân tích dẻo có thể gọi một hệ số nằm ngoài là nằm trong khoảng của nó. Chạy lại các chứng nhận và so sánh các đầu mút chính xác. Một sự từ chối do tài nguyên không chứng minh rằng không tồn tại cơ cấu nào."
        ],
        [
          "SA-2026-058",
          "Cao",
          "Các mô hình điều hòa lớn giữ lại các đáp ứng dạng dao động bị bỏ qua không chính xác. Chạy lại các phép quét và rà soát biên độ, pha và các đỉnh, kể cả các tần số nằm ngoài cảnh báo cắt cụt."
        ],
        [
          "SA-2026-059",
          "Cao",
          "Các phân tích nâng cao trên web gán cho dây cáp khả năng chịu nén. Hãy dùng bộ giải dây cáp chuyên dụng được hỗ trợ hoặc phân tích độc lập; các quy trình dây cáp nâng cao nay từ chối một cách rõ ràng."
        ],
        [
          "SA-2026-060",
          "Cao",
          "Độ cứng xoay nhân tạo theo giai đoạn làm thay đổi chuyển vị thẳng và tác động lên thanh. Chạy lại toàn bộ lịch sử theo giai đoạn có giải phóng đầu thanh hoặc lò xo gối và rà soát các nhu cầu thiết kế phái sinh."
        ],
        [
          "SA-2026-061",
          "Cao",
          "Phản lực của bộ giải theo đường đi bị bỏ sót hoặc được khôi phục ở sai mức tải; các lực theo giai đoạn và động có thể bị thiếu. Chạy lại và rà soát các nhu cầu tại gối, liên kết và móng. Các lực không có sẵn không phải là bằng không; tổng phản lực động vẫn không có sẵn."
        ],
        [
          "SA-2026-062",
          "Cao",
          "Một sự từ chối đàn hồi ban đầu có thể trở thành hệ số phá hoại dẻo 3D thô bằng không được báo là thành công. Chạy lại các phân tích dẻo bị ảnh hưởng; một sự từ chối bằng số không phải là bằng chứng của phá hoại ở tải trọng bằng không."
        ],
        [
          "SA-2026-063",
          "Cao",
          "Các liên kết ràng buộc bỏ mất chuyển động cưỡng bức của nút chủ bị ngăn. Chạy lại toàn bộ lịch sử và rà soát chuyển vị, nội lực trong thanh và phản lực cùng với SA-2026-061. Chuyển động gối trong dây cáp/lịch sử thời gian không được hỗ trợ nay bị từ chối."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Danh mục thông báo an toàn",
      "t": "Hãy đọc từng thông báo an toàn áp dụng để biết các đầu vào bị ảnh hưởng và hành động cần thiết:"
    },
    {
      "k": "h",
      "t": "Các thay đổi khác ảnh hưởng đến đáp án"
    },
    {
      "k": "p",
      "t": "Sổ đăng ký kết quả kết thúc ở phiên bản 49 trong 0.5.0 và đạt 78 trong 0.6.0. Bảng chọn ra các thay đổi khác cần rà soát cùng với các thông báo an toàn ở trên. Hãy chạy lại mọi phân tích được một thông báo áp dụng bao trùm và so sánh các kết quả đầu ra. Danh sách đầy đủ, gồm cả các kiểm tra bị thay thế và bị rút lại, nằm trong ghi chú phát hành."
    },
    {
      "k": "table",
      "caption": "Các thông báo thay đổi kết quả được chọn kể từ 0.5.0",
      "head": [
        "Phiên bản kết quả",
        "Kết quả thay đổi"
      ],
      "rows": [
        [
          "50",
          "2D: các góc xoay mà chỉ các liên kết nút giữ, bị chúng để tự do, bị từ chối"
        ],
        [
          "52",
          "3D: các góc xoay nút mà một liên kết nút ghép nhưng để tự do bị từ chối"
        ],
        [
          "53",
          "Phân tích mất ổn định không còn lấy độ cứng hình học từ các lực dọc là sai số làm tròn. Trong 2D và 3D, các thanh có lực dọc không thể phân biệt với sai số làm tròn không đóng góp độ cứng hình học. Phân tích bị từ chối nếu lực nén có thể có của chúng có thể làm giảm hệ số tới hạn quá 1 %."
        ],
        [
          "54",
          "Diện tích thực của đầu thanh liên kết bu lông so le lấy chuỗi bất lợi nhất của nó, và đầu thanh liên kết bu lông mọi phần tử cần có bu lông ở bản bụng"
        ],
        [
          "56",
          "Các gối nghiêng 3D tính các liên kết ngăn trong một hệ trục chung"
        ],
        [
          "58",
          "Các cơ sở dao động dùng thang làm tròn của từng phần tử Gram khối lượng"
        ],
        [
          "59",
          "Phân tích dẻo 3D có kiểm tra trả về cận dưới đã chứng nhận"
        ],
        [
          "61",
          "Điều khiển tải thớ bê tông tinh chỉnh khoảng dừng của nó"
        ],
        [
          "63",
          "Phân tích tuyến tính từ chối một cơ cấu hoặc một độ cứng không giải được thay vì giải nó kèm cảnh báo"
        ],
        [
          "65",
          "Các tiếp xúc đóng băng không hợp lệ và các phân tích thanh dây cáp bị giữ lại"
        ],
        [
          "66",
          "Các cận sai số làm tròn của phân tích mất ổn định theo sự ghép liên kết thực tế"
        ],
        [
          "67",
          "Các hệ số mất ổn định dùng bó độ cứng gốc"
        ],
        [
          "68",
          "Cân bằng dẻo dùng các ID mô hình đã giải và các chứng nhận lập ngân sách cho các ứng viên thực tế"
        ],
        [
          "69",
          "Sự hội tụ phi tuyến theo cân bằng vật lý"
        ],
        [
          "71",
          "Bao gồm các tác động ngang của giàn trong cân bằng thanh có điều kiện"
        ],
        [
          "72",
          "Phép tiếp diễn chiều dài cung nhóm lại số học của tải trọng tham chiếu"
        ],
        [
          "73",
          "Phân tích dao động riêng bảo toàn dải khối lượng vật lý"
        ],
        [
          "75",
          "SSI hiệu chỉnh các bình nguyên dư đàn hồi"
        ],
        [
          "76",
          "Rút gọn liên kết ràng buộc giữ lại độ bất định làm tròn theo hướng"
        ],
        [
          "78",
          "Các tải trọng tương thích trên các góc xoay được giải phóng"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.0.vi.md",
      "label": "Ghi chú phát hành 0.6.0 đầy đủ",
      "t": "Mọi thông báo thay đổi kết quả, kèm liên kết đến phạm vi và bằng chứng của nó:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Hộp thoại kiểm tra lại kết quả trong Stabileo Basic, liệt kê các thay đổi ảnh hưởng đến một dự án đã lưu cũ hơn.",
      "caption": "Hộp thoại kiểm tra lại kết quả được minh họa trong bài viết về 0.5.0."
    },
    {
      "k": "h",
      "t": "Hai thông báo mô tả ứng xử đã có trong 0.5.0"
    },
    {
      "k": "p",
      "t": "Hai thông báo này được đăng ký muộn hơn. Các thay đổi nền tảng của chúng đã có trong v0.5.0, nên chúng không phải là thay đổi số học mới trong bản phát hành này. Chúng vẫn có thể xuất hiện trong thông báo kiểm tra lại dự án."
    },
    {
      "k": "table",
      "caption": "Các thông báo muộn cho những thay đổi đã phát hành trong 0.5.0",
      "head": [
        "Phiên bản kết quả",
        "Kết quả thay đổi"
      ],
      "rows": [
        [
          "72",
          "Thư viện sàn công khai dùng các gối tựa đơn cứng trên tường"
        ],
        [
          "72",
          "SSI trả về phản lực gối và đưa các lò xo đất nền vào các lực liên kết ràng buộc"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Các hạn chế đã biết"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-056 vẫn chưa được sửa: hãy tự kiểm chứng độc lập các nhu cầu động đối với các mô hình hỗn hợp khung và vỏ có liên kết ràng buộc mà thay đổi đáng kể sau khi đánh số lại, xoay hoặc đổi đơn vị. Chưa có hệ số hiệu chỉnh thiên về an toàn nào được xác lập.",
        "Sự phá hoại dẻo 2D vẫn bị từ chối cho đến khi giải quyết #758, như mô tả trong SA-2026-044. Một cận dưới 3D đã được chứng nhận không chứng nhận lịch sử khớp thô.",
        "Phân tích lịch sử thời gian không cung cấp tổng nhu cầu động tại gối tựa. Hãy dùng một phân tích độc lập có kể đến quán tính, cản và tải trọng tại gối. Các phân tích dây cáp không được hỗ trợ và chuyển động cưỡng bức khác không của gối trong các quy trình dây cáp/lịch sử thời gian bị từ chối một cách rõ ràng.",
        "Các bộ giải chiều dài cung không gian và điều khiển chuyển vị chưa được bổ sung. Các cảnh báo và hạn chế hiện có vẫn áp dụng."
      ]
    },
    {
      "k": "h",
      "t": "Các thay đổi khác"
    },
    {
      "k": "ul",
      "items": [
        "Các kết cấu phẳng được sinh ra nhận các liên kết ngăn tường minh, và nhà xưởng mặc định dùng giằng vật lý. Hãy sinh lại và rà soát các gối tựa và giằng; các mô hình đã lưu không thay đổi.",
        "Thí nghiệm điều khiển hình dạng dải uốn của Fehér, Sipos và Várkonyi có một bộ giải tương tác, các đường chuyển động của cơ cấu chấp hành và một bản so sánh với bài báo bằng tiếng Anh, tiếng Tây Ban Nha và tiếng Bồ Đào Nha. Bản tóm tắt dải bị cắt cũng được dịch sang tiếng Tây Ban Nha và tiếng Bồ Đào Nha.",
        "Bài viết phát hành 0.5.0 trên blog nay có bản dịch đầy đủ sang tiếng Đức, tiếng Pháp và tiếng Thổ Nhĩ Kỳ. Các cảnh báo chứng chỉ dẻo và các sự từ chối do tài nguyên được dịch sang mọi ngôn ngữ được cung cấp."
      ]
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
