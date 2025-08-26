const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// نماذج البيانات
const News = require('./models/News');
const User = require('./models/User');
const Comment = require('./models/Comment');

const app = express();

// 🔧 إعدادات مهمة لـ Render
const isProduction = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 10000;

// إنشاء مجلد views إذا لم يكن موجوداً
const viewsDir = path.join(__dirname, 'views');
if (!fs.existsSync(viewsDir)) {
  console.log('📁 Creating views directory...');
  fs.mkdirSync(viewsDir, { recursive: true });
}

// 🔥 يجب أن يكون إعداد view engine في البداية قبل أي routes
app.set('view engine', 'ejs');
app.set('views', viewsDir);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🔧 إعداد الجلسات (بدون connect-mongo)
app.use(session({
  secret: process.env.SESSION_SECRET || 'familysecret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 // 24 ساعة
  }
}));

// Multer لتخزين الصور
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'public/uploads/';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('يجب أن يكون الملف صورة!'), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ----- MongoDB -----
const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('❌ MONGO_URI غير مضبوط في البيئة');
    }

    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB متصل بنجاح');
  } catch (err) {
    console.error('❌ خطأ في الاتصال بMongoDB:', err.message);
    process.exit(1);
  }
};

// ----- Admin Authentication -----
function isAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.redirect('/admin/login');
}

