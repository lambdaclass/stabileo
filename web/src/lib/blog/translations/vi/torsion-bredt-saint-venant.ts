import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Bredt hay Saint-Venant: lý thuyết xoắn nào áp dụng, và chọn sai thì phải trả giá gì",
  "excerpt": "Ba công thức, một tiết diện, ba con số khác nhau. Công thức nào áp dụng tùy thuộc vào thành; khi hai công thức cùng áp dụng, Bredt cho kết quả thấp hơn 2 đến 15%.",
  "blocks": [
    {
      "k": "p",
      "t": "Ba công thức khác nhau cho ứng suất cắt do xoắn. Với cùng một tiết diện, chúng có thể chênh nhau nhiều bậc độ lớn, và công thức nào áp dụng tùy thuộc vào loại thành của tiết diện."
    },
    {
      "k": "p",
      "t": "Chừng đó có trong mọi sách giáo khoa. Điều hiếm khi được giải thích là chuyện gì xảy ra khi hai trong ba công thức cùng áp dụng cho một tiết diện: chúng cho đáp án khác nhau, và sự chênh lệch luôn đi theo cùng một chiều."
    },
    {
      "k": "h",
      "t": "Ba công thức"
    },
    {
      "k": "ul",
      "items": [
        "Cauchy, τ = T·r / Iₚ. Chỉ cho tiết diện tròn, và ở đó nó chính xác: đó là trường hợp duy nhất mà các tiết diện phẳng vẫn phẳng. Ứng suất tăng tuyến tính theo bán kính, từ giá trị nhỏ nhất ở mặt trong đến giá trị lớn nhất ở mặt ngoài.",
        "Bredt, τ = T / (2·Aₘ·t). Cho tiết diện thành mỏng kín. Mô men xoắn được truyền bởi một dòng cắt tuần hoàn quanh diện tích bao kín. Aₘ là diện tích bao bởi đường trung bình của thành, không phải bởi mặt ngoài của nó; nhầm lẫn hai thứ này là một lỗi thường gặp.",
        "Saint-Venant, τ = T·t / J với J = (1/3)·Σb·t³. Cho tiết diện thành mỏng hở. Khi không có đường kín, dòng phải quay ngược lại trên chiều dày, đó là lý do chiều dày xuất hiện với lũy thừa ba."
      ]
    },
    {
      "k": "note",
      "t": "Saint-Venant thường được giới thiệu là “lý thuyết cho tiết diện hở”, nhưng nó là lý thuyết tổng quát, còn hai lý thuyết kia là các trường hợp riêng của nó có nghiệm dạng đóng. Trên tiết diện tròn, nghiệm của nó trùng chính xác với Cauchy, vì đối xứng tròn có nghĩa là tiết diện không vênh. Trên một thành mỏng kín, nghiệm của nó là nghiệm của Bredt."
    },
    {
      "k": "h",
      "t": "Khi hai công thức cùng áp dụng, chúng bất đồng"
    },
    {
      "k": "p",
      "t": "Lấy một ống tròn. Cauchy áp dụng và chính xác. Bredt cũng áp dụng: thành kín và có dòng cắt chạy quanh nó. Nhưng Bredt giả định ứng suất không đổi theo chiều dày, trong khi ở Cauchy nó tăng theo bán kính. Vì vậy Bredt cho giá trị trung bình còn Cauchy cho giá trị lớn nhất."
    },
    {
      "k": "table",
      "caption": "Ống tròn rỗng: Bredt thấp hơn giá trị chính xác bao nhiêu, theo chiều dày thành tương đối.",
      "head": [
        "t / rₘ",
        "Ví dụ (rₘ = 50 mm)",
        "τ Bredt / τ chính xác",
        "Bredt thấp hơn"
      ],
      "rows": [
        [
          "0.05",
          "Thành 2.5 mm",
          "0.976",
          "2.4 %"
        ],
        [
          "0.10",
          "Thành 5.0 mm",
          "0.955",
          "4.5 %"
        ],
        [
          "0.20",
          "Thành 10.0 mm",
          "0.918",
          "8.2 %"
        ],
        [
          "0.50",
          "Thành 25.0 mm",
          "0.850",
          "15.0 %"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Bredt thấp hơn trong cả bốn trường hợp. Với một ống có thành 5 mm và bán kính trung bình 50 mm, mà quy tắc ngón tay cái thông thường vẫn coi là thành mỏng, ứng suất thực cao hơn giá trị tính được 4,7%. Với thành 10 mm, là 8,9%."
    },
    {
      "k": "quote",
      "t": "Sai số luôn cùng một dấu: Bredt cho kết quả thấp."
    },
    {
      "k": "p",
      "t": "Chênh lệch 4,5% không nổi bật trong một phép kiểm tra thiết kế, nên một cấu kiện không đạt có thể trông như đạt."
    },
    {
      "k": "img",
      "base": "blog/torsion-tube",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic với công xôn CHS 105×5 chịu mô men xoắn 1 kN·m. Bảng tiết diện mở ở mục Xoắn: T = 1,00 kN·m, τmax = 13,34 MPa, J = 393,7 cm⁴, ghi “Tròn — chính xác”, tiếp theo là ba lý thuyết bắt đầu từ Saint-Venant.",
      "caption": "Ống trong bảng ở Stabileo: 13,34 MPa, với mỗi lý thuyết được liệt kê bên dưới cùng công thức của nó."
    },
    {
      "k": "embed",
      "query": "example=torsion-tube&inspect=1&open=torsion",
      "label": "Cùng ống đó trong Stabileo: công xôn CHS 105×5 chịu mô men xoắn 1 kN·m. Bảng mở ở mục Xoắn và cho Cauchy 13,34 MPa và Bredt 12,73 MPa, tức 95% trong bảng trên. Di chuyển điểm hoặc đổi tiết diện thì cả ba giá trị đều cập nhật."
    },
    {
      "k": "h",
      "t": "Mở thành làm thay đổi bậc độ lớn"
    },
    {
      "k": "p",
      "t": "Giữa các lý thuyết chồng lên nhau, chênh lệch là vài phần trăm. Giữa thành kín và thành hở, nó là nhiều bậc độ lớn. Lấy một ống vuông 100×100 mm thành 5 mm và xẻ dọc nó: nó giữ nguyên diện tích, trọng lượng và gần như toàn bộ độ cứng chống uốn."
    },
    {
      "k": "table",
      "caption": "Cùng ống vuông 100×100×5, kín và có khe xẻ dọc, chịu mô men xoắn 1 kN·m.",
      "head": [
        "",
        "Kín",
        "Xẻ",
        "Hệ số"
      ],
      "rows": [
        [
          "J [mm⁴]",
          "4,286,875",
          "15,833",
          "271"
        ],
        [
          "τ [MPa]",
          "11.08",
          "315.79",
          "29"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Độ cứng xoắn giảm 271 lần và ứng suất tăng 29 lần. Một thép chữ C và một ống vuông cùng trọng lượng ứng xử rất khác nhau khi xoắn."
    },
    {
      "k": "note",
      "t": "Còn một số hạng khác thường bị bỏ sót: vênh. Khi một tiết diện hở không thể vênh tự do, vì bị ngàm hoặc vì mô men xoắn thay đổi dọc cấu kiện, xoắn vênh xuất hiện thêm vào xoắn Saint-Venant. Bỏ qua nó cũng dẫn đến đánh giá thấp."
    },
    {
      "k": "h",
      "t": "Stabileo làm gì với điều này"
    },
    {
      "k": "p",
      "t": "Stabileo hiển thị cả ba, mỗi lý thuyết kèm công thức, các số hạng và giá trị của nó. Những lý thuyết không áp dụng cũng được hiển thị, kèm lý do. Và khi hai lý thuyết cùng hợp lệ cho một tiết diện, nó cho thấy chênh lệch giữa chúng thay vì lặng lẽ chọn một."
    },
    {
      "k": "p",
      "t": "Trọng tâm, tâm uốn và lõi tiết diện được xử lý theo cùng cách: tính từng bước, phơi bày đầy đủ, trên đa giác thực của tiết diện chứ không từ một công thức cho từng hình dạng."
    },
    {
      "k": "note",
      "t": "Để xem, hãy mở trình soạn thảo, vẽ hoặc chọn một thanh, và vào Nâng cao → Phân tích tiết diện → Xoắn. Với ống tròn, bạn sẽ thấy Cauchy và Bredt cạnh nhau, kèm phần trăm chênh lệch giữa chúng. Với thép chữ C, bạn sẽ thấy Bredt được đánh dấu là không áp dụng, kèm lý do."
    },
    {
      "k": "h",
      "t": "Tóm lại"
    },
    {
      "k": "ol",
      "items": [
        "Thành có tạo thành một vòng kín không? Bredt, với Aₘ đo trên đường trung bình.",
        "Tiết diện hở? Saint-Venant, và chiều dày vào theo lũy thừa ba: thành dày nhất chi phối.",
        "Tiết diện tròn? Cauchy, và nó chính xác. Nếu bạn còn dùng Bredt, hãy chờ nó cho kết quả thấp.",
        "Vênh có bị ngăn không? Khi đó riêng Saint-Venant là chưa đủ."
      ]
    },
    {
      "k": "p",
      "t": "Dù thế nào, hãy ghi lại lý thuyết bạn đã dùng cùng với giá trị."
    },
    {
      "k": "link",
      "slug": "bars-or-finite-elements",
      "t": "Cùng một câu hỏi (lý thuyết nào áp dụng, và chọn sai thì phải trả giá gì) xuất hiện khi chọn giữa phần tử thanh và phần tử hữu hạn:"
    },
    {
      "k": "note",
      "t": "Các số liệu trong bài này lấy từ nghiệm dạng đóng cho các tiết diện đã nêu: một ống tròn rỗng với Aₘ trên đường trung bình, và một ống vuông 100×100×5 với J kín theo Bredt và J hở theo Saint-Venant. Bạn có thể tái lập chúng trong Stabileo với cùng các tiết diện."
    }
  ]
};

export default body;
