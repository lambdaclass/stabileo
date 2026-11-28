import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Giới thiệu Stabileo tại Hội nghị Kỹ thuật Kết cấu Argentina lần thứ 29",
  "excerpt": "Ngày 18 tháng 9, chúng tôi đã trình bày bài báo 86N tại Córdoba: một tác tử tính toán kết cấu đề xuất thay đổi và giao mọi con số cho một bộ giải đã được kiểm chứng. Những gì chúng tôi trình bày, vì sao phải giữ tác tử tách khỏi phép tính, và những gì chúng tôi mang về.",
  "blocks": [
    {
      "k": "p",
      "t": "Hội nghị Kỹ thuật Kết cấu Argentina lần thứ 29 (JAIE) diễn ra tại Córdoba từ ngày 16 đến 18 tháng 9, do Asociación de Ingenieros Estructurales tổ chức. Vào ngày cuối, chúng tôi đã trình bày bài báo 86N, “Phát triển một tác tử tính toán kết cấu trên bộ giải đã được kiểm chứng”, của Bautista Chesta, Raúl Bertero, Federico Carrone và Diego Kingston, ở nhánh về trí tuệ nhân tạo ứng dụng trong kỹ thuật xây dựng."
    },
    {
      "k": "photo",
      "src": "jaie-2026-talk",
      "w": 1600,
      "h": 1200,
      "alt": "Bautista Chesta phát biểu trước khán giả; trên màn hình là một khung bốn nhịp với một dầm được khoanh đỏ và tiêu đề “Kết cấu được tính lại”.",
      "caption": "Trình bày bài báo 86N. Trên màn hình là khoảnh khắc một dầm không còn đạt kiểm tra và toàn bộ mô hình được giải lại."
    },
    {
      "k": "h",
      "t": "Những gì chúng tôi đã trình bày"
    },
    {
      "k": "p",
      "t": "Bài báo dựa trên một quy tắc kiến trúc: tác tử AI diễn giải điều kỹ sư yêu cầu và đề xuất các hành động, nhưng mọi con số đều đến từ bộ giải và các mô-đun CIRSOC, mà tác tử không thể thay đổi. Chúng tôi gọi nó là ranh giới tất định."
    },
    {
      "k": "p",
      "t": "Trong buổi nói chuyện, chúng tôi trình bày nó trên một khung ngang bê tông cốt thép không đạt kiểm tra. Tác tử đề xuất một dầm cao hơn, bộ giải giải lại toàn bộ mô hình, và kiểm tra CIRSOC 201 được tính lại trên kết cấu mới: tỷ số nhu cầu/khả năng giảm từ 1,10 xuống 0,97. Bài báo tái lập phép kiểm tra đó bằng tay, từng bước."
    },
    {
      "k": "p",
      "t": "Trường hợp thứ hai là một tòa nhà bốn nhịp, ba tầng bị bỏ một cột. Một số dầm không còn đạt, tiết diện của chúng được đổi kích thước và mọi cấu kiện lại đạt, với bộ giải giải toàn bộ mô hình ở mỗi bước."
    },
    {
      "k": "h",
      "t": "Vì sao cần ranh giới"
    },
    {
      "k": "p",
      "t": "Để chứng minh, chúng tôi đưa cho các trợ lý AI đa dụng cùng một yêu cầu chọn sơ bộ kích thước mười lăm lần. Chúng trả về bảy tiết diện khác nhau. Điều đáng nói nhất: mười một lần thống nhất về mô men thiết kế mà vẫn đề xuất sáu tiết diện khác nhau."
    },
    {
      "k": "table",
      "caption": "Cùng một yêu cầu chọn sơ bộ kích thước, lặp lại, và khung ngang được hiệu chỉnh bằng bộ giải.",
      "head": [
        "Điều gì",
        "Giá trị"
      ],
      "rows": [
        [
          "Số lần chạy cùng một yêu cầu",
          "15"
        ],
        [
          "Số tiết diện khác nhau được trả về",
          "7"
        ],
        [
          "Tỷ số diện tích lớn nhất trên nhỏ nhất",
          "1.80"
        ],
        [
          "Số lần chạy thống nhất Mu = 207 kN·m",
          "11"
        ],
        [
          "Số tiết diện khác nhau trong các lần chạy đó",
          "6"
        ],
        [
          "D/C của khung ngang trước khi hiệu chỉnh",
          "1.10"
        ],
        [
          "D/C của khung ngang sau khi hiệu chỉnh",
          "0.97"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Có bộ giải phía sau, cùng một mô hình luôn cho cùng một con số, và con số đó có thể kiểm tra được. Đó là điều chúng tôi muốn một kỹ sư có thể tự tin ký."
    },
    {
      "k": "photo",
      "src": "jaie-2026-backdrop",
      "w": 1152,
      "h": 1320,
      "alt": "Diego Kingston và Bautista Chesta, đeo thẻ tác giả, đứng trước tường nhà tài trợ của hội nghị.",
      "caption": "Cùng Diego Kingston, đồng tác giả của bài báo, tại hội nghị."
    },
    {
      "k": "h",
      "t": "Những gì chúng tôi mang về"
    },
    {
      "k": "p",
      "t": "Chúng tôi trở về với các mối liên hệ trong giới kỹ sư kết cấu từ khắp cả nước và một lời mời tham gia mạng lưới kỹ sư kết cấu. Chúng tôi cũng đã trao đổi với các trường đại học ở Córdoba về việc dùng nó trong các khóa học của họ."
    },
    {
      "k": "p",
      "t": "Toàn văn bài báo có tại stabileo.com/paper, và Stabileo chạy ngay trong trình duyệt, không cần cài đặt."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Tóm tắt bài báo, với cả hai trường hợp và các con số của chúng:"
    }
  ]
};

export default body;