// ----- Routes -----
// Admin login
app.get('/admin/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة التحكم - تسجيل الدخول</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            body { background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%); color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
            .login-container { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3); width: 100%; max-width: 400px; }
            .header { text-align: center; margin-bottom: 30px; }
            h1 { color: #fff; margin-bottom: 10px; font-size: 2rem; }
            .subtitle { color: #a0aec0; margin-bottom: 30px; }
            .form-group { margin-bottom: 20px; }
            label { display: block; margin-bottom: 8px; color: #e2e8f0; font-weight: 600; }
            input { width: 100%; padding: 15px; background: rgba(255, 255, 255, 0.1); border: 2px solid rgba(255, 255, 255, 0.2); border-radius: 10px; font-size: 1rem; color: #fff; transition: border-color 0.3s ease; }
            input:focus { outline: none; border-color: #63b3ed; }
            input::placeholder { color: #a0aec0; }
            button { width: 100%; background: #63b3ed; color: #1a202c; padding: 15px; border: none; border-radius: 10px; font-size: 1.1rem; font-weight: 600; cursor: pointer; transition: background 0.3s ease; }
            button:hover { background: #4299e1; }
            .back-link { display: block; text-align: center; margin-top: 25px; color: #a0aec0; }
            .back-link a { color: #63b3ed; text-decoration: none; }
            .back-link a:hover { text-decoration: underline; }
            .error { color: #fc8181; text-align: center; margin-bottom: 15px; }
            @media (max-width: 480px) { .login-container { padding: 30px 20px; } h1 { font-size: 1.7rem; } }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="header">
                <h1>لوحة التحكم</h1>
                <p class="subtitle">تسجيل الدخول للإدارة</p>
            </div>
            
            <form action="/admin/login" method="POST">
                <div class="form-group">
                    <label for="username">اسم المستخدم</label>
                    <input type="text" id="username" name="username" placeholder="أدخل اسم المستخدم" required>
                </div>
                
                <div class="form-group">
                    <label for="password">كلمة المرور</label>
                    <input type="password" id="password" name="password" placeholder="أدخل كلمة المرور" required>
                </div>
                
                <button type="submit">تسجيل الدخول</button>
            </form>
            
            <div class="back-link">
                <a href="/">← العودة إلى الموقع الرئيسي</a>
            </div>
        </div>
    </body>
    </html>
  `);
});

app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if(username === 'admin' && password === 'admin123'){
      req.session.admin = true;
      return res.redirect('/admin');
    }
    res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>لوحة التحكم - تسجيل الدخول</title>
          <style>body { font-family: Arial; padding: 50px; text-align: center; } .error { color: red; }</style>
      </head>
      <body>
          <div class="error">بيانات دخول غير صحيحة</div>
          <a href="/admin/login">العودة إلى صفحة التسجيل</a>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في تسجيل الدخول');
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

// Admin panel - عرض الأخبار
app.get('/admin', isAdmin, async (req, res) => {
  try {
    const news = await News.find().sort({ createdAt: -1 });
    res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>لوحة التحكم - أخبار العائلة</title>
          <style>
              * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
              body { background: #f7fafc; color: #2d3748; }
              .admin-header { background: #2d3748; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
              .admin-title { font-size: 1.5rem; }
              .admin-nav a { color: white; text-decoration: none; margin-left: 20px; padding: 8px 16px; border-radius: 20px; transition: background 0.3s ease; }
              .admin-nav a:hover { background: rgba(255, 255, 255, 0.1); }
              .logout-btn { background: #e53e3e; }
              .logout-btn:hover { background: #c53030; }
              .admin-container { max-width: 1200px; margin: 0 auto; padding: 20px; }
              .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
              .stat-card { background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); text-align: center; }
              .stat-number { font-size: 2.5rem; font-weight: bold; color: #4a5568; margin-bottom: 10px; }
              .stat-label { color: #718096; font-size: 1.1rem; }
              .news-list { background: white; border-radius: 15px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden; }
              .news-item { padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
              .news-item:last-child { border-bottom: none; }
              .news-info h3 { color: #2d3748; margin-bottom: 5px; }
              .news-meta { color: #718096; font-size: 0.9rem; }
              .news-actions { display: flex; gap: 10px; }
              .action-btn { padding: 8px 12px; border: none; border-radius: 6px; cursor: pointer; text-decoration: none; display: inline-block; font-size: 0.9rem; }
              .edit-btn { background: #3182ce; color: white; }
              .edit-btn:hover { background: #2c5282; }
              .delete-btn { background: #e53e3e; color: white; }
              .delete-btn:hover { background: #c53030; }
              .published-tag { background: #48bb78; color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; margin-right: 10px; }
              .draft-tag { background: #718096; color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; margin-right: 10px; }
              @media (max-width: 768px) { 
                  .admin-nav { display: flex; flex-direction: column; gap: 10px; }
                  .news-item { flex-direction: column; align-items: flex-start; gap: 15px; }
                  .news-actions { align-self: flex-end; }
              }
          </style>
      </head>
      <body>
          <div class="admin-header">
              <div class="admin-title">
                  <h1>لوحة تحكم أخبار العائلة</h1>
              </div>
              <div class="admin-nav">
                  <a href="/">الموقع الرئيسي</a>
                  <a href="/admin/logout" class="logout-btn">تسجيل الخروج</a>
              </div>
          </div>

          <div class="admin-container">
              <div class="stats-grid">
                  <div class="stat-card">
                      <div class="stat-number">${news.length}</div>
                      <div class="stat-label">إجمالي الأخبار</div>
                  </div>
                  <div class="stat-card">
                      <div class="stat-number">${news.filter(n => n.isPublished).length}</div>
                      <div class="stat-label">أخبار منشورة</div>
                  </div>
                  <div class="stat-card">
                      <div class="stat-number">${news.filter(n => !n.isPublished).length}</div>
                      <div class="stat-label">مسودات</div>
                  </div>
              </div>

              <div class="news-list">
                  <h2 style="padding: 20px; border-bottom: 1px solid #e2e8f0; margin: 0;">إدارة الأخبار</h2>
                  
                  ${news.length > 0 ? news.map(item => `
                      <div class="news-item">
                          <div class="news-info">
                              <h3>
                                  ${item.isPublished ? '<span class="published-tag">منشور</span>' : '<span class="draft-tag">مسودة</span>'}
                                  ${item.title}
                              </h3>
                              <div class="news-meta">
                                  ${item.category} | ${item.createdAt.toLocaleDateString('ar-EG')}
                              </div>
                          </div>
                          
                          <div class="news-actions">
                              <a href="/admin/edit-news/${item._id}" class="action-btn edit-btn">تعديل</a>
                              <form action="/admin/delete-news/${item._id}" method="POST" style="display: inline;">
                                  <button type="submit" class="action-btn delete-btn" onclick="return confirm('هل أنت متأكد من حذف هذا الخبر؟')">حذف</button>
                              </form>
                          </div>
                      </div>
                  `).join('') : `
                  <div style="padding: 40px; text-align: center; color: #718096;">
                      <p>لا توجد أخبار حتى الآن</p>
                  </div>
                  `}
              </div>
          </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في تحميل لوحة التحكم');
  }
});

// Add news
app.post('/admin/add-news', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const newsData = { ...req.body, isPublished: req.body.isPublished === 'on' };
    if (req.file) newsData.imageUrl = '/uploads/' + req.file.filename;
    const newsItem = new News(newsData);
    await newsItem.save();
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في إضافة الخبر');
  }
});

// Edit news form
app.get('/admin/edit-news/:id', isAdmin, async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);
    if (!newsItem) return res.status(404).send('الخبر غير موجود');
    
    res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>تعديل خبر - أخبار العائلة</title>
          <style>
              * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
              body { background: #f7fafc; color: #2d3748; }
              .admin-header { background: #2d3748; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
              .admin-title { font-size: 1.5rem; }
              .admin-nav a { color: white; text-decoration: none; margin-left: 20px; padding: 8px 16px; border-radius: 20px; transition: background 0.3s ease; }
              .admin-nav a:hover { background: rgba(255, 255, 255, 0.1); }
              .admin-container { max-width: 800px; margin: 30px auto; padding: 0 20px; }
              .edit-form { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
              .form-title { color: #2d3748; margin-bottom: 25px; font-size: 1.5rem; text-align: center; }
              .form-group { margin-bottom: 20px; }
              label { display: block; margin-bottom: 8px; color: #4a5568; font-weight: 600; }
              input, textarea, select { width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 1rem; transition: border-color 0.3s ease; }
              input:focus, textarea:focus, select:focus { outline: none; border-color: #4a5568; }
              textarea { resize: vertical; min-height: 150px; }
              .checkbox-group { display: flex; align-items: center; margin-bottom: 20px; }
              .checkbox-group input { width: auto; margin-left: 10px; }
              .btn { background: #4a5568; color: white; padding: 12px 25px; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; transition: background 0.3s ease; margin-right: 10px; }
              .btn:hover { background: #2d3748; }
              .btn-primary { background: #3182ce; }
              .btn-primary:hover { background: #2c5282; }
              .btn-secondary { background: #718096; }
              .btn-secondary:hover { background: #4a5568; }
              .form-actions { display: flex; justify-content: space-between; margin-top: 30px; }
              @media (max-width: 768px) { 
                  .form-actions { flex-direction: column; gap: 10px; }
                  .btn { width: 100%; margin-right: 0; margin-bottom: 10px; }
              }
          </style>
      </head>
      <body>
          <div class="admin-header">
              <div class="admin-title">
                  <h1>تعديل خبر</h1>
              </div>
              <div class="admin-nav">
                  <a href="/admin">العودة للوحة التحكم</a>
                  <a href="/">الموقع الرئيسي</a>
              </div>
          </div>

          <div class="admin-container">
              <div class="edit-form">
                  <h2 class="form-title">تعديل الخبر: ${newsItem.title}</h2>
                  
                  <form action="/admin/edit-news/${newsItem._id}" method="POST" enctype="multipart/form-data">
                      <div class="form-group">
                          <label for="title">عنوان الخبر</label>
                          <input type="text" id="title" name="title" value="${newsItem.title}" required>
                      </div>
                      
                      <div class="form-group">
                          <label for="content">محتوى الخبر</label>
                          <textarea id="content" name="content" required>${newsItem.content}</textarea>
                      </div>
                      
                      <div class="form-group">
                          <label for="category">التصنيف</label>
                          <select id="category" name="category">
                              <option value="عام" ${newsItem.category === 'عام' ? 'selected' : ''}>عام</option>
                              <option value="مناسبات" ${newsItem.category === 'مناسبات' ? 'selected' : ''}>مناسبات</option>
                              <option value="أحداث" ${newsItem.category === 'أحداث' ? 'selected' : ''}>أحداث</option>
                              <option value="تهاني" ${newsItem.category === 'تهاني' ? 'selected' : ''}>تهاني</option>
                          </select>
                      </div>
                      
                      ${newsItem.imageUrl ? `
                      <div class="form-group">
                          <label>الصورة الحالية:</label>
                          <img src="${newsItem.imageUrl}" alt="${newsItem.title}" style="max-width: 100%; height: auto; border-radius: 10px; margin-top: 10px;">
                      </div>
                      
                      <div class="checkbox-group">
                          <input type="checkbox" id="removeImage" name="removeImage" value="true">
                          <label for="removeImage">حذف الصورة الحالية</label>
                      </div>
                      ` : ''}
                      
                      <div class="form-group">
                          <label for="image">صورة جديدة (اختياري)</label>
                          <input type="file" id="image" name="image" accept="image/*">
                      </div>
                      
                      <div class="checkbox-group">
                          <input type="checkbox" id="isPublished" name="isPublished" ${newsItem.isPublished ? 'checked' : ''}>
                          <label for="isPublished">نشر الخبر</label>
                      </div>
                      
                      <div class="form-actions">
                          <div>
                              <button type="submit" class="btn btn-primary">حفظ التعديلات</button>
                              <a href="/admin" class="btn btn-secondary">إلغاء</a>
                          </div>
                          <a href="/news/${newsItem._id}" class="btn" target="_blank">معاينة الخبر</a>
                      </div>
                  </form>
              </div>
          </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في تحميل صفحة التعديل');
  }
});

// Update news
app.post('/admin/edit-news/:id', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const updateData = { ...req.body, isPublished: req.body.isPublished === 'on' };

    if (req.file) {
      updateData.imageUrl = '/uploads/' + req.file.filename;
      const oldNews = await News.findById(req.params.id);
      if (oldNews.imageUrl && oldNews.imageUrl.startsWith('/uploads/')) {
        const oldImagePath = path.join(__dirname, 'public', oldNews.imageUrl);
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      }
    }

    if (req.body.removeImage === 'true') {
      const oldNews = await News.findById(req.params.id);
      if (oldNews.imageUrl && oldNews.imageUrl.startsWith('/uploads/')) {
        const oldImagePath = path.join(__dirname, 'public', oldNews.imageUrl);
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      }
      updateData.imageUrl = '';
    }

    await News.findByIdAndUpdate(req.params.id, updateData);
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في تحديث الخبر');
  }
});

// Delete news
app.post('/admin/delete-news/:id', isAdmin, async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);
    if (newsItem.imageUrl && newsItem.imageUrl.startsWith('/uploads/')) {
      const imagePath = path.join(__dirname, 'public', newsItem.imageUrl);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }
    await News.findByIdAndDelete(req.params.id);
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في حذف الخبر');
  }
});

// ----- Customer routes -----
app.get('/register', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>إنشاء حساب - أخبار العائلة</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
            .container { background: rgba(255, 255, 255, 0.95); border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2); width: 100%; max-width: 450px; }
            .header { text-align: center; margin-bottom: 30px; }
            h1 { color: #4a5568; margin-bottom: 10px; font-size: 2rem; }
            .subtitle { color: #718096; margin-bottom: 30px; }
            .form-group { margin-bottom: 20px; }
            label { display: block; margin-bottom: 8px; color: #4a5568; font-weight: 600; }
            input { width: 100%; padding: 15px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 1rem; transition: border-color 0.3s ease; }
            input:focus { outline: none; border-color: #4a5568; }
            button { width: 100%; background: #4a5568; color: white; padding: 15px; border: none; border-radius: 10px; font-size: 1.1rem; cursor: pointer; transition: background 0.3s ease; }
            button:hover { background: #2d3748; }
            .login-link { text-align: center; margin-top: 25px; color: #718096; }
            .login-link a { color: #4a5568; text-decoration: none; font-weight: 600; }
            .login-link a:hover { text-decoration: underline; }
            .back-link { display: inline-block; color: #4a5568; text-decoration: none; margin-bottom: 20px; padding: 8px 16px; border: 2px solid #4a5568; border-radius: 25px; transition: all 0.3s ease; }
            .back-link:hover { background: #4a5568; color: white; }
            .error { color: #e53e3e; text-align: center; margin-bottom: 15px; }
            @media (max-width: 480px) { .container { padding: 30px 20px; } h1 { font-size: 1.7rem; } }
        </style>
    </head>
    <body>
        <div class="container">
            <a href="/" class="back-link">← العودة إلى الرئيسية</a>
            
            <div class="header">
                <h1>إنشاء حساب جديد</h1>
                <p class="subtitle">انضم إلى عائلتنا وكن جزءاً من مجتمعنا</p>
            </div>
            
            <form action="/register" method="POST">
                <div class="form-group">
                    <label for="name">الاسم الكامل</label>
                    <input type="text" id="name" name="name" required>
                </div>
                
                <div class="form-group">
                    <label for="email">البريد الإلكتروني</label>
                    <input type="email" id="email" name="email" required>
                </div>
                
                <div class="form-group">
                    <label for="password">كلمة المرور</label>
                    <input type="password" id="password" name="password" required>
                </div>
                
                <button type="submit">إنشاء الحساب</button>
            </form>
            
            <div class="login-link">
                <p>هل لديك حساب بالفعل؟ <a href="/login">تسجيل الدخول</a></p>
            </div>
        </div>
    </body>
    </html>
  `);
});

app.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>خطأ في التسجيل</title>
          <style>body { font-family: Arial; padding: 50px; text-align: center; } .error { color: red; }</style>
      </head>
      <body>
          <div class="error">البريد الإلكتروني مسجل مسبقاً</div>
          <a href="/register">العودة إلى صفحة التسجيل</a>
      </body>
      </html>
    `);

    const hash = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hash });
    await user.save();
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في تسجيل المستخدم');
  }
});

app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>تسجيل الدخول - أخبار العائلة</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
            .container { background: rgba(255, 255, 255, 0.95); border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2); width: 100%; max-width: 450px; }
            .header { text-align: center; margin-bottom: 30px; }
            h1 { color: #4a5568; margin-bottom: 10px; font-size: 2rem; }
            .subtitle { color: #718096; margin-bottom: 30px; }
            .form-group { margin-bottom: 20px; }
            label { display: block; margin-bottom: 8px; color: #4a5568; font-weight: 600; }
            input { width: 100%; padding: 15px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 1rem; transition: border-color 0.3s ease; }
            input:focus { outline: none; border-color: #4a5568; }
            button { width: 100%; background: #4a5568; color: white; padding: 15px; border: none; border-radius: 10px; font-size: 1.1rem; cursor: pointer; transition: background 0.3s ease; }
            button:hover { background: #2d3748; }
            .register-link { text-align: center; margin-top: 25px; color: #718096; }
            .register-link a { color: #4a5568; text-decoration: none; font-weight: 600; }
            .register-link a:hover { text-decoration: underline; }
            .back-link { display: inline-block; color: #4a5568; text-decoration: none; margin-bottom: 20px; padding: 8px 16px; border: 2px solid #4a5568; border-radius: 25px; transition: all 0.3s ease; }
            .back-link:hover { background: #4a5568; color: white; }
            .error { color: #e53e3e; text-align: center; margin-bottom: 15px; }
            @media (max-width: 480px) { .container { padding: 30px 20px; } h1 { font-size: 1.7rem; } }
        </style>
    </head>
    <body>
        <div class="container">
            <a href="/" class="back-link">← العودة إلى الرئيسية</a>
            
            <div class="header">
                <h1>تسجيل الدخول</h1>
                <p class="subtitle">أهلاً بعودتك إلى عائلتنا</p>
            </div>
            
            <form action="/login" method="POST">
                <div class="form-group">
                    <label for="email">البريد الإلكتروني</label>
                    <input type="email" id="email" name="email" required>
                </div>
                
                <div class="form-group">
                    <label for="password">كلمة المرور</label>
                    <input type="password" id="password" name="password" required>
                </div>
                
                <button type="submit">تسجيل الدخول</button>
            </form>
            
            <div class="register-link">
                <p>ليس لديك حساب؟ <a href="/register">إنشاء حساب جديد</a></p>
            </div>
        </div>
    </body>
    </html>
  `);
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>خطأ في التسجيل</title>
          <style>body { font-family: Arial; padding: 50px; text-align: center; } .error { color: red; }</style>
      </head>
      <body>
          <div class="error">المستخدم غير موجود</div>
          <a href="/login">العودة إلى صفحة التسجيل</a>
      </body>
      </html>
    `);

    const match = await bcrypt.compare(password, user.password);
    if (match) {
      req.session.user = user;
      return res.redirect('/');
    }
    res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>خطأ في التسجيل</title>
          <style>body { font-family: Arial; padding: 50px; text-align: center; } .error { color: red; }</style>
      </head>
      <body>
          <div class="error">كلمة المرور خاطئة</div>
          <a href="/login">العودة إلى صفحة التسجيل</a>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في تسجيل الدخول');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

// Overview page
app.get('/', async (req, res) => {
  try {
    const news = await News.find({ isPublished: true }).sort({ createdAt: -1 });
    res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>أخبار العائلة - الصفحة الرئيسية</title>
          <style>
              * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
              body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #333; line-height: 1.6; min-height: 100vh; }
              .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
              header { background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 15px; margin-bottom: 30px; text-align: center; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); }
              h1 { color: #4a5568; margin-bottom: 20px; font-size: 2.5rem; }
              .auth-links { margin: 15px 0; }
              .auth-links a { color: #4a5568; text-decoration: none; margin: 0 10px; padding: 8px 16px; border: 2px solid #4a5568; border-radius: 25px; transition: all 0.3s ease; }
              .auth-links a:hover { background: #4a5568; color: white; }
              .welcome-message { background: #48bb78; color: white; padding: 10px 20px; border-radius: 20px; margin: 10px 0; }
              .news-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 25px; margin-bottom: 40px; }
              .news-card { background: rgba(255, 255, 255, 0.95); border-radius: 15px; padding: 25px; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); transition: transform 0.3s ease; }
              .news-card:hover { transform: translateY(-5px); }
              .news-card h2 { color: #2d3748; margin-bottom: 15px; font-size: 1.5rem; }
              .news-card p { color: #4a5568; margin-bottom: 20px; line-height: 1.8; }
              .read-more { display: inline-block; background: #4a5568; color: white; padding: 10px 20px; text-decoration: none; border-radius: 25px; transition: background 0.3s ease; }
              .read-more:hover { background: #2d3748; }
              .no-news { text-align: center; background: rgba(255, 255, 255, 0.95); padding: 40px; border-radius: 15px; color: #4a5568; }
              footer { background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 15px; text-align: center; margin-top: 40px; }
              .footer-links { margin: 15px 0; }
              .footer-links a { color: #4a5568; text-decoration: none; margin: 0 15px; transition: color 0.3s ease; }
              .footer-links a:hover { color: #2d3748; text-decoration: underline; }
              @media (max-width: 768px) { .news-grid { grid-template-columns: 1fr; } h1 { font-size: 2rem; } }
          </style>
      </head>
      <body>
          <div class="container">
              <header>
                  <h1>أخبار العائلة</h1>
                  
                  ${req.session.user ? `
                      <div class="welcome-message">مرحباً، <strong>${req.session.user.name}</strong> | <a href="/logout" style="color: white; text-decoration: underline;">تسجيل الخروج</a></div>
                  ` : `
                      <div class="auth-links">
                          <a href="/login">تسجيل الدخول</a>
                          <a href="/register">إنشاء حساب</a>
                      </div>
                  `}
              </header>

              <main>
                  ${news.length > 0 ? `
                      <div class="news-grid">
                          ${news.map(item => `
                              <div class="news-card">
                                  <h2>${item.title}</h2>
                                  <p>${item.content.substring(0, 150)}...</p>
                                  <a href="/news/${item._id}" class="read-more">قراءة المزيد</a>
                              </div>
                          `).join('')}
                      </div>
                  ` : `
                      <div class="no-news">
                          <h2>لا توجد أخبار متاحة حالياً</h2>
                          <p>يرجى العودة لاحقاً لمشاهدة آخر أخبار العائلة</p>
                      </div>
                  `}
              </main>

              <footer>
                  <div class="footer-links">
                      <a href="/about">عن الموقع</a>
                      <a href="/contact">اتصل بنا</a>
                      <a href="/admin/login">لوحة التحكم</a>
                  </div>
                  <p>© 2023 موقع أخبار العائلة. جميع الحقوق محفوظة.</p>
              </footer>
          </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في تحميل الصفحة الرئيسية');
  }
});

// News details
app.get('/news/:id', async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);
    if (!newsItem) return res.status(404).send('الخبر غير موجود');

    const comments = await Comment.find({ news: req.params.id }).populate('user');
    res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${newsItem.title} - أخبار العائلة</title>
          <style>
              * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
              body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #333; line-height: 1.6; min-height: 100vh; }
              .container { max-width: 800px; margin: 0 auto; padding: 20px; }
              header { background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 15px; margin-bottom: 30px; text-align: center; }
              h1 { color: #2d3748; margin-bottom: 20px; font-size: 2.2rem; }
              .back-link { display: inline-block; color: #4a5568; text-decoration: none; margin-bottom: 20px; padding: 8px 16px; border: 2px solid #4a5568; border-radius: 25px; transition: all 0.3s ease; }
              .back-link:hover { background: #4a5568; color: white; }
              .news-article { background: rgba(255, 255, 255, 0.95); border-radius: 15px; padding: 30px; margin-bottom: 30px; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); }
              .news-image { width: 100%; max-height: 400px; object-fit: cover; border-radius: 10px; margin-bottom: 25px; }
              .news-meta { color: #718096; margin-bottom: 20px; font-size: 0.9rem; }
              .news-content { color: #2d3748; line-height: 1.8; font-size: 1.1rem; margin-bottom: 30px; }
              footer { background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 15px; text-align: center; }
              @media (max-width: 768px) { .container { padding: 15px; } h1 { font-size: 1.8rem; } }
          </style>
      </head>
      <body>
          <div class="container">
              <header>
                  <a href="/" class="back-link">← العودة إلى الرئيسية</a>
                  <h1>${newsItem.title}</h1>
              </header>

              <div class="news-article">
                  ${newsItem.imageUrl ? `<img src="${newsItem.imageUrl}" alt="${newsItem.title}" class="news-image">` : ''}
                  
                  <div class="news-meta">
                      نشر في: ${newsItem.createdAt.toLocaleDateString('ar-EG')}
                  </div>
                  
                  <div class="news-content">
                      ${newsItem.content}
                  </div>
              </div>

              <footer>
                  <p>© 2023 موقع أخبار العائلة. جميع الحقوق محفوظة.</p>
              </footer>
          </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في تحميل الخبر');
  }
});

// About page
app.get('/about', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>عن الموقع - أخبار العائلة</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #333; line-height: 1.6; min-height: 100vh; }
            .container { max-width: 800px; margin: 0 auto; padding: 20px; }
            header { background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 15px; margin-bottom: 30px; text-align: center; }
            h1 { color: #4a5568; margin-bottom: 10px; font-size: 2.5rem; }
            .back-link { display: inline-block; color: #4a5568; text-decoration: none; margin-bottom: 20px; padding: 8px 16px; border: 2px solid #4a5568; border-radius: 25px; transition: all 0.3s ease; }
            .back-link:hover { background: #4a5568; color: white; }
            .about-content { background: rgba(255, 255, 255, 0.95); border-radius: 15px; padding: 40px; margin-bottom: 30px; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); }
            .about-section { margin-bottom: 30px; }
            .about-section h2 { color: #2d3748; margin-bottom: 15px; font-size: 1.8rem; }
            .about-section p { color: #4a5568; line-height: 1.8; font-size: 1.1rem; margin-bottom: 15px; }
            footer { background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 15px; text-align: center; }
            @media (max-width: 768px) { .about-content { padding: 30px 20px; } h1 { font-size: 2rem; } }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <a href="/" class="back-link">← العودة إلى الرئيسية</a>
                <h1>عن موقع أخبار العائلة</h1>
            </header>

            <div class="about-content">
                <div class="about-section">
                    <h2>مرحباً بكم في عائلتنا</h2>
                    <p>
                        موقع أخبار العائلة هو منصة مخصصة لمشاركة آخر الأخبار والأحداث الخاصة بعائلتنا الكريمة. 
                        هنا نجتمع معاً لنبقى على اطلاع دائم بكل ما هو جديد في حياة أفراد عائلتنا.
                    </p>
                </div>

                <div class="about-section">
                    <h2>مهمتنا</h2>
                    <p>
                        نهدف إلى توثيق الروابط العائلية وتعزيز التواصل بين أفراد العائلة من خلال مشاركة الأخبار 
                        والمناسبات والذكريات الجميلة التي تجمعنا معاً.
                    </p>
                </div>

                <div class="about-section">
                    <h2>انضم إلينا</h2>
                    <p>
                        يمكنك إنشاء حساب جديد والانضمام إلى عائلتنا الإلكترونية لمشاهدة آخر الأخبار 
                        والمشاركة في التعليقات والتفاعل مع محتوى الموقع.
                    </p>
                </div>
            </div>

            <footer>
                <p>© 2023 موقع أخبار العائلة. جميع الحقوق محفوظة.</p>
            </footer>
        </div>
    </body>
    </html>
  `);
});

// Contact page
app.get('/contact', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>اتصل بنا - أخبار العائلة</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #333; line-height: 1.6; min-height: 100vh; }
            .container { max-width: 800px; margin: 0 auto; padding: 20px; }
            header { background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 15px; margin-bottom: 30px; text-align: center; }
            h1 { color: #4a5568; margin-bottom: 10px; font-size: 2.5rem; }
            .back-link { display: inline-block; color: #4a5568; text-decoration: none; margin-bottom: 20px; padding: 8px 16px; border: 2px solid #4a5568; border-radius: 25px; transition: all 0.3s ease; }
            .back-link:hover { background: #4a5568; color: white; }
            .contact-content { background: rgba(255, 255, 255, 0.95); border-radius: 15px; padding: 40px; margin-bottom: 30px; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); }
            .contact-info { margin-bottom: 40px; }
            .contact-info h2 { color: #2d3748; margin-bottom: 20px; font-size: 1.8rem; }
            .info-item { margin-bottom: 15px; padding: 15px; background: #f7fafc; border-radius: 10px; border-left: 4px solid #4a5568; }
            .info-item h3 { color: #2d3748; margin-bottom: 5px; }
            .info-item p { color: #718096; }
            footer { background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 15px; text-align: center; }
            @media (max-width: 768px) { .contact-content { padding: 30px 20px; } h1 { font-size: 2rem; } }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <a href="/" class="back-link">← العودة إلى الرئيسية</a>
                <h1>اتصل بنا</h1>
            </header>

            <div class="contact-content">
                <div class="contact-info">
                    <h2>معلومات التواصل</h2>
                    
                    <div class="info-item">
                        <h3>البريد الإلكتروني</h3>
                        <p>info@family-news.com</p>
                    </div>
                    
                    <div class="info-item">
                        <h3>للاقتراحات والشكاوى</h3>
                        <p>support@family-news.com</p>
                    </div>
                    
                    <div class="info-item">
                        <h3>ساعات العمل</h3>
                        <p>الأحد - الخميس: 8:00 صباحاً - 5:00 مساءً</p>
                    </div>
                </div>
            </div>

            <footer>
                <p>© 2023 موقع أخبار العائلة. جميع الحقوق محفوظة.</p>
            </footer>
        </div>
    </body>
    </html>
  `);
});

// 404 - صفحة غير موجودة
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>صفحة غير موجودة - أخبار العائلة</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                text-align: center; 
                padding: 50px; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #333;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .error-container { 
                background: rgba(255, 255, 255, 0.95); 
                padding: 40px; 
                border-radius: 15px; 
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                max-width: 500px;
            }
            h1 { color: #e53e3e; margin-bottom: 20px; font-size: 2rem; }
            p { color: #4a5568; margin-bottom: 30px; font-size: 1.1rem; line-height: 1.6; }
            .home-link { 
                display: inline-block; 
                background: #4a5568; 
                color: white; 
                padding: 12px 30px; 
                text-decoration: none; 
                border-radius: 25px; 
                transition: background 0.3s ease; 
            }
            .home-link:hover { background: #2d3748; }
        </style>
    </head>
    <body>
        <div class="error-container">
            <h1>⚠️ صفحة غير موجودة</h1>
            <p>الصفحة التي تبحث عنها غير موجودة أو قد تم نقلها.</p>
            <a href="/" class="home-link">العودة إلى الصفحة الرئيسية</a>
        </div>
    </body>
    </html>
  `);
});

// معالج الأخطاء العام
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>خطأ في الخادم - أخبار العائلة</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                text-align: center; 
                padding: 50px; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #333;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .error-container { 
                background: rgba(255, 255, 255, 0.95); 
                padding: 40px; 
                border-radius: 15px; 
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                max-width: 500px;
            }
            h1 { color: #e53e3e; margin-bottom: 20px; font-size: 2rem; }
            p { color: #4a5568; margin-bottom: 30px; font-size: 1.1rem; line-height: 1.6; }
            .home-link { 
                display: inline-block; 
                background: #4a5568; 
                color: white; 
                padding: 12px 30px; 
                text-decoration: none; 
                border-radius: 25px; 
                transition: background 0.3s ease; 
            }
            .home-link:hover { background: #2d3748; }
        </style>
    </head>
    <body>
        <div class="error-container">
            <h1>⚠️ خطأ في الخادم</h1>
            <p>حدث خطأ غير متوقع في الخادم. يرجى المحاولة مرة أخرى لاحقاً.</p>
            <a href="/" class="home-link">العودة إلى الصفحة الرئيسية</a>
        </div>
    </body>
    </html>
  `);
});

// 🔧 تشغيل الخادم مع معالجة الأخطاء
const startServer = async () => {
  try {
    // الاتصال بقاعدة البيانات
    await connectDB();
    
    // استمع على المنفذ الصحيح
    app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`🌐 Available: http://localhost:${port}`);
      if (isProduction) {
        console.log('✅ Running in production mode');
      } else {
        console.log('🔧 Running in development mode');
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// 🔧 معالج الأخطاء غير المتوقعة
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});

// ابدأ تشغيل الخادم
startServer();