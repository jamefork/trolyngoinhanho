// server.js

// --- 1. Import các thư viện cần thiết ---
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config(); // Tải các biến môi trường từ file .env

// --- 2. Khởi tạo ứng dụng Express ---
const app = express();
const PORT = process.env.PORT || 3001; // Sử dụng cổng do Render cung cấp hoặc 3001 khi chạy local

// --- 3. Cấu hình Middleware ---
// Kích hoạt CORS để cho phép frontend gọi tới
// Trong môi trường production, bạn nên chỉ định rõ domain của frontend
app.use(cors()); 
// Cho phép server đọc dữ liệu JSON từ request body
app.use(express.json({ limit: '10mb' }));

// --- ROUTE CHO HEALTH CHECK ---
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is up and running" });
});

// --- 4. Lấy API Key từ biến môi trường ---
// Đây là cách an toàn để quản lý API Key.
// Chúng ta sẽ thiết lập biến này trên Render sau.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- 5. Định nghĩa một Route (API Endpoint) ---
// Frontend sẽ gửi yêu cầu POST đến '/api/chat'
app.post('/api/chat', async (req, res) => {
    // Kiểm tra xem API key đã được cấu hình trên server chưa
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ 
            error: 'GEMINI_API_KEY chưa được cấu hình trên server.' 
        });
    }

    try {
        // Lấy câu hỏi và context từ body của request mà frontend gửi lên
        const { question, context } = req.body;

        if (!question || !context) {
            return res.status(400).json({ 
                error: 'Vui lòng cung cấp đủ "question" và "context".' 
            });
        }

        const model = "gemini-2.5-flash-lite";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

        // Tạo prompt nâng cao: Kích hoạt tư duy ngữ nghĩa nhưng khóa chặt nguồn dữ liệu
        const prompt = `Bạn là "Phụng Sự Viên Ảo" của Pháp Môn Tâm Linh. Bạn là một trợ lý tận tâm, giọng điệu từ bi, nhẹ nhàng, khiêm cung (xưng "Đệ", gọi người dùng là "Sư huynh").

        NHIỆM VỤ: Trả lời câu hỏi dựa trên VĂN BẢN NGUỒN.

        *** QUY TRÌNH TƯ DUY (BẮT BUỘC THỰC HIỆN TRONG ĐẦU) ***
        1.  **Phân tích ý định:** Đừng chỉ bắt từ khóa bề mặt. Hãy hiểu ý nghĩa sâu xa. 
            - Nếu hỏi "nhập môn", "mới toanh", "chưa biết gì" -> Hãy tìm thông tin về "người mới bắt đầu", "căn bản".
            - Nếu hỏi "đen đủi", "xui xẻo" -> Hãy tìm thông tin về "tiêu tai", "nghiệp chướng".
            - Nếu hỏi "bệnh tật", "đau ốm" -> Hãy tìm thông tin về "chữa bệnh", "nguyện cầu sức khỏe".
        2.  **Đối chiếu:** Dùng ý định đã hiểu để quét trong VĂN BẢN NGUỒN. Chỉ khi nội dung trong văn bản khớp với ý định thì mới được dùng.
            - Chỉ trả lời khi thông tin có bằng chứng xác thực trong văn bản.
            - Trình bày lại thông tin đó một cách dễ hiểu, giữ nguyên ý nghĩa gốc.

        *** CÁC QUY TẮC TỐI THƯỢNG ***
        1.  **NGUỒN DỮ LIỆU DUY NHẤT:** Mọi thông tin trong câu trả lời phải có bằng chứng cụ thể từ VĂN BẢN NGUỒN bên dưới. TUYỆT ĐỐI KHÔNG dùng kiến thức bên ngoài, không tự bịa đặt, không "chém gió".
        2.  **KHÔNG TÌM THẤY:** Nếu sau khi đã phân tích ý định mà vẫn không thấy thông tin trong văn bản, BẮT BUỘC trả lời đúng một câu: "Mời Sư huynh tra cứu thêm tại mục lục tổng quan : https://mucluc.pmtl.site".
        3.  **TRUNG THỰC:** Nếu văn bản nói A, hãy trả lời A. Không suy diễn A thành A+. 
        4.  **ĐỊNH DẠNG:** Trình bày thoáng, dễ đọc (dùng gạch đầu dòng). Giữ nguyên các đường link (URL) dưới dạng văn bản thuần túy, không bọc trong Markdown.

        --- VĂN BẢN NGUỒN (DỮ LIỆU TUYỆT ĐỐI) ---
        ${context}
        --- KẾT THÚC VĂN BẢN NGUỒN ---

        Câu hỏi của Sư huynh: "${question}"

        Câu trả lời của Đệ (Dựa trên văn bản nguồn):`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0,
                topK: 5,
                topP: 0.95,
                maxOutputTokens: 2048,
            }
        };

        // Gửi yêu cầu đến Google Gemini API bằng axios
        const response = await axios.post(apiUrl, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        // Trích xuất câu trả lời từ phản hồi của Google
        const answer = response.data.candidates[0]?.content?.parts[0]?.text || "Không nhận được câu trả lời hợp lệ từ AI.";
        
        // Gửi câu trả lời về lại cho frontend
        res.json({ answer });

    } catch (error) {
        console.error('Lỗi khi gọi Google Gemini API:', error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: 'Sư huynh chờ đệ một xíu nhé ! đệ đang hơi quá tải ạ 🙏' 
        });
    }
});

// --- 6. Khởi động máy chủ ---
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
