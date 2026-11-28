import type { PostBody } from '../../types';
import { flexureExampleRows, flexureExampleSteps } from '../../flexure-example';

const body: PostBody = {
  "title": "Kiểm tra uốn theo CIRSOC 201, từng bước",
  "excerpt": "Hầu như ai cũng nhớ φMn ≥ Mu. Đó là dòng cuối của phép kiểm tra, không phải bản thân phép kiểm tra. Kết quả được quyết định sớm hơn, và một trong các bước đó có thể kéo φ xuống dưới 0,9.",
  "blocks": [
    {
      "k": "p",
      "t": "Hầu hết mọi người nhớ phép kiểm tra uốn như một bất đẳng thức: φMn ≥ Mu. Điều đó đúng, và nó là dòng cuối. Điều quyết định kết quả xảy ra sớm hơn, trong các bước hiếm khi được xem kỹ vì chúng có vẻ chỉ là thủ tục."
    },
    {
      "k": "p",
      "t": "Đây là những gì mô-đun CIRSOC 201 của Stabileo trả về cho một dầm 20×40 cm bê tông H-25, thép fy 420, lớp bảo vệ 25 mm và cốt đai 8 mm, chịu mô men 60 kN·m:"
    },
    {
      "k": "ol",
      "items": flexureExampleSteps("Cốt thép chịu kéo: 2 Ø20 (6,28 cm²)")
    },
    {
      "k": "p",
      "t": "Mười bước. Bước thứ mười là bước ai cũng nhớ. Những bước quyết định kết quả là bước thứ ba và bước thứ chín."
    },
    {
      "k": "h",
      "t": "Bước 3: giá trị tối thiểu chi phối thường xuyên hơn người ta tưởng"
    },
    {
      "k": "p",
      "t": "Điều 9.6.1.2 yêu cầu cốt thép chịu uốn tối thiểu bằng giá trị lớn hơn trong 0.25·√f'c/fy·bw·d và 1.4/fy·bw·d. Nó thường được coi là một ngưỡng sàn hầu như không bao giờ chạm tới. Ở các dầm nhà ở, nó được chạm tới thường xuyên."
    },
    {
      "k": "table",
      "caption": "Cùng dầm 20×40 H-25 dưới các mô men tăng dần: điều gì quyết định cốt thép.",
      "head": [
        "Mu [kN·m]",
        "As theo cường độ [cm²]",
        "As,min [cm²]",
        "Chi phối"
      ],
      "rows": [
        [
          "15",
          "1.12",
          "2.39",
          "giá trị tối thiểu"
        ],
        [
          "30",
          "2.28",
          "2.39",
          "giá trị tối thiểu"
        ],
        [
          "60",
          "4.73",
          "2.39",
          "cường độ"
        ],
        [
          "90",
          "7.38",
          "2.39",
          "cường độ"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Điểm giao nằm ở Mu = 31,5 kN·m. Dưới mô men đó, tính theo cường độ chẳng đạt được gì: tiết diện chịu 2,39 cm² trong cả hai trường hợp. Nên biết một dầm nằm ở phía nào của điểm giao trước khi bàn về cốt thép của nó."
    },
    {
      "k": "h",
      "t": "Và giá trị tối thiểu hiếm khi phụ thuộc vào bê tông"
    },
    {
      "k": "p",
      "t": "Trong hai biểu thức của điều khoản, biểu thức chứa √f'c chỉ vượt biểu thức kia với bê tông khá mạnh."
    },
    {
      "k": "table",
      "caption": "Hai biểu thức cho giá trị tối thiểu, với fy 420, tính theo phần nghìn.",
      "head": [
        "Bê tông",
        "0.25·√f'c/fy",
        "1.4/fy",
        "Chi phối"
      ],
      "rows": [
        [
          "H-20",
          "2.6620",
          "3.3333",
          "1.4/fy"
        ],
        [
          "H-25",
          "2.9762",
          "3.3333",
          "1.4/fy"
        ],
        [
          "H-30",
          "3.2603",
          "3.3333",
          "1.4/fy"
        ],
        [
          "H-35",
          "3.5215",
          "3.3333",
          "√f'c"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Điểm giao nằm ở f'c = 31,36 MPa. Trên toàn dải dùng trong công trình nhà ở (H-20, H-25, H-30), cốt thép tối thiểu không phụ thuộc vào bê tông: nó đến từ 1.4/fy và không gì khác. Đi từ H-20 lên H-30 không hạ được giá trị tối thiểu dù chỉ một xen-ti-mét vuông."
    },
    {
      "k": "h",
      "t": "Bước 9: φ không mặc nhiên bằng 0,9"
    },
    {
      "k": "p",
      "t": "Hệ số giảm cường độ được dạy là 0,90 cho uốn và sau đó bị coi là hằng số. Không phải vậy. Nó xuất phát từ biến dạng của thép chịu kéo ở trạng thái cực hạn, và mô-đun nói rõ điều này ở bước 9: εt ≥ 5‰ → kiểm soát bởi kéo → φ = 0,90. Đặt thêm thép vào tiết diện thì εt giảm, kéo φ giảm theo."
    },
    {
      "k": "table",
      "caption": "Cùng dầm đó, mỗi lần chịu tải lớn hơn. εt và φ lấy từ các bước 8 và 9.",
      "head": [
        "Mu [kN·m]",
        "Cốt thép",
        "εt [‰]",
        "φ",
        "φMn [kN·m]",
        "Độ dẻo"
      ],
      "rows": flexureExampleRows("Đạt", "Không đạt")
    },
    {
      "k": "p",
      "t": "Tiết diện 2 Ø32 không đạt: biến dạng kéo của nó thấp hơn mức tối thiểu yêu cầu. Một φ bị giảm không thỏa mãn kiểm tra độ dẻo. Hãy thiết kế lại tiết diện hoặc cốt thép của nó."
    },
    {
      "k": "quote",
      "t": "Tiết diện 2 Ø32 không đạt: biến dạng kéo của nó thấp hơn mức tối thiểu yêu cầu. Một φ bị giảm không thỏa mãn kiểm tra độ dẻo. Hãy thiết kế lại tiết diện hoặc cốt thép của nó."
    },
    {
      "k": "h",
      "t": "Vì sao phải đặt cốt thép chịu nén"
    },
    {
      "k": "p",
      "t": "Có thể cần cốt thép chịu nén ở giới hạn độ dẻo. Đừng đợi đến khi thép chịu kéo xuống dưới biến dạng chảy; hãy kiểm tra tiết diện đã thiết kế lại tại chiều sâu thanh thực tế."
    },
    {
      "k": "p",
      "t": "Vậy cốt thép chịu nén ở đó để trả lại độ dẻo cho tiết diện và lấy lại hệ số φ. Khả năng chịu lực đến sau, như một kết quả."
    },
    {
      "k": "note",
      "t": "Có thể cần cốt thép chịu nén ở giới hạn độ dẻo. Đừng đợi đến khi thép chịu kéo xuống dưới biến dạng chảy; hãy kiểm tra tiết diện đã thiết kế lại tại chiều sâu thanh thực tế."
    },
    {
      "k": "h",
      "t": "Thử trên một dầm thực"
    },
    {
      "k": "p",
      "t": "Dưới đây là mô hình: dầm đơn giản dài 5 m, 20×40, H-25, với tĩnh tải 12 kN/m và hoạt tải 8 kN/m, cộng trọng lượng bản thân. Nó mở trong quy trình thiết kế của PRO, với CIRSOC 201 là tiêu chuẩn thiết kế đang áp dụng."
    },
    {
      "k": "img",
      "base": "blog/cirsoc-201-beam",
      "w": 1600,
      "h": 1000,
      "alt": "Các điều khiển thiết kế của Stabileo PRO với dầm 20×40 đang được chọn.",
      "caption": "Ảnh chụp màn hình này có trước bản sửa phản lực gối. Ví dụ trực tiếp bên dưới cho thấy kết quả hiện tại."
    },
    {
      "k": "embed",
      "mode": "pro",
      "query": "example=rc-beam-flexure&proTab=design",
      "label": "Dầm trong Stabileo, trong quy trình thiết kế của PRO. Nếu thiết kế đang tắt, hãy nhấn “Bật thiết kế cho lượt truy cập này” trong thông báo. Ba nút, theo thứ tự: “Tính nhu cầu”, “Tính cốt thép yêu cầu” và “Chọn kích thước…”. Chỉ nút thứ ba chọn các thanh, và khi chưa có thanh thì không có gì để kiểm tra: bảng ghi “không có cốt thép”. Nhịp 5 m được mô hình hóa bằng hai phần tử; cả hai đều đạt với D/C = 0,91. Mô men uốn dương ở nhịp (My+) chi phối. Hãy đổi tải và chạy lại. Thiết kế theo tiêu chuẩn trong PRO vẫn đang được phát triển; mô-đun bê tông là phần đã được triển khai và kiểm thử."
    },
    {
      "k": "h",
      "t": "Tóm lại"
    },
    {
      "k": "ol",
      "items": [
        "Trước khi chọn kích thước, hãy kiểm tra mô men nằm trên hay dưới điểm giao với giá trị tối thiểu. Dưới điểm đó, cốt thép đã được quyết định sẵn.",
        "Từ H-20 đến H-30, giá trị tối thiểu không phụ thuộc vào bê tông. Nó đến từ 1.4/fy.",
        "φ phụ thuộc vào εt: luôn đọc hai giá trị cùng nhau.",
        "Nếu xuất hiện cốt thép chịu nén, đó là vì tiết diện mất độ dẻo, không phải vì thiếu khả năng chịu lực."
      ]
    },
    {
      "k": "note",
      "t": "Tính lại chiều cao hữu hiệu cho từng đường kính thanh được chọn. Bảng khả năng chịu lực được kiểm tra theo động cơ hiện tại; chỉ riêng khả năng chịu lực không phải là một phép kiểm tra đầy đủ."
    }
  ]
};

export default body;
