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

        // Sử dụng model ổn định. Có thể cân nhắc dùng model pro nếu cần độ chính xác cao hơn nữa.
        const model = "gemini-2.5-flash"; // Hoặc gemini-1.5-pro nếu có quota
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

        // Tạo prompt tối ưu cho việc trích xuất chính xác
        const prompt = `Bạn là một công cụ trích xuất thông tin chính xác tuyệt đối. Nhiệm vụ của bạn là trích xuất câu trả lời cho câu hỏi của người dùng CHỈ từ trong VĂN BẢN NGUỒN được cung cấp.

        **QUY TẮC BẮT BUỘC PHẢI TUÂN THEO TUYỆT ĐỐI (KHÔNG ĐƯỢC PHÉP SAI LỆCH):**
        1.  **NGUỒN DỮ LIỆU DUY NHẤT:** Chỉ được phép sử dụng thông tin có trong phần "VĂN BẢN NGUỒN". TUYỆT ĐỐI KHÔNG sử dụng kiến thức bên ngoài, không suy diễn, không thêm thắt thông tin.
        2.  **TRÍCH DẪN CHÍNH XÁC:** Câu trả lời phải bám sát câu chữ trong văn bản gốc. Không viết lại (paraphrase) nếu không cần thiết.
        3.  **XỬ LÝ KHI KHÔNG TÌM THẤY:** Nếu thông tin không có trong văn bản nguồn, BẮT BUỘC trả lời chính xác câu: "Mời Sư huynh tra cứu thêm tại mục lục tổng quan : https://mucluc.pmtl.site ." (Giữ nguyên dấu câu và khoảng trắng). Không giải thích thêm.
        4.  **XƯNG HÔ:** Bạn tự xưng là "đệ" và gọi người hỏi là "Sư huynh".
        5.  **CHUYỂN ĐỔI NGÔI KỂ:** Nếu văn bản gốc dùng các từ như "con", "các con", "trò", "đệ" để chỉ người nghe/người thực hiện, hãy chuyển đổi thành "Sư huynh" cho phù hợp ngữ cảnh đối thoại. Ví dụ: "Con hãy niệm..." -> "Sư huynh hãy niệm...".
        6.  **XỬ LÝ LINK:** Trả về URL dưới dạng văn bản thuần túy, KHÔNG dùng Markdown link (ví dụ: [tên](url)).

        --- VĂN BẢN NGUỒN BẮT ĐẦU ---
        ${context}
        --- VĂN BẢN NGUỒN KẾT THÚC ---
        
        Câu hỏi của người dùng: ${question}
        
        Câu trả lời của bạn (Chính xác và tuân thủ mọi quy tắc trên):`;

        // Cấu hình an toàn để tránh việc chặn nội dung không cần thiết trong ngữ cảnh tôn giáo/tâm linh
        const safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ];
        
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            safetySettings: safetySettings,
            generationConfig: {
                // THIẾT LẬP QUAN TRỌNG CHO ĐỘ CHÍNH XÁC CAO
                temperature: 0,      // Loại bỏ tính sáng tạo/ngẫu nhiên
                topK: 1,             // Chỉ chọn token có xác suất cao nhất
                topP: 0,             // Giới hạn tập hợp token (kết hợp với topK=1 để deterministic nhất có thể)
                maxOutputTokens: 2048,
            }
        };

        // Gửi yêu cầu đến Google Gemini API bằng axios
        const response = await axios.post(apiUrl, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        let aiResponse = "";
        
        // Kiểm tra an toàn dữ liệu trả về
        if (response.data.candidates && response.data.candidates.length > 0) {
            aiResponse = response.data.candidates[0].content?.parts[0]?.text || "";
        } else {
            console.log("API Response không có candidates:", JSON.stringify(response.data));
            aiResponse = "Hiện tại đệ chưa thể xử lý câu hỏi này do vấn đề kỹ thuật...";
        }

        // Định dạng câu trả lời
        const openFrame = "<b>Phụng Sự Viên Ảo Chân Tâm Trả Lời :</b>\n\n";
        const closeFrame = "\n\n<i>Nhắc nhở: AI có thể mắc sai sót. Sư huynh nhớ kiểm tra lại tại: https://tkt.pmtl.site nhé 🙏</i>";

        let finalAnswer = "";

        // Kiểm tra xem câu trả lời có chứa link mục lục (dấu hiệu không tìm thấy) hay không
        // Sử dụng trim() để tránh lỗi do khoảng trắng thừa
        if (aiResponse.includes("mucluc.pmtl.site") || aiResponse.trim() === "") {
             // Nếu không tìm thấy hoặc AI trả về rỗng -> Trả về câu mặc định
             if (aiResponse.trim() === "") {
                 finalAnswer = "Mời Sư huynh tra cứu thêm tại mục lục tổng quan : https://mucluc.pmtl.site .";
             } else {
                 finalAnswer = aiResponse;
             }
        } else {
            // Nếu tìm thấy -> Đóng khung trang trọng
            finalAnswer = openFrame + aiResponse + closeFrame;
        }

        res.json({ answer: finalAnswer });

    } catch (error) {
        console.error('Lỗi khi gọi Google Gemini API:', error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: 'Sư huynh chờ đệ một xíu nhé ! đệ đang hơi quá tải ạ 🙏.' 
        });
    }
});

// --- 6. Khởi động máy chủ ---
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
