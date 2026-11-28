import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Chứng nhận đầu cuối: kiểm tra kết quả so với mô hình",
  "excerpt": "Một chứng nhận chứng minh rằng một hệ được lắp ghép sai đã được giải đúng thì chẳng có mấy giá trị. Stabileo tự dựng lại mọi mô hình khung như thế nào và chứng nhận kết quả so với mô hình, điều đó đã tìm ra gì, và những gì nó chưa bao quát.",
  "blocks": [
    {
      "k": "p",
      "t": "Từ nhiều tuần nay, mọi phân tích tĩnh tuyến tính trong Stabileo đều đi qua một chứng nhận mà, khi đạt được, cho một cận đã được máy kiểm tra về sai số khi giải hệ phương trình K·u = f. Nhưng chính bộ máy tính toán lại tự lắp ghép hệ đó. Nếu việc lắp ghép có sai sót, như sai dấu trong một phép biến đổi, thiếu một số hạng Timoshenko, hay lực ngàm đầu thanh sai, thì chứng nhận sẽ chứng minh một cách hoàn toàn chặt chẽ rằng một hệ sai đã được giải đúng."
    },
    {
      "k": "p",
      "t": "Các chứng nhận đầu cuối khép lại khoảng trống đó cho khung và giàn, trong 2D và 3D: kết quả được kiểm tra so với mô hình như đã khai báo, không phải so với các ma trận mà bộ máy tính toán đã lắp ghép."
    },
    {
      "k": "h",
      "t": "Một lần lắp ghép thứ hai, độc lập"
    },
    {
      "k": "p",
      "t": "Một bộ kiểm tra được viết riêng dựng lại độ cứng và tải trọng từ dữ liệu mô hình, không gọi bất kỳ hàm phần tử hay hàm lắp ghép nào của bộ máy tính toán. Nó dùng công thức riêng và cách đánh số bậc tự do riêng:"
    },
    {
      "k": "ul",
      "items": [
        "chịu uốn của mỗi thanh từ độ mềm công xôn, được nghịch đảo, còn đầu kia xác định bằng cân bằng, có kể biến dạng cắt Timoshenko;",
        "các khớp bằng ngưng tụ tĩnh, mỗi lần giải phóng một góc xoay;",
        "tải trọng trên thanh được tính như công trên các dạng võng chính xác của thanh không tải, với các tích phân ở dạng đóng;",
        "các trục cục bộ, gối tựa nghiêng, lò xo, liên kết cứng, vách cứng ngang và các ràng buộc đa điểm, suy ra từ các quy ước của mô hình."
      ]
    },
    {
      "k": "p",
      "t": "Mọi thứ được tính bằng số học khoảng, kể cả sin và cos, với các cận chặt chẽ: mỗi đầu vào của mô hình đi vào dưới dạng số thập phân như lúc nhập, được bao trong một khoảng. Khi một quyết định phụ thuộc vào một ngưỡng mà khoảng không phân định được, bộ kiểm tra từ chối thay vì đoán."
    },
    {
      "k": "h",
      "t": "Chứng nhận khẳng định điều gì"
    },
    {
      "k": "p",
      "t": "Với độ cứng chính xác đó, bộ kiểm tra chứng minh rằng mô hình có nghiệm duy nhất và chặn khoảng cách giữa các chuyển vị mà bộ máy tính toán trả về với nghiệm đó, trên mọi bậc tự do mà mô hình xác định. Các ma trận của bộ máy tính toán không đóng vai trò gì trong khẳng định này. Chúng được so sánh riêng: chúng phải trùng với các ma trận dựng lại đến một phần 10¹⁰, và các chuyển vị phải thỏa mãn các gối tựa và ràng buộc của mô hình đến một phần 10⁹. Nếu không, kết quả được báo là chưa kiểm tra đầu cuối, kèm lý do."
    },
    {
      "k": "p",
      "t": "Định lý đứng sau cận này được chứng minh trong Lean. Trong ứng dụng, bảng kết quả hiển thị dòng “Đã kiểm tra đầu cuối” cùng cận sai số chuyển vị, hoặc lý do không kiểm tra được."
    },
    {
      "k": "img",
      "base": "blog/certificate",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic với ví dụ khung cổng đã được giải. Trong mục Kiểm tra kết quả của bảng kết quả, dòng “Đã kiểm tra đầu cuối: việc ghép lại độc lập của mô hình cho kết quả trùng khớp; sai số chuyển vị ≤ 3.68e-15” nằm bên dưới chứng nhận.",
      "caption": "Dòng này trong bảng kết quả, trên ví dụ khung cổng."
    },
    {
      "k": "h",
      "t": "Nó đã tìm ra gì"
    },
    {
      "k": "table",
      "caption": "Các mô hình được kiểm tra đầu cuối trong tích hợp liên tục: ở tất cả các mô hình, phần lắp ghép của bộ máy tính toán đều trùng với phần dựng lại.",
      "head": [
        "Bộ",
        "Mô hình",
        "Đã chứng nhận"
      ],
      "rows": [
        [
          "Mô hình thử 2D",
          "82",
          "82"
        ],
        [
          "Mô hình thử 3D",
          "32",
          "32"
        ],
        [
          "Khung 2D ngẫu nhiên",
          "200",
          "200"
        ],
        [
          "Khung 3D ngẫu nhiên",
          "150",
          "150"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Mọi mô hình thử và hàng trăm khung được tạo ngẫu nhiên đều trùng khớp và được chứng nhận, và các lỗi lắp ghép được cố ý cài vào bộ máy tính toán làm phép kiểm tra thất bại. Nó cũng đã tìm ra những vấn đề thực sự:"
    },
    {
      "k": "ul",
      "items": [
        "một vách cứng ngang 3D trong mặt phẳng XZ đã liên kết các nút với góc xoay sai dấu;",
        "trong 2D, một mô men đặt tại nút mà mọi thanh đều có khớp bị hấp thụ bởi một lò xo giả, và chứng nhận của hệ đã lắp ghép vẫn cho qua dù mô hình không có nghiệm;",
        "một liên kết cứng từ nút như vậy đã che giấu một cơ cấu thực sự."
      ]
    },
    {
      "k": "p",
      "t": "Hai lỗi đầu đã được sửa: vách cứng ngang chuyển động theo chuyển động xoay của vật rắn, và mô men đó bị từ chối trước khi giải. Và khi bộ máy tính toán thay đổi ý nghĩa của vách cứng ngang, sao cho cả sàn xoay như một vật thể, bộ kiểm tra không cho qua điều gì sai: nó vẫn trung thực, với các cận vô dụng, cho đến khi các quy ước của nó được cập nhật. Đó chính xác là mục đích của một phép kiểm tra độc lập."
    },
    {
      "k": "h",
      "t": "Những gì chưa bao quát"
    },
    {
      "k": "ul",
      "items": [
        "Vỏ, khối đặc, bộ nối, thanh cong và xoắn có vênh chưa được dựng lại: chúng được báo là nằm ngoài phạm vi, không bao giờ là đã kiểm tra.",
        "Các công thức của bộ kiểm tra mã hóa cơ học của mô hình. Chúng được viết tách biệt với bộ máy tính toán và so sánh với nó, nhưng chưa được chứng minh.",
        "Phần triển khai Rust chưa được chứng minh tương đương với thuật toán Lean, như với mọi chứng nhận.",
        "Một chứng nhận cho biết kết quả thuộc về mô hình. Nó không cho biết mô hình có biểu diễn tốt kết cấu hay không: đó vẫn là công việc của kỹ sư."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Các cách khác chúng tôi tìm lỗi, và giới hạn của chúng:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/CERTIFY.md",
      "label": "CERTIFY.md, “Chứng nhận đầu cuối”",
      "t": "Mô tả kỹ thuật đầy đủ, kèm các công thức và các phép thử:"
    }
  ]
};

export default body;
