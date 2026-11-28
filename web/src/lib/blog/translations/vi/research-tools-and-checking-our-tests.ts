import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Nghiên cứu, công cụ và kiểm tra các phép thử của chúng tôi",
  "excerpt": "Những gì chúng tôi đã phát hành trong vài ngày qua: nghiên cứu chạy được, tám máy tính và các kiểm tra trên chính các mô hình chuẩn. Điều gì đang hoạt động, điều gì đã sai và điều gì còn cần rà soát.",
  "blocks": [
    {
      "k": "p",
      "t": "Trong vài ngày qua, chúng tôi đã thêm Stabileo Research và Stabileo Tools, đồng thời siết chặt các kiểm tra đằng sau chúng. Stabileo là phần mềm kỹ thuật kết cấu miễn phí, mã nguồn mở, có AI, do Ergodic Group phát hành. LambdaClass là nhánh phát triển của nó."
    },
    {
      "k": "h",
      "t": "Nghiên cứu bạn có thể chạy"
    },
    {
      "k": "p",
      "t": "Chúng tôi đưa các bài báo kỹ thuật kết cấu đã công bố và các bài toán chuẩn kinh điển lên trình duyệt, với trình xem riêng của Stabileo. Mỗi trang nêu rõ nó tái tạo điều gì, đã được kiểm tra ra sao và các giới hạn của phép so sánh. Chúng tôi đang hoàn thiện những trang còn hiển thị các so sánh chưa xong."
    },
    {
      "k": "img",
      "base": "blog/research",
      "w": 1600,
      "h": 1000,
      "alt": "Trang Stabileo Research, “Nghiên cứu về kỹ thuật kết cấu”, với ghi chú “Nghiên cứu, không phải công cụ thiết kế” và mục đầu tiên chạy được, khung Lee (1968), hiển thị cùng đường truyền tải trọng đã vẽ.",
      "caption": "stabileo.com/research: mỗi trang nêu rõ nó tái tạo điều gì và đã được kiểm tra ra sao."
    },
    {
      "k": "p",
      "t": "Các trang bài báo đang hoạt động gồm: Shauer (2025) về nứt gãy theo trường pha; Grossman và Boudaoud (2026) về mạng lò xo; Andreassen và cộng sự (2011) về tối ưu hóa topo; Ferrari và Sigmund (2025) về ổn định khung Roorda; Pastrana và cộng sự (2026) về tìm dạng lưới cáp; Zmyślony, Khan và Biggins (2026) về vòm bật; và Fairclough và cộng sự (2026) về gridshell."
    },
    {
      "k": "p",
      "t": "Các bài toán kinh điển của bộ máy tính toán gồm MacNeal–Harder, bài kiểm tra vượt chướng ngại cho vỏ, đường đàn hồi Mattiasson, Riks/Crisfield, Newmark, CQC, phá hoại dẻo, tấm Navier, khung Lee và vòm DaDeppo–Schmidt. Các trang phân biệt tính toán trực tiếp với phát lại đã ghi và nêu các giới hạn so sánh của chúng. Phép so sánh Koiter của Ferrari chưa xong; Fairclough bao quát một ví dụ năm nút; bước nhảy cân bằng của vòm bật không phải là mô phỏng quá độ."
    },
    {
      "k": "p",
      "t": "Chúng tôi công bố phạm vi và bằng chứng và rà soát chúng công khai. Kết quả nghiên cứu không phải là kết quả thiết kế, và sự trùng khớp với bài toán chuẩn không phải là chứng nhận."
    },
    {
      "k": "table",
      "caption": "Đang hoạt động hôm nay:",
      "head": [
        "Hạng mục",
        "Số lượng"
      ],
      "rows": [
        [
          "Trang bài báo chạy được",
          "7"
        ],
        [
          "Trang bài toán chuẩn của bộ máy tính toán",
          "10"
        ],
        [
          "Máy tính",
          "8"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Các phép thử cũng cần được kiểm tra"
    },
    {
      "k": "p",
      "t": "Một số trang sai vì các mô hình thử của chúng tôi sai. Mỗi trang bài toán chuẩn của bộ máy tính toán và phép thử CI tương ứng nay đọc cùng một tệp trường hợp, nên sửa một mô hình thì cập nhật cả hai. Một số so sánh tạm thời vẫn bị bỏ qua một cách tường minh trong CI và chưa chặn việc hợp nhất; chúng tôi đang hoàn thiện các so sánh đó."
    },
    {
      "k": "p",
      "t": "Chúng tôi đã sửa các tham chiếu Mattiasson và cách xử lý biến dạng dọc trục (#845), một khung liên kết cứng bị so sánh với công thức giàn chỉ chịu lực dọc (#846), và các mô hình gối tựa và tải trọng của vỏ không đúng (#810). Chúng tôi đang thay đổi cách xây dựng các bài toán chuẩn để loại sai sót này không thể lọt qua nữa. Phần đầu đã xong: mỗi bài toán chuẩn là một đặc tả với hai tham chiếu độc lập phải trùng nhau, cùng các kiểm tra tự động về tải trọng đặt vào, cân bằng phản lực và đối xứng, kể cả mô hình nửa so với mô hình đầy đủ. Chúng tôi đang bổ sung sự hội tụ trên ba lưới trở lên, một phép thử sai dấu chứng tỏ mỗi bài toán chuẩn đều có thể thất bại, và sự xác nhận của kỹ sư đối với bộ cốt lõi."
    },
    {
      "k": "img",
      "base": "blog/research-mattiasson",
      "w": 1600,
      "h": 1000,
      "alt": "Trang bài toán chuẩn đường đàn hồi công xôn của Mattiasson (1981), thẻ Kết quả: đồ thị u/L và v/L theo PL²/EI với các đường cong của Stabileo và các vòng tròn cho các tham chiếu giải tích, cùng bảng các giá trị kèm sai số tương đối. Ở bên trái, “5 trên 5 kiểm tra đạt” và “Nghiên cứu, không phải công cụ thiết kế”.",
      "caption": "Trang Mattiasson sau khi sửa: đáp ứng của bộ máy tính toán so với hai tham chiếu giải tích độc lập."
    },
    {
      "k": "p",
      "t": "Chúng tôi cũng đang đưa đơn vị vào hệ thống kiểu (#864), để các nhầm lẫn kN/N hay m/mm bị bắt ngay khi biên dịch. Phần đầu tiên, cho đường vật liệu và tiết diện của khung 2D, đã được đưa vào ngày 3 tháng 11."
    },
    {
      "k": "h",
      "t": "Vòng 2: rà soát lại mọi trang"
    },
    {
      "k": "p",
      "t": "Mỗi trang nghiên cứu đang hoạt động sau đó trải qua đợt rà soát thứ hai, do ba mô hình AI lần lượt thực hiện (Kimi, rồi Codex, rồi Claude), và mọi phát hiện chúng tôi xác minh được đều đã được sửa. Mười lăm trang được chỉnh sửa cùng lúc và công bố ngày 4 tháng 11 (#1068): sáu bài báo (Shauer, Pastrana, Ferrari, Zmyślony, Grossman và Fairclough) và chín bài toán chuẩn của bộ máy tính toán (Newmark, Riks/Crisfield, Navier, Lee, MacNeal–Harder, DaDeppo–Schmidt, ví dụ phá hoại dẻo theo Horne, SRSS/CQC, và Mattiasson, vốn có vòng thứ ba). Không dung sai nào được nới lỏng và không phép thử nào bị gỡ bỏ. Việc rà soát bởi các kỹ sư hành nghề vẫn còn ở phía trước."
    },
    {
      "k": "ul",
      "items": [
        "MacNeal–Harder so sánh giá trị tuyệt đối, nên một kết quả sai dấu vẫn có thể đạt. Các tham chiếu nay mang theo dấu, và một phép thử loại bỏ đáp ứng bị đảo dấu ở mọi trường hợp.",
        "Riks/Crisfield có thể báo một điểm giới hạn mà không có sự sụt tải. Nay một giới hạn cần có sự sụt đó giữa các bước đã hội tụ; trang ghi rằng lần chạy vượt qua điểm giới hạn trên thay vì “vẽ được hiện tượng bật ngược”, và các dung sai của nó giảm từ 5 % xuống khoảng giữa 5e-3 và 1e-5.",
        "Navier giải thích sai số MITC4 thay vì đo nó. Nay nó được so sánh với một chuỗi Reissner–Mindlin độc lập, và sai số MITC4 với gối tựa cứng giảm từ −1,951 % ở lưới 4×4 xuống −0,036 % ở lưới 32×32, theo bậc hai.",
        "Các trang nêu rõ chúng được so sánh với cái gì. Newmark được kiểm tra với các nghiệm dạng đóng chính xác, không phải “mã của tác giả”; SRSS/CQC là một minh họa phương pháp, không phải tái tạo tòa nhà của bài báo; các cận phá hoại dẻo là các suy dẫn tay của chính chúng tôi, không phải trích dẫn; giá trị tham chiếu 1,83 kN của khung Lee là kết quả đọc từ một hình đã công bố, nên chỉ khẳng định các chênh lệch cỡ phần trăm nguyên."
      ]
    },
    {
      "k": "h",
      "t": "Trên điện thoại và máy tính bảng"
    },
    {
      "k": "p",
      "t": "Đo trên trang đang chạy, các trang nghiên cứu không bị tràn trên điện thoại, nhưng phần thí nghiệm nằm dưới toàn bộ bài viết, trình xem bị chật (356×189 px cho một tấm vuông), và mỗi trang có 25 đến 40 nút điều khiển dưới 32 px và 14 đến 20 đoạn chữ dưới 12 px. Nay phần thí nghiệm nằm ngay sau tiêu đề, trình xem được định cỡ theo mô hình, các nút điều khiển tối thiểu 44 px và chữ tối thiểu 12 px (#831)."
    },
    {
      "k": "img",
      "base": "blog/research-phone",
      "w": 1600,
      "h": 1000,
      "alt": "Hai ảnh chụp màn hình điện thoại của Stabileo Research đặt cạnh nhau, rộng 390 px. Bên trái là trang lưới cáp theo Pastrana và cộng sự (2026), “Bốn sợi cáp, một cân bằng”, với trình xem ngay dưới tiêu đề; bên phải là bài toán chuẩn tấm Navier, có trình xem rộng bằng chiều ngang màn hình và hiển thị chuyển vị xuống của tấm.",
      "caption": "Nghiên cứu trên điện thoại: phần thí nghiệm sau tiêu đề, và trình xem rộng bằng màn hình."
    },
    {
      "k": "p",
      "t": "Một phép kiểm tra thường trực dựng thư viện và mọi trang chạy được ở 360, 390, 844×390 và 810 px, bằng tiếng Tây Ban Nha, Anh và Bồ Đào Nha, và thất bại khi có tràn ngang, nút điều khiển nhỏ, chữ nhỏ, hoặc trình xem bị thiếu, quá nhỏ hoặc quá thấp. Những lần chạy đầu tiên đã tìm ra các lỗi thực sự, và bố cục được sửa chứ không sửa phép kiểm tra: trình xem Mattiasson cao 187 px khi điện thoại nằm ngang và nay là 280 px, và một đồ thị hội tụ in nhãn ở cỡ 9 px. Một phép thử bố cục lại phát hiện các thẻ của Shauer bị tràn bằng tiếng Bồ Đào Nha và Thổ Nhĩ Kỳ ở 360 px."
    },
    {
      "k": "h",
      "t": "Tám máy tính, kèm đường vào trình soạn thảo"
    },
    {
      "k": "p",
      "t": "Stabileo Tools nay có các máy tính miễn phí cho dầm đơn giản, công xôn, mất ổn định đàn hồi của cột, dầm liên tục, khung cổng một nhịp, giàn phẳng, đường ảnh hưởng của tải trọng di động và tần số uốn của dầm. Chúng dùng bộ máy tính toán của bản chính thức, đưa ra các so sánh cổ điển độc lập và nêu các giả thiết của mình. Mỗi máy tính mở mô hình của nó trong trình soạn thảo đầy đủ. Đây là các công cụ phân tích, không phải các kiểm tra thiết kế theo tiêu chuẩn đầy đủ."
    },
    {
      "k": "img",
      "base": "blog/tools",
      "w": 1600,
      "h": 1000,
      "alt": "Trang Stabileo Tools, “Máy tính kỹ thuật miễn phí”, mở đầu bằng máy tính dầm đơn giản: một dầm chịu tải trọng phân bố cùng hình dạng biến dạng của nó và một nút Mở.",
      "caption": "stabileo.com/tools: tám máy tính trên bộ máy tính toán của bản chính thức."
    },
    {
      "k": "h",
      "t": "Ngăn chặn các kết quả sai"
    },
    {
      "k": "p",
      "t": "Chúng tôi đang ngăn chặn mọi vấn đề kết quả sai đã biết: các từ chối hoặc cảnh báo trong bộ máy tính toán mang mã của lỗi đã biết, thay vì trả về một con số chưa được kiểm tra (#807, đã hợp nhất ngày 5 tháng 11). Mọi từ chối đều được kiểm thử, kể cả các mô hình dao động không được hỗ trợ có độ lệch đầu thanh hoặc vỏ."
    },
    {
      "k": "p",
      "t": "Các phép thử biến hình (metamorphic) đã phát hiện các lỗi bất biến: các mô hình tương đương có thể bị từ chối sau khi xoay, đối xứng hoặc đổi tỷ lệ đơn vị. Nay chúng tôi chạy bộ phép thử biến hình ở mọi thay đổi để bắt các hồi quy này. Chúng tôi đang thêm một lần chạy hằng đêm với các mô hình ngẫu nhiên, gom các phát hiện theo nguyên nhân gốc và mở một vấn đề cho mỗi nguyên nhân gốc."
    },
    {
      "k": "h",
      "t": "Từ đó đến nay: 1 đến 3 tháng 11"
    },
    {
      "k": "ul",
      "items": [
        "Chế độ phân tích của PRO đã hoàn thiện. Các kết quả từng sai mà không có cảnh báo đã được sửa: bộ tạo tải trọng không còn tính mép mái của nhà xưởng như một sàn, và trọng lượng động đất của một cao độ nay bao gồm các sàn và tường vẽ dưới dạng vỏ, vốn trước đây bị bỏ sót (#1076).",
        "Việc xuất hoạt động được trên các công trình thật. Các trang tính lớn của Excel được ghi từng hàng một, và báo cáo của một tòa nhà sáu tầng mất khoảng mười giây thay vì bốn phút. “Kiểm tra một báo cáo đã xuất” nay so sánh các con số được in, không chỉ các dấu vân tay (#1076).",
        "PRO có thêm phần trợ giúp tại chỗ có thể tắt, trạng thái lưu trên đầu trang, báo cáo sau khi phân tích, kết quả tấm và một trình xem chỉ đọc cho các mô hình được chia sẻ với “Nhân bản và chỉnh sửa” (#1077, #1078).",
        "Một hệ số mất ổn định vượt cận trên đã được chứng nhận độc lập nay bị từ chối, trong 2D và 3D (#817, phiên bản kết quả 6). Hãy chạy lại việc chứng nhận trước khi dựa vào một chứng nhận mất ổn định trước đó.",
        "Các liên kết chia sẻ có số không hữu hạn, hoặc có thanh, gối tựa hay tải trọng trỏ tới thứ không tồn tại, nay bị từ chối thay vì được mở (#1058).",
        "Bộ phép thử bất biến nay kiểm tra sáu phân tích ưu tiên dưới phép xoay, đối xứng và chồng chất, và bốn trong số đó dưới phép đổi tỷ lệ độ cứng đồng đều (#1060)."
      ]
    },
    {
      "k": "h",
      "t": "Các kiểm tra trả lời trong hai mươi phút"
    },
    {
      "k": "p",
      "t": "Trước khi vào main, mọi thay đổi của Stabileo đều qua các kiểm tra mà nó có thể ảnh hưởng, và một thay đổi ở bộ máy tính toán qua tất cả: phép thử bộ máy tính toán, phép thử đơn vị của web, bản dựng sản xuất, phép thử đầu cuối trong trình duyệt, các ảnh chụp kết quả và kiểm tra tính tất định. Một bản sửa an toàn chỉ nhanh bằng những kiểm tra đó, nên ngày 4 tháng 11 chúng tôi làm việc về tốc độ của chúng. Chúng tôi đo trước. Trong một lần chạy hàng đợi hợp nhất sạch kéo dài 44 đến 47 phút, các phép thử bộ máy tính toán và đơn vị xong sớm hơn lúc kết thúc 8 đến 15 phút, nên thêm nhiều phép thử chạy song song nữa sẽ chẳng được gì. Thời gian đã mất vào việc dựng các gói nghiên cứu lần lượt từng gói một, và vào shard đầu cuối chậm nhất. Khi những phần đó ngắn lại, shard chậm nhất chậm là do khâu thiết lập: trong một lần chạy, nó dùng 7,2 trong 16 phút cho các phép thử và sáu phút rưỡi để tải các gói trình duyệt từ một máy chủ gương chậm."
    },
    {
      "k": "ul",
      "items": [
        "Dựng một lần, thử những gì đã dựng. Các phép thử bản dựng sản xuất đã tự dựng thêm năm bản nữa, bốn trong số đó từ cùng cây mã mà CI vừa dựng; nay bốn bản đó đọc bản dựng ấy (#1411). Mỗi bản dựng mang một dấu của mọi thứ dùng để dựng nó, và một phép thử sẽ thất bại, không bao giờ bỏ qua, nếu dấu không khớp với cây mã mà nó chạy trên đó.",
        "Lưu đệm theo đầu vào. Mỗi gói nghiên cứu được lưu đệm dưới một khóa gồm các đầu vào của chính nó, kể cả bộ máy tính toán mà mọi gói đều liên kết, nên thay đổi một bài báo chỉ dựng lại bài báo đó và thay đổi bộ máy tính toán dựng lại tất cả. Một pull request dùng lại các gói mà hàng đợi hợp nhất đã dựng từ cùng các đầu vào, sau khi kiểm tra từng tệp với checksum của nó, và có thể đọc bộ đệm đó nhưng không bao giờ ghi vào (#1395). Các gói trình duyệt cũng đến từ một bộ đệm, thay vì từ máy chủ gương (#1413).",
        "Chỉ chạy những gì một thay đổi có thể ảnh hưởng. Thay đổi tài liệu không dựng gì cả, trong một hai phút thay vì cả một lượt chạy. Thay đổi riêng của trang web bỏ qua các tác vụ của bộ máy tính toán nhưng giữ mọi shard đầu cuối, vì 59 trong 281 đặc tả đọc văn bản trên màn hình (#1381). Trong hàng đợi, mỗi mục được giới hạn phạm vi theo diff riêng của nó so với mục đứng trước, điều này hợp lý vì một mục chỉ được hợp nhất nếu mọi mục đứng trước đều đạt; khi diff bị thiếu hoặc không rõ, nó chạy tất cả (#1400).",
        "Cân bằng đường chậm nhất. Các phép thử đầu cuối chạy trong 14 shard thay vì 10, cân bằng theo thời gian đã đo (#1382). Bảng thời gian cũ dự đoán 41,5 phút cho các phép thử trong khi một lần chạy mất 69,8."
      ]
    },
    {
      "k": "table",
      "caption": "Thời gian thực của các lần chạy CI thành công đã chạy mọi tác vụ, từ lúc tạo đến tác vụ cuối, đo bằng API của GitHub Actions. Trước: ngày 4 tháng 11, từ 08:00 UTC (pull request) hoặc 13:48 UTC (hàng đợi hợp nhất) đến 21:10 UTC; sau: từ 21:15 UTC đến 03:00 UTC ngày 5 tháng 11.",
      "head": [
        "Lần chạy",
        "Số lượng",
        "Trung vị",
        "Khoảng"
      ],
      "rows": [
        [
          "Hàng đợi hợp nhất, trước",
          "20",
          "42 phút",
          "25 đến 56 phút"
        ],
        [
          "Hàng đợi hợp nhất, sau",
          "10",
          "20 phút",
          "15 đến 26 phút"
        ],
        [
          "Pull request (lần thử đầu), trước",
          "69",
          "59 phút",
          "35 đến 127 phút"
        ],
        [
          "Pull request (lần thử đầu), sau",
          "19",
          "27 phút",
          "16 đến 45 phút"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Một kiểm tra đỏ không phải do lỗi của thay đổi"
    },
    {
      "k": "p",
      "t": "Một lỗi do mạng hoặc do một máy bị mất là nhiễu, nhưng nó cũng là một kiểm tra đỏ mà ai đó phải xem, và thói quen chạy lại các kiểm tra đỏ là cách một lỗi thật bị cho qua. Vì vậy các tác vụ thất bại của một pull request được chạy lại một lần, tự động, chỉ khi mọi tác vụ thất bại đều có bằng chứng rõ ràng của lỗi hạ tầng: hết thời gian ở bước tải xuống, một máy CI bị mất giữa chừng, một lỗi mạng kết thúc lần thử cuối của một lượt tải (#1380). Bất cứ điều gì trông như một lỗi phép thử ở bất kỳ đâu trong nhật ký sẽ chặn việc chạy lại, và bất cứ điều gì bộ phân loại không nhận ra cũng vậy. Điều đó giữ cho nó thận trọng: nó chạy lại nhiều nhất một lần và không bao giờ sau một bước thử bị thất bại. Đó không phải là một đảm bảo: một lỗi chập chờn mà bộ phân loại đọc nhầm là hạ tầng có thể đạt ở lần chạy lại, đó là lý do mọi thứ nó không nhận ra đều chặn việc chạy lại."
    },
    {
      "k": "p",
      "t": "Hai bản sửa nữa loại bỏ các báo động giả. Một lần chạy pull request bị hủy vì một lần chạy mới hơn trên cùng commit đã thay thế nó từng hiện một kiểm tra bắt buộc màu đỏ; nay nó bỏ qua kiểm tra đó, nhưng chỉ sau khi xác nhận rằng lần chạy mới hơn tồn tại và chưa thất bại, vì một kiểm tra bắt buộc bị bỏ qua được tính là đạt (#1397). Và một lượt tải bị đình trệ có thể để một tiến trình giữ khóa của trình quản lý gói, khiến lần thử lại thất bại vì khóa chứ không vì lượt tải; nay một lần thử chỉ được coi là đình trệ sau nhiều phút không có đầu ra, bị dừng cùng mọi thứ nó đã khởi chạy, và lần thử lại chờ khóa (#1408)."
    },
    {
      "k": "h",
      "t": "Tiếp theo là gì"
    },
    {
      "k": "p",
      "t": "Chúng tôi đang hoàn thiện các so sánh còn mở và làm cho trang web và bộ giải nhanh hơn. Tiếp theo trong lộ trình là một gói Python (pip install stabileo) và một sổ tay xác minh công khai được tạo từ các bài toán chuẩn."
    }
  ]
};

export default body;
