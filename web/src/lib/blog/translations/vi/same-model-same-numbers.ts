import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Cùng mô hình, cùng kết quả số: tính tất định và nguồn gốc",
  "excerpt": "Hai lần giải cùng một mô hình trong một phiên có thể khác nhau ở các chữ số cuối. Vì sao điều đó xảy ra, chúng tôi đã sửa thế nào, và nay mỗi báo cáo cho biết phiên bản nào và dữ liệu nào đã tạo ra nó, để bất kỳ ai cũng có thể tái tạo.",
  "blocks": [
    {
      "k": "p",
      "t": "Một báo cáo tính toán có ký tên phải tái tạo được. Nếu một năm sau có người mở lại dự án, hoặc một kỹ sư khác rà soát, cùng một mô hình phải cho cùng các con số, và phải rõ phiên bản nào của chương trình đã tạo ra chúng."
    },
    {
      "k": "p",
      "t": "Khi đo đạc, chúng tôi thấy điều đó không phải lúc nào cũng đúng: hai lần giải cùng một mô hình trong một phiên có thể khác nhau ở các chữ số cuối, và một số kết quả xuất hiện theo thứ tự khác. Sự khác biệt rất nhỏ, nhưng một con số thay đổi trong khi không có gì thay đổi là một con số không thể kiểm tra."
    },
    {
      "k": "h",
      "t": "Sự khác biệt đến từ đâu"
    },
    {
      "k": "p",
      "t": "Bộ máy tính toán lưu các nút, thanh, gối tựa và tải trọng trong các bảng băm, và mỗi bảng được tạo với một hạt giống ngẫu nhiên: cùng một tệp đọc hai lần sẽ được duyệt theo hai thứ tự khác nhau. Cộng các số dấu phẩy động theo thứ tự khác có thể làm đổi bit cuối, vì phép cộng trên máy tính không có tính kết hợp. Các bộ lắp ghép 3D đã sắp xếp các thanh, nhưng các bộ lắp ghép 2D, các vòng lặp tải trọng và gối tựa và phần lớn các phân tích khác thì chưa."
    },
    {
      "k": "ul",
      "items": [
        "Mọi lượt duyệt qua một bảng đầu vào nay đều theo thứ tự cố định, thứ tự của các khóa: 587 vị trí trong toàn bộ máy tính toán.",
        "Các tổng cân bằng và các số hạng chéo của gối tựa nghiêng cũng được duyệt theo thứ tự cố định.",
        "Các cảnh báo được xuất ra theo thứ tự số nút hoặc số thanh, không còn ngẫu nhiên."
      ]
    },
    {
      "k": "table",
      "caption": "Những gì đã thay đổi trong bộ máy tính toán, và cách kiểm tra.",
      "head": [
        "Nội dung",
        "Số lượng"
      ],
      "rows": [
        [
          "Lượt duyệt bảng đầu vào được đặt theo thứ tự cố định",
          "587"
        ],
        [
          "Số lần đọc mỗi mô hình ngẫu nhiên được so sánh từng bit",
          "6"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Một phép thử đọc mỗi mô hình ngẫu nhiên sáu lần, giải nó và so sánh các kết quả dưới dạng văn bản, từng bit, trong các phân tích tuyến tính, dao động riêng, mất ổn định và P-Delta. Một lượt duyệt không có thứ tự làm đổi kết quả sẽ lộ ra thành sự khác biệt giữa các lần chạy."
    },
    {
      "k": "h",
      "t": "Mỗi báo cáo cho biết nó đến từ đâu"
    },
    {
      "k": "p",
      "t": "Mọi báo cáo tính toán, báo cáo PRO, bảng tính và CSV nay đều mang một khối nguồn gốc: phiên bản và commit của ứng dụng và của bộ máy tính toán, dấu vân tay SHA-256 của mô-đun WebAssembly đã thực hiện lần giải, dấu vân tay của chính xác mô hình, của các cài đặt và của các kết quả hiển thị, cùng trạng thái của các chứng nhận (một biểu đồ bao tải trọng di động ghi ít hơn: mô hình và cài đặt của nó). Nếu dự án thay đổi trong lúc việc xuất đang được chuẩn bị, sẽ không xuất gì cả: một báo cáo không bao giờ mang các con số của trạng thái này dưới nguồn gốc của trạng thái khác."
    },
    {
      "k": "p",
      "t": "Với khối đó, ứng dụng có thể tái tạo một báo cáo: nó giải lại dự án và so sánh mọi dấu vân tay. Kết luận chỉ là “đã tái tạo” khi tất cả đều khớp (một bản dựng WebAssembly khác được báo cáo bên cạnh, không tính là một khác biệt); khi có dấu vân tay không tính lại được, nó ghi “chưa đầy đủ”, không bao giờ ghi “đã tái tạo”. Cũng có một công cụ dòng lệnh giải cùng đầu vào hai lần và kiểm tra các dấu vân tay."
    },
    {
      "k": "img",
      "base": "blog/reproduce",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic với hộp thoại “Tái tạo từ nguồn gốc”: một ô để dán khối nguồn gốc của báo cáo hoặc tải báo cáo đã lưu, và các nút “Tải đầu vào bộ giải” và “Giải lại và so sánh”.",
      "caption": "“Kiểm tra một báo cáo đã xuất”: dự án đang mở được giải lại và mọi dấu vân tay được so sánh với của báo cáo."
    },
    {
      "k": "h",
      "t": "Các dự án cũ sẽ cho biết"
    },
    {
      "k": "p",
      "t": "Mỗi dự án được lưu ghi lại phiên bản kết quả mà nó đã được giải. Khi mở một dự án đã giải trước một thay đổi liên quan đến các tính năng của nó, ứng dụng liệt kê các thay đổi đó, giải thích bằng ngôn ngữ của bạn, và đánh dấu kết quả là đã lỗi thời cho đến khi giải lại. Khi còn nghi ngờ, một thay đổi được coi là có áp dụng: thừa một thông báo chỉ tốn một phút, thiếu một thông báo có thể che giấu một con số đã dịch chuyển."
    },
    {
      "k": "h",
      "t": "Một giới hạn"
    },
    {
      "k": "p",
      "t": "Ứng dụng luôn so sánh WebAssembly với WebAssembly. Công cụ gốc đã tái tạo các dấu vân tay của trình duyệt từng bit trên mô hình thử, nhưng các hàm lượng giác đến từ các thư viện khác nhau trên mỗi nền tảng, nên một mô hình mà phần lắp ghép dùng chúng theo cách mà hai bên làm tròn khác nhau thì có thể khác nhau ở bit cuối giữa dòng lệnh và trình duyệt."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "Nửa còn lại của việc tin vào một con số: kiểm tra nó so với mô hình:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/PROVENANCE.md",
      "label": "PROVENANCE.md",
      "t": "Mô tả kỹ thuật đầy đủ:"
    }
  ]
};

export default body;
