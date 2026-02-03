const express = require('express');
const multer = require('multer');
const session = require('express-session');
const mongoose = require('mongoose'); // Thêm mongoose
const path = require('path');
const fs = require('fs');
const app = express();

// --- KẾT NỐI MONGODB ATLAS ---
const MONGODB_URI = process.env.MONGODB_URI; 
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Atlas Connected'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- ĐỊNH NGHĨA SCHEMA (Thay thế cấu trúc data.json) ---
const MeetingSchema = new mongoose.Schema({
    meetingId: { type: String, required: true, unique: true },
    title: { type: String, default: "Cuộc họp mới" },
    time: String,
    location: String,
    members: String,
    files: [{
        name: String,
        path: String,
        category: String,
        realPath: String
    }]
});
const Meeting = mongoose.model('Meeting', MeetingSchema);

// --- CẤU HÌNH MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'nas-secret-key-123',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 }
}));

const auth = (req, res, next) => (req.session && req.session.isAdmin) ? next() : res.status(403).json({ error: 'Unauthorized' });

// --- API HỆ THỐNG ---

// Lấy danh sách tất cả cuộc họp cho trang Admin
app.get('/api/meetings', auth, async (req, res) => {
    try {
        const meetings = await Meeting.find({}).sort({ _id: -1 });
        res.json(meetings);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// API Tạo cuộc họp mới
app.post('/api/create-meeting', auth, async (req, res) => {
    try {
        const newID = Math.random().toString(36).substring(2, 8);
        const newMeeting = new Meeting({ meetingId: newID });
        await newMeeting.save();
        res.json({ success: true, id: newID });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Xóa toàn bộ cuộc họp
app.delete('/api/meeting/:id', auth, async (req, res) => {
    try {
        await Meeting.findOneAndDelete({ meetingId: req.params.id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// API lấy dữ liệu 1 cuộc họp theo ID
app.get('/api/data/:id', async (req, res) => {
    const meeting = await Meeting.findOne({ meetingId: req.params.id });
    meeting ? res.json(meeting) : res.status(404).json({ error: "Không tìm thấy" });
});

// API cập nhật thông tin
app.post('/api/update-info/:id', auth, async (req, res) => {
    try {
        await Meeting.findOneAndUpdate({ meetingId: req.params.id }, req.body);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- PHẦN LOGIN/LOGOUT ---
app.post('/api/login', (req, res) => {
    if (req.body.password === 'admin123') {
        req.session.isAdmin = true;
        res.json({ success: true });
    } else res.status(401).json({ success: false });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

// --- PHỤC VỤ GIAO DIỆN (Tương thích Vercel) ---
app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/meeting/:id', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/index.html'));
});

app.get('/admin.html', (req, res) => {
    if (req.session && req.session.isAdmin) {
        res.sendFile(path.join(process.cwd(), 'public/admin.html'));
    } else {
        res.redirect('/login.html');
    }
});

// Lưu ý: Upload file trên Vercel chỉ là tạm thời (/tmp)
const upload = multer({ dest: '/tmp/' });
app.post('/api/upload/:id', auth, upload.single('file'), async (req, res) => {
    try {
        const fileInfo = {
            name: req.body.displayName || req.file.originalname,
            path: `/view-pdf/${req.file.filename}`,
            category: req.body.category,
            realPath: req.file.filename
        };
        await Meeting.findOneAndUpdate(
            { meetingId: req.params.id },
            { $push: { files: fileInfo } }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Export để Vercel chạy
module.exports = app;

// Chỉ chạy listen khi ở môi trường local
if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log('Server running at http://localhost:3000'));
}