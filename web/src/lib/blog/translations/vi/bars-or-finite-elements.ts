import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Phần tử thanh hay phần tử hữu hạn? Hai mô hình, không phải hai phương pháp",
  "excerpt": "Với một cấu kiện lăng trụ, phương pháp độ cứng là trường hợp riêng chính xác của phương pháp phần tử hữu hạn. Điều thay đổi là mô hình, và với dầm cao, mô hình khung cho độ võng nhỏ hơn thực 19 đến 34%.",
  "blocks": [
    {
      "k": "p",
      "t": "“Nên dùng phương pháp độ cứng hay phần tử hữu hạn?” xuất hiện ở mọi lớp học và mọi văn phòng thiết kế, và đó là câu hỏi sai. Vấn đề là nó coi hai thứ như các lựa chọn thay thế được cho nhau, trong khi chúng không phải vậy."
    },
    {
      "k": "p",
      "t": "Phương pháp độ cứng là phương pháp phần tử hữu hạn áp dụng cho các cấu kiện thanh. Điều phân biệt một chương trình “khung” với một chương trình “phần tử hữu hạn” là mô hình. Một phần tử khung mang một lý thuyết một chiều về cách cấu kiện biến dạng; một lưới vỏ là một môi trường liên tục hai chiều được rời rạc hóa. Chọn giữa chúng là một quyết định kỹ thuật, và bài này nói về lúc nào nên đưa ra quyết định đó và chọn sai thì phải trả giá gì."
    },
    {
      "k": "h",
      "t": "Một cấu kiện thẳng không cần chia lưới"
    },
    {
      "k": "p",
      "t": "Trong phần tử hữu hạn, chuyển vị bên trong mỗi phần tử được xấp xỉ bằng các hàm dạng. Với cấu kiện chịu uốn, hàm thường dùng là đa thức Hermite bậc ba. Và nghiệm của phương trình dầm Euler-Bernoulli khi không có tải dọc nhịp tự nó là một đa thức bậc ba, nên phép xấp xỉ trùng với nghiệm chính xác."
    },
    {
      "k": "p",
      "t": "Đó là lý do ma trận độ cứng của cấu kiện lăng trụ, ma trận có trong mọi giáo trình phân tích ma trận, là chính xác, và vì sao chia một cấu kiện thành nhiều phần tử hơn không cải thiện được gì. Với tải trọng phân bố, điều này vẫn đúng tại các nút, miễn là các tải trọng nút tương đương được tính nhất quán."
    },
    {
      "k": "table",
      "caption": "Dầm đơn giản dài 6 m, tiết diện 20×60, 10 kN/m, E = 30.000 MPa. Độ võng giữa nhịp khi dầm được chia thành các số phần tử khung khác nhau.",
      "head": [
        "Số phần tử khung trong dầm",
        "Độ võng giữa nhịp [mm]"
      ],
      "rows": [
        [
          "2",
          "1.5625"
        ],
        [
          "4",
          "1.5625"
        ],
        [
          "10",
          "1.5625"
        ],
        [
          "50",
          "1.5625"
        ],
        [
          "Dạng đóng 5qL⁴/384EI",
          "1.5625"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Hai phần tử hay năm mươi, động cơ đều trả về cùng một con số, và nó khớp với dạng đóng."
    },
    {
      "k": "quote",
      "t": "Chia lưới một cấu kiện thẳng không làm nó chính xác hơn: nó chỉ làm chậm hơn."
    },
    {
      "k": "note",
      "t": "Tính chính xác đó đúng trong phạm vi lý thuyết dầm. Ma trận giải chính xác phương trình Euler-Bernoulli, nhưng nếu cấu kiện không ứng xử như dầm Euler-Bernoulli thì nghiệm chính xác của phương trình đó chẳng giúp ích gì. Phần còn lại của bài này nói về những trường hợp ấy."
    },
    {
      "k": "h",
      "t": "Nơi chúng khác nhau"
    },
    {
      "k": "p",
      "t": "Lý thuyết Euler-Bernoulli giả định các tiết diện phẳng vẫn phẳng và vuông góc với trục, tức là bỏ qua biến dạng cắt. Với dầm mảnh, đây là một xấp xỉ rất tốt. Với dầm cao thì không."
    },
    {
      "k": "p",
      "t": "Chúng tôi lấy cùng dầm 6 m dưới cùng tải trọng và tăng dần chiều cao của nó. Mỗi trường hợp được giải hai lần: bằng phần tử khung, như chế độ Basic làm, và bằng vỏ MITC4 chia lưới trong mặt phẳng của dầm, điều mà chế độ PRO có thể làm."
    },
    {
      "k": "table",
      "caption": "Dầm đơn giản dài 6 m, rộng 20 cm, 10 kN/m, E = 30.000 MPa, ν = 0,2. Độ võng giữa nhịp, trên trục.",
      "head": [
        "L/h",
        "Chiều cao h [m]",
        "Phần tử khung [mm]",
        "Vỏ [mm]",
        "Mô hình khung thấp hơn"
      ],
      "rows": [
        [
          "20",
          "0.30",
          "12.500",
          "12.567",
          "0.5 %"
        ],
        [
          "10",
          "0.60",
          "1.5625",
          "1.5961",
          "2.1 %"
        ],
        [
          "5",
          "1.20",
          "0.19531",
          "0.21206",
          "7.9 %"
        ],
        [
          "3",
          "2.00",
          "0.042188",
          "0.052145",
          "19.1 %"
        ],
        [
          "2",
          "3.00",
          "0.012500",
          "0.019017",
          "34.3 %"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Ở L/h = 10, một dầm bình thường, chênh lệch là 2%. Ở L/h = 5 là gần 8%. Ở L/h = 3, mô hình khung cho độ võng nhỏ hơn 19%, và ở L/h = 2, nhỏ hơn một phần ba."
    },
    {
      "k": "quote",
      "t": "Mô hình khung luôn làm dầm cứng hơn thực tế."
    },
    {
      "k": "h",
      "t": "Kiểm tra bằng máy tính cầm tay"
    },
    {
      "k": "p",
      "t": "Bạn không cần tin lời của mô hình vỏ. Lý thuyết dầm Timoshenko bao gồm biến dạng cắt, và với dầm đơn giản chịu tải phân bố đều, nó thêm một số hạng vào độ võng: q·L² / (8·κ·G·A), với κ = 5/6 cho tiết diện chữ nhật và G = E / (2·(1+ν))."
    },
    {
      "k": "table",
      "caption": "Dầm ở L/h = 3 (nhịp 6 m, cao 2 m): bốn câu trả lời cho cùng một câu hỏi.",
      "head": [
        "Mô hình",
        "Độ võng giữa nhịp [mm]"
      ],
      "rows": [
        [
          "Phần tử khung (Euler-Bernoulli)",
          "0.0422"
        ],
        [
          "Phần tử khung cộng số hạng cắt, tính tay",
          "0.0530"
        ],
        [
          "Vỏ MITC4",
          "0.0521"
        ],
        [
          "Bài toán đàn hồi phẳng, dạng đóng",
          "0.0523"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Ở L/h = 3, số hạng đó là 0,0108 mm; cộng với 0,0422 mm từ Euler-Bernoulli, cho 0,0530 mm. Mô hình vỏ cho 0,0521 mm, và nghiệm dạng đóng của bài toán đàn hồi phẳng do Timoshenko và Goodier cho 0,0523 mm. Ba đáp án có tính đến cắt khớp nhau trong phạm vi 2%. Đáp án bỏ qua nó thấp hơn 19%."
    },
    {
      "k": "note",
      "t": "Độ võng không phải là toàn bộ câu chuyện. Ở chiều cao đó, phân bố ứng suất pháp không còn tuyến tính, nên công thức Navier cũng không áp dụng được. Đó là lý do ACI 318, cơ sở của CIRSOC 201, coi mọi cấu kiện có nhịp thông thủy đến bốn lần chiều cao là dầm cao, và yêu cầu một thiết kế có xét đến phân bố biến dạng phi tuyến, chẳng hạn bằng mô hình thanh chống và giằng."
    },
    {
      "k": "h",
      "t": "Vài phần trăm milimét có quan trọng không?"
    },
    {
      "k": "p",
      "t": "Với riêng dầm đó, không nhiều. Trong kết cấu tĩnh định, sai số độ cứng chỉ ảnh hưởng đến độ võng, và dầm cao 2 m dù sao cũng võng rất ít. Sai số bắt đầu quan trọng khi độ cứng quyết định cách phân phối tải trọng, điều xảy ra trong mọi kết cấu siêu tĩnh."
    },
    {
      "k": "p",
      "t": "Trường hợp điển hình là vách chịu cắt. Trong mô hình khung, một vách là một cột rất rộng: nó nhận mô men quán tính của vách và nằm trên đường trục của vách. Với vách thấp, dài so với chiều cao, phần tử khung làm nó cứng hơn thực tế đáng kể."
    },
    {
      "k": "table",
      "caption": "Vách dày 20 cm, ngàm ở chân, chịu 100 kN đặt ngang ở đỉnh. Chuyển vị của mép đỉnh.",
      "head": [
        "Vách, dài × cao [m]",
        "Chiều cao / chiều dài",
        "Phần tử khung [mm]",
        "Vỏ [mm]",
        "Phần tử khung cứng hơn"
      ],
      "rows": [
        [
          "4 × 3",
          "0.75",
          "0.0281",
          "0.0627",
          "2,23 lần"
        ],
        [
          "3 × 3",
          "1.00",
          "0.0667",
          "0.1129",
          "1,69 lần"
        ],
        [
          "2 × 3",
          "1.50",
          "0.2250",
          "0.2943",
          "1,31 lần"
        ],
        [
          "3 × 6",
          "2.00",
          "0.533",
          "0.625",
          "1,17 lần"
        ],
        [
          "3 × 9",
          "3.00",
          "1.800",
          "1.937",
          "1,08 lần"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Một vách dài 4 m cao 3 m, một tầng, cho độ cứng lớn hơn 2,2 lần khi mô hình hóa bằng phần tử khung. Một vách dài 3 m cao 9 m, ba tầng, chỉ cứng hơn 8%. Sự khác biệt quan trọng nhất ở các vách thấp."
    },
    {
      "k": "p",
      "t": "Và điều đó thay đổi cách chia lực cắt. Lấy hai vách trên cùng một đường, một dài 4 m và một dài 2 m, đều cao 3 m và được nối với nhau bằng sàn. Với phần tử khung, vách ngắn nhận 11,1% lực cắt. Với vỏ, nó nhận 17,6%, nhiều hơn 58% so với mô hình khung dự đoán. Phần tải thêm mà mô hình khung gán cho vách dài được lấy từ vách ngắn, vách này rốt cuộc được thiết kế cho lực cắt ít hơn mức nó sẽ thực sự chịu."
    },
    {
      "k": "h",
      "t": "Những câu hỏi mà mô hình khung không trả lời được"
    },
    {
      "k": "p",
      "t": "Cho đến đây, đó là những trường hợp phần tử khung cho con số sai. Ở những trường hợp khác, chúng không thể cho con số nào, vì câu hỏi không có chỗ trong mô hình."
    },
    {
      "k": "ul",
      "items": [
        "Sàn phẳng. Mô men chia thế nào giữa dải cột và dải giữa, và bao nhiêu tập trung trên từng cột, là thông tin hai chiều. Một lưới dầm có thể xấp xỉ nó, nhưng thông tin đó không có trong mô hình.",
        "Vách có lỗ mở. Một phần tử khung chỉ có một tiết diện tại mỗi điểm dọc trục của nó, nên một ô cửa sổ ở giữa vách không có chỗ để đặt.",
        "Nút khung. Trong mô hình khung, nút dầm-cột là một điểm, nên mô men đỉnh xuất hiện trên đường trục. Trong thực tế, nút to bằng cột, và tiết diện bạn thiết kế là tiết diện tại mép cột.",
        "Tải trọng tập trung gần gối tựa. Các tiết diện phẳng không còn phẳng ở vùng đó, vì cùng lý do như trong dầm cao."
      ]
    },
    {
      "k": "h",
      "t": "Nơi chúng phải khớp nhau"
    },
    {
      "k": "p",
      "t": "Nửa còn lại của lập luận cũng quan trọng không kém. Với dầm mảnh ở hàng đầu tiên, tại L/h = 20, phần tử khung và vỏ chênh nhau 0,5%. Con số đó không bằng không, vì biến dạng cắt luôn tồn tại, nhưng không đáng kể. Và đúng ra phải như vậy: nếu hai mô hình bất đồng trên một cấu kiện mảnh, hãy kiểm tra mô hình phần tử hữu hạn trước, đặc biệt là lưới."
    },
    {
      "k": "note",
      "t": "Khóa cắt (shear locking) là một ví dụ kinh điển về phần tử bị hỏng. Một phần tử tứ giác tấm dày được lập công thức ngây thơ trở nên cứng hơn nhiều so với mức cần có khi tấm mỏng, và sàn ứng xử như thể nó dày hơn. Phần tử MITC4 trong Stabileo tồn tại để ngăn điều này: nó nội suy các biến dạng cắt theo cách khác, nên phần tử không bị khóa."
    },
    {
      "k": "link",
      "slug": "torsion-bredt-saint-venant",
      "t": "Chọn lý thuyết theo chiều dày, và chọn sai thì phải trả giá gì, là cùng câu hỏi mà xoắn đặt ra:"
    },
    {
      "k": "h",
      "t": "Cả hai mô hình trong một chương trình"
    },
    {
      "k": "p",
      "t": "Có phần tử khung và vỏ trong cùng một chương trình không có gì mới. SAP2000, ETABS, Robot và midas kết hợp cả hai trong một mô hình, và đó là mức nền của phần mềm chuyên nghiệp. Nhưng chúng không được xây dựng để giải thích những gì chúng tính. Ở đầu bên kia, các công cụ giảng dạy như Ftool và MASTAN2 dạy phân tích khung rất tốt nhưng dừng lại trước phần tử hữu hạn."
    },
    {
      "k": "p",
      "t": "Stabileo có cả hai chế độ trong một chương trình. Chế độ Basic giải bằng phần tử khung và đi qua phương pháp độ cứng trong chín bước: đánh số bậc tự do, ma trận cục bộ, chuyển đổi, ghép nối, vectơ tải, điều kiện biên, nghiệm, phản lực và nội lực. Chế độ PRO giải bằng phần tử hữu hạn, dùng vỏ MITC4 và tấm DKT cùng với phần tử khung. Trong các công cụ đã xem, chúng tôi không tìm thấy chương trình nào khác cho phép bạn học cách phân tích hoạt động rồi áp dụng nó cho một mô hình đầy đủ hơn mà không phải đổi công cụ."
    },
    {
      "k": "img",
      "base": "blog/deep-beam-shell",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO, không gian Phân tích, với dầm 6 m cao 2 m được mô hình hóa như một vách phần tử vỏ và đã giải. Bảng kết quả liệt kê 225 chuyển vị và 192 ứng suất vỏ; trong mục Kiểm tra kết quả, nó ước tính sai số rời rạc hóa khoảng 11 % theo chuẩn năng lượng và yêu cầu làm mịn lưới hoặc chạy kiểm tra hội tụ trước khi dùng kết quả.",
      "caption": "Mô hình vỏ bên dưới, đã giải: ứng dụng tự ước tính sai số lưới của nó và cho biết khi nào lưới quá thô để tin cậy."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-bar",
      "label": "Dầm L/h = 3 ở chế độ Basic: nhịp 6 m, tiết diện 20×200 cm và 10 kN/m, mô hình hóa bằng hai phần tử khung. Di chuột lên giữa dầm và nó hiện “uz: -0.042 mm”, khớp với công thức Euler-Bernoulli."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-shell",
      "mode": "pro",
      "label": "Cùng dầm đó ở chế độ PRO, mô hình hóa như một vỏ với 192 phần tử MITC4 cỡ 25 cm. Trong Phân tích → Chuyển vị, nút 113 (giữa nhịp, ở giữa chiều cao) cho “-5.19e-5” m, tức 0,0519 mm. Bảng trên dùng lưới mịn hơn và cho 0,0521 mm."
    },
    {
      "k": "link",
      "slug": "conceptual-side-advanced-tools",
      "t": "Các công cụ miễn phí giải thích và không giải thích điều gì, từng công cụ một:"
    },
    {
      "k": "h",
      "t": "Tóm lại"
    },
    {
      "k": "ol",
      "items": [
        "Với một cấu kiện lăng trụ, phương pháp độ cứng là trường hợp riêng chính xác của phần tử hữu hạn. Điều bạn đang chọn là mô hình.",
        "Một cấu kiện thẳng không cần chia lưới. Nếu việc chia nhỏ làm thay đổi kết quả, có điều gì khác đang sai.",
        "Dưới L/h ≈ 5, mô hình khung đánh giá độ võng thấp hơn hơn 8%, và dưới 3 thì hơn 19%. Nó luôn làm dầm cứng hơn.",
        "Trong kết cấu siêu tĩnh, sai số đó làm thay đổi cách phân phối tải. Hãy kiểm tra các vách thấp trước dầm.",
        "Sàn phẳng, vách có lỗ mở và tải gần gối tựa đặt ra những câu hỏi mà mô hình khung không trả lời được.",
        "Nơi cấu kiện mảnh, hai mô hình phải khớp nhau. Nếu không, hãy kiểm tra lưới."
      ]
    },
    {
      "k": "note",
      "t": "Cách các con số được tính: tất cả đều đến từ động cơ của Stabileo, chính động cơ mà ứng dụng dùng. Phần tử khung: Euler-Bernoulli, với gối tựa trên trục. Vỏ: MITC4 trong mặt phẳng của dầm, với 24 phần tử theo chiều cao (16 làm thay đổi chữ số thứ tư), tải trên mép trên và các gối tựa phân bố trên toàn chiều cao của các tiết diện đầu. Vách: cùng công thức, với chân ngàm dọc toàn bộ chiều dài và tải ngang phân bố dọc đỉnh. Số hạng cắt và nghiệm đàn hồi phẳng là các dạng đóng bạn có thể kiểm tra bằng tay."
    }
  ]
};

export default body;
